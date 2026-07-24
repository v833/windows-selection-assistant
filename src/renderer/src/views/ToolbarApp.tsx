import { CircleHelp, Clipboard, Languages, Settings, Sparkles, TextQuote, WandSparkles } from 'lucide-react'
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
      <div className="toolbar-brand" aria-label="划词助手"><Languages size={16} /></div>
      <div className="toolbar-divider" />
      {payload.actions.map((action) => (
        <button
          key={action.id}
          className="toolbar-button"
          onClick={() => window.selectionAPI.selectAction(action.id)}
          aria-label={action.label}
          data-tooltip={action.label}>
          {toolbarIcon(action.kind)}
        </button>
      ))}
      <div className="toolbar-divider" />
      <button
        className="toolbar-button"
        onClick={() => void window.selectionAPI.copyText(payload.text).then(() => window.selectionAPI.closeWindow())}
        aria-label="复制"
        data-tooltip="复制">
        <Clipboard size={17} />
      </button>
      <button className="toolbar-button" onClick={() => window.selectionAPI.openSettings()} aria-label="设置" data-tooltip="设置">
        <Settings size={17} />
      </button>
    </div>
  )
}

function toolbarIcon(kind: SelectionAction['kind']) {
  if (kind === 'translate') return <Languages size={17} />
  if (kind === 'explain') return <CircleHelp size={17} />
  if (kind === 'summarize') return <TextQuote size={17} />
  if (kind === 'rewrite') return <Sparkles size={17} />
  return <WandSparkles size={17} />
}
