import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve('src/renderer/src/styles.css'), 'utf8')

interface OklchColor {
  lightness: number
  chroma: number
  hue: number
}

function themeBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  if (!match) throw new Error(`缺少主题：${selector}`)
  return match[1]
}

function token(block: string, name: string): OklchColor {
  const match = block.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`))
  if (!match) throw new Error(`缺少颜色变量：${name}`)
  return {
    lightness: Number(match[1]) / 100,
    chroma: Number(match[2]),
    hue: Number(match[3])
  }
}

function relativeLuminance(color: OklchColor): number {
  const hue = color.hue * Math.PI / 180
  const a = color.chroma * Math.cos(hue)
  const b = color.chroma * Math.sin(hue)
  const light = color.lightness + 0.3963377774 * a + 0.2158037573 * b
  const medium = color.lightness - 0.1055613458 * a - 0.0638541728 * b
  const short = color.lightness - 0.0894841775 * a - 1.291485548 * b
  const linearLight = light ** 3
  const linearMedium = medium ** 3
  const linearShort = short ** 3
  const red = clamp(4.0767416621 * linearLight - 3.3077115913 * linearMedium + 0.2309699292 * linearShort)
  const green = clamp(-1.2684380046 * linearLight + 2.6097574011 * linearMedium - 0.3413193965 * linearShort)
  const blue = clamp(-0.0041960863 * linearLight - 0.7034186147 * linearMedium + 1.707614701 * linearShort)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function contrast(foreground: OklchColor, background: OklchColor): number {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

describe.each([
  ['浅色', ':root'],
  ['深色', ':root[data-theme="dark"]']
])('%s主题对比度', (_name, selector) => {
  const block = themeBlock(selector)

  it('辅助文字达到 4.5:1', () => {
    expect(contrast(token(block, 'subtle'), token(block, 'surface'))).toBeGreaterThanOrEqual(4.5)
  })

  it('重要控件边界达到 3:1', () => {
    expect(contrast(token(block, 'line-strong'), token(block, 'surface'))).toBeGreaterThanOrEqual(3)
  })

  it('主按钮文字达到 4.5:1', () => {
    expect(contrast(token(block, 'on-accent'), token(block, 'accent'))).toBeGreaterThanOrEqual(4.5)
  })
})
