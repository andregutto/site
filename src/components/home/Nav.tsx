export default function Nav() {
  return (
    <nav className="ag-nav">
      <div className="ag-wrap ag-nav-inner">
        <a href="#" className="ag-logo">
          André <span>Gutto</span>
        </a>
        <div className="ag-nav-links">
          <a href="#sobre">Sobre</a>
          <a href="#videos">Vídeos</a>
          <a href="#ferramentas">Ferramentas</a>
          <a href="#newsletter">Newsletter</a>
          <a
            className="ag-nav-cta"
            href="https://youtube.com/@andregutto"
            target="_blank"
            rel="noopener noreferrer"
          >
            YouTube ↗
          </a>
        </div>
      </div>
    </nav>
  );
}
