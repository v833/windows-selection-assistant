import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve('src/renderer/src/styles.css'), 'utf8')
const mainProcess = readFileSync(resolve('src/main/index.ts'), 'utf8')
const mainView = readFileSync(resolve('src/renderer/src/views/MainApp.tsx'), 'utf8')
const resultView = readFileSync(resolve('src/renderer/src/views/ResultApp.tsx'), 'utf8')

describe('界面视觉契约', () => {
  it('使用共享视觉变量覆盖核心状态', () => {
    for (const token of [
      '--bg:',
      '--surface:',
      '--ink:',
      '--muted:',
      '--line:',
      '--accent:',
      '--accent-soft:',
      '--danger:',
      '--shadow-toolbar:',
      '--shadow-window:'
    ]) {
      expect(styles).toContain(token)
    }
  })

  it('为交互与减少动画设置提供统一反馈', () => {
    expect(styles).toContain('button:focus-visible')
    expect(styles).toContain('button:active:not(:disabled)')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('为窄窗口提供结构化响应布局', () => {
    expect(mainProcess).toContain('minWidth: 680')
    expect(styles).toContain('@media (max-width: 700px)')
    expect(styles).toContain('.action-row { grid-template-columns: 1fr;')
    expect(styles).toContain('.sidebar { width: 72px;')
  })

  it('保持原文折叠、危险操作分离和统一原生提示', () => {
    expect(resultView).toContain('aria-controls="selected-source"')
    expect(resultView).toContain('hidden={!sourceExpanded}')
    expect(resultView).not.toContain('data-tooltip=')
    expect(mainView).toContain('className="history-danger-zone"')
    expect(mainView).toContain('title="删除动作"')
  })

  it('不引入被禁止的装饰模式', () => {
    expect(styles).not.toMatch(/linear-gradient|radial-gradient/i)
    expect(styles).not.toMatch(/border-(?:left|right):\s*[2-9]\d*px/i)
    expect(styles).not.toMatch(/#[f]{3,6}\b|#[0]{3,6}\b/i)
  })

  it('原生标题栏和菜单主题跟随应用主题', () => {
    expect(mainProcess).toContain('nativeTheme.themeSource = theme')
    expect(mainProcess).toContain("nativeTheme.on('updated', updateNativeWindowColors)")
    expect(mainProcess).toContain('mainWindow?.setTitleBarOverlay')
  })
})
