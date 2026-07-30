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
