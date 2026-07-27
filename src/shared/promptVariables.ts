export const SUPPORTED_PROMPT_VARIABLES = ['text', 'language', 'program', 'question'] as const

export type PromptVariableName = typeof SUPPORTED_PROMPT_VARIABLES[number]
export type PromptVariableValues = Record<PromptVariableName, string>

const promptVariablePattern = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}|\{([A-Za-z][A-Za-z0-9_]*)\}/g
const supportedVariables = new Set<string>(SUPPORTED_PROMPT_VARIABLES)

export function getUnknownPromptVariables(prompt: string): string[] {
  const unknown = new Set<string>()
  for (const match of prompt.matchAll(promptVariablePattern)) {
    const variable = match[2]
    if (variable && !supportedVariables.has(variable)) unknown.add(variable)
  }
  return [...unknown]
}

export function validatePromptVariables(prompt: string): void {
  const unknown = getUnknownPromptVariables(prompt)
  if (unknown.length) throw new Error(`未知提示词变量：${unknown.map((name) => `{${name}}`).join('、')}`)
}

export function hasPromptVariable(prompt: string, variable: PromptVariableName): boolean {
  for (const match of prompt.matchAll(promptVariablePattern)) {
    if (match[2] === variable) return true
  }
  return false
}

export function renderPromptTemplate(prompt: string, values: PromptVariableValues): string {
  return prompt.replace(promptVariablePattern, (_match, escaped: string | undefined, variable: string | undefined) => {
    if (escaped) return `{${escaped}}`
    return variable && supportedVariables.has(variable) ? values[variable as PromptVariableName] : `{${variable ?? ''}}`
  })
}
