import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  Eraser,
  Languages,
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  Minus,
  RefreshCw,
  Scissors,
  SendHorizontal,
  Settings,
  Sparkles,
  Square,
  X
} from 'lucide-react'
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'
import {
  createSessionTitle,
  getActiveContextMessages,
  resolveInitialContextMode
} from '../../../shared/sessions'
import {
  estimateTokenCount,
  trimConversationForRequest,
  truncateText
} from '../../../shared/textLimits'
import { shouldSubmitComposer } from '../../../shared/composer'
import type {
  ActionPayload,
  AIConversationMessage,
  AIErrorInfo,
  AIStreamEvent,
  ConversationSession,
  SelectionAction
} from '../../../shared/types'
import { MarkdownContent } from '../components/MarkdownContent'
import { SpeechButton } from '../components/SpeechButton'

type RequestState = 'idle' | 'loading' | 'done' | 'error'
type RequestPhase = 'answer' | 'source-summary'
type SourceStrategy = 'full' | 'truncate' | 'summarize' | null

interface ActiveRequest {
  payload: ActionPayload
  conversation: AIConversationMessage[]
  selectedText: string
  action: SelectionAction
  phase: RequestPhase
  resumeAfterSummary: boolean
}

const COMPOSER_MAX_HEIGHT = 132
const COMPOSER_MAX_CHARACTERS = 4000
const LONG_SOURCE_SUMMARY_ACTION: SelectionAction = {
  id: 'summarize:long-source',
  label: '压缩长文本',
  kind: 'summarize',
  enabled: true,
  prompt: '将长文本压缩为结构清晰的摘要，保留关键事实、数字、结论、约束和代码语义。只输出摘要。'
}

export function ResultApp() {
  const [payload, setPayload] = useState<ActionPayload | null>(null)
  const [messages, setMessages] = useState<AIConversationMessage[]>([])
  const [streaming, setStreaming] = useState('')
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<RequestState>('idle')
  const [error, setError] = useState<AIErrorInfo | null>(null)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [sourceStrategy, setSourceStrategy] = useState<SourceStrategy>(null)
  const [sourceSummary, setSourceSummary] = useState('')
  const [storedContextText, setStoredContextText] = useState('')
  const [sourceExpanded, setSourceExpanded] = useState(false)
  const [contextStartIndex, setContextStartIndex] = useState(0)
  const [sessionId, setSessionId] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [sessionCreatedAt, setSessionCreatedAt] = useState('')
  const [sessionPersisted, setSessionPersisted] = useState(false)
  const [sessionSaveError, setSessionSaveError] = useState('')
  const [historyActive, setHistoryActive] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const requestId = useRef('')
  const streamingRef = useRef('')
  const streamFrameRef = useRef<number | null>(null)
  const activeRequestRef = useRef<ActiveRequest | null>(null)
  const skipPersistRef = useRef(false)
  const persistRevisionRef = useRef(0)
  const latestSessionRef = useRef<ConversationSession | null>(null)

  const persistSession = useCallback((session: ConversationSession) => {
    latestSessionRef.current = session
    const revision = ++persistRevisionRef.current
    setSessionPersisted(false)
    setSessionSaveError('')
    void window.selectionAPI.saveSession(session).then((saved) => {
      if (revision !== persistRevisionRef.current) return
      setSessionPersisted(Boolean(saved))
      setHistoryActive(Boolean(saved))
      if (saved) setSessionTitle(saved.title)
    }).catch((saveError) => {
      if (revision !== persistRevisionRef.current) return
      setSessionPersisted(false)
      setHistoryActive(true)
      setSessionSaveError(readableSessionError(saveError))
    })
  }, [])

  const run = useCallback((
    nextPayload: ActionPayload,
    conversation: AIConversationMessage[],
    options: Partial<Pick<ActiveRequest, 'selectedText' | 'action' | 'phase' | 'resumeAfterSummary'>> = {}
  ) => {
    if (requestId.current) window.selectionAPI.cancelAI(requestId.current)
    const id = crypto.randomUUID()
    const activeRequest: ActiveRequest = {
      payload: nextPayload,
      conversation,
      selectedText: options.selectedText ?? nextPayload.selectedText,
      action: options.action ?? nextPayload.action,
      phase: options.phase ?? 'answer',
      resumeAfterSummary: options.resumeAfterSummary ?? false
    }
    activeRequestRef.current = activeRequest
    requestId.current = id
    if (streamFrameRef.current !== null) window.cancelAnimationFrame(streamFrameRef.current)
    streamFrameRef.current = null
    streamingRef.current = ''
    setStreaming('')
    setError(null)
    setNotice('')
    setState('loading')
    window.selectionAPI.runAI({
      requestId: id,
      action: activeRequest.action,
      selectedText: activeRequest.selectedText,
      programName: activeRequest.payload.programName,
      conversation
    })
  }, [])

  useEffect(() => {
    const unsubscribePayload = window.selectionAPI.onActionPayload((next) => {
      if (requestId.current) window.selectionAPI.cancelAI(requestId.current)
      const sourceExceedsLimit = next.selectedText.length > next.maxInputCharacters
      if (streamFrameRef.current !== null) window.cancelAnimationFrame(streamFrameRef.current)
      streamFrameRef.current = null
      requestId.current = ''
      streamingRef.current = ''
      activeRequestRef.current = null
      persistRevisionRef.current += 1
      skipPersistRef.current = true
      const reopenedSession = next.session
      const now = new Date().toISOString()
      setPayload(next)
      setMessages(reopenedSession?.messages ?? [])
      setStreaming('')
      setDraft('')
      setError(null)
      setNotice(reopenedSession ? '已打开历史会话。' : '')
      setCopied(false)
      setSourceStrategy(resolveInitialContextMode(
        reopenedSession?.contextMode,
        next.selectedText.length,
        next.maxInputCharacters
      ))
      setSourceSummary(reopenedSession?.contextMode === 'summarize' ? reopenedSession.contextText : '')
      setStoredContextText(reopenedSession?.contextText ?? '')
      setSourceExpanded(false)
      setContextStartIndex(reopenedSession?.contextStartIndex ?? 0)
      setSessionId(reopenedSession?.id ?? crypto.randomUUID())
      setSessionTitle(reopenedSession?.title ?? createSessionTitle(next.selectedText, next.action.label))
      setSessionCreatedAt(reopenedSession?.createdAt ?? now)
      setSessionPersisted(Boolean(reopenedSession))
      setSessionSaveError('')
      setHistoryActive(next.historyEnabled)
      latestSessionRef.current = reopenedSession ?? null
      document.documentElement.dataset.theme = next.theme

      if (reopenedSession) setState(reopenedSession.messages.length ? 'done' : 'idle')
      else if (next.action.kind === 'chat' || sourceExceedsLimit) setState('idle')
      else run(next, [])
    })
    const unsubscribeStream = window.selectionAPI.onAIStream((event: AIStreamEvent) => {
      if (event.requestId !== requestId.current) return
      if (event.type === 'delta') {
        streamingRef.current += event.content ?? ''
        if (streamFrameRef.current === null) {
          streamFrameRef.current = window.requestAnimationFrame(() => {
            streamFrameRef.current = null
            setStreaming(streamingRef.current)
          })
        }
      }
      if (event.type === 'done') {
        const answer = streamingRef.current
        const activeRequest = activeRequestRef.current
        if (streamFrameRef.current !== null) window.cancelAnimationFrame(streamFrameRef.current)
        streamFrameRef.current = null
        requestId.current = ''
        streamingRef.current = ''
        setStreaming('')

        if (activeRequest?.phase === 'source-summary') {
          if (!answer.trim()) {
            setError(fallbackError('长文本总结未返回内容，请重试。'))
            setState('error')
            return
          }
          setSourceSummary(answer)
          setStoredContextText(answer)
          setSourceStrategy('summarize')
          if (activeRequest.payload.action.kind === 'chat' || activeRequest.resumeAfterSummary) {
            setNotice('长文本已压缩，可继续提问。')
            setState(activeRequest.resumeAfterSummary ? 'done' : 'idle')
          } else {
            run(activeRequest.payload, [], { selectedText: answer })
          }
          return
        }

        if (answer.trim()) setMessages((current) => [...current, { role: 'assistant', content: answer }])
        setState('done')
      }
      if (event.type === 'error') {
        const activeRequest = activeRequestRef.current
        const partial = streamingRef.current
        if (streamFrameRef.current !== null) window.cancelAnimationFrame(streamFrameRef.current)
        streamFrameRef.current = null
        requestId.current = ''
        if (activeRequest?.phase === 'source-summary') {
          streamingRef.current = ''
          setStreaming('')
          setSourceStrategy(null)
        } else {
          setStreaming(partial)
        }
        setError(event.error ?? fallbackError('模型请求未能完成，请重试。'))
        setState('error')
      }
    })
    window.selectionAPI.resultReady()
    return () => {
      unsubscribePayload()
      unsubscribeStream()
      if (streamFrameRef.current !== null) window.cancelAnimationFrame(streamFrameRef.current)
      if (requestId.current) window.selectionAPI.cancelAI(requestId.current)
    }
  }, [run])

  useEffect(() => {
    const content = contentRef.current
    if (content) content.scrollTop = content.scrollHeight
  }, [messages, streaming, error, notice, state])

  useLayoutEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    composer.style.height = '0px'
    const height = Math.min(COMPOSER_MAX_HEIGHT, Math.max(42, composer.scrollHeight))
    composer.style.height = `${height}px`
    composer.style.overflowY = composer.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [draft])

  const effectiveSelectedText = useMemo(() => {
    if (!payload) return ''
    if (sourceStrategy === 'truncate') return storedContextText || truncateText(payload.selectedText, payload.maxInputCharacters).text
    if (sourceStrategy === 'summarize') return sourceSummary
    if (sourceStrategy === 'full') return payload.selectedText
    return ''
  }, [payload, sourceStrategy, sourceSummary, storedContextText])

  const activeContextMessages = useMemo(
    () => getActiveContextMessages(messages, contextStartIndex),
    [contextStartIndex, messages]
  )

  const nextConversation = useMemo<AIConversationMessage[]>(() => {
    const question = draft.trim()
    return question ? [...activeContextMessages, { role: 'user', content: question }] : activeContextMessages
  }, [activeContextMessages, draft])
  const historyUsage = useMemo(() => trimConversationForRequest(nextConversation), [nextConversation])
  const sourceTokenCount = useMemo(() => estimateTokenCount(payload?.selectedText ?? ''), [payload?.selectedText])
  const effectiveSourceTokenCount = useMemo(() => estimateTokenCount(effectiveSelectedText), [effectiveSelectedText])
  const historyTokenCount = useMemo(() => estimateTokenCount(
    historyUsage.messages.map((message) => message.content).join('\n')
  ), [historyUsage.messages])
  const draftTokenCount = useMemo(() => estimateTokenCount(draft), [draft])
  const requestCharacters = effectiveSelectedText.length + historyUsage.characterCount
  const requestTokens = effectiveSourceTokenCount + historyTokenCount
  const sourceExceedsLimit = Boolean(payload && payload.selectedText.length > payload.maxInputCharacters)
  const activePhase = activeRequestRef.current?.phase ?? 'answer'

  const createSessionSnapshot = useCallback((nextMessages: AIConversationMessage[]): ConversationSession | null => {
    if (!payload || !sessionId || !nextMessages.length || !effectiveSelectedText || !sourceStrategy) return null
    const now = new Date().toISOString()
    return {
      id: sessionId,
      title: sessionTitle,
      selectedText: payload.selectedText,
      contextText: effectiveSelectedText,
      contextMode: sourceStrategy,
      contextStartIndex,
      programName: payload.programName,
      action: payload.action,
      model: payload.model,
      createdAt: sessionCreatedAt || now,
      updatedAt: now,
      messages: nextMessages
    }
  }, [contextStartIndex, effectiveSelectedText, payload, sessionCreatedAt, sessionId, sessionTitle, sourceStrategy])

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    if (state === 'loading') return
    const session = createSessionSnapshot(messages)
    if (session) persistSession(session)
  }, [createSessionSnapshot, messages, persistSession, state])

  function chooseTruncate() {
    if (!payload) return
    const truncated = truncateText(payload.selectedText, payload.maxInputCharacters)
    setSourceStrategy('truncate')
    setSourceSummary('')
    setStoredContextText(truncated.text)
    setNotice(`已截断 ${truncated.omittedCharacters.toLocaleString()} 个字符。`)
    if (payload.action.kind !== 'chat' && messages.length === 0) run(payload, [], { selectedText: truncated.text })
  }

  function chooseSummarize() {
    if (!payload) return
    setSourceStrategy('summarize')
    setSourceSummary('')
    setStoredContextText('')
    run(payload, [], {
      selectedText: payload.selectedText,
      action: LONG_SOURCE_SUMMARY_ACTION,
      phase: 'source-summary',
      resumeAfterSummary: messages.length > 0
    })
  }

  function sendQuestion() {
    const question = draft.trim()
    if (!payload || !effectiveSelectedText || !question || state === 'loading') return
    const displayMessages: AIConversationMessage[] = [...messages, { role: 'user', content: question }]
    const conversation: AIConversationMessage[] = [...activeContextMessages, { role: 'user', content: question }]
    const session = createSessionSnapshot(displayMessages)
    if (session) persistSession(session)
    setMessages(displayMessages)
    setDraft('')
    run(payload, conversation, { selectedText: effectiveSelectedText })
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitComposer({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.keyCode
    })) return
    event.preventDefault()
    sendQuestion()
  }

  function stop() {
    if (!requestId.current) return
    const activeRequest = activeRequestRef.current
    window.selectionAPI.cancelAI(requestId.current)
    requestId.current = ''
    if (streamFrameRef.current !== null) window.cancelAnimationFrame(streamFrameRef.current)
    streamFrameRef.current = null
    const partial = streamingRef.current
    streamingRef.current = ''
    setStreaming('')
    setError(null)

    if (activeRequest?.phase === 'source-summary') {
      setSourceStrategy(null)
      setSourceSummary('')
      setStoredContextText('')
      setNotice('已停止长文本总结。')
      setState('idle')
      return
    }

    if (partial.trim()) setMessages((current) => [...current, { role: 'assistant', content: partial }])
    setNotice('已停止生成。')
    setState(partial.trim() ? 'done' : 'idle')
  }

  function regenerate() {
    if (!payload || !effectiveSelectedText || state === 'loading') return
    const latestIndex = messages.length - 1
    const shouldRemoveLatest = messages.at(-1)?.role === 'assistant' && latestIndex >= contextStartIndex
    const displayMessages = shouldRemoveLatest ? messages.slice(0, -1) : messages
    const conversation = getActiveContextMessages(displayMessages, contextStartIndex)
    if (payload.action.kind === 'chat' && conversation.length === 0) return
    setMessages(displayMessages)
    run(payload, conversation, { selectedText: effectiveSelectedText })
  }

  function clearContext() {
    if (!messages.length || contextStartIndex === messages.length || state === 'loading') return
    setContextStartIndex(messages.length)
    setDraft('')
    setError(null)
    setNotice('上下文已清空，之前的消息仍保留在当前会话中。')
  }

  function startNewConversation() {
    if (!payload || state === 'loading') return
    if (messages.length > 0 && !sessionPersisted && !window.confirm('当前会话尚未保存，确定开始新会话并放弃这些内容吗？')) return
    const now = new Date().toISOString()
    setMessages([])
    setStreaming('')
    streamingRef.current = ''
    setDraft('')
    setError(null)
    setNotice('已开始新会话。')
    setContextStartIndex(0)
    setSessionId(crypto.randomUUID())
    setSessionTitle(createSessionTitle(payload.selectedText, payload.action.label))
    setSessionCreatedAt(now)
    setSessionPersisted(false)
    setSessionSaveError('')
    persistRevisionRef.current += 1
    latestSessionRef.current = null
    skipPersistRef.current = true
    if (payload.action.kind === 'chat' || !effectiveSelectedText) setState('idle')
    else run(payload, [], { selectedText: effectiveSelectedText })
  }

  function retryLastRequest() {
    const activeRequest = activeRequestRef.current
    if (!activeRequest || state === 'loading') return
    if (activeRequest.phase === 'source-summary') setSourceStrategy('summarize')
    run(activeRequest.payload, activeRequest.conversation, {
      selectedText: activeRequest.selectedText,
      action: activeRequest.action,
      phase: activeRequest.phase,
      resumeAfterSummary: activeRequest.resumeAfterSummary
    })
  }

  function retrySessionSave() {
    const session = createSessionSnapshot(messages) ?? latestSessionRef.current
    if (session) persistSession(session)
  }

  async function copy() {
    const answer = activePhase === 'answer' ? streaming || latestAssistant(messages) : latestAssistant(messages)
    if (!answer) return
    await window.selectionAPI.copyText(answer)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const latestAnswer = activePhase === 'answer' ? streaming || latestAssistant(messages) : latestAssistant(messages)
  const composerDisabled = !payload || !effectiveSelectedText || state === 'loading'
  const canRegenerate = Boolean(
    payload && effectiveSelectedText && state !== 'loading' &&
    (payload.action.kind !== 'chat' || activeContextMessages.length > 0)
  )

  return (
    <div className="result-window">
      <header className="result-titlebar">
        <div className="result-title">
          <span className="mini-mark">{payload?.action.kind === 'chat' ? <MessageCircle size={14} /> : <Languages size={14} />}</span>
          <strong>{payload?.action.label ?? '划词助手'}</strong>
        </div>
        <div className="window-controls">
          <button onClick={() => window.selectionAPI.openSettings()} aria-label="设置" title="打开设置"><Settings size={15} /></button>
          <button onClick={() => window.selectionAPI.minimizeWindow()} aria-label="最小化" title="最小化"><Minus size={16} /></button>
          <button className="close" onClick={() => window.selectionAPI.closeWindow()} aria-label="关闭" title="关闭"><X size={16} /></button>
        </div>
      </header>

      <section className="source-strip">
        <div className="source-header">
          <span>原文 · {payload?.programName || '选中文本'}</span>
          {payload && (
            <div>
              <small>{payload.selectedText.length.toLocaleString()} 字符 · 约 {sourceTokenCount.toLocaleString()} tokens</small>
              <SpeechButton text={payload.selectedText} label="朗读原文" className="source-speech-button" />
              <button
                type="button"
                onClick={() => setSourceExpanded(!sourceExpanded)}
                aria-expanded={sourceExpanded}
                aria-controls="selected-source">
                {sourceExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {sourceExpanded ? '收起' : '查看'}
              </button>
            </div>
          )}
        </div>
        <p id="selected-source" className="expanded" hidden={!sourceExpanded}>{payload?.selectedText}</p>
        {sourceStrategy === 'truncate' && <em>当前请求使用截断后的 {effectiveSelectedText.length.toLocaleString()} 字符内容</em>}
        {sourceSummary && <em>当前请求使用模型压缩后的 {sourceSummary.length.toLocaleString()} 字符摘要</em>}
      </section>

      {sourceExceedsLimit && sourceStrategy === null && payload && (
        <section className="long-text-warning" role="alert">
          <CircleAlert size={17} />
          <div>
            <strong>选中文本超过 {payload.maxInputCharacters.toLocaleString()} 字符阈值</strong>
            <p>不会静默截断。请选择截断后处理，或先让模型压缩完整文本再继续。</p>
            <div>
              <button type="button" onClick={chooseTruncate}><Scissors size={14} />截断后处理</button>
              <button type="button" onClick={chooseSummarize}><Sparkles size={14} />先总结再处理</button>
            </div>
          </div>
        </section>
      )}

      <main className="result-content" ref={contentRef}>
        <div className="conversation">
          {payload?.action.kind === 'chat' && messages.length === 0 && state === 'idle' && sourceStrategy !== null && (
            <div className="conversation-empty"><MessageCircle size={20} /><span>等待提问</span></div>
          )}
          {messages.map((message, index) => (
            <Fragment key={`${message.role}-${index}`}>
              {index === contextStartIndex && contextStartIndex > 0 && <div className="context-divider">新上下文从这里开始</div>}
              <article className={`conversation-message ${message.role}`}>
                <span className="message-role">{message.role === 'user' ? '你' : '助手'}</span>
                <div className="message-text">
                  {message.role === 'assistant' ? <MarkdownContent content={message.content} /> : message.content}
                </div>
              </article>
            </Fragment>
          ))}
          {messages.length > 0 && contextStartIndex === messages.length && <div className="context-divider">上下文已清空，下一条消息将开始新上下文</div>}
          {state === 'loading' && activePhase === 'source-summary' && (
            <div className="result-loading" role="status" aria-live="polite"><LoaderCircle className="spin" size={20} /><span>正在压缩长文本{streaming ? ` · 已生成 ${streaming.length.toLocaleString()} 字符` : ''}</span></div>
          )}
          {state === 'loading' && activePhase === 'answer' && !streaming && (
            <div className="result-loading" role="status" aria-live="polite"><LoaderCircle className="spin" size={20} /><span>正在思考</span></div>
          )}
          {streaming && activePhase === 'answer' && (
            <article className="conversation-message assistant streaming">
              <span className="message-role">助手</span>
              <div className="message-text">{streaming}<span className="stream-caret" /></div>
            </article>
          )}
          {error && (
            <div className="error-panel" role="alert">
              <CircleAlert size={17} />
              <div>
                <strong>{error.title}</strong>
                <p>{error.message}</p>
                <div className="error-actions">
                  {error.canRetry && <button type="button" onClick={retryLastRequest}><RefreshCw size={14} />重试</button>}
                  {error.openSettings && <button type="button" onClick={() => window.selectionAPI.openSettings('model')}><Settings size={14} />模型设置</button>}
                </div>
              </div>
            </div>
          )}
          {notice && <div className="request-notice" role="status">{notice}</div>}
        </div>
      </main>

      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendQuestion() }}>
        <div className="composer-input">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={payload?.action.kind === 'chat' ? '询问这段文字...' : '继续追问...'}
            maxLength={COMPOSER_MAX_CHARACTERS}
            rows={1}
            disabled={composerDisabled}
            aria-label="会话问题"
          />
          <div className="composer-meta">
            <span>{draft.length.toLocaleString()} 字符 · 约 {draftTokenCount.toLocaleString()} tokens</span>
            <span className="context-usage" title={`本次上下文 ${requestCharacters.toLocaleString()} 字符，约 ${requestTokens.toLocaleString()} tokens`}>
              上下文 {historyUsage.messages.length} 条 · 约 {requestTokens.toLocaleString()} tokens
            </span>
            {historyUsage.omittedMessages > 0 && <strong>将省略较早的 {historyUsage.omittedMessages} 条消息</strong>}
          </div>
        </div>
        {state === 'loading' ? (
          <button className="composer-button stop" type="button" onClick={stop} aria-label="停止生成" title="停止生成"><Square size={14} /></button>
        ) : (
          <button className="composer-button" type="submit" disabled={composerDisabled || !draft.trim()} aria-label="发送问题" title="发送问题"><SendHorizontal size={17} /></button>
        )}
      </form>

      <footer className="result-footer">
        <div className="result-session-meta">
          <span>{payload?.model ?? ''}</span>
          {historyActive && sessionSaveError ? (
            <button className="session-save-retry" type="button" onClick={retrySessionSave} title={sessionSaveError}>保存失败，点击重试</button>
          ) : (
            <em>{historyActive ? sessionPersisted ? '历史已保存' : '正在保存' : '历史关闭'}</em>
          )}
        </div>
        <div className="result-footer-actions">
          <button className="session-command" type="button" onClick={startNewConversation} disabled={!payload || state === 'loading'} title="开始新会话"><MessageSquarePlus size={14} />新会话</button>
          <button className="session-command" type="button" onClick={clearContext} disabled={!messages.length || contextStartIndex === messages.length || state === 'loading'} title="清空当前会话上下文"><Eraser size={14} />清上下文</button>
          <button className="result-action" onClick={regenerate} disabled={!canRegenerate} aria-label="重新生成" title="重新生成"><RefreshCw size={16} /></button>
          <button className="result-action" onClick={() => void copy()} disabled={!latestAnswer} aria-label="复制最近回答" title="复制最近回答">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
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

function fallbackError(message: string): AIErrorInfo {
  return {
    kind: 'unknown',
    title: '请求失败',
    message,
    canRetry: true,
    openSettings: false
  }
}

function readableSessionError(error: unknown): string {
  const message = error instanceof Error ? error.message : '会话保存失败'
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}
