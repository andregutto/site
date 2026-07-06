import Image from 'next/image';
import { getLatestVideos, formatVideoDate } from '@/lib/youtube';
import Reveal from './Reveal';

export default async function VideosSection() {
  const videos = await getLatestVideos(6);

  return (
    <section className="ag-section ag-dark ag-videos" id="videos">
      <div className="ag-wrap">
        <Reveal>
          <div className="ag-videos-head">
            <div>
              <p className="ag-kicker">No YouTube</p>
              <h2 className="ag-h2">Últimos vídeos</h2>
              <p className="ag-videos-note">Vídeos novos toda semana</p>
            </div>
            <a
              className="ag-link"
              href="https://youtube.com/@andregutto"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver canal completo ↗
            </a>
          </div>
        </Reveal>

        {videos.length === 0 ? (
          <Reveal delay={80}>
            <div className="ag-videos-empty">
              <h3>O primeiro vídeo está a caminho.</h3>
              <p>
                Estou gravando os primeiros episódios agora. Inscreva-se e
                acompanhe essa história desde o comecinho, que é a melhor
                parte.
              </p>
              <a
                className="ag-btn"
                href="https://youtube.com/@andregutto"
                target="_blank"
                rel="noopener noreferrer"
              >
                Inscrever-se no canal
              </a>
            </div>
          </Reveal>
        ) : (
          <div className="ag-videos-grid">
            {videos.map((v, i) => (
              <Reveal key={v.id} delay={i * 70}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ag-video-card"
                >
                  <div className="ag-video-thumb">
                    {v.thumbnail && (
                      <Image
                        src={v.thumbnail}
                        alt={v.title}
                        fill
                        sizes="(max-width: 900px) 100vw, 33vw"
                      />
                    )}
                  </div>
                  <p className="ag-video-date">{formatVideoDate(v.publishedAt)}</p>
                  <p className="ag-video-title">{v.title}</p>
                </a>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
