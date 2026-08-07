import { desktopCapturer, screen, type Display, type NativeImage } from 'electron'
import { createEngine, type OcrEngine } from '@arcships/light-ocr'

export interface OcrRecognizedLine {
  text: string
  confidence: number
}

export class OcrService {
  private enginePromise: Promise<OcrEngine> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  async recognize(image: Buffer): Promise<OcrRecognizedLine[]> {
    const run = async (): Promise<OcrRecognizedLine[]> => {
      const engine = await this.getEngine()
      const result = await engine.recognizeEncoded(new Uint8Array(image))
      return result.lines.map((line) => ({ text: line.text, confidence: line.confidence }))
    }
    return this.enqueue(run)
  }

  /** 串行执行推理：onnxruntime 拒绝并发调用，截图取词与 PDF 取词同时触发时排队而非报错。 */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task)
    this.queue = next.catch(() => undefined)
    return next
  }

  async dispose(): Promise<void> {
    const engine = this.enginePromise
    this.enginePromise = null
    this.queue = Promise.resolve()
    if (!engine) return
    await engine.catch(() => null).then((instance) => instance?.close().catch(() => undefined))
  }

  private getEngine(): Promise<OcrEngine> {
    this.enginePromise ??= createEngine()
    return this.enginePromise
  }
}

export async function captureDisplayImage(display: Display): Promise<NativeImage> {
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  }
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize,
    fetchWindowIcons: false
  })
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
  if (!source) throw new Error('无法获取屏幕截图')
  if (source.thumbnail.isEmpty()) throw new Error('屏幕截图内容为空')
  return source.thumbnail
}

export function cursorDisplay(): Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}
