import Image from "next/image";
import { getLatestVideos, formatVideoDate } from "@/lib/youtube";

function EmBreve() {
  return (
    <div className="videos-empty">
      <div className="videos-empty-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="19" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          <path
            d="M16 14.5l12 5.5-12 5.5V14.5z"
            fill="rgba(255,255,255,0.25)"
          />
        </svg>
      </div>
      <p className="videos-empty-title">Vídeos chegando em breve</p>
      <p className="videos-empty-sub">
        O canal está sendo preparado. Inscreva-se para não perder o primeiro vídeo.
      </p>
      <a
        href="https://youtube.com/@andregutto"
        target="_blank"
        rel="noopener noreferrer"
        className="videos-empty-cta"
      >
        Inscrever-se no canal →
      </a>
    </div>
  );
}

export default async function Videos() {
  const videos = await getLatestVideos(6);

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

      {videos.length === 0 ? (
        <EmBreve />
      ) : (
        <div className="videos-grid">
          {videos.map((v) => (
            <a
              key={v.id}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="video-card"
            >
              <div className="video-thumb video-thumb--real">
                {v.thumbnail ? (
                  <Image
                    src={v.thumbnail}
                    alt={v.title}
                    fill
                    sizes="(max-width: 800px) 100vw, 33vw"
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div className="thumb-1" style={{ position: "absolute", inset: 0 }} />
                )}
                <div className="play-btn play-btn--overlay"></div>
              </div>
              <div className="video-info">
                <div className="video-title">{v.title}</div>
                <div className="video-meta">{formatVideoDate(v.publishedAt)}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
