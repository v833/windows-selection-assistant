import { useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export function PdfApp() {
  useEffect(() => {
    const unsubscribe = window.selectionAPI.onPdfRender(async (payload) => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: payload.data })
        const pdf = await loadingTask.promise
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber)
          const viewport = page.getViewport({ scale: payload.dpi / 72 })
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.floor(viewport.width))
          canvas.height = Math.max(1, Math.floor(viewport.height))
          const context = canvas.getContext('2d', { alpha: false })
          if (!context) throw new Error('无法创建画布')
          await page.render({ canvasContext: context, viewport, canvas }).promise
          const dataUrl = canvas.toDataURL('image/png')
          window.selectionAPI.sendPdfPage(payload.id, pageNumber - 1, dataUrl)
          page.cleanup()
          canvas.width = 0
          canvas.height = 0
        }
        await loadingTask.destroy()
        window.selectionAPI.finishPdf(payload.id)
      } catch (error) {
        window.selectionAPI.failPdf(payload.id, error instanceof Error ? error.message : String(error))
      }
    })
    window.selectionAPI.pdfReady()
    return unsubscribe
  }, [])
  return null
}
