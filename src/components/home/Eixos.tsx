/* eslint-disable @next/next/no-img-element */
import Reveal from './Reveal';

const TEMAS = [
  {
    num: '01',
    titulo: 'O preço real das coisas',
    texto:
      'Morar, mudar, recomeçar: quanto custa de verdade, com recibo na mão e sem vergonha do boleto.',
    foto: '/img/paris-haussmann.jpg',
    alt: 'Prédio haussmanniano em Paris',
  },
  {
    num: '02',
    titulo: 'A vida fora do cartão-postal',
    texto:
      'A rotina, a burocracia, as pequenas vitórias de quem vive onde os outros passam férias.',
    foto: '/img/paris-cafe.jpg',
    alt: 'Café em uma mesa de bistrô em Paris',
  },
  {
    num: '03',
    titulo: 'As estradas no meio do caminho',
    texto:
      'Da duna no Maranhão ao gelo da Islândia: as viagens que atravessam essa história.',
    foto: '/img/lencois-dunas.jpg',
    alt: 'Dunas dos Lençóis Maranhenses',
  },
];

export default function Eixos() {
  return (
    <section className="ag-section ag-eixos" style={{ paddingTop: 0 }}>
      <div className="ag-wrap">
        <Reveal>
          <p className="ag-kicker">Os assuntos</p>
          <h2 className="ag-h2">O que você encontra por aqui</h2>
        </Reveal>
        <div className="ag-eixos-list">
          {TEMAS.map((t, i) => (
            <Reveal key={t.num} delay={i * 90}>
              <article className="ag-eixo">
                <span className="ag-eixo-num">{t.num}</span>
                <div>
                  <h3>{t.titulo}</h3>
                  <p>{t.texto}</p>
                </div>
                <img className="ag-eixo-thumb" src={t.foto} alt={t.alt} loading="lazy" />
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
