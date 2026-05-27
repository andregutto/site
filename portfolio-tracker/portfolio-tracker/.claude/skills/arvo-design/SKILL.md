---
name: arvo-design
description: Use this skill to generate well-branded interfaces and assets for Arvo, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. Arvo is a Brazilian-in-Europe platform with three verticals — Capital (finance), Voyage (lifestyle), Journal (community). Premium but accessible, serious without being cold, brazilian without being folkloric.
user-invocable: true
---

# Arvo — design skill

Read [`README.md`](./README.md) first — it has the full brand brief: voice,
visual foundations, iconography, the three-vertical architecture, and
file-by-file index. Then explore:

- [`colors_and_type.css`](./colors_and_type.css) — every CSS variable + the
  self-hosted `@font-face` for Tenor Sans and Playfair Display. Always
  include this stylesheet first.
- [`fonts/`](./fonts) — TTF files for both families (variable + static).
- [`assets/logo/`](./assets/logo) — symbol in gold / black / off-white.
- [`assets/imagery/`](./assets/imagery) — Tier 1 (hero) + Tier 2 (support)
  photographs, ready to drop in with class `.arvo-photo` for the Arvo Preset.
- [`preview/`](./preview) — 25 small reference cards (type, colors, spacing,
  components, brand). Use them as visual specs when in doubt.
- [`ui_kits/arvo-capital/`](./ui_kits/arvo-capital) — full clickable
  prototype of the portfolio product (landing → login → dashboard).
  React JSX components you can copy-paste: `header.jsx`, `controls.jsx`,
  `icons.jsx`, plus three screens.
- [`ui_kits/arvo-voyage/`](./ui_kits/arvo-voyage),
  [`ui_kits/arvo-journal/`](./ui_kits/arvo-journal) — placeholders only;
  these verticals don't have product code yet.

## When working

If the request is a **visual artifact** (slide, mock, throwaway prototype, a
specific screen), copy the relevant assets out of this folder and produce a
static HTML file that imports `colors_and_type.css`. Use the JSX components
in `ui_kits/arvo-capital/` as reference shapes (don't copy verbatim — they
hard-code the demo's relative paths).

If the request is **production code**, copy the fonts, the CSS, the SVG
logos and the imagery into the target repo; reference the rules and tokens
in this folder as you write components.

If the user invokes this skill without other guidance, ask them:

1. Which surface — marketing (black + gold) or product (off-white)?
2. Which vertical — Capital (blue), Voyage (red), Journal (ocre), or
   mother brand only?
3. What screen / artifact? (landing? dashboard? a single component?)
4. Is there an existing screen to match, or a brand-fresh one?

Then act as the designer: produce one or more HTML artifacts that follow
the rules in `README.md` and reference the tokens in `colors_and_type.css`.

## Hard rules — never break

- Wordmark **arvo** is always lowercase, Tenor Sans, ≥ 0.28em tracking.
- **One vertical accent per screen.** Blue, red, ocre never share a layout.
- Accent colors only appear in **data, actions, and tags** — never as
  section backgrounds. The base palette (black, gold, off-white, beige,
  terracotta) is the only allowed surface.
- Photography always gets the Arvo Preset (`.arvo-photo`).
- No emoji. No motivational caps lock. No "fique rico em 6 meses." No
  drawn SVG illustration — use the photography or leave the space empty.
- Animation is slow (default 280ms) and almost-linear. Never bouncy.
