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
  indigo-wash: "#EEF0FF"
  color-success: "#059669"
  color-warning: "#D97706"
  color-danger: "#DC2626"
  chart-purple: "#7c3fa8"
  chart-cyan: "#147a89"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.85rem, 4.6vw, 4.85rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.85rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.7rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.07em"
  code:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "7px"
  md: "8px"
  lg: "13px"
  xl: "16px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "28px"
  lg: "64px"
  xl: "88px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-500}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-600}"
  button-primary-inverse:
    backgroundColor: "#ffffff"
    textColor: "{colors.indigo-600}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "48px"
  button-primary-inverse-hover:
    backgroundColor: "{colors.indigo-wash}"
    textColor: "{colors.indigo-600}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
  nav-bar:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    height: "72px"
  data-frame:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0"
  module-tile:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "7px"
  repo-field:
    backgroundColor: "{colors.bg-canvas}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "60px"
---

# Design System: Structrace

## Overview

**Creative North Star: "The Light Diagnostic Console"**

Structrace's world is a light IDE, not a marketing surface: a near-white canvas (#F6F8FB/#ffffff) and a single indigo accent (#4F46E5, deepening to #4338CA) carrying every interactive and primary-brand moment, with a narrow semantic set (cyan/purple/amber/red) reserved for data meaning. Manrope carries every sentence the interface says, from the display headline down to labels, captions and the literal source path in a frame's topbar; JetBrains Mono is loaded alongside it and appears only where the workspace shows code itself: code excerpts, function names, file paths in file detail rows, column types. The landing page shows the product rather than describing it: real module diagrams sit in the same "Data Frame" chrome and carry the same per-module accent assignment (indigo = code graph, cyan = architecture, purple = insights/ownership, amber = database, red = security) that the connected workspace uses.

Density is instrument-panel, not editorial: hairline 1px borders plus a small set of soft, ambient shadows do the separating; color is functional rather than decorative. Text sits close to true near-black-on-near-white contrast for legibility. The landing page may raise indigo to a committed, full-bleed band, but the band is the same indigo the system already uses for its one accent, not a new hue. The system does not use kicker/eyebrow labels over headlines, does not use hard-offset (neobrutalist) shadows, and does not use glyph/emoji icons; only Lucide line icons at consistent small sizes, with one tile-framed SVG brand mark as the sole exception.

**Key Characteristics:**
- Light IDE ground (#F6F8FB canvas, #ffffff card surfaces); surfaces are plain, not gridded
- One indigo accent (#4F46E5 / #4338CA) for every primary/interactive element; cyan/purple/amber/red are reserved for semantic and data-role signal only, never for CTAs
- Manrope for all prose, headings, labels and UI text; JetBrains Mono only for code and code-level identifiers inside the workspace
- Each product module owns one accent, carried through its diagram, icon tile and any row that refers to it
- Flat-bordered surfaces with soft ambient shadows, never hard-offset shadows
- Motion is a staged reveal (opacity + translateY/scale, path drawing for diagram edges), gated by `prefers-reduced-motion`, with instant equivalents built for the same layout

## Colors

The palette is a fixed light IDE ground with a narrow, semantically-coded accent set; it does not vary by page.

### Primary
- **Signal Indigo** (#4F46E5): the one interactive/primary accent: primary buttons, links, focus rings, the repository field's caret and focus border, brand mark, and the code-graph module's data accent. Hover deepens to Signal Indigo Deep. Primary-button text is white. In code the pair is exposed as `--teal-500` / `--teal-600` (a legacy variable name; the values are indigo).
- **Signal Indigo Deep** (#4338CA): primary hover, and the full-bleed landing band. On the band, the primary button inverts: white fill with Signal Indigo Deep text.
- **Indigo Wash** (#EEF0FF): hover fill of the inverse primary button on the band.

### Tertiary (data/semantic accents; not for CTAs)
- **Trace Cyan** (#147a89): the Architecture module: service/layer diagrams, edges and icon tile.
- **Trace Purple** (#7c3fa8): the Insights module: churn/ownership heat and bars; also the "medium" severity step in security diagrams.
- **Trace Amber / Warning** (#D97706): the Database module: table strokes, header tint, foreign-key edges; also the app-wide warning semantic and the "high" severity step.
- **Trace Red / Danger** (#DC2626): the Security module and "critical" severity; also field error borders and error text.
- **Success Green** (#059669): status-positive signal: the "Analyzed" status dot and label in a frame topbar, connection-ready states.

### Neutral
- **Canvas** (#F6F8FB): the page base ground (`--bg-canvas`), and the resting fill of the repository field.
- **Surface Card** (#ffffff): frames, module tiles, the start card, topbars.
- **Surface Subtle** (#F8FAFC): recessed panel fill in the workspace.
- **Surface Hover** (#F1F5F9): hover/active background for buttons and list rows; the empty cell in diagram heat grids.
- **Text Primary** (#111827) / **Text Secondary** (#64748B) / **Text Muted** (#94A3B8): heading/body/meta text steps, in that order of emphasis.
- **Border Subtle** (#E2E8F0): the app-wide hairline for workspace chrome and file cards.
- **Border Medium** (#CBD5E1): the firmer hairline; at 70% opacity it is the landing's divider line (table rows, frame topbar and caption rules, footer, tile outlines), at full strength the repository field's border and neutral diagram box strokes.

### Named Rules
**The One Accent Rule.** Indigo (#4F46E5 / #4338CA) is the only color used for primary interactive elements (buttons, links, focus rings, the selected-state field). Cyan/purple/amber/red never appear on a call-to-action; they only ever encode a specific module's data meaning or a status (success/warning/danger).

**The Module Tone Rule.** A module's accent travels with it. Any element about one module (its diagram, its icon tile, its tab, a table row that names it) takes that module's tone, and tinted fills are mixed from that tone toward white (about 5% for a diagram ground, 6% for a thumbnail, 12–13% for icon tiles and nodes) rather than introducing a new color.

**The Inverse-On-Band Rule.** On the indigo band, white is the action color: the primary button turns white with Signal Indigo Deep text, secondary links and nav links are white (secondary text at 84% opacity), the brand tile and Sign-in outline turn white-on-indigo, and focus outlines switch to white.

## Typography

**Body / Display Font:** Manrope (with ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif fallback), bundled with the app as a variable font (`@fontsource-variable/manrope`, weights 200–800, no external font request) and set on `body` and every heading.
**Code Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo, monospace fallback), bundled the same way (`@fontsource-variable/jetbrains-mono`) and exposed as `--font-mono`. Both faces are also registered under their plain family names in `src/fonts.css`, so components that name them directly still get the bundled files.

**Character:** Manrope gives the whole product one geometric, compact sans voice that holds up from an 800-weight display headline down to a 0.7rem uppercase caption. JetBrains Mono is not the product's voice; it is the texture of code where the workspace shows code.

### Hierarchy
- **Display** (800, `clamp(2.85rem, 4.6vw, 4.85rem)`, line-height 0.98, letter-spacing -0.04em, balanced wrap, ~12ch max): the landing hero headline only.
- **Headline** (800, `clamp(1.75rem, 3vw, 2.85rem)`, line-height 1.1, letter-spacing -0.03em, ~18ch max): section titles (questions, start).
- **Body** (400–700, 1rem–1.08rem, line-height 1.5–1.6): lede and paragraph copy (~480px max on the hero side), table cells, frame captions. Emphasized cells and titles step up in weight (650–750) rather than size.
- **Small** (600–650, 0.85rem): nav links, Sign-in, secondary links, hints, footer links, frame topbar path and status.
- **Label** (700, 0.7rem, letter-spacing 0.07em, uppercase): table column heads and the active tile's "In view" marker. Captions only; never placed above a headline.
- **Code** (JetBrains Mono, 9–12px, line-height 1.5–1.65): code excerpts, function names, file paths and column types inside workspace panels.

### Named Rules
**The One Voice Rule.** Every piece of authored or interface text, including a literal repo path in a frame topbar, is set in Manrope. JetBrains Mono appears only where the workspace renders code or a code-level identifier inside a code-oriented panel.

## Layout

The landing page is a single scroll column inside a horizontal gutter of `clamp(16px, 4.4vw, 72px)`. It opens on a full-bleed Signal Indigo Deep band that breaks out of the gutter and carries the nav (72px), the hero, and the top of a "contact sheet"; the band's fill stops `clamp(240px, 28vw, 440px)` above its bottom edge, so the contact sheet straddles the band and the canvas. The hero is a two-column grid (`1.25fr / 1fr`, bottom-aligned): display headline left, lede and actions right.

The contact sheet is a two-column grid: one large Data Frame showing the selected module's diagram (16:10 body) and a sticky rail of five module tiles at `clamp(190px, 16.5vw, 240px)`, 16px gap. Selecting a tile promotes its diagram into the large frame; tiles behave as WAI-ARIA tabs with roving focus. Below the band the page runs a questions table (three columns, `1.2fr / 1fr / 1fr`, hairline row rules, one module icon per row), a start card with a `github.com/` repository field, and a footer.

Under 1080px the hero and contact sheet collapse to one column and the rail becomes a five-column row of tiles. Under 720px nav links hide, the rail becomes a horizontally scrolling row of label-only tiles (thumbnails hidden), the large diagram keeps a 720px drawing width and pans sideways (opened centered), and the questions table stacks each row with inline "Usually:" / "In Structrace:" prefixes. The composition degrades to a single readable column, never to a stripped-down text list.

The connected workspace keeps its own sidebar-plus-canvas layout; it does not share the landing's band or contact sheet.

Spacing is driven by recurring steps rather than a formal scale: 8–9px (tile and icon gaps), 16px (sheet gap, rail spacing), 24–28px (row gaps, hero lede spacing), 36–64px (hero and card padding), 64–128px (section vertical padding).

## Elevation & Depth

The system is flat-bordered by default; shadows are soft and ambient, used only to lift a floating/framed surface off its ground, never as a decorative or hard-offset device. Separation otherwise comes from a 1px hairline plus a background-shade step (canvas, surface-card, surface-hover).

### Shadow Vocabulary
- **Frame lift** (`box-shadow: 0 32px 80px rgba(20,24,32,0.22)` on the band; `0.08` on the canvas): the large Data Frame where it overlaps the indigo band, and the start card on the canvas. Same geometry, opacity tuned to the ground.
- **Tile lift** (`box-shadow: 0 4px 16px rgba(20,24,32,.1)`, hover `0 10px 28px rgba(20,24,32,.16)` with a 2px rise): module tiles in the contact-sheet rail.
- **Inverse button lift** (`box-shadow: 0 8px 24px rgba(20,24,32,.18)`, hover `0 10px 30px rgba(20,24,32,.24)`): the white primary button on the band.
- **App-wide ambient shadows** (`--shadow-sm`, `--shadow-md`, `--shadow-lg` at `:root`): workspace chrome (stat cards, panels, modals, toasts).

### Named Rules
**The No Hard Shadow Rule.** Shadows are always soft and diffuse (blur at least 16px, low opacity, neutral near-black tint). A hard-offset shadow does not belong to this world. Selected state is a tone-colored 3px spread ring, not a drawn offset edge.

## Shapes

Corners are consistently rounded, never sharp: 7–8px on controls (buttons, Sign-in, icon tiles, the repository field, thumbnails), 13px on frames and module tiles, 16px on the start card. Borders are hairline (1px) and neutral: Border Medium at 70% on the landing, Border Subtle in the workspace; on the band, frame and Sign-in borders turn white at 40–50%. Circles are reserved for status dots (the "Analyzed" dot with a 4px soft halo) and graph nodes.

## Components

### Buttons
- **Primitive:** buttons compose the shared shadcn/ui-style `Button` component (`client/src/components/ui/button.tsx`, a `cva` variant machine) with a page class layered on via `className` (`.landing-primary`, `.landing-sign-in`, `.sheet-tab`). New surfaces follow the same `<Button variant="..." className="page-specific-class">` pattern.
- **Shape:** 8px radius, 48px height (60px when paired with the repository field).
- **Primary:** Signal Indigo fill and border, white text, 700 weight, padding `0 22px`, trailing Lucide arrow. Hover deepens to Signal Indigo Deep; active nudges `translateY(1px)`.
- **Primary Inverse (on the band):** white fill and border, Signal Indigo Deep text, inverse button lift; hover fills Indigo Wash.
- **Outline on band (Sign-in):** transparent, 1px white border at 40%, white text, 38px height; hover firms the border and adds a 10% white fill.
- **Text link (secondary):** white underlined text on the band with a 45% white underline at 6px offset, firming to full white on hover. Off the band, ghost/link actions are Text Secondary, brightening to Text Primary on hover.

### Navigation
- Transparent, 72px, hairline bottom border (white at 16% on the band). Brand mark is a 31px rounded tile (8px) holding the SVG Structrace mark: indigo-tinted (10% fill, 45% border) on light ground, white-tinted (12% fill, 40% border) on the band. Nav links are 600 weight; they hide under 720px rather than collapsing into a menu.

### Data Frame (signature component)
- The bordered "IDE window": 13px radius, white surface, a 42px topbar (status dot, literal source path in Manrope 600, status word at right: "Analyzed" in Success Green or "Example" in Text Secondary with a muted dot), a body tinted 5% toward the module's tone, and a caption bar (module icon tile, bold module name, one-line caption). Reused wherever the product says "this is a live view into a repository."

### Module Tile (signature component)
- A contact-sheet tab: white, 13px radius, 7px padding, tile lift, holding a 12:5 live thumbnail of the module's diagram (rendered still, 6% tone ground) above an icon tile and label. Active: tone-tinted border (55%) plus a 3px tone ring at 22%, no hover rise. While one tile is active the others' thumbnails dim to 55% opacity and 40% saturation, restoring on hover/focus.

### Module Icon Tile
- 24–28px rounded square (7px), Lucide icon in the module tone over a 13% tone tint. Used in the frame caption, tile labels and question rows.

### Module Diagram (signature visual language)
- Every module illustration is an inline SVG on a shared 1000×625 viewBox in Manrope, colored entirely from the current `--tone` plus neutrals: tone edges at 1.8px and 42% opacity, nodes filled with a 12% tone tint and a 2px tone stroke, the hub node solid tone with white count, inactive nodes dashed Border Medium, labels with a tone-ground halo stroke so they stay legible over edges, white boxes and tables with Border Medium or tone strokes, heat cells stepping 28/50/75/100% tone, and severity encoded as critical = danger, high = warning, medium = purple. Live diagrams stagger in (nodes pop from 0.85 scale, edges draw by path length); thumbnails and reduced-motion render the final state immediately.

### Inputs / Fields
- **Repository field:** 60px, 8px radius, Canvas fill, 1px Border Medium, a fixed `github.com/` prefix in Text Secondary 600 before the input. Focus: indigo border, white fill, 4px indigo ring at 14%. Error: Danger border, with an alert line below in Danger.

### Questions Table
- Three-column rows (question, usual tool, Structrace answer) separated by hairlines; the question cell leads with its module's icon tile and 700 weight, the "before" cell is Text Secondary, the "after" cell is Text Primary 650. Column heads use the Label style.

### Status/Alert Chip
- Inline pill (8px radius, 1px semantic-colored border at ~35% opacity, ~8% fill of the same color) pairing an icon with a short label, consistent with the app-wide `info-chip`/`badge` treatment.

## Do's and Don'ts

### Do:
- **Do** keep indigo (#4F46E5 / #4338CA) as the only primary/interactive accent; reserve cyan/purple/amber/red for a specific module's data meaning or a status.
- **Do** set all interface text in Manrope, including literal repo paths in frame topbars; use JetBrains Mono only for code excerpts and code-level identifiers in workspace panels.
- **Do** carry a module's accent through everything about that module (diagram, icon tile, tab, row) via its tone, mixing tints toward white rather than adding colors.
- **Do** invert the primary button to white with Signal Indigo Deep text when it sits on the indigo band.
- **Do** show product capabilities as real diagrams inside Data Frame chrome, built from the shared diagram language, rather than abstract illustration.
- **Do** use soft, diffuse shadows only to lift a genuinely floating panel or tile; rely on hairline borders and background-shade steps for everything else.
- **Do** build new buttons on the shared `Button` primitive (`components/ui/button.tsx`) with a page-level class for this world's visual tokens.
- **Do** gate scroll-, view- or selection-triggered motion behind `prefers-reduced-motion`, with a fully static equivalent.

### Don't:
- **Don't** introduce kicker/eyebrow labels above headlines on new surfaces; the display, headline, body hierarchy carries emphasis without them.
- **Don't** use hard-offset (neobrutalist) shadows; this world's depth language is soft and ambient only.
- **Don't** use glyph/emoji icons for general UI; the system uses Lucide line icons, with the tile-framed SVG brand mark as the only mark.
- **Don't** put a third typeface into a new surface; Manrope with JetBrains Mono for code is the established pair.
- **Don't** put a module accent on a call-to-action, or hover a primary button to any color other than Signal Indigo Deep.
- **Don't** treat a page-local text or accent override as a system-wide neutral redefinition; the app-wide tokens in `index.css` remain normative.
