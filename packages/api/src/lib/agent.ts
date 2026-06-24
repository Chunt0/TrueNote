// The wiki agent: a bounded model→tool→model loop with a SMALL, fixed tool set
// over the file store (lib/docstore.ts). Tools are thin wrappers over the same
// service the UI uses — confined to DOCS_DIR, attributed to the signed-in user
// (git authorship), and OCC-respecting (edits require the version from read_doc).
import { type AccessCtx, filterAccessible, isAccessible } from './access'
import type { Author } from './docstore'
import {
  createDoc,
  deleteDoc,
  listDocs,
  readDoc,
  renameDoc,
  searchDocs,
  slugifyPath,
  updateDoc,
} from './docstore'
import { type ChatMsg, makeClient, type ToolCall, type ToolDef } from './llm'
import { resolveActiveProvider } from './providers'

const MAX_STEPS = 8

const SYSTEM = `You are TrueNote's wiki assistant for an IT department's internal wiki.
The wiki is a set of Markdown (.md) pages. You can search, read, create, edit, rename,
and delete pages using the provided tools — and ONLY those tools. You cannot run shell
commands or access anything outside the wiki.

Guidelines:
- Ground every answer in real pages. Before answering a "how do I…/where is…" question,
  search the wiki — do not answer from memory and do not give up after one empty search.
- search_docs takes KEYWORDS, not sentences. Use 1–2 key nouns (e.g. "new student",
  not "please tell me how to add a new student"). Results are ranked by relevance with a
  short snippet. If a search returns nothing, retry with a broader single keyword, or call
  list_docs to see what exists.
- The snippet is only a preview — call read_doc on the most relevant result to get the FULL
  page, then answer from it.
- Cite pages as Markdown links whose href is the page PATH, e.g. [Deploy runbook](runbooks/deploy.md).
  NEVER invent absolute URLs (no http://… , no /docs/…) — just the path; the app resolves it.
- To CREATE or WRITE a page, you MUST call create_doc with the path and the full Markdown in
  the "content" argument. Do NOT just write the document in your chat reply — put it in the tool
  call. After it succeeds, briefly confirm and cite the path.
- To EDIT an existing page you MUST first call read_doc to get its "version", then call
  update_doc with that exact version. If update_doc reports a conflict, read_doc again and retry.
- Keep edits surgical and preserve existing content unless asked otherwise. Be concise.

Formatting conventions (the wiki enforces these — follow them):
- Page paths are lowercase kebab-case, e.g. "runbooks/vpn-setup.md" (no spaces, no underscores,
  no capitals). Paths are auto-normalized, but propose them in this style.
- Start every page with a single "# Title" H1, then "## " / "###" section headers in sentence case.
  Prefer Markdown lists and tables over long paragraphs.
- Never use emojis or emoticons — not in replies and not in any page you write. Plain text only.`

const TOOLS: ToolDef[] = [
  {
    name: 'search_docs',
    description:
      'Keyword search the wiki (ranked by relevance). Pass 1–2 KEYWORDS, not a sentence (e.g. "new student"). Returns matching pages with a short snippet — call read_doc for the full page.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keywords, e.g. "new student"' } },
      required: ['query'],
    },
  },
  {
    name: 'list_docs',
    description: 'List every wiki page (path, title, last updated).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'read_doc',
    description: 'Read one page by path. Returns its content and a "version" token needed to edit it.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Page path, e.g. "runbooks/deploy.md"' } },
      required: ['path'],
    },
  },
  {
    name: 'create_doc',
    description: 'Create a new page at a path that does not exist yet.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string', description: 'Markdown content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'update_doc',
    description: 'Overwrite an existing page. Requires the "version" returned by a prior read_doc.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        version: { type: 'string', description: 'The version token from read_doc' },
      },
      required: ['path', 'content', 'version'],
    },
  },
  {
    name: 'rename_doc',
    description: 'Rename or move a page from one path to another.',
    parameters: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'delete_doc',
    description: 'Delete a page (moves it to trash; recoverable).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
]

function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '')
}

// Hard guarantee that the assistant never emits emojis (the system prompt asks,
// but weaker local models ignore it). Strips emoji/pictographs, flag pairs, and
// variation selectors/ZWJ, then tidies the whitespace left behind. Applied to
// replies AND to any page content the agent writes.
export function stripEmojis(s: string): string {
  return s
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '') // regional-indicator flag pairs
    .replace(/\p{Extended_Pictographic}/gu, '') // emoji & pictographs
    .replace(/[\u{FE00}-\u{FE0F}\u{200D}]/gu, '') // variation selectors + ZWJ
    .replace(/[^\S\r\n]{2,}/g, ' ') // collapse runs of spaces (keep newlines)
    .replace(/[^\S\r\n]+$/gm, '') // trim trailing spaces per line
}

// Hard guarantee that cited links point at real pages. Any Markdown link whose
// target resolves to an existing wiki page is rewritten to that page's canonical
// relative path (the UI turns it into /?path=…). Genuine external links are kept;
// fabricated local links that match no page are demoted to plain text. Resolves
// by exact path, unique basename, then the link text's slug.
export function fixCitationLinks(md: string): string {
  const docs = listDocs()
  if (docs.length === 0) return md
  const byPath = new Map<string, string>()
  const byBase = new Map<string, string[]>()
  for (const d of docs) {
    const lc = d.path.toLowerCase()
    byPath.set(lc, d.path)
    byPath.set(lc.replace(/\.md$/, ''), d.path)
    const base = lc.split('/').pop()!.replace(/\.md$/, '')
    byBase.set(base, [...(byBase.get(base) ?? []), d.path])
  }
  const slug = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')

  return md.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (whole, text: string, hrefRaw: string) => {
    const href = hrefRaw.trim()
    if (href.startsWith('#')) return whole // in-page anchor — leave it

    const isExternal = /^https?:\/\//i.test(href)
    let host = ''
    let cand = href
    try {
      if (isExternal) {
        const u = new URL(href)
        host = u.hostname
        cand = u.searchParams.get('path') || u.pathname
      } else if (href.includes('?path=')) {
        cand = new URL(href, 'http://x/').searchParams.get('path') || cand
      }
    } catch {
      /* keep cand */
    }
    cand = cand
      .replace(/^\/+/, '')
      .replace(/^(docs|wiki|api)\/+/i, '')
      .replace(/[#?].*$/, '')
      .replace(/\/+$/, '')
    const lc = cand.toLowerCase()

    let real = byPath.get(lc) || byPath.get(lc.replace(/\.md$/, ''))
    if (!real) {
      const m = byBase.get(lc.split('/').pop()!.replace(/\.md$/, ''))
      if (m?.length === 1) real = m[0]
    }
    if (!real) {
      const m = byBase.get(slug(text))
      if (m?.length === 1) real = m[0]
    }

    if (real) return `[${text}](${real})`
    const local = host === '' || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')
    if (isExternal && !local) return whole // genuine external link
    return text // fabricated/broken local link → keep the text, drop the link
  })
}

// Tools are scoped to the requesting user's access: a member's agent can only
// see/edit pages in their departments (admins/system see all).
function executeTool(call: ToolCall, author: Author, ctx: AccessCtx): string {
  const denied = 'Error: you do not have access to that page'
  try {
    switch (call.name) {
      case 'search_docs':
        return JSON.stringify(filterAccessible(searchDocs(str(call.args.query)), (h) => h.path, ctx))
      case 'list_docs':
        return JSON.stringify(filterAccessible(listDocs(), (d) => d.path, ctx))
      case 'read_doc': {
        const p = str(call.args.path)
        return isAccessible(p, ctx) ? JSON.stringify(readDoc(p)) : denied
      }
      case 'create_doc': {
        const p = slugifyPath(str(call.args.path))
        if (!isAccessible(p, ctx)) return denied
        return JSON.stringify(createDoc(p, stripEmojis(str(call.args.content)), author))
      }
      case 'update_doc': {
        const p = str(call.args.path)
        if (!isAccessible(p, ctx)) return denied
        return JSON.stringify(
          updateDoc(p, stripEmojis(str(call.args.content)), str(call.args.version), author),
        )
      }
      case 'rename_doc': {
        const from = str(call.args.from)
        const to = str(call.args.to)
        if (!isAccessible(from, ctx) || !isAccessible(slugifyPath(to), ctx)) return denied
        return JSON.stringify(renameDoc(from, to, author))
      }
      case 'delete_doc': {
        const p = str(call.args.path)
        if (!isAccessible(p, ctx)) return denied
        return JSON.stringify(deleteDoc(p, author))
      }
      default:
        return `Error: unknown tool "${call.name}"`
    }
  } catch (err) {
    // Surface the error to the model as a tool result so it can recover/retry.
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

export interface ToolActivity {
  name: string
  args: Record<string, unknown>
  result: string
}

export interface AgentTurn {
  reply: string
  toolActivity: ToolActivity[]
}

export async function runAgent(
  history: ChatMsg[],
  userMessage: string,
  author: Author,
  contextText: string,
  ctx: AccessCtx,
): Promise<AgentTurn> {
  const client = makeClient(resolveActiveProvider())
  // Attached wiki pages (from the panel's context bar) are injected as primary
  // context for this turn. The agent can still read more via tools.
  const system = contextText
    ? `${SYSTEM}\n\n# Attached pages (primary context for this conversation)\n${contextText}`
    : SYSTEM
  const messages: ChatMsg[] = [...history, { role: 'user', content: userMessage }]

  let result: AgentTurn
  try {
    result = await runToolLoop(client, system, messages, author, ctx)
  } catch (err) {
    // Many models (e.g. Gemma, smaller local models) don't support tool calling,
    // so the tool-enabled call errors. Fall back to a plain reply so the user
    // still gets an answer from the attached context — just no wiki actions.
    try {
      const reply = await client.chat(
        `${system}\n\n(Tool use is unavailable with this model — answer from the attached pages and your knowledge; you can't search or edit the wiki this turn.)`,
        messages,
        [],
      )
      result = { reply: reply.text || '(No response.)', toolActivity: [] }
    } catch {
      throw err // surface the original error if the plain call also fails
    }
  }
  // Enforce policies on whatever the model produced: fix citation links to real
  // pages, then strip emojis.
  return { ...result, reply: stripEmojis(fixCitationLinks(result.reply)) }
}

async function runToolLoop(
  client: ReturnType<typeof makeClient>,
  system: string,
  initialMessages: ChatMsg[],
  author: Author,
  ctx: AccessCtx,
): Promise<AgentTurn> {
  const messages = [...initialMessages]
  const toolActivity: ToolActivity[] = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await client.chat(system, messages, TOOLS)
    if (reply.toolCalls.length === 0) {
      return { reply: reply.text, toolActivity }
    }
    messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls })
    for (const call of reply.toolCalls) {
      const result = executeTool(call, author, ctx)
      toolActivity.push({ name: call.name, args: call.args, result: result.slice(0, 2000) })
      messages.push({ role: 'tool', content: result, toolCallId: call.id })
    }
  }

  // Hit the step ceiling — ask for a final summary with tools disabled.
  const final = await client.chat(
    system,
    [...messages, { role: 'user', content: 'Stop using tools and summarize what you did.' }],
    [],
  )
  return {
    reply: final.text || '(Stopped after reaching the tool-call limit.)',
    toolActivity,
  }
}
