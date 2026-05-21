import { useState } from 'react'
import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l7.5-7.5 4 4L21 4.5M3 20.5h18" />
      </svg>
    ),
    title: 'Portfólio em tempo real',
    desc: 'Acompanhe todos os seus investimentos — ações B3, ETFs, criptos, renda fixa e imóveis — em uma única tela com cotações ao vivo.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Multimoeda e multipaís',
    desc: 'Gerencie ativos em BRL, EUR e USD. Veja seu patrimônio consolidado na moeda que preferir, com taxas de câmbio automáticas.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75" />
      </svg>
    ),
    title: 'Controle financeiro',
    desc: 'Importe extratos, categorize gastos, crie orçamentos por envelope e entenda para onde vai seu dinheiro todo mês.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5" />
      </svg>
    ),
    title: 'Assistente com IA',
    desc: 'Converse com seu portfólio em linguagem natural. Pergunte "Quanto investi em renda fixa?" e receba respostas instantâneas.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.499z" />
      </svg>
    ),
    title: 'Conquistas e gamificação',
    desc: 'Desbloqueie medalhas conforme você cresce: primeira semente, cinco dígitos, clube do milhão. Sua jornada tem marcos.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    title: 'Relatórios de IR',
    desc: 'Gere relatórios de imposto de renda com ganhos/perdas de capital em cada operação. Tudo calculado automaticamente.',
  },
]

const FAQS = [
  {
    q: 'O ARVO é gratuito?',
    a: 'Sim, o ARVO está em fase beta e é totalmente gratuito. Foque em crescer seu patrimônio — a conta é por nossa conta.',
  },
  {
    q: 'Meus dados financeiros são seguros?',
    a: 'Seus dados são armazenados de forma criptografada via Supabase (infraestrutura PostgreSQL com RLS). Nunca vendemos ou compartilhamos suas informações.',
  },
  {
    q: 'Quais tipos de investimento posso registrar?',
    a: 'Ações B3, ETFs brasileiros e internacionais, criptomoedas, renda fixa (CDB, Tesouro, LCI, LCA, debentures), fundos imobiliários, previdência, imóveis e qualquer ativo manual com valor personalizado.',
  },
  {
    q: 'Funciona para quem mora fora do Brasil?',
    a: 'Sim! O ARVO foi criado por um brasileiro na França. Você pode gerenciar ativos em BRL, EUR e USD e ver seu patrimônio consolidado na moeda que preferir.',
  },
  {
    q: 'Posso importar meu extrato bancário?',
    a: 'Sim, basta fazer upload de um CSV e o sistema importa automaticamente as transações. Você depois categoriza e cria seu orçamento.',
  },
  {
    q: 'Tem app mobile?',
    a: 'O ARVO é uma PWA (Progressive Web App) — funciona no celular pelo navegador com uma experiência semelhante a um app nativo. Um app dedicado está planejado.',
  },
]

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110] font-sans">
      {/* ── NAV ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAFAF8]/90 backdrop-blur-sm border-b border-[#E0DDD5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <a href="#hero" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#001A70] flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">A</span>
            </div>
            <span className="font-bold text-[#001A70] text-lg tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>ARVO</span>
          </a>

          {/* Desktop nav links */}
          <nav className="hidden sm:flex items-center gap-6 text-sm text-[#6B6B67]">
            <a href="#funcionalidades" className="hover:text-[#001A70] transition-colors">Funcionalidades</a>
            <a href="#recursos" className="hover:text-[#001A70] transition-colors">Recursos</a>
            <a href="#faq" className="hover:text-[#001A70] transition-colors">FAQ</a>
          </nav>

          {/* CTA buttons */}
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:block text-sm text-[#001A70] font-medium hover:underline px-3 py-1.5"
            >
              Entrar
            </Link>
            <Link
              to="/login?mode=register"
              className="text-sm bg-[#001A70] text-white font-semibold rounded-lg px-4 py-2 hover:bg-[#002494] transition-colors"
            >
              Começar grátis
            </Link>
            {/* Mobile menu button */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="sm:hidden ml-1 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Menu"
            >
              <svg className="w-5 h-5 text-[#001A70]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="sm:hidden bg-[#FAFAF8] border-t border-[#E0DDD5] px-4 py-3 space-y-2 text-sm">
            <a href="#funcionalidades" onClick={() => setMenuOpen(false)} className="block py-2 text-[#6B6B67] hover:text-[#001A70]">Funcionalidades</a>
            <a href="#recursos"        onClick={() => setMenuOpen(false)} className="block py-2 text-[#6B6B67] hover:text-[#001A70]">Recursos</a>
            <a href="#faq"             onClick={() => setMenuOpen(false)} className="block py-2 text-[#6B6B67] hover:text-[#001A70]">FAQ</a>
            <Link to="/login"          onClick={() => setMenuOpen(false)} className="block py-2 text-[#001A70] font-medium">Entrar</Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section id="hero" className="pt-32 pb-20 px-4 sm:px-6 max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-[#001A70] bg-[#001A70]/8 rounded-full px-3 py-1.5 mb-6 border border-[#001A70]/15">
          <span className="w-1.5 h-1.5 rounded-full bg-[#001A70] animate-pulse"/>
          Beta · Acesso gratuito
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold text-[#111110] leading-tight mb-5 tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
          Cultive o que<br />
          <span className="text-[#001A70]">importa.</span>
        </h1>

        <p className="text-lg sm:text-xl text-[#6B6B67] max-w-xl mx-auto mb-8 leading-relaxed">
          O ARVO reúne seu portfólio de investimentos e controle financeiro em um só lugar. Multimoeda. Multiplataforma. Feito para quem pensa no longo prazo.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/login?mode=register"
            className="bg-[#001A70] text-white font-semibold rounded-xl px-8 py-3.5 text-base hover:bg-[#002494] transition-colors shadow-sm"
          >
            Criar conta grátis
          </Link>
          <Link
            to="/login"
            className="border border-[#E0DDD5] text-[#111110] font-medium rounded-xl px-8 py-3.5 text-base hover:border-[#001A70]/30 hover:bg-white transition-colors"
          >
            Já tenho conta
          </Link>
        </div>

        {/* Stats bar */}
        <div className="mt-14 grid grid-cols-3 gap-6 sm:gap-10 max-w-lg mx-auto">
          {[
            { value: '6+', label: 'Classes de ativos' },
            { value: '3', label: 'Moedas suportadas' },
            { value: '30+', label: 'Conquistas' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-2xl font-bold text-[#001A70]">{s.value}</p>
              <p className="text-xs text-[#6B6B67] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FUNCIONALIDADES ── */}
      <section id="funcionalidades" className="py-20 px-4 sm:px-6 bg-white border-y border-[#E0DDD5]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-[#001A70] mb-2" style={{ fontFamily: "'DM Mono', monospace" }}>Funcionalidades</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111110]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Tudo que você precisa para<br className="hidden sm:block" /> crescer com consciência
            </h2>
          </div>

          <div id="recursos" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="rounded-2xl border border-[#E0DDD5] bg-[#FAFAF8] p-6 hover:shadow-sm hover:border-[#001A70]/20 transition-all">
                <div className="w-10 h-10 rounded-xl bg-[#001A70]/8 text-[#001A70] flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-bold text-[#111110] mb-2">{f.title}</h3>
                <p className="text-sm text-[#6B6B67] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HIGHLIGHT STRIP ── */}
      <section className="py-16 px-4 sm:px-6 bg-[#001A70]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-2xl sm:text-3xl font-bold text-white leading-snug mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            "Construído por um brasileiro na França,<br className="hidden sm:block" /> para quem vive entre dois mundos."
          </p>
          <p className="text-[#C9A227] text-sm mt-4 font-medium">Portfólio multimoeda · Expatriados bem-vindos · Sem mensalidade</p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#001A70] mb-2" style={{ fontFamily: "'DM Mono', monospace" }}>FAQ</p>
            <h2 className="text-3xl font-bold text-[#111110]" style={{ fontFamily: "'Playfair Display', serif" }}>Perguntas frequentes</h2>
          </div>

          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-[#E0DDD5] rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-[#111110] text-sm">{faq.q}</span>
                  <svg
                    className={`w-4 h-4 text-[#001A70] flex-shrink-0 ml-3 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-[#6B6B67] leading-relaxed border-t border-[#E0DDD5] pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="py-20 px-4 sm:px-6 bg-[#FAFAF8] border-t border-[#E0DDD5]">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-3xl font-bold text-[#111110] mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            Pronto para cultivar seu patrimônio?
          </h2>
          <p className="text-[#6B6B67] text-sm mb-6">Crie sua conta em menos de 2 minutos. Gratuito, sem cartão de crédito.</p>
          <Link
            to="/login?mode=register"
            className="inline-block bg-[#001A70] text-white font-semibold rounded-xl px-8 py-3.5 text-base hover:bg-[#002494] transition-colors"
          >
            Começar agora
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[#E0DDD5] py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B6B67]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-[#001A70] flex items-center justify-center">
              <span className="text-white text-[9px] font-bold">A</span>
            </div>
            <span className="font-semibold text-[#001A70]" style={{ fontFamily: "'Playfair Display', serif" }}>ARVO</span>
            <span>· Cultive o que importa.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-[#001A70] transition-colors">Privacidade</Link>
            <Link to="/terms"   className="hover:text-[#001A70] transition-colors">Termos</Link>
            <Link to="/login"   className="hover:text-[#001A70] transition-colors">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
