export default function Sobre() {
  return (
    <section className="sobre" id="sobre">
      <div>
        <div className="section-eyebrow">
          <span className="eyebrow-dot"></span>
          <span className="eyebrow-text">Sobre</span>
        </div>
        <h2 className="section-title">
          Uma vida em construção,<br /><em>ao vivo.</em>
        </h2>
        <p className="body-text">
          Sou brasileiro, moro em Paris com meu parceiro francês e trabalho com energia renovável na Europa. Invisto nos dois países, fiz saída fiscal do Brasil e ainda estou descobrindo o que tudo isso significa na prática.
        </p>
        <p className="body-text">
          Este canal existe porque eu queria acompanhar alguém passando por isso de verdade. Como ninguém estava fazendo, resolvi ser essa pessoa.
        </p>
      </div>

      <div>
        <div className="pillar finance">
          <span className="pillar-icon">💶</span>
          <div className="pillar-title">Finanças</div>
          <p className="pillar-desc">
            Custo de vida real, câmbio, investimentos, impostos, salários. Bastidor financeiro, não aula de finanças.
          </p>
        </div>
        <div className="pillar lifestyle">
          <span className="pillar-icon">🏠</span>
          <div className="pillar-title">Lifestyle</div>
          <p className="pillar-desc">
            Rotina em Paris, viagens pela Europa, adaptação cultural, relacionamento binacional, decoração e casa.
          </p>
        </div>
      </div>
    </section>
  );
}
