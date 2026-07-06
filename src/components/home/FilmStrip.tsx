/* eslint-disable @next/next/no-img-element */

const FOTOS: { src: string; local: string }[] = [
  { src: '/img/paris-arco-triunfo.jpg', local: 'Paris' },
  { src: '/img/islandia-cachoeira.jpg', local: 'Skógafoss, Islândia' },
  { src: '/img/nyc-dumbo.jpg', local: 'Brooklyn, Nova York' },
  { src: '/img/holanda-moinhos.jpg', local: 'Zaanse Schans, Holanda' },
  { src: '/img/islandia-vik.jpg', local: 'Vík, Islândia' },
  { src: '/img/paris-sacre-coeur.jpg', local: 'Montmartre, Paris' },
  { src: '/img/nyc-times-square.jpg', local: 'Nova York' },
  { src: '/img/islandia-praia-negra.jpg', local: 'Reynisfjara, Islândia' },
  { src: '/img/paris-orsay.jpg', local: 'Musée d’Orsay, Paris' },
  { src: '/img/nyc-entardecer.jpg', local: 'Nova York' },
  { src: '/img/paris-jambon-beurre.jpg', local: 'Paris' },
  { src: '/img/islandia-igreja.jpg', local: 'Islândia' },
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
