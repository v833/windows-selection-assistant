export type ThemeMode = 'system' | 'light' | 'dark'
export type SettingsSection = 'general' | 'model' | 'actions' | 'history' | 'about'
export type SelectionSource = 'selection' | 'ocr'
export type AIErrorKind = 'authentication' | 'model' | 'rate_limit' | 'network' | 'timeout' | 'cancelled' | 'server' | 'configuration' | 'unknown'
export type SessionContextMode = 'full' | 'truncate' | 'summarize'
export type SessionExportFormat = 'markdown' | 'json'
export type SpeechRate = 'slow' | 'normal' | 'fast'
export type SpeechLanguageMode = 'auto' | 'system'
export type SpeechState = 'idle' | 'starting' | 'speaking' | 'error'
export type SpeechCulture = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR'
export type SpeechSegmentKind =
  | 'source'
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'quote'
  | 'translation'
  | 'back-translation'
  | 'answer'
  | 'selection'

export interface SpeechSegment {
  id: string
  text: string
  label: string
  kind: SpeechSegmentKind
  language?: string
  culture?: SpeechCulture
}

export interface SpeechStatus {
  state: SpeechState
  speechId?: string
  message?: string
}

export type ActionKind = 'chat' | 'translate' | 'speak' | 'explain' | 'summarize' | 'rewrite' | 'writing' | 'extract' | 'analysis' | 'code' | 'custom'

export interface ActionVariant {
  id: string
  label: string
  enabled: boolean
  prompt: string
}

export interface ProviderProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  defaultModel: string
  defaultTemperature?: number
  defaultMaxOutputTokens?: number
}

export interface ActionRequestProfile {
  providerId?: string
  model?: string
  temperature?: number
  maxOutputTokens?: number
}

export interface ResolvedRequestProfile {
  providerId: string
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxOutputTokens?: number
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
  requestProfile?: ActionRequestProfile
  variants?: ActionVariant[]
}

export interface ConversationSession {
  id: string
  title: string
  selectedText: string
  contextText: string
  contextMode: SessionContextMode
  contextStartIndex: number
  programName: string
  action: SelectionAction
  model: string
  sourceLanguage?: string
  targetLanguage?: string
  createdAt: string
  updatedAt: string
  messages: AIConversationMessage[]
}

export interface SessionStorageInfo {
  path: string
  encrypted: boolean
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
  providers: ProviderProfile[]
  defaultProviderId: string
  targetLanguage: string
  autoDictionary: boolean
  speechEnabled: boolean
  speechRate: SpeechRate
  speechLanguageMode: SpeechLanguageMode
  speechAutoStop: boolean
  ocrEnabled: boolean
  ocrShortcut: string
  jsonExtractionSchema: string
  maxInputCharacters: number
  historyEnabled: boolean
  historyRetentionLimit: number
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
  source?: SelectionSource
}

export interface ActionPayload {
  action: SelectionAction
  selectedText: string
  programName: string
  model: string
  maxInputCharacters: number
  historyEnabled: boolean
  theme: ThemeMode
  sourceLanguage?: string
  targetLanguage?: string
  source?: SelectionSource
  session?: ConversationSession
}

export interface OcrCaptureRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface CaptureImagePayload {
  dataUrl: string
  scale: number
}

export interface PdfRenderPayload {
  id: string
  data: Uint8Array
  dpi: number
}

export interface PdfPagePayload {
  id: string
  index: number
  dataUrl: string
}

export interface AIRunRequest {
  requestId: string
  action: SelectionAction
  selectedText: string
  programName: string
  conversation: AIConversationMessage[]
}

export interface AIStreamEvent {
  requestId: string
  type: 'start' | 'delta' | 'done' | 'error'
  content?: string
  error?: AIErrorInfo
}

export interface AIErrorInfo {
  kind: AIErrorKind
  title: string
  message: string
  canRetry: boolean
  openSettings: boolean
  status?: number
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
}

export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  version?: string
  percent?: number
  message?: string
}

export interface SelectionAssistantAPI {
  getSettings: () => Promise<AppSettings>
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  getStatus: () => Promise<AssistantStatus>
  setEnabled: (enabled: boolean) => Promise<AssistantStatus>
  testConnection: (draft: ProviderProfile) => Promise<{ ok: boolean; message: string }>
  getAppInfo: () => Promise<AppInfo>
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<UpdateStatus>
  downloadUpdate: () => Promise<UpdateStatus>
  installUpdate: () => void
  onUpdateStatusChanged: (listener: (status: UpdateStatus) => void) => () => void
  onStatusChanged: (listener: (status: AssistantStatus) => void) => () => void
  onSelectionChanged: (listener: (payload: SelectionPayload) => void) => () => void
  onActionPayload: (listener: (payload: ActionPayload) => void) => () => void
  onAIStream: (listener: (event: AIStreamEvent) => void) => () => void
  getSpeechStatus: () => Promise<SpeechStatus>
  onSpeechStatusChanged: (listener: (status: SpeechStatus) => void) => () => void
  onSettingsNavigate: (listener: (section: SettingsSection) => void) => () => void
  listSessions: () => Promise<ConversationSession[]>
  saveSession: (session: ConversationSession) => Promise<ConversationSession | null>
  renameSession: (sessionId: string, title: string) => Promise<ConversationSession | null>
  deleteSession: (sessionId: string) => Promise<boolean>
  deleteAllSessions: () => Promise<void>
  openSession: (sessionId: string) => void
  exportSession: (sessionId: string, format: SessionExportFormat) => Promise<string | null>
  getSessionStorageInfo: () => Promise<SessionStorageInfo>
  toolbarReady: () => void
  resultReady: () => void
  selectAction: (actionId: string, variantId?: string) => void
  openActionMenu: () => void
  resizeToolbar: (width: number, height: number) => void
  startOcrCapture: () => void
  startPdfOcr: () => void
  captureReady: () => void
  confirmCaptureRegion: (region: OcrCaptureRegion) => void
  cancelCapture: () => void
  onCaptureImage: (listener: (payload: CaptureImagePayload) => void) => () => void
  pdfReady: () => void
  onPdfRender: (listener: (payload: PdfRenderPayload) => void) => () => void
  sendPdfPage: (id: string, index: number, dataUrl: string) => void
  finishPdf: (id: string) => void
  failPdf: (id: string, error: string) => void
  runAI: (request: AIRunRequest) => void
  cancelAI: (requestId: string) => void
  speakText: (text: string, speechId: string, culture?: SpeechCulture) => void
  stopSpeaking: () => void
  copyText: (text: string) => Promise<void>
  openExternal: (url: string) => Promise<boolean>
  openSettings: (section?: SettingsSection) => void
  closeWindow: () => void
  minimizeWindow: () => void
}
