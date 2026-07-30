import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionStore, type SessionCipher } from '../src/main/sessionStore'
import {
  getActiveContextMessages,
  resolveInitialContextMode,
  serializeSession
} from '../src/shared/sessions'
import type { ConversationSession } from '../src/shared/types'

const cipher: SessionCipher = {
  encrypt: (value) => Buffer.from(value, 'utf8').toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString('utf8')
}

let directory = ''
let filePath = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'selection-assistant-sessions-'))
  filePath = join(directory, 'sessions.json')
})

afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe('SessionStore', () => {
  it('does not write a session while persistence is disabled', () => {
    const store = new SessionStore(filePath, cipher)

    expect(store.save(session('disabled'), false, 50)).toBeNull()
    expect(existsSync(filePath)).toBe(false)
  })

  it('migrates plaintext version 1 history to encrypted version 2', () => {
    writeFileSync(filePath, JSON.stringify({ version: 1, sessions: [session('legacy', '旧会话内容')] }), 'utf8')
    const store = new SessionStore(filePath, cipher)

    expect(store.list()).toHaveLength(1)
    const storedText = readFileSync(filePath, 'utf8')
    expect(JSON.parse(storedText).version).toBe(2)
    expect(storedText).not.toContain('旧会话内容')
  })

  it('preserves the existing history file when decryption fails during save', () => {
    const original = JSON.stringify({ version: 2, encryptedPayload: 'unreadable' }, null, 2)
    writeFileSync(filePath, original, 'utf8')
    const store = new SessionStore(filePath, {
      encrypt: cipher.encrypt,
      decrypt: () => { throw new Error('decrypt failed') }
    })

    expect(() => store.save(session('new'), true, 50)).toThrow('无法读取会话历史')
    expect(readFileSync(filePath, 'utf8')).toBe(original)
  })

  it('enforces the configured retention limit', () => {
    const store = new SessionStore(filePath, cipher)
    for (let index = 0; index < 7; index += 1) {
      store.save(session(`session-${index}`, `内容 ${index}`, new Date(2026, 0, index + 1).toISOString()), true, 5)
    }

    expect(store.list().map((item) => item.id)).toEqual([
      'session-6',
      'session-5',
      'session-4',
      'session-3',
      'session-2'
    ])
  })

  it('renames and deletes individual sessions and all history', () => {
    const store = new SessionStore(filePath, cipher)
    store.save(session('one'), true, 50)
    store.save(session('two'), true, 50)

    expect(store.rename('one', '新名称')?.title).toBe('新名称')
    store.save(session('one', '更新后的内容', '2026-02-01T00:00:00.000Z'), true, 50)
    expect(store.get('one')?.title).toBe('新名称')
    expect(store.delete('two')).toBe(true)
    expect(store.list().map((item) => item.id)).toEqual(['one'])
    store.deleteAll()
    expect(existsSync(filePath)).toBe(false)
  })

  it('exports UTF-8 Markdown and JSON and resets active context predictably', () => {
    const value = session('export', '中文选区')
    value.messages = [
      { role: 'user', content: '第一个问题' },
      { role: 'assistant', content: '第一个回答' },
      { role: 'user', content: '新上下文问题' }
    ]

    expect(Buffer.from(serializeSession(value, 'markdown'), 'utf8').toString('utf8')).toContain('中文选区')
    expect(JSON.parse(serializeSession(value, 'json')).id).toBe('export')
    expect(getActiveContextMessages(value.messages, 2)).toEqual([{ role: 'user', content: '新上下文问题' }])
  })

  it('preserves translation language metadata when reopening history', () => {
    const value = session('translation')
    value.sourceLanguage = '英语'
    value.targetLanguage = '简体中文'
    const store = new SessionStore(filePath, cipher)

    store.save(value, true, 50)

    expect(store.get('translation')).toMatchObject({
      sourceLanguage: '英语',
      targetLanguage: '简体中文'
    })
  })

  it('rechecks full history sessions against the current input limit', () => {
    expect(resolveInitialContextMode('full', 30001, 30000)).toBeNull()
    expect(resolveInitialContextMode('full', 30000, 30000)).toBe('full')
    expect(resolveInitialContextMode('truncate', 30001, 30000)).toBe('truncate')
    expect(resolveInitialContextMode('summarize', 30001, 30000)).toBe('summarize')
  })
})

function session(id: string, selectedText = '测试选区', updatedAt = '2026-01-01T00:00:00.000Z'): ConversationSession {
  return {
    id,
    title: `会话 ${id}`,
    selectedText,
    contextText: selectedText,
    contextMode: 'full',
    contextStartIndex: 0,
    programName: '测试应用',
    action: { id: 'chat', label: '问答', kind: 'chat', enabled: true },
    model: 'test-model',
    createdAt: updatedAt,
    updatedAt,
    messages: [{ role: 'assistant', content: selectedText }]
  }
}
