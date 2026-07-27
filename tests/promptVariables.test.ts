import { describe, expect, it } from 'vitest'
import {
  getUnknownPromptVariables,
  hasPromptVariable,
  renderPromptTemplate,
  validatePromptVariables
} from '../src/shared/promptVariables'

const values = {
  text: '选中文本',
  language: '英语',
  program: 'Word.exe',
  question: '为什么？'
}

describe('prompt variables', () => {
  it('renders all supported variables', () => {
    expect(renderPromptTemplate('{text}|{language}|{program}|{question}', values))
      .toBe('选中文本|英语|Word.exe|为什么？')
  })

  it('renders double braces as literal placeholders', () => {
    expect(renderPromptTemplate('{{text}} / {text}', values)).toBe('{text} / 选中文本')
    expect(hasPromptVariable('{{text}}', 'text')).toBe(false)
  })

  it('reports each unknown variable once and ignores escaped variables', () => {
    expect(getUnknownPromptVariables('{unknown} {unknown} {{literal}} {text}')).toEqual(['unknown'])
    expect(() => validatePromptVariables('{unknown}')).toThrow('未知提示词变量：{unknown}')
  })
})
