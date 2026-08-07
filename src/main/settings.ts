import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultActions, mergeDefaultActions } from '../shared/actions'
import { getUnknownPromptVariables } from '../shared/promptVariables'
import {
  DEFAULT_PROVIDER,
  DEFAULT_PROVIDER_ID,
  validateMaxOutputTokens,
  validateTemperature
} from '../shared/providers'
import { DEFAULT_SESSION_RETENTION_LIMIT, normalizeSessionRetentionLimit } from '../shared/sessions'
import { DEFAULT_MAX_INPUT_CHARACTERS, normalizeMaxInputCharacters } from '../shared/textLimits'
import { limitPinnedActions, normalizeShortcut, sanitizeRecentActionIds } from '../shared/toolbar'
import type {
  ActionRequestProfile,
  AppSettings,
  ProviderProfile,
  SelectionAction,
  SpeechLanguageMode,
  SpeechRate,
  ThemeMode,
  WindowBounds
} from '../shared/types'
import { isWindowBounds } from '../shared/windowBounds'

interface PersistedProviderProfile extends Omit<ProviderProfile, 'apiKey'> {
  encryptedApiKey: string
}

interface PersistedSettings extends Omit<AppSettings, 'providers'> {
  providers: PersistedProviderProfile[]
}

interface LegacyPersistedSettings {
  baseUrl?: unknown
  model?: unknown
  encryptedApiKey?: unknown
}

type StoredSettings = Partial<PersistedSettings> & LegacyPersistedSettings

const defaults: AppSettings = {
  enabled: true,
  launchAtLogin: false,
  theme: 'system',
  providers: [DEFAULT_PROVIDER],
  defaultProviderId: DEFAULT_PROVIDER_ID,
  targetLanguage: '简体中文',
  autoDictionary: true,
  speechEnabled: true,
  speechRate: 'normal',
  speechLanguageMode: 'auto',
  speechAutoStop: true,
  ocrEnabled: true,
  ocrShortcut: 'Ctrl+Shift+S',
  jsonExtractionSchema: '',
  maxInputCharacters: DEFAULT_MAX_INPUT_CHARACTERS,
  historyEnabled: false,
  historyRetentionLimit: DEFAULT_SESSION_RETENTION_LIMIT,
  showRecentActions: true,
  recentActionIds: [],
  resultWindowBounds: null,
  actions: defaultActions
}

export class SettingsStore {
  private readonly filePath = join(app.getPath('userData'), 'settings.json')
  private settings = this.read()

  get(): AppSettings {
    return structuredClone(this.settings)
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const providers = patch.providers
      ? this.sanitizeProviders(patch.providers, true)
      : this.settings.providers
    const defaultProviderId = patch.defaultProviderId === undefined
      ? this.settings.defaultProviderId
      : String(patch.defaultProviderId).trim()
    const actions = patch.actions
      ? this.sanitizeActions(patch.actions, true)
      : this.settings.actions
    this.validateProviderConfiguration(providers, defaultProviderId, actions)

    const showRecentActions = patch.showRecentActions === undefined
      ? this.settings.showRecentActions
      : Boolean(patch.showRecentActions)
    const recentActionIds = showRecentActions
      ? sanitizeRecentActionIds(patch.recentActionIds ?? this.settings.recentActionIds, actions)
      : []
    const nextSettings: AppSettings = {
      enabled: patch.enabled === undefined ? this.settings.enabled : Boolean(patch.enabled),
      launchAtLogin: patch.launchAtLogin === undefined
        ? this.settings.launchAtLogin
        : Boolean(patch.launchAtLogin),
      theme: isThemeMode(patch.theme) ? patch.theme : this.settings.theme,
      providers,
      defaultProviderId,
      targetLanguage: patch.targetLanguage === undefined
        ? this.settings.targetLanguage
        : String(patch.targetLanguage),
      autoDictionary: patch.autoDictionary === undefined
        ? this.settings.autoDictionary
        : Boolean(patch.autoDictionary),
      speechEnabled: patch.speechEnabled === undefined
        ? this.settings.speechEnabled
        : Boolean(patch.speechEnabled),
      speechRate: isSpeechRate(patch.speechRate) ? patch.speechRate : this.settings.speechRate,
      speechLanguageMode: isSpeechLanguageMode(patch.speechLanguageMode)
        ? patch.speechLanguageMode
        : this.settings.speechLanguageMode,
      speechAutoStop: patch.speechAutoStop === undefined
        ? this.settings.speechAutoStop
        : Boolean(patch.speechAutoStop),
      ocrEnabled: patch.ocrEnabled === undefined
        ? this.settings.ocrEnabled
        : Boolean(patch.ocrEnabled),
      ocrShortcut: normalizeShortcut(patch.ocrShortcut === undefined
        ? this.settings.ocrShortcut
        : patch.ocrShortcut) ?? '',
      jsonExtractionSchema: patch.jsonExtractionSchema === undefined
        ? this.settings.jsonExtractionSchema
        : String(patch.jsonExtractionSchema).slice(0, 2000),
      maxInputCharacters: normalizeMaxInputCharacters(
        patch.maxInputCharacters ?? this.settings.maxInputCharacters
      ),
      historyEnabled: patch.historyEnabled === undefined
        ? this.settings.historyEnabled
        : Boolean(patch.historyEnabled),
      historyRetentionLimit: normalizeSessionRetentionLimit(
        patch.historyRetentionLimit ?? this.settings.historyRetentionLimit
      ),
      showRecentActions,
      recentActionIds,
      resultWindowBounds: patch.resultWindowBounds === undefined
        ? this.settings.resultWindowBounds
        : this.sanitizeWindowBounds(patch.resultWindowBounds),
      actions
    }
    this.write(nextSettings)
    this.settings = nextSettings
    return this.get()
  }

  private read(): AppSettings {
    if (!existsSync(this.filePath)) return structuredClone(defaults)

    try {
      const persisted = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoredSettings
      const providers = this.readProviders(persisted)
      const actions = this.sanitizeActions(Array.isArray(persisted.actions) ? persisted.actions : defaultActions, false)
      const requestedDefaultProviderId = typeof persisted.defaultProviderId === 'string'
        ? persisted.defaultProviderId.trim()
        : ''
      const defaultProviderId = providers.some((provider) => provider.id === requestedDefaultProviderId)
        ? requestedDefaultProviderId
        : providers[0].id
      const showRecentActions = persisted.showRecentActions === undefined
        ? defaults.showRecentActions
        : Boolean(persisted.showRecentActions)

      return {
        enabled: persisted.enabled === undefined ? defaults.enabled : Boolean(persisted.enabled),
        launchAtLogin: persisted.launchAtLogin === undefined
          ? defaults.launchAtLogin
          : Boolean(persisted.launchAtLogin),
        theme: isThemeMode(persisted.theme) ? persisted.theme : defaults.theme,
        providers,
        defaultProviderId,
        targetLanguage: typeof persisted.targetLanguage === 'string'
          ? persisted.targetLanguage
          : defaults.targetLanguage,
        autoDictionary: persisted.autoDictionary === undefined
          ? defaults.autoDictionary
          : Boolean(persisted.autoDictionary),
        speechEnabled: persisted.speechEnabled === undefined
          ? defaults.speechEnabled
          : Boolean(persisted.speechEnabled),
        speechRate: isSpeechRate(persisted.speechRate) ? persisted.speechRate : defaults.speechRate,
        speechLanguageMode: isSpeechLanguageMode(persisted.speechLanguageMode)
          ? persisted.speechLanguageMode
          : defaults.speechLanguageMode,
        speechAutoStop: persisted.speechAutoStop === undefined
          ? defaults.speechAutoStop
          : Boolean(persisted.speechAutoStop),
        ocrEnabled: persisted.ocrEnabled === undefined
          ? defaults.ocrEnabled
          : Boolean(persisted.ocrEnabled),
        ocrShortcut: normalizeShortcut(typeof persisted.ocrShortcut === 'string'
          ? persisted.ocrShortcut
          : '') ?? defaults.ocrShortcut,
        jsonExtractionSchema: typeof persisted.jsonExtractionSchema === 'string'
          ? persisted.jsonExtractionSchema.slice(0, 2000)
          : defaults.jsonExtractionSchema,
        maxInputCharacters: normalizeMaxInputCharacters(persisted.maxInputCharacters),
        historyEnabled: Boolean(persisted.historyEnabled),
        historyRetentionLimit: normalizeSessionRetentionLimit(persisted.historyRetentionLimit),
        showRecentActions,
        recentActionIds: showRecentActions
          ? sanitizeRecentActionIds(persisted.recentActionIds, actions)
          : [],
        resultWindowBounds: this.sanitizeWindowBounds(persisted.resultWindowBounds),
        actions
      }
    } catch {
      return structuredClone(defaults)
    }
  }

  private readProviders(persisted: StoredSettings): ProviderProfile[] {
    if (Array.isArray(persisted.providers)) {
      const providers = persisted.providers.map((provider) => ({
        id: typeof provider.id === 'string' ? provider.id : '',
        name: typeof provider.name === 'string' ? provider.name : '',
        baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
        apiKey: this.decrypt(typeof provider.encryptedApiKey === 'string' ? provider.encryptedApiKey : ''),
        defaultModel: typeof provider.defaultModel === 'string' ? provider.defaultModel : '',
        ...(typeof provider.defaultTemperature === 'number'
          ? { defaultTemperature: provider.defaultTemperature }
          : {}),
        ...(typeof provider.defaultMaxOutputTokens === 'number'
          ? { defaultMaxOutputTokens: provider.defaultMaxOutputTokens }
          : {})
      }))
      const sanitized = this.sanitizeProviders(providers, false)
      if (sanitized.length) return sanitized
    }

    return [{
      ...DEFAULT_PROVIDER,
      baseUrl: typeof persisted.baseUrl === 'string' ? persisted.baseUrl : DEFAULT_PROVIDER.baseUrl,
      apiKey: this.decrypt(typeof persisted.encryptedApiKey === 'string' ? persisted.encryptedApiKey : ''),
      defaultModel: typeof persisted.model === 'string' ? persisted.model : DEFAULT_PROVIDER.defaultModel
    }]
  }

  private write(settings: AppSettings): void {
    const persisted: PersistedSettings = {
      ...settings,
      providers: settings.providers.map(({ apiKey, ...provider }) => ({
        ...provider,
        encryptedApiKey: this.encrypt(apiKey)
      }))
    }
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(persisted, null, 2), 'utf8')
    renameSync(temporaryPath, this.filePath)
  }

  private encrypt(value: string): string {
    if (!value) return ''
    return safeStorage.encryptString(value).toString('base64')
  }

  private decrypt(value: string): string {
    if (!value) return ''
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      return ''
    }
  }

  private sanitizeProviders(providers: ProviderProfile[], strict: boolean): ProviderProfile[] {
    if (!Array.isArray(providers)) {
      if (strict) throw new Error('Provider 配置格式无效')
      return []
    }

    const ids = new Set<string>()
    const sanitized: ProviderProfile[] = []
    for (const provider of providers) {
      const id = typeof provider?.id === 'string' ? provider.id.trim().slice(0, 80) : ''
      const name = typeof provider?.name === 'string' ? provider.name.trim().slice(0, 40) : ''
      const baseUrl = typeof provider?.baseUrl === 'string' ? provider.baseUrl.trim().slice(0, 500) : ''
      const apiKey = typeof provider?.apiKey === 'string' ? provider.apiKey : ''
      const defaultModel = typeof provider?.defaultModel === 'string'
        ? provider.defaultModel.trim().slice(0, 200)
        : ''

      if (!id || !name || !baseUrl || !defaultModel) {
        if (strict) throw new Error('Provider 的名称、API 地址和默认模型不能为空')
        continue
      }
      if (ids.has(id)) {
        if (strict) throw new Error(`Provider ID 重复：${id}`)
        continue
      }

      if (provider.defaultTemperature !== undefined) {
        validateTemperature(provider.defaultTemperature, `Provider“${name}”`)
      }
      if (provider.defaultMaxOutputTokens !== undefined) {
        validateMaxOutputTokens(provider.defaultMaxOutputTokens, `Provider“${name}”`)
      }

      ids.add(id)
      sanitized.push({
        id,
        name,
        baseUrl,
        apiKey,
        defaultModel,
        ...(provider.defaultTemperature === undefined
          ? {}
          : { defaultTemperature: provider.defaultTemperature }),
        ...(provider.defaultMaxOutputTokens === undefined
          ? {}
          : { defaultMaxOutputTokens: provider.defaultMaxOutputTokens })
      })
    }

    if (strict && !sanitized.length) throw new Error('至少需要保留一个 Provider')
    return sanitized
  }

  private sanitizeActions(actions: SelectionAction[], strict: boolean): SelectionAction[] {
    const sanitized: SelectionAction[] = actions
      .filter((action) => action.id && action.label && action.kind)
      .map((action) => {
        const shortcut = normalizeShortcut(action.shortcut)
        const prompt = action.prompt ? String(action.prompt).slice(0, 2000) : ''
        if (strict) this.validatePrompt(prompt, action.label)
        return {
          id: String(action.id),
          label: String(action.label).slice(0, 20),
          kind: action.kind,
          enabled: Boolean(action.enabled),
          ...(typeof action.pinned === 'boolean' ? { pinned: action.pinned } : {}),
          ...(shortcut ? { shortcut } : {}),
          ...(prompt ? { prompt } : {}),
          ...this.sanitizeRequestProfile(action.requestProfile, action.label),
          ...(action.variants
            ? {
                variants: action.variants
                  .filter((variant) => variant.id && variant.label && variant.prompt)
                  .map((variant) => {
                    const variantPrompt = String(variant.prompt).slice(0, 2000)
                    if (strict) this.validatePrompt(variantPrompt, `${action.label} / ${variant.label}`)
                    return {
                      id: String(variant.id),
                      label: String(variant.label).slice(0, 24),
                      prompt: variantPrompt,
                      enabled: Boolean(variant.enabled)
                    }
                  })
              }
            : {})
        }
      })
    return limitPinnedActions(mergeDefaultActions(sanitized))
  }

  private sanitizeRequestProfile(
    profile: ActionRequestProfile | undefined,
    actionLabel: string
  ): { requestProfile?: ActionRequestProfile } {
    if (!profile) return {}
    const providerId = typeof profile.providerId === 'string' ? profile.providerId.trim().slice(0, 80) : ''
    const model = typeof profile.model === 'string' ? profile.model.trim().slice(0, 200) : ''
    if (profile.temperature !== undefined) validateTemperature(profile.temperature, `动作“${actionLabel}”`)
    if (profile.maxOutputTokens !== undefined) {
      validateMaxOutputTokens(profile.maxOutputTokens, `动作“${actionLabel}”`)
    }

    const requestProfile: ActionRequestProfile = {
      ...(providerId ? { providerId } : {}),
      ...(model ? { model } : {}),
      ...(profile.temperature === undefined ? {} : { temperature: profile.temperature }),
      ...(profile.maxOutputTokens === undefined ? {} : { maxOutputTokens: profile.maxOutputTokens })
    }
    return Object.keys(requestProfile).length ? { requestProfile } : {}
  }

  private validatePrompt(prompt: string, label: string): void {
    const unknown = getUnknownPromptVariables(prompt)
    if (unknown.length) {
      throw new Error(`动作“${label}”包含未知提示词变量：${unknown.map((name) => `{${name}}`).join('、')}`)
    }
  }

  private validateProviderConfiguration(
    providers: ProviderProfile[],
    defaultProviderId: string,
    actions: SelectionAction[]
  ): void {
    if (!providers.some((provider) => provider.id === defaultProviderId)) {
      throw new Error('默认 Provider 不存在')
    }
    const providerIds = new Set(providers.map((provider) => provider.id))
    const invalidAction = actions.find((action) => {
      const providerId = action.requestProfile?.providerId
      return providerId && !providerIds.has(providerId)
    })
    if (invalidAction) throw new Error(`动作“${invalidAction.label}”引用的 Provider 不存在`)
  }

  private sanitizeWindowBounds(bounds: WindowBounds | null | undefined): WindowBounds | null {
    if (!isWindowBounds(bounds)) return null
    return {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(420, Math.round(bounds.width)),
      height: Math.max(360, Math.round(bounds.height))
    }
  }
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isSpeechRate(value: unknown): value is SpeechRate {
  return value === 'slow' || value === 'normal' || value === 'fast'
}

function isSpeechLanguageMode(value: unknown): value is SpeechLanguageMode {
  return value === 'auto' || value === 'system'
}
