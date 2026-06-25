import { useSearchParams } from 'react-router'
import { DocPane } from '@/components/wiki/DocPane'
import { WikiHome } from '@/components/wiki/WikiHome'

// The wiki content pane. Navigation lives in the sidebar (WikiNav); "/" with no
// ?path shows the landing home, otherwise the selected page (rendered Markdown
// with an Edit toggle).
export default function WikiPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('path')

  if (!selected) {
    return (
      <div className="h-full overflow-y-auto">
        <WikiHome />
      </div>
    )
  }

  return (
    <div className="h-full p-4 sm:p-6">
      <DocPane
        key={selected}
        path={selected}
        onDeleted={() => setParams({}, { replace: true })}
        onRenamed={(p) => setParams({ path: p }, { replace: true })}
      />
    </div>
  )
}
