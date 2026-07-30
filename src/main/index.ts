import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  safeStorage,
  screen,
  shell,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron'
import { autoUpdater } from 'electron-updater'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TextSelectionData } from 'selection-hook'
import { getEnabledActionVariants, resolveActionVariant } from '../shared/actions'
import { classifyAIError } from '../shared/aiErrors'
import { sanitizeExternalUrl } from '../shared/markdown'
import { resolveRequestProfile } from '../shared/providers'
import { serializeSession } from '../shared/sessions'
import { detectLanguageLabel, detectSpeechCulture, isSpeechCulture } from '../shared/speech'
import {
  groupActionsForMenu,
  normalizeShortcut,
  recordRecentAction,
  sanitizeRecentActionIds,
  splitToolbarActions,
  validateActionShortcuts
} from '../shared/toolbar'
import type {
  ActionPayload,
  AIRunRequest,
  AppSettings,
  AssistantStatus,
  ConversationSession,
  SelectionAction,
  SelectionPayload,
  SessionExportFormat,
  SettingsSection,
  SpeechStatus,
  UpdateStatus,
  WindowBounds
} from '../shared/types'
import { fitWindowBoundsToArea } from '../shared/windowBounds'
import { streamCompletion, testConnection } from './ai'
import { SelectionService } from './selection'
import { SessionStore } from './sessionStore'
import { SettingsStore } from './settings'
import { SpeechService } from './speech'

let mainWindow: BrowserWindow | null = null
let toolbarWindow: BrowserWindow | null = null
let resultWindow: BrowserWindow | null = null
let tray: Tray | null = null
let settingsStore: SettingsStore
let sessionStore: SessionStore
let selectionService: SelectionService
let speechService: SpeechService
let lastSelection: TextSelectionData | null = null
let pendingAction: ActionPayload | null = null
let toolbarReady = false
let resultReady = false
let isQuitting = false
let resultWindowHasCustomBounds = false
let ignoreResultBoundsEvents = false
let resultBoundsTimer: NodeJS.Timeout | null = null
let ignoreResultBoundsTimer: NodeJS.Timeout | null = null
let updateCheckTimer: NodeJS.Timeout | null = null
const requests = new Map<string, AbortController>()
const actionMenuIconCache = new Map<string, NativeImage>()
let updateStatus: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() }

const preloadPath = join(__dirname, '../preload/index.js')
const titleBarHeight = 44

function nativeWindowColors(): { background: string; surface: string; symbols: string } {
  return nativeTheme.shouldUseDarkColors
    ? { background: '#1b1f27', surface: '#20252e', symbols: '#eef1f6' }
    : { background: '#f5f7fa', surface: '#fbfcfd', symbols: '#2b3340' }
}

function updateNativeWindowColors(): void {
  const colors = nativeWindowColors()
  mainWindow?.setBackgroundColor(colors.background)
  mainWindow?.setTitleBarOverlay({
    color: colors.background,
    symbolColor: colors.symbols,
    height: titleBarHeight
  })
  resultWindow?.setBackgroundColor(colors.surface)
}

function applyNativeTheme(theme: AppSettings['theme']): void {
  nativeTheme.themeSource = theme
  updateNativeWindowColors()
}

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
  const colors = nativeWindowColors()
  const window = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 680,
    minHeight: 580,
    show: false,
    title: '划词助手',
    backgroundColor: colors.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: colors.background,
      symbolColor: colors.symbols,
      height: titleBarHeight
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
    focusable: true,
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
  const storedBounds = settingsStore.get().resultWindowBounds
  const initialBounds = storedBounds ? fitResultWindowBounds(storedBounds) : { width: 560, height: 600 }
  const colors = nativeWindowColors()
  resultWindowHasCustomBounds = Boolean(storedBounds)
  const window = new BrowserWindow({
    ...initialBounds,
    minWidth: 420,
    minHeight: 360,
    show: false,
    frame: false,
    backgroundColor: colors.surface,
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
  window.on('moved', () => scheduleResultBoundsSave(window))
  window.on('resized', () => scheduleResultBoundsSave(window))
  window.on('close', () => {
    if (resultWindowHasCustomBounds && !ignoreResultBoundsEvents) saveResultWindowBounds(window)
  })
  window.on('closed', () => {
    abortRequestsFor(webContentsId)
    if (resultBoundsTimer) clearTimeout(resultBoundsTimer)
    if (ignoreResultBoundsTimer) clearTimeout(ignoreResultBoundsTimer)
    resultBoundsTimer = null
    ignoreResultBoundsTimer = null
    ignoreResultBoundsEvents = false
    resultWindow = null
    resultReady = false
  })
  loadRenderer(window, 'result')
  return window
}

function showMainWindow(section?: SettingsSection): void {
  mainWindow ??= createMainWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (section) {
    const sendSection = () => mainWindow?.webContents.send('settings:navigate', section)
    if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', sendSection)
    else sendSection()
  }
}

function selectionPayload(): SelectionPayload | null {
  if (!lastSelection) return null
  const settings = settingsStore.get()
  const { pinned, overflow } = splitToolbarActions(settings.actions)
  return {
    text: lastSelection.text,
    programName: lastSelection.programName,
    actions: pinned,
    hasMoreActions: overflow.length > 0,
    theme: settings.theme
  }
}

function sendSelection(): void {
  const payload = selectionPayload()
  if (payload && toolbarReady && toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.webContents.send('selection:changed', payload)
  }
}

function showAction(actionId: string, variantId?: string): void {
  if (!lastSelection) return
  const settings = settingsStore.get()
  const action = settings.actions.find((item) => item.id === actionId && item.enabled)
  if (!action) return

  let selectedVariantId = variantId
  if (action.variants?.length && !selectedVariantId) {
    const variants = getEnabledActionVariants(action)
    if (!variants.length) return
    if (variants.length === 1) selectedVariantId = variants[0].id
    else {
      const menu = Menu.buildFromTemplate(
        variants.map((variant) => ({ label: variant.label, click: () => showAction(action.id, variant.id) }))
      )
      popupActionMenu(menu)
      return
    }
  }

  const selectedAction = selectedVariantId ? resolveActionVariant(action, selectedVariantId) : action
  if (!selectedAction) return

  const isOverflowAction = splitToolbarActions(settings.actions).overflow.some((item) => item.id === action.id)
  if (settings.showRecentActions && isOverflowAction) {
    persistSettingsSafely({
      recentActionIds: recordRecentAction(
        sanitizeRecentActionIds(settings.recentActionIds, settings.actions),
        action.id
      )
    }, '记录最近动作')
  }

  if (selectedAction.kind === 'speak') {
    toolbarWindow?.hide()
    const speechId = crypto.randomUUID()
    if (!settings.speechEnabled) {
      speechService.fail(speechId, '朗读功能已关闭，请在常规设置中重新启用。')
      return
    }
    speechService.speak(lastSelection.text, speechId, {
      rate: settings.speechRate,
      languageMode: settings.speechLanguageMode,
      culture: detectSpeechCulture(lastSelection.text)
    })
    return
  }

  const requestProfile = resolveRequestProfile(settings, selectedAction)

  pendingAction = {
    action: selectedAction,
    selectedText: lastSelection.text,
    programName: lastSelection.programName,
    model: requestProfile.model,
    maxInputCharacters: settings.maxInputCharacters,
    historyEnabled: settings.historyEnabled,
    theme: settings.theme,
    sourceLanguage: detectLanguageLabel(lastSelection.text),
    targetLanguage: settings.targetLanguage
  }
  toolbarWindow?.hide()
  resultWindow ??= createResultWindow()
  if (resultWindow.isMinimized()) resultWindow.restore()
  if (resultWindowHasCustomBounds) restoreResultWindowBounds(resultWindow)
  else positionResultWindow(resultWindow)
  resultWindow.show()
  resultWindow.focus()
  if (resultReady) resultWindow.webContents.send('action:payload', pendingAction)
}

function showSession(sessionId: string): void {
  const session = sessionStore.get(sessionId)
  if (!session) return
  const settings = settingsStore.get()
  const requestProfile = resolveRequestProfile(settings, session.action)
  pendingAction = {
    action: session.action,
    selectedText: session.selectedText,
    programName: session.programName,
    model: requestProfile.model,
    maxInputCharacters: settings.maxInputCharacters,
    historyEnabled: settings.historyEnabled,
    theme: settings.theme,
    sourceLanguage: session.sourceLanguage ?? detectLanguageLabel(session.selectedText),
    targetLanguage: session.targetLanguage ?? settings.targetLanguage,
    session
  }
  resultWindow ??= createResultWindow()
  if (resultWindow.isMinimized()) resultWindow.restore()
  if (resultWindowHasCustomBounds) restoreResultWindowBounds(resultWindow)
  else positionResultWindow(resultWindow)
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
  setResultWindowBounds(window, { ...bounds, x, y })
}

function fitResultWindowBounds(bounds: WindowBounds): WindowBounds {
  const display = screen.getDisplayMatching(bounds)
  return fitWindowBoundsToArea(bounds, display.workArea, display.scaleFactor)
}

function setResultWindowBounds(window: BrowserWindow, bounds: WindowBounds): void {
  ignoreResultBoundsEvents = true
  if (ignoreResultBoundsTimer) clearTimeout(ignoreResultBoundsTimer)
  window.setBounds(bounds, false)
  ignoreResultBoundsTimer = setTimeout(() => {
    ignoreResultBoundsEvents = false
    ignoreResultBoundsTimer = null
  }, 100)
}

function restoreResultWindowBounds(window: BrowserWindow): void {
  const storedBounds = settingsStore.get().resultWindowBounds
  if (!storedBounds) return
  const fitted = fitResultWindowBounds(storedBounds)
  setResultWindowBounds(window, fitted)
  if (JSON.stringify(fitted) !== JSON.stringify(storedBounds)) {
    persistSettingsSafely({ resultWindowBounds: fitted }, '修正结果窗口位置')
  }
}

function scheduleResultBoundsSave(window: BrowserWindow): void {
  if (ignoreResultBoundsEvents || window.isDestroyed()) return
  resultWindowHasCustomBounds = true
  if (resultBoundsTimer) clearTimeout(resultBoundsTimer)
  resultBoundsTimer = setTimeout(() => {
    resultBoundsTimer = null
    saveResultWindowBounds(window)
  }, 250)
}

function saveResultWindowBounds(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  const bounds = fitResultWindowBounds(window.getBounds())
  persistSettingsSafely({ resultWindowBounds: bounds }, '保存结果窗口位置')
}

function persistSettingsSafely(patch: Partial<AppSettings>, operation: string): void {
  try {
    settingsStore.update(patch)
  } catch (error) {
    console.error(`${operation}失败`, error)
  }
}

function setUpdateStatus(next: Omit<UpdateStatus, 'currentVersion'> & Partial<Pick<UpdateStatus, 'currentVersion'>>): UpdateStatus {
  updateStatus = { ...next, currentVersion: app.getVersion() }
  broadcastUpdateStatus(updateStatus)
  return updateStatus
}

function configureAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    setUpdateStatus({ state: 'available', version: info.version, percent: 0 })
  })
  autoUpdater.on('update-not-available', (info) => {
    setUpdateStatus({ state: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    setUpdateStatus({
      state: 'downloading',
      version: updateStatus.version,
      percent: Math.max(0, Math.min(100, progress.percent))
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setUpdateStatus({ state: 'downloaded', version: info.version, percent: 100 })
  })
  autoUpdater.on('error', (error) => {
    setUpdateStatus({
      state: 'error',
      version: updateStatus.version,
      message: error.message || '更新检查失败'
    })
  })
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return setUpdateStatus({ state: 'error', message: '开发环境不检查更新' })
  if (updateStatus.state === 'checking' || updateStatus.state === 'downloading') return updateStatus
  setUpdateStatus({ state: 'checking', version: undefined, percent: undefined, message: undefined })
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result) {
      return setUpdateStatus({ state: 'not-available' })
    }
  } catch (error) {
    return setUpdateStatus({
      state: 'error',
      message: error instanceof Error ? error.message : '更新检查失败'
    })
  }
  return updateStatus
}

async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) return setUpdateStatus({ state: 'error', message: '开发环境不支持下载更新' })
  if (updateStatus.state !== 'available') return updateStatus
  try {
    setUpdateStatus({ state: 'downloading', percent: 0 })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    return setUpdateStatus({
      state: 'error',
      version: updateStatus.version,
      message: error instanceof Error ? error.message : '更新下载失败'
    })
  }
  return updateStatus
}

function installUpdate(): void {
  if (updateStatus.state !== 'downloaded') return
  autoUpdater.quitAndInstall(false, true)
}

function actionMenuItem(action: SelectionAction): MenuItemConstructorOptions {
  const variants = getEnabledActionVariants(action)
  if (variants.length > 1) {
    return {
      label: action.label,
      icon: actionMenuIcon(action),
      submenu: variants.map((variant) => ({
        label: variant.label,
        click: () => showAction(action.id, variant.id)
      }))
    }
  }
  return {
    label: action.label,
    icon: actionMenuIcon(action),
    ...(action.shortcut ? { accelerator: action.shortcut } : {}),
    click: () => showAction(action.id, variants[0]?.id)
  }
}

function actionMenuIcon(action: SelectionAction): NativeImage | undefined {
  const dark = nativeTheme.shouldUseDarkColors
  const glyph = Array.from(action.label.trim())[0] ?? 'AI'
  const cacheKey = `${dark ? 'dark' : 'light'}:${glyph}`
  const cached = actionMenuIconCache.get(cacheKey)
  if (cached) return cached

  const background = dark ? '#34415f' : '#e8eefc'
  const foreground = dark ? '#d9e2fa' : '#35539b'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="5" fill="${background}"/><text x="9" y="9.5" text-anchor="middle" dominant-baseline="middle" fill="${foreground}" font-family="Segoe UI, Microsoft YaHei UI, sans-serif" font-size="10" font-weight="600">${escapeXml(glyph)}</text></svg>`
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  if (icon.isEmpty()) return undefined
  const resized = icon.resize({ width: 16, height: 16 })
  actionMenuIconCache.set(cacheKey, resized)
  return resized
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[character] ?? character)
}

function showMoreActions(): void {
  const settings = settingsStore.get()
  const { overflow } = splitToolbarActions(settings.actions)
  if (!overflow.length) return

  const overflowById = new Map(overflow.map((action) => [action.id, action]))
  const recent = settings.showRecentActions
    ? settings.recentActionIds.map((id) => overflowById.get(id)).filter((action): action is SelectionAction => Boolean(action))
    : []
  const template: MenuItemConstructorOptions[] = []
  if (recent.length) {
    template.push({ label: '最近使用', submenu: recent.map(actionMenuItem) }, { type: 'separator' })
  }
  groupActionsForMenu(overflow).forEach((section, index) => {
    if (index > 0) template.push({ type: 'separator' })
    template.push({ label: section.label, enabled: false })
    template.push(...section.actions.map(actionMenuItem))
  })
  const menu = Menu.buildFromTemplate(template)
  popupActionMenu(menu)
}

function popupActionMenu(menu: Menu): void {
  const window = toolbarWindow && !toolbarWindow.isDestroyed() ? toolbarWindow : undefined
  selectionService.setMenuOpen(true)
  try {
    menu.popup({
      ...(window ? { window } : {}),
      callback: () => selectionService.setMenuOpen(false)
    })
  } catch (error) {
    selectionService.setMenuOpen(false)
    throw error
  }
}

function applyActionShortcuts(actions: SelectionAction[]): string | null {
  const validationError = validateActionShortcuts(actions)
  if (validationError) return validationError

  globalShortcut.unregisterAll()
  for (const action of actions) {
    const error = registerActionShortcut(action)
    if (error) {
      globalShortcut.unregisterAll()
      return error
    }
  }
  return null
}

function applyAvailableActionShortcuts(actions: SelectionAction[]): string[] {
  const validationError = validateActionShortcuts(actions)
  if (validationError) return [validationError]

  globalShortcut.unregisterAll()
  const errors: string[] = []
  for (const action of actions) {
    const error = registerActionShortcut(action)
    if (error) errors.push(error)
  }
  return errors
}

function registerActionShortcut(action: SelectionAction): string | null {
  if (!action.enabled || !action.shortcut) return null
  const shortcut = normalizeShortcut(action.shortcut)
  if (!shortcut) return null
  try {
    if (!globalShortcut.register(shortcut, () => runShortcutAction(action.id))) {
      return `快捷键 ${shortcut} 已被其他应用占用`
    }
  } catch {
    return `无法注册快捷键 ${shortcut}`
  }
  return null
}

function runShortcutAction(actionId: string): void {
  if (mainWindow?.isFocused()) return
  const selection = selectionService.getCurrentSelection()
  if (!selection) return
  lastSelection = selection
  showAction(actionId)
}

function reportShortcutErrors(errors: string[]): void {
  if (!errors.length) return
  const message = [...new Set(errors)].join('\n')
  console.error('部分全局快捷键注册失败', message)
  tray?.displayBalloon({
    title: '划词助手快捷键不可用',
    content: message,
    iconType: 'warning'
  })
}

function broadcastStatus(status: AssistantStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('assistant:status-changed', status)
  }
  rebuildTrayMenu()
}

function broadcastSpeechStatus(status: SpeechStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('speech:status-changed', status)
  }
}

function broadcastUpdateStatus(status: UpdateStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('app:update-status-changed', status)
  }
}

function rebuildTrayMenu(): void {
  if (!tray || !settingsStore || !selectionService) return
  const settings = settingsStore.get()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开设置', click: () => showMainWindow() },
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
  tray.on('double-click', () => showMainWindow())
  rebuildTrayMenu()
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settingsStore.get())
  ipcMain.handle('settings:save', (_event, patch) => {
    const before = settingsStore.get()
    let nextPatch = patch
    if (patch.actions) {
      const validationError = validateActionShortcuts(patch.actions)
      if (validationError) throw new Error(validationError)
      const actions = patch.actions.map((action: SelectionAction) => {
        const shortcut = normalizeShortcut(action.shortcut)
        return { ...action, shortcut: shortcut ?? undefined }
      })
      const shortcutError = applyActionShortcuts(actions)
      if (shortcutError) {
        applyActionShortcuts(before.actions)
        throw new Error(shortcutError)
      }
      nextPatch = { ...patch, actions }
    }

    let settings
    try {
      settings = settingsStore.update(nextPatch)
    } catch (error) {
      if (patch.actions) applyActionShortcuts(before.actions)
      throw error
    }
    if (settings.enabled !== before.enabled) selectionService.setEnabled(settings.enabled)
    if (settings.launchAtLogin !== before.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    }
    if (settings.historyRetentionLimit !== before.historyRetentionLimit) {
      sessionStore.enforceRetention(settings.historyRetentionLimit)
    }
    if (settings.theme !== before.theme) applyNativeTheme(settings.theme)
    sendSelection()
    rebuildTrayMenu()
    return settings
  })
  ipcMain.handle('assistant:status', () => selectionService.status())
  ipcMain.handle('speech:status', () => speechService.status())
  ipcMain.on('speech:speak', (_event, text: unknown, speechId: unknown, cultureValue: unknown) => {
    if (typeof text !== 'string' || typeof speechId !== 'string') return
    const settings = settingsStore.get()
    if (!settings.speechEnabled) {
      speechService.fail(speechId, '朗读功能已关闭，请在常规设置中重新启用。')
      return
    }
    speechService.speak(text, speechId, {
      rate: settings.speechRate,
      languageMode: settings.speechLanguageMode,
      ...(isSpeechCulture(cultureValue) ? { culture: cultureValue } : {})
    })
  })
  ipcMain.on('speech:stop', () => speechService.stop())
  ipcMain.handle('assistant:set-enabled', (_event, enabled: boolean) => {
    settingsStore.update({ enabled })
    const status = selectionService.setEnabled(enabled)
    rebuildTrayMenu()
    return status
  })
  ipcMain.handle('ai:test', (_event, draft) => testConnection(draft))
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome }))
  ipcMain.handle('app:update-status', () => updateStatus)
  ipcMain.handle('app:update-check', () => checkForUpdates())
  ipcMain.handle('app:update-download', () => downloadUpdate())
  ipcMain.on('app:update-install', installUpdate)
  ipcMain.handle('clipboard:write', (_event, text: string) => clipboard.writeText(text))
  ipcMain.handle('external:open', async (_event, value: unknown) => {
    const url = sanitizeExternalUrl(typeof value === 'string' ? value : undefined)
    if (!url) return false
    await shell.openExternal(url)
    return true
  })
  ipcMain.handle('sessions:list', () => sessionStore.list())
  ipcMain.handle('sessions:save', (_event, session: ConversationSession) => {
    const settings = settingsStore.get()
    return sessionStore.save(session, settings.historyEnabled, settings.historyRetentionLimit)
  })
  ipcMain.handle('sessions:rename', (_event, sessionId: string, title: string) => sessionStore.rename(sessionId, title))
  ipcMain.handle('sessions:delete', (_event, sessionId: string) => sessionStore.delete(sessionId))
  ipcMain.handle('sessions:delete-all', () => sessionStore.deleteAll())
  ipcMain.handle('sessions:storage-info', () => sessionStore.storageInfo())
  ipcMain.handle('sessions:export', async (_event, sessionId: string, format: SessionExportFormat) => {
    const session = sessionStore.get(sessionId)
    if (!session || (format !== 'markdown' && format !== 'json')) return null
    const extension = format === 'markdown' ? 'md' : 'json'
    const safeTitle = session.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || '会话导出'
    const options = {
      title: '导出会话',
      defaultPath: join(app.getPath('documents'), `${safeTitle}.${extension}`),
      filters: [{ name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [extension] }]
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, serializeSession(session, format), 'utf8')
    return result.filePath
  })

  ipcMain.on('toolbar:ready', () => {
    toolbarReady = true
    sendSelection()
  })
  ipcMain.on('result:ready', () => {
    resultReady = true
    if (pendingAction && resultWindow) resultWindow.webContents.send('action:payload', pendingAction)
  })
  ipcMain.on('selection:action', (_event, actionId: string, variantId?: string) => showAction(actionId, variantId))
  ipcMain.on('toolbar:more', showMoreActions)
  ipcMain.on('toolbar:resize', (_event, size: { width: number; height: number }) => {
    if (!toolbarWindow || toolbarWindow.isDestroyed()) return
    const width = Math.max(220, Math.min(720, Math.ceil(size.width)))
    const height = Math.max(48, Math.min(120, Math.ceil(size.height)))
    toolbarWindow.setSize(width, height, false)
  })
  ipcMain.on('settings:open', (_event, section?: SettingsSection) => {
    toolbarWindow?.hide()
    showMainWindow(isSettingsSection(section) ? section : undefined)
  })
  ipcMain.on('sessions:open', (_event, sessionId: string) => showSession(sessionId))
  ipcMain.on('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window === mainWindow) window.hide()
    else if (window === toolbarWindow) window.hide()
    else {
      speechService.stop()
      window.close()
    }
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
    }, request.conversation, request.programName)
      .then(() => {
        if (!event.sender.isDestroyed()) event.sender.send('ai:stream', { requestId: request.requestId, type: 'done' })
      })
      .catch((error) => {
        if (controller.signal.aborted || event.sender.isDestroyed()) return
        event.sender.send('ai:stream', {
          requestId: request.requestId,
          type: 'error',
          error: classifyAIError(error)
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

app.on('second-instance', () => showMainWindow())

app.whenReady().then(() => {
  configureAutoUpdater()
  settingsStore = new SettingsStore()
  const initialSettings = settingsStore.get()
  applyNativeTheme(initialSettings.theme)
  nativeTheme.on('updated', updateNativeWindowColors)
  sessionStore = new SessionStore(join(app.getPath('userData'), 'sessions.json'), {
    encrypt: (value) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储不可用，无法保存会话历史')
      return safeStorage.encryptString(value).toString('base64')
    },
    decrypt: (value) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储不可用，无法读取会话历史')
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    }
  })
  toolbarWindow = createToolbarWindow()
  speechService = new SpeechService('powershell.exe', broadcastSpeechStatus)
  selectionService = new SelectionService(
    () => toolbarWindow,
    (selection) => {
      if (settingsStore.get().speechAutoStop) speechService.stop()
      lastSelection = selection
      sendSelection()
    },
    broadcastStatus
  )
  registerIpc()
  const shortcutErrors = applyAvailableActionShortcuts(settingsStore.get().actions)
  createTray()
  reportShortcutErrors(shortcutErrors)
  mainWindow = createMainWindow()
  updateNativeWindowColors()
  app.setLoginItemSettings({ openAtLogin: initialSettings.launchAtLogin })
  selectionService.setEnabled(initialSettings.enabled)
  updateCheckTimer = setInterval(() => { void checkForUpdates() }, 6 * 60 * 60 * 1000)
  setTimeout(() => { void checkForUpdates() }, 5000)
})

app.on('before-quit', () => {
  isQuitting = true
  selectionService?.cleanup()
  speechService?.stop()
  if (updateCheckTimer) clearInterval(updateCheckTimer)
  updateCheckTimer = null
  globalShortcut.unregisterAll()
  for (const controller of requests.values()) controller.abort()
})

app.on('window-all-closed', () => {
  // The tray owns the application lifetime.
})

function isSettingsSection(value: unknown): value is SettingsSection {
  return value === 'general' || value === 'model' || value === 'actions' || value === 'history' || value === 'about'
}
