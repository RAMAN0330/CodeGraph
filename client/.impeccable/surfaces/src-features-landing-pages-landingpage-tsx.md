---
version: 1
slug: "src-features-landing-pages-landingpage-tsx"
primary_target: "src/features/landing/pages/LandingPage.tsx"
related_targets: []
---

## Scope & mode
Persuade — the Structrace marketing landing page (`client/src/features/landing/pages/LandingPage.tsx`). Redesign of structure only; the app-wide visual system in DESIGN.md (light canvas, indigo accent, JetBrains Mono, hairline frames) stays.

## Audience, job, action, proof
Software engineers/leads evaluating a repo-analysis tool, skeptical of another dev-tool pitch. Job: decide Structrace is worth connecting a real repository to. Action: "Get started" → `/login`, plus the paste-a-repository field (`savePendingRepository`). Proof: five drawn, animated SVG diagrams built from Structrace's own real data — client feature import graph (file counts + import edges), docker-compose service architecture, git commit heatmap + churn by area, the app's real Postgres tables/foreign keys — plus a security scan explicitly labeled as an example (CWE rules from the product's real rule set). No invented customers, metrics, or claims.

User feedback driving the redesign: the current page feels generic, too dense/busy, and too plain/quiet. Later in the session the user rejected the screenshot build as too minimalist, asked for the SVG diagram style (architecture, database) instead of screenshots, and asked for Manrope for all text.

## Direction contract
THESIS: The real workspace is the pitch. One large live diagram of the product's own repository owns the page and the other modules wait beside it as small shots; refuses the category default of a headline over an abstract illustration followed by a feature-card grid, and refuses today's many small hand-drawn panels.
OWN-WORLD: DESIGN.md palette, raised to a Committed strategy: a full-bleed indigo-600 band carries nav, hero and the top of the contact sheet (white type, inverse white primary button); below it the #F6F8FB canvas, white frames with hairlines and frame-lift shadow. Each module owns its accent (indigo graph, cyan architecture, purple insights, amber database, red security) across its diagram, tile icon and question row. Manrope for all text (user decision). Diagrams sit in Data Frame chrome (topbar with status dot and literal source path).
STORY: The visitor sees the actual product at near-full scale, understands it reads a repo into one graph, flips through the other modules to confirm it is real, then pastes a repository or hits Get started.
FIRST VIEWPORT: On the indigo band: left-aligned two-line display headline, lede + white Get started and a 'Paste a repository' link at right; below, the large Code graph diagram frame with a rail of the other four module tiles (live thumbnails) at right. Primary action visible without scrolling at 1280×800.
FORM: Contact sheet, candidate 7 of 7 on the ordered list, dealt lead, seed key b9f3e053. Raise from the collider event display: one module held at a time — selecting a small tile promotes its diagram into the large frame and dims the rest. Signature interaction: that promote-to-frame swap (shared-layout motion; instant under reduced motion; keyboard operable as tabs).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions
- Diagram data is a snapshot (2026-10-03) of the repo; it does not update itself.
- Security diagram is an example scan, labeled as such.
- DESIGN.md still says JetBrains Mono everywhere; code and this page use Manrope.
