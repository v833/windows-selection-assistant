import type { AppSettings, SelectionAction } from '../shared/types'

export function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/chat/completions')) return normalized
  return `${normalized}/chat/completions`
}

export function buildMessages(action: SelectionAction, selectedText: string, targetLanguage: string) {
  const systemPrompts: Record<Exclude<SelectionAction['kind'], 'custom'>, string> = {
    translate: `你是专业翻译。将用户提供的文本翻译为${targetLanguage}。只输出译文，保留原有段落和格式。`,
    explain: '你是清晰、准确的知识助手。解释用户提供的文本，必要时补充关键背景，但不要臆测。',
    summarize: '你是信息整理助手。提炼用户提供文本的核心观点和关键信息，使用简洁的要点。',
    rewrite: '你是专业编辑。润色用户提供的文本，使表达自然、准确、简洁，同时保持原意和原语言。'
  }

  if (action.kind === 'custom') {
    return [
      { role: 'system' as const, content: '严格按照用户给出的处理要求完成任务。' },
      { role: 'user' as const, content: `${action.prompt ?? ''}\n\n待处理文本：\n${selectedText}` }
    ]
  }

  return [
    { role: 'system' as const, content: systemPrompts[action.kind] },
    { role: 'user' as const, content: selectedText }
  ]
}

export async function streamCompletion(
  settings: AppSettings,
  action: SelectionAction,
  selectedText: string,
  signal: AbortSignal,
  onDelta: (content: string) => void
): Promise<void> {
  if (!settings.baseUrl.trim()) throw new Error('请先填写 API 地址')
  if (!settings.model.trim()) throw new Error('请先填写模型名称')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`

  const response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: buildMessages(action, selectedText, settings.targetLanguage),
      stream: true,
      temperature: 0.2
    }),
    signal
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 600)
    throw new Error(`请求失败（${response.status}）${detail ? `：${detail}` : ''}`)
  }
  if (!response.body) throw new Error('模型服务未返回内容')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const payload = line.trim().replace(/^data:\s*/, '')
      if (!payload || payload === '[DONE]') continue
      try {
        const data = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        }
        const content = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content
        if (content) onDelta(content)
      } catch {
        continue
      }
    }

    if (done) break
  }
}

export async function testConnection(settings: Pick<AppSettings, 'baseUrl' | 'apiKey' | 'model'>) {
  if (!settings.baseUrl.trim() || !settings.model.trim()) {
    return { ok: false, message: '请填写 API 地址和模型名称' }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`

  try {
    const response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model.trim(),
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
        max_tokens: 1
      })
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240)
      return { ok: false, message: `连接失败（${response.status}）${detail ? `：${detail}` : ''}` }
    }
    return { ok: true, message: '连接成功' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '连接失败' }
  }
}
