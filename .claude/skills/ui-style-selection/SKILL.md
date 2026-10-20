---
name: ui-style-selection
description: Choose the visual design style for a new UI project (spatial UI, glassmorphism, neumorphism, claymorphism or maximalism) before building it. Use at the start of every new frontend, dashboard, app or website project, and whenever the user asks which design style to use or asks for a redesign.
---

# UI style selection

At the start of every new UI project, pick ONE primary style from the five below (optionally plus one accent style), state the choice and the one-line reason to the user, then build with it. Do not ask the user to choose unless the project type is genuinely unclear; recommend, and let them override.

## The five styles

| Style | What it is | Strengths | Weaknesses |
|---|---|---|---|
| **Spatial UI** | The content's real space (map, floor plan, 3D model, canvas) is the workspace; panels float over it with depth hierarchy; selecting an object moves the camera to it and anchors its details beside it. | Shows *where* things are; keeps context; great for anything physical or geographic. | Needs real spatial data; heavier to build (3D/map stack); poor fit for list/form-heavy apps. |
| **Glassmorphism** | Translucent frosted panels (backdrop blur) over a meaningful background. | Keeps the background visible under overlays; modern, light. | Text readability drops over busy backgrounds; costly blur on low-end devices. Best as an **accent**, not a base. |
| **Neumorphism** | Soft extruded/pressed shapes, same colour as background, low contrast. | Calm, tactile, minimal. | Poor contrast and accessibility (fails WCAG easily); pressed vs unpressed states are ambiguous. Only for tiny, low-stakes surfaces (a single control panel, a music player). |
| **Claymorphism** | Chunky, rounded, inflated 3D-looking shapes with soft inner shadows and pastel colours. | Friendly, playful, memorable. | Wastes space; reads as a toy in professional contexts. |
| **Maximalism** | Bold colour, dense layering, mixed type, decoration as a feature. | Strong personality and brand expression; stands out. | Competes with status and error signals; tiring for long sessions; hard to scan. |

## Decision procedure

1. **Is the work about stakes and speed?** For example operations, control rooms, monitoring, trading, medical, admin consoles, or anything with alarms, approvals or long sessions.
   - Use a calm, muted base where colour is reserved for state (ISA-101 "high-performance HMI" principle).
   - Never use neumorphism, claymorphism or maximalism here.
   - If the domain is physical or geographic (grid, fleet, logistics, buildings, field assets, maps), choose **Spatial UI + Glassmorphism accent**.
   - Otherwise choose a **clean flat base + Glassmorphism accent** only for overlays (drawers, popovers, floating panels).
2. **Is it a data-heavy productivity tool** (CRM, analytics, internal tools, SaaS dashboards)?
   - Use a **clean flat base**. Add Glassmorphism only for overlays.
   - Add Spatial UI only if there is real spatial data.
3. **Is it consumer, onboarding, education, kids or a habit/wellness app?**
   - Choose **Claymorphism** (with accessible contrast on text).
   - Use Glassmorphism for hero or overlay moments.
4. **Is it brand, marketing, portfolio, editorial, fashion, music or an event site** (expression over efficiency)?
   - Choose **Maximalism**, kept to marketing surfaces.
   - Any functional flow inside it (checkout, forms) stays clean.
5. **Is it a small device-like surface** (a single widget, smart-home or media control, settings panel)?
   - **Neumorphism** is acceptable.
   - Verify contrast ≥ 4.5:1 for text and add a non-shadow cue (colour or icon) for on/off states.
6. **Immersive or 3D product** (configurator, digital twin, AR/VR, games, visualisation)? Choose **Spatial UI**.

When two rules match, the higher-stakes rule wins (rule 1 beats everything).

## Non-negotiables in every style

- Text contrast meets WCAG AA (4.5:1 body, 3:1 large text and UI components); test glass panels over the busiest background they can appear on.
- State never relies on shadow or translucency alone; pair it with colour, icon or label.
- Colours for error, warning and success are reserved for meaning, not decoration.
- Respect `prefers-reduced-motion`; and for glass, fall back to an opaque surface when `backdrop-filter` is unsupported or performance is poor.
- Keep one spacing scale, one radius scale and at most two typefaces (maximalism may use three on marketing surfaces).

## Implementation notes (Tailwind / shadcn)

- **Glass panel (generic default; CodeGraph uses its house recipe below):** `bg-white/85 backdrop-blur-md border border-white/60 shadow-lg shadow-slate-900/5`. Use a dark variant `bg-slate-900/70` on dark maps. Keep opacity at 80% or more when text sits on it.
- **Spatial:** make the map or canvas the page background (`fixed inset-0`). Panels go in an overlay layer with `pointer-events-none` on the layer and `pointer-events-auto` on each panel. Use camera fly-to on selection and anchor detail cards to the selected object.
- **Neumorphism:** use two shadows (light top-left, dark bottom-right) on a background-coloured surface. Use an inset version for the pressed state.
- **Claymorphism:** use large radius (`rounded-3xl`), pastel fill, an outer soft shadow plus an inner highlight (`shadow-[inset_0_-6px_12px_rgba(0,0,0,.08),0_12px_24px_rgba(0,0,0,.08)]`).
- **Maximalism:** use a bold palette of 4–6 hues, oversized display type, layered imagery and texture. Keep the grid underneath so it still scans.

## This project's house theme (CodeGraph / Structrace)

CodeGraph is a Git-connected codebase and database workspace: a data-heavy productivity tool used in long sessions, with health, risk and security signals. Rule 2 applies, so it uses a **clean flat base + Glassmorphism accent for overlays only**. There is no geographic data, so no Spatial UI; the dependency graph canvas is the one "background" that glass floats over.

Marketing surfaces (the landing page) use the brighter theme in `.claude/skills/design-theme`: the same clean base + glass split, but on a lavender grid canvas with glass cards, a violet→orange gradient phrase and a dark mode. Everything below is the workspace theme.

The full visual system is `client/DESIGN.md` ("The Light Diagnostic Console"); tokens live in `client/src/index.css`. Read DESIGN.md before building any new surface. In short:

**Palette**

| Role | Token | Value |
|---|---|---|
| Canvas | `--bg-canvas` | `#F6F8FB` |
| Cards, frames, topbars | `--surface-card` | `#ffffff` |
| Recessed / hover | `--surface-subtle` / `--surface-hover` | `#F8FAFC` / `#F1F5F9` |
| Text | `--text-primary` / `--text-secondary` / `--text-muted` | `#111827` / `#64748B` / `#94A3B8` |
| Hairlines | `--border-subtle` / `--border-medium` | `#E2E8F0` / `#CBD5E1` |
| The one interactive accent | `--teal-500` / `--teal-600` (legacy names; values are indigo) | `#4F46E5` / `#4338CA` |
| Module tones (data meaning only, never CTAs) | cyan / purple / amber / red | architecture `#147a89`, insights `#7c3fa8`, database `#D97706`, security `#DC2626` |
| Status | success / warning / danger | `#059669` / `#D97706` / `#DC2626`, reserved for state |

**Overlay glass recipe** (tokens in `index.css`; never rebuild it with ad-hoc `rgba(...)` + `blur(...)`):

- Use `background: var(--glass-overlay-bg)` and `backdrop-filter: var(--glass-overlay-blur)` (plus the `-webkit-` prefix) for panels that float over the graph canvas: canvas toolbar, view selector, legend, info chips, focus bar, explorer view toggle, workspace header, right detail panel.
- `--glass-overlay-bg` is 94% white so text keeps AA contrast over the busiest graph. It falls back to opaque white when `backdrop-filter` is unsupported or under `prefers-reduced-transparency`.
- Everything else (cards, tables, forms, settings, database pages) stays flat: white surface, 1px hairline, soft ambient shadow from `--shadow-sm/md/lg`.

**Rules**

- Indigo is the only colour on buttons, links and focus rings; module tones and status colours never appear on a call to action.
- Manrope for all interface text; JetBrains Mono only for code, paths and column types inside workspace panels. No third typeface.
- Shadows are soft and diffuse; never hard-offset. Selected state is a tone-coloured ring, not a shadow alone.
- Lucide line icons only; no emoji as UI icons on new surfaces.
- Gate motion behind `prefers-reduced-motion` with a static equivalent.

## Output to the user

Start the project with one short line, for example:
"Style: clean flat base + glass overlays — it's a data-heavy workspace used for long sessions, so colour stays reserved for health and risk signals."
