import type { Metadata } from 'next';
import Link from 'next/link';
import KitForm from '@/components/KitForm';

export const metadata: Metadata = {
  title: 'Planilha de Custo de Vida em Paris · André Gutto',
  description:
    'Todos os gastos reais do vídeo V1 organizados: aluguel, alimentação, transporte e lazer em Paris. Grátis.',
};

export default function PlanilhaCustoDeVida() {
  return (
    <div className="tool-page">
      <header className="tool-page-header">
        <Link href="/" className="logo">André Gutto</Link>
      </header>

      <main className="tool-page-main">
        <div className="tool-page-inner">
          <div className="tool-page-accent" />

          <div className="section-eyebrow" style={{ marginBottom: 20 }}>
            <span className="eyebrow-dot" style={{ background: 'var(--bordeaux)' }}></span>
            <span className="eyebrow-text" style={{ color: 'var(--bordeaux)' }}>
              Ferramenta gratuita · V1
            </span>
          </div>

          <h1 className="tool-page-title">
            Planilha de Custo<br />de Vida <em>em Paris</em>
          </h1>

          <p className="tool-page-desc">
            Todos os gastos do vídeo V1 organizados numa planilha que você pode adaptar
            pra sua realidade. Aluguel, alimentação, transporte e lazer, com os valores reais
            que eu pago morando aqui.
          </p>

          <div className="tool-page-divider" />

          {/*
           * Para criar a página de uma nova ferramenta (V2, V3...):
           * 1. Duplique esta pasta com o slug da nova ferramenta
           * 2. Troque formId pelo ID do formulário Kit correspondente
           * 3. Atualize título, descrição e successMessage
           */}
          <KitForm
            formId="9344800"
            successMessage="Enviado! Verifique seu email para acessar a planilha."
            noHeader
          />

          <Link href="/" className="tool-page-back">← Voltar ao site</Link>
        </div>
      </main>
    </div>
  );
}
