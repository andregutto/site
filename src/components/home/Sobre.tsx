import Image from 'next/image';
import Reveal from './Reveal';

export default function Sobre() {
  return (
    <section className="ag-section ag-sobre" id="sobre">
      <div className="ag-wrap ag-sobre-grid">
        <div>
          <Reveal>
            <p className="ag-kicker">Prazer, André</p>
            <p className="ag-lede">
              Sou engenheiro de energia renovável. Sair do Brasil não foi
              impulso, foi projeto: planejado, calculado e executado até
              chegar em Paris. Esta página documenta o que vem depois do
              plano, enquanto acontece.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="ag-sobre-body">
              <p>
                Não sou influenciador nem vendedor de fórmula. Sou um
                engenheiro que trata a própria vida como trata um projeto:
                com método, com números e com honestidade sobre o que
                funciona e o que não funciona. Carreira, contas, viagens,
                recomeços: tudo entra no relato.
              </p>
              <p>
                Se você pensa em sair do Brasil, já saiu, ou só gosta de ver
                uma vida sendo montada peça por peça, fica por aqui. No
                canal, na newsletter e nas ferramentas desta página, o
                combinado é o mesmo: te contar o que eu gostaria que alguém
                tivesse me contado.
              </p>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="ag-sobre-stats">
              <div>
                <strong>2</strong>
                <span>países chamados de casa</span>
              </div>
              <div>
                <strong>1</strong>
                <span>história sem roteiro</span>
              </div>
              <div>
                <strong>0</strong>
                <span>personagens</span>
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
                sizes="(max-width: 900px) 90vw, 390px"
              />
              <p className="ag-photo-caption">
                <span>Islândia, o lado de cá</span>
                <span className="ag-num">fig. 02</span>
              </p>
            </div>
            <div className="ag-sobre-photo-small">
              <Image
                src="/img/andre-lencois-2.jpg"
                alt="André nos Lençóis Maranhenses, no Brasil"
                width={540}
                height={360}
                sizes="230px"
              />
              <p className="ag-photo-caption">
                <span>Brasil, o lado de lá</span>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
