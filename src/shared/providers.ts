import type { AppSettings, ProviderProfile, ResolvedRequestProfile, SelectionAction } from './types'

export const DEFAULT_PROVIDER_ID = 'default-provider'
export const DEFAULT_PROVIDER: ProviderProfile = {
  id: DEFAULT_PROVIDER_ID,
  name: '默认 Provider',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  defaultModel: 'gpt-4.1-mini'
}

export const MAX_OUTPUT_TOKENS = 128_000

export function resolveRequestProfile(settings: AppSettings, action: SelectionAction): ResolvedRequestProfile {
  const requestedProviderId = action.requestProfile?.providerId?.trim() || settings.defaultProviderId
  const provider = settings.providers.find((item) => item.id === requestedProviderId)
  if (!provider) throw new Error(`动作“${action.label}”引用的 Provider 不存在`)

  const baseUrl = provider.baseUrl.trim()
  const model = action.requestProfile?.model?.trim() || provider.defaultModel.trim()
  if (!baseUrl) throw new Error(`Provider“${provider.name}”缺少 API 地址`)
  if (!model) throw new Error(`动作“${action.label}”缺少可用模型`)

  const temperature = action.requestProfile?.temperature
    ?? provider.defaultTemperature
    ?? (action.kind === 'chat' ? 0.4 : 0.2)
  validateTemperature(temperature, `动作“${action.label}”`)

  const maxOutputTokens = action.requestProfile?.maxOutputTokens ?? provider.defaultMaxOutputTokens
  if (maxOutputTokens !== undefined) validateMaxOutputTokens(maxOutputTokens, `动作“${action.label}”`)

  return {
    providerId: provider.id,
    providerName: provider.name,
    baseUrl,
    apiKey: provider.apiKey.trim(),
    model,
    temperature,
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens })
  }
}

export function validateTemperature(value: number, owner: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${owner}的温度必须在 0 到 2 之间`)
  }
}

export function validateMaxOutputTokens(value: number, owner: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_OUTPUT_TOKENS) {
    throw new Error(`${owner}的最大输出必须是 1 到 ${MAX_OUTPUT_TOKENS} 的整数`)
  }
}
