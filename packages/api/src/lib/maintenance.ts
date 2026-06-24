// The scheduled wiki-maintenance agent: an in-process timer that periodically
// runs the check pipeline (lib/checks.ts) and files `suggestions` for an admin to
// review. It NEVER edits a page on its own — applying a fix is an admin-reviewed
// diff (previewFix → applyFix). Config is admin-tunable at runtime (singleton row).
import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  type MaintenanceRun,
  maintenanceConfig,
  maintenanceRuns,
  type Suggestion,
  suggestions,
} from '../db/schema'
import { departmentOf } from './access'
import { stripEmojis } from './agent'
import {
  ALL_CHECKS,
  type CheckKey,
  type Finding,
  runDeterministicChecks,
  runLlmCheck,
} from './checks'
import { type DocContent, listDocs, readDoc, updateDoc } from './docstore'
import { env, isTest } from './env'
import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError } from './errors'
import { type LLMClient, makeClient } from './llm'
import { logger } from './logger'
import { resolveActiveProvider } from './providers'

// Fixes are attributed to a system identity (git authorship in DOCS_DIR).
const MAINTENANCE_AUTHOR = { name: 'TrueNote Maintenance', email: 'maintenance@truenote.local' }

// ── Config ───────────────────────────────────────────────────────────────────
export interface PublicConfig {
  enabled: boolean
  intervalHours: number
  staleDays: number
  maxDocsPerRun: number
  maxSuggestions: number
  llmModel: string | null
  scopeDepts: string[] // [] = all departments
  checks: string[] // the resolved enabled set (subset of ALL_CHECKS)
}

function parseList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function row() {
  const r = db.select().from(maintenanceConfig).where(eq(maintenanceConfig.id, 1)).get()
  if (r) return r
  db.insert(maintenanceConfig).values({ id: 1 }).onConflictDoNothing().run()
  return db.select().from(maintenanceConfig).where(eq(maintenanceConfig.id, 1)).get()!
}

export function getConfig(): PublicConfig {
  const r = row()
  const checks = parseList(r.checks).filter((c) => ALL_CHECKS.includes(c as CheckKey))
  return {
    enabled: r.enabled,
    intervalHours: r.intervalHours,
    staleDays: r.staleDays,
    maxDocsPerRun: r.maxDocsPerRun,
    maxSuggestions: r.maxSuggestions,
    llmModel: r.llmModel,
    scopeDepts: parseList(r.scopeDepts),
    checks: r.checks === null ? [...ALL_CHECKS] : checks,
  }
}

export interface ConfigPatch {
  enabled?: boolean
  intervalHours?: number
  staleDays?: number
  maxDocsPerRun?: number
  maxSuggestions?: number
  llmModel?: string | null
  scopeDepts?: string[]
  checks?: string[]
}

export function updateConfig(patch: ConfigPatch): PublicConfig {
  row() // ensure the singleton exists
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (patch.enabled !== undefined) set.enabled = patch.enabled
  if (patch.intervalHours !== undefined) set.intervalHours = patch.intervalHours
  if (patch.staleDays !== undefined) set.staleDays = patch.staleDays
  if (patch.maxDocsPerRun !== undefined) set.maxDocsPerRun = patch.maxDocsPerRun
  if (patch.maxSuggestions !== undefined) set.maxSuggestions = patch.maxSuggestions
  if (patch.llmModel !== undefined) set.llmModel = patch.llmModel || null
  if (patch.scopeDepts !== undefined) set.scopeDepts = JSON.stringify(patch.scopeDepts)
  if (patch.checks !== undefined) {
    set.checks = JSON.stringify(patch.checks.filter((c) => ALL_CHECKS.includes(c as CheckKey)))
  }
  db.update(maintenanceConfig).set(set).where(eq(maintenanceConfig.id, 1)).run()
  return getConfig()
}

// ── LLM client (with the optional model override) ────────────────────────────
function maintenanceClient(cfg: PublicConfig): LLMClient | null {
  try {
    const p = resolveActiveProvider()
    return makeClient(cfg.llmModel ? { ...p, model: cfg.llmModel } : p)
  } catch (err) {
    logger.warn({ err: String(err) }, 'maintenance: no usable LLM provider; LLM check skipped')
    return null
  }
}

// ── Run executor ─────────────────────────────────────────────────────────────
let running = false

function inScope(path: string, scope: string[]): boolean {
  if (scope.length === 0) return true
  const dept = departmentOf(path)
  return dept !== null && scope.includes(dept)
}

export interface RunResult {
  runId: number
  found: number
  scanned: number
}

export async function runMaintenance(trigger: 'schedule' | 'manual'): Promise<RunResult> {
  if (running) throw new ConflictError('A maintenance run is already in progress')
  running = true
  const now = Date.now()
  const runRow = db
    .insert(maintenanceRuns)
    .values({ trigger, status: 'running' })
    .returning()
    .get()

  try {
    const cfg = getConfig()
    const enabled = new Set(cfg.checks)
    const docs = listDocs().filter((d) => inScope(d.path, cfg.scopeDepts))

    // Read each in-scope page once.
    const contents = new Map<string, string>()
    for (const d of docs) {
      try {
        contents.set(d.path, readDoc(d.path).content)
      } catch {
        /* file vanished mid-run — skip it */
      }
    }

    const findings: Finding[] = runDeterministicChecks({
      docs,
      contents,
      enabled,
      staleDays: cfg.staleDays,
      now,
    })

    // LLM pass: only on pages changed since the last successful run (cost + noise
    // control), capped, and only when a provider is usable.
    if (enabled.has('llm-quality')) {
      const client = maintenanceClient(cfg)
      if (client) {
        const lastOk = db
          .select()
          .from(maintenanceRuns)
          .where(eq(maintenanceRuns.status, 'ok'))
          .orderBy(desc(maintenanceRuns.id))
          .limit(1)
          .get()
        const since = lastOk?.startedAt ? new Date(lastOk.startedAt).getTime() : 0
        const changed = docs
          .filter((d) => new Date(d.updatedAt).getTime() >= since)
          .slice(0, cfg.maxDocsPerRun)
        findings.push(...(await runLlmCheck({ docs: changed, contents, client })))
      }
    }

    const filed = persistFindings(findings, runRow.id, now, cfg.maxSuggestions)

    db.update(maintenanceRuns)
      .set({ status: 'ok', finishedAt: new Date().toISOString(), scanned: docs.length, found: filed })
      .where(eq(maintenanceRuns.id, runRow.id))
      .run()
    logger.info({ runId: runRow.id, trigger, scanned: docs.length, found: filed }, 'maintenance run complete')
    return { runId: runRow.id, found: filed, scanned: docs.length }
  } catch (err) {
    db.update(maintenanceRuns)
      .set({ status: 'error', finishedAt: new Date().toISOString(), error: String(err) })
      .where(eq(maintenanceRuns.id, runRow.id))
      .run()
    throw err
  } finally {
    running = false
  }
}

// Dedup within the batch + suppress anything already open/dismissed/active-snoozed
// (so a dismissal sticks across runs). Applied findings that recur ARE re-filed.
function persistFindings(findings: Finding[], runId: number, now: number, cap: number): number {
  const existing = db
    .select({
      fp: suggestions.fingerprint,
      status: suggestions.status,
      snoozedUntil: suggestions.snoozedUntil,
    })
    .from(suggestions)
    .all()
  const suppressed = new Set<string>()
  for (const s of existing) {
    if (s.status === 'open' || s.status === 'dismissed') suppressed.add(s.fp)
    else if (s.status === 'snoozed' && s.snoozedUntil && new Date(s.snoozedUntil).getTime() > now) {
      suppressed.add(s.fp)
    }
  }

  const seen = new Set<string>()
  const fresh = findings.filter((f) => {
    if (suppressed.has(f.fingerprint) || seen.has(f.fingerprint)) return false
    seen.add(f.fingerprint)
    return true
  })

  for (const f of fresh.slice(0, cap)) {
    db.insert(suggestions)
      .values({
        runId,
        check: f.check,
        kind: f.kind,
        confidence: f.confidence,
        title: f.title,
        detail: f.detail,
        path: f.path,
        department: departmentOf(f.path),
        evidence: f.evidence ?? null,
        fingerprint: f.fingerprint,
      })
      .run()
  }
  return Math.min(fresh.length, cap)
}

// ── Reads ────────────────────────────────────────────────────────────────────
export function listRuns(limit = 20): MaintenanceRun[] {
  return db.select().from(maintenanceRuns).orderBy(desc(maintenanceRuns.id)).limit(limit).all()
}

export function listSuggestions(filter: { status?: string; dept?: string } = {}): Suggestion[] {
  let rows = db.select().from(suggestions).orderBy(desc(suggestions.id)).all()
  if (filter.status) rows = rows.filter((s) => s.status === filter.status)
  if (filter.dept) rows = rows.filter((s) => s.department === filter.dept)
  return rows
}

function getSuggestion(id: number): Suggestion {
  const s = db.select().from(suggestions).where(eq(suggestions.id, id)).get()
  if (!s) throw new NotFoundError('Suggestion not found')
  return s
}

// ── Apply (always a reviewed diff) ───────────────────────────────────────────
const APPLY_SYSTEM = `You are fixing ONE specific issue in a single wiki Markdown page.
Return the COMPLETE corrected Markdown document. Preserve all other content, structure, and
formatting exactly as-is — make the smallest change that resolves the stated issue. Do not add
any commentary. Output ONLY the Markdown document (no code fences, no preamble, no emojis).`

export interface FixPreview {
  path: string
  current: string
  proposed: string
  version: string
}

/** Draft a fix with the LLM. Read-only — no write happens until applyFix. */
export async function previewFix(id: number): Promise<FixPreview> {
  const s = getSuggestion(id)
  if (s.kind !== 'content') throw new BadRequestError('This suggestion is advisory — fix it manually')
  if (s.status !== 'open') throw new BadRequestError('This suggestion is already resolved')
  const client = maintenanceClient(getConfig())
  if (!client) throw new ServiceUnavailableError('No LLM provider is configured to draft a fix')

  const doc: DocContent = readDoc(s.path)
  const user = `Issue to fix: ${s.detail}${s.evidence ? `\nRelevant text: ${s.evidence}` : ''}\n\nCurrent page (${s.path}):\n\n${doc.content}`
  const reply = await client.chat(APPLY_SYSTEM, [{ role: 'user', content: user }], [])
  const proposed = stripEmojis(reply.text).trim()
  if (!proposed) throw new ServiceUnavailableError('The model returned an empty fix')
  return { path: s.path, current: doc.content, proposed, version: doc.version }
}

/** Write the admin-reviewed content (OCC-checked) and mark the suggestion applied. */
export function applyFix(id: number, content: string, version: string, by: string): Suggestion {
  const s = getSuggestion(id)
  if (s.kind !== 'content') throw new BadRequestError('This suggestion is advisory — fix it manually')
  if (s.status !== 'open') throw new BadRequestError('This suggestion is already resolved')
  updateDoc(s.path, stripEmojis(content), version, MAINTENANCE_AUTHOR)
  return db
    .update(suggestions)
    .set({ status: 'applied', resolvedAt: new Date().toISOString(), resolvedBy: by })
    .where(eq(suggestions.id, id))
    .returning()
    .get()
}

export function dismissSuggestion(id: number, by: string): Suggestion {
  getSuggestion(id)
  return db
    .update(suggestions)
    .set({ status: 'dismissed', resolvedAt: new Date().toISOString(), resolvedBy: by })
    .where(eq(suggestions.id, id))
    .returning()
    .get()
}

export function snoozeSuggestion(id: number, days: number, by: string): Suggestion {
  getSuggestion(id)
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  return db
    .update(suggestions)
    .set({ status: 'snoozed', snoozedUntil: until, resolvedBy: by })
    .where(eq(suggestions.id, id))
    .returning()
    .get()
}

// ── Scheduler ────────────────────────────────────────────────────────────────
const CHECK_MS = 15 * 60 * 1000 // how often the timer wakes to see if a run is due
let timer: ReturnType<typeof setInterval> | null = null
let kickoff: ReturnType<typeof setTimeout> | null = null

async function tick(): Promise<void> {
  try {
    const cfg = getConfig()
    if (!cfg.enabled || running) return
    const last = db
      .select()
      .from(maintenanceRuns)
      .where(eq(maintenanceRuns.status, 'ok'))
      .orderBy(desc(maintenanceRuns.id))
      .limit(1)
      .get()
    const dueAt = last?.finishedAt ? new Date(last.finishedAt).getTime() + cfg.intervalHours * 3600_000 : 0
    if (Date.now() >= dueAt) await runMaintenance('schedule')
  } catch (err) {
    logger.warn({ err: String(err) }, 'maintenance scheduler tick failed')
  }
}

/** Start the scheduler timer. No-op in tests or when MAINTENANCE_SCHEDULER=off. */
export function startScheduler(): void {
  if (isTest || env.MAINTENANCE_SCHEDULER === 'off' || timer) return
  kickoff = setTimeout(tick, 20_000) // first check shortly after boot
  timer = setInterval(tick, CHECK_MS)
  logger.info('maintenance scheduler started')
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  if (kickoff) clearTimeout(kickoff)
  timer = null
  kickoff = null
}
