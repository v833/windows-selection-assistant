import {
  Check,
  CircleAlert,
  Copy,
  Languages,
  LoaderCircle,
  MessageCircle,
  Minus,
  RefreshCw,
  SendHorizontal,
  Settings,
  Square,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ActionPayload, AIConversationMessage, AIStreamEvent } from '../../../shared/types'

type RequestState = 'idle' | 'loading' | 'done' | 'error'

export function ResultApp() {
  const [payload, setPayload] = useState<ActionPayload | null>(null)
  const [messages, setMessages] = useState<AIConversationMessage[]>([])
  const [streaming, setStreaming] = useState('')
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<RequestState>('idle')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const requestId = useRef('')
  const streamingRef = useRef('')

  const run = useCallback((nextPayload: ActionPayload, conversation: AIConversationMessage[]) => {
    if (requestId.current) window.selectionAPI.cancelAI(requestId.current)
    const id = crypto.randomUUID()
    requestId.current = id
    streamingRef.current = ''
    setStreaming('')
    setError('')
    setState('loading')
    window.selectionAPI.runAI({
      requestId: id,
      action: nextPayload.action,
      selectedText: nextPayload.selectedText,
      conversation
    })
  }, [])

  useEffect(() => {
    const unsubscribePayload = window.selectionAPI.onActionPayload((next) => {
      if (requestId.current) window.selectionAPI.cancelAI(requestId.current)
      requestId.current = ''
      streamingRef.current = ''
      setPayload(next)
      setMessages([])
      setStreaming('')
      setDraft('')
      setError('')
      setCopied(false)
      document.documentElement.dataset.theme = next.theme

      if (next.action.kind === 'chat') setState('idle')
      else run(next, [])
    })
    const unsubscribeStream = window.selectionAPI.onAIStream((event: AIStreamEvent) => {
      if (event.requestId !== requestId.current) return
      if (event.type === 'delta') {
        streamingRef.current += event.content ?? ''
        setStreaming(streamingRef.current)
      }
      if (event.type === 'done') {
        const answer = streamingRef.current
        if (answer.trim()) setMessages((current) => [...current, { role: 'assistant', content: answer }])
        streamingRef.current = ''
        requestId.current = ''
        setStreaming('')
        setState('done')
      }
      if (event.type === 'error') {
        requestId.current = ''
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

  useEffect(() => {
    const content = contentRef.current
    if (content) content.scrollTop = content.scrollHeight
  }, [messages, streaming, error, state])

  function sendQuestion() {
    const question = draft.trim()
    if (!payload || !question || state === 'loading') return
    const conversation: AIConversationMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(conversation)
    setDraft('')
    run(payload, conversation)
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    sendQuestion()
  }

  function stop() {
    if (!requestId.current) return
    window.selectionAPI.cancelAI(requestId.current)
    requestId.current = ''
    const partial = streamingRef.current
    if (partial.trim()) setMessages((current) => [...current, { role: 'assistant', content: partial }])
    streamingRef.current = ''
    setStreaming('')
    setState(partial.trim() ? 'done' : 'idle')
  }

  function regenerate() {
    if (!payload || state === 'loading') return
    const conversation = messages.at(-1)?.role === 'assistant' ? messages.slice(0, -1) : messages
    if (payload.action.kind === 'chat' && conversation.length === 0) return
    setMessages(conversation)
    run(payload, conversation)
  }

  async function copy() {
    const answer = streaming || latestAssistant(messages)
    if (!answer) return
    await window.selectionAPI.copyText(answer)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const latestAnswer = streaming || latestAssistant(messages)
  const canRegenerate = Boolean(payload && state !== 'loading' && (payload.action.kind !== 'chat' || messages.length > 0))

  return (
    <div className="result-window">
      <header className="result-titlebar">
        <div className="result-title">
          <span className="mini-mark">{payload?.action.kind === 'chat' ? <MessageCircle size={14} /> : <Languages size={14} />}</span>
          <strong>{payload?.action.label ?? '划词助手'}</strong>
        </div>
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

      <main className="result-content" ref={contentRef}>
        <div className="conversation">
          {payload?.action.kind === 'chat' && messages.length === 0 && state === 'idle' && (
            <div className="conversation-empty"><MessageCircle size={20} /><span>等待提问</span></div>
          )}
          {messages.map((message, index) => (
            <article className={`conversation-message ${message.role}`} key={`${message.role}-${index}`}>
              <span className="message-role">{message.role === 'user' ? '你' : '助手'}</span>
              <div className="message-text">{message.content}</div>
            </article>
          ))}
          {state === 'loading' && !streaming && (
            <div className="result-loading"><LoaderCircle className="spin" size={20} /><span>正在思考</span></div>
          )}
          {streaming && (
            <article className="conversation-message assistant streaming">
              <span className="message-role">助手</span>
              <div className="message-text">{streaming}<span className="stream-caret" /></div>
            </article>
          )}
          {state === 'error' && <div className="error-message"><CircleAlert size={15} />{error}</div>}
        </div>
      </main>

      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendQuestion() }}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={payload?.action.kind === 'chat' ? '询问这段文字...' : '继续追问...'}
          maxLength={4000}
          rows={2}
          disabled={!payload}
          aria-label="会话问题"
        />
        {state === 'loading' ? (
          <button className="composer-button stop" type="button" onClick={stop} aria-label="停止生成" title="停止生成"><Square size={14} /></button>
        ) : (
          <button className="composer-button" type="submit" disabled={!payload || !draft.trim()} aria-label="发送问题" title="发送问题"><SendHorizontal size={17} /></button>
        )}
      </form>

      <footer className="result-footer">
        <span>{payload?.model ?? ''}</span>
        <div>
          <button className="result-action" onClick={regenerate} disabled={!canRegenerate} aria-label="重新生成" data-tooltip="重新生成"><RefreshCw size={16} /></button>
          <button className="result-action" onClick={() => void copy()} disabled={!latestAnswer} aria-label="复制最近回答" data-tooltip="复制最近回答">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        </div>
      </footer>
    </div>
  )
}

function latestAssistant(messages: AIConversationMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return messages[index].content
  }
  return ''
}
