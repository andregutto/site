import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'

export interface CatalogCandidate {
  symbol: string
  name: string
  exchange: string | null
  quote_type: string | null
  currency: string | null
  ticker_brapi?: string | null
  ticker_yahoo?: string | null
  coingecko_id?: string | null
}

interface Props {
  kind: 'b3' | 'intl' | 'cripto'
  value: string
  onQueryChange: (q: string) => void
  onSelect: (candidate: CatalogCandidate) => void
  placeholder?: string
  className?: string
}

// Search-as-you-type picker backed by /assets/catalog/search. Showing the user
// a list of real candidates (name + exchange + type) instead of auto-guessing
// one match is what fixes ambiguous tickers like "ESE" (a Euronext Paris ETF
// that also happens to exact-match an unrelated US stock symbol) — the user
// makes the call, not a heuristic.
export default function AssetCatalogSearch({ kind, value, onQueryChange, onSelect, placeholder, className }: Props) {
  const [candidates, setCandidates] = useState<CatalogCandidate[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = value.trim()
    if (q.length < 2) { setCandidates([]); setOpen(false); setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ candidates: CatalogCandidate[] }>(
          `/assets/catalog/search?kind=${kind}&q=${encodeURIComponent(q)}`
        )
        setCandidates(data.candidates ?? [])
        setOpen(true)
      } catch {
        setCandidates([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [value, kind])

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [])

  function pick(c: CatalogCandidate) {
    onSelect(c)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onQueryChange(e.target.value)}
        onFocus={() => { if (candidates.length > 0) setOpen(true) }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && (
        <div
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-lg"
          style={{ background: 'var(--arvo-surface)', borderColor: 'var(--arvo-border)' }}
        >
          {loading ? (
            <div className="px-3 py-2 text-xs text-[var(--arvo-fg-soft)]">Buscando…</div>
          ) : candidates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--arvo-fg-soft)]">Nenhum resultado</div>
          ) : (
            candidates.map(c => (
              <button
                key={`${c.symbol}-${c.exchange ?? ''}`}
                type="button"
                onPointerDown={e => { e.preventDefault(); pick(c) }}
                className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="truncate text-[var(--arvo-fg)]">
                  <strong>{c.symbol}</strong> — {c.name}
                </span>
                {(c.exchange || c.quote_type) && (
                  <span className="text-xs text-[var(--arvo-fg-soft)] flex-shrink-0">
                    {[c.exchange, c.quote_type].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
