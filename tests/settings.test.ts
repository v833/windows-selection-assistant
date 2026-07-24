import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileState = vi.hoisted(() => ({
  exists: false,
  failWrite: false,
  persisted: ''
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\test-data' },
  safeStorage: {
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  }
}))

vi.mock('node:fs', () => ({
  existsSync: () => fileState.exists,
  readFileSync: () => fileState.persisted,
  writeFileSync: (_path: string, content: string) => {
    if (fileState.failWrite) throw new Error('disk write failed')
    fileState.persisted = content
  },
  renameSync: () => {
    fileState.exists = true
  }
}))

import { SettingsStore } from '../src/main/settings'

describe('settings persistence', () => {
  beforeEach(() => {
    fileState.exists = false
    fileState.failWrite = false
    fileState.persisted = ''
  })

  it('commits in-memory settings only after the file write succeeds', () => {
    const store = new SettingsStore()
    const before = store.get()
    fileState.failWrite = true

    expect(() => store.update({ theme: 'dark' })).toThrow('disk write failed')
    expect(store.get()).toEqual(before)
  })
})
