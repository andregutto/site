const videos = [
  {
    href: "#",
    thumbClass: "thumb-2",
    pill: { label: "Finanças", className: "pill-finance" },
    title: "€55.000 de salário na França, mas quanto realmente sobra?",
    meta: "V2 · 30 abr 2025",
  },
  {
    href: "#",
    thumbClass: "thumb-1",
    pill: { label: "Finanças", className: "pill-finance" },
    title: "Gastei €3.576 para morar em Paris",
    meta: "V1 · 23 abr 2025",
  },
  {
    href: "#",
    thumbClass: "thumb-3",
    pill: { label: "Em breve", className: "pill-soon" },
    title: "Próximo vídeo chegando…",
    meta: "V3 · em produção",
  },
];

export default function Videos() {
  return (
    <section className="videos" id="videos">
      <div className="videos-header">
        <div>
          <div className="section-eyebrow">
            <span className="eyebrow-dot"></span>
            <span className="eyebrow-text">Vídeos</span>
          </div>
          <h2 className="section-title">Últimos vídeos</h2>
        </div>
        <a
          href="https://youtube.com/@andregutto"
          target="_blank"
          rel="noopener noreferrer"
          className="link-arrow"
        >
          Ver canal completo →
        </a>
      </div>

      <div className="videos-grid">
        {videos.map((v, i) => (
          <a key={i} href={v.href} className="video-card">
            <div className={`video-thumb ${v.thumbClass}`}>
              <span className={`video-pill ${v.pill.className}`}>{v.pill.label}</span>
              <div className="play-btn"></div>
            </div>
            <div className="video-info">
              <div className="video-title">{v.title}</div>
              <div className="video-meta">{v.meta}</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
