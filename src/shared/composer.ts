export interface ComposerKeyState {
  key: string
  shiftKey: boolean
  isComposing: boolean
  keyCode?: number
}

export function shouldSubmitComposer(state: ComposerKeyState): boolean {
  return state.key === 'Enter' && !state.shiftKey && !state.isComposing && state.keyCode !== 229
}
