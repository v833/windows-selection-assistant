import { beforeEach, describe, expect, it, vi } from 'vitest'

const engineState = vi.hoisted(() => ({
  active: 0,
  maxActive: 0,
  close: vi.fn(async () => undefined),
  recognizeEncoded: vi.fn()
}))

vi.mock('electron', () => ({
  desktopCapturer: { getSources: vi.fn() },
  screen: {
    getDisplayNearestPoint: () => ({ bounds: { x: 0, y: 0 }, scaleFactor: 1 }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 })
  }
}))

vi.mock('@arcships/light-ocr', () => ({
  createEngine: vi.fn(async () => ({
    info: { modelBundleId: 'test' },
    recognizeEncoded: engineState.recognizeEncoded,
    close: engineState.close
  }))
}))

import { OcrService } from '../src/main/ocr'

describe('OcrService', () => {
  beforeEach(() => {
    engineState.active = 0
    engineState.maxActive = 0
    engineState.recognizeEncoded.mockReset()
  })

  it('serializes concurrent recognition so onnxruntime is never called in parallel', async () => {
    engineState.recognizeEncoded.mockImplementation(async () => {
      engineState.active += 1
      engineState.maxActive = Math.max(engineState.maxActive, engineState.active)
      await new Promise((resolve) => setTimeout(resolve, 20))
      engineState.active -= 1
      return { lines: [] }
    })
    const service = new OcrService()

    const results = await Promise.all([
      service.recognize(Buffer.from('a')),
      service.recognize(Buffer.from('b')),
      service.recognize(Buffer.from('c'))
    ])

    expect(engineState.maxActive).toBe(1)
    expect(engineState.recognizeEncoded).toHaveBeenCalledTimes(3)
    expect(results).toHaveLength(3)
  })

  it('keeps queued recognition running even after an earlier call fails', async () => {
    engineState.recognizeEncoded
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ lines: [{ text: 'ok', confidence: 1 }] })

    const service = new OcrService()
    await expect(service.recognize(Buffer.from('a'))).rejects.toThrow('boom')
    await expect(service.recognize(Buffer.from('b'))).resolves.toEqual([{ text: 'ok', confidence: 1 }])
  })
})
