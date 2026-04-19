import KitFormModal from "./KitFormModal";

/*
 * Padrão para novos cards:
 * - Ferramenta com formulário Kit  → envolver o tool-card inteiro em <KitFormModal>
 * - Ferramenta com link externo/interno → envolver em <a href="..." style={{ display: 'contents' }}>
 * O span/a com display:contents some do layout; o clique no card todo dispara a ação.
 */

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

        <KitFormModal
          formId="9344800"
          successMessage="Enviado! Verifique seu email para acessar a planilha."
          title="Planilha de Custo de Vida em Paris"
          subtitle="Deixa seu email e eu envio a planilha direto pra você."
        >
          <div className="tool-card t-finance">
            <div className="tool-num">01</div>
            <div className="tool-title">Planilha de Custo de Vida em Paris</div>
            <p className="tool-desc">
              Todos os gastos do vídeo V1 organizados. Aluguel, alimentação, transporte, lazer. Adapte pra sua realidade.
            </p>
            <span className="tool-link finance">Pegar grátis →</span>
          </div>
        </KitFormModal>

        <a href="#newsletter" style={{ display: "contents" }}>
          <div className="tool-card t-salary">
            <div className="tool-num">02</div>
            <div className="tool-title">Simulador Salário Bruto → Líquido</div>
            <p className="tool-desc">
              Calcule quanto sobra de um salário na França após impostos e contribuições sociais. Baseado no vídeo V2.
            </p>
            <span className="tool-link salary">Calcular agora →</span>
          </div>
        </a>

      </div>
    </section>
  );
}
