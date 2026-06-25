import {
  Bot,
  Eraser,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Send,
  User as UserIcon,
  Wrench,
  X,
} from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { useDocs } from '@/hooks/use-docs'
import { type ToolActivity, useSendMessage } from '@/hooks/use-assistant'
import { cn } from '@/lib/utils'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  tools?: ToolActivity[]
}

// Chat is persisted client-side (no server storage) so it survives closing the
// panel and reloading the app.
const TURNS_KEY = 'tn:assistant:turns'
const CONTEXT_KEY = 'tn:assistant:context'

function loadStored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function saveStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / private-mode errors
  }
}

export function AssistantPanel({
  maximized,
  onToggleMax,
  onClose,
  className,
}: {
  maximized: boolean
  onToggleMax: () => void
  onClose: () => void
  className?: string
}) {
  const send = useSendMessage()
  const [turns, setTurns] = useState<Turn[]>(() => loadStored<Turn[]>(TURNS_KEY, []))
  const [input, setInput] = useState('')
  // Context is opt-in — users add the pages they want via the picker.
  const [context, setContext] = useState<string[]>(() => loadStored<string[]>(CONTEXT_KEY, []))
  const [pickerOpen, setPickerOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep the latest message (and the typing indicator) in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, send.isPending])

  // Persist chat + context to localStorage (cap history to keep storage bounded).
  useEffect(() => saveStored(TURNS_KEY, turns.slice(-200)), [turns])
  useEffect(() => saveStored(CONTEXT_KEY, context), [context])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const message = input.trim()
    if (!message || send.isPending) return
    const history = turns.map((t) => ({ role: t.role, content: t.content }))
    setTurns((t) => [...t, { role: 'user', content: message }])
    setInput('')
    send.mutate(
      { message, history, context },
      {
        onSuccess: (res) => {
          setTurns((t) => [...t, { role: 'assistant', content: res.reply, tools: res.toolActivity }])
        },
        onError: (err) => {
          toast.error(err.message)
          setTurns((t) => [...t, { role: 'assistant', content: `⚠️ ${err.message}` }])
        },
      },
    )
  }

  return (
    <div className={cn('flex h-full flex-col bg-card', className)}>
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4 text-primary" /> Assistant
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Clear chat"
            disabled={turns.length === 0}
            onClick={() => setTurns([])}
          >
            <Eraser />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="hidden size-7 md:inline-flex"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={onToggleMax}
          >
            {maximized ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label="Close assistant" onClick={onClose}>
            <X />
          </Button>
        </div>
      </header>

      {/* Context bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">Context</span>
        {context.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
          >
            <FileText className="size-3 opacity-60" />
            <span className="max-w-[140px] truncate">{p}</span>
            <button
              type="button"
              aria-label={`Remove ${p} from context`}
              onClick={() => setContext((c) => c.filter((x) => x !== p))}
              className="opacity-60 hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-xs" onClick={() => setPickerOpen(true)}>
          <Plus className="size-3" /> Add
        </Button>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask about your wiki — the attached page(s) are included as context, and the assistant can
            search or edit pages with tools.
          </p>
        ) : (
          turns.map((turn, i) => (
            <div key={i} className={cn('flex gap-2.5', turn.role === 'user' && 'flex-row-reverse')}>
              <div
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full',
                  turn.role === 'user' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground',
                )}
              >
                {turn.role === 'user' ? <UserIcon className="size-3.5" /> : <Bot className="size-3.5" />}
              </div>
              <div className={cn('min-w-0 max-w-[85%] space-y-2', turn.role === 'user' && 'text-right')}>
                {turn.role === 'assistant' ? (
                  <div className="rounded-lg bg-muted px-3 py-2 text-left text-sm">
                    <MarkdownView content={turn.content} />
                  </div>
                ) : (
                  <div className="inline-block whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">
                    {turn.content}
                  </div>
                )}
                {turn.tools && turn.tools.length > 0 && (
                  <details className="text-left text-xs text-muted-foreground">
                    <summary className="flex cursor-pointer items-center gap-1.5">
                      <Wrench className="size-3" /> {turn.tools.length} tool call
                      {turn.tools.length > 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 space-y-1 border-l border-border pl-3">
                      {turn.tools.map((t, j) => (
                        <li key={j} className="font-mono">
                          {t.name}({Object.keys(t.args).join(', ')})
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          ))
        )}
        {send.isPending && (
          <div className="flex gap-2.5">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <Bot className="size-3.5" />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-3">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — stays usable while a reply is in flight. */}
      <form onSubmit={handleSubmit} className="flex shrink-0 items-end gap-2 border-t border-border p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the wiki assistant…"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={send.isPending || !input.trim()}>
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>

      <ContextPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exclude={context}
        onPick={(p) => setContext((c) => [...c, p])}
      />
    </div>
  )
}

function ContextPicker({
  open,
  onOpenChange,
  exclude,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  exclude: string[]
  onPick: (path: string) => void
}) {
  const { data: docs } = useDocs()
  const [q, setQ] = useState('')
  const list = (docs ?? [])
    .filter((d) => !exclude.includes(d.path))
    .filter((d) => (q ? d.path.toLowerCase().includes(q.toLowerCase()) : true))
    .slice(0, 50)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add page to context</DialogTitle>
          <DialogDescription className="sr-only">Pick a wiki page to attach.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Filter pages…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">No matching pages.</p>
          ) : (
            list.map((d) => (
              <button
                key={d.path}
                type="button"
                onClick={() => {
                  onPick(d.path)
                  onOpenChange(false)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <FileText className="size-4 shrink-0 opacity-60" />
                <span className="truncate font-mono text-xs">{d.path}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
