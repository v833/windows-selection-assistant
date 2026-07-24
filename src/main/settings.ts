import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultActions, mergeDefaultActions } from '../shared/actions'
import type { AppSettings, SelectionAction } from '../shared/types'

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
  actions: defaultActions
}

export class SettingsStore {
  private readonly filePath = join(app.getPath('userData'), 'settings.json')
  private settings = this.read()

  get(): AppSettings {
    return structuredClone(this.settings)
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      jsonExtractionSchema: patch.jsonExtractionSchema === undefined
        ? this.settings.jsonExtractionSchema
        : String(patch.jsonExtractionSchema).slice(0, 2000),
      actions: patch.actions ? this.sanitizeActions(patch.actions) : this.settings.actions
    }
    this.write()
    return this.get()
  }

  private read(): AppSettings {
    if (!existsSync(this.filePath)) return structuredClone(defaults)

    try {
      const persisted = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedSettings>
      return {
        ...defaults,
        ...persisted,
        apiKey: this.decrypt(persisted.encryptedApiKey ?? ''),
        jsonExtractionSchema: typeof persisted.jsonExtractionSchema === 'string'
          ? persisted.jsonExtractionSchema.slice(0, 2000)
          : '',
        actions: this.sanitizeActions(persisted.actions ?? defaultActions)
      }
    } catch {
      return structuredClone(defaults)
    }
  }

  private write(): void {
    const { apiKey, ...rest } = this.settings
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
      .map((action) => ({
        id: String(action.id),
        label: String(action.label).slice(0, 20),
        kind: action.kind,
        enabled: Boolean(action.enabled),
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
      }))
    return mergeDefaultActions(sanitized)
  }
}
