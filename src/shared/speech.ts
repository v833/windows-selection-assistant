import type { SpeechCulture, SpeechSegment, SpeechSegmentKind } from './types'

const PHONETIC_MARKS = /[ˈˌəɑɐɛɪɔʊʌɜɞɒɹʃʒθðŋː]/

function removePhoneticNotation(text: string): string {
  return text.replace(/\/[^\/\r\n]{1,80}\/|\[[^\]\r\n]{1,80}\]/g, (candidate) => (
    PHONETIC_MARKS.test(candidate) ? ' ' : candidate
  ))
}

export function cleanSpeechText(text: string): string {
  const withoutCode = text.replace(/```[\s\S]*?```/g, ' ')
  const lines = withoutCode.split(/\r?\n/).map((line) => {
    const withoutTableDivider = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line) ? '' : line
    return withoutTableDivider
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/[`*_~]/g, '')
      .replace(/[|]/g, '；')
  })

  return removePhoneticNotation(lines.join('。 '))
    .replace(/\s+/g, ' ')
    .replace(/(?:。\s*){2,}/g, '。 ')
    .trim()
}

export function createSpeechSegment(
  kind: SpeechSegmentKind,
  text: string,
  label: string,
  language?: string,
  idPrefix = '',
  culture?: SpeechCulture
): SpeechSegment {
  const normalized = text.trim()
  let hash = 0
  for (const character of normalized) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return {
    id: `${idPrefix ? `${idPrefix}-` : ''}${kind}-${hash.toString(16)}`,
    text,
    label,
    kind,
    ...(language ? { language } : {}),
    culture: culture ?? detectSpeechCulture(normalized)
  }
}

export function detectLanguageLabel(text: string): string {
  if (/[ぁ-んァ-ン]/u.test(text)) return '日语'
  if (/\p{Script=Hangul}/u.test(text)) return '韩语'
  if (/\p{Script=Han}/u.test(text)) return '中文'
  if (/[A-Za-z]/.test(text)) return '英语'
  return '自动识别'
}

export function detectSpeechCulture(text: string): SpeechCulture {
  if (/[ぁ-んァ-ン]/u.test(text)) return 'ja-JP'
  if (/\p{Script=Hangul}/u.test(text)) return 'ko-KR'
  if (/\p{Script=Han}/u.test(text)) return 'zh-CN'
  return 'en-US'
}

export function resolveSpeechCulture(language: string | undefined, text: string): SpeechCulture {
  if (language && /日语|日文|Japanese|\bja\b/i.test(language)) return 'ja-JP'
  if (language && /韩语|韩文|Korean|\bko\b/i.test(language)) return 'ko-KR'
  if (language && /中文|汉语|Chinese|\bzh(?:-CN)?\b/i.test(language)) return 'zh-CN'
  if (language && /英语|英文|English|\ben\b/i.test(language)) return 'en-US'
  return detectSpeechCulture(text)
}

export function isSpeechCulture(value: unknown): value is SpeechCulture {
  return value === 'zh-CN' || value === 'en-US' || value === 'ja-JP' || value === 'ko-KR'
}
