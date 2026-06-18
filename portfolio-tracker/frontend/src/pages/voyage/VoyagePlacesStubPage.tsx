const GOLD = '#C8B89A'

export default function VoyagePlacesStubPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center" style={{ minHeight: 400 }}>
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 64, color: 'rgba(200,184,154,0.18)', letterSpacing: '0.1em', marginBottom: 24 }}>◈</span>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
        Biblioteca de Lugares
      </p>
      <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD }}>
        Importação via Google Takeout — em breve
      </p>
    </div>
  )
}
