# Arvo Capital — UI Kit

A click-through recreation of the **Arvo Capital** portfolio product, re-skinned
in the new Arvo brand identity.

## What you get

`index.html` runs three connected screens:

1. **Landing** — marketing hero with the gold symbol, tagline, three vertical
   cards, and a CTA into the app.
2. **Login** — editorial sign-in form on off-white with 3px radii, gold focus
   rings, and a small language selector.
3. **Dashboard** — the live product: sticky header with section tabs, sub-nav
   pills, the dark hero `ValueCard`, allocation by class, asset table, and
   the floating chat widget.

Click around. Everything is fake; no real auth, no real prices.

## Source of truth

These components are stylistic recreations based on
[`andregutto/site → portfolio-tracker/frontend/src`](https://github.com/andregutto/site/tree/main/portfolio-tracker/frontend/src).
Layout, component vocabulary and copy come from there. **The colours, fonts,
radii, spacing and iconography are the *new Arvo brand*** — the existing repo
still uses the older navy/orange André Gutto identity, which Arvo replaces.

## Files

```
index.html                ← orchestrator + screen router
icons.jsx                 ← bespoke 1.5px stroke icon set (16-grid)
header.jsx                ← top nav + sub-nav + mobile bottom bar
controls.jsx              ← buttons, inputs, segmented switch, pills
screen-landing.jsx        ← marketing hero + verticals + how-it-works
screen-login.jsx          ← editorial login form
screen-dashboard.jsx      ← live product: ValueCard + Allocation + AssetTable
```
