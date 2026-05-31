# Arvo Design System

> **arvo** — *cultive o que é seu.*
> A platform and community for Brazilians in Europe building a better life —
> finance, lifestyle, travel, personal growth. Premium but accessible. Serious
> without being cold. Brazilian without being folkloric.

---

## What is Arvo?

Arvo is a **parent brand with three verticals**, each addressing a different
slice of a Brazilian expat's life. The mother brand signs everything in black
and gold; each vertical owns one accent color that appears **only** in data,
actions and tags — never in section backgrounds.

| Vertical | Surface | Accent | Meaning | Vocabulary |
|---|---|---|---|---|
| **Arvo Capital** | Finanças & Patrimônio | **Azul Arara** `#1B4FD8` | precisão técnica, segurança patrimonial | portfolio, balance, contribution, allocation |
| **Arvo Voyage** | Estilo de Vida & Viagens | **Vermelho Guará** `#D63B2F` | paixão, audácia, movimento | destination, booking, map pins, experiences |
| **Arvo Raiz** | Comunidade & Evolução | **Ocre Tucano** `#E8A020` | criatividade, comunidade, luz | live, forum, planner, workshops |

The three accents are named for **Brazilian birds** — arara, guará, tucano —
a quiet through-line that keeps the brand grounded in its origin without
ever tipping into folclore.

### Finance sentiment — when numbers carry meaning

| Color | Hex | Meaning | Use |
|---|---|---|---|
| **Verde Maritaca** | `#1F8A5B` | mata atlântica, crescimento paciente, o verde do papagaio que vive nas árvores das cidades brasileiras | positive deltas, gains, "up" trends |
| **Vermelho Guará** | `#D63B2F` | the Voyage accent, doing double duty | negative deltas, losses, "down" trends |

On dark surfaces use **Verde Maritaca claro** `#7BC9A4` (token
`--arvo-green-on-dark`). Sentiment colors are reserved for *signed numbers
and trend indicators* — they don't appear in body copy, backgrounds, or
generic UI chrome.

The **reference analogy** is *Notion-on-the-outside, Apple-on-the-inside*:
black & austere for the marque, off-white & breathing for the products.

---

## Sources used to build this system

This system was assembled from materials provided by the founder, **André Gutto**.
You don't need access to follow the rules in this folder, but they're worth
exploring if you want to go deeper:

- **Brand briefing v1.0 (2026)** — the canonical document. Cover is captured in
  this folder as `colors_and_type.css` (tokens) + this README (rules + voice).
- **Mood-board prototype** — `uploads/arvo-moodboard-v3 (2).html` — visual
  reference for hero, logo block, palette grid, photo tiers, vertical cards,
  and voice columns. Read it for tone if anything here is ambiguous.
- **Codebase** — [`andregutto/site`](https://github.com/andregutto/site)
  (`portfolio-tracker/` subtree). This is the **live Arvo Capital** product
  (Vite + React + Tailwind + Supabase). The UI kit in `ui_kits/arvo-capital/`
  is a stylistic recreation of its main screens *re-skinned in the new Arvo
  brand* — the existing repo still uses the old André Gutto identity
  (navy `#001A70`, orange `#FE5815`, Inter), which Arvo replaces wholesale.
  Browse the repo to see how data, routing and components are actually
  composed.
- **Photography** — eight curated Unsplash photographs by Bartlomiej Balicki,
  Nhan Hoang, Andriy Babchiy, Zeynep S., Mohammadreza Charkhgard, Kyle
  Thacker and Dominik Kempf, copied into `assets/imagery/` and tagged Tier
  1 / Tier 2 per the briefing.

---

## CONTENT FUNDAMENTALS

### Voice

Arvo speaks like **a friend who already made the journey** — not a guru, not
a coach. The voice is *direct, unhurried, grown-up*. It tells a story before
it gives advice. It admits what it doesn't know.

| Arvo always | Arvo never |
|---|---|
| Speaks plainly, day-to-day language | Uses motivational caps-lock or guru tone |
| Tells a story, then offers a takeaway | Promises "fique rico em 6 meses" |
| Treats the reader as an adult | Speaks down from an altar |
| Admits uncertainty, shares what was learned | Faked urgency, scarcity triggers |
| Asks real questions (not rhetorical ones) | Comparisons that diminish "quem ficou no Brasil" |
| Explains finance jargon when it uses it | Drops jargon as a shibboleth |

### Casing

- **Wordmark `arvo` is always lowercase.** Headings and body use sentence case.
  Eyebrow labels (the tiny tracked-out tags above sections) are **UPPERCASE**
  with `0.30em` letter-spacing.
- Vertical names are Title Case: *Arvo Capital*, *Arvo Voyage*, *Arvo Journal*.
- No ALL-CAPS for emphasis in copy. If something needs to shout, italicise it
  in Playfair Display in gold.

### Pronoun & language

- **Primary language: Portuguese (Brazilian).** Secondary: English, French.
- Address the reader directly: **você** (informal but respectful).
- "Nós" is for the team / community, not corporate "we."
- Numbers respect locale: `€ 84.320` not `EUR 84,320.00`.

### Vibe

Quiet confidence. Slow growth. A garden, not a rocket. Specific imagery:
*broto* (seedling), *cultivo*, *jornada*, *patrimônio* (heritage / wealth,
both meanings active), *raízes*, *colheita*. Read aloud, Arvo copy sounds
like an older brother who took notes.

### Specific examples (from the briefing & codebase)

| | |
|---|---|
| **Tagline** | *cultive o que é seu* |
| **Section eyebrow** | `LOGO & VARIAÇÕES` · `PALETA DE CORES` · `ARQUITETURA DE VERTICAIS` |
| **Editorial pull-quote** | *"o pequeno que vai se tornar grande"* |
| **CTA** | *Começar* · *Adicionar ativo* · *Ver patrimônio* (verbs first, no exclamation marks) |
| **Empty state** | *Ainda sem ativos. Que tal plantar o primeiro?* |
| **Error** | *Algo saiu do prumo. Tentamos de novo?* |
| **Live tag** | *● Live em 20min* (small dot, no emoji) |
| **Performance pill** | *↑ +12.4% este ano* (arrow + plain text) |

### Emoji

**Almost never.** The Capital codebase uses 🏅 ★ 📦 for nav-secondary items —
this is a *legacy* of the old André Gutto identity and should be **replaced
with the SVG icon set** when re-skinning. The new Arvo brand uses geometric
glyphs (`◈ ◎ ▦ ◉ ✦ ◑ ⬡`) as quiet labels for verticals and features
(see `Section heroes` in the landing page). Never use rainbow / face emoji.

---

## VISUAL FOUNDATIONS

### Colors

See [`colors_and_type.css`](./colors_and_type.css) for the full token list.
Two rules dominate:

1. **The base palette is the spine.** Black, gold, off-white, beige,
   terracotta — these are the only allowed *surfaces*. Never tint a section
   background with blue / red / ocre.
2. **One accent per screen.** A page belongs to one vertical at a time.
   Gold is the only constant.

### Typography

- **Display + marketing body: Tenor Sans** — one weight (400), generous tracking
  (`0.10–0.30em`). Used for headings, wordmark, and the landing page throughout.
  Hierarchy is built from **size + tracking + color**, never weight.
- **Product body: DM Sans** — used in the authenticated app for body text and
  data labels where readability at small sizes matters more than editorial feel.
  Tenor Sans remains for display headings inside the product too.
- **Accent: Playfair Display Italic** — taglines, pull quotes, section
  subtitles. Always italic. Always preferred in gold.

The full type scale lives in `colors_and_type.css` under `--arvo-text-*`.

### Backgrounds & imagery

- **Marketing surfaces are black** with a **gradient overlay** (`0.3 → 0.7
  → 1.0`) sitting on top of a Tier-1 photograph. The photograph is
  desaturated *toward warm gold* with the Arvo Preset (see below).
- **Product surfaces are off-white** (`#F2EDE4`). They breathe — generous
  white-space, large negative margins, no gradients.
- **No fake-3D, no glassmorphism, no neon glows.** A single `--arvo-shadow-
  glow-gold` exists for hero moments; that's the only glow in the system.
- **Hand-drawn illustration is not part of the brand.** Use the photography
  library or leave the space empty.
- **Film grain overlay** (`.arvo-grain`) at `opacity: 0.03–0.05` is allowed
  on dark heroes for texture. Never on product surfaces.

#### The Arvo Preset (apply to every photograph)

| Setting | Value |
|---|---|
| Temperature | +15 (warm) |
| Highlights | −20 |
| Shadows | +25 |
| Vibrance | −10 |
| HSL Yellows/Oranges | +15 saturation |
| **CSS equivalent** | `filter: sepia(0.20) saturate(1.10) brightness(0.85);` |

Use class `.arvo-photo` to apply it.

### Animation & motion

- **Slow, intentional, never bouncy.** Default duration **280ms**, default
  easing `cubic-bezier(0.22, 0.61, 0.36, 1)` (an almost-linear out-curve).
- **Section reveal:** `opacity 0 → 1, translateY(22px → 0)` over **650ms**
  (`0.65s ease`) on intersection — production value in `index.css`.
- **No spring physics, no rubber-band, no infinite loops** except for a
  *very* subtle background ken-burns (`scale(1.0) → 1.05` over 20s) on hero
  photographs.
- **Hover on photograph:** filter lightens —
  `sepia(0.10) saturate(1.20) brightness(0.95)` over 600ms.

### Hover, press, focus

- **Hover (link / button on dark):** opacity drops to **0.70**, or text
  colour shifts toward gold over 160ms. No underline animation. No glow.
- **Hover (button on light):** background darkens 4% (use
  `color-mix(in oklch, currentColor 4%, transparent)`).
- **Press:** no scale-down. Instead, the colour saturates one notch
  (full opacity, no transition during the press).
- **Focus-visible:** **2px gold outline at 2px offset** —
  `outline: 2px solid var(--arvo-gold); outline-offset: 2px;`. Never blue
  browser-default.

### Borders

- **Hairline 1px** is the default — `--arvo-border` on light,
  `--arvo-border-dark` on dark.
- **Never** double-borders or heavy strokes.
- **Vertical separator lines** between sections on dark backgrounds use a
  vertical gold gradient (`transparent → gold → transparent`) — see
  `.arvo-rule-gold`.

### Shadows

Almost flat. Three levels:

| | |
|---|---|
| `--arvo-shadow-sm` | `0 1px 2px rgba(13,13,13,0.04)` — input fields |
| `--arvo-shadow-md` | `0 4px 16px rgba(13,13,13,0.06)` — raised cards |
| `--arvo-shadow-lg` | `0 24px 60px -20px rgba(13,13,13,0.18)` — modals only |
| `--arvo-shadow-glow-gold` | warm gold halo behind hero symbol — once per page max |

**Never inner-shadow.** Never coloured shadow except the gold glow above.

### Corner radii

| Use | Radius |
|---|---|
| Inputs, segmented controls | **3px** (sharp, editorial) |
| Tags, dot indicators | **999px** (pill) |
| Cards, mockup chrome | **10–14px** |
| Hero panels, modals | **16–18px** |

The system reads **mostly sharp** with a few rounded moments. Avoid
`border-radius: 24px+` — it dilutes the editorial feel.

### Transparency & blur

- **Transparency** is the workhorse: text colors are RGBA on top of
  black/off-white, never separate hex codes. See `--arvo-fg-muted`,
  `--arvo-fg-on-dark-soft`, etc.
- **Backdrop blur** is reserved for sticky headers on photography
  (`backdrop-filter: blur(12px) saturate(1.05)`) and the chat widget. Not
  for cards.
- **Protection gradients > capsules.** When text overlays a photograph,
  use a black-to-transparent gradient at the bottom of the image
  (`linear-gradient(to top, rgba(13,13,13,0.7) 0%, transparent 50%)`),
  never a solid pill behind the text.

### Cards

Two card patterns:

1. **Marketing card (on dark)** — `background: #161513;` (one notch lighter
   than `--arvo-black`), `border: 1px solid var(--arvo-border-dark);`,
   `border-radius: 14px;`, `padding: 28px`. Optional top hairline in the
   vertical's accent colour.
2. **Product card (on off-white)** — `background: #FFFFFF;`,
   `border: 1px solid var(--arvo-border);`, `border-radius: 14px;`,
   `padding: 24px`, **no shadow** unless interactive. Inner separator
   `border-top: 1px solid var(--arvo-border-soft);`.

### Layout & fixed elements

- **Max content width 1080px** on marketing, **1200px** on product.
- **Gutters:** 24/40/64px depending on viewport.
- **Header is sticky** on product surfaces (`bg: rgba(255,255,255,0.85);
  backdrop-filter: blur(12px);`). Marketing headers are absolute over hero.
- Bottom mobile nav follows iOS safe-area inset.

### Iconography colour

Stroke icons are **always single-colour**: foreground or gold on dark,
foreground or the accent on light. Never gradients, never two-tone.

---

## ICONOGRAPHY

Arvo uses **stroke icons at 1.5px weight on a 16-px grid**, matching the
existing portfolio-tracker codebase. Icons live inline in components rather
than as a sprite or font.

### What's bundled

**Lockups** (símbolo + wordmark):

- `assets/logo/arvo-symbol.svg` — the master vector (raw from briefing —
  uses placeholder `#D9D9D9` fills + white strokes; do not use directly).
- `assets/logo/arvo-symbol-gold.svg` — production gold variant (`#C8B89A`)
- `assets/logo/arvo-symbol-black.svg` — production black variant (`#0D0D0D`)
- `assets/logo/arvo-symbol-offwhite.svg` — production knock-out variant
  (`#F2EDE4`) for use on the gold card

**App icons** (símbolo only, no text — 512×512 with 22% rounded corners):

- `assets/logo/arvo-appicon-dark.svg` — gold symbol on `#0D0D0D` · the
  principal icon. Use everywhere by default.
- `assets/logo/arvo-appicon-light.svg` — black symbol on `#F2EDE4`
- `assets/logo/arvo-appicon-gold.svg` — black symbol on `#C8B89A`

**Favicon** (browser tab, 16/32/48):

- `assets/logo/arvo-favicon.svg` — single optimised SVG that scales
  cleanly down to 16px. Drop it in as `<link rel="icon"
  type="image/svg+xml" href="assets/logo/arvo-favicon.svg">`.

**Photography**:

- `assets/imagery/` — eight curated photographs, Tier 1 + Tier 2, ready to
  drop into any layout with class `.arvo-photo`

### UI icon set

The existing Capital codebase **hand-rolls inline SVGs** in each component
(see `ui_kits/arvo-capital/Icons.jsx` for the extracted set). They share a
consistent style:

- 16 × 16 viewBox
- `stroke="currentColor"`, `stroke-width="1.5"`
- `stroke-linecap="round"`, `stroke-linejoin="round"`
- `fill="none"` (with one or two exceptions for filled dots)

There is **no icon font**. There is **no Lucide / Heroicons dependency.**
The icons are bespoke. When you need an icon Arvo doesn't have, the closest
match by stroke weight + grid is **Lucide** (1.5px stroke, 24px grid → scale
to 16). Flag any Lucide additions to the team before committing.

### Geometric glyph alphabet

For *labels* (vertical badges, feature row icons, mockup headers) Arvo
borrows a small set of Unicode geometric shapes — they read like ornaments
rather than icons:

```
◈  ◎  ▦  ◉  ✦  ◑  ⬡  ◆  ◇  ●  ○  ·
```

Used at `font-family: var(--arvo-font-display)` so they sit inside the
typographic hierarchy. The verticals map to:

| Vertical | Glyph |
|---|---|
| Arvo Capital | `⬡` |
| Arvo Voyage | `◈` |
| Arvo Raiz | `◎` |

### Emoji

**No.** The Capital codebase still uses `🏅 ★ 📦` in nav-secondary — those
are legacy and should be swapped for stroke icons during the re-skin.

---

## INDEX — what lives in this folder

```
README.md                  ← you are here
SKILL.md                   ← Agent-Skills entry-point for Claude Code
colors_and_type.css        ← the foundation. import this before anything else.

assets/
  logo/
    arvo-symbol.svg              raw master (do not use directly)
    arvo-symbol-gold.svg         production gold variant
    arvo-symbol-black.svg        production black variant
    arvo-symbol-offwhite.svg     knock-out on gold
  imagery/
    01-broto-floresta.jpg        Tier 1 · Landing hero · "o pequeno que cresce"
    02-arvore-solitaria.jpg      Tier 1 · Institutional · permanence
    03-capins-dourados.jpg       Tier 1 · Background texture · warmth
    04-vista-trem.jpg            Tier 1 · Arvo Voyage · journey
    05-trigo-close.jpg           Tier 2 · Editorial banner texture
    06-floresta-por-do-sol.jpg   Tier 2 · Wide opener · scale
    07-broto-escuro.jpg          Tier 2 · Community · second-take of broto

fonts/
  README.md                ← Tenor Sans + Playfair Display loading guide

preview/
  *.html                   ← cards rendered into the Design System tab
                             (Type, Colors, Spacing, Components, Brand)

ui_kits/
  arvo-capital/            ← portfolio-tracker re-skinned in Arvo
    index.html             clickable prototype (login → dashboard)
    *.jsx                  shared components

  arvo-voyage/             ← lifestyle / travel — placeholder shell
    index.html             not in scope of the existing codebase

  arvo-raiz/               ← community / live — placeholder shell
    index.html             not in scope of the existing codebase
```

---

## How to use this system

1. **Always start with** `<link rel="stylesheet" href="colors_and_type.css">`.
2. Pick a surface: **dark for marketing / hero / video intros**, **off-white
   for tools and content**.
3. Pick a vertical → pick its one accent → use it only on data + actions + tags.
4. Headings in Tenor Sans, generous tracking. Editorial moments in Playfair
   Italic, in gold.
5. Photography always gets `.arvo-photo` (the Arvo Preset).
6. Animation is slow and almost-linear.
7. **Less is more.** Empty space is a feature, not a bug.

— *cultive o que é seu* — 2026
