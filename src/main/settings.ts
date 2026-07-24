import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultActions, mergeDefaultActions } from '../shared/actions'
import { DEFAULT_MAX_INPUT_CHARACTERS, normalizeMaxInputCharacters } from '../shared/textLimits'
import { limitPinnedActions, normalizeShortcut, sanitizeRecentActionIds } from '../shared/toolbar'
import type { AppSettings, SelectionAction, WindowBounds } from '../shared/types'
import { isWindowBounds } from '../shared/windowBounds'

interface PersistedSettings extends Omit<AppSettings, 'apiKey'> {
  encryptedApiKey: string
}

const defaults: AppSettings = {
  enabled: true,
  launchAtLogin: false,
  theme: 'system',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
  targetLanguage: '简体中文',
  autoDictionary: true,
  jsonExtractionSchema: '',
  maxInputCharacters: DEFAULT_MAX_INPUT_CHARACTERS,
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
    const actions = patch.actions ? this.sanitizeActions(patch.actions) : this.settings.actions
    const showRecentActions = patch.showRecentActions === undefined
      ? this.settings.showRecentActions
      : Boolean(patch.showRecentActions)
    const recentActionIds = showRecentActions
      ? sanitizeRecentActionIds(patch.recentActionIds ?? this.settings.recentActionIds, actions)
      : []
    const maxInputCharacters = normalizeMaxInputCharacters(
      patch.maxInputCharacters ?? this.settings.maxInputCharacters
    )
    const nextSettings: AppSettings = {
      ...this.settings,
      ...patch,
      showRecentActions,
      recentActionIds,
      maxInputCharacters,
      resultWindowBounds: patch.resultWindowBounds === undefined
        ? this.settings.resultWindowBounds
        : this.sanitizeWindowBounds(patch.resultWindowBounds),
      jsonExtractionSchema: patch.jsonExtractionSchema === undefined
        ? this.settings.jsonExtractionSchema
        : String(patch.jsonExtractionSchema).slice(0, 2000),
      actions
    }
    this.write(nextSettings)
    this.settings = nextSettings
    return this.get()
  }

  private read(): AppSettings {
    if (!existsSync(this.filePath)) return structuredClone(defaults)

    try {
      const persisted = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedSettings>
      const actions = this.sanitizeActions(persisted.actions ?? defaultActions)
      const showRecentActions = persisted.showRecentActions === undefined ? true : Boolean(persisted.showRecentActions)
      return {
        ...defaults,
        ...persisted,
        apiKey: this.decrypt(persisted.encryptedApiKey ?? ''),
        jsonExtractionSchema: typeof persisted.jsonExtractionSchema === 'string'
          ? persisted.jsonExtractionSchema.slice(0, 2000)
          : '',
        maxInputCharacters: normalizeMaxInputCharacters(persisted.maxInputCharacters),
        showRecentActions,
        recentActionIds: showRecentActions ? sanitizeRecentActionIds(persisted.recentActionIds, actions) : [],
        resultWindowBounds: this.sanitizeWindowBounds(persisted.resultWindowBounds),
        actions
      }
    } catch {
      return structuredClone(defaults)
    }
  }

  private write(settings: AppSettings): void {
    const { apiKey, ...rest } = settings
    const persisted: PersistedSettings = {
      ...rest,
      encryptedApiKey: this.encrypt(apiKey)
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

  private sanitizeActions(actions: SelectionAction[]): SelectionAction[] {
    const sanitized: SelectionAction[] = actions
      .filter((action) => action.id && action.label && action.kind)
      .map((action) => {
        const shortcut = normalizeShortcut(action.shortcut)
        return {
          id: String(action.id),
          label: String(action.label).slice(0, 20),
          kind: action.kind,
          enabled: Boolean(action.enabled),
          ...(typeof action.pinned === 'boolean' ? { pinned: action.pinned } : {}),
          ...(shortcut ? { shortcut } : {}),
          ...(action.prompt ? { prompt: String(action.prompt).slice(0, 2000) } : {}),
          ...(action.variants
            ? {
                variants: action.variants
                  .filter((variant) => variant.id && variant.label && variant.prompt)
                  .map((variant) => ({
                    id: String(variant.id),
                    label: String(variant.label).slice(0, 24),
                    prompt: String(variant.prompt).slice(0, 2000),
                    enabled: Boolean(variant.enabled)
                  }))
              }
            : {})
        }
      })
    return limitPinnedActions(mergeDefaultActions(sanitized))
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
