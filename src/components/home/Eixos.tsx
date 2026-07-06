/* eslint-disable @next/next/no-img-element */
import Reveal from './Reveal';

const EIXOS = [
  {
    num: '01',
    titulo: 'Lucidez financeira entre dois países',
    texto:
      'Investimentos, câmbio, impostos e custo de vida sem achismo. Decidir no escuro é caro, aqui a luz fica acesa.',
    foto: '/img/nyc-skyline.jpg',
    alt: 'Skyline de Nova York ao entardecer',
  },
  {
    num: '02',
    titulo: 'Vida construída com intenção',
    texto:
      'Morar fora é logística. Construir uma vida fora é projeto: casa, rotina, relações e as escolhas que ninguém filma.',
    foto: '/img/paris-cafe.jpg',
    alt: 'Café em uma mesa de bistrô em Paris',
  },
  {
    num: '03',
    titulo: 'Identidade preservada na travessia',
    texto:
      'Dá pra atravessar o oceano sem virar caricatura. Continuar brasileiro é parte do plano, não um obstáculo.',
    foto: '/img/andre-blue-lagoon.jpg',
    alt: 'André sorrindo em uma lagoa termal na Islândia',
  },
];

export default function Eixos() {
  return (
    <section className="ag-section" style={{ paddingTop: 0 }}>
      <div className="ag-wrap">
        <Reveal>
          <p className="ag-kicker">O que você leva daqui</p>
          <h2 className="ag-h2">
            Três coisas que eu persigo <em>em cada vídeo</em>
          </h2>
        </Reveal>
        <div className="ag-eixos-list">
          {EIXOS.map((e, i) => (
            <Reveal key={e.num} delay={i * 90}>
              <article className="ag-eixo">
                <span className="ag-eixo-num">{e.num}.</span>
                <div>
                  <h3>{e.titulo}</h3>
                  <p>{e.texto}</p>
                </div>
                <img className="ag-eixo-thumb" src={e.foto} alt={e.alt} loading="lazy" />
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
