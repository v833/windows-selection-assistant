import { Check, Copy, Languages, LoaderCircle, Minus, RefreshCw, Settings, Square, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionPayload, AIStreamEvent } from '../../../shared/types'

export function ResultApp() {
  const [payload, setPayload] = useState<ActionPayload | null>(null)
  const [output, setOutput] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const requestId = useRef('')

  const run = useCallback((nextPayload: ActionPayload) => {
    if (requestId.current) window.selectionAPI.cancelAI(requestId.current)
    const id = crypto.randomUUID()
    requestId.current = id
    setOutput('')
    setError('')
    setState('loading')
    window.selectionAPI.runAI({ requestId: id, action: nextPayload.action, selectedText: nextPayload.selectedText })
  }, [])

  useEffect(() => {
    const unsubscribePayload = window.selectionAPI.onActionPayload((next) => {
      setPayload(next)
      document.documentElement.dataset.theme = next.theme
      run(next)
    })
    const unsubscribeStream = window.selectionAPI.onAIStream((event: AIStreamEvent) => {
      if (event.requestId !== requestId.current) return
      if (event.type === 'delta') setOutput((current) => current + (event.content ?? ''))
      if (event.type === 'done') setState('done')
      if (event.type === 'error') {
        setError(event.content ?? '请求失败')
        setState('error')
      }
    })
    window.selectionAPI.resultReady()
    return () => {
      unsubscribePayload()
      unsubscribeStream()
      if (requestId.current) window.selectionAPI.cancelAI(requestId.current)
    }
  }, [run])

  async function copy() {
    await window.selectionAPI.copyText(output)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="result-window">
      <header className="result-titlebar">
        <div className="result-title"><span className="mini-mark"><Languages size={14} /></span><strong>{payload?.action.label ?? '划词助手'}</strong></div>
        <div className="window-controls">
          <button onClick={() => window.selectionAPI.openSettings()} aria-label="设置"><Settings size={15} /></button>
          <button onClick={() => window.selectionAPI.minimizeWindow()} aria-label="最小化"><Minus size={16} /></button>
          <button className="close" onClick={() => window.selectionAPI.closeWindow()} aria-label="关闭"><X size={16} /></button>
        </div>
      </header>

      <section className="source-strip">
        <span>{payload?.programName || '选中文本'}</span>
        <p>{payload?.selectedText}</p>
      </section>

      <main className="result-content">
        {state === 'loading' && !output && <div className="result-loading"><LoaderCircle className="spin" size={20} /><span>正在处理</span></div>}
        {output && <div className="result-text">{output}<span className={state === 'loading' ? 'stream-caret' : ''} /></div>}
        {state === 'error' && <div className="error-message"><Square size={14} />{error}</div>}
      </main>

      <footer className="result-footer">
        <span>{payload?.model ?? ''}</span>
        <div>
          <button className="result-action" onClick={() => payload && run(payload)} disabled={!payload || state === 'loading'} aria-label="重新生成" data-tooltip="重新生成"><RefreshCw size={16} /></button>
          <button className="result-action" onClick={() => void copy()} disabled={!output} aria-label="复制结果" data-tooltip="复制结果">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        </div>
      </footer>
    </div>
  )
}
