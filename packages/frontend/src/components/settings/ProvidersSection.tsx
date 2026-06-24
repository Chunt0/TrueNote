import { Pencil, Plus, RefreshCw, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import {
  type Provider,
  useCreateProvider,
  useDeleteProvider,
  useDetectModels,
  useProviders,
  useSetDefaultProvider,
  useUpdateProvider,
} from '@/hooks/use-providers'
import { SectionHeader } from './SectionHeader'

type Kind = 'anthropic' | 'openai'
const KIND_LABEL: Record<Kind, string> = { anthropic: 'Claude (Anthropic)', openai: 'OpenAI-compatible' }
const emptyForm = { name: '', kind: 'anthropic' as Kind, model: '', baseUrl: '', apiKey: '', isDefault: false }

export function ProvidersSection() {
  const { data: providers, isLoading } = useProviders()
  const create = useCreateProvider()
  const update = useUpdateProvider()
  const remove = useDeleteProvider()
  const setDefault = useSetDefaultProvider()
  const detect = useDetectModels()

  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Provider | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [models, setModels] = useState<string[]>([]) // detected/available in the form
  const busy = create.isPending || update.isPending

  function openNew() {
    setEditing(null)
    setForm({ ...emptyForm, isDefault: (providers?.length ?? 0) === 0 })
    setModels([])
    setMode('form')
  }

  function openEdit(p: Provider) {
    setEditing(p)
    setForm({
      name: p.name,
      kind: (p.kind as Kind) ?? 'anthropic',
      model: p.model,
      baseUrl: p.baseUrl ?? '',
      apiKey: '',
      isDefault: p.isDefault,
    })
    setModels(p.availableModels ?? [])
    setMode('form')
  }

  function handleDetect() {
    detect.mutate(
      {
        kind: form.kind,
        baseUrl: form.baseUrl.trim() || undefined,
        apiKey: form.apiKey.trim() || undefined,
        id: editing?.id,
      },
      {
        onSuccess: (res) => {
          setModels(res.models)
          if (res.models.length === 0) {
            toast.error('No models found — check the URL/key, or enter a model manually.')
          } else if (!form.model || !res.models.includes(form.model)) {
            setForm((f) => ({ ...f, model: res.models[0] }))
          }
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function save() {
    const input = {
      name: form.name.trim(),
      kind: form.kind,
      model: form.model.trim(),
      baseUrl: form.baseUrl.trim() || undefined,
      apiKey: form.apiKey.trim() || undefined,
      availableModels: models.length ? models : undefined,
      isDefault: form.isDefault,
    }
    if (!input.name || !input.model) {
      toast.error('Name and model are required (detect or type a model)')
      return
    }
    const onDone = { onSuccess: () => setMode('list'), onError: (e: Error) => toast.error(e.message) }
    if (editing) update.mutate({ id: editing.id, ...input }, onDone)
    else create.mutate(input, onDone)
  }

  // Quick model switch on a saved source.
  function switchModel(p: Provider, model: string) {
    update.mutate({
      id: p.id,
      name: p.name,
      kind: p.kind as Kind,
      model,
      baseUrl: p.baseUrl ?? undefined,
      isDefault: p.isDefault,
    })
  }

  // Re-probe a saved source and persist the refreshed model list.
  function refresh(p: Provider) {
    detect.mutate(
      { kind: p.kind as Kind, baseUrl: p.baseUrl ?? undefined, id: p.id },
      {
        onSuccess: (res) => {
          if (res.models.length === 0) return toast.error('No models found.')
          update.mutate({
            id: p.id,
            name: p.name,
            kind: p.kind as Kind,
            model: res.models.includes(p.model) ? p.model : res.models[0],
            baseUrl: p.baseUrl ?? undefined,
            availableModels: res.models,
            isDefault: p.isDefault,
          })
          toast.success(`Found ${res.models.length} models`)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  if (mode === 'form') {
    return (
      <div className="space-y-4">
        <SectionHeader
          title={editing ? 'Edit source' : 'Add source'}
          description="Enter the URL + key, then Detect models. OpenAI-compatible covers OpenAI and local Ollama."
        />
        <div className="space-y-2">
          <Label htmlFor="p-name">Name</Label>
          <Input
            id="p-name"
            placeholder="Claude / Local Ollama"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>Provider type</Label>
          <Select
            value={form.kind}
            onValueChange={(v) => {
              setForm((f) => ({ ...f, kind: v as Kind }))
              setModels([])
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anthropic">{KIND_LABEL.anthropic}</SelectItem>
              <SelectItem value="openai">{KIND_LABEL.openai}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-url">Base URL</Label>
          <Input
            id="p-url"
            placeholder={form.kind === 'openai' ? 'http://localhost:11434/v1' : '(optional — Claude default)'}
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-key">API key</Label>
          <Input
            id="p-key"
            type="password"
            placeholder={editing?.hasKey ? '•••••• (leave blank to keep)' : 'sk-… (blank for local)'}
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="p-model">Model</Label>
            <Button size="sm" variant="outline" onClick={handleDetect} disabled={detect.isPending}>
              <RefreshCw className={detect.isPending ? 'animate-spin' : ''} />
              {detect.isPending ? 'Detecting…' : 'Detect models'}
            </Button>
          </div>
          {models.length > 0 ? (
            <Select value={form.model} onValueChange={(v) => setForm((f) => ({ ...f, model: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="p-model"
              placeholder={form.kind === 'anthropic' ? 'claude-sonnet-4-6' : 'llama3.1 / gpt-4o'}
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="p-default"
            checked={form.isDefault}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v === true }))}
          />
          <Label htmlFor="p-default" className="font-normal">
            Use this source for the Assistant
          </Label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setMode('list')}>
            Back
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add source'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="AI Providers"
        description="Add a source (auto-detects its models). Switch the active source, and pick its model inline. Keys are stored on the server and never shown again."
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : providers && providers.length > 0 ? (
        <div className="space-y-2">
          {providers.map((p) => (
            <div key={p.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.isDefault && (
                    <Badge className="gap-1">
                      <Star className="size-3" /> Active
                    </Badge>
                  )}
                  <Badge variant="secondary">{KIND_LABEL[p.kind as Kind] ?? p.kind}</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!p.isDefault && (
                    <Button size="sm" variant="outline" onClick={() => setDefault.mutate(p.id)} disabled={setDefault.isPending}>
                      Use
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" aria-label={`Refresh models for ${p.name}`} onClick={() => refresh(p)}>
                    <RefreshCw className={detect.isPending ? 'animate-spin' : ''} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => remove.mutate(p.id, { onError: (e) => toast.error(e.message) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {p.availableModels.length > 0 ? (
                  <Select value={p.model} onValueChange={(m) => switchModel(p, m)}>
                    <SelectTrigger className="h-8 w-full font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {p.availableModels.map((m) => (
                        <SelectItem key={m} value={m} className="font-mono text-xs">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">{p.model}</span>
                )}
              </div>
              {p.baseUrl && <div className="truncate font-mono text-xs text-muted-foreground">{p.baseUrl}</div>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No sources yet. Add one to choose the model the Assistant uses.</p>
      )}
      <Button onClick={openNew} variant="outline" className="w-full">
        <Plus /> Add source
      </Button>
    </div>
  )
}
