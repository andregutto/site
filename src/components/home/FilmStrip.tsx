/* eslint-disable @next/next/no-img-element */

const FOTOS: { src: string; local: string }[] = [
  { src: '/img/lencois-dunas.jpg', local: 'Lençóis Maranhenses, Brasil' },
  { src: '/img/paris-arco-triunfo.jpg', local: 'Paris' },
  { src: '/img/mont-saint-michel.jpg', local: 'Mont Saint-Michel, França' },
  { src: '/img/islandia-vik.jpg', local: 'Vík, Islândia' },
  { src: '/img/nyc-dumbo.jpg', local: 'Brooklyn, Nova York' },
  { src: '/img/chambord.jpg', local: 'Chambord, França' },
  { src: '/img/saint-malo-arco-iris.jpg', local: 'Saint-Malo, França' },
  { src: '/img/londres-big-ben.jpg', local: 'Londres' },
  { src: '/img/islandia-praia-negra.jpg', local: 'Reynisfjara, Islândia' },
  { src: '/img/paris-sacre-coeur.jpg', local: 'Montmartre, Paris' },
  { src: '/img/rennes.jpg', local: 'Rennes, França' },
  { src: '/img/nyc-times-square.jpg', local: 'Nova York' },
  { src: '/img/vinhedo-uvas.jpg', local: 'Vale do Loire, França' },
  { src: '/img/holanda-moinhos.jpg', local: 'Zaanse Schans, Holanda' },
];

export default function FilmStrip() {
  return (
    <section className="ag-strip" aria-label="Fotografias de viagens">
      <div className="ag-strip-track">
        {[...FOTOS, ...FOTOS].map((f, i) => (
          <figure className="ag-strip-item" key={i} aria-hidden={i >= FOTOS.length}>
            <img src={f.src} alt={i < FOTOS.length ? f.local : ''} loading="lazy" />
            <figcaption data-num={`${String((i % FOTOS.length) + 1).padStart(2, '0')} /`}>
              {f.local}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
