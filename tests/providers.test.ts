import { describe, expect, it } from 'vitest'
import { resolveRequestProfile } from '../src/shared/providers'
import type { AppSettings, SelectionAction } from '../src/shared/types'

const action: SelectionAction = {
  id: 'translate',
  label: '翻译',
  kind: 'translate',
  enabled: true
}

const settings: AppSettings = {
  enabled: true,
  launchAtLogin: false,
  theme: 'system',
  providers: [
    {
      id: 'fast',
      name: '快速模型',
      baseUrl: 'https://fast.example/v1',
      apiKey: 'fast-key',
      defaultModel: 'fast-model'
    },
    {
      id: 'strong',
      name: '强模型',
      baseUrl: 'https://strong.example/v1',
      apiKey: 'strong-key',
      defaultModel: 'strong-default',
      defaultTemperature: 0.6,
      defaultMaxOutputTokens: 4096
    }
  ],
  defaultProviderId: 'fast',
  targetLanguage: '简体中文',
  autoDictionary: true,
  speechEnabled: true,
  speechRate: 'normal',
  speechLanguageMode: 'auto',
  speechAutoStop: true,
  jsonExtractionSchema: '',
  maxInputCharacters: 30_000,
  historyEnabled: false,
  historyRetentionLimit: 50,
  showRecentActions: true,
  recentActionIds: [],
  resultWindowBounds: null,
  actions: [action]
}

describe('request profile resolution', () => {
  it('inherits the default provider and legacy temperature', () => {
    expect(resolveRequestProfile(settings, action)).toEqual({
      providerId: 'fast',
      providerName: '快速模型',
      baseUrl: 'https://fast.example/v1',
      apiKey: 'fast-key',
      model: 'fast-model',
      temperature: 0.2
    })
  })

  it('uses provider defaults and per-action overrides', () => {
    const profile = resolveRequestProfile(settings, {
      ...action,
      requestProfile: {
        providerId: 'strong',
        model: 'code-model',
        temperature: 0.9,
        maxOutputTokens: 8192
      }
    })

    expect(profile).toMatchObject({
      providerId: 'strong',
      model: 'code-model',
      temperature: 0.9,
      maxOutputTokens: 8192
    })
  })

  it('inherits optional provider request defaults when action overrides are reset', () => {
    const profile = resolveRequestProfile(settings, { ...action, requestProfile: { providerId: 'strong' } })

    expect(profile.model).toBe('strong-default')
    expect(profile.temperature).toBe(0.6)
    expect(profile.maxOutputTokens).toBe(4096)
  })

  it('rejects an action that references a missing provider', () => {
    expect(() => resolveRequestProfile(settings, {
      ...action,
      requestProfile: { providerId: 'missing' }
    })).toThrow('Provider 不存在')
  })
})
