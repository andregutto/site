import Link from 'next/link';
import Reveal from './Reveal';

export default function Ferramentas() {
  return (
    <section className="ag-section ag-tools" id="ferramentas">
      <div className="ag-wrap">
        <Reveal>
          <p className="ag-kicker">Ferramentas</p>
          <h2 className="ag-h2">O que eu uso, você baixa.</h2>
        </Reveal>
        <div className="ag-tools-grid">
          <Reveal>
            <Link className="ag-tool" href="/planilha-custo-de-vida">
              <span className="ag-tool-tag">Planilha · Disponível</span>
              <h3>Custo de vida em Paris</h3>
              <p>
                Meus gastos reais do mês, organizados numa planilha que você
                adapta pra sua realidade: aluguel, mercado, transporte, lazer.
              </p>
              <span className="ag-tool-cta">Baixar grátis →</span>
            </Link>
          </Reveal>
          <Reveal delay={90}>
            <div className="ag-tool ag-tool--soon">
              <span className="ag-tool-tag">Simulador · Em breve</span>
              <h3>Salário líquido na França</h3>
              <p>
                Digite o bruto da proposta e veja quanto sobra de verdade
                depois de impostos e descontos.
              </p>
              <span className="ag-tool-cta">Chega com os próximos vídeos</span>
            </div>
          </Reveal>
          <Reveal delay={180}>
            <div className="ag-tool ag-tool--soon">
              <span className="ag-tool-tag">Guia · Em breve</span>
              <h3>Investimentos de quem sai do Brasil</h3>
              <p>
                O que fazer com a carteira quando a vida muda de país: o que
                eu mantive, o que eu movi e por quê.
              </p>
              <span className="ag-tool-cta">Chega com os próximos vídeos</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
