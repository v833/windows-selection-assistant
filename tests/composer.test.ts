import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { shouldSubmitComposer } from '../src/shared/composer'
import { ResultApp } from '../src/renderer/src/views/ResultApp'

describe('composer keyboard behavior', () => {
  it('submits plain Enter but preserves multiline and IME composition', () => {
    expect(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true)
    expect(shouldSubmitComposer({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false)
    expect(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
    expect(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 })).toBe(false)
  })

  it('keeps the conversation input bounded', () => {
    const html = renderToStaticMarkup(createElement(ResultApp))

    expect(html).toMatch(/maxlength="4000"/i)
  })
})
