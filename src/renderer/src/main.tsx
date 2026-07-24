import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const view = new URLSearchParams(window.location.search).get('view') ?? 'main'
const Component = lazy(async () => {
  if (view === 'toolbar') {
    const module = await import('./views/ToolbarApp')
    return { default: module.ToolbarApp }
  }
  if (view === 'result') {
    const module = await import('./views/ResultApp')
    return { default: module.ResultApp }
  }
  const module = await import('./views/MainApp')
  return { default: module.MainApp }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  </StrictMode>
)
