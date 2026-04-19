import KitForm from './KitForm';

export default function Newsletter() {
  return (
    <section className="newsletter" id="newsletter">
      <div className="section-eyebrow">
        <span className="eyebrow-dot"></span>
        <span className="eyebrow-text">Newsletter</span>
      </div>
      <h2 className="section-title">
        A vida fora do Brasil,<br /><em>direto no seu email.</em>
      </h2>
      <p className="nl-sub">
        Cada novo vídeo vem com um material exclusivo. Planilha, simulador, checklist. Deixa seu email e recebe tudo.
      </p>

      <KitForm
        formId="9345097"
        successMessage="Obrigado! Você vai receber tudo no seu email."
        buttonText="Assinar →"
        noHeader
      />
    </section>
  );
}
