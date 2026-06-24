import { Badge } from '@/components/ui/badge'
import { APP_NAME } from '@/lib/config'
import { SectionHeader } from './SectionHeader'

const STACK = ['Bun', 'Elysia', 'React', 'SQLite', 'Tailwind']

export function AboutSection() {
  return (
    <div className="space-y-4">
      <SectionHeader title="About" />
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-medium">{APP_NAME}</span> — an internal team wiki with a tool-using AI
          assistant.
        </p>
        <p className="text-muted-foreground">
          Markdown pages stored as files on disk, per-user history via git, and pluggable LLM
          providers.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {STACK.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}
