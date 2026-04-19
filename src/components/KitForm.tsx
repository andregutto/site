'use client';

import { useState } from 'react';

interface Props {
  formId: string;
  successMessage: string;
  title?: string;
  subtitle?: string;
  noHeader?: boolean;
}

export default function KitForm({
  formId,
  successMessage,
  title = 'Receber por email',
  subtitle = 'Deixa seu email e eu envio direto pra você.',
  noHeader = false,
}: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // POST direto para o Kit, sem API key, endpoint público do formulário embed
      const res = await fetch(`https://app.kit.com/forms/${formId}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email_address: email }),
      });

      if (!res.ok) throw new Error('Erro na submissão');
      setSuccess(true);
    } catch {
      setError('Algo deu errado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kit-form-wrap">
      {!noHeader && (
        <>
          <div className="section-eyebrow kit-form-eyebrow">
            <span className="eyebrow-dot" style={{ background: 'var(--bordeaux)' }}></span>
            <span className="eyebrow-text" style={{ color: 'var(--bordeaux)' }}>
              Ferramenta gratuita
            </span>
          </div>
          <h3 className="kit-form-title">{title}</h3>
          <p className="kit-form-sub">{subtitle}</p>
        </>
      )}

      {success ? (
        <p className="kit-success">✓ {successMessage}</p>
      ) : (
        <form className="kit-form" onSubmit={handleSubmit}>
          <input
            type="email"
            className="kit-input"
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && <span className="kit-error">{error}</span>}
          <button type="submit" className="kit-btn" disabled={loading}>
            {loading ? 'Enviando…' : 'Pegar grátis →'}
          </button>
          <p className="kit-note">Sem spam. Cancele quando quiser.</p>
        </form>
      )}
    </div>
  );
}
