import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_INPUT_CHARACTERS,
  estimateTokenCount,
  normalizeMaxInputCharacters,
  trimConversationForRequest,
  truncateText
} from '../src/shared/textLimits'

describe('long text helpers', () => {
  it('normalizes the configured character limit', () => {
    expect(normalizeMaxInputCharacters(undefined)).toBe(DEFAULT_MAX_INPUT_CHARACTERS)
    expect(normalizeMaxInputCharacters(20)).toBe(1000)
    expect(normalizeMaxInputCharacters(500000)).toBe(200000)
  })

  it('estimates English and Chinese tokens without reporting zero', () => {
    expect(estimateTokenCount('')).toBe(0)
    expect(estimateTokenCount('abcdefgh')).toBe(2)
    expect(estimateTokenCount('你好世界')).toBe(5)
  })

  it('truncates explicitly and keeps the sent text within the limit', () => {
    const result = truncateText('a'.repeat(100), 40)

    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(40)
    expect(result.text).toContain('[内容已截断]')
    expect(result.omittedCharacters).toBeGreaterThan(0)
  })

  it('reports omitted conversation messages instead of trimming silently', () => {
    const conversation = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `消息 ${index}`
    }))
    const result = trimConversationForRequest(conversation)

    expect(result.messages.length).toBeLessThanOrEqual(16)
    expect(result.omittedMessages).toBe(conversation.length - result.messages.length)
    expect(result.omittedMessages).toBeGreaterThan(0)
  })
})
