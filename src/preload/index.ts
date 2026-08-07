import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActionPayload,
  AIStreamEvent,
  AppSettings,
  AssistantStatus,
  CaptureImagePayload,
  ConversationSession,
  PdfPagePayload,
  PdfRenderPayload,
  SelectionAssistantAPI,
  SelectionPayload,
  SessionExportFormat,
  SettingsSection,
  SpeechCulture,
  SpeechStatus,
  UpdateStatus
} from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: SelectionAssistantAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', patch),
  getStatus: () => ipcRenderer.invoke('assistant:status'),
  setEnabled: (enabled: boolean) => ipcRenderer.invoke('assistant:set-enabled', enabled),
  testConnection: (draft) => ipcRenderer.invoke('ai:test', draft),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  onStatusChanged: (listener: (status: AssistantStatus) => void) => subscribe('assistant:status-changed', listener),
  onSelectionChanged: (listener: (payload: SelectionPayload) => void) => subscribe('selection:changed', listener),
  onActionPayload: (listener: (payload: ActionPayload) => void) => subscribe('action:payload', listener),
  onAIStream: (listener: (event: AIStreamEvent) => void) => subscribe('ai:stream', listener),
  getSpeechStatus: () => ipcRenderer.invoke('speech:status'),
  onSpeechStatusChanged: (listener: (status: SpeechStatus) => void) => subscribe('speech:status-changed', listener),
  getUpdateStatus: () => ipcRenderer.invoke('app:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('app:update-download'),
  installUpdate: () => ipcRenderer.send('app:update-install'),
  onUpdateStatusChanged: (listener: (status: UpdateStatus) => void) => subscribe('app:update-status-changed', listener),
  onSettingsNavigate: (listener: (section: SettingsSection) => void) => subscribe('settings:navigate', listener),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  saveSession: (session: ConversationSession) => ipcRenderer.invoke('sessions:save', session),
  renameSession: (sessionId: string, title: string) => ipcRenderer.invoke('sessions:rename', sessionId, title),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('sessions:delete', sessionId),
  deleteAllSessions: () => ipcRenderer.invoke('sessions:delete-all'),
  openSession: (sessionId: string) => ipcRenderer.send('sessions:open', sessionId),
  exportSession: (sessionId: string, format: SessionExportFormat) => ipcRenderer.invoke('sessions:export', sessionId, format),
  getSessionStorageInfo: () => ipcRenderer.invoke('sessions:storage-info'),
  toolbarReady: () => ipcRenderer.send('toolbar:ready'),
  resultReady: () => ipcRenderer.send('result:ready'),
  selectAction: (actionId: string, variantId?: string) => ipcRenderer.send('selection:action', actionId, variantId),
  openActionMenu: () => ipcRenderer.send('toolbar:more'),
  resizeToolbar: (width: number, height: number) => ipcRenderer.send('toolbar:resize', { width, height }),
  startOcrCapture: () => ipcRenderer.send('ocr:start'),
  startPdfOcr: () => ipcRenderer.send('ocr:pdf'),
  captureReady: () => ipcRenderer.send('capture:ready'),
  confirmCaptureRegion: (region) => ipcRenderer.send('capture:region', region),
  cancelCapture: () => ipcRenderer.send('capture:cancel'),
  onCaptureImage: (listener: (payload: CaptureImagePayload) => void) => subscribe('capture:image', listener),
  pdfReady: () => ipcRenderer.send('pdf:ready'),
  onPdfRender: (listener: (payload: PdfRenderPayload) => void) => subscribe('pdf:render', listener),
  sendPdfPage: (id: string, index: number, dataUrl: string) => ipcRenderer.send('pdf:page', { id, index, dataUrl }),
  finishPdf: (id: string) => ipcRenderer.send('pdf:done', id),
  failPdf: (id: string, error: string) => ipcRenderer.send('pdf:error', { id, error }),
  runAI: (request) => ipcRenderer.send('ai:run', request),
  cancelAI: (requestId: string) => ipcRenderer.send('ai:cancel', requestId),
  speakText: (text: string, speechId: string, culture?: SpeechCulture) => ipcRenderer.send('speech:speak', text, speechId, culture),
  stopSpeaking: () => ipcRenderer.send('speech:stop'),
  copyText: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  openSettings: (section?: SettingsSection) => ipcRenderer.send('settings:open', section),
  closeWindow: () => ipcRenderer.send('window:close'),
  minimizeWindow: () => ipcRenderer.send('window:minimize')
}

contextBridge.exposeInMainWorld('selectionAPI', api)
