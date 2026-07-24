import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildChatCompletionsUrl, buildMessages, streamCompletion } from '../src/main/ai'
import type { AIConversationMessage, AppSettings, SelectionAction } from '../src/shared/types'

afterEach(() => vi.unstubAllGlobals())

const streamAction: SelectionAction = {
  id: 'chat',
  label: '问答',
  kind: 'chat',
  enabled: true
}
const streamSettings = {
  enabled: true,
  launchAtLogin: false,
  theme: 'system',
  baseUrl: 'https://example.com/v1',
  apiKey: '',
  model: 'test-model',
  targetLanguage: '简体中文',
  autoDictionary: false,
  jsonExtractionSchema: '',
  maxInputCharacters: 30_000,
  historyEnabled: false,
  historyRetentionLimit: 50,
  showRecentActions: true,
  recentActionIds: [],
  resultWindowBounds: null,
  actions: [streamAction]
} satisfies AppSettings

describe('AI request helpers', () => {
  it('appends the chat completions path to an OpenAI-compatible base URL', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions')
    expect(buildChatCompletionsUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1/chat/completions')
    expect(buildChatCompletionsUrl('https://example.com/custom/chat/completions')).toBe('https://example.com/custom/chat/completions')
  })

  it('builds the translation prompt with the selected target language', () => {
    const messages = buildMessages({ id: 'translate', label: '翻译', kind: 'translate', enabled: true }, 'Hello', '日语')
    expect(messages[0].content).toContain('日语')
    expect(messages[1].content).toBe('Hello')
  })

  it('allows reverse translation to define its own output format', () => {
    const messages = buildMessages(
      {
        id: 'translate:back-translation',
        label: '反向翻译',
        kind: 'translate',
        enabled: true,
        prompt: '先翻译为目标语言，再回译并说明差异。'
      },
      'Hello',
      '简体中文'
    )

    expect(messages[0].content).not.toContain('只输出译文')
    expect(messages[1].content).toContain('回译')
  })

  it('keeps custom instructions and selected text together', () => {
    const messages = buildMessages(
      { id: 'custom', label: '提取', kind: 'custom', enabled: true, prompt: '提取所有日期' },
      '会议在周五举行',
      '简体中文'
    )
    expect(messages[1].content).toContain('提取所有日期')
    expect(messages[1].content).toContain('会议在周五举行')
  })

  it('keeps variant instructions and selected text together', () => {
    const messages = buildMessages(
      { id: 'writing:proofread', label: '纠错', kind: 'writing', enabled: true, prompt: '检查错别字并说明原因' },
      '这是一断需要修改的文字。',
      '简体中文'
    )

    expect(messages[1].content).toContain('检查错别字并说明原因')
    expect(messages[1].content).toContain('这是一断需要修改的文字。')
  })

  it('routes short explanations to dictionary mode only when enabled', () => {
    const action = { id: 'explain', label: '解释', kind: 'explain' as const, enabled: true }
    const dictionaryMessages = buildMessages(action, 'TypeScript', '简体中文', [], true)
    const regularMessages = buildMessages(action, 'TypeScript', '简体中文', [], false)

    expect(dictionaryMessages[0].content).toContain('词典')
    expect(dictionaryMessages[0].content).toContain('读音')
    expect(regularMessages[0].content).not.toContain('词典')
    expect(dictionaryMessages[1].content).toBe('TypeScript')
  })

  it('switches non-chat actions to conversation mode for follow-up questions', () => {
    const messages = buildMessages(
      {
        id: 'translate:direct',
        label: '直接翻译',
        kind: 'translate',
        enabled: true,
        prompt: '翻译为目标语言，只输出译文。'
      },
      'Hello',
      '简体中文',
      [
        { role: 'assistant', content: '你好' },
        { role: 'user', content: '为什么这样翻译？' }
      ]
    )

    expect(messages[0].content).toContain('对话助手')
    expect(messages[0].content).not.toContain('只输出译文')
    expect(messages.at(-1)).toEqual({ role: 'user', content: '为什么这样翻译？' })
  })

  it('adds the configured schema only to structured JSON extraction', () => {
    const schema = '{"date":"string","tasks":["string"]}'
    const messages = buildMessages(
      {
        id: 'extract:json',
        label: '结构化 JSON',
        kind: 'extract',
        enabled: true,
        prompt: '整理为有效 JSON。'
      },
      '周五完成发布',
      '简体中文',
      [],
      false,
      schema
    )

    expect(messages[1].content).toContain('JSON 字段或 Schema 要求')
    expect(messages[1].content).toContain(schema)
  })

  it('builds chat context before the multi-turn conversation', () => {
    const messages = buildMessages(
      { id: 'chat', label: '问答', kind: 'chat', enabled: true },
      '水在标准大气压下的沸点是 100°C。',
      '简体中文',
      [
        { role: 'user', content: '这个结论有什么前提？' },
        { role: 'assistant', content: '前提是标准大气压。' },
        { role: 'user', content: '高原地区会怎样？' }
      ]
    )

    expect(messages[1].content).toContain('水在标准大气压下的沸点')
    expect(messages.slice(-3)).toEqual([
      { role: 'user', content: '这个结论有什么前提？' },
      { role: 'assistant', content: '前提是标准大气压。' },
      { role: 'user', content: '高原地区会怎样？' }
    ])
  })

  it('limits conversation history to the latest 16 messages', () => {
    const conversation = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `消息 ${index}`
    }))
    const messages = buildMessages(
      { id: 'chat', label: '问答', kind: 'chat', enabled: true },
      '上下文',
      '简体中文',
      conversation
    )

    expect(messages).toHaveLength(18)
    expect(messages[2].content).toBe('消息 4')
    expect(messages.at(-1)?.content).toBe('消息 19')
  })

  it('keeps complete turns when old conversation history is trimmed', () => {
    const conversation: AIConversationMessage[] = [{ role: 'assistant', content: '初始结果' }]
    for (let index = 1; index <= 9; index += 1) {
      conversation.push({ role: 'user', content: `问题 ${index}` })
      if (index < 9) conversation.push({ role: 'assistant', content: `回答 ${index}` })
    }

    const messages = buildMessages(
      { id: 'rewrite', label: '润色', kind: 'rewrite', enabled: true },
      '原始文本',
      '简体中文',
      conversation
    )
    const history = messages.slice(2)

    expect(history.length).toBeLessThanOrEqual(16)
    expect(history[0].role).toBe('user')
    expect(history.at(-1)).toEqual({ role: 'user', content: '问题 9' })
  })

  it('emits a final stream payload without a trailing newline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'data: {"choices":[{"delta":{"content":"尾部内容"}}]}',
      { status: 200 }
    )))
    const chunks: string[] = []

    await streamCompletion(
      streamSettings,
      streamAction,
      '原文',
      new AbortController().signal,
      (content) => chunks.push(content)
    )

    expect(chunks).toEqual(['尾部内容'])
  })

  it('propagates provider errors delivered inside a successful stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'data: {"error":{"message":"rate limit exceeded","code":"rate_limit_exceeded","status":429}}',
      { status: 200 }
    )))

    await expect(streamCompletion(
      streamSettings,
      streamAction,
      '原文',
      new AbortController().signal,
      () => undefined
    )).rejects.toMatchObject({
      status: 429,
      code: 'rate_limit_exceeded'
    })
  })

  it('limits error response details before propagating them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(2000), { status: 500 })))

    await expect(streamCompletion(
      streamSettings,
      streamAction,
      '原文',
      new AbortController().signal,
      () => undefined
    )).rejects.toMatchObject({
      status: 500,
      detail: 'x'.repeat(600)
    })
  })
})
