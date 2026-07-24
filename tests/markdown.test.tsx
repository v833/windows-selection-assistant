import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from '../src/renderer/src/components/MarkdownContent'

describe('Markdown rendering', () => {
  it('renders GFM content while dropping raw HTML and unsafe links', () => {
    const markdown = `# 标题

> 引用

| 名称 | 值 |
| --- | --- |
| A | 1 |

[危险链接](javascript:alert(1))

<script>alert('xss')</script>`
    const html = renderToStaticMarkup(<MarkdownContent content={markdown} />)

    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
  })

  it('renders an independent copy action for every fenced code block', () => {
    const markdown = '```ts\nconst value = 1\n```\n\n```python\nprint(1)\n```'
    const html = renderToStaticMarkup(<MarkdownContent content={markdown} />)

    expect(html.match(/aria-label="复制 [^"]+ 代码"/g)).toHaveLength(2)
    expect(html).toContain('language-ts')
    expect(html).toContain('language-python')
  })

  it('does not automatically load Markdown images', () => {
    const html = renderToStaticMarkup(<MarkdownContent content="![跟踪图片](https://example.com/track.png)" />)

    expect(html).not.toContain('<img')
    expect(html).not.toContain('track.png')
    expect(html).toContain('图片：跟踪图片')
  })
})
