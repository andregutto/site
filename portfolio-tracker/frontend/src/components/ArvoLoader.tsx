export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <ArvoLoader size={52} style={{ color: 'var(--arvo-gold)' }} />
    </div>
  )
}

export default function ArvoLoader({ size = 48, className = '', style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  const h = Math.round(size * 180 / 174)
  return (
    <svg
      width={size} height={h}
      viewBox="0 0 174 180" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Carregando"
    >
      <style>{`
        @keyframes arvoPulse {
          0%, 100% { opacity: 0.25; }
          50%       { opacity: 1;    }
        }
        .al { animation: arvoPulse 2s ease-in-out infinite; }
        .al1 { animation-delay: 0.0s; }
        .al2 { animation-delay: 0.2s; }
        .al3 { animation-delay: 0.4s; }
        .al4 { animation-delay: 0.6s; }
        .al5 { animation-delay: 0.8s; }
        .al6 { animation-delay: 1.0s; }
      `}</style>
      <path className="al al1" d="M96.9642 82.5762C83.7642 28.1762 141.798 5.2429 172.464 0.576233C173.464 15.7429 159.764 53.3762 96.9642 82.5762Z" fill="currentColor"/>
      <path className="al al2" d="M165.464 82.5762V53.5762L136.964 73.9631V111.674C144.263 106.015 151.778 100.102 155.964 96.5762C163.564 90.1762 165.464 84.5762 165.464 82.5762Z" fill="currentColor"/>
      <path className="al al3" d="M121.464 85.0507V123.576C125.207 120.732 131.014 116.287 136.964 111.674V73.9631L121.464 85.0507Z" fill="currentColor"/>
      <path className="al al4" d="M96.9642 102.576L121.464 123.576V85.0507L96.9642 102.576Z" fill="currentColor"/>
      <path className="al al5" d="M121.464 155.576V123.576L96.9642 102.576V178.576L121.464 155.576Z" fill="currentColor"/>
      <path className="al al6" d="M0.513985 24.5762V51.5762C0.513985 53.5762 -0.135759 66.6762 7.46424 73.0762L44.514 101.576V155.076L69.014 178.076V82.0762L37.9642 56.0762L0.513985 24.5762Z" fill="currentColor"/>
    </svg>
  )
}
