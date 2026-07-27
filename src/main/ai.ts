import { isDictionaryCandidate } from '../shared/actions'
import { classifyAIError } from '../shared/aiErrors'
import { hasPromptVariable, renderPromptTemplate } from '../shared/promptVariables'
import { resolveRequestProfile } from '../shared/providers'
import { trimConversationForRequest } from '../shared/textLimits'
import type { AIConversationMessage, AppSettings, ProviderProfile, SelectionAction } from '../shared/types'

export function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/chat/completions')) return normalized
  return `${normalized}/chat/completions`
}

export function buildMessages(
  action: SelectionAction,
  selectedText: string,
  targetLanguage: string,
  conversation: AIConversationMessage[] = [],
  autoDictionary = false,
  jsonExtractionSchema = '',
  programName = ''
) {
  const systemPrompts: Record<Exclude<SelectionAction['kind'], 'custom'>, string> = {
    chat: '你是严谨、清晰的对话助手。围绕用户选中的文本回答后续问题；需要补充常识时应明确区分文本内容与补充信息。',
    translate: `你是专业翻译。将用户提供的文本翻译为${targetLanguage}，保留原有段落和格式，并严格遵循用户给出的处理要求。`,
    explain: '你是清晰、准确的知识助手。解释用户提供的文本，必要时补充关键背景，但不要臆测。',
    summarize: '你是信息整理助手。提炼用户提供文本的核心观点和关键信息，使用简洁的要点。',
    rewrite: '你是专业编辑。润色用户提供的文本，使表达自然、准确、简洁，同时保持原意和原语言。',
    writing: '你是专业写作助手。严格遵循处理要求，保持事实准确，不虚构原文没有的信息。',
    extract: '你是信息提取助手。只提取文本中有依据的信息，缺失内容不得臆测。',
    analysis: '你是严谨的分析助手。区分原文事实、合理推断和补充背景。',
    code: '你是资深软件工程师。保持代码行为和技术准确性，明确说明不确定或无法等价转换的部分。'
  }
  const history = trimConversationForRequest(conversation).messages
  const question = [...history].reverse().find((message) => message.role === 'user')?.content ?? ''
  const promptTemplate = action.prompt?.trim() ?? ''
  const renderedPrompt = renderPromptTemplate(promptTemplate, {
    text: selectedText,
    language: targetLanguage,
    program: programName,
    question
  })
  const promptContainsText = hasPromptVariable(promptTemplate, 'text')

  if (action.kind === 'chat') {
    const systemPrompt = renderedPrompt
      ? `${systemPrompts.chat}\n\n处理要求：\n${renderedPrompt}`
      : systemPrompts.chat
    return [
      { role: 'system' as const, content: systemPrompt },
      ...(!promptContainsText
        ? [{ role: 'user' as const, content: `用户选中的上下文：\n\n${selectedText}` }]
        : []),
      ...history
    ]
  }

  const baseUserContent = action.kind === 'custom'
    ? promptContainsText
      ? renderedPrompt
      : `${renderedPrompt}\n\n待处理文本：\n${selectedText}`
    : renderedPrompt
      ? promptContainsText
        ? `处理要求：\n${renderedPrompt}`
        : `处理要求：\n${renderedPrompt}\n\n待处理文本：\n${selectedText}`
      : selectedText
  const userContent = action.id === 'extract:json' && jsonExtractionSchema.trim()
    ? `${baseUserContent}\n\nJSON 字段或 Schema 要求：\n${jsonExtractionSchema.trim()}`
    : baseUserContent

  if (history.length > 0) {
    return [
      {
        role: 'system' as const,
        content: '你是严谨、清晰的对话助手。先前已按用户要求处理选中文本；现在请结合原始文本、处理要求和会话历史回答最新问题。除非用户明确要求，否则不要机械重复原处理操作。'
      },
      { role: 'user' as const, content: userContent },
      ...history
    ]
  }

  if (action.kind === 'custom') {
    return [
      { role: 'system' as const, content: '严格按照用户给出的处理要求完成任务。' },
      { role: 'user' as const, content: userContent }
    ]
  }

  const systemPrompt = action.kind === 'explain' && autoDictionary && isDictionaryCandidate(selectedText)
    ? '你是专业词典与术语助手。按“定义、读音、例句、同义词、专业背景”解释用户提供的短词或术语；不适用的项目明确说明。'
    : systemPrompts[action.kind]
  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent }
  ]
}

export async function streamCompletion(
  settings: AppSettings,
  action: SelectionAction,
  selectedText: string,
  signal: AbortSignal,
  onDelta: (content: string) => void,
  conversation: AIConversationMessage[] = [],
  programName = ''
): Promise<void> {
  const profile = resolveRequestProfile(settings, action)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (profile.apiKey) headers.Authorization = `Bearer ${profile.apiKey}`

  const response = await fetchWithTimeout(buildChatCompletionsUrl(profile.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: profile.model,
      messages: buildMessages(
        action,
        selectedText,
        settings.targetLanguage,
        conversation,
        settings.autoDictionary,
        settings.jsonExtractionSchema,
        programName
      ),
      stream: true,
      temperature: profile.temperature,
      ...(profile.maxOutputTokens === undefined ? {} : { max_tokens: profile.maxOutputTokens })
    }),
    signal
  })

  if (!response.ok) {
    const detail = await readLimitedResponseText(response, 600)
    throw new AIResponseError(detail, response.status)
  }
  if (!response.body) throw new Error('模型服务未返回内容')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await readStreamChunk(reader)
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        processStreamLine(line, onDelta)
      }

      if (done) break
    }
    processStreamLine(buffer, onDelta)
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }
}

export async function testConnection(provider: ProviderProfile) {
  if (!provider.baseUrl.trim() || !provider.defaultModel.trim()) {
    return { ok: false, message: '请填写 API 地址和模型名称' }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.apiKey.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`

  try {
    const response = await fetchWithTimeout(buildChatCompletionsUrl(provider.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.defaultModel.trim(),
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
        max_tokens: 1
      })
    })
    if (!response.ok) {
      const detail = await readLimitedResponseText(response, 240)
      throw new AIResponseError(detail, response.status)
    }
    if (response.body) await response.body.cancel().catch(() => undefined)
    return { ok: true, message: '连接成功' }
  } catch (error) {
    return { ok: false, message: classifyAIError(error).message }
  }
}

class AIResponseError extends Error {
  constructor(
    readonly detail: string,
    readonly status?: number,
    readonly code?: string
  ) {
    super(detail || (status ? `HTTP ${status}` : '模型服务返回错误'))
    this.name = 'AIResponseError'
  }
}

function processStreamLine(line: string, onDelta: (content: string) => void): void {
  const payload = line.trim().replace(/^data:\s*/, '')
  if (!payload || payload === '[DONE]') return

  let data: {
    choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
    error?: string | { message?: string; type?: string; code?: string | number; status?: number }
    status?: number
  }
  try {
    data = JSON.parse(payload) as typeof data
  } catch {
    return
  }

  if (data.error !== undefined) {
    const providerError = typeof data.error === 'string' ? { message: data.error } : data.error
    const detail = [providerError.message, providerError.type, providerError.code]
      .filter((value) => value !== undefined && value !== '')
      .join(' ')
    const status = providerError.status ?? data.status
    const code = providerError.code === undefined ? undefined : String(providerError.code)
    throw new AIResponseError(detail, status, code)
  }

  const content = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content
  if (content) onDelta(content)
}

async function readLimitedResponseText(
  response: Response,
  maxCharacters: number,
  timeoutMs = 10_000
): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''

  try {
    while (text.length < maxCharacters) {
      const { value, done } = await readStreamChunk(reader, timeoutMs)
      text += decoder.decode(value, { stream: !done })
      if (done) break
    }
  } catch {
    return text.slice(0, maxCharacters)
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  return text.slice(0, maxCharacters)
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new DOMException('请求超时', 'TimeoutError'))
  }, timeoutMs)
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal

  try {
    return await fetch(input, { ...init, signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 60_000
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new DOMException('流式响应超时', 'TimeoutError')), timeoutMs)
      })
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
