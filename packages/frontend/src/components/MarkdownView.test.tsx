import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { MarkdownView } from './MarkdownView'

function renderMd(content: string) {
  return render(
    <MemoryRouter>
      <MarkdownView content={content} />
    </MemoryRouter>,
  )
}

describe('MarkdownView', () => {
  it('gives headings GitHub-style ids so in-doc anchors resolve', () => {
    const { container } = renderMd('## 3. New Student\n\n[jump](#3-new-student)')
    const h = container.querySelector('#\\33 -new-student') ?? container.querySelector('[id="3-new-student"]')
    expect(h).not.toBeNull()
    expect(h?.tagName).toBe('H2')
    const link = container.querySelector('a[href="#3-new-student"]')
    expect(link).not.toBeNull()
  })

  it('renders standard markdown (bold, lists)', () => {
    const { container } = renderMd('- **one**\n- two')
    expect(container.querySelector('strong')?.textContent).toBe('one')
    expect(container.querySelectorAll('li').length).toBe(2)
  })
})
