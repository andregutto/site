export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--f-body, sans-serif)",
        background: "#FAFAF8",
        color: "#111110",
        gap: 16,
      }}
    >
      <span
        style={{
          fontFamily: "var(--f-display, serif)",
          fontSize: 80,
          fontWeight: 700,
          color: "#E0DDD5",
          lineHeight: 1,
          letterSpacing: -4,
        }}
      >
        404
      </span>
      <p style={{ fontFamily: "var(--f-mono, monospace)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6B6B67" }}>
        Página não encontrada
      </p>
      <a
        href="/"
        style={{
          marginTop: 8,
          fontFamily: "var(--f-mono, monospace)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#FAFAF8",
          background: "#1B2F4E",
          padding: "10px 22px",
          borderRadius: 3,
          textDecoration: "none",
        }}
      >
        Voltar ao início
      </a>
    </div>
  );
}
