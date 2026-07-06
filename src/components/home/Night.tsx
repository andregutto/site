import Image from 'next/image';
import Link from 'next/link';
import KitForm from '@/components/KitForm';

export default function Night() {
  return (
    <section className="ag-night" id="newsletter">
      <Image
        className="ag-night-bg"
        src="/img/islandia-aurora.jpg"
        alt=""
        fill
        sizes="100vw"
        aria-hidden="true"
      />
      <div className="ag-night-inner">
        <p className="ag-kicker">A newsletter</p>
        <h2>
          O YouTube é alugado. <em>Este espaço é nosso.</em>
        </h2>
        <p className="ag-night-sub">
          Uma carta de Paris na sua caixa de entrada: bastidores, números e as
          decisões que não cabem em vídeo. Direto, sem enrolação.
        </p>
        <KitForm
          formId="9345097"
          noHeader
          buttonText="Assinar grátis"
          successMessage="Pronto. Agora confira seu email para confirmar a assinatura."
        />
      </div>
      <div className="ag-night-lead">
        <Link href="/planilha-custo-de-vida">
          <span>
            Quer começar com algo concreto? A planilha com meu custo de vida
            real em Paris é grátis.
          </span>
          <span className="ag-mono">Baixar ↗</span>
        </Link>
      </div>
    </section>
  );
}
