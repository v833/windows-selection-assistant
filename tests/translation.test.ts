import { describe, expect, it } from 'vitest'
import { isInitialAssistantMessage, splitTranslationSections } from '../src/renderer/src/views/ResultApp'
import type { AIConversationMessage } from '../src/shared/types'

describe('translation result sections', () => {
  it('separates reverse translation output and assigns language labels', () => {
    const sections = splitTranslationSections(
      '### 译文\n你好\n\n### 回译\nHello\n\n### 差异说明\n语气一致。',
      true,
      '简体中文',
      '英语'
    )

    expect(sections.map(({ title, language, content }) => ({ title, language, content }))).toEqual([
      { title: '译文', language: '简体中文', content: '你好' },
      { title: '回译', language: '英语', content: 'Hello' },
      { title: '差异说明', language: '说明', content: '语气一致。' }
    ])
  })

  it('keeps direct translation as a single independent result section', () => {
    expect(splitTranslationSections('Bonjour', false, '简体中文', '法语')).toEqual([
      expect.objectContaining({ title: '译文', language: '简体中文', content: 'Bonjour' })
    ])
  })

  it('only treats the first assistant message as the initial translation result', () => {
    const messages: AIConversationMessage[] = [
      { role: 'assistant', content: '译文' },
      { role: 'user', content: '为什么这样翻译？' },
      { role: 'assistant', content: '这是对原回答的解释。' }
    ]

    expect(isInitialAssistantMessage(messages, 0)).toBe(true)
    expect(isInitialAssistantMessage(messages, 2)).toBe(false)
  })
})
