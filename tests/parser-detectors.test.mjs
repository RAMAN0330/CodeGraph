// Regression tests for the AST-based rewrite of parser.ts's pattern,
// duplicate, and security detectors — see
// docs/analysis-engine-audit-and-modernization.md for the audit that found
// each case below. Before this rewrite, none of detectPatterns,
// detectDuplicates, detectSecurity, or calcComplexity had any test coverage
// at all; these pin the concrete false positives/negatives that audit found,
// as fixed behavior, so a future edit can't silently reintroduce them.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const clientRequire = createRequire(resolve('client/package.json'));
const { pathToFileURL } = await import('node:url');
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);
let vite, Parser;
before(async () => {
  vite = await createServer({ root: resolve('client'), server: { middlewareMode: true }, appType: 'custom' });
  ({ Parser } = await vite.ssrLoadModule('/src/features/analysis/services/parser.ts'));
});
after(async () => vite?.close());

function file(path, content, extra = {}) {
  const name = path.split('/').pop();
  return { path, name, content, isCode: true, functions: [], lines: content.split('\n').length, ...extra };
}

test('Singleton: a static getInstance() class is detected', async () => {
  const f = file('cache.ts', "class Cache {\n  static instance;\n  static getInstance() { return this.instance ||= new Cache(); }\n}\n");
  const patterns = await Parser.detectPatterns([f]);
  const singleton = patterns.find(p => p.name === 'Singleton');
  assert.ok(singleton, 'expected a Singleton pattern to be reported');
  assert.deepEqual(singleton.files.map(x => x.path), ['cache.ts']);
});

test('Singleton: `let instance = createSandbox()` in an unrelated helper is not flagged (previously a false positive on the word "instance")', async () => {
  const f = file('test-helper.ts', "function setup() {\n  let instance = createSandbox();\n  return instance;\n}\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.equal(patterns.find(p => p.name === 'Singleton'), undefined);
});

test('Factory: a create*() function that branches to construct different types is detected', async () => {
  const f = file('shapes.ts', "function createShape(type) {\n  if (type === 'circle') { return new Circle(); }\n  else { return new Square(); }\n}\n");
  const patterns = await Parser.detectPatterns([f]);
  const factory = patterns.find(p => p.name === 'Factory');
  assert.ok(factory, 'expected a Factory pattern to be reported');
});

test('Factory: a single `return new X()` with no branching is not flagged (previously any create*() matched)', async () => {
  const f = file('user.ts', "function createUser(name) {\n  return new User(name);\n}\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.equal(patterns.find(p => p.name === 'Factory'), undefined);
});

test('Observer: .on(...) on a traced `new EventEmitter()` instance is detected', async () => {
  const f = file('bus.ts', "const bus = new EventEmitter();\nbus.on('save', () => {});\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.ok(patterns.find(p => p.name === 'Observer/Event'), 'expected an Observer/Event pattern to be reported');
});

test('Observer: program.on(...) from an untraced object (e.g. a CLI arg parser) is not flagged (previously any .on( matched)', async () => {
  const f = file('cli.ts', "program.on('option', () => {});\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.equal(patterns.find(p => p.name === 'Observer/Event'), undefined);
});

test('Custom Hooks: a default-exported hook is detected (previously missed — the old regex required a named export)', async () => {
  const f = file('useAuth.ts', "export default function useAuth() {\n  return null;\n}\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.ok(patterns.find(p => p.name === 'Custom Hooks'), 'expected a Custom Hooks pattern to be reported');
});

test('HOC: a with[A-Z]...() that returns another function is detected', async () => {
  const f = file('withAuth.ts', "function withAuth(Component) {\n  return function Wrapped(props) {\n    return Component(props);\n  };\n}\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.ok(patterns.find(p => p.name === 'Higher-Order Component'), 'expected a Higher-Order Component pattern to be reported');
});

test('HOC: `withRetryLogic = (n) => n+1` is not flagged (previously any with[A-Z] name matched)', async () => {
  const f = file('math.ts', "const withRetryLogic = (n) => n + 1;\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.equal(patterns.find(p => p.name === 'Higher-Order Component'), undefined);
});

test('HOC: export default connect(...)(Component) is still detected (a real HOC shape the AST check alone does not cover)', async () => {
  const f = file('connected.ts', "export default connect(mapStateToProps)(MyComponent);\n");
  const patterns = await Parser.detectPatterns([f]);
  assert.ok(patterns.find(p => p.name === 'Higher-Order Component'), 'expected connect(...) to still be reported as a HOC');
});

test('God Object: a 16-function barrel/re-export file is not flagged (previously any file over 15 functions qualified)', async () => {
  const lines = Array.from({ length: 16 }, (_, i) => `export { x${i} } from './x${i}';`).join('\n');
  const f = file('index.ts', lines, { functions: Array.from({ length: 16 }, () => ({})) });
  const patterns = await Parser.detectPatterns([f]);
  const godObject = patterns.find(p => p.name === 'God Object');
  assert.ok(!godObject || !godObject.files.some(x => x.path === 'index.ts'));
});

test('God Object: a genuine 16-function file (not a barrel) is still flagged', async () => {
  const body = Array.from({ length: 16 }, (_, i) => `function fn${i}() { return ${i}; }`).join('\n');
  const f = file('bloated.ts', body, { functions: Array.from({ length: 16 }, () => ({})) });
  const patterns = await Parser.detectPatterns([f]);
  const godObject = patterns.find(p => p.name === 'God Object');
  assert.ok(godObject && godObject.files.some(x => x.path === 'bloated.ts'));
});

test('Duplicates: a short (~5 line) duplicated function is caught (previously invisible below the old 80-character cutoff)', async () => {
  const bodyA = "export function processOrderA() {\n  const total = price * qty;\n  console.log(total);\n  if (total > 100) { applyDiscount(total); }\n  return total;\n}\n";
  const bodyB = bodyA.replace('processOrderA', 'processOrderB');
  const dups = await Parser.detectDuplicates([file('a.ts', bodyA), file('b.ts', bodyB)]);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].type, 'code');
  assert.equal(new Set(dups[0].files.map(x => x.file)).size, 2);
});

test('Duplicates: unrelated short functions are not flagged', async () => {
  const dups = await Parser.detectDuplicates([
    file('a.py', 'def unrelated():\n    return 42\n'),
    file('b.py', 'def totally_different():\n    x = compute_something_else()\n    return x\n'),
  ]);
  assert.equal(dups.length, 0);
});

test('Security: a hardcoded secret in a template literal is caught (previously missed by the old line-regex)', async () => {
  const f = file('config.ts', 'function setup() {\n  const apiToken = `sk-${prefix}-live-9f8a7b6c`;\n}\n');
  const issues = await Parser.detectSecurity([f]);
  assert.ok(issues.some(i => i.file === 'config.ts'), 'expected a hardcoded-credential finding');
});

test('Security: documentation text that merely mentions a credential-shaped string is not flagged (previously a false positive on any "auth = \'...\'" substring)', async () => {
  const f = file('help.ts', 'function setup() {\n  const helpText = "auth = \'demo1234\'";\n}\n');
  const issues = await Parser.detectSecurity([f]);
  assert.equal(issues.filter(i => i.file === 'help.ts').length, 0);
});

test('Security: the scanner no longer neuters itself on a file containing its own source shape (the self-recognition hack is removed)', async () => {
  const f = file('index.html', "detectSecurity:function(files){\n  const password = 'literally-hardcoded-1234';\n}\ncalcComplexity:function\n");
  const issues = await Parser.detectSecurity([f]);
  assert.ok(issues.some(i => i.file === 'index.html'), 'expected the scanner to still report findings on a file shaped like its own source');
});

// tree-sitter (Python/Ruby/PHP/Java) regression tests live in
// tests/parser-detectors-treesitter.test.mjs, not here — this file loads the
// client fork via vite.ssrLoadModule (a Node SSR context with no HTTP server
// behind it), and the client's tree-sitter loader fetches WASM from a
// same-origin /wasm/ URL, which doesn't exist in that context. The server
// fork loads WASM from the filesystem instead, so it can run directly under
// plain Node — see that file for why it targets server/dist, and the
// non-tree-sitter-dependent case below, which works fine here since zero
// languages means the loader is never even invoked.

test('Patterns: a repo with no Python/Ruby/PHP/Java files never attempts tree-sitter loading and still returns JS patterns correctly', async () => {
  const f = file('withAuth.ts', 'function withAuth(Component) {\n  return function Wrapped(props) {\n    return Component(props);\n  };\n}\n');
  const patterns = await Parser.detectPatterns([f]);
  assert.ok(patterns.find(p => p.name === 'Higher-Order Component'));
});
