# `structrace check` — architecture rules in CI

`structrace check` enforces a repository's `structrace.rules.json` in any CI
system. It analyzes a local checkout with the same pipeline the Structrace
server uses (`server/src/analysis/analyzeFiles.ts`), so a violation reported in
CI is the same one the workspace and the GitHub PR review report.

## Rules file

Commit `structrace.rules.json` at the repository root. The workspace's
**Architecture → Rules** page has a builder that tests rules against the
current analysis before you commit them.

```json
{
  "rules": [
    { "name": "UI never touches the database", "from": "src/ui/**", "disallow": ["src/db/**"] },
    { "name": "Only services use the API client", "to": "src/api/client.ts", "allowOnlyFrom": ["src/services/**"], "severity": "warning" }
  ]
}
```

- `from` + `disallow`: files matching `from` must not depend on files matching `disallow`.
- `to` + `allowOnlyFrom`: files matching `to` may only be used by files matching `allowOnlyFrom`.
- Patterns: `**` spans folders, `*` stays within one, a plain path means that file or folder.
- `severity`: `error` (default) fails the check; `warning` is reported only.

## Usage

```
structrace check [dir] [--format text|json|github] [--rules <file>]
                       [--baseline <file>] [--write-baseline <file>]
```

| Exit code | Meaning |
|---|---|
| 0 | No new `error` violations |
| 1 | At least one new `error` violation |
| 2 | Setup problem: no rules file, unreadable rules or baseline, bad arguments |

`--format github` prints GitHub Actions annotations, so violations appear on
the PR's changed files. `--format json` is for other tooling.

### Adopting rules on an existing codebase

Record today's violations once, commit the baseline, and only new violations
fail from then on:

```
structrace check --write-baseline structrace.baseline.json
structrace check --baseline structrace.baseline.json
```

## Running it

The CLI isn't published to npm. Build it from this repository:

```
npm ci --prefix server && npm run build --prefix server
node server/dist/cli/check.js /path/to/repo
```

or use the API image, which already contains it (`docker compose build legacy-api`):

```
docker run --rm -v "$PWD:/repo:ro" sout-legacy-api node dist/cli/check.js /repo
```

Inside a git checkout the file list comes from `git ls-files`, so `.gitignore`
is respected; elsewhere (including that image, which has no git) it walks the
tree and skips `node_modules`, build output and virtualenvs. Files over 1 MB and
binary files are skipped.

### GitHub Actions

```yaml
- uses: actions/checkout@v4
- uses: actions/checkout@v4
  with: { repository: <your-org>/structrace, path: .structrace }
- run: npm ci --prefix .structrace/server && npm run build --prefix .structrace/server
- run: node .structrace/server/dist/cli/check.js . --format github --baseline structrace.baseline.json
```

### GitLab CI

```yaml
architecture-rules:
  image: node:24
  script:
    - git clone --depth 1 https://github.com/<your-org>/structrace.git /tmp/structrace
    - npm ci --prefix /tmp/structrace/server && npm run build --prefix /tmp/structrace/server
    - node /tmp/structrace/server/dist/cli/check.js .
```

## How dependencies are found

A dependency is a call from one file into a function defined in another. Calls
bind by import: the caller's own definition first, then a definition in a file
it imports (following re-exporting index files). JavaScript/TypeScript and
Python require that import, and an HTML page binds only to scripts it loads
with `<script src>`; Go, Java, Kotlin, Scala and C# also bind within the same
package directory; other languages bind a name defined exactly once. Calls
never cross languages, and Markdown links are not dependencies. A call that
stays ambiguous creates no dependency — a missing edge is preferred to a wrong
one that would fail CI.
