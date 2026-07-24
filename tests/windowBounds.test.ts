import { describe, expect, it } from 'vitest'
import { fitWindowBoundsToArea } from '../src/shared/windowBounds'

describe('result window bounds', () => {
  it('restores an off-screen window inside the active work area', () => {
    expect(fitWindowBoundsToArea(
      { x: 4200, y: -900, width: 560, height: 600 },
      { x: 0, y: 0, width: 1920, height: 1040 }
    )).toEqual({ x: 1352, y: 8, width: 560, height: 600 })
  })

  it('shrinks oversized bounds while respecting minimum dimensions', () => {
    expect(fitWindowBoundsToArea(
      { x: -200, y: -100, width: 2600, height: 1600 },
      { x: -1280, y: 0, width: 1280, height: 720 }
    )).toEqual({ x: -1272, y: 8, width: 1264, height: 704 })
  })

  it('keeps valid DIP bounds unchanged across scale factors', () => {
    const bounds = { x: 160, y: 120, width: 560, height: 600 }
    const area = { x: 0, y: 0, width: 1536, height: 824 }

    for (const scaleFactor of [1, 1.25, 1.5, 2]) {
      expect(fitWindowBoundsToArea(bounds, area, scaleFactor)).toEqual(bounds)
    }
  })
})
