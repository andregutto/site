/* eslint-disable @next/next/no-img-element */
import Image from 'next/image';

function Stamp() {
  return (
    <svg className="ag-stamp" viewBox="0 0 110 110" aria-hidden="true">
      <defs>
        <path
          id="ag-stamp-circle"
          d="M 55,55 m -40,0 a 40,40 0 1,1 80,0 a 40,40 0 1,1 -80,0"
        />
      </defs>
      <circle cx="55" cy="55" r="52" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <circle cx="55" cy="55" r="27" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <text
        fill="currentColor"
        fontSize="10.5"
        letterSpacing="2.4"
        style={{ fontFamily: 'var(--f-data), monospace', textTransform: 'uppercase' }}
      >
        <textPath href="#ag-stamp-circle">Paris · Finanças · Lifestyle · Brasil ·</textPath>
      </text>
    </svg>
  );
}

export default function Hero() {
  return (
    <header className="ag-hero">
      <div className="ag-wrap">
        <div className="ag-hero-masthead">
          <span className="ag-mono">Edição nº 001 · Paris</span>
          <span className="ag-mono ag-coords">48.8566° N, 2.3522° E</span>
          <span className="ag-mono">Desde o dia um</span>
        </div>

        <h1>
          Uma vida
          <img
            className="ag-chip"
            src="/img/paris-haussmann.jpg"
            alt=""
            aria-hidden="true"
            style={{ objectPosition: '50% 78%' }}
          />
          sendo <em>construída</em> fora
          <img className="ag-chip" src="/img/islandia-vik.jpg" alt="" aria-hidden="true" />
          do Brasil.
        </h1>

        <div className="ag-hero-below">
          <div>
            <p className="ag-hero-sub">
              Finanças reais, escolhas honestas e os bastidores de um
              brasileiro em Paris. <strong>Sem fórmula, sem personagem,
              com os números na mesa.</strong>
            </p>
            <div className="ag-hero-ctas">
              <a
                className="ag-btn"
                href="https://youtube.com/@andregutto"
                target="_blank"
                rel="noopener noreferrer"
              >
                Acompanhar no YouTube
              </a>
              <a className="ag-link" href="#newsletter">
                Assinar a newsletter
              </a>
            </div>
            <div className="ag-hero-meta">
              <span>Vídeos novos qui &amp; dom</span>
              <span>2 países · 3 moedas</span>
              <span>Tudo documentado</span>
            </div>
          </div>

          <div className="ag-hero-photo">
            <Stamp />
            <div className="ag-hero-frame">
              <Image
                src="/img/andre-luxembourg.jpg"
                alt="André Gutto no Jardin du Luxembourg, em Paris"
                width={1519}
                height={2000}
                priority
                sizes="(max-width: 900px) 90vw, 400px"
              />
              <p className="ag-photo-caption">
                <span>Jardin du Luxembourg, Paris</span>
                <span className="ag-num">fig. 01</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
