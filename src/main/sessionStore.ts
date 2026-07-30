import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  clampContextStartIndex,
  createSessionTitle,
  normalizeSessionRetentionLimit
} from '../shared/sessions'
import type { ConversationSession, SelectionAction, SessionStorageInfo } from '../shared/types'

export interface SessionCipher {
  encrypt: (value: string) => string
  decrypt: (value: string) => string
}

interface StoredSessionsV2 {
  version: 2
  encryptedPayload: string
}

interface StoredSessionsV1 {
  version: 1
  sessions: unknown[]
}

export class SessionStore {
  constructor(
    private readonly filePath: string,
    private readonly cipher: SessionCipher
  ) {}

  storageInfo(): SessionStorageInfo {
    return { path: this.filePath, encrypted: true }
  }

  list(): ConversationSession[] {
    return structuredClone(this.read())
  }

  get(sessionId: string): ConversationSession | null {
    const session = this.read().find((item) => item.id === sessionId)
    return session ? structuredClone(session) : null
  }

  save(
    session: ConversationSession,
    persistenceEnabled: boolean,
    retentionLimit: number
  ): ConversationSession | null {
    if (!persistenceEnabled) return null
    const normalized = normalizeSession(session)
    if (!normalized) return null
    const currentSessions = this.read()
    const existing = currentSessions.find((item) => item.id === normalized.id)
    if (existing) normalized.title = existing.title
    const sessions = currentSessions.filter((item) => item.id !== normalized.id)
    sessions.unshift(normalized)
    this.write(sessions.slice(0, normalizeSessionRetentionLimit(retentionLimit)))
    return structuredClone(normalized)
  }

  rename(sessionId: string, title: string): ConversationSession | null {
    const sessions = this.read()
    const session = sessions.find((item) => item.id === sessionId)
    if (!session) return null
    session.title = String(title).trim().slice(0, 80) || session.title
    session.updatedAt = new Date().toISOString()
    this.write(sessions)
    return structuredClone(session)
  }

  delete(sessionId: string): boolean {
    const sessions = this.read()
    const next = sessions.filter((item) => item.id !== sessionId)
    if (next.length === sessions.length) return false
    if (next.length) this.write(next)
    else this.deleteAll()
    return true
  }

  deleteAll(): void {
    if (existsSync(this.filePath)) unlinkSync(this.filePath)
  }

  enforceRetention(retentionLimit: number): void {
    const sessions = this.read()
    const next = sessions.slice(0, normalizeSessionRetentionLimit(retentionLimit))
    if (next.length !== sessions.length) this.write(next)
  }

  private read(): ConversationSession[] {
    if (!existsSync(this.filePath)) return []
    try {
      const stored = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      let values: unknown[]
      let shouldMigrate = false
      if (Array.isArray(stored)) {
        values = stored
        shouldMigrate = true
      } else if (isStoredSessionsV1(stored)) {
        values = stored.sessions
        shouldMigrate = true
      } else if (isStoredSessionsV2(stored)) {
        const decrypted = JSON.parse(this.cipher.decrypt(stored.encryptedPayload)) as unknown
        if (Array.isArray(decrypted)) values = decrypted
        else if (isRecord(decrypted) && Array.isArray(decrypted.sessions)) values = decrypted.sessions
        else throw new Error('加密内容格式无效')
      } else {
        throw new Error('存储格式或版本不受支持')
      }

      const normalized = values.map(normalizeSession)
      if (normalized.some((session) => !session)) throw new Error('包含无法识别的会话数据')
      const sessions = (normalized as ConversationSession[])
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      if (shouldMigrate) this.write(sessions)
      return sessions
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      throw new Error(`无法读取会话历史：${message}`)
    }
  }

  private write(sessions: ConversationSession[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const stored: StoredSessionsV2 = {
      version: 2,
      encryptedPayload: this.cipher.encrypt(JSON.stringify({ sessions }))
    }
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(stored, null, 2), 'utf8')
    renameSync(temporaryPath, this.filePath)
  }
}

function normalizeSession(value: unknown): ConversationSession | null {
  if (!value || typeof value !== 'object') return null
  const session = value as Partial<ConversationSession>
  const action = normalizeAction(session.action)
  if (!session.id || !action || !Array.isArray(session.messages)) return null
  const messages = session.messages
    .filter((message) => (
      (message?.role === 'user' || message?.role === 'assistant') &&
      typeof message.content === 'string'
    ))
    .map((message) => ({ role: message.role, content: message.content }))
  if (messages.length !== session.messages.length) return null
  const selectedText = String(session.selectedText ?? '')
  const contextMode = session.contextMode === 'truncate' || session.contextMode === 'summarize'
    ? session.contextMode
    : 'full'
  const sourceLanguage = normalizeOptionalText(session.sourceLanguage)
  const targetLanguage = normalizeOptionalText(session.targetLanguage)
  const now = new Date().toISOString()
  return {
    id: String(session.id),
    title: String(session.title ?? '').trim().slice(0, 80) || createSessionTitle(selectedText, action.label),
    selectedText,
    contextText: String(session.contextText ?? selectedText),
    contextMode,
    contextStartIndex: clampContextStartIndex(messages, session.contextStartIndex),
    programName: String(session.programName ?? ''),
    action,
    model: String(session.model ?? ''),
    ...(sourceLanguage ? { sourceLanguage } : {}),
    ...(targetLanguage ? { targetLanguage } : {}),
    createdAt: normalizeTimestamp(session.createdAt, now),
    updatedAt: normalizeTimestamp(session.updatedAt, now),
    messages
  }
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 40) : ''
}

function normalizeAction(value: unknown): SelectionAction | null {
  if (!value || typeof value !== 'object') return null
  const action = value as Partial<SelectionAction>
  if (!action.id || !action.label || !action.kind) return null
  return structuredClone(action as SelectionAction)
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fallback
  return new Date(value).toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isStoredSessionsV1(value: unknown): value is StoredSessionsV1 {
  return isRecord(value) && value.version === 1 && Array.isArray(value.sessions)
}

function isStoredSessionsV2(value: unknown): value is StoredSessionsV2 {
  return isRecord(value) && value.version === 2 && typeof value.encryptedPayload === 'string'
}
