import type { AIConversationMessage } from './types'

export const DEFAULT_MAX_INPUT_CHARACTERS = 30_000
export const MIN_MAX_INPUT_CHARACTERS = 1_000
export const MAX_MAX_INPUT_CHARACTERS = 200_000
export const MAX_HISTORY_MESSAGES = 16
export const MAX_HISTORY_CHARACTERS = 24_000

export interface ConversationTrimResult {
  messages: AIConversationMessage[]
  omittedMessages: number
  characterCount: number
}

export interface TruncatedText {
  text: string
  truncated: boolean
  omittedCharacters: number
}

export function normalizeMaxInputCharacters(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_INPUT_CHARACTERS
  return Math.min(MAX_MAX_INPUT_CHARACTERS, Math.max(MIN_MAX_INPUT_CHARACTERS, Math.round(parsed)))
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0
  let cjkCharacters = 0
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      (codePoint >= 0x3400 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af)
    ) cjkCharacters += 1
  }
  const otherCharacters = Math.max(0, text.length - cjkCharacters)
  return Math.max(1, Math.ceil(cjkCharacters * 1.2 + otherCharacters / 4))
}

export function truncateText(text: string, limit: number): TruncatedText {
  const safeLimit = Math.max(1, Math.round(limit))
  if (text.length <= safeLimit) return { text, truncated: false, omittedCharacters: 0 }

  const marker = '\n\n[内容已截断]'
  const keptCharacters = Math.max(0, safeLimit - marker.length)
  return {
    text: `${text.slice(0, keptCharacters).trimEnd()}${marker}`,
    truncated: true,
    omittedCharacters: text.length - keptCharacters
  }
}

export function trimConversationForRequest(conversation: AIConversationMessage[]): ConversationTrimResult {
  const turns: AIConversationMessage[][] = []
  for (const message of conversation) {
    const currentTurn = turns.at(-1)
    if (message.role === 'user' || !currentTurn) turns.push([message])
    else currentTurn.push(message)
  }

  const selectedTurns: AIConversationMessage[][] = []
  let messageCount = 0
  let characterCount = 0
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    const turnCharacters = turn.reduce((total, message) => total + message.content.length, 0)
    if (
      selectedTurns.length > 0 &&
      (messageCount + turn.length > MAX_HISTORY_MESSAGES || characterCount + turnCharacters > MAX_HISTORY_CHARACTERS)
    ) break
    selectedTurns.unshift(turn)
    messageCount += turn.length
    characterCount += turnCharacters
  }

  const messages = selectedTurns.flat()
  return {
    messages,
    omittedMessages: Math.max(0, conversation.length - messages.length),
    characterCount
  }
}
