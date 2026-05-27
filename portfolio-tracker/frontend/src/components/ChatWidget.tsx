import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

function renderText(text: string) {
  // Minimal markdown: **bold**, bullet lists, line breaks
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const isBullet = /^[-•]\s/.test(line)
    const parts = line.replace(/^[-•]\s/, '').split(/\*\*(.+?)\*\*/g)
    const content = parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)
    return (
      <span key={i} className={`block ${isBullet ? 'pl-3 relative before:absolute before:left-0 before:content-["•"]' : ''} ${i > 0 && !isBullet && lines[i-1] === '' ? 'mt-2' : ''}`}>
        {content}
        {i < lines.length - 1 && !isBullet && line !== '' && '\n'}
      </span>
    )
  })
}

export default function ChatWidget() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [toolHint, setToolHint] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const SUGGESTIONS = [t.chat.s1, t.chat.s2, t.chat.s3, t.chat.s4]
  const TOOL_LABELS: Record<string, string> = {
    get_portfolio_summary:     t.chat.toolPortfolio,
    get_spending_by_category:  t.chat.toolSpending,
    get_transactions:          t.chat.toolTransactions,
    get_financial_summary:     t.chat.toolSummary,
    get_accounts:              t.chat.toolAccounts,
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolHint])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '', loading: true }])
    setInput('')
    setLoading(true)
    setToolHint('')

    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const base  = import.meta.env.VITE_API_BASE_URL ?? ''

      const apiMessages = history.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Locale': locale,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: apiMessages, currentPath: location.pathname }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; text?: string; tool?: string; message?: string }
            if (event.type === 'delta' && event.text) {
              assistantText += event.text
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: assistantText, loading: true }
                return next
              })
            } else if (event.type === 'tool_call' && event.tool) {
              setToolHint(TOOL_LABELS[event.tool] ?? t.chat.consulting)
            } else if (event.type === 'done') {
              setToolHint('')
            } else if (event.type === 'error') {
              assistantText = event.message ?? t.chat.errorProcessing
            }
          } catch { /* ignore malformed events */ }
        }
      }

      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: assistantText || t.chat.errorNoResponse, loading: false }
        return next
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro de conexão.'
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: msg, loading: false }
        return next
      })
    } finally {
      setLoading(false)
      setToolHint('')
    }
  }, [messages, loading])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-20 right-5 z-50 w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center transition-all sm:bottom-5"
        style={{ background: 'var(--arvo-black)', border: '1px solid rgba(200,184,154,0.25)' }}
        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(200,184,154,0.6)' }}
        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(200,184,154,0.25)' }}
        aria-label={t.chat.open}
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-36 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] rounded-2xl shadow-2xl flex flex-col overflow-hidden sm:bottom-20" style={{ background: 'var(--arvo-offwhite)', border: '1px solid var(--arvo-border-soft)' }}>
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-t-2xl" style={{ background: 'var(--arvo-black)', borderBottom: '1px solid rgba(200,184,154,0.15)' }}>
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold leading-none">{t.chat.title}</p>
              <p className="text-white/60 text-[11px] mt-0.5">{t.chat.poweredBy}</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="ml-auto text-white/50 hover:text-white/80 text-[11px] transition-colors"
              >
                {t.chat.clear}
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
            {isEmpty ? (
              <div className="flex flex-col h-full">
                <p className="text-[13px] text-center mt-6 mb-4" style={{ color: 'rgba(13,13,13,0.45)', fontFamily: "var(--arvo-font-body)" }}>
                  {t.chat.greeting}
                </p>
                <div className="grid grid-cols-1 gap-1.5 mt-auto mb-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-left text-[12px] rounded-lg px-3 py-2 transition-all leading-snug"
                      style={{ background: 'rgba(13,13,13,0.05)', color: 'var(--arvo-black)', fontFamily: "var(--arvo-font-body)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(13,13,13,0.09)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(13,13,13,0.05)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap"
                      style={m.role === 'user'
                        ? { background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', borderBottomRightRadius: 4, fontFamily: "var(--arvo-font-body)" }
                        : { background: 'rgba(13,13,13,0.07)', color: 'var(--arvo-black)', borderBottomLeftRadius: 4, fontFamily: "var(--arvo-font-body)" }}
                    >
                      {m.loading && !m.content ? (
                        <span className="flex gap-1 items-center h-4">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        </span>
                      ) : m.role === 'assistant' ? (
                        renderText(m.content)
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))}
                {toolHint && (
                  <p className="text-[11px] text-gray-400 text-center animate-pulse">{toolHint}</p>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--arvo-border-soft)' }}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={t.chat.placeholder}
                disabled={loading}
                className="flex-1 resize-none rounded-xl px-3 py-2 text-[13px] focus:outline-none disabled:opacity-50 max-h-24 overflow-y-auto leading-relaxed bg-transparent"
                style={{ minHeight: '36px', border: '1px solid var(--arvo-border-soft)', color: 'var(--arvo-black)', fontFamily: "var(--arvo-font-body)" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 w-8 h-8 rounded-full text-white flex items-center justify-center disabled:opacity-40 transition-all"
                style={{ background: 'var(--arvo-black)' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-center mt-1.5" style={{ color: 'rgba(13,13,13,0.35)', fontFamily: "var(--arvo-font-body)" }}>{t.chat.enterHint}</p>
          </div>
        </div>
      )}
    </>
  )
}
