import { describe, expect, it } from 'vitest'
import { classifyAIError } from '../src/shared/aiErrors'

describe('AI error classification', () => {
  it.each([
    [401, 'authentication'],
    [404, 'model'],
    [429, 'rate_limit'],
    [503, 'server']
  ] as const)('maps HTTP %s to %s', (status, kind) => {
    expect(classifyAIError(Object.assign(new Error('request failed'), { status })).kind).toBe(kind)
  })

  it('distinguishes network, timeout and cancellation errors', () => {
    expect(classifyAIError(new TypeError('fetch failed')).kind).toBe('network')
    expect(classifyAIError(new DOMException('请求超时', 'TimeoutError')).kind).toBe('timeout')
    expect(classifyAIError(new DOMException('aborted', 'AbortError')).kind).toBe('cancelled')
  })

  it('marks authentication and model errors as settings-related', () => {
    expect(classifyAIError(Object.assign(new Error(), { status: 401 })).openSettings).toBe(true)
    expect(classifyAIError(Object.assign(new Error(), { status: 404 })).openSettings).toBe(true)
  })
})
