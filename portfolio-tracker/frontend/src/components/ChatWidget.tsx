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

interface ChatWidgetProps {
  visible?: boolean
  onDismiss?: () => void
  forceOpen?: boolean
  onForceOpenConsumed?: () => void
}

export default function ChatWidget({ visible = true, onDismiss, forceOpen, onForceOpenConsumed }: ChatWidgetProps) {
  const { t, locale } = useI18n()
  const location = useLocation()
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [toolHint, setToolHint] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (forceOpen) { setOpen(true); onForceOpenConsumed?.() }
  }, [forceOpen])

  const SUGGESTIONS = [t.chat.s1, t.chat.s2, t.chat.s3, t.chat.s4]
  const tc = t.chat as unknown as Record<string, string>
  const TOOL_LABELS: Record<string, string> = {
    get_portfolio_summary:     tc.toolPortfolio,
    get_spending_by_category:  tc.toolSpending,
    get_transactions:          tc.toolTransactions,
    get_financial_summary:     tc.toolSummary,
    get_accounts:              tc.toolAccounts,
    get_period_performance:    tc.toolPerformance,
    get_dividends:             tc.toolDividends,
    get_tax_report:            tc.toolTax,
    web_search:                tc.toolWebSearch,
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

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes arvo-spin { to { transform: rotate(360deg); } }
        @keyframes arvo-bird-color {
          0%,100% { fill: #1B4FD8; filter: drop-shadow(0 0 3px rgba(27,79,216,0.5)); }
          33%      { fill: #E8A020; filter: drop-shadow(0 0 3px rgba(232,160,32,0.5)); }
          66%      { fill: #D63B2F; filter: drop-shadow(0 0 3px rgba(214,59,47,0.5)); }
        }
        .arvo-chat-glow {
          position: absolute; inset: -5px; border-radius: 50%;
          background: conic-gradient(from 0deg, #1B4FD8, #E8A020, #D63B2F, #1B4FD8);
          animation: arvo-spin 7s linear infinite;
          filter: blur(15px); opacity: 0.5; pointer-events: none;
        }
        .arvo-bird-p1 { animation: arvo-bird-color 3s ease-in-out infinite; animation-delay: 0s; }
        .arvo-bird-p2 { animation: arvo-bird-color 3s ease-in-out infinite; animation-delay: 0.25s; }
        .arvo-bird-p3 { animation: arvo-bird-color 3s ease-in-out infinite; animation-delay: 0.5s; }
        .arvo-bird-p4 { animation: arvo-bird-color 3s ease-in-out infinite; animation-delay: 0.75s; }
        .arvo-bird-p5 { animation: arvo-bird-color 3s ease-in-out infinite; animation-delay: 1.0s; }
        .arvo-bird-p6 { animation: arvo-bird-color 3s ease-in-out infinite; animation-delay: 1.25s; }
        @keyframes arvo-header-pulse {
          0%, 100% { opacity: 0.18; }
          50%       { opacity: 0.42; }
        }
        .arvo-chat-header-grad {
          position: absolute; inset: 0; border-radius: inherit;
          background: linear-gradient(105deg, #1B4FD8 0%, #E8A020 52%, #D63B2F 100%);
          animation: arvo-header-pulse 4s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes arvo-chat-border {
          0%, 100% { box-shadow: 0 0 0 1px rgba(27,79,216,0.28), 0 0 28px rgba(27,79,216,0.14), 0 8px 40px rgba(0,0,0,0.22); }
          33%       { box-shadow: 0 0 0 1px rgba(232,160,32,0.28), 0 0 28px rgba(232,160,32,0.14), 0 8px 40px rgba(0,0,0,0.22); }
          66%       { box-shadow: 0 0 0 1px rgba(214,59,47,0.28), 0 0 28px rgba(214,59,47,0.14), 0 8px 40px rgba(0,0,0,0.22); }
        }
        .arvo-chat-panel {
          animation: arvo-chat-border 6s ease-in-out infinite;
        }
        @keyframes arvo-dot-fade {
          0%, 80%, 100% { opacity: 0.25; }
          40% { opacity: 1; }
        }
        .arvo-dot-fade {
          animation: arvo-dot-fade 1.4s ease-in-out infinite;
        }
        .arvo-chat-send:hover:not(:disabled) {
          box-shadow: 0 0 0 1px rgba(232,160,32,0.35), 0 0 14px rgba(27,79,216,0.22), 0 0 14px rgba(214,59,47,0.16);
        }
      `}</style>

      {/* Floating button — desktop only */}
      <div className="hidden sm:block fixed chat-bubble-safe right-5 sm:right-10 z-50 sm:bottom-10">
        <div style={{ position: 'relative', width: 48, height: 48 }}>
          {/* Rotating conic glow */}
          <div className="arvo-chat-glow" />
          {/* Main button — surface circle, adapts to theme */}
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'var(--arvo-surface)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 14px rgba(0,0,0,0.12)', zIndex: 1,
            }}
            aria-label={open ? (t.chat.dismiss ?? 'Fechar') : t.chat.open}
          >
            {open ? (
              /* Close icon — two diagonal lines, rounded */
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1.5 1.5L12.5 12.5M12.5 1.5L1.5 12.5" stroke="var(--arvo-fg)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              /* Arvo bird with color cascade */
              <svg width="28" height="29" viewBox="0 0 174 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path className="arvo-bird-p1" d="M96.9642 82.5762C83.7642 28.1762 141.798 5.2429 172.464 0.576233C173.464 15.7429 159.764 53.3762 96.9642 82.5762Z"/>
                <path className="arvo-bird-p2" d="M165.464 82.5762V53.5762L136.964 73.9631V111.674C144.263 106.015 151.778 100.102 155.964 96.5762C163.564 90.1762 165.464 84.5762 165.464 82.5762Z"/>
                <path className="arvo-bird-p3" d="M121.464 85.0507V123.576C125.207 120.732 131.014 116.287 136.964 111.674V73.9631L121.464 85.0507Z"/>
                <path className="arvo-bird-p4" d="M96.9642 102.576L121.464 123.576V85.0507L96.9642 102.576Z"/>
                <path className="arvo-bird-p5" d="M121.464 155.576V123.576L96.9642 102.576V178.576L121.464 155.576Z"/>
                <path className="arvo-bird-p6" d="M0.513985 24.5762V51.5762C0.513985 53.5762 -0.135759 66.6762 7.46424 73.0762L44.514 101.576V155.076L69.014 178.076V82.0762L37.9642 56.0762L0.513985 24.5762Z"/>
              </svg>
            )}
          </button>
          {/* Dismiss badge — only when chat is closed */}
          {!open && onDismiss && (
            <button
              onClick={onDismiss}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] leading-none text-white transition-opacity hover:opacity-80"
              style={{ background: 'rgba(13,13,13,0.55)', zIndex: 2 }}
              aria-label={t.chat.dismiss ?? 'Fechar assistente'}
            >×</button>
          )}
        </div>
      </div>

      {/* Chat panel */}
      {open && (
        <div className="arvo-chat-panel fixed chat-dialog-safe right-5 sm:right-10 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] rounded-2xl flex flex-col overflow-hidden sm:bottom-20" style={{ background: 'var(--arvo-bg)' }}>
          {/* Header */}
          <div className="relative flex items-center gap-2.5 px-4 py-3 rounded-t-2xl" style={{ background: '#0D0D0D', borderBottom: '1px solid rgba(200,184,154,0.15)' }}>
            <div className="arvo-chat-header-grad rounded-t-2xl" />
            <div className="relative z-10 w-7 h-7 rounded-full flex-shrink-0 p-[1.5px]" style={{ background: 'conic-gradient(from 0deg, #1B4FD8, #E8A020, #D63B2F, #1B4FD8)' }}>
              <div className="w-full h-full rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
              </div>
            </div>
            <div className="relative z-10 min-w-0">
              <p className="text-white text-sm font-semibold leading-none">{t.chat.title}</p>
              <p className="text-white/60 text-[11px] mt-0.5">{t.chat.poweredBy}</p>
            </div>
            <div className="relative z-10 ml-auto flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-white/50 hover:text-white/80 text-[11px] transition-colors"
                >
                  {t.chat.clear}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                aria-label={t.chat.dismiss ?? 'Fechar'}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
            {isEmpty ? (
              <div className="flex flex-col h-full">
                <p className="text-[13px] text-center mt-6 mb-4" style={{ color: 'var(--arvo-fg-soft)', fontFamily: "var(--arvo-font-body)" }}>
                  {t.chat.greeting}
                </p>
                <div className="grid grid-cols-1 gap-1.5 mt-auto mb-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-left text-[12px] rounded-lg px-3 py-2 transition-all leading-snug"
                      style={{ background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg)', fontFamily: "var(--arvo-font-body)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--arvo-chip-bg)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--arvo-hover-bg)' }}
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
                        ? { background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)', borderBottomRightRadius: 4, fontFamily: "var(--arvo-font-body)" }
                        : { background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)', borderBottomLeftRadius: 4, fontFamily: "var(--arvo-font-body)" }}
                    >
                      {m.loading && !m.content ? (
                        <span className="flex gap-1.5 items-center h-4">
                          <span className="arvo-dot-fade" style={{ width: 6, height: 6, borderRadius: '50%', background: '#1B4FD8', animationDelay: '0ms' }} />
                          <span className="arvo-dot-fade" style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8A020', animationDelay: '160ms' }} />
                          <span className="arvo-dot-fade" style={{ width: 6, height: 6, borderRadius: '50%', background: '#D63B2F', animationDelay: '320ms' }} />
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
                style={{ minHeight: '36px', border: '1px solid var(--arvo-border-soft)', color: 'var(--arvo-fg)', fontFamily: "var(--arvo-font-body)" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="arvo-chat-send flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 transition-all"
                style={{ background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-center mt-1.5" style={{ color: 'var(--arvo-fg-faint)', fontFamily: "var(--arvo-font-body)" }}>{t.chat.enterHint}</p>
          </div>
        </div>
      )}
    </>
  )
}
