import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'

interface InstitutionList {
  br:            string[]
  international: string[]
  custom:        string[]
}

interface Props {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  autoFocus?:   boolean
}

let cachedList: InstitutionList | null = null

export default function InstitutionSelect({ value, onChange, placeholder = 'Banco ou corretora...', autoFocus }: Props) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState(value)
  const [list, setList]   = useState<InstitutionList | null>(cachedList)
  const containerRef      = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (cachedList) return
    apiFetch<InstitutionList>('/institutions')
      .then(data => { cachedList = data; setList(data) })
      .catch(() => {})
  }, [])

  useEffect(() => { setQuery(value) }, [value])

  // Fecha ao clicar fora (dropdown ainda é descendente de containerRef no DOM,
  // então contains() funciona mesmo com position:fixed)
  useEffect(() => {
    function onOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (query !== value) onChange(query)
      }
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [query, value, onChange])

  // Reposiciona continuamente enquanto está aberto, em vez de fechar ao
  // rolar/redimensionar — no mobile, focar o input dispara um scroll-into-view
  // do navegador e a abertura do teclado (que no iOS Safari não dispara
  // 'resize' do jeito esperado) DEPOIS do focus/onChange já terem medido a
  // posição, deixando o dropdown "preso" longe do campo. Um loop de rAF
  // garante que ele sempre acompanha o input de fato.
  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = () => { computePos(); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function computePos() {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const next = { top: r.bottom + 4, left: r.left, width: r.width }
    setDropPos(prev => (prev.top === next.top && prev.left === next.left && prev.width === next.width) ? prev : next)
  }

  const q = query.toLowerCase().trim()

  function filterGroup(items: string[]) {
    if (!q) return items.slice(0, 12)
    return items.filter(n => n.toLowerCase().includes(q))
  }

  const brFiltered   = list ? filterGroup(list.br)            : []
  const intFiltered  = list ? filterGroup(list.international) : []
  const custFiltered = list ? filterGroup(list.custom)        : []
  const totalResults = brFiltered.length + intFiltered.length + custFiltered.length

  const allNames   = [...(list?.br ?? []), ...(list?.international ?? []), ...(list?.custom ?? [])]
  const exactMatch = q && allNames.some(n => n.toLowerCase() === q)
  const showAdd    = q.length >= 2 && !exactMatch && totalResults < 3

  function select(name: string) {
    setQuery(name)
    onChange(name)
    setOpen(false)
  }

  function SectionHeader({ label }: { label: string }) {
    return <div className="px-3 py-1.5 text-xs font-semibold text-[var(--arvo-fg-soft)] uppercase tracking-wider bg-[var(--arvo-surface-2)]">{label}</div>
  }

  function Item({ name }: { name: string }) {
    return (
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-[var(--arvo-fg)] transition-colors"
        onPointerDown={() => select(name)}
      >
        {name}
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => { computePos(); setOpen(true) }}
        onChange={e => { setQuery(e.target.value); computePos(); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'Enter' && query) { onChange(query); setOpen(false) }
          if (e.key === 'Escape') setOpen(false)
        }}
        className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
      />

      {/* Dropdown com position:fixed para escapar de qualquer overflow:hidden */}
      {open && list && (
        <div
          style={{
            position: 'fixed',
            top:   dropPos.top,
            left:  dropPos.left,
            width: dropPos.width,
            zIndex: 9999,
          }}
          className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-xl shadow-lg max-h-56 overflow-y-auto"
        >
          {brFiltered.length > 0 && (
            <>
              <SectionHeader label="Bancos BR" />
              {brFiltered.map(n => <Item key={n} name={n} />)}
            </>
          )}
          {intFiltered.length > 0 && (
            <>
              <SectionHeader label="Internacional" />
              {intFiltered.map(n => <Item key={n} name={n} />)}
            </>
          )}
          {custFiltered.length > 0 && (
            <>
              <SectionHeader label="Personalizado" />
              {custFiltered.map(n => <Item key={n} name={n} />)}
            </>
          )}
          {showAdd && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-[var(--arvo-fg)] font-medium hover:bg-blue-50 border-t border-[var(--arvo-border)] transition-colors"
              onPointerDown={() => select(query)}
            >
              Adicionar "{query}"
            </button>
          )}
          {totalResults === 0 && !showAdd && (
            <p className="px-3 py-3 text-xs text-[var(--arvo-fg-soft)]">Nenhuma instituição encontrada.</p>
          )}
        </div>
      )}
    </div>
  )
}
