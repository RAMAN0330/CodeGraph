import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Runs the COMPILED CLI, like tests/parser-detectors-treesitter.test.mjs:
// tree-sitter's .wasm only loads from the filesystem in server/dist. Rebuilds
// first when any server source is newer than the build.
const serverDir = resolve('server');
const distEntry = resolve(serverDir, 'dist', 'cli', 'check.js');
function newestSource(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((max, e) => Math.max(max, e.isDirectory() ? newestSource(join(dir, e.name)) : statSync(join(dir, e.name)).mtimeMs), 0);
}
if (!existsSync(distEntry) || newestSource(resolve(serverDir, 'src')) > statSync(distEntry).mtimeMs) {
  execFileSync('npm', ['run', 'build'], { cwd: serverDir, stdio: 'inherit' });
}
const cli = createRequire(import.meta.url)(distEntry);

test('cli args: dir, format, rules and baseline options; bad input is a usage error', () => {
  assert.deepEqual(cli.parseArgs(['check', 'repo', '--format', 'github', '--baseline', 'b.json']), { dir: 'repo', format: 'github', baseline: 'b.json' });
  assert.deepEqual(cli.parseArgs([]), { dir: '.', format: 'text' });
  assert.throws(() => cli.parseArgs(['--format', 'xml']), cli.UsageError);
  assert.throws(() => cli.parseArgs(['--rules']), /needs a value/);
  assert.throws(() => cli.parseArgs(['a', 'b']), /Unknown argument/);
});

test('cli github format: annotations are escaped so file names and messages cannot break them', () => {
  const out = cli.formatReport('github', { files: 3, rules: 1, known: [], errors: [], fresh: [{ rule: 'No a:b, c', severity: 'error', from: 'src/x,y.ts', to: 'src/db.ts' }] });
  assert.match(out, /^::error file=src\/x%2Cy\.ts,title=No a%3Ab%2C c::src\/x,y\.ts must not depend on src\/db\.ts$/m);
});

test('cli end to end: a forbidden import fails, a baseline lets existing ones pass', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'structrace-cli-'));
  try {
    mkdirSync(join(dir, 'src/ui'), { recursive: true });
    mkdirSync(join(dir, 'src/db'), { recursive: true });
    writeFileSync(join(dir, 'src/db/pool.ts'), 'export function connect() { return 1; }\n');
    writeFileSync(join(dir, 'src/ui/page.ts'), "import { connect } from '../db/pool';\nexport function render() { return connect(); }\n");
    writeFileSync(join(dir, 'structrace.rules.json'), JSON.stringify({ rules: [{ name: 'No UI to DB', from: 'src/ui/**', disallow: 'src/db/**' }] }));
    const failing = await cli.check({ dir, format: 'json' });
    assert.equal(failing.exitCode, 1);
    assert.deepEqual(JSON.parse(failing.output).fresh.map(v => `${v.from} -> ${v.to}`), ['src/ui/page.ts -> src/db/pool.ts']);
    const baselinePath = join(dir, 'baseline.json');
    assert.equal((await cli.check({ dir, format: 'text', writeBaseline: baselinePath })).exitCode, 0);
    const passing = await cli.check({ dir, format: 'text', baseline: baselinePath });
    assert.equal(passing.exitCode, 0);
    assert.match(passing.output, /0 new errors, 0 new warnings, 1 in baseline/);
    await assert.rejects(cli.check({ dir: join(dir, 'src'), format: 'text' }), /No structrace\.rules\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
