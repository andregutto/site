import Image from 'next/image';
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
        <h2>Algumas histórias eu conto primeiro por email.</h2>
        <p className="ag-night-sub">
          De vez em quando escrevo uma carta de Paris: o que aprendi, o que
          gastei, o que quase deu errado. Curta, honesta e só quando existe
          algo que vale o seu tempo.
        </p>
        <KitForm
          formId="9345097"
          noHeader
          buttonText="Quero receber"
          successMessage="Chegou! Bom, quase: confirma no seu email e a primeira carta é sua."
        />
      </div>
    </section>
  );
}
