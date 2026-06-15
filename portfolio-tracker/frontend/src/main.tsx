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
  // clients.claim() in a new SW doesn't refresh the JS already running in this tab,
  // so a session opened before a deploy can stay on a stale bundle indefinitely
  // (especially PWAs that are suspended/resumed instead of fully relaunched).
  // Reload once when the new SW takes control to pick up the fresh bundle.
  let reloadedForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return
    reloadedForUpdate = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      })
      window.addEventListener('focus', () => {
        registration.update().catch(() => {})
      })
    }).catch(() => {})
  })
}
