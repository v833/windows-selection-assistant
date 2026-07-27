import type { SelectionAction } from './types'

export const MAX_PINNED_ACTIONS = 6
export const MAX_RECENT_ACTIONS = 5

export interface ActionMenuSection {
  label: string
  actions: SelectionAction[]
}

const actionMenuSectionLabels: Record<SelectionAction['kind'], string> = {
  chat: '阅读与理解',
  translate: '阅读与理解',
  explain: '阅读与理解',
  summarize: '阅读与理解',
  rewrite: '写作与回复',
  writing: '写作与回复',
  extract: '提取与分析',
  analysis: '提取与分析',
  code: '代码工具',
  custom: '自定义动作'
}

export function groupActionsForMenu(actions: SelectionAction[]): ActionMenuSection[] {
  return actions.reduce<ActionMenuSection[]>((sections, action) => {
    const label = actionMenuSectionLabels[action.kind]
    const current = sections.at(-1)
    if (current?.label === label) current.actions.push(action)
    else sections.push({ label, actions: [action] })
    return sections
  }, [])
}

export function splitToolbarActions(actions: SelectionAction[]): {
  pinned: SelectionAction[]
  overflow: SelectionAction[]
} {
  const enabled = actions.filter(
    (action) => action.enabled && (!action.variants || action.variants.some((variant) => variant.enabled))
  )
  const pinned = enabled.filter((action) => action.pinned).slice(0, MAX_PINNED_ACTIONS)
  const pinnedIds = new Set(pinned.map((action) => action.id))
  return { pinned, overflow: enabled.filter((action) => !pinnedIds.has(action.id)) }
}

export function limitPinnedActions(actions: SelectionAction[]): SelectionAction[] {
  let pinnedCount = 0
  return actions.map((action) => {
    const pinned = Boolean(action.pinned) && pinnedCount < MAX_PINNED_ACTIONS
    if (pinned) pinnedCount += 1
    return { ...action, pinned }
  })
}

export function moveAction(actions: SelectionAction[], actionId: string, direction: -1 | 1): SelectionAction[] {
  const sourceIndex = actions.findIndex((action) => action.id === actionId)
  const targetIndex = sourceIndex + direction
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= actions.length) return actions

  const moved = [...actions]
  ;[moved[sourceIndex], moved[targetIndex]] = [moved[targetIndex], moved[sourceIndex]]
  return moved
}

export function recordRecentAction(
  recentActionIds: string[],
  actionId: string,
  limit = MAX_RECENT_ACTIONS
): string[] {
  return [actionId, ...recentActionIds.filter((id) => id !== actionId)].slice(0, Math.max(0, limit))
}

export function sanitizeRecentActionIds(
  value: unknown,
  actions: SelectionAction[],
  limit = MAX_RECENT_ACTIONS
): string[] {
  if (!Array.isArray(value)) return []
  const overflowIds = new Set(splitToolbarActions(actions).overflow.map((action) => action.id))
  return [...new Set(value.map(String))]
    .filter((id) => overflowIds.has(id))
    .slice(0, Math.max(0, limit))
}

const modifierAliases: Record<string, string> = {
  alt: 'Alt',
  command: 'Super',
  commandorcontrol: 'Ctrl',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  meta: 'Super',
  shift: 'Shift',
  super: 'Super',
  win: 'Super'
}

const namedKeys: Record<string, string> = {
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  arrowup: 'Up',
  backspace: 'Backspace',
  comma: ',',
  delete: 'Delete',
  down: 'Down',
  end: 'End',
  enter: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  home: 'Home',
  insert: 'Insert',
  left: 'Left',
  pagedown: 'PageDown',
  pageup: 'PageUp',
  period: '.',
  right: 'Right',
  space: 'Space',
  tab: 'Tab',
  up: 'Up'
}

export function normalizeShortcut(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  const modifiers = new Set<string>()
  let key = ''

  for (const part of parts) {
    const normalized = part.toLowerCase().replaceAll(' ', '')
    const modifier = modifierAliases[normalized]
    if (modifier) {
      modifiers.add(modifier)
      continue
    }
    if (key) return null
    if (/^[a-z0-9]$/i.test(part)) key = part.toUpperCase()
    else if (/^f(?:[1-9]|1\d|2[0-4])$/i.test(part)) key = part.toUpperCase()
    else key = namedKeys[normalized] ?? ''
    if (!key) return null
  }

  if (!key || ![...modifiers].some((modifier) => modifier === 'Ctrl' || modifier === 'Alt' || modifier === 'Super')) {
    return null
  }
  const ordered = ['Ctrl', 'Alt', 'Shift', 'Super'].filter((modifier) => modifiers.has(modifier))
  return [...ordered, key].join('+')
}

export function validateActionShortcuts(actions: SelectionAction[]): string | null {
  const assigned = new Map<string, SelectionAction>()
  for (const action of actions) {
    if (!action.shortcut?.trim()) continue
    const shortcut = normalizeShortcut(action.shortcut)
    if (!shortcut) return `“${action.label}”的快捷键无效，请至少包含 Ctrl、Alt 或 Win 键`
    const existing = assigned.get(shortcut.toLowerCase())
    if (existing) return `快捷键 ${shortcut} 同时分配给“${existing.label}”和“${action.label}”`
    assigned.set(shortcut.toLowerCase(), action)
  }
  return null
}
