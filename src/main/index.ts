import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import type { TextSelectionData } from 'selection-hook'
import type { ActionPayload, AIRunRequest, AssistantStatus, SelectionPayload } from '../shared/types'
import { streamCompletion, testConnection } from './ai'
import { SelectionService } from './selection'
import { SettingsStore } from './settings'

let mainWindow: BrowserWindow | null = null
let toolbarWindow: BrowserWindow | null = null
let resultWindow: BrowserWindow | null = null
let tray: Tray | null = null
let settingsStore: SettingsStore
let selectionService: SelectionService
let lastSelection: TextSelectionData | null = null
let pendingAction: ActionPayload | null = null
let toolbarReady = false
let resultReady = false
let isQuitting = false
const requests = new Map<string, AbortController>()

const preloadPath = join(__dirname, '../preload/index.js')

function loadRenderer(window: BrowserWindow, view: 'main' | 'toolbar' | 'result'): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('view', view)
    void window.loadURL(url.toString())
    return
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 820,
    minHeight: 580,
    show: false,
    title: '划词助手',
    backgroundColor: '#f5f6f4',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f5f6f4',
      symbolColor: '#262a28',
      height: 44
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })
  loadRenderer(window, 'main')
  return window
}

function createToolbarWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 350,
    height: 48,
    minWidth: 220,
    maxWidth: 720,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(window, 'toolbar')
  return window
}

function createResultWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 560,
    height: 520,
    minWidth: 420,
    minHeight: 360,
    show: false,
    frame: false,
    backgroundColor: '#f8f9f7',
    alwaysOnTop: true,
    resizable: true,
    hasShadow: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const webContentsId = window.webContents.id
  window.on('closed', () => {
    abortRequestsFor(webContentsId)
    resultWindow = null
    resultReady = false
  })
  loadRenderer(window, 'result')
  return window
}

function showMainWindow(): void {
  mainWindow ??= createMainWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function selectionPayload(): SelectionPayload | null {
  if (!lastSelection) return null
  const settings = settingsStore.get()
  return {
    text: lastSelection.text,
    programName: lastSelection.programName,
    actions: settings.actions.filter((action) => action.enabled),
    theme: settings.theme
  }
}

function sendSelection(): void {
  const payload = selectionPayload()
  if (payload && toolbarReady && toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.webContents.send('selection:changed', payload)
  }
}

function showAction(actionId: string): void {
  if (!lastSelection) return
  const settings = settingsStore.get()
  const action = settings.actions.find((item) => item.id === actionId && item.enabled)
  if (!action) return

  pendingAction = {
    action,
    selectedText: lastSelection.text,
    programName: lastSelection.programName,
    model: settings.model,
    theme: settings.theme
  }
  toolbarWindow?.hide()
  resultWindow ??= createResultWindow()
  positionResultWindow(resultWindow)
  resultWindow.show()
  resultWindow.focus()
  if (resultReady) resultWindow.webContents.send('action:payload', pendingAction)
}

function positionResultWindow(window: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const bounds = window.getBounds()
  const toolbarBounds = toolbarWindow?.getBounds()
  let x = toolbarBounds ? Math.round(toolbarBounds.x + (toolbarBounds.width - bounds.width) / 2) : area.x + area.width - bounds.width - 24
  let y = toolbarBounds ? toolbarBounds.y + toolbarBounds.height + 8 : area.y + 24
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - bounds.width - 8))
  if (y + bounds.height > area.y + area.height - 8 && toolbarBounds) y = toolbarBounds.y - bounds.height - 8
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - bounds.height - 8))
  window.setPosition(x, y, false)
}

function broadcastStatus(status: AssistantStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('assistant:status-changed', status)
  }
  rebuildTrayMenu()
}

function rebuildTrayMenu(): void {
  if (!tray || !settingsStore || !selectionService) return
  const settings = settingsStore.get()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开设置', click: showMainWindow },
      {
        label: '启用划词助手',
        type: 'checkbox',
        checked: settings.enabled,
        click: (item) => {
          settingsStore.update({ enabled: item.checked })
          selectionService.setEnabled(item.checked)
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

function createTray(): void {
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(process.cwd(), 'resources/icon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('划词助手')
  tray.on('double-click', showMainWindow)
  rebuildTrayMenu()
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settingsStore.get())
  ipcMain.handle('settings:save', (_event, patch) => {
    const before = settingsStore.get()
    const settings = settingsStore.update(patch)
    if (settings.enabled !== before.enabled) selectionService.setEnabled(settings.enabled)
    if (settings.launchAtLogin !== before.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    }
    sendSelection()
    rebuildTrayMenu()
    return settings
  })
  ipcMain.handle('assistant:status', () => selectionService.status())
  ipcMain.handle('assistant:set-enabled', (_event, enabled: boolean) => {
    settingsStore.update({ enabled })
    const status = selectionService.setEnabled(enabled)
    rebuildTrayMenu()
    return status
  })
  ipcMain.handle('ai:test', (_event, draft) => testConnection(draft))
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome }))
  ipcMain.handle('clipboard:write', (_event, text: string) => clipboard.writeText(text))

  ipcMain.on('toolbar:ready', () => {
    toolbarReady = true
    sendSelection()
  })
  ipcMain.on('result:ready', () => {
    resultReady = true
    if (pendingAction && resultWindow) resultWindow.webContents.send('action:payload', pendingAction)
  })
  ipcMain.on('selection:action', (_event, actionId: string) => showAction(actionId))
  ipcMain.on('toolbar:resize', (_event, size: { width: number; height: number }) => {
    if (!toolbarWindow || toolbarWindow.isDestroyed()) return
    const width = Math.max(220, Math.min(720, Math.ceil(size.width)))
    const height = Math.max(48, Math.min(120, Math.ceil(size.height)))
    toolbarWindow.setSize(width, height, false)
  })
  ipcMain.on('settings:open', () => {
    toolbarWindow?.hide()
    showMainWindow()
  })
  ipcMain.on('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window === mainWindow) window.hide()
    else if (window === toolbarWindow) window.hide()
    else window.close()
  })
  ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())

  ipcMain.on('ai:run', (event, request: AIRunRequest) => {
    const key = requestKey(event.sender.id, request.requestId)
    requests.get(key)?.abort()
    const controller = new AbortController()
    requests.set(key, controller)
    event.sender.send('ai:stream', { requestId: request.requestId, type: 'start' })

    void streamCompletion(settingsStore.get(), request.action, request.selectedText, controller.signal, (content) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:stream', { requestId: request.requestId, type: 'delta', content })
    })
      .then(() => {
        if (!event.sender.isDestroyed()) event.sender.send('ai:stream', { requestId: request.requestId, type: 'done' })
      })
      .catch((error) => {
        if (controller.signal.aborted || event.sender.isDestroyed()) return
        event.sender.send('ai:stream', {
          requestId: request.requestId,
          type: 'error',
          content: error instanceof Error ? error.message : '请求失败'
        })
      })
      .finally(() => requests.delete(key))
  })
  ipcMain.on('ai:cancel', (event, requestId: string) => requests.get(requestKey(event.sender.id, requestId))?.abort())
}

function requestKey(webContentsId: number, requestId: string): string {
  return `${webContentsId}:${requestId}`
}

function abortRequestsFor(webContentsId: number): void {
  for (const [key, controller] of requests) {
    if (key.startsWith(`${webContentsId}:`)) {
      controller.abort()
      requests.delete(key)
    }
  }
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()

app.on('second-instance', showMainWindow)

app.whenReady().then(() => {
  settingsStore = new SettingsStore()
  toolbarWindow = createToolbarWindow()
  selectionService = new SelectionService(
    () => toolbarWindow,
    (selection) => {
      lastSelection = selection
      sendSelection()
    },
    broadcastStatus
  )
  registerIpc()
  createTray()
  mainWindow = createMainWindow()
  const settings = settingsStore.get()
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
  selectionService.setEnabled(settings.enabled)
})

app.on('before-quit', () => {
  isQuitting = true
  selectionService?.cleanup()
  for (const controller of requests.values()) controller.abort()
})

app.on('window-all-closed', () => {
  // The tray owns the application lifetime.
})
