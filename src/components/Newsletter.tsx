"use client";

import { useState } from "react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  }

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

      {submitted ? (
        <p style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--gold-lt)", letterSpacing: "0.08em" }}>
          ✓ Obrigado! Você vai receber tudo no seu email.
        </p>
      ) : (
        <form className="nl-form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="seu@email.com"
            className="nl-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="nl-btn">Quero receber</button>
        </form>
      )}

      <p className="nl-note">Sem spam. Só conteúdo quando tiver vídeo novo.</p>
    </section>
  );
}
