import { screen, type BrowserWindow } from 'electron'
import SelectionHook, { type MouseEventData, type TextSelectionData } from 'selection-hook'
import type { AssistantStatus } from '../shared/types'

type SelectionHandler = (selection: TextSelectionData) => void
type StatusHandler = (status: AssistantStatus) => void

const TOOLBAR_GAP = 8

export class SelectionService {
  private hook: SelectionHook | null = null
  private running = false
  private enabled = false

  constructor(
    private readonly toolbarWindow: () => BrowserWindow | null,
    private readonly onSelection: SelectionHandler,
    private readonly onStatus: StatusHandler
  ) {}

  setEnabled(enabled: boolean): AssistantStatus {
    this.enabled = enabled
    if (enabled) this.start()
    else this.stop()
    return this.status()
  }

  status(): AssistantStatus {
    return { enabled: this.enabled, running: this.running }
  }

  cleanup(): void {
    this.stop()
    this.hook?.cleanup()
    this.hook = null
  }

  private start(): void {
    if (this.running) return
    try {
      this.hook ??= new SelectionHook()
      this.hook.on('text-selection', this.handleSelection)
      this.hook.on('mouse-down', this.handleMouseDown)
      this.hook.on('mouse-wheel', this.handleDismiss)
      this.hook.on('key-down', this.handleDismiss)
      this.hook.on('error', this.handleError)
      this.running = this.hook.start({
        enableClipboard: true,
        globalFilterMode: SelectionHook.FilterMode.EXCLUDE_LIST,
        globalFilterList: ['划词助手', 'SelectionAssistant']
      })
      if (!this.running) throw new Error('无法启动系统选区监听')
      this.onStatus(this.status())
    } catch (error) {
      this.detachListeners()
      this.hook?.stop()
      this.running = false
      this.onStatus({
        enabled: this.enabled,
        running: false,
        error: error instanceof Error ? error.message : '选区监听启动失败'
      })
    }
  }

  private stop(): void {
    if (!this.hook) return
    this.detachListeners()
    if (this.running) this.hook.stop()
    this.running = false
    this.toolbarWindow()?.hide()
    this.onStatus(this.status())
  }

  private detachListeners(): void {
    if (!this.hook) return
    this.hook.off('text-selection', this.handleSelection)
    this.hook.off('mouse-down', this.handleMouseDown)
    this.hook.off('mouse-wheel', this.handleDismiss)
    this.hook.off('key-down', this.handleDismiss)
    this.hook.off('error', this.handleError)
  }

  private handleSelection = (selection: TextSelectionData): void => {
    if (!selection.text.trim()) return
    this.onSelection(selection)
    this.showToolbar(selection)
  }

  private showToolbar(selection: TextSelectionData): void {
    const window = this.toolbarWindow()
    if (!window || window.isDestroyed()) return

    const physicalPoint = this.getAnchor(selection)
    const point = screen.screenToDipPoint(physicalPoint)
    const display = screen.getDisplayNearestPoint(point)
    const bounds = window.getBounds()
    const area = display.workArea
    let x = Math.round(point.x - bounds.width / 2)
    let y = Math.round(point.y + TOOLBAR_GAP)

    x = Math.max(area.x, Math.min(x, area.x + area.width - bounds.width))
    if (y + bounds.height > area.y + area.height) y = Math.round(point.y - bounds.height - TOOLBAR_GAP)
    y = Math.max(area.y, Math.min(y, area.y + area.height - bounds.height))

    window.setPosition(x, y, false)
    window.showInactive()
    window.setAlwaysOnTop(true, 'screen-saver')
  }

  private getAnchor(selection: TextSelectionData): { x: number; y: number } {
    const valid = (point: { x: number; y: number }) =>
      point.x !== SelectionHook.INVALID_COORDINATE && point.y !== SelectionHook.INVALID_COORDINATE && (point.x !== 0 || point.y !== 0)

    if (valid(selection.endBottom)) return selection.endBottom
    if (valid(selection.mousePosEnd)) return selection.mousePosEnd

    return screen.getCursorScreenPoint()
  }

  private handleMouseDown = (event: MouseEventData): void => {
    const window = this.toolbarWindow()
    if (!window?.isVisible()) return
    const point = screen.screenToDipPoint({ x: event.x, y: event.y })
    const bounds = window.getBounds()
    const inside =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    if (!inside) window.hide()
  }

  private handleDismiss = (): void => {
    this.toolbarWindow()?.hide()
  }

  private handleError = (error: Error): void => {
    this.onStatus({ enabled: this.enabled, running: this.running, error: error.message })
  }
}
