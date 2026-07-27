import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { TextSelectionData } from 'selection-hook'

const hookState = vi.hoisted(() => ({
  selection: null as TextSelectionData | null,
  handlers: {} as Record<string, (...args: unknown[]) => void>
}))

vi.mock('electron', () => ({
  screen: {
    screenToDipPoint: (point: { x: number; y: number }) => point,
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 })
  }
}))

vi.mock('selection-hook', () => {
  class MockSelectionHook {
    static FilterMode = { EXCLUDE_LIST: 2 }
    static INVALID_COORDINATE = -99999

    on(event: string, handler: (...args: unknown[]) => void): this {
      hookState.handlers[event] = handler
      return this
    }
    off(event: string): this {
      delete hookState.handlers[event]
      return this
    }
    start(): boolean { return true }
    stop(): void {}
    cleanup(): void {}
    getCurrentSelection(): TextSelectionData | null { return hookState.selection }
  }

  return { default: MockSelectionHook }
})

import { SelectionService } from '../src/main/selection'

function selection(text: string): TextSelectionData {
  const point = { x: 100, y: 100 }
  return {
    text,
    programName: 'Notepad',
    startTop: point,
    startBottom: point,
    endTop: point,
    endBottom: point,
    mousePosStart: point,
    mousePosEnd: point,
    method: 0,
    posLevel: 0
  }
}

describe('current selection lookup', () => {
  beforeEach(() => {
    hookState.selection = null
    hookState.handlers = {}
  })

  it('returns null instead of falling back to a previous selection', () => {
    const service = new SelectionService(() => null, vi.fn(), vi.fn())
    service.setEnabled(true)

    hookState.selection = selection('当前文本')
    expect(service.getCurrentSelection()?.text).toBe('当前文本')

    hookState.selection = null
    expect(service.getCurrentSelection()).toBeNull()
    service.cleanup()
  })

  it('does not hide the toolbar while a native action menu is open', () => {
    const hide = vi.fn()
    const window = {
      isVisible: () => true,
      isFocused: () => false,
      getBounds: () => ({ x: 0, y: 0, width: 80, height: 40 }),
      hide
    } as unknown as BrowserWindow
    const service = new SelectionService(() => window, vi.fn(), vi.fn())
    service.setEnabled(true)
    service.setMenuOpen(true)

    hookState.handlers['mouse-down']?.({ x: 200, y: 200 })
    hookState.handlers['mouse-wheel']?.()
    hookState.handlers['key-down']?.()

    expect(hide).not.toHaveBeenCalled()

    service.setMenuOpen(false)
    hookState.handlers['mouse-down']?.({ x: 200, y: 200 })

    expect(hide).toHaveBeenCalledOnce()
    service.cleanup()
  })
})
