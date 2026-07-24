import { describe, expect, it } from 'vitest'
import {
  MAX_PINNED_ACTIONS,
  limitPinnedActions,
  moveAction,
  normalizeShortcut,
  recordRecentAction,
  sanitizeRecentActionIds,
  splitToolbarActions,
  validateActionShortcuts
} from '../src/shared/toolbar'
import type { SelectionAction } from '../src/shared/types'

function action(index: number, patch: Partial<SelectionAction> = {}): SelectionAction {
  return {
    id: `action-${index}`,
    label: `动作 ${index}`,
    kind: 'custom',
    enabled: true,
    pinned: false,
    ...patch
  }
}

describe('toolbar actions', () => {
  it('keeps a 20-action toolbar within the pin limit', () => {
    const actions = Array.from({ length: 20 }, (_, index) => action(index, { pinned: index < 10 }))

    const { pinned, overflow } = splitToolbarActions(actions)

    expect(pinned).toHaveLength(MAX_PINNED_ACTIONS)
    expect(overflow).toHaveLength(14)
    expect([...pinned, ...overflow].map((item) => item.id)).toHaveLength(20)
  })

  it('caps persisted pin state during settings migration', () => {
    const actions = Array.from({ length: 8 }, (_, index) => action(index, { pinned: true }))

    expect(limitPinnedActions(actions).filter((item) => item.pinned)).toHaveLength(MAX_PINNED_ACTIONS)
  })

  it('preserves configured order while moving actions', () => {
    const actions = [action(1), action(2), action(3)]

    expect(moveAction(actions, 'action-2', -1).map((item) => item.id)).toEqual([
      'action-2',
      'action-1',
      'action-3'
    ])
    expect(moveAction(actions, 'action-1', -1)).toBe(actions)
  })

  it('keeps recent actions unique and most-recent first', () => {
    expect(recordRecentAction(['action-2', 'action-1'], 'action-1')).toEqual(['action-1', 'action-2'])
    expect(recordRecentAction(['action-4', 'action-3', 'action-2', 'action-1'], 'action-5', 4)).toEqual([
      'action-5',
      'action-4',
      'action-3',
      'action-2'
    ])
  })

  it('keeps only overflow actions in recent history before applying the limit', () => {
    const actions = [
      action(1, { pinned: true }),
      action(2),
      action(3),
      action(4, { enabled: false })
    ]

    expect(sanitizeRecentActionIds(
      ['action-1', 'action-2', 'action-3', 'action-4'],
      actions,
      2
    )).toEqual(['action-2', 'action-3'])
  })

  it('normalizes shortcuts and rejects duplicate assignments', () => {
    expect(normalizeShortcut(' control + alt + k ')).toBe('Ctrl+Alt+K')
    expect(normalizeShortcut('ctrl+shift+1')).toBe('Ctrl+Shift+1')
    expect(normalizeShortcut('K')).toBeNull()

    const actions = [
      action(1, { shortcut: 'Ctrl+Alt+K' }),
      action(2, { shortcut: 'control + alt + k' })
    ]
    expect(validateActionShortcuts(actions)).toContain('动作 1')
    expect(validateActionShortcuts(actions)).toContain('动作 2')
  })
})
