export type ThemeMode = 'system' | 'light' | 'dark'

export type ActionKind = 'chat' | 'translate' | 'explain' | 'summarize' | 'rewrite' | 'writing' | 'extract' | 'analysis' | 'code' | 'custom'

export interface ActionVariant {
  id: string
  label: string
  enabled: boolean
  prompt: string
}

export interface AIConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SelectionAction {
  id: string
  label: string
  kind: ActionKind
  enabled: boolean
  pinned?: boolean
  shortcut?: string
  prompt?: string
  variants?: ActionVariant[]
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AppSettings {
  enabled: boolean
  launchAtLogin: boolean
  theme: ThemeMode
  baseUrl: string
  apiKey: string
  model: string
  targetLanguage: string
  autoDictionary: boolean
  jsonExtractionSchema: string
  showRecentActions: boolean
  recentActionIds: string[]
  resultWindowBounds: WindowBounds | null
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
  hasMoreActions: boolean
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
  conversation: AIConversationMessage[]
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
  selectAction: (actionId: string, variantId?: string) => void
  openActionMenu: () => void
  resizeToolbar: (width: number, height: number) => void
  runAI: (request: AIRunRequest) => void
  cancelAI: (requestId: string) => void
  copyText: (text: string) => Promise<void>
  openSettings: () => void
  closeWindow: () => void
  minimizeWindow: () => void
}
