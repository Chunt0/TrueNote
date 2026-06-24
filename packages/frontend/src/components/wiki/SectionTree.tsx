import { ChevronDown, ChevronRight, FileText, Folder, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DocSummary } from '@/hooks/use-docs'
import { cn } from '@/lib/utils'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  doc?: DocSummary
  children: TreeNode[]
}

// Build a nested tree from flat "a/b/c.md" paths: folders = sections, .md = pages.
function buildTree(docs: DocSummary[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }
  for (const doc of docs) {
    const parts = doc.path.split('/')
    let node = root
    let acc = ''
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      const isLeaf = i === parts.length - 1
      let child = node.children.find((c) => c.name === part && c.isDir === !isLeaf)
      if (!child) {
        child = { name: part, path: acc, isDir: !isLeaf, children: [], doc: isLeaf ? doc : undefined }
        node.children.push(child)
      }
      node = child
    })
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    n.children.forEach(sort)
  }
  sort(root)
  return root.children
}

export function SectionTree({
  docs,
  activePath,
  onSelect,
  onAddPage,
}: {
  docs: DocSummary[]
  activePath: string | null
  onSelect: (path: string) => void
  onAddPage: (folder: string) => void
}) {
  const tree = useMemo(() => buildTree(docs), [docs])
  // Folders are open unless explicitly collapsed (good default for a small wiki).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  if (tree.length === 0) {
    return <p className="px-2 py-4 text-sm text-muted-foreground">No pages yet.</p>
  }

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const pad = { paddingLeft: `${depth * 0.75 + 0.5}rem` }
    if (node.isDir) {
      const open = !collapsed.has(node.path)
      return (
        <div key={node.path}>
          <div
            className="group flex items-center gap-1 rounded-md pr-1 text-sm font-medium text-foreground hover:bg-accent/60"
            style={pad}
          >
            <button
              type="button"
              onClick={() => toggle(node.path)}
              className="flex flex-1 items-center gap-1.5 py-1.5 text-left"
              aria-expanded={open}
            >
              {open ? (
                <ChevronDown className="size-3.5 shrink-0 opacity-60" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 opacity-60" />
              )}
              <Folder className="size-4 shrink-0 text-primary/70" />
              <span className="truncate">{node.name}</span>
            </button>
            <button
              type="button"
              onClick={() => onAddPage(node.path)}
              aria-label={`New page in ${node.name}`}
              className="shrink-0 rounded p-1 opacity-0 hover:bg-accent group-hover:opacity-60 hover:opacity-100"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {open && node.children.map((c) => renderNode(c, depth + 1))}
        </div>
      )
    }
    const active = node.doc!.path === activePath
    return (
      <button
        key={node.path}
        type="button"
        onClick={() => onSelect(node.doc!.path)}
        style={pad}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors',
          active
            ? 'bg-primary/10 font-medium text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        <FileText className={cn('ml-3.5 size-4 shrink-0', active ? 'text-primary' : 'opacity-50')} />
        <span className="truncate">{node.doc!.title}</span>
      </button>
    )
  }

  return <div className="space-y-0.5">{tree.map((node) => renderNode(node, 0))}</div>
}
