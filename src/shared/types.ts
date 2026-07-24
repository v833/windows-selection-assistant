export type ThemeMode = 'system' | 'light' | 'dark'

export type ActionKind = 'translate' | 'explain' | 'summarize' | 'rewrite' | 'custom'

export interface SelectionAction {
  id: string
  label: string
  kind: ActionKind
  enabled: boolean
  prompt?: string
}

export interface AppSettings {
  enabled: boolean
  launchAtLogin: boolean
  theme: ThemeMode
  baseUrl: string
  apiKey: string
  model: string
  targetLanguage: string
  actions: SelectionAction[]
}

export interface AssistantStatus {
  enabled: boolean
  running: boolean
  error?: string
}

export interface SelectionPayload {
  text: string
  programName: string
  actions: SelectionAction[]
  theme: ThemeMode
}

export interface ActionPayload {
  action: SelectionAction
  selectedText: string
  programName: string
  model: string
  theme: ThemeMode
}

export interface AIRunRequest {
  requestId: string
  action: SelectionAction
  selectedText: string
}

export interface AIStreamEvent {
  requestId: string
  type: 'start' | 'delta' | 'done' | 'error'
  content?: string
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
}

export interface SelectionAssistantAPI {
  getSettings: () => Promise<AppSettings>
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  getStatus: () => Promise<AssistantStatus>
  setEnabled: (enabled: boolean) => Promise<AssistantStatus>
  testConnection: (draft: Pick<AppSettings, 'baseUrl' | 'apiKey' | 'model'>) => Promise<{ ok: boolean; message: string }>
  getAppInfo: () => Promise<AppInfo>
  onStatusChanged: (listener: (status: AssistantStatus) => void) => () => void
  onSelectionChanged: (listener: (payload: SelectionPayload) => void) => () => void
  onActionPayload: (listener: (payload: ActionPayload) => void) => () => void
  onAIStream: (listener: (event: AIStreamEvent) => void) => () => void
  toolbarReady: () => void
  resultReady: () => void
  selectAction: (actionId: string) => void
  resizeToolbar: (width: number, height: number) => void
  runAI: (request: AIRunRequest) => void
  cancelAI: (requestId: string) => void
  copyText: (text: string) => Promise<void>
  openSettings: () => void
  closeWindow: () => void
  minimizeWindow: () => void
}
