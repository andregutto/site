# /mockup — Hero Mockup Pattern

Use this skill when asked to create, update, or position hero-section mockups on the landing page (`LandingPage.tsx`).

---

## Core principle

Mockups use **natural-size JSX components clipped by overflow:hidden containers** — never `transform: scale()`. This keeps fonts and borders pixel-perfect and makes the mockup look like a real screen, not a shrunken screenshot.

---

## MacBook Desktop Mockup

### Container (hero section child, `position: absolute`)

```tsx
{/* Desktop mockup — gold aura + MacBook bezel, anchored bottom-right */}
<div className="hidden lg:block" style={{
  position: 'absolute', bottom: 0, right: '-18vw',
  width: '55%', height: '82%', zIndex: 1
}}>
  {/* Gold aura behind screen */}
  <div style={{
    position: 'absolute', inset: '-30px -40px 0 -40px',
    background: 'radial-gradient(ellipse 70% 60% at 50% 80%, rgba(200,184,154,0.22) 0%, rgba(200,184,154,0.08) 45%, transparent 75%)',
    pointerEvents: 'none', zIndex: 0
  }} />
  {/* Bezel + clipped screen */}
  <div style={{
    position: 'relative', width: '100%', height: '100%',
    overflow: 'hidden', borderRadius: '18px 18px 0 0',
    border: '14px solid #1C1C1E', borderBottom: 'none',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset, -16px 0 60px rgba(0,0,0,0.45)',
    zIndex: 1
  }}>
    <YourMockupContent ... />
  </div>
</div>
```

**Key values:**
- `right: '-18vw'` → shifts ~18vw past viewport, showing ~60% of 1280px content
- `width: '55%'` → left edge lands at `right: 37vw` from viewport right
- `height: '82%'` → MacBook midpoint from bottom = 41% of hero height
- Border: `14px solid #1C1C1E`, radius `18px 18px 0 0` (bottom open, flat)

### Screen content component

```tsx
function DashboardMockupContent({ td, tn, tc, ti }: MockupLabels) {
  const FS = "'DM Sans', system-ui, sans-serif"
  const FD = "'Tenor Sans', serif"

  return (
    <div style={{ width: 1280, height: '100%', background: '#F4F4F4', fontFamily: FS,
                  display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* App header, sub-nav, content... */}
    </div>
  )
}
```

- Fixed `width: 1280` — DO NOT use percentages or `transform`
- `height: '100%'` fills the clipping container
- Use real app CSS variables and font families (`var(--arvo-font-body)` / `"DM Sans"`)
- i18n: receive `td/tn/tc/ti` props from parent, derived from `useI18n()`'s `t` object

---

## iPhone Mockup

### Shell + container

```tsx
{/* iPhone mockup — overlapping lower-left of desktop */}
<div className="hidden lg:block" style={{
  position: 'absolute', bottom: 0,
  right: 'calc(37vw - 50px)',  /* overlaps desktop left edge by ~50px */
  zIndex: 3
}}>
  <div style={{
    width: 260, height: 520,
    borderRadius: 50,
    border: '12px solid #1C1C1E',
    background: '#1C1C1E',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 32px 80px rgba(0,0,0,0.65), 0 0 40px rgba(200,184,154,0.10)',
    position: 'relative', overflow: 'hidden'
  }}>
    {/* Dynamic Island */}
    <div style={{
      position: 'absolute', top: 12, left: '50%',
      transform: 'translateX(-50%)',
      width: 76, height: 20, borderRadius: 10,
      background: '#000', zIndex: 10
    }} />
    {/* Screen content */}
    <div style={{ width: '100%', height: '100%', borderRadius: 38, overflow: 'hidden' }}>
      <YourIphoneScreenContent />
    </div>
  </div>
</div>
```

**Key values:**
- Outer: `260×520px`, `border-radius: 50px`, `border: 12px`
- Inner content area: `236×496px` (260 - 2×12)
- Dynamic Island: `76×20px`, `border-radius: 10px`, centered at `top: 12px`
- `right: 'calc(37vw - 50px)'` positions it overlapping the desktop mockup's left edge

### Screen content component structure

```tsx
function YourIphoneScreenContent() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#F4F4F4',
                  fontFamily: FS, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Status bar ~54px — tall enough to clear Dynamic Island (top:12, h:20) */}
      <div style={{ height: 54, flexShrink: 0, background: '#fff',
                    display: 'flex', alignItems: 'center',
                    padding: '0 16px', fontSize: 11 }}>
        <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>14:30</span>
        {/* spacer for Dynamic Island */}
        <div style={{ width: 80 }} />
        <div style={{ flex: 1, display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'flex-end' }}>
          {/* battery + wifi + signal icons */}
        </div>
      </div>

      {/* Nav bar ~48px */}
      <div style={{ height: 48, flexShrink: 0, background: '#fff',
                    borderBottom: '1px solid rgba(13,13,13,0.07)',
                    display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
        <img src="/brand/logo/arvo-symbol-black.svg" width="18" height="18" alt="" />
        <span style={{ fontFamily: FD, fontSize: 13, letterSpacing: '0.28em' }}>arvo</span>
      </div>

      {/* Content — remaining space */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '14px 16px 0',
                    display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Cards here — keep padding 12-14px, font sizes 9-18px, gap 10px */}
      </div>
    </div>
  )
}
```

**Content budget** (496px inner height):
- Status bar: 54px
- Nav bar: 48px
- Padding: 14px
- Available for cards: **~380px**
- Recommended card heights: title 30px, card 90-110px, gap 10px between cards

---

## Hero section requirements

- Hero `<section>` must have `position: 'relative'`
- Left text column: `maxWidth: 540, zIndex: 2`
- Desktop mockup: `zIndex: 1`
- iPhone mockup: `zIndex: 3` (renders on top of desktop)
- Both anchored `bottom: 0`

## Colors / fonts used in mockups

| Token | Value |
|---|---|
| Azul Arara | `#1B4FD8` |
| Dourado | `#C8B89A` |
| Dark | `#0D0D0D` |
| Body font | `"DM Sans", system-ui` |
| Display font | `"Tenor Sans", serif` |
| Background | `#F4F4F4` (app shell), `#fff` (cards) |
