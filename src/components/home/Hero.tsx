import Image from 'next/image';

export default function Hero() {
  return (
    <header className="ag-hero">
      <div className="ag-wrap ag-hero-grid">
        <div>
          <p className="ag-kicker">Brasileiro em Paris</p>
          <h1>
            Uma vida sendo <em className="ag-mark">construída</em> fora do
            Brasil.
          </h1>
          <p className="ag-hero-sub">
            Saí do Brasil pra recomeçar em Paris e resolvi documentar tudo:
            o que custa, o que muda e o que ninguém te conta antes de ir.
            Sem vida perfeita de internet. A história como ela é.
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
          <div className="ag-hero-frame">
            <Image
              src="/img/andre-arco-triunfo.jpg"
              alt="André Gutto caminhando em frente ao Arco do Triunfo, em Paris"
              width={768}
              height={1024}
              priority
              sizes="(max-width: 900px) 90vw, 420px"
            />
            <p className="ag-photo-caption">
              <span>Arco do Triunfo, Paris</span>
              <span className="ag-num">fig. 01</span>
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
