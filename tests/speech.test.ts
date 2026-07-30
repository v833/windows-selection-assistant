import { describe, expect, it } from 'vitest'
import { MAX_SPEECH_CHARACTERS, prepareSpeechText, speechCulture } from '../src/main/speech'
import { cleanSpeechText } from '../src/shared/speech'

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
})
