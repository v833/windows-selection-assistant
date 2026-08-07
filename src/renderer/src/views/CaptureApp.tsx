import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { CaptureImagePayload, OcrCaptureRegion } from '../../../shared/types'

const MIN_SELECTION = 8

export function CaptureApp() {
  const [image, setImage] = useState<CaptureImagePayload | null>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubscribe = window.selectionAPI.onCaptureImage((payload) => {
      setImage(payload)
      setStart(null)
      setCurrent(null)
    })
    window.selectionAPI.captureReady()
    return unsubscribe
  }, [])

  const rect = useMemo<OcrCaptureRegion | null>(() => {
    if (!start || !current) return null
    return {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y)
    }
  }, [start, current])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        window.selectionAPI.cancelCapture()
        return
      }
      if (event.key === 'Enter' && rect && rect.width >= MIN_SELECTION && rect.height >= MIN_SELECTION) {
        window.selectionAPI.confirmCaptureRegion(rect)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rect])

  function localPoint(event: ReactMouseEvent): { x: number; y: number } {
    const bounds = surfaceRef.current?.getBoundingClientRect()
    return {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0)
    }
  }

  function handleMouseDown(event: ReactMouseEvent) {
    if (!image) return
    event.preventDefault()
    setStart(localPoint(event))
    setCurrent(localPoint(event))
  }

  function handleMouseMove(event: ReactMouseEvent) {
    if (!start) return
    setCurrent(localPoint(event))
  }

  function handleMouseUp() {
    if (rect && rect.width >= MIN_SELECTION && rect.height >= MIN_SELECTION) {
      window.selectionAPI.confirmCaptureRegion(rect)
    } else {
      setStart(null)
      setCurrent(null)
    }
  }

  if (!image) {
    return <div className="capture-loading" role="status">正在准备截图…</div>
  }

  return (
    <div
      ref={surfaceRef}
      className="capture-surface"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}>
      <img className="capture-image" src={image.dataUrl} alt="" draggable={false} />
      {rect && (
        <>
          <div className="capture-box" style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height
          }} />
          <span className="capture-size" style={{
            left: rect.x,
            top: Math.max(4, rect.y - 24)
          }}>
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </span>
        </>
      )}
      <div className="capture-hint">拖拽框选文字区域 · 松开确认 · Esc 取消</div>
    </div>
  )
}
