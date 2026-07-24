import type { AIErrorInfo } from './types'

interface ErrorLike {
  name?: string
  message?: string
  status?: number
  detail?: string
  code?: string
}

export function classifyAIError(error: unknown): AIErrorInfo {
  const value = error && typeof error === 'object' ? error as ErrorLike : {}
  const status = Number.isFinite(value.status) ? value.status : undefined
  const detail = `${value.message ?? ''} ${value.detail ?? ''} ${value.code ?? ''}`.toLowerCase()

  if (value.name === 'AbortError') {
    return errorInfo('cancelled', '请求已取消', '本次生成已停止。', false, false, status)
  }
  if (value.name === 'TimeoutError' || /timed?\s*out|timeout|超时/.test(detail)) {
    return errorInfo('timeout', '请求超时', '模型服务响应时间过长，请重试或缩短输入内容。', true, false, status)
  }
  if (status === 401 || status === 403 || /api.?key|unauthori[sz]ed|forbidden|鉴权|认证/.test(detail)) {
    return errorInfo('authentication', '认证失败', 'API Key 无效或没有访问权限，请检查模型设置。', false, true, status)
  }
  if (status === 404 || /model.*(?:not found|does not exist|unknown)|模型.*(?:不存在|无效)/.test(detail)) {
    return errorInfo('model', '模型不可用', '模型名称不存在或当前账号无权使用，请检查模型设置。', false, true, status)
  }
  if (status === 429 || /rate.?limit|too many requests|quota|额度|频率/.test(detail)) {
    return errorInfo('rate_limit', '请求受限', '请求过于频繁或额度不足，请稍后重试。', true, false, status)
  }
  if (/请先填写|api 地址|模型名称/.test(detail)) {
    return errorInfo('configuration', '配置不完整', '请先完善 API 地址和模型名称。', false, true, status)
  }
  if (status !== undefined && status >= 500) {
    return errorInfo('server', '服务暂时异常', `模型服务返回错误${status ? `（${status}）` : ''}，请稍后重试。`, true, false, status)
  }
  if (value.name === 'TypeError' || /fetch failed|network|econn|enotfound|socket|网络/.test(detail)) {
    return errorInfo('network', '网络连接失败', '无法连接模型服务，请检查网络、代理和 API 地址。', true, true, status)
  }
  if (status !== undefined && status >= 400) {
    return errorInfo('server', '请求被服务拒绝', `模型服务返回错误（${status}），请检查输入后重试。`, true, false, status)
  }
  return errorInfo('unknown', '请求失败', '模型请求未能完成，请重试。', true, false, status)
}

function errorInfo(
  kind: AIErrorInfo['kind'],
  title: string,
  message: string,
  canRetry: boolean,
  openSettings: boolean,
  status?: number
): AIErrorInfo {
  return { kind, title, message, canRetry, openSettings, ...(status === undefined ? {} : { status }) }
}
