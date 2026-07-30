import { describe, expect, it } from 'vitest'
import {
  defaultActions,
  getEnabledActionVariants,
  isDictionaryCandidate,
  mergeDefaultActions,
  resolveActionVariant
} from '../src/shared/actions'
import type { SelectionAction } from '../src/shared/types'

describe('selection actions', () => {
  it('covers the issue #1 action library', () => {
    const kinds = defaultActions.map((action) => action.kind)
    const variantLabels = defaultActions.flatMap((action) => action.variants?.map((variant) => variant.label) ?? [])

    expect(kinds).toEqual(expect.arrayContaining(['speak', 'writing', 'extract', 'analysis', 'code']))
    expect(variantLabels).toEqual(expect.arrayContaining([
      '纠错',
      '精简为一句话',
      '精简为要点',
      '扩写',
      '正式语气',
      '礼貌语气',
      '口语表达',
      '专业语气',
      '营销文案',
      '回复助手',
      '文章标题',
      '邮件主题',
      '商品标题',
      '短视频标题',
      '日期时间',
      '人物组织',
      '地址地点',
      '待办事项',
      '关键词',
      '结构化 JSON',
      '术语解释',
      '观点分析',
      '解释代码',
      '查找问题',
      '添加注释',
      '转为 TypeScript',
      '反向翻译'
    ]))
  })

  it('defines representative prompts for every new category', () => {
    const prompt = (actionId: string, variantId: string) =>
      defaultActions.find((action) => action.id === actionId)?.variants?.find((variant) => variant.id === variantId)?.prompt

    expect(prompt('writing', 'proofread')).toContain('修改原因')
    expect(prompt('extract', 'json')).toContain('有效 JSON')
    expect(prompt('analysis', 'terminology')).toContain('读音')
    expect(prompt('analysis', 'viewpoint')).toContain('隐含假设')
    expect(prompt('code', 'diagnose')).toContain('安全风险')
    expect(prompt('translate', 'back-translation')).toContain('回译')
  })

  it('migrates an old action list without losing user choices', () => {
    const oldActions: SelectionAction[] = [
      { id: 'chat', label: '问答', kind: 'chat', enabled: false },
      { id: 'translate', label: '翻译', kind: 'translate', enabled: true },
      { id: 'custom-old', label: '旧动作', kind: 'custom', enabled: true, prompt: '保留我' }
    ]

    const merged = mergeDefaultActions(oldActions)

    expect(merged.find((action) => action.id === 'chat')?.enabled).toBe(false)
    expect(merged.find((action) => action.id === 'chat')?.pinned).toBe(true)
    expect(merged.find((action) => action.id === 'speak')).toMatchObject({
      label: '朗读',
      kind: 'speak',
      enabled: true,
      pinned: true
    })
    expect(merged.find((action) => action.id === 'writing')?.pinned).toBe(false)
    expect(merged.find((action) => action.id === 'custom-old')?.prompt).toBe('保留我')
    expect(merged.find((action) => action.id === 'translate')?.variants).toHaveLength(2)
    expect(merged.find((action) => action.id === 'writing')).toBeDefined()
    expect(merged.find((action) => action.id === 'code')).toBeDefined()
    expect(merged.findIndex((action) => action.id === 'code')).toBeLessThan(
      merged.findIndex((action) => action.id === 'custom-old')
    )
  })

  it('refreshes built-in variant prompts while preserving enabled choices', () => {
    const translate = structuredClone(defaultActions.find((action) => action.id === 'translate'))
    if (!translate?.variants) throw new Error('translate action is missing variants')
    translate.variants[1].prompt = '旧版反向翻译要求'
    translate.variants[1].enabled = false

    const merged = mergeDefaultActions([translate])
    const reverse = merged.find((action) => action.id === 'translate')?.variants?.find((variant) => variant.id === 'back-translation')

    expect(reverse?.prompt).toContain('三级标题')
    expect(reverse?.enabled).toBe(false)
  })

  it('resolves only enabled action variants', () => {
    const writing = structuredClone(defaultActions.find((action) => action.id === 'writing'))
    if (!writing?.variants) throw new Error('writing action is missing variants')

    writing.variants[0].enabled = false
    expect(resolveActionVariant(writing, 'proofread')).toBeNull()

    writing.variants[0].enabled = true
    const resolved = resolveActionVariant(writing, 'proofread')
    expect(resolved).toMatchObject({ id: 'writing:proofread', label: '纠错', kind: 'writing' })
    expect(resolved?.prompt).toContain('错别字')
    expect(resolved?.variants).toBeUndefined()
  })

  it('returns a single enabled variant for direct execution', () => {
    const translate = structuredClone(defaultActions.find((action) => action.id === 'translate'))
    if (!translate?.variants) throw new Error('translate action is missing variants')

    translate.variants[1].enabled = false
    const variants = getEnabledActionVariants(translate)

    expect(variants.map((variant) => variant.id)).toEqual(['direct'])
    expect(resolveActionVariant(translate, variants[0].id)).toMatchObject({
      id: 'translate:direct',
      label: '直接翻译'
    })
  })

  it('recognizes short words but rejects sentences and long text', () => {
    expect(isDictionaryCandidate('TypeScript')).toBe(true)
    expect(isDictionaryCandidate('large language model')).toBe(true)
    expect(isDictionaryCandidate('大型语言模型')).toBe(true)
    expect(isDictionaryCandidate('这是一句完整的话。')).toBe(false)
    expect(isDictionaryCandidate('人工智能正在改变我们的工作方式')).toBe(false)
    expect(isDictionaryCandidate('one two three four five')).toBe(false)
  })
})
