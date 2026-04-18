export default function Ferramentas() {
  return (
    <section className="ferramentas" id="ferramentas">
      <div className="ferramentas-header">
        <div className="section-eyebrow">
          <span className="eyebrow-dot" style={{ background: "var(--bordeaux)" }}></span>
          <span className="eyebrow-text" style={{ color: "var(--bordeaux)" }}>
            Ferramentas grátis
          </span>
        </div>
        <h2 className="section-title">
          Materiais dos vídeos,<br /><em>pra você usar.</em>
        </h2>
        <p className="body-text" style={{ textAlign: "center", marginBottom: 0 }}>
          Deixa seu email e acessa os materiais criados junto com cada vídeo.
        </p>
      </div>

      <div className="tools-grid">
        <div className="tool-card t-finance">
          <div className="tool-num">01</div>
          <div className="tool-title">Planilha de Custo de Vida em Paris</div>
          <p className="tool-desc">
            Todos os gastos do vídeo V1 organizados. Aluguel, alimentação, transporte, lazer. Adapte pra sua realidade.
          </p>
          <a href="#newsletter" className="tool-link finance">Pegar grátis →</a>
        </div>

        <div className="tool-card t-salary">
          <div className="tool-num">02</div>
          <div className="tool-title">Simulador Salário Bruto → Líquido</div>
          <p className="tool-desc">
            Calcule quanto sobra de um salário na França após impostos e contribuições sociais. Baseado no vídeo V2.
          </p>
          <a href="#newsletter" className="tool-link salary">Calcular agora →</a>
        </div>
      </div>
    </section>
  );
}
