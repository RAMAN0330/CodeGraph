# Historical Design QA: Cosmos GPU Graph (superseded)

> This section is retained as the historical record for the former Cosmos GPU implementation. It does not describe the current grouped Explore graph, which is Sigma-based and documented in **Grouped Explore production verification** below.

- Source visual truth: user-provided dense repository graph screenshot in this conversation.
- Implementation screenshot: unavailable because browser discovery returned no available browser in this session.
- Intended viewport: desktop, approximately 2048 × 1325 CSS pixels.
- State: authenticated workspace, Explorer Graph view, file inspector open.
- Full-view and focused comparison evidence: blocked without a browser-rendered capture.
- Primary non-visual checks: indexed data test, complete repository tests, TypeScript/Vite production build, clean Docker build, HTTP serving, and production asset presence.
- Browser interactions pending: GPU canvas initialization, hover label, selection, inspector opening, stage clearing, zoom, fit, filtering, and Call Flow.
- Console errors checked: unavailable without a browser session.

## Implementation evidence

- Reagraph and its Three.js dependency chain were removed.
- Cosmos uses GPU simulation, collision, clustering, and rendering.
- Permanent labels were removed; only the hovered/selected node receives an HTML label.
- The lazy graph chunk decreased from approximately 1.33 MB to approximately 431 KB uncompressed.

## Required fidelity surfaces

- Typography: active labels retain the workspace monospace style; rendered fidelity is unverified.
- Spacing: GPU collision padding and repulsion are configured; rendered separation is unverified.
- Colors: existing community/folder colors are converted to GPU RGBA buffers.
- Image quality: no raster assets are used in the graph.
- Copy: node names, paths, relationship metadata, and inspector content are preserved.

## Findings

- [P1] Browser visual and interaction verification remains unavailable.
  Impact: runtime WebGL compatibility and visual spacing cannot be certified in this session.
  Fix: open the rebuilt Graph view in a browser and exercise the pending interactions above.

historical result: blocked

## Grouped Explore production verification (2026-08-12)

- Static verification passed: `node --test tests/*.test.mjs` (52/52), `npm --prefix client run build`, `npm --prefix server run build`, `go test ./...` from `server-go`, and `git diff --check` all exited 0.
- Vite emitted `GroupedSigmaGraph-Btkq2giN.js` at 163.13 kB (39.37 kB gzip) during the local production build. The normal large-chunk advisory remains, but does not fail the build.
- Rebuilt production client with `SESSION_SECRET=unused-client-rebuild docker compose -f docker-compose.production.yml up -d --no-deps --build client`; the repeat command completed successfully and `curl http://localhost:8080/` returned 200. (The first immediate post-start probe received a transient connection reset; a retry and the complete repeat command returned 200.)
- Served HTML moved from stale `index-XwDyS3AE.js` to rebuilt `index-B_VpVpMD.js`. The running nginx image contains `GroupedSigmaGraph-CT1OereS.js` (163,138 bytes), its workspace chunk references `GroupedSigmaGraph`, and no served asset contains `CosmosGraphCanvas`.
- Removed-view evidence: `rg -n "vizType:'treemap'|vizType:'matrix'|treemapRef|matrixRef|TreemapGraph|MatrixGraph" client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx` returned no matches (exit 1). The equivalent `grep -REn "vizType:.{0,1}(treemap|matrix).{0,1}|treemapRef|matrixRef|TreemapGraph|MatrixGraph" /usr/share/nginx/html/assets/*.js` inside the rebuilt production client also returned no matches (exit 1). The source selector/mount code lists only Graph, Tree, Flow, Cluster, and Bundle. Legacy generic `.treemap-*` / `.matrix-*` stylesheet names and shared tooltip class names remain, but no Treemap or Matrix selector or renderer is mounted.
- Browser interaction verification was retried through the available browser integration, which reported `No browser is available`. The ten required visual/interaction checks (zoom/pan alignment and readability, reveal-on-zoom, file inspector open, focus/stage clearing, search centering, deterministic expansion, unconnected area, and console/white-screen check) were not executed.

## Findings

- [P1] Production browser visual and interaction verification is blocked because no browser backend is available. Runtime Sigma/WebGL behavior and the required interaction checklist cannot be certified from HTTP and bundle inspection alone.
- No P0 issue was found by the completed static, build, container, HTTP, or served-asset checks.

final result: blocked pending P1 browser verification

## System Architecture view

- Source visual truth: approved GitDiagram-inspired architecture direction from the conversation; implemented only in the System Architecture section.
- Automated evidence: architecture model tests, Mermaid compilation safety test, TypeScript builds, Go gateway tests, production container builds, HTTP 200 client/gateway checks, and expected HTTP 503 fallback without an OpenAI key.
- Browser visual checks pending: ELK spacing, diagram-node selection, file inspector opening, Mermaid clipboard copy, PNG output, responsive details-panel behavior, and loading animation.
- [P1] Browser rendering remains unavailable in this session, so pixel-level layout and interactions cannot be certified.

final result: blocked
