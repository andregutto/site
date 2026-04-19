'use client';

/*
 * Como adicionar uma nova ferramenta (V2, V3...):
 * 1. Crie o formulário no Kit em app.kit.com e copie o Form ID.
 * 2. Use KitFormModal no componente da secao correspondente:
 *
 *    <KitFormModal
 *      formId="SEU_FORM_ID"
 *      successMessage="Mensagem apos o cadastro."
 *      title="Nome da ferramenta"
 *      subtitle="Frase curta sobre o que o usuario vai receber."
 *    >
 *      <button className="btn-ghost">Texto do botao</button>
 *    </KitFormModal>
 *
 * 3. O children pode ser qualquer elemento, o clique nele abre o modal.
 */

import { useState, ReactNode } from 'react';
import Modal from './Modal';
import KitForm from './KitForm';

interface Props {
  formId: string;
  successMessage: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

export default function KitFormModal({ formId, successMessage, title, subtitle, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span style={{ display: 'contents' }} onClick={() => setOpen(true)}>
        {children}
      </span>
      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <KitForm
          formId={formId}
          successMessage={successMessage}
          title={title}
          subtitle={subtitle}
        />
      </Modal>
    </>
  );
}
