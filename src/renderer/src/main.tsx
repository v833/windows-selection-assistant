import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MainApp } from './views/MainApp'
import { ResultApp } from './views/ResultApp'
import { ToolbarApp } from './views/ToolbarApp'
import './styles.css'

const view = new URLSearchParams(window.location.search).get('view') ?? 'main'
const Component = view === 'toolbar' ? ToolbarApp : view === 'result' ? ResultApp : MainApp

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Component />
  </StrictMode>
)
