import { describe, expect, it } from 'vitest'
import { MAX_SPEECH_CHARACTERS, prepareSpeechText, speechCulture } from '../src/main/speech'
import {
  cleanSpeechText,
  createSpeechSegment,
  detectLanguageLabel,
  detectSpeechCulture,
  resolveSpeechCulture
} from '../src/shared/speech'

describe('Windows local speech', () => {
  it('trims selected text and limits very long speech', () => {
    expect(prepareSpeechText('  测试文本  ')).toBe('测试文本')

    const prepared = prepareSpeechText('a'.repeat(MAX_SPEECH_CHARACTERS + 20))
    expect(prepared).toHaveLength(MAX_SPEECH_CHARACTERS)
    expect(prepared.endsWith('...')).toBe(true)
  })

  it('prefers Chinese voice for Chinese text and English otherwise', () => {
    expect(speechCulture('划词朗读')).toBe('zh-CN')
    expect(speechCulture('Selection assistant')).toBe('en-US')
  })

  it('cleans Markdown, links, code and phonetic notation before speaking', () => {
    const text = cleanSpeechText('# TypeScript /ˈtaɪpˌskrɪpt/\n\n[文档](https://example.com)\n\n```ts\nconst value = 1\n```')

    expect(text).toContain('TypeScript')
    expect(text).toContain('文档')
    expect(text).not.toContain('https://example.com')
    expect(text).not.toContain('const value')
    expect(text).not.toContain('/ˈtaɪp')
  })

  it('creates typed speech segments with stable identity and language labels', () => {
    const segment = createSpeechSegment('translation', 'Hello', '朗读译文', '英语', 'translation-0')

    expect(segment).toMatchObject({
      id: 'translation-0-translation-42628b2',
      text: 'Hello',
      label: '朗读译文',
      kind: 'translation',
      language: '英语'
    })
    expect(detectLanguageLabel('Hello')).toBe('英语')
    expect(detectLanguageLabel('你好')).toBe('中文')
    expect(detectLanguageLabel('こんにちは')).toBe('日语')
    expect(detectLanguageLabel('한국어')).toBe('韩语')
    expect(detectSpeechCulture('こんにちは')).toBe('ja-JP')
    expect(resolveSpeechCulture('简体中文', '123')).toBe('zh-CN')
    expect(segment.culture).toBe('en-US')
  })
})
