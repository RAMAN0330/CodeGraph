# CodeFlow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix landing page (rename + nav links), add real GitHub OAuth (server-side Passport.js), rebuild the workspace header, and wire up database visualizer navigation.

**Architecture:** Express server gains Passport + express-session for OAuth. Frontend LandingPage redirects to `/auth/github`; WorkspaceArea fetches `/auth/me` on mount and uses the returned token for all GitHub API calls. A new `WorkspaceHeader` component is added above the workspace canvas.

**Tech Stack:** Express 5, Passport.js, passport-github2, express-session, React 18, React Router v6, TypeScript, Vite

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `server/src/index.ts` | Add session, passport, auth routes |
| Modify | `server/package.json` | Add auth dependencies |
| Create | `server/.env.example` | Document required env vars |
| Modify | `client/index.html` | Fix `<title>` |
| Modify | `client/src/pages/LandingPage.tsx` | Rename, fix nav, real auth redirect |
| Create | `client/src/components/WorkspaceHeader.tsx` | Fixed header bar with logo, repo, user, sign-out |
| Modify | `client/src/pages/WorkspaceArea.tsx` | Mount auth check, remove PAT input, add header |
| Modify | `client/src/pages/DatabaseVisualizer.tsx` | Add back button |

---

## Task 1: Install Server Auth Dependencies

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install packages**

```bash
cd server
npm install passport passport-github2 express-session
npm install --save-dev @types/passport @types/passport-github2 @types/express-session
```

- [ ] **Step 2: Verify install**

```bash
cat server/package.json | grep -E "passport|express-session"
```

Expected output includes `"passport"`, `"passport-github2"`, `"express-session"` in dependencies.

- [ ] **Step 3: Create env example**

Create `server/.env.example`:
```
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SESSION_SECRET=a_long_random_string
PORT=5000
```

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json server/.env.example
git commit -m "feat: install passport + express-session for GitHub OAuth"
```

---

## Task 2: Add GitHub OAuth Routes to Server

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add imports at top of `server/src/index.ts`**

Replace the existing imports block (lines 1–7) with:

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from 'pg';
import mysql from 'mysql2/promise';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';

dotenv.config();
```

- [ ] **Step 2: Add session + passport middleware after `app.use(express.json(...))`**

Insert after line `app.use(express.json({ limit: '10mb' }));`:

```typescript
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GitHubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    callbackURL: 'http://localhost:5000/auth/github/callback',
    scope: ['user', 'repo'],
  },
  (_accessToken: string, _refreshToken: string, profile: any, done: Function) => {
    done(null, {
      login: profile.username,
      avatar_url: profile.photos?.[0]?.value ?? '',
      token: _accessToken,
    });
  }
));

passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((user: any, done) => done(null, user));
```

- [ ] **Step 3: Add auth endpoints before `app.listen`**

Insert before the `app.listen(...)` line:

```typescript
// Auth routes
app.get('/auth/github', passport.authenticate('github'));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: 'http://localhost:5173/?auth=failed' }),
  (_req: any, res: any) => {
    res.redirect('http://localhost:5173/workspace');
  }
);

app.get('/auth/me', (req: any, res: any) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.user);
});

app.get('/auth/logout', (req: any, res: any) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});
```

- [ ] **Step 4: Fix CORS to allow credentials (needed for session cookies)**

Replace `app.use(cors());` with:

```typescript
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
```

- [ ] **Step 5: Start the server and verify routes exist**

```bash
cd server
npm run dev
```

In another terminal:
```bash
curl http://localhost:5000/auth/me
```
Expected: `{"error":"Not authenticated"}` with status 401.

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add GitHub OAuth routes with Passport.js and express-session"
```

---

## Task 3: Fix Landing Page

**Files:**
- Modify: `client/index.html`
- Modify: `client/src/pages/LandingPage.tsx`

- [ ] **Step 1: Fix `<title>` in `client/index.html`**

Change line 7:
```html
<title>CodeFlow</title>
```

- [ ] **Step 2: Update LandingPage — rename brand, fix auth handler**

In `client/src/pages/LandingPage.tsx`:

Replace the `handleGitHubAuth` function:
```typescript
const handleGitHubAuth = () => {
  window.location.href = 'http://localhost:5000/auth/github';
};
```

Remove the `isAuthenticating` state and its usage — it's no longer needed (the page navigates away immediately).

Change `const [isAuthenticating, setIsAuthenticating] = useState(false);` → delete this line.

- [ ] **Step 3: Rename "RepoScope" → "CodeFlow" in LandingPage**

Find and replace all occurrences of `RepoScope` with `CodeFlow` in `client/src/pages/LandingPage.tsx`. There are two: in the navbar `<span>` and in the footer `<span>`.

- [ ] **Step 4: Add section IDs and fix nav links**

In the navbar, replace the static nav items map:
```tsx
{['Features', 'Docs', 'Pricing', 'Security'].map(item => (
  <a
    key={item}
    href={`#${item.toLowerCase()}`}
    style={{ cursor: 'pointer', color: 'var(--text-secondary)', transition: 'color 0.2s', textDecoration: 'none' }}
    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
  >
    {item}
  </a>
))}
```

Add `id="features"` to the features grid `<div>` (the one with `gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))'`):
```tsx
<div id="features" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '32px' }}>
```

Add `id="pricing"` to the stats section `<div>`:
```tsx
<div id="pricing" style={{ marginTop: '120px', padding: '60px', ... }}>
```

Add `id="security"` to the Security feature card by wrapping it — the simplest approach is adding the id to the third feature card in the map. Replace the `.map((f, i) =>` callback:
```tsx
.map((f, i) => (
  <motion.div
    key={i}
    id={i === 2 ? 'security' : i === 0 ? 'docs' : undefined}
    ...
  >
```

- [ ] **Step 5: Fix the CTA button (remove disabled/authenticating state)**

Replace the main CTA button:
```tsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  onClick={handleGitHubAuth}
  style={{
    background: 'var(--accent-primary)',
    color: 'white',
    padding: '18px 40px',
    borderRadius: '14px',
    fontSize: '1.15rem',
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 20px 40px rgba(16, 185, 129, 0.2)'
  }}
>
  <Icon name="github" size="m" /> Get Started Free
</motion.button>
```

- [ ] **Step 6: Add "Try it →" link to the DB Introspection feature card**

In the features array, update the first card (index 0, "Live DB Introspection") to add a link after the description. Inside that card's `<motion.div>`, after the `<p>` description tag, add:
```tsx
<a
  href="/db"
  style={{ display: 'inline-block', marginTop: '16px', color: '#3b82f6', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none' }}
>
  Try it →
</a>
```

- [ ] **Step 7: Verify the app compiles**

```bash
cd client
npm run build
```
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add client/index.html client/src/pages/LandingPage.tsx
git commit -m "feat: fix landing page — rename to CodeFlow, real GitHub OAuth, working nav links"
```

---

## Task 4: Create WorkspaceHeader Component

**Files:**
- Create: `client/src/components/WorkspaceHeader.tsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/WorkspaceHeader.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';

interface WorkspaceHeaderProps {
  login: string;
  avatarUrl: string;
  repoUrl: string;
}

export default function WorkspaceHeader({ login, avatarUrl, repoUrl }: WorkspaceHeaderProps) {
  const navigate = useNavigate();

  const parsed = parseRepo(repoUrl);

  async function handleSignOut() {
    await fetch('http://localhost:5000/auth/logout', { credentials: 'include' });
    navigate('/');
  }

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '56px',
      background: '#0d1117',
      borderBottom: '1px solid #30363d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      zIndex: 1000,
      boxSizing: 'border-box',
    }}>
      {/* Left: Logo */}
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}
      >
        <div style={{ width: '28px', height: '28px', background: '#238636', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </div>
        <span style={{ color: '#f0f6fc', fontWeight: 700, fontSize: '1rem' }}>CodeFlow</span>
      </button>

      {/* Center: Repo breadcrumb */}
      <div style={{ color: '#8b949e', fontSize: '0.875rem', fontFamily: 'monospace' }}>
        {parsed ? (
          <>
            <span style={{ color: '#8b949e' }}>{parsed.owner}</span>
            <span style={{ color: '#30363d', margin: '0 6px' }}>/</span>
            <span style={{ color: '#f0f6fc', fontWeight: 600 }}>{parsed.repo}</span>
          </>
        ) : (
          <span>No repository loaded</span>
        )}
      </div>

      {/* Right: User + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => navigate('/db')}
          style={{
            background: 'transparent',
            border: '1px solid #30363d',
            color: '#f0f6fc',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          DB Visualizer
        </button>

        {login && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt={login}
                style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #30363d' }}
              />
            )}
            <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>{login}</span>
          </div>
        )}

        <button
          onClick={handleSignOut}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#f0f6fc',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

function parseRepo(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  const simple = url.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simple) return { owner: simple[1], repo: simple[2] };
  return null;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd client
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/WorkspaceHeader.tsx
git commit -m "feat: add WorkspaceHeader component with logo, repo breadcrumb, DB nav, sign-out"
```

---

## Task 5: Wire Auth into WorkspaceArea

**Files:**
- Modify: `client/src/pages/WorkspaceArea.tsx`

- [ ] **Step 1: Add auth state variables near the top of the component**

Find the block of `useState` declarations at the top of `WorkspaceArea`. After the first few `useState` lines, add:

```typescript
var _auth = useState<any>(null), authUser = _auth[0], setAuthUser = _auth[1];
```

- [ ] **Step 2: Add a `useEffect` to fetch `/auth/me` on mount**

Find the existing `useEffect` blocks (around line 100–133). Add a new one near the top of that group:

```typescript
useEffect(function() {
  fetch('http://localhost:5000/auth/me', { credentials: 'include' })
    .then(function(r) {
      if (r.status === 401) {
        window.location.href = '/';
        return null;
      }
      return r.json();
    })
    .then(function(user) {
      if (user) {
        setAuthUser(user);
        setToken(user.token);
      }
    })
    .catch(function() {
      window.location.href = '/';
    });
}, []);
```

- [ ] **Step 3: Import and render WorkspaceHeader**

At the top of `WorkspaceArea.tsx`, add the import after the existing imports:

```typescript
import WorkspaceHeader from '../components/WorkspaceHeader';
```

Find the `return (` statement in `WorkspaceArea`. The outermost returned JSX element is likely a `<div>`. Wrap the entire return content to add the header and push content down:

Find the opening of the return JSX (look for a top-level `<div` with a style containing `display:'flex'` or similar). Add `WorkspaceHeader` as the very first child and add `paddingTop: '56px'` to the outer container style:

```tsx
return (
  <div style={{ /* existing styles */ }}>
    <WorkspaceHeader
      login={authUser?.login ?? ''}
      avatarUrl={authUser?.avatar_url ?? ''}
      repoUrl={repoUrl}
    />
    {/* rest of existing JSX unchanged */}
  </div>
);
```

- [ ] **Step 4: Verify build**

```bash
cd client
npm run build
```
Expected: Builds successfully.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkspaceArea.tsx
git commit -m "feat: wire GitHub OAuth into WorkspaceArea — auth guard on mount, token from session"
```

---

## Task 6: Add Database Visualizer Navigation

**Files:**
- Modify: `client/src/pages/DatabaseVisualizer.tsx`

- [ ] **Step 1: Add "← Workspace" back button to DatabaseVisualizer**

In `client/src/pages/DatabaseVisualizer.tsx`, `navigate` is already imported and used. Find the outermost return JSX — it starts with a `<div` wrapping the whole page. Add a back button as the very first element inside that wrapper:

```tsx
<button
  onClick={() => navigate('/workspace')}
  style={{
    position: 'fixed',
    top: '16px',
    left: '16px',
    zIndex: 1000,
    background: '#21262d',
    border: '1px solid #30363d',
    color: '#f0f6fc',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  }}
>
  ← Workspace
</button>
```

- [ ] **Step 2: Verify build**

```bash
cd client
npm run build
```
Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/DatabaseVisualizer.tsx
git commit -m "feat: add back-to-workspace navigation in DatabaseVisualizer"
```

---

## Task 7: End-to-End Smoke Test

- [ ] **Step 1: Create a GitHub OAuth App**

Go to https://github.com/settings/developers → "New OAuth App":
- Application name: `CodeFlow Dev`
- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:5000/auth/github/callback`

Copy the Client ID and generate a Client Secret.

- [ ] **Step 2: Create `server/.env`**

```
GITHUB_CLIENT_ID=<your_client_id>
GITHUB_CLIENT_SECRET=<your_client_secret>
SESSION_SECRET=supersecretdevkey123
PORT=5000
```

- [ ] **Step 3: Start both servers**

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

- [ ] **Step 4: Smoke test the full flow**

1. Open `http://localhost:5173`
2. Verify title shows "CodeFlow", brand shows "CodeFlow" (not "RepoScope")
3. Click "Features" nav link → page scrolls to features section
4. Click "Get Started Free" → redirects to GitHub OAuth
5. Authorize the app → lands on `/workspace`
6. Verify workspace header shows: CodeFlow logo, your GitHub username + avatar, "DB Visualizer" button
7. Click "DB Visualizer" → navigates to `/db`
8. Verify "← Workspace" button appears on `/db`
9. Click "← Workspace" → returns to `/workspace`
10. Click "Sign out" → returns to `/`
