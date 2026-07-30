import { Children, createContext, isValidElement, useContext, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createSpeechSegment } from '../../../shared/speech'
import { sanitizeExternalUrl } from '../../../shared/markdown'
import type { SpeechSegmentKind } from '../../../shared/types'
import { SpeechButton } from './SpeechButton'

type SpeechContainer = 'list-item' | 'blockquote'
const SpeechContainerContext = createContext<SpeechContainer | null>(null)

export function MarkdownContent({ content, language, segmentPrefix = 'answer' }: {
  content: string
  language?: string
  segmentPrefix?: string
}) {
  const segment = (kind: SpeechSegmentKind, text: string, label: string) => createSpeechSegment(
    kind,
    text,
    label,
    language,
    segmentPrefix
  )

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => sanitizeExternalUrl(url) ?? ''}
        components={createMarkdownComponents(segment)}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

function createMarkdownComponents(segment: (kind: SpeechSegmentKind, text: string, label: string) => ReturnType<typeof createSpeechSegment>): Components {
  return {
  a({ href, children, node: _node, ...props }) {
    const url = sanitizeExternalUrl(href)
    if (!url) return <span>{children}</span>
    return (
      <a
        {...props}
        href={url}
        onClick={(event) => {
          event.preventDefault()
          void window.selectionAPI.openExternal(url)
        }}>
        {children}
      </a>
    )
  },
  code({ children, className, node: _node, ...props }) {
    return <code {...props} className={className}>{children}</code>
  },
  pre({ children }) {
    const child = Children.toArray(children)[0]
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return <pre>{children}</pre>
    const language = /language-([^\s]+)/.exec(child.props.className ?? '')?.[1] ?? 'text'
    const code = String(child.props.children ?? '').replace(/\n$/, '')
    return <CodeBlock code={code} language={language} />
  },
  img({ alt }) {
    return <span className="markdown-image-placeholder">{alt ? `图片：${alt}` : '图片已隐藏'}</span>
  },
  h1({ children, node: _node, ...props }) {
    return <><h1 {...props}>{children}</h1><SpeechButton segment={segment('heading', nodeText(children), '朗读标题')} /></>
  },
  h2({ children, node: _node, ...props }) {
    return <><h2 {...props}>{children}</h2><SpeechButton segment={segment('heading', nodeText(children), '朗读标题')} /></>
  },
  h3({ children, node: _node, ...props }) {
    return <><h3 {...props}>{children}</h3><SpeechButton segment={segment('heading', nodeText(children), '朗读标题')} /></>
  },
  h4({ children, node: _node, ...props }) {
    return <><h4 {...props}>{children}</h4><SpeechButton segment={segment('heading', nodeText(children), '朗读标题')} /></>
  },
  p({ children, node: _node, ...props }) {
    const speechContainer = useContext(SpeechContainerContext)
    return <><p {...props}>{children}</p>{speechContainer === null && <SpeechButton segment={segment('paragraph', nodeText(children), '朗读段落')} />}</>
  },
  li({ children, node: _node, ...props }) {
    return (
      <li {...props}>
        <SpeechContainerContext.Provider value="list-item">{children}</SpeechContainerContext.Provider>
        <SpeechButton segment={segment('list-item', nodeText(children), '朗读列表项')} />
      </li>
    )
  },
  blockquote({ children, node: _node, ...props }) {
    return (
      <>
        <blockquote {...props}>
          <SpeechContainerContext.Provider value="blockquote">{children}</SpeechContainerContext.Provider>
        </blockquote>
        <SpeechButton segment={segment('quote', nodeText(children), '朗读引用')} />
      </>
    )
  },
  table({ children }) {
    return <div className="markdown-table-wrap"><table>{children}</table></div>
  }
  }
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children)
  return ''
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await window.selectionAPI.copyText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language}</span>
        <button type="button" onClick={() => void copy()} aria-label={`复制 ${language} 代码`}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <Highlight theme={themes.vsDark} code={code} language={language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={className} style={{ ...style, background: 'transparent' }}>
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })}>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}
