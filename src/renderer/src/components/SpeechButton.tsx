import { CircleAlert, LoaderCircle, Square, Volume2 } from 'lucide-react'
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { cleanSpeechText } from '../../../shared/speech'
import type { SpeechSegment, SpeechStatus } from '../../../shared/types'

const SpeechStatusContext = createContext<SpeechStatus>({ state: 'idle' })

export function SpeechStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SpeechStatus>({ state: 'idle' })

  useEffect(() => {
    const unsubscribe = window.selectionAPI.onSpeechStatusChanged(setStatus)
    void window.selectionAPI.getSpeechStatus().then(setStatus)
    return unsubscribe
  }, [])

  return <SpeechStatusContext.Provider value={status}>{children}</SpeechStatusContext.Provider>
}

export function SpeechButton({ segment, className = '' }: {
  segment: SpeechSegment
  className?: string
}) {
  const speechId = useId()
  const status = useContext(SpeechStatusContext)
  const speechText = cleanSpeechText(segment.text)

  if (!speechText) return null

  const isCurrent = status.speechId === speechId
  const isBusy = isCurrent && (status.state === 'starting' || status.state === 'speaking')
  const hasError = isCurrent && status.state === 'error'
  const label = segment.label
  const title = hasError
    ? `朗读失败：${status.message ?? '语音引擎不可用'}。点击打开朗读设置`
    : isBusy ? `停止${label}` : label

  function handleClick() {
    if (hasError) {
      window.selectionAPI.openSettings('general')
      return
    }
    if (isBusy) window.selectionAPI.stopSpeaking()
    else window.selectionAPI.speakText(speechText, speechId, segment.culture)
  }

  return (
    <button
      className={`speech-button ${hasError ? 'error' : ''} ${className}`.trim()}
      type="button"
      onClick={handleClick}
      aria-label={title}
      title={title}
      data-speech-segment={segment.id}
      data-speech-kind={segment.kind}>
      {hasError ? <CircleAlert size={13} /> : isBusy ? <Square size={12} /> : <Volume2 size={14} />}
      <span className="speech-status" aria-live="polite">{status.state === 'starting' && isCurrent ? <LoaderCircle className="spin" size={12} /> : null}</span>
    </button>
  )
}
