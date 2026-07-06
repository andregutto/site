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
        letterSpacing="2.2"
        style={{ fontFamily: 'var(--f-data), monospace', textTransform: 'uppercase' }}
      >
        <textPath href="#ag-stamp-circle">Brasil · Paris · uma vida em construção ·</textPath>
      </text>
    </svg>
  );
}

export default function Hero() {
  return (
    <header className="ag-hero">
      <div className="ag-wrap ag-hero-grid">
        <div>
          <p className="ag-kicker">Brasileiro em Paris</p>
          <h1>Uma vida sendo construída fora do Brasil.</h1>
          <p className="ag-hero-sub">
            Planejei a mudança pro outro lado do oceano e resolvi documentar
            a execução: as contas, as escolhas, as estradas e o que nenhum
            plano prevê. Sem filtro de internet, sem personagem.
          </p>
          <div className="ag-hero-ctas">
            <a
              className="ag-btn"
              href="https://youtube.com/@andregutto"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver o canal
            </a>
            <a className="ag-link" href="#newsletter">
              Receber por email
            </a>
          </div>
        </div>

        <div className="ag-hero-photo">
          <Stamp />
          <div className="ag-hero-frame">
            <Image
              src="/img/andre-luxembourg.jpg"
              alt="André Gutto sorrindo no Jardin du Luxembourg, em Paris"
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
    </header>
  );
}
