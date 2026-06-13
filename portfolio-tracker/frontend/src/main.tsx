import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// SW only intercepts same-origin requests; Supabase (cross-origin) is never touched.
// Skipped in dev: Vite dev-server module URLs are unhashed, so the SW's cache-first
// strategy would serve stale source files indefinitely, masking code changes.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
