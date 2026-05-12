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
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (query !== value) onChange(query)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [query, value, onChange])

  // Fecha ao rolar a página
  useEffect(() => {
    if (!open) return
    function onScroll() { setOpen(false) }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', onScroll, { capture: true })
  }, [open])

  function computePos() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
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
    return <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">{label}</div>
  }

  function Item({ name }: { name: string }) {
    return (
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-[#001A70] transition-colors"
        onMouseDown={() => select(name)}
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
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
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
          className="bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto"
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
              className="w-full text-left px-3 py-2 text-sm text-[#001A70] font-medium hover:bg-blue-50 border-t border-gray-100 transition-colors"
              onMouseDown={() => select(query)}
            >
              Adicionar "{query}"
            </button>
          )}
          {totalResults === 0 && !showAdd && (
            <p className="px-3 py-3 text-xs text-gray-400">Nenhuma instituição encontrada.</p>
          )}
        </div>
      )}
    </div>
  )
}
