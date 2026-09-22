---
name: Structrace
description: A code-intelligence workspace that turns a repository into an explorable dependency graph.
colors:
  bg-canvas: "#F6F8FB"
  surface-card: "#ffffff"
  surface-subtle: "#F8FAFC"
  surface-hover: "#F1F5F9"
  text-primary: "#111827"
  text-secondary: "#64748B"
  text-muted: "#94A3B8"
  border-subtle: "#E2E8F0"
  border-medium: "#CBD5E1"
  indigo-500: "#4F46E5"
  indigo-600: "#4338CA"
  color-success: "#059669"
  color-warning: "#D97706"
  color-danger: "#DC2626"
  chart-purple: "#7c3fa8"
  chart-cyan: "#147a89"
typography:
  display:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "clamp(2.85rem, 4.6vw, 4.85rem)"
    fontWeight: 660
    lineHeight: 1.01
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "clamp(1.75rem, 2.6vw, 2.55rem)"
    fontWeight: 640
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  body:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.7rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0.07em"
rounded:
  sm: "7px"
  md: "8px"
  lg: "13px"
  xl: "16px"
spacing:
  xs: "8px"
  sm: "20px"
  md: "32px"
  lg: "64px"
  xl: "88px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-500}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-600}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
  nav-bar:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    height: "74px"
  data-frame:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0"
---

# Design System: Structrace

## Overview

**Creative North Star: "The Light Diagnostic Console"**

Structrace's world is a light IDE, not a marketing surface: a near-white canvas (#F6F8FB/#ffffff) and a single indigo accent (#4F46E5) carrying every interactive and primary-brand moment, with a narrow semantic set (cyan/purple/amber/red) reserved for data meaning. JetBrains Mono carries every sentence in the product — authored prose and literal system values (a file path, a repo name, a status word, a graph node label) alike — so the whole interface reads as one voice, in keeping with a tool whose subject is code. The landing page's module rail is not a marketing invention: it reuses the same rail-plus-evidence-pane structure, the same "Data Frame" chrome, and the same semantic accent assignment (cyan = architecture, purple = insights/ownership, amber = database, red = security) that the connected workspace itself uses once a repository is analyzed.

Density is instrument-panel, not editorial: hairline 1px borders plus a small set of soft, ambient shadows do the separating; color is functional rather than decorative. Text sits close to true near-black-on-near-white contrast for legibility. The system does not use kicker/eyebrow labels over headlines, does not use hard-offset (neobrutalist) shadows, and does not use glyph/emoji icons — only Lucide line icons at consistent small sizes, with one glass-tile brand mark as the sole exception.

**Key Characteristics:**
- Light IDE ground (#F6F8FB canvas, #ffffff card surfaces); surfaces are plain, not gridded
- One indigo accent (#4F46E5) for every primary/interactive element; cyan/purple/amber/red are reserved for semantic and data-role signal only, never for CTAs
- JetBrains Mono for everything — prose, headings, and literal system values (paths, labels, statuses, node text) alike
- Flat-bordered surfaces with soft ambient shadows, never hard-offset shadows
- Motion is a staged reveal (opacity + translateY/scale), gated by `prefers-reduced-motion`, with instant equivalents built for the same layout

## Colors

The palette is a fixed light IDE ground with a narrow, semantically-coded accent set; it does not vary by page.

### Primary
- **Signal Indigo** (#4F46E5): the one interactive/primary accent — primary buttons, links, focus rings, the module-rail active icon tile, brand mark. Hover state deepens to #4338CA (indigo-600); primary-button text is white, not near-black — a deliberate reversal from an earlier dark-theme build where the accent carried near-black text.

### Tertiary (data/semantic accents — not for CTAs)
- **Trace Cyan** (#147a89): the "Architecture" module — dependency-graph edges and file-node labels.
- **Trace Purple** (#7c3fa8): the "Insights" module — ownership ring segments, ownership legend values.
- **Trace Amber / Warning** (#D97706): the "Database" module — schema table strokes/headers, and the app-wide warning semantic.
- **Trace Red / Danger** (#DC2626): the "Security" module — risk badges, risk signal bars, the close-out risk chip.
- **Success Green** (#059669): status-positive signal — the "Analyzed" status dot and label, connection-ready states.

### Neutral
- **Canvas** (#F6F8FB): the page and app-wide base ground (`body`, `--bg-canvas`).
- **Surface Card** (#ffffff): the topbar, module rail, and most bordered chrome — full white, one step lighter than canvas.
- **Surface Subtle** (#F8FAFC): recessed panel fill — the evidence pane, data-frame body, graph canvas dot-grid tint.
- **Surface Hover** (#F1F5F9): hover/active background for rail items, buttons, list rows.
- **Text Primary** (#111827) / **Text Secondary** (#64748B) / **Text Muted** (#94A3B8): heading/body/meta text steps, in that order of emphasis.
- **Border Subtle** (#E2E8F0, used at low opacity as `rgba(184,191,201,.16)` for the reusable `--line` token): the hairline divider/border used for nav, section rules, cards, and comparison-table rows everywhere.
- **Border Medium** (#CBD5E1): a firmer hairline for stat tiles and structural card borders.

### Named Rules
**The One Accent Rule.** Indigo (#4F46E5) is the only color used for primary interactive elements (buttons, links, focus rings, the active module-rail icon). Cyan/purple/amber/red never appear on a call-to-action; they only ever encode a specific module's data meaning (architecture/insights/database/security) or a status (success/warning/danger).

## Typography

**Font:** JetBrains Mono (with monospace fallback), loaded once site-wide via Google Fonts and pinned as the platform font — the sole typeface for every role: display, headline, body, and label alike. There is no separate prose typeface.

**Character:** JetBrains Mono carries a precise, code-native voice for everything the interface says, whether that's authored prose or a literal value pulled out of the system under inspection. The choice fits a product whose whole subject is source code: even the marketing copy reads like it came from the same terminal as the file paths and graph node labels.

### Hierarchy
- **Display** (660, `clamp(2.85rem, 4.6vw, 4.85rem)`, line-height 1.01, letter-spacing -0.055em): hero and close-out headlines only. Emphasis text within a display headline (`<em>`) recolors to Signal Indigo rather than italicizing.
- **Headline** (640, `clamp(1.75rem, 2.6vw, 2.55rem)`, letter-spacing -0.03em): section titles (comparison, connect, stage headings).
- **Body** (400–500, 1rem–1.08rem, line-height 1.6–1.65): lede and paragraph copy, ~495–640px max width depending on context.
- **Label** (600–650, 0.66rem–0.85rem, uppercase + tracked for section captions like "Without Structrace"): topbar status text, node labels, comparison-table head row, proof-strip caption, nav-weight UI labels.

## Layout

The landing page's explorer section runs a sticky two-column "module rail + evidence pane" layout: a `minmax(240px,280px)` rail on the left, a flexible evidence pane on the right, `20px` gap, rail pinned with `position: sticky; top: 20px`. This is the same structural pattern the connected workspace uses for its own module navigation (`WorkspaceModuleNav`), not a landing-page-only invention. Page padding is `clamp(20px,5vw,76px)` horizontal, the same "console with generous margin" density used throughout.

Below the explorer, the page runs a single scroll column of full-width sections (comparison, connect, trust, close), each separated by a hairline top border, revealed via `whileInView`/`IntersectionObserver`-driven motion (opacity + translateY). Under 940px the two-column explorer collapses to a single column and the rail un-stickies; under 640px nav links hide and several grids drop to fewer columns — the composition degrades to a single readable column, never to a stripped-down text list.

Spacing is driven by a small set of recurring steps rather than a formal scale: 8px (icon-to-frame gaps), 20–24px (internal component gaps), 32–44px (section-internal rhythm), 64–90px (page-section vertical padding and the close-out section's top/bottom padding).

## Elevation & Depth

The system is flat-bordered by default; shadows are soft and ambient, used only to lift a floating/framed surface off the canvas, never as a decorative or hard-offset device. The explorer pane, hero graph frame, and connect frame each carry one diffuse shadow; everything else — nav, rail, cards, buttons — relies on a 1px hairline border plus a background-shade step (canvas → surface-card → surface-hover) for separation.

### Shadow Vocabulary
- **Frame lift** (`box-shadow: 0 32px 80px rgba(20,24,32,0.11)`): the sticky explorer pane, hero graph frame, and connect-demo frame — the objects in the composition meant to read as floating panels.
- **App-wide ambient shadows** (`--shadow-sm: 0 1px 3px rgba(20,24,32,.08), 0 1px 2px rgba(20,24,32,.05)`; `--shadow-md: 0 4px 16px rgba(20,24,32,.10), 0 2px 6px rgba(20,24,32,.06)`; `--shadow-lg: 0 8px 32px rgba(20,24,32,.14), 0 4px 12px rgba(20,24,32,.08)`): defined at `:root` and used across workspace chrome (stat cards, panels, modals, toasts) for the same soft, low-contrast lift.

### Named Rules
**The No Hard Shadow Rule.** Shadows are always soft and diffuse (blur ≥16px, low opacity, neutral near-black tint). A hard-offset shadow does not belong to this world; depth reads as blur and background-shade stepping, not as a drawn edge.

## Shapes

Corners are consistently rounded, never sharp: 7–9px on controls (buttons, rail icon tiles, sign-in), 13px on mid containers (explorer pane, data frames, evidence-svg wraps, comparison table), 16–22px on the largest panels (auth card, auth shell). Borders are hairline (1px, low-opacity neutral — `rgba(184,191,201,.16)` for the reusable divider, `rgba(184,191,201,.25)` for a firmer frame edge) rather than heavy strokes, and the same hairline is reused for section dividers, card outlines, and comparison-row separators alike. Deliberately circular forms are reserved for status dots (the "Analyzed" preview dot) and the module-rail icon tiles' implied center, kept distinct from the system's otherwise rectangular/rounded-rectangle vocabulary.

## Components

### Buttons
- **Shape:** 8px radius, 44px min-height on the primary CTA.
- **Primitive:** buttons compose the shared shadcn/ui-style `Button` component (`client/src/components/ui/button.tsx`, a `cva` variant machine with `default`/`destructive`/`outline`/`secondary`/`ghost`/`link` variants and `xs`/`sm`/`default`/`lg`/`icon` sizes) rather than a raw `<button>`. A page then layers its own class via `className` (e.g. `.landing-primary`, `.landing-sign-in`, `.explorer-rail-button`) to apply this world's exact visual tokens on top of the primitive's base reset — both layers are real and co-active; new surfaces should follow the same `<Button variant="..." className="page-specific-class">` pattern rather than a bare `<button>` or unstyled `Button`.
- **Primary:** Signal Indigo background (#4F46E5), white text, 1px border in the same indigo, padding `0 18px`. Hover deepens background to #4338CA; active nudges `translateY(1px)`.
- **Ghost/Secondary:** transparent background, muted text color, underline-free link styling that brightens to full text-primary on hover — used for lower-emphasis actions ("See the evidence", "Sign in").

### Navigation
- Transparent background sitting directly on the canvas, 74px height, single hairline bottom border. Brand mark is a small (31px) rounded-square glyph tile in indigo-tinted glass (10% indigo background, 45%-opacity indigo border) — the one "glyph icon" treatment in the system, reserved for the brand mark only, not general iconography. Nav links are muted, 600 weight, brightening to full text-primary on hover. Nav links hide entirely under 640px rather than collapsing into a hamburger menu.

### Module Rail (signature component)
- A vertical list of rail items (icon tile + label + one-line description + plus/minus chevron), each rounded 9px, with the active item's row taking a `surface-hover` background and its icon tile recoloring to the item's semantic accent (indigo default, cyan/purple/amber/red per module). This exact pattern — sticky rail driving an adjacent evidence/content pane — is shared between the landing page's `explorer-rail` and the connected workspace's `WorkspaceModuleNav`, making it the product's one true signature navigation device, not a landing-only device. The landing page builds its rail item on the shared `Button` primitive (`variant="ghost"`); `WorkspaceModuleNav` still builds the same visual row from a raw `<button>` — the markup differs, the rendered rail item does not.

### Data Frame (signature component)
- The bordered "IDE window" panel (explorer pane, hero graph frame, connect frame) is the system's signature container: a 13px-radius card with a monospace topbar (a status dot plus a literal value like a repo path or "connect a repository") sitting above the actual content area. This chrome is reused wherever the product wants to say "this is a live view into your repository."

### Status/Alert Chip
- Inline pill (8px radius, 1px semantic-colored border at ~35% opacity, ~8% opacity fill of the same color) pairing an icon with a short label — used for the close-out risk callout, consistent with the app-wide `info-chip`/`badge` treatment (colored border + low-opacity fill + small icon).

### Cards / Evidence Panels
- **Corner Style:** 13px radius.
- **Background:** `surface-card` (#ffffff) for chrome/topbars, `surface-subtle` (#F8FAFC) for recessed content areas.
- **Shadow Strategy:** frame-lift shadow only on floating panels (see Elevation & Depth); flat elsewhere.
- **Border:** 1px hairline, `rgba(184,191,201,.16–.25)`.
- **Internal Padding:** `clamp(20px,3vw,40px)` for large panes; 16–22px for smaller cards.

## Do's and Don'ts

### Do:
- **Do** keep indigo (#4F46E5) as the only primary/interactive accent; reserve cyan/purple/amber/red for a specific module's data meaning or a status.
- **Do** set every piece of text — literal system values and authored copy alike — in JetBrains Mono; there is no separate prose typeface to reach for.
- **Do** use soft, diffuse shadows only to lift a genuinely floating panel; rely on hairline borders and background-shade steps for everything else.
- **Do** reuse the module-rail + evidence-pane pattern for any new surface that lets a user browse product capabilities, rather than inventing a new navigation shape.
- **Do** build new buttons on the shared `Button` primitive (`components/ui/button.tsx`) with a page-level class for this world's visual tokens, rather than a raw `<button>` or Tailwind-only styling.
- **Do** gate scroll- or view-triggered motion behind `prefers-reduced-motion`, with a fully static fallback.

### Don't:
- **Don't** introduce kicker/eyebrow labels above headlines on new surfaces; the core system's type hierarchy (display → headline → body) carries emphasis without them. (The auth pages currently carry an eyebrow/kicker pair — see the not-canonized note; this is a build inconsistency, not a rule for new work to inherit.)
- **Don't** use hard-offset (neobrutalist) shadows; this world's depth language is soft and ambient only.
- **Don't** use glyph/emoji icons for general UI; the system uses Lucide line icons exclusively, with the single indigo glass tile reserved for the brand mark.
- **Don't** put a second typeface (e.g. Inter, Montserrat) into a new surface; JetBrains Mono is the established, sole typeface app-wide.
- **Don't** treat a page-local text or accent override as a system-wide neutral redefinition; a surface may sharpen a token for legibility, but the app-wide tokens in `index.css` remain normative.
</content>
