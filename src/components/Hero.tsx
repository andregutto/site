import Image from "next/image";
import KitFormModal from "./KitFormModal";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-left">
        <div className="hero-eyebrow">
          <span className="eyebrow-dot"></span>
          <span className="eyebrow-text">Paris, França</span>
        </div>

        <h1 className="hero-headline">
          Uma vida sendo<br />
          construída<br />
          <em>fora do Brasil.</em>
        </h1>

        <p className="hero-sub">
          Finanças reais e os bastidores de quem escolheu construir uma vida diferente.
        </p>

        <div className="hero-actions">
          <a href="#videos" className="btn-primary">Ver vídeos →</a>
          <KitFormModal
            formId="9344800"
            successMessage="Enviado! Verifique seu email para acessar a planilha."
            title="Planilha de Custo de Vida em Paris"
            subtitle="Deixa seu email e eu envio a planilha direto pra você."
          >
            <button className="btn-ghost">Pegar planilha grátis</button>
          </KitFormModal>
        </div>

        <div className="hero-stats">
          <div>
            <span className="stat-num">V2</span>
            <span className="stat-label">Último vídeo</span>
          </div>
          <div>
            <span className="stat-num">€55K</span>
            <span className="stat-label">Salário analisado</span>
          </div>
          <div>
            <span className="stat-num">2</span>
            <span className="stat-label">Ferramentas grátis</span>
          </div>
        </div>
      </div>

      <div className="hero-right">
        <Image
          className="hero-photo"
          src="/hero-2.jpg"
          alt="André Gutto em Paris"
          fill
          priority
          sizes="45vw"
          style={{ objectFit: "cover", objectPosition: "center 62%" }}
        />
        <div className="location-badge">
          <span className="badge-city">Paris</span>
          <span className="badge-country">França · Europe</span>
        </div>
      </div>
    </section>
  );
}
