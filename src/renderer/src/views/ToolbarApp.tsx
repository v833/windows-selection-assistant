import {
  BrainCircuit,
  CircleHelp,
  Clipboard,
  Code2,
  Ellipsis,
  Languages,
  ListFilter,
  MessageCircle,
  PenLine,
  Settings,
  Sparkles,
  TextQuote,
  Volume2,
  WandSparkles
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SelectionAction, SelectionPayload } from '../../../shared/types'

export function ToolbarApp() {
  const [payload, setPayload] = useState<SelectionPayload | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubscribe = window.selectionAPI.onSelectionChanged((next) => {
      setPayload(next)
      document.documentElement.dataset.theme = next.theme
    })
    window.selectionAPI.toolbarReady()
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!toolbarRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      window.selectionAPI.resizeToolbar(width + 8, height + 8)
    })
    observer.observe(toolbarRef.current)
    return () => observer.disconnect()
  }, [payload])

  if (!payload) return null

  return (
    <div className="toolbar-surface" ref={toolbarRef}>
      <div className="toolbar-brand" role="img" aria-label="划词助手"><Languages size={16} /></div>
      <div className="toolbar-divider" aria-hidden="true" />
      {payload.actions.map((action) => (
        <button
          key={action.id}
          className="toolbar-button"
          onClick={() => window.selectionAPI.selectAction(action.id)}
          aria-label={action.label}
          aria-keyshortcuts={ariaShortcut(action.shortcut)}
          title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}>
          {toolbarIcon(action.kind)}
        </button>
      ))}
      {payload.hasMoreActions && (
        <button
          className="toolbar-button"
          onClick={() => window.selectionAPI.openActionMenu()}
          aria-label="更多动作"
          title="更多动作">
          <Ellipsis size={18} />
        </button>
      )}
      <div className="toolbar-divider" aria-hidden="true" />
      <button
        className="toolbar-button"
        onClick={() => void window.selectionAPI.copyText(payload.text).then(() => window.selectionAPI.closeWindow())}
        aria-label="复制"
        title="复制选中文本">
        <Clipboard size={17} />
      </button>
      <button className="toolbar-button" onClick={() => window.selectionAPI.openSettings()} aria-label="设置" title="打开设置">
        <Settings size={17} />
      </button>
    </div>
  )
}

function ariaShortcut(shortcut?: string): string | undefined {
  return shortcut?.replace('Ctrl', 'Control').replace('Super', 'Meta')
}

function toolbarIcon(kind: SelectionAction['kind']) {
  if (kind === 'chat') return <MessageCircle size={17} />
  if (kind === 'translate') return <Languages size={17} />
  if (kind === 'speak') return <Volume2 size={17} />
  if (kind === 'explain') return <CircleHelp size={17} />
  if (kind === 'summarize') return <TextQuote size={17} />
  if (kind === 'rewrite') return <Sparkles size={17} />
  if (kind === 'writing') return <PenLine size={17} />
  if (kind === 'extract') return <ListFilter size={17} />
  if (kind === 'analysis') return <BrainCircuit size={17} />
  if (kind === 'code') return <Code2 size={17} />
  return <WandSparkles size={17} />
}
