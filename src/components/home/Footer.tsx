export default function Footer() {
  return (
    <footer className="ag-footer">
      <div className="ag-wrap">
        <div className="ag-footer-grid">
          <div className="ag-footer-brand">
            <a href="#" className="ag-logo">
              André Gutto
            </a>
            <p>
              Documentando uma vida sendo construída fora do Brasil, um número
              e uma história de cada vez.
            </p>
          </div>
          <div>
            <h4>Navegar</h4>
            <ul>
              <li>
                <a href="#sobre">Sobre</a>
              </li>
              <li>
                <a href="#videos">Vídeos</a>
              </li>
              <li>
                <a href="#newsletter">Newsletter</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Encontrar</h4>
            <ul>
              <li>
                <a
                  href="https://youtube.com/@andregutto"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  YouTube ↗
                </a>
              </li>
              <li>
                <a href="mailto:andre@andregutto.com">andre@andregutto.com</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="ag-footer-bottom">
          <span className="ag-mono">
            © 2026 André Gutto · Feito à mão em Paris · Fotos próprias
          </span>
          <span className="ag-arvo-teaser">
            Em cultivo: um lugar só nosso. Em breve.
          </span>
        </div>
      </div>
    </footer>
  );
}
