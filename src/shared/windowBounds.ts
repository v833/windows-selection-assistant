import type { WindowBounds } from './types'

export function fitWindowBoundsToArea(
  bounds: WindowBounds,
  area: WindowBounds,
  _scaleFactor = 1
): WindowBounds {
  const margin = 8
  const width = Math.min(Math.max(Math.round(bounds.width), 420), area.width - margin * 2)
  const height = Math.min(Math.max(Math.round(bounds.height), 360), area.height - margin * 2)
  const minX = area.x + margin
  const minY = area.y + margin
  const maxX = area.x + area.width - width - margin
  const maxY = area.y + area.height - height - margin

  return {
    x: Math.max(minX, Math.min(Math.round(bounds.x), maxX)),
    y: Math.max(minY, Math.min(Math.round(bounds.y), maxY)),
    width,
    height
  }
}

export function isWindowBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false
  const bounds = value as Partial<WindowBounds>
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
}
