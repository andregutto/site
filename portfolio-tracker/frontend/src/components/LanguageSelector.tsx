import { useState, useEffect, useRef } from 'react'
import { useI18n, type Locale } from '../contexts/I18nContext'

const LOCALES: { value: Locale; flag: string; label: string }[] = [
  { value: 'pt', flag: '🇧🇷', label: 'Português' },
  { value: 'en', flag: '🇺🇸', label: 'English' },
  { value: 'fr', flag: '🇫🇷', label: 'Français' },
]

export default function LanguageSelector() {
  const { locale, setLocale } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = LOCALES.find(l => l.value === locale) ?? LOCALES[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xl leading-none p-1 rounded-md hover:bg-gray-100 transition-colors"
        title={current.label}
      >
        {current.flag}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50 min-w-[130px]">
          {LOCALES.map(l => (
            <button
              key={l.value}
              onClick={() => { setLocale(l.value); setOpen(false) }}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm w-full text-left transition-colors hover:bg-gray-50 ${
                locale === l.value ? 'text-[#001A70] font-semibold' : 'text-gray-600'
              }`}
            >
              <span className="text-base">{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
