'use client'

import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

const SERVICES = [
  {
    num: '01',
    title: 'Google\nMy Business',
    desc: 'Profil optimisé, gestion des avis, posts réguliers. Votre établissement en tête des recherches locales.',
  },
  {
    num: '02',
    title: 'Réseaux\nsociaux',
    desc: 'Contenu sur-mesure pour Instagram et Facebook. Une présence cohérente qui reflète l\'identité de votre enseigne.',
  },
  {
    num: '03',
    title: 'Site web\nvitrine',
    desc: 'Un site simple, rapide et professionnel. Menus, horaires, réservations — tout ce que cherchent vos clients.',
  },
  {
    num: '04',
    title: 'SEO\nlocal',
    desc: 'Visible quand quelqu\'un cherche "boulangerie Marais" ou "restaurant Oberkampf". Là où ça compte.',
  },
]

const CLIENTS = [
  'Restaurants & bistrots', 'Boulangeries & pâtisseries',
  'Cafés & bars', 'Boutiques de mode',
  'Coiffeurs & instituts', 'Épiceries fines',
  'Fleuristes', 'Librairies',
]

export default function LandingPage() {
  return (
    <div style={{ background: C.paper, fontFamily: sans, color: C.ink, overflowX: 'hidden' }}>

      {/* ── Header ── */}
      <header style={{ background: C.paper }}>
        <div style={{
          maxWidth: 1300, margin: '0 auto', padding: '18px 48px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <a href="/sq" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            <span className={barlow.className} style={{
              fontWeight: 900, fontSize: 20, letterSpacing: '-0.01em', lineHeight: 1,
              color: C.paper, background: C.ink, padding: '6px 9px',
            }}>
              SQ
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase' }}>
              Studio Quartier
            </span>
          </a>
          <a href="mailto:hello@studioquartier.fr" style={{
            fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em',
            fontSize: 11, fontWeight: 700, color: C.paper, background: C.accent,
            padding: '8px 18px', textDecoration: 'none',
          }}>
            Prendre contact →
          </a>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1300, margin: '0 auto', padding: '80px 48px 96px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'end' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 28 }}>
              Agence · Paris
            </span>
            <h1 className={barlow.className} style={{
              fontWeight: 900, fontSize: 'clamp(64px, 8vw, 96px)',
              letterSpacing: '-0.02em', lineHeight: 0.88,
              textTransform: 'uppercase', color: C.ink,
              margin: '0 0 32px',
            }}>
              Votre voisin<br />digital.
            </h1>
            <div style={{ height: '0.5px', background: C.ink, marginBottom: 32 }} />
            <p style={{ fontSize: 16, lineHeight: 1.7, color: C.ink, margin: '0 0 40px', maxWidth: 480 }}>
              Studio Quartier accompagne les commerces de quartier parisiens dans leur développement digital. Présence en ligne, réseaux sociaux, visibilité locale — pensés pour votre enseigne, votre rue, vos clients.
            </p>
            <a href="mailto:hello@studioquartier.fr" style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em',
              fontSize: 12, fontWeight: 700, color: C.paper, background: C.accent,
              padding: '14px 28px', textDecoration: 'none',
            }}>
              Demander un rendez-vous →
            </a>
          </div>
          <div style={{ paddingBottom: 8 }}>
            <div style={{ border: `0.5px solid ${C.ink}`, padding: '48px 40px', background: C.warm }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 24 }}>
                Nos clients
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CLIENTS.map(c => (
                  <span key={c} style={{
                    fontSize: 12, fontWeight: 500, padding: '5px 12px',
                    border: `0.5px solid ${C.ink}`, color: C.ink,
                    background: C.paper,
                  }}>
                    {c}
                  </span>
                ))}
              </div>
              <div style={{ height: '0.5px', background: C.ink, margin: '28px 0' }} />
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                Artisans, restaurateurs, commerçants — vous avez un savoir-faire unique. Nous vous aidons à le faire connaître.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section style={{ background: C.ink }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '64px 48px' }}>
          <div style={{ marginBottom: 48 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(253,250,245,0.45)', textTransform: 'uppercase' }}>
              Ce que nous faisons
            </span>
            <div style={{ height: '0.5px', background: 'rgba(253,250,245,0.2)', marginTop: 14 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
            {SERVICES.map((s, i) => (
              <div key={s.num} style={{
                padding: '36px 32px',
                borderRight: i < SERVICES.length - 1 ? '0.5px solid rgba(253,250,245,0.15)' : 'none',
              }}>
                <span style={{ fontSize: 10, color: 'rgba(253,250,245,0.3)', letterSpacing: '0.06em', display: 'block', marginBottom: 20 }}>
                  {s.num}
                </span>
                <h3 className={barlow.className} style={{
                  fontWeight: 900, fontSize: 28, textTransform: 'uppercase',
                  letterSpacing: '-0.01em', lineHeight: 0.92, color: C.paper,
                  margin: '0 0 20px', whiteSpace: 'pre-line',
                }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 13, color: 'rgba(253,250,245,0.6)', lineHeight: 1.65, margin: 0 }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Approche ── */}
      <section style={{ maxWidth: 1300, margin: '0 auto', padding: '80px 48px' }}>
        <div style={{ marginBottom: 56 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.ink, textTransform: 'uppercase' }}>
            Notre approche
          </span>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 14 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {[
            { num: '01', title: 'On connaît\nvos quartiers', body: 'Nous travaillons exclusivement avec des commerces parisiens. Chaque arrondissement a ses habitudes, ses clients, ses horaires. On s\'y adapte.' },
            { num: '02', title: 'Vous gardez\nle contrôle', body: 'Vous validez tout avant publication. Pas de surprise, pas de contenu hors sujet. Votre image reste la vôtre.' },
            { num: '03', title: 'Des résultats\nmesurables', body: 'Rapport mensuel clair : nouveaux avis Google, portée des publications, clics sur votre profil. Vous savez exactement ce que ça vous rapporte.' },
          ].map((item, i) => (
            <div key={item.num} style={{
              padding: '40px 36px',
              borderLeft: `0.5px solid ${C.ink}`,
              borderRight: i === 2 ? `0.5px solid ${C.ink}` : 'none',
              borderTop: `0.5px solid ${C.ink}`,
              borderBottom: `0.5px solid ${C.ink}`,
            }}>
              <span style={{ fontSize: 10, color: C.muted, letterSpacing: '0.06em', display: 'block', marginBottom: 20 }}>
                {item.num}
              </span>
              <h3 className={barlow.className} style={{
                fontWeight: 900, fontSize: 32, textTransform: 'uppercase',
                letterSpacing: '-0.01em', lineHeight: 0.92, color: C.ink,
                margin: '0 0 20px', whiteSpace: 'pre-line',
              }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Contact ── */}
      <section style={{ background: C.warm, borderTop: `0.5px solid ${C.ink}`, borderBottom: `0.5px solid ${C.ink}` }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '80px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 40 }}>
          <div>
            <h2 className={barlow.className} style={{
              fontWeight: 900, fontSize: 'clamp(40px, 5vw, 64px)',
              textTransform: 'uppercase', letterSpacing: '-0.02em',
              lineHeight: 0.9, color: C.ink, margin: '0 0 16px',
            }}>
              Travaillons<br />ensemble.
            </h2>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              hello@studioquartier.fr
            </p>
          </div>
          <a href="mailto:hello@studioquartier.fr" style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em',
            fontSize: 12, fontWeight: 700, color: C.paper, background: C.accent,
            padding: '16px 32px', textDecoration: 'none',
          }}>
            Prendre contact →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em' }}>
          © 2025 Studio Quartier · Paris
        </span>
        <a href="/tools" style={{ fontSize: 11, color: C.muted, textDecoration: 'none', letterSpacing: '0.04em' }}>
          Accès équipe →
        </a>
      </footer>

    </div>
  )
}
