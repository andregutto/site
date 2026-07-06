import Image from 'next/image';
import Reveal from './Reveal';

export default function Sobre() {
  return (
    <section className="ag-section" id="sobre">
      <div className="ag-wrap ag-sobre-grid">
        <div>
          <Reveal>
            <p className="ag-kicker">Quem escreve</p>
            <p className="ag-lede">
              Sou o André. Brasileiro, vivo em Paris e trabalho no setor de
              energia. No resto do tempo, documento o que ninguém mostra:
              <em> o custo real das coisas</em>, as decisões difíceis e a vida
              que dá pra construir do outro lado do oceano.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="ag-sobre-body">
              <p>
                Este não é um canal de turismo, nem um curso de como imigrar.
                É o diário aberto de quem saiu do Brasil com um plano e foi
                obrigado a refazê-lo na prática, entre dois países, três
                moedas e um monte de boletos em francês.
              </p>
              <p>
                Cada vídeo tem começo, meio e fim. Cada número é real, dos
                gastos do mês ao imposto pago. Se você mora fora ou pensa
                seriamente em sair, a ideia é que você termine cada história
                com algo que não tinha antes.
              </p>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="ag-sobre-stats">
              <div>
                <strong>2</strong>
                <span>países, uma vida</span>
              </div>
              <div>
                <strong>3</strong>
                <span>moedas na planilha</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>números reais</span>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <div className="ag-sobre-photos">
            <div className="ag-sobre-photo-main">
              <Image
                src="/img/andre-islandia.jpg"
                alt="André na costa sul da Islândia, no inverno"
                width={724}
                height={1086}
                sizes="(max-width: 900px) 90vw, 400px"
              />
              <p className="ag-photo-caption">
                <span>Islândia, inverno</span>
              </p>
            </div>
            <div className="ag-sobre-photo-small">
              <Image
                src="/img/andre-amsterdam-canal.jpg"
                alt="André em um canal de Amsterdã"
                width={360}
                height={540}
                sizes="190px"
              />
              <p className="ag-photo-caption">
                <span>Amsterdã</span>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
