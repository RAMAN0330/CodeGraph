// Regression tests for the Python/Ruby/PHP/Java tree-sitter checks in
// analysisRules.ts (detectTreeSitterSecrets, detectPythonAstPatterns) — see
// docs/analysis-engine-audit-and-modernization.md for the audit and design.
//
// These run against the SERVER fork (server/dist/analysis/parser.js), not
// the client one tests/parser-detectors.test.mjs uses. The client's
// initTreeSitter fetches each grammar's .wasm from a same-origin /wasm/ URL
// — real in a browser or a Vite dev server, but tests/parser-detectors.test.mjs
// loads the client fork via vite.ssrLoadModule, a Node SSR context with no
// HTTP server behind it, so that fetch has nothing to resolve against. The
// server fork loads the same WASM from the filesystem (require.resolve）
// instead, so it works directly under plain Node — which is what lets these
// tests run without a browser at all.
//
// That filesystem loading only exists in the COMPILED output, so this file
// builds server/ once, up front, if dist is missing or stale.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const serverDir = resolve('server');
const distEntry = resolve(serverDir, 'dist', 'analysis', 'parser.js');
const srcEntry = resolve(serverDir, 'src', 'analysis', 'parser.ts');

function isStale() {
  if (!existsSync(distEntry)) return true;
  return statSync(srcEntry).mtimeMs > statSync(distEntry).mtimeMs;
}

if (isStale()) {
  execFileSync('npm', ['run', 'build'], { cwd: serverDir, stdio: 'inherit' });
}

const { Parser } = await import(distEntry);

function file(path, content, extra = {}) {
  const name = path.split('/').pop();
  return { path, name, content, isCode: true, functions: [], lines: content.split('\n').length, ...extra };
}

test('Security (Python): an f-string secret is caught (previously missed — f-strings never matched the old quote-pair regex)', async () => {
  const f = file('auth.py', 'def setup():\n    api_token = f"sk-{prefix}-live-9f8a7b6c"\n');
  const issues = await Parser.detectSecurity([f]);
  assert.ok(issues.some(i => i.file === 'auth.py' && i.title === 'Hardcoded credential'));
});

test('Security (Ruby): a #{...}-interpolated secret is caught', async () => {
  const f = file('app.rb', 'token = "sk-#{prefix}-live-9f8a7b6c"\n');
  const issues = await Parser.detectSecurity([f]);
  assert.ok(issues.some(i => i.file === 'app.rb' && i.title === 'Hardcoded credential'));
});

test('Security (Ruby): eval() is flagged, and only once — not double-counted against the generic substring check', async () => {
  const f = file('app.rb', 'eval(user_input)\n');
  const issues = await Parser.detectSecurity([f]);
  const evalFindings = issues.filter(i => i.file === 'app.rb' && i.title === 'Dynamic Code Execution');
  assert.equal(evalFindings.length, 1);
});

test('Security (PHP): a concatenated secret is caught (previously missed — the old regex requires one literal quoted value, not "a" . "b" . "c")', async () => {
  const f = file('config.php', '<?php\n$token = "sk-" . $prefix . "-live-9f8a7b6c";\n');
  const issues = await Parser.detectSecurity([f]);
  assert.ok(issues.some(i => i.file === 'config.php' && i.title === 'Hardcoded credential'));
});

test('Security (Java): a hardcoded field secret is caught', async () => {
  const f = file('Config.java', 'class Config { String apiToken = "sk-live-9f8a7b6c"; }');
  const issues = await Parser.detectSecurity([f]);
  assert.ok(issues.some(i => i.file === 'Config.java' && i.title === 'Hardcoded credential'));
});

test('Security: a hardcoded secret is not double-reported once tree-sitter covers its language (previously the plain line-regex ran unconditionally for every non-JS/TS file)', async () => {
  const f = file('auth.py', 'password = "hardcoded-not-a-placeholder-1234"\n');
  const issues = await Parser.detectSecurity([f]);
  const credentialFindings = issues.filter(i => i.file === 'auth.py' && /credential|secret/i.test(i.title));
  assert.equal(credentialFindings.length, 1, `expected exactly one finding, got: ${JSON.stringify(credentialFindings)}`);
});

test('Patterns (Python, AST): a real multiple-inheritance class is flagged as a Mixin; a class merely named FooMixin with one base is not', async () => {
  const real = file('combo.py', 'class Combo(Foo, Bar):\n    pass\n');
  const fakeByName = file('notmixin.py', 'class DataMixin(Base):\n    pass\n');
  const patterns = await Parser.detectPatterns([real, fakeByName]);
  const mixins = patterns.find(p => p.name === 'Mixins');
  assert.ok(mixins && mixins.files.some(x => x.path === 'combo.py'));
  assert.ok(!mixins.files.some(x => x.path === 'notmixin.py'));
});

test('Patterns (Python, AST): Django middleware is verified by the __init__(self, get_response) protocol, not by class name', async () => {
  const real = file('timing.py', 'class TimingMiddleware:\n    def __init__(self, get_response):\n        self.get_response = get_response\n    def __call__(self, request):\n        return self.get_response(request)\n');
  const fakeByName = file('notreally.py', 'class AuthMiddleware:\n    def __init__(self, secret):\n        self.secret = secret\n');
  const patterns = await Parser.detectPatterns([real, fakeByName]);
  const middleware = patterns.find(p => p.name === 'Middleware');
  assert.ok(middleware && middleware.files.some(x => x.path === 'timing.py'));
  assert.ok(!middleware.files.some(x => x.path === 'notreally.py'));
});

test('Patterns (Python, AST): @dataclass and ABC inheritance are both detected', async () => {
  const f = file('models.py', '@dataclass\nclass Point:\n    x: int\n    y: int\n\nclass Shape(ABC):\n    pass\n');
  const patterns = await Parser.detectPatterns([f]);
  assert.ok(patterns.find(p => p.name === 'Dataclasses')?.files.some(x => x.path === 'models.py'));
  assert.ok(patterns.find(p => p.name === 'Abstract Base Classes')?.files.some(x => x.path === 'models.py'));
});
