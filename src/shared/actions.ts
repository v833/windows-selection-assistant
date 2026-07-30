import type { ActionVariant, SelectionAction } from './types'

function variant(id: string, label: string, prompt: string): ActionVariant {
  return { id, label, prompt, enabled: true }
}

export const defaultActions: SelectionAction[] = [
  { id: 'chat', label: '问答', kind: 'chat', enabled: true, pinned: true },
  {
    id: 'translate',
    label: '翻译',
    kind: 'translate',
    enabled: true,
    pinned: true,
    variants: [
      variant('direct', '直接翻译', '翻译为目标语言，只输出译文并保留原有格式。'),
      variant('back-translation', '反向翻译', '先翻译为目标语言，再将译文回译为原文语言。按“译文、回译、差异说明”三个部分输出，并分别使用“译文”“回译”“差异说明”三级标题。')
    ]
  },
  { id: 'speak', label: '朗读', kind: 'speak', enabled: true, pinned: true },
  { id: 'explain', label: '解释', kind: 'explain', enabled: true, pinned: true },
  { id: 'summarize', label: '总结', kind: 'summarize', enabled: true, pinned: true },
  { id: 'rewrite', label: '润色', kind: 'rewrite', enabled: true, pinned: true },
  {
    id: 'writing',
    label: '写作',
    kind: 'writing',
    enabled: true,
    pinned: false,
    variants: [
      variant('proofread', '纠错', '检查错别字、语法和标点。先给出修正后的完整文本，再逐条说明修改原因。'),
      variant('shorten', '精简为一句话', '压缩为一句准确、完整的话，保留最关键的信息。'),
      variant('bullets', '精简为要点', '压缩为简洁要点，合并重复信息并保留关键事实。'),
      variant('expand', '扩写', '扩展为结构完整、衔接自然的内容，不虚构事实。'),
      variant('tone-formal', '正式语气', '改写为正式、规范的书面表达，保持原意。'),
      variant('tone-polite', '礼貌语气', '改写为礼貌、克制且自然的表达，保持原意。'),
      variant('tone-conversational', '口语表达', '改写为自然、清晰的日常口语表达，保持原意。'),
      variant('tone-professional', '专业语气', '改写为准确、简洁、专业的表达，保持原意。'),
      variant('tone-marketing', '营销文案', '改写为有吸引力但不过度夸张的营销表达，突出价值与行动点。'),
      variant('reply', '回复助手', '根据选中的邮件或聊天内容生成合适回复，语气自然、信息完整，不臆测未提供的事实。'),
      variant('title-article', '文章标题', '生成 5 个准确、有区分度的文章标题。'),
      variant('title-email', '邮件主题', '生成 5 个简洁明确的邮件主题。'),
      variant('title-product', '商品标题', '生成 5 个突出核心卖点且不过度堆砌关键词的商品标题。'),
      variant('title-video', '短视频标题', '生成 5 个简洁、有吸引力且不使用虚假承诺的短视频标题。')
    ]
  },
  {
    id: 'extract',
    label: '提取',
    kind: 'extract',
    enabled: true,
    pinned: false,
    variants: [
      variant('dates', '日期时间', '提取所有日期、时间、期限和时间范围，按出现顺序列出。'),
      variant('people', '人物组织', '提取人物、组织及其在文本中的角色或关系。'),
      variant('addresses', '地址地点', '提取地址、地点和地理位置，保留必要的上下文。'),
      variant('tasks', '待办事项', '提取待办事项、负责人、截止时间和依赖；缺失字段标记为“未提及”。'),
      variant('keywords', '关键词', '提取最重要的关键词和主题，并按重要性排序。'),
      variant('json', '结构化 JSON', '将可识别的关键信息整理为有效 JSON。仅输出 JSON，不添加 Markdown 代码围栏。')
    ]
  },
  {
    id: 'analysis',
    label: '分析',
    kind: 'analysis',
    enabled: true,
    pinned: false,
    variants: [
      variant('terminology', '术语解释', '按“定义、读音、例句、同义词、专业背景”解释核心术语；不适用的项目明确说明。'),
      variant('viewpoint', '观点分析', '提取论点、证据、隐含假设、潜在风险和可能的反驳，并区分原文事实与推断。')
    ]
  },
  {
    id: 'code',
    label: '代码',
    kind: 'code',
    enabled: true,
    pinned: false,
    variants: [
      variant('explain', '解释代码', '说明代码用途、执行流程、关键数据结构和复杂部分。'),
      variant('diagnose', '查找问题', '检查代码中的错误、边界条件、安全风险和性能问题，并给出最小修复建议。'),
      variant('comment', '添加注释', '在不改变行为的前提下添加必要注释，只解释不直观的逻辑。输出完整代码。'),
      variant('convert-javascript', '转为 JavaScript', '将代码转换为等价 JavaScript，保留行为并说明无法直接对应的部分。'),
      variant('convert-typescript', '转为 TypeScript', '将代码转换为等价 TypeScript，补充合理类型并保留行为。'),
      variant('convert-python', '转为 Python', '将代码转换为等价 Python，遵循常见 Python 风格并保留行为。'),
      variant('convert-java', '转为 Java', '将代码转换为等价 Java，补充必要的类和类型并保留行为。'),
      variant('convert-csharp', '转为 C#', '将代码转换为等价 C#，遵循常见 .NET 风格并保留行为。')
    ]
  }
]

export function mergeDefaultActions(actions: SelectionAction[]): SelectionAction[] {
  const defaultsById = new Map(defaultActions.map((action) => [action.id, action]))
  const merged = actions.map((action) => {
    const defaultAction = defaultsById.get(action.id)
    if (!defaultAction) return { pinned: false, ...action }

    const variantsById = new Map((action.variants ?? []).map((item) => [item.id, item]))
    return {
      ...defaultAction,
      ...action,
      ...(defaultAction.variants
        ? {
            variants: defaultAction.variants.map((item) => ({
              ...item,
              enabled: variantsById.get(item.id)?.enabled ?? item.enabled
            }))
          }
        : {})
    }
  })

  const missing = defaultActions
    .filter((action) => !merged.some((item) => item.id === action.id))
    .map((action) => structuredClone(action))
  const firstCustomIndex = merged.findIndex((action) => action.kind === 'custom')
  if (firstCustomIndex === -1) merged.push(...missing)
  else merged.splice(firstCustomIndex, 0, ...missing)
  return merged
}

export function resolveActionVariant(action: SelectionAction, variantId: string): SelectionAction | null {
  const selected = action.variants?.find((item) => item.id === variantId && item.enabled)
  if (!selected) return null
  const prompt = [action.prompt?.trim(), selected.prompt.trim()].filter(Boolean).join('\n\n')
  return {
    ...action,
    id: `${action.id}:${selected.id}`,
    label: selected.label,
    prompt,
    variants: undefined
  }
}

export function getEnabledActionVariants(action: SelectionAction): ActionVariant[] {
  return action.variants?.filter((variant) => variant.enabled) ?? []
}

export function isDictionaryCandidate(text: string): boolean {
  const normalized = text.trim()
  if (!normalized || normalized.length > 48 || /[\r\n。！？!?；;]/.test(normalized)) return false
  const words = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(normalized)]
    .filter((segment) => segment.isWordLike)
  return words.length > 0 && words.length <= 4
}
