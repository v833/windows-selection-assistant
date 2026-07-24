import type { SelectionAssistantAPI } from '../../shared/types'

declare global {
  interface Window {
    selectionAPI: SelectionAssistantAPI
  }
}

export {}
