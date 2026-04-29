---
title: CodeFlow — Landing Page, Workspace Header, GitHub OAuth, DB Visualizer Nav
date: 2026-04-29
status: approved
---

## Overview

Four interconnected fixes to bring the CodeFlow app to a working, authenticated state:
1. Landing page visual/nav fixes
2. Workspace header rebuild
3. Real GitHub OAuth (server-side)
4. Database Visualizer navigation

---

## Section 1 — Landing Page Fixes

**Goal:** Fix broken nav links, visual polish, and wire up real auth.

- Rename all instances of "RepoScope" → "CodeFlow" (navbar, footer, `<title>` in `client/index.html`)
- Nav links (Features, Docs, Pricing, Security) become anchor scroll links pointing to `#features`, `#docs`, `#pricing`, `#security` with matching `id` attributes on the relevant page sections
- "Sign In" navbar button and "Get Started Free" CTA both trigger `window.location.href = 'http://localhost:5000/auth/github'`
- Remove the fake `setTimeout` auth simulation

---

## Section 2 — Workspace Header

**Goal:** Add a visible, functional header to WorkspaceArea.

- Fixed 56px header bar at top of `/workspace`
- **Left**: CodeFlow logo + name, clickable → `/`
- **Center**: Current repo displayed as `owner / repo` breadcrumb (populated from auth/repo state)
- **Right**: GitHub avatar + username (from `/auth/me`), "DB Visualizer" button → `/db`, "Sign Out" button → calls `/auth/logout` then redirects to `/`
- **Colors**: `#0d1117` background, `#30363d` border, `#f0f6fc` primary text, `#8b949e` secondary text, `#238636` accent button color

---

## Section 3 — GitHub OAuth (Server-Side)

**Goal:** Replace fake auth with real GitHub OAuth using Passport.js.

### Server (`server/`)
- Install: `express-session`, `passport`, `passport-github2`
- Add session middleware with a secret from env var `SESSION_SECRET`
- Three auth endpoints:
  - `GET /auth/github` — redirects to GitHub OAuth
  - `GET /auth/github/callback` — exchanges code for token, stores `{ login, avatar_url, token }` in session, redirects to `http://localhost:5173/workspace`
  - `GET /auth/logout` — destroys session, sends `{ ok: true }`
- One user endpoint:
  - `GET /auth/me` — returns session user or `401`

### Frontend
- `WorkspaceArea` calls `GET /auth/me` on mount; if `401` → redirect to `/`
- Token from `/auth/me` passed to all `GitHub` API calls (replaces manual PAT input field)
- Auth state stored in React context or simple module-level variable for the session lifetime

### Environment Variables Required
```
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=...
```
GitHub OAuth App callback URL: `http://localhost:5000/auth/github/callback`

---

## Section 4 — Database Visualizer Navigation

**Goal:** Make `/db` reachable from the UI.

- Workspace header "DB Visualizer" button → `navigate('/db')` (covered in Section 2)
- `DatabaseVisualizer.tsx`: add "← Workspace" back button at top-left → `navigate('/workspace')`
- Landing page "Live DB Introspection" feature card: add a subtle "Try it →" link that navigates to `/db`

---

## Out of Scope

- Production deployment / HTTPS callback URLs
- Persistent database for sessions (in-memory session store is fine for now)
- Docs, Pricing, Security page content (anchor targets just need an `id`, content TBD)
