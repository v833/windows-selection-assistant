import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActionPayload,
  AIStreamEvent,
  AppSettings,
  AssistantStatus,
  SelectionAssistantAPI,
  SelectionPayload
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
  toolbarReady: () => ipcRenderer.send('toolbar:ready'),
  resultReady: () => ipcRenderer.send('result:ready'),
  selectAction: (actionId: string) => ipcRenderer.send('selection:action', actionId),
  resizeToolbar: (width: number, height: number) => ipcRenderer.send('toolbar:resize', { width, height }),
  runAI: (request) => ipcRenderer.send('ai:run', request),
  cancelAI: (requestId: string) => ipcRenderer.send('ai:cancel', requestId),
  copyText: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  openSettings: () => ipcRenderer.send('settings:open'),
  closeWindow: () => ipcRenderer.send('window:close'),
  minimizeWindow: () => ipcRenderer.send('window:minimize')
}

contextBridge.exposeInMainWorld('selectionAPI', api)
