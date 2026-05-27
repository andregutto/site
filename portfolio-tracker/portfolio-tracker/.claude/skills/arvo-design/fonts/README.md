# Fonts

The Arvo brand uses two typefaces, both **self-hosted in this folder**:

| Family | File | Use |
|---|---|---|
| **Tenor Sans** | `TenorSans-Regular.ttf` | Display, wordmark, headings, body, labels — single weight (400) |
| **Playfair Display** | `PlayfairDisplay-VariableFont_wght.ttf` (roman)<br>`PlayfairDisplay-Italic-VariableFont_wght.ttf` (italic) | Editorial accent — taglines, pull quotes, section subtitles |

Static `.ttf` weight files (Regular / Medium / SemiBold / Bold / ExtraBold / Black,
both roman and italic) are also included for cases where a runtime cannot
handle variable fonts. They are loaded **only** if the variable file fails —
no extra `@font-face` blocks are wired up by default.

## Loading

`colors_and_type.css` declares the `@font-face` blocks. Nothing else to do —
just `<link rel="stylesheet" href="colors_and_type.css">` (or whatever the
relative path is from your HTML).

```html
<!-- recommended preload, optional -->
<link rel="preload" href="fonts/TenorSans-Regular.ttf" as="font" type="font/ttf" crossorigin>
<link rel="preload" href="fonts/PlayfairDisplay-Italic-VariableFont_wght.ttf" as="font" type="font/ttf" crossorigin>
```

## Substitutions

**None.** Both families are the brand originals, served from this folder.

## Rules of use

- Wordmark `arvo` is **always lowercase, always Tenor Sans, always 0.28–0.30em tracking.**
- Headings use Tenor Sans with generous tracking (0.10–0.18em). No bold weights exist;
  hierarchy is built through size + tracking + color, never weight.
- Playfair Display is **always italic**, **400 or 500**, **preferred color: gold**.
  Reserve it for taglines, pull quotes, and editorial moments. Never for body copy.
- Body text uses Tenor Sans at 14–16px with line-height 1.7–1.8. Never below 12px.
