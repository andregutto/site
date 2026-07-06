import Image from 'next/image';
import Reveal from './Reveal';

export default function Sobre() {
  return (
    <section className="ag-section" id="sobre">
      <div className="ag-wrap ag-sobre-grid">
        <div>
          <Reveal>
            <p className="ag-kicker">Prazer, André</p>
            <p className="ag-lede">
              Cresci no Brasil, moro em Paris e resolvi contar essa história
              enquanto ela acontece. Não depois, quando tudo já deu certo e
              vira palestra. Agora, com a mudança ainda na caixa.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="ag-sobre-body">
              <p>
                Aqui você não vai encontrar fórmula de enriquecimento nem
                manual de imigração. Vai encontrar um cara comum decidindo,
                errando e ajustando a rota em tempo real, com os números e
                as razões na mesa.
              </p>
              <p>
                Num dia o assunto é o aluguel em Paris. No outro, um trem
                barato pra um castelo no meio do nada, ou a saudade que
                aperta quando o resto da família está a nove horas de voo.
                O tema muda com a vida. A honestidade fica.
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
                src="/img/andre-luxembourg.jpg"
                alt="André no Jardin du Luxembourg, em Paris"
                width={1519}
                height={2000}
                sizes="(max-width: 900px) 90vw, 400px"
              />
              <p className="ag-photo-caption">
                <span>Paris, o lado de cá</span>
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
