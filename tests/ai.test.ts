import { describe, expect, it } from 'vitest'
import { buildChatCompletionsUrl, buildMessages } from '../src/main/ai'

describe('AI request helpers', () => {
  it('appends the chat completions path to an OpenAI-compatible base URL', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions')
    expect(buildChatCompletionsUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1/chat/completions')
    expect(buildChatCompletionsUrl('https://example.com/custom/chat/completions')).toBe('https://example.com/custom/chat/completions')
  })

  it('builds the translation prompt with the selected target language', () => {
    const messages = buildMessages({ id: 'translate', label: '翻译', kind: 'translate', enabled: true }, 'Hello', '日语')
    expect(messages[0].content).toContain('日语')
    expect(messages[1].content).toBe('Hello')
  })

  it('keeps custom instructions and selected text together', () => {
    const messages = buildMessages(
      { id: 'custom', label: '提取', kind: 'custom', enabled: true, prompt: '提取所有日期' },
      '会议在周五举行',
      '简体中文'
    )
    expect(messages[1].content).toContain('提取所有日期')
    expect(messages[1].content).toContain('会议在周五举行')
  })
})
