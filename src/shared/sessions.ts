import type {
  AIConversationMessage,
  ConversationSession,
  SessionContextMode,
  SessionExportFormat
} from './types'

export const DEFAULT_SESSION_RETENTION_LIMIT = 50
export const MIN_SESSION_RETENTION_LIMIT = 5
export const MAX_SESSION_RETENTION_LIMIT = 200

export function normalizeSessionRetentionLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_SESSION_RETENTION_LIMIT
  return Math.min(MAX_SESSION_RETENTION_LIMIT, Math.max(MIN_SESSION_RETENTION_LIMIT, Math.round(parsed)))
}

export function clampContextStartIndex(messages: AIConversationMessage[], value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(messages.length, Math.max(0, Math.round(parsed)))
}

export function getActiveContextMessages(
  messages: AIConversationMessage[],
  contextStartIndex: number
): AIConversationMessage[] {
  return messages.slice(clampContextStartIndex(messages, contextStartIndex))
}

export function resolveInitialContextMode(
  contextMode: SessionContextMode | undefined,
  sourceLength: number,
  maxInputCharacters: number
): SessionContextMode | null {
  if (contextMode && contextMode !== 'full') return contextMode
  return sourceLength > maxInputCharacters ? null : 'full'
}

export function createSessionTitle(selectedText: string, actionLabel: string): string {
  const firstLine = selectedText.split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return (firstLine || actionLabel || '未命名会话').slice(0, 80)
}

export function serializeSession(session: ConversationSession, format: SessionExportFormat): string {
  if (format === 'json') return `${JSON.stringify(session, null, 2)}\n`

  const source = session.selectedText
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n')
  const conversation = session.messages.map((message) => {
    const role = message.role === 'user' ? '用户' : '助手'
    return `### ${role}\n\n${message.content}`
  }).join('\n\n')

  return `# ${session.title}\n\n- 动作：${session.action.label}\n- 模型：${session.model}\n- 来源：${session.programName || '未知应用'}\n- 创建时间：${session.createdAt}\n- 更新时间：${session.updatedAt}\n\n## 选中文本\n\n${source}\n\n## 会话\n\n${conversation || '暂无消息'}\n`
}
