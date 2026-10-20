---
name: design-theme
description: CodeGraph's marketing theme and glass recipe (deep indigo actions, violet accent, one violet-to-orange phrase, lavender grid canvas, frosted glass cards, light and dark). Use for any change to the landing page or other marketing surfaces so they match it.
---

# CodeGraph marketing theme

A bright, friendly product look: deep indigo for actions, violet for accents, a violet→orange gradient
for one highlighted phrase, a soft lavender canvas with a faint grid, and frosted glass cards on top.
Pairs with `.claude/skills/ui-style-selection` (clean base + glass).

**Scope.** This theme is for marketing surfaces: today `client/src/features/landing/`. The workspace,
database and settings screens follow `client/DESIGN.md` and the house theme in `ui-style-selection`.

All tokens are scoped to `.landing-page` in `client/src/features/landing/pages/LandingPage.css`
(light by default, dark under `prefers-color-scheme: dark`). Dark is a soft dusk, not near-black: keep the canvas a muted indigo, cards a step lighter, accents pastel. They reuse the shadcn names, so shadcn
`Button`s inside the page pick them up. They also remap the house tokens the diagrams read
(`--text-primary`, `--surface-card`, `--teal-500` …). Never hard-code hex in components or new rules.

## Palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f7f6fc` lavender | `#2b2847` soft dusk indigo | page canvas (under the grid) |
| `--foreground` | `#16142e` ink | `#f1effa` | body text |
| `--card` | `#ffffff` | `#36325a` | glass base, solid tiles |
| `--primary` | `#312e9e` deep indigo | `#aaa6ff` | primary buttons, brand mark |
| `--brand-2` | `#7c3aed` violet | `#bba6fb` | accents, focus ring, links, gradient start |
| `--brand-3` | `#e08a4f` orange | `#f5b583` | canvas bloom only |
| `--gradient-end` | `#b4530a` | `#f5b583` | gradient text end (orange darkened so large text keeps 3:1 in light) |
| `--accent` | `#ede9fe` | `#433e6e` | hover/selected fills |
| `--muted-foreground` | `#5e5a7a` | `#c9c5e2` | secondary text |
| `--border` | `#e4e1f2` | `#47426e` | hairlines |
| `--color-success` / `--color-warning` / `--color-danger` | house values | `#4ade9a` / `#fcd34d` / `#ff7a7e` | **state only**, never decoration |

Module tones on the page (`tone-indigo/cyan/purple/amber/red`) keep their data meaning from DESIGN.md
and get lighter values in dark mode. They never colour a call to action.

## Canvas

`.landing-page` paints two blooms (`--canvas-blob-1` violet top-left, `--canvas-blob-2` peach top-right)
and a 44px grid (`--canvas-grid`), fixed, behind every section. Don't paint opaque full-width section
backgrounds over it; let cards float on it.

## Glass recipe

Two classes, both with an opaque fallback when `backdrop-filter` is missing or the user prefers
reduced transparency:

- `glass-card`: every card-like frame on the canvas (contact-sheet stage and tabs, self-host frames,
  the start box). `background: color-mix(card 72%, transparent)` · `backdrop-filter: blur(16px) saturate(160%)` ·
  border `--glass-edge` · shadow `--glass-shadow` (1px inner top highlight + soft indigo drop shadow).
- `glass`: anything floating over busy content (the sticky top bar, menus, dialogs). 90% opacity so muted
  copy keeps 4.5:1 over the busiest background.

Rules:
- Don't add your own `box-shadow`, `border` or `background` to an element with `glass-card`; the recipe
  carries them. A selected state adds a tone ring before `var(--glass-shadow)`.
- Keep surfaces that must be solid solid: diagram bodies, inputs, code blocks.
- Don't stack glass in glass more than one level; inner tiles use `var(--card)` or `var(--muted)`.

## Type and emphasis

- Manrope for all text (DESIGN.md); tight tracking on headings. No new typeface.
- One gradient phrase per screen at most: `<span className="text-gradient">…</span>` (violet → orange).
- Primary buttons: `.landing-primary` (`--primary` fill with an indigo glow). Secondary actions are an
  underlined link or an outlined glass-ish button.
- Radius: `0.75rem` cards and buttons, `1rem` top bar and the start box.

## Checks before shipping

- Screenshot at 390, 1280, 1440 and 1920, light and dark (`colorScheme` in Playwright), and confirm no
  horizontal scroll. Scroll through the page first: diagrams animate in on view.
- Text contrast ≥ 4.5:1 (3:1 large text and UI parts) on glass over its busiest backdrop.
- Status colours stay meaningful: green or red must mean good or bad.
