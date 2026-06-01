'use client'

import { Barlow_Condensed } from 'next/font/google'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

const SERVICES = [
  {
    num: '01',
    title: 'Google\nBusiness',
    desc: 'Profil optimisé, avis gérés, posts réguliers. Votre établissement apparaît quand un client cherche près de chez lui.',
  },
  {
    num: '02',
    title: 'Contenu\nInstagram',
    desc: 'Photos et vidéos produits sur place. Un feed cohérent qui reflète ce que vous faites vraiment — pas des stocks.',
  },
  {
    num: '03',
    title: 'Réputation\nen ligne',
    desc: 'Suivi et réponse aux avis Google et Instagram. Une image qui rassure avant même que le client franchisse la porte.',
  },
  {
    num: '04',
    title: 'Trafic\nlocal',
    desc: 'Google Ads et Meta Ads ciblés par quartier. Budget maîtrisé, résultats mesurables, clients qui viennent à vous.',
  },
]

const SEGMENTS = [
  {
    label: 'Commerce de quartier',
    types: ['Restaurants & bistrots', 'Boulangeries & pâtisseries', 'Cafés & bars', 'Épiceries fines', 'Boutiques de mode', 'Fleuristes'],
    pain: 'Le client décide sur son téléphone avant de sortir de chez lui. Sans présence digitale, il choisit le concurrent.',
    result: 'Des gens qui passent de l\'écran au comptoir.',
  },
  {
    label: 'Instituts & bien-être',
    types: ['Soins du visage', 'Massages & relaxation', 'Épilation laser', 'Soins corps & ongles', 'Coiffeurs indépendants', 'Instituts bien-être'],
    pain: 'Instagram à l\'abandon, Google Business désactivé, agenda à moitié plein. Les grandes enseignes captent vos clients.',
    result: 'Un agenda plein, des clients qui reviennent.',
  },
]

const RESULTS = [
  {
    segment: 'Commerce',
    metric: '340',
    unit: 'clics "itinéraire"',
    detail: 'en 60 jours pour une boulangerie du 11e',
  },
  {
    segment: 'Bien-être',
    metric: '80%',
    unit: 'de taux d\'occupation',
    detail: 'en 45 jours pour un institut du Marais',
  },
  {
    segment: 'Commerce',
    metric: '4,8★',
    unit: 'note Google',
    detail: 'après 3 mois de gestion des avis',
  },
  {
    segment: 'Bien-être',
    metric: '+210',
    unit: 'abonnés qualifiés',
    detail: 'en 2 mois pour une esthéticienne indépendante',
  },
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
            Audit gratuit →
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
              fontWeight: 900, fontSize: 'clamp(60px, 7.5vw, 92px)',
              letterSpacing: '-0.02em', lineHeight: 0.88,
              textTransform: 'uppercase', color: C.ink,
              margin: '0 0 32px',
            }}>
              Excellent<br />dans votre<br />métier.<br />
              <span style={{ color: C.accent }}>Visible</span><br />en ligne.
            </h1>
            <div style={{ height: '0.5px', background: C.ink, marginBottom: 32 }} />
            <p style={{ fontSize: 16, lineHeight: 1.7, color: C.ink, margin: '0 0 40px', maxWidth: 480 }}>
              Studio Quartier accompagne les commerces de quartier et les instituts indépendants parisiens. Vous maîtrisez votre métier — on s'occupe de faire en sorte que vos clients vous trouvent.
            </p>
            <a href="mailto:hello@studioquartier.fr" style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em',
              fontSize: 12, fontWeight: 700, color: C.paper, background: C.accent,
              padding: '14px 28px', textDecoration: 'none',
            }}>
              Audit gratuit de votre présence digitale →
            </a>
          </div>

          {/* Segments box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {SEGMENTS.map((seg, i) => (
              <div key={seg.label} style={{
                border: `0.5px solid ${C.ink}`,
                borderTop: i === 1 ? 'none' : `0.5px solid ${C.ink}`,
                padding: '32px 36px',
                background: i === 0 ? C.warm : C.paper,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 16 }}>
                  {seg.label}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                  {seg.types.map(t => (
                    <span key={t} style={{
                      fontSize: 11, fontWeight: 500, padding: '3px 10px',
                      border: `0.5px solid ${C.ink}`, color: C.ink, background: C.paper,
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: '0 0 10px' }}>
                  <span style={{ color: C.ink, fontWeight: 600 }}>Le problème : </span>{seg.pain}
                </p>
                <p style={{ fontSize: 12, color: C.accent, fontWeight: 700, letterSpacing: '0.02em', margin: 0 }}>
                  → {seg.result}
                </p>
              </div>
            ))}
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

      {/* ── Résultats ── */}
      <section style={{ borderBottom: `0.5px solid ${C.ink}` }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '64px 48px' }}>
          <div style={{ marginBottom: 48 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.ink, textTransform: 'uppercase' }}>
              Résultats concrets
            </span>
            <div style={{ height: '0.5px', background: C.ink, marginTop: 14 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
            {RESULTS.map((r, i) => (
              <div key={i} style={{
                padding: '32px 32px',
                borderLeft: `0.5px solid ${C.ink}`,
                borderRight: i === RESULTS.length - 1 ? `0.5px solid ${C.ink}` : 'none',
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: C.paper, background: r.segment === 'Bien-être' ? C.accent : C.ink,
                  padding: '2px 8px', display: 'inline-block', marginBottom: 20,
                }}>
                  {r.segment}
                </span>
                <div className={barlow.className} style={{
                  fontWeight: 900, fontSize: 52, letterSpacing: '-0.03em', lineHeight: 1,
                  color: C.ink, marginBottom: 4,
                }}>
                  {r.metric}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
                  {r.unit}
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                  {r.detail}
                </div>
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
            { num: '01', title: 'On connaît\nvos quartiers', body: 'Nous travaillons exclusivement avec des établissements parisiens. Chaque arrondissement a ses habitudes, ses clients, ses horaires. On s\'y adapte.' },
            { num: '02', title: 'Vous gardez\nle contrôle', body: 'Vous validez tout avant publication. Pas de surprise, pas de contenu hors sujet. Votre image reste la vôtre — qu\'il s\'agisse d\'un croissant ou d\'un soin visage.' },
            { num: '03', title: 'Des résultats\nmesurables', body: 'Rapport mensuel clair : avis Google, portée des publications, clics, taux d\'occupation. Vous savez exactement ce que ça vous apporte.' },
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
              Parlons de<br />votre établissement.
            </h2>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              hello@studioquartier.fr · Audit gratuit, sans engagement
            </p>
          </div>
          <a href="mailto:hello@studioquartier.fr" style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em',
            fontSize: 12, fontWeight: 700, color: C.paper, background: C.accent,
            padding: '16px 32px', textDecoration: 'none',
          }}>
            Audit gratuit de votre présence →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em' }}>
          © 2026 Studio Quartier · Paris
        </span>
        <a href="/tools" style={{ fontSize: 11, color: C.muted, textDecoration: 'none', letterSpacing: '0.04em' }}>
          Accès équipe →
        </a>
      </footer>

    </div>
  )
}
