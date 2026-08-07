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

  it('keeps history disabled by default and migrates older settings', () => {
    fileState.exists = true
    fileState.persisted = JSON.stringify({
      theme: 'dark',
      baseUrl: 'https://legacy.example/v1',
      model: 'legacy-model',
      encryptedApiKey: Buffer.from('legacy-key', 'utf8').toString('base64')
    })

    const settings = new SettingsStore().get()

    expect(settings.theme).toBe('dark')
    expect(settings.historyEnabled).toBe(false)
    expect(settings.historyRetentionLimit).toBe(50)
    expect(settings.speechEnabled).toBe(true)
    expect(settings.speechRate).toBe('normal')
    expect(settings.speechLanguageMode).toBe('auto')
    expect(settings.speechAutoStop).toBe(true)
    expect(settings.defaultProviderId).toBe('default-provider')
    expect(settings.providers[0]).toMatchObject({
      baseUrl: 'https://legacy.example/v1',
      apiKey: 'legacy-key',
      defaultModel: 'legacy-model'
    })
    expect(settings).not.toHaveProperty('encryptedApiKey')
  })

  it('persists local speech preferences', () => {
    const store = new SettingsStore()
    const settings = store.update({
      speechEnabled: false,
      speechRate: 'fast',
      speechLanguageMode: 'system',
      speechAutoStop: false
    })

    expect(settings).toMatchObject({
      speechEnabled: false,
      speechRate: 'fast',
      speechLanguageMode: 'system',
      speechAutoStop: false
    })
  })

  it('enables OCR capture with a default shortcut', () => {
    const settings = new SettingsStore().get()
    expect(settings.ocrEnabled).toBe(true)
    expect(settings.ocrShortcut).toBe('Ctrl+Shift+S')
  })

  it('persists OCR capture preferences', () => {
    const store = new SettingsStore()
    const settings = store.update({
      ocrEnabled: false,
      ocrShortcut: 'Ctrl+Shift+O'
    })

    expect(settings).toMatchObject({
      ocrEnabled: false,
      ocrShortcut: 'Ctrl+Shift+O'
    })
    expect(new SettingsStore().get()).toMatchObject({
      ocrEnabled: false,
      ocrShortcut: 'Ctrl+Shift+O'
    })
  })

  it('clears an OCR shortcut without a required modifier', () => {
    const store = new SettingsStore()
    const settings = store.update({ ocrShortcut: 'Shift+A' })
    expect(settings.ocrShortcut).toBe('')
  })

  it('encrypts every provider API key without persisting plaintext', () => {
    const store = new SettingsStore()
    store.update({
      providers: [
        {
          id: 'one',
          name: 'Provider One',
          baseUrl: 'https://one.example/v1',
          apiKey: 'secret-one',
          defaultModel: 'model-one'
        },
        {
          id: 'two',
          name: 'Provider Two',
          baseUrl: 'https://two.example/v1',
          apiKey: 'secret-two',
          defaultModel: 'model-two'
        }
      ],
      defaultProviderId: 'one'
    })

    const persisted = JSON.parse(fileState.persisted)
    expect(fileState.persisted).not.toContain('secret-one')
    expect(fileState.persisted).not.toContain('secret-two')
    expect(persisted.providers[0]).not.toHaveProperty('apiKey')
    expect(persisted.providers[0].encryptedApiKey).toBe(Buffer.from('secret-one').toString('base64'))
    expect(store.get().providers.map((provider) => provider.apiKey)).toEqual(['secret-one', 'secret-two'])
    expect(new SettingsStore().get().providers.map((provider) => provider.apiKey)).toEqual(['secret-one', 'secret-two'])
  })

  it('rejects unknown prompt variables when actions are saved', () => {
    const store = new SettingsStore()

    expect(() => store.update({
      actions: [{
        id: 'custom-invalid',
        label: '无效变量',
        kind: 'custom',
        enabled: true,
        prompt: '处理 {unknown}'
      }]
    })).toThrow('未知提示词变量')
  })

  it('rejects deleting a provider that an action still references', () => {
    const store = new SettingsStore()
    store.update({
      providers: [
        {
          id: 'default-provider',
          name: '默认 Provider',
          baseUrl: 'https://default.example/v1',
          apiKey: '',
          defaultModel: 'default-model'
        },
        {
          id: 'code-provider',
          name: '代码 Provider',
          baseUrl: 'https://code.example/v1',
          apiKey: '',
          defaultModel: 'code-model'
        }
      ],
      actions: [{
        id: 'code',
        label: '代码',
        kind: 'code',
        enabled: true,
        requestProfile: { providerId: 'code-provider' }
      }]
    })

    expect(() => store.update({ providers: [store.get().providers[0]] })).toThrow('引用的 Provider 不存在')
  })
})
