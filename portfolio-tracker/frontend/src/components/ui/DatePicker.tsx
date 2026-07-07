import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import {
  addMonths, daysInMonth, firstWeekdayMon, formatDisplay, isSameDay,
  monthLabel, parseDisplay, parseISO, stripTime, toISO, weekdayLabels,
} from '../../lib/dateFormat'

// Picker de data com calendário (estilo companhia aérea pro par início/fim)
// + digitação manual. Dois exports: DatePicker (data única) e
// DateRangePicker (início/fim no mesmo calendário, clique 1 define início,
// clique 2 define fim — clicar antes do início reinicia o intervalo).

const fieldStyle: CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 'var(--arvo-radius-xs)',
  border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
  fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)',
  outline: 'none', transition: 'border-color 160ms ease', boxSizing: 'border-box',
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return ref
}

const popoverStyle: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40,
  background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)',
  borderRadius: 'var(--arvo-radius-lg)', boxShadow: 'var(--arvo-shadow-lg)',
  padding: 14,
}

interface DayCellProps {
  day: Date | null
  isStart: boolean
  isEnd: boolean
  inRange: boolean
  isToday: boolean
  disabled: boolean
  onClick: (d: Date) => void
  onHover?: (d: Date | null) => void
}

function DayCell({ day, isStart, isEnd, inRange, isToday, disabled, onClick, onHover }: DayCellProps) {
  if (!day) return <div style={{ width: 32, height: 32 }} />
  const isEdge = isStart || isEnd
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(day)}
      onMouseEnter={() => onHover?.(day)}
      style={{
        width: 32, height: 32, borderRadius: 999, border: 'none', cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--arvo-font-body)', fontSize: 12.5,
        background: isEdge ? 'var(--arvo-fg)' : inRange ? 'var(--arvo-gold-tint)' : 'transparent',
        color: disabled ? 'var(--arvo-fg-faint, var(--arvo-fg-soft))' : isEdge ? 'var(--arvo-surface)' : 'var(--arvo-fg)',
        opacity: disabled ? 0.35 : 1,
        outline: isToday && !isEdge ? '1px solid var(--arvo-gold)' : 'none',
        outlineOffset: -1,
        transition: 'background 120ms ease',
      }}
      onMouseOver={e => { if (!isEdge && !disabled) e.currentTarget.style.background = inRange ? 'var(--arvo-gold-tint)' : 'var(--arvo-hover-bg)' }}
      onMouseOut={e => { if (!isEdge && !disabled) e.currentTarget.style.background = inRange ? 'var(--arvo-gold-tint)' : 'transparent' }}
    >
      {day.getDate()}
    </button>
  )
}

interface MonthGridProps {
  monthDate: Date
  start: Date | null
  end: Date | null
  hoverEnd: Date | null
  onSelectDay: (d: Date) => void
  onHoverDay?: (d: Date | null) => void
  hideLabel?: boolean
  minDate?: Date | null
  maxDate?: Date | null
}

function MonthGrid({ monthDate, start, end, hoverEnd, onSelectDay, onHoverDay, hideLabel, minDate, maxDate }: MonthGridProps) {
  const { locale } = useI18n()
  const y = monthDate.getFullYear()
  const m = monthDate.getMonth()
  const total = daysInMonth(y, m)
  const offset = firstWeekdayMon(y, m)
  const today = stripTime(new Date())
  const cells: (Date | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => new Date(y, m, i + 1))]
  const effectiveEnd = end ?? hoverEnd

  return (
    <div>
      {!hideLabel && (
        <p style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 13, textAlign: 'center',
          color: 'var(--arvo-fg)', marginBottom: 10,
        }}>
          {monthLabel(monthDate, locale)}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: 2 }}>
        {weekdayLabels(locale).map((w, i) => (
          <div key={i} style={{
            width: 32, textAlign: 'center', fontFamily: 'var(--arvo-font-body)', fontSize: 10.5,
            color: 'var(--arvo-fg-soft)', textTransform: 'uppercase',
          }}>{w}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <DayCell key={i} day={null} isStart={false} isEnd={false} inRange={false} isToday={false} disabled={false} onClick={() => {}} />
          const isStart = isSameDay(day, start)
          const isEnd = isSameDay(day, end) || (!end && isSameDay(day, hoverEnd) && !!start)
          const inRange = !!start && !!effectiveEnd && day > start && day < effectiveEnd
          const disabled = !!(minDate && day < minDate) || !!(maxDate && day > maxDate)
          return (
            <DayCell
              key={i} day={day}
              isStart={isStart} isEnd={isEnd} inRange={inRange}
              isToday={isSameDay(day, today)}
              disabled={disabled}
              onClick={onSelectDay}
              onHover={onHoverDay}
            />
          )
        })}
      </div>
    </div>
  )
}

// Selects de mês/ano no lugar do rótulo estático — sem isso, ir de "hoje" até
// uma data de nascimento nos anos 1980 exigiria centenas de cliques na seta
// "mês anterior". Só aparece no primeiro mês (o segundo, no range picker, é
// só leitura).
function MonthYearSelect({ monthDate, onChange }: { monthDate: Date; onChange: (d: Date) => void }) {
  const { locale } = useI18n()
  const y = monthDate.getFullYear()
  const m = monthDate.getMonth()
  const loc = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'
  const months = Array.from({ length: 12 }, (_, i) => {
    const label = new Date(2024, i, 1).toLocaleDateString(loc, { month: 'short' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  })
  const nowY = new Date().getFullYear()
  const years = Array.from({ length: 106 }, (_, i) => nowY + 5 - i)
  const selectStyle: CSSProperties = {
    border: 'none', background: 'none', fontFamily: 'var(--arvo-font-display)', fontSize: 12.5,
    color: 'var(--arvo-fg)', cursor: 'pointer', textAlign: 'center', textAlignLast: 'center',
  }
  return (
    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
      <select value={m} onChange={e => onChange(new Date(y, Number(e.target.value), 1))} style={selectStyle}>
        {months.map((label, i) => <option key={i} value={i}>{label}</option>)}
      </select>
      <select value={y} onChange={e => onChange(new Date(Number(e.target.value), m, 1))} style={selectStyle}>
        {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  )
}

function NavHeader({ monthDate, onChangeMonth, onPrev, onNext }: {
  monthDate: Date; onChangeMonth: (d: Date) => void; onPrev: () => void; onNext: () => void
}) {
  const arrow: CSSProperties = {
    width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none',
    color: 'var(--arvo-fg-soft)', cursor: 'pointer', flexShrink: 0,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 4 }}>
      <button type="button" onClick={onPrev} style={arrow}>‹</button>
      <MonthYearSelect monthDate={monthDate} onChange={onChangeMonth} />
      <button type="button" onClick={onNext} style={arrow}>›</button>
    </div>
  )
}

// ── Data única ──────────────────────────────────────────────────────────────

interface DatePickerProps {
  value: string // ISO 'YYYY-MM-DD' ou ''
  onChange: (iso: string) => void
  placeholder?: string
  style?: CSSProperties
  min?: string
  max?: string
}

export function DatePicker({ value, onChange, placeholder, style, min, max }: DatePickerProps) {
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => formatDisplay(value, locale))
  const [viewMonth, setViewMonth] = useState(() => parseISO(value) ?? new Date())
  const ref = useOutsideClose(open, () => setOpen(false))

  useEffect(() => { setText(formatDisplay(value, locale)) }, [value, locale])

  const minDate = min ? parseISO(min) : null
  const maxDate = max ? parseISO(max) : null

  function commitText(raw: string) {
    const iso = parseDisplay(raw, locale)
    if (iso) {
      const d = parseISO(iso)!
      if ((minDate && d < minDate) || (maxDate && d > maxDate)) { setText(formatDisplay(value, locale)); return }
      onChange(iso)
      setViewMonth(d)
    }
    else if (!raw.trim()) onChange('')
    else setText(formatDisplay(value, locale)) // texto inválido — reverte
  }

  const selected = parseISO(value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={e => commitText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { commitText(text); setOpen(false) } }}
          placeholder={placeholder ?? (locale === 'en' ? 'mm/dd/yyyy' : 'dd/mm/aaaa')}
          style={{ ...fieldStyle, ...style, paddingRight: 34 }}
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          tabIndex={-1}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer',
            color: 'var(--arvo-fg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path strokeLinecap="round" d="M8 2v4M16 2v4M3 9h18" />
          </svg>
        </button>
      </div>
      {open && (
        <div style={popoverStyle}>
          <NavHeader monthDate={viewMonth} onChangeMonth={setViewMonth} onPrev={() => setViewMonth(m => addMonths(m, -1))} onNext={() => setViewMonth(m => addMonths(m, 1))} />
          <MonthGrid
            monthDate={viewMonth}
            start={selected}
            end={selected}
            hoverEnd={null}
            hideLabel
            minDate={minDate}
            maxDate={maxDate}
            onSelectDay={d => {
              if (maxDate && d > maxDate) return
              if (minDate && d < minDate) return
              onChange(toISO(d))
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Intervalo início/fim ──────────────────────────────────────────────────────

interface DateRangePickerProps {
  startValue: string
  endValue: string
  onChangeStart: (iso: string) => void
  onChangeEnd: (iso: string) => void
  startPlaceholder?: string
  endPlaceholder?: string
  startLabel?: string
  endLabel?: string
  style?: CSSProperties
  labelStyle?: CSSProperties
  // 'grid' (padrão): rótulo em cima, dois campos lado a lado full-width.
  // 'inline': sem rótulo, campos compactos lado a lado com uma seta entre
  // eles — usado em barras de filtro (ex: período na tela de Transações).
  layout?: 'grid' | 'inline'
}

export function DateRangePicker({
  startValue, endValue, onChangeStart, onChangeEnd,
  startPlaceholder, endPlaceholder, startLabel, endLabel, style, labelStyle,
  layout = 'grid',
}: DateRangePickerProps) {
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [startText, setStartText] = useState(() => formatDisplay(startValue, locale))
  const [endText, setEndText] = useState(() => formatDisplay(endValue, locale))
  const [hoverEnd, setHoverEnd] = useState<Date | null>(null)
  const [viewMonth, setViewMonth] = useState(() => parseISO(startValue) ?? new Date())
  const ref = useOutsideClose(open, () => setOpen(false))

  useEffect(() => { setStartText(formatDisplay(startValue, locale)) }, [startValue, locale])
  useEffect(() => { setEndText(formatDisplay(endValue, locale)) }, [endValue, locale])

  function commitStart(raw: string) {
    const iso = parseDisplay(raw, locale)
    if (iso) { onChangeStart(iso); setViewMonth(parseISO(iso) ?? new Date()) }
    else if (!raw.trim()) onChangeStart('')
    else setStartText(formatDisplay(startValue, locale))
  }
  function commitEnd(raw: string) {
    const iso = parseDisplay(raw, locale)
    if (iso) onChangeEnd(iso)
    else if (!raw.trim()) onChangeEnd('')
    else setEndText(formatDisplay(endValue, locale))
  }

  const start = parseISO(startValue)
  const end = parseISO(endValue)

  function selectDay(d: Date) {
    if (!start || (start && end)) {
      onChangeStart(toISO(d))
      onChangeEnd('')
      return
    }
    // só início definido
    if (d < start) {
      onChangeStart(toISO(d))
      onChangeEnd('')
    } else {
      onChangeEnd(toISO(d))
      setOpen(false)
    }
  }

  const secondMonth = addMonths(viewMonth, 1)

  const startInput = (
    <input
      value={startText}
      onChange={e => setStartText(e.target.value)}
      onFocus={() => setOpen(true)}
      onBlur={e => commitStart(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { commitStart(startText); setOpen(false) } }}
      placeholder={startPlaceholder ?? (locale === 'en' ? 'mm/dd/yyyy' : 'dd/mm/aaaa')}
      style={{ ...fieldStyle, ...style }}
    />
  )
  const endInput = (
    <input
      value={endText}
      onChange={e => setEndText(e.target.value)}
      onFocus={() => setOpen(true)}
      onBlur={e => commitEnd(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { commitEnd(endText); setOpen(false) } }}
      placeholder={endPlaceholder ?? (locale === 'en' ? 'mm/dd/yyyy' : 'dd/mm/aaaa')}
      style={{ ...fieldStyle, ...style }}
    />
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {layout === 'inline' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {startInput}
          <span style={{ fontSize: 11, color: 'var(--arvo-fg-soft)' }}>→</span>
          {endInput}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label>
            {startLabel && <span style={labelStyle}>{startLabel}</span>}
            <div style={{ position: 'relative' }}>{startInput}</div>
          </label>
          <label>
            {endLabel && <span style={labelStyle}>{endLabel}</span>}
            <div style={{ position: 'relative' }}>{endInput}</div>
          </label>
        </div>
      )}
      {open && (
        <div style={{ ...popoverStyle, display: 'flex', gap: 18 }}>
          <div>
            <NavHeader monthDate={viewMonth} onChangeMonth={setViewMonth} onPrev={() => setViewMonth(m => addMonths(m, -1))} onNext={() => setViewMonth(m => addMonths(m, 1))} />
            <MonthGrid monthDate={viewMonth} start={start} end={end} hoverEnd={hoverEnd} onSelectDay={selectDay} onHoverDay={setHoverEnd} hideLabel />
          </div>
          <div className="hidden sm:block" style={{ borderLeft: '1px solid var(--arvo-border-soft)', paddingLeft: 18 }}>
            <div style={{ height: 26, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>
                {monthLabel(secondMonth, locale)}
              </span>
            </div>
            <MonthGrid monthDate={secondMonth} start={start} end={end} hoverEnd={hoverEnd} onSelectDay={selectDay} onHoverDay={setHoverEnd} hideLabel />
          </div>
        </div>
      )}
    </div>
  )
}
