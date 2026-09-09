import * as React from 'react'
import { VietmapOptimize } from '@vietmap/optimize-sdk'
import type { AuthErrorEvent } from '@vietmap/optimize-sdk'

interface FleetworkContextValue {
  client: VietmapOptimize
}

const FleetworkContext = React.createContext<FleetworkContextValue | null>(null)

export interface FleetworkProviderProps {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
  children: React.ReactNode
  onAuthError?: (event: AuthErrorEvent) => void
  disableAuthErrorOverlay?: boolean
  renderAuthError?: (event: AuthErrorEvent, dismiss: () => void) => React.ReactNode
}

/**
 * Provides a single `VietmapOptimize` client to the React tree. `useOptimize`
 * reads it from here. All request logic + types live in the core package.
 */
export function FleetworkProvider({
  apiKey,
  baseUrl,
  timeoutMs,
  children,
  onAuthError,
  disableAuthErrorOverlay = false,
  renderAuthError,
}: FleetworkProviderProps) {
  const [authError, setAuthError] = React.useState<AuthErrorEvent | null>(null)
  const onAuthErrorRef = React.useRef(onAuthError)
  React.useEffect(() => {
    onAuthErrorRef.current = onAuthError
  }, [onAuthError])

  const client = React.useMemo(
    () =>
      new VietmapOptimize({
        apiKey,
        baseUrl,
        timeoutMs,
        onAuthError: (event) => {
          onAuthErrorRef.current?.(event)
          setAuthError(event)
        },
      }),
    [apiKey, baseUrl, timeoutMs],
  )

  const dismiss = React.useCallback(() => setAuthError(null), [])

  return (
    <FleetworkContext.Provider value={{ client }}>
      {children}
      {authError && !disableAuthErrorOverlay
        ? renderAuthError
          ? renderAuthError(authError, dismiss)
          : <DefaultAuthOverlay event={authError} onDismiss={dismiss} />
        : null}
    </FleetworkContext.Provider>
  )
}

export function useFleetworkClient(): VietmapOptimize {
  const ctx = React.useContext(FleetworkContext)
  if (!ctx) {
    throw new Error('[Optimize SDK] useOptimize / useFleetworkClient must be used inside <FleetworkProvider />.')
  }
  return ctx.client
}

function DefaultAuthOverlay({ event, onDismiss }: { event: AuthErrorEvent; onDismiss: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div role="alertdialog" aria-modal="true" onClick={onDismiss} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#0f172a', borderRadius: 12, padding: 24, width: 'min(420px, 100%)', boxShadow: '0 20px 60px rgba(0,0,0,.25)', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color: '#b91c1c' }}>{event.status}</div>
        <p style={{ margin: '8px 0 16px', color: '#475569', wordBreak: 'break-word' }}>{event.message}</p>
        {event.status === 401
          ? <button type="button" onClick={() => window.location.reload()} style={btnStyle('#2563eb', '#fff')}>Reload</button>
          : <button type="button" onClick={onDismiss} style={btnStyle('#e2e8f0', '#0f172a')}>OK</button>}
      </div>
    </div>
  )
}

function btnStyle(bg: string, fg: string): React.CSSProperties {
  return { border: 'none', background: bg, color: fg, borderRadius: 8, padding: '8px 18px', fontSize: 14, cursor: 'pointer' }
}
