import { CircleAlert, LoaderCircle, Square, Volume2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { cleanSpeechText } from '../../../shared/speech'
import type { SpeechStatus } from '../../../shared/types'

export function SpeechButton({ text, label, className = '' }: {
  text: string
  label: string
  className?: string
}) {
  const speechId = useId()
  const [status, setStatus] = useState<SpeechStatus>({ state: 'idle' })
  const speechText = cleanSpeechText(text)

  useEffect(() => {
    const unsubscribe = window.selectionAPI.onSpeechStatusChanged(setStatus)
    void window.selectionAPI.getSpeechStatus().then(setStatus)
    return unsubscribe
  }, [])

  if (!speechText) return null

  const isCurrent = status.speechId === speechId
  const isBusy = isCurrent && (status.state === 'starting' || status.state === 'speaking')
  const hasError = isCurrent && status.state === 'error'
  const title = hasError
    ? `朗读失败：${status.message ?? '语音引擎不可用'}。点击打开朗读设置`
    : isBusy ? `停止${label}` : label

  function handleClick() {
    if (hasError) {
      window.selectionAPI.openSettings('general')
      return
    }
    if (isBusy) window.selectionAPI.stopSpeaking()
    else window.selectionAPI.speakText(speechText, speechId)
  }

  return (
    <button
      className={`speech-button ${hasError ? 'error' : ''} ${className}`.trim()}
      type="button"
      onClick={handleClick}
      aria-label={title}
      title={title}>
      {hasError ? <CircleAlert size={13} /> : isBusy ? <Square size={12} /> : <Volume2 size={14} />}
      <span className="speech-status" aria-live="polite">{status.state === 'starting' && isCurrent ? <LoaderCircle className="spin" size={12} /> : null}</span>
    </button>
  )
}
