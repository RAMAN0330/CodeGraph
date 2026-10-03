import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const query = tsRequire(resolve('client/src/features/analysis/services/codebaseQuery.ts'), import.meta.url);
const explain = tsRequire(resolve('server/src/services/codebaseExplain.ts'), import.meta.url);

// conn source = file defining the function, target = file calling it.
const uses = (caller, defining) => ({ source: defining, target: caller, fn: 'x', count: 1 });
const data = {
  files: ['src/main.ts', 'src/routes.ts', 'src/auth/session.ts', 'src/auth/index.ts', 'src/db.ts', 'src/index.ts', 'src/billing.ts']
    .map(path => ({ path, name: path.split('/').pop(), layer: path.includes('auth') ? 'service' : 'other' })),
  connections: [
    uses('src/main.ts', 'src/routes.ts'), uses('src/routes.ts', 'src/auth/session.ts'),
    uses('src/auth/session.ts', 'src/db.ts'), uses('src/billing.ts', 'src/db.ts'), uses('src/routes.ts', 'src/billing.ts'),
  ],
  functions: [
    { name: 'requireLogin', file: 'src/auth/session.ts', line: 12 },
    { name: 'authenticateUser', file: 'src/auth/session.ts', line: 30 },
    { name: 'chargeCard', file: 'src/billing.ts', line: 5 },
  ],
  fnStats: {
    authenticateUser: { file: 'src/auth/session.ts', line: 30, code: 'function authenticateUser() { return db.find(); }' },
    chargeCard: { file: 'src/billing.ts', line: 5, code: 'x'.repeat(5000) },
  },
};

test('ask: "where" questions rank files by path and function-name matches', () => {
  const answer = query.answerQuestion(data, 'Where is authentication handled?');
  assert.equal(answer.kind, 'locate');
  assert.deepEqual(answer.terms, ['authentication']);
  assert.equal(answer.results[0].path, 'src/auth/session.ts');
  assert.deepEqual(answer.results[0].matches.map(m => m.name), ['authenticateUser']);
});

test('ask: impact lists direct and transitive dependents of a named file', () => {
  const answer = query.answerQuestion(data, 'What breaks if I change db.ts?');
  assert.deepEqual(answer, { kind: 'impact', file: 'src/db.ts', direct: ['src/auth/session.ts', 'src/billing.ts'], transitive: ['src/main.ts', 'src/routes.ts'] });
});

test('ask: a file can be named without its extension or by full path', () => {
  assert.equal(query.answerQuestion(data, 'who uses billing').file, 'src/billing.ts');
  assert.equal(query.answerQuestion(data, 'what breaks if I change src/auth/index.ts').file, 'src/auth/index.ts');
  assert.equal(query.answerQuestion(data, 'what breaks if I change index.ts').file, 'src/index.ts', 'shallowest path wins a shared basename');
});

test('ask: dependencies and shortest path', () => {
  assert.deepEqual(query.answerQuestion(data, 'What does routes.ts depend on?'), { kind: 'dependencies', file: 'src/routes.ts', direct: ['src/auth/session.ts', 'src/billing.ts'] });
  assert.deepEqual(query.answerQuestion(data, 'How does main.ts reach db.ts?').path, ['src/main.ts', 'src/routes.ts', 'src/auth/session.ts', 'src/db.ts']);
  assert.equal(query.answerQuestion(data, 'How does db.ts reach main.ts?').path, null);
});

test('ask: an impact question without a file asks for one and suggests candidates', () => {
  // "login" names no file, but matches requireLogin() in session.ts.
  const answer = query.answerQuestion(data, 'what breaks if I change the login code');
  assert.equal(answer.kind, 'unresolved');
  assert.deepEqual(answer.suggestions, ['src/auth/session.ts']);
  assert.equal(query.answerQuestion(data, 'what breaks if I change the session logic').file, 'src/auth/session.ts', 'a bare file stem still resolves');
});

test('explain context: only known files, code from the stored analysis, within budget', () => {
  const { user, allowed } = explain.buildExplainContext(data, 'How does login work?', ['src/auth/session.ts', 'src/billing.ts', '/etc/passwd', 42]);
  assert.deepEqual([...allowed], ['src/auth/session.ts', 'src/billing.ts']);
  const payload = JSON.parse(user);
  assert.equal(payload.files[0].dependents, 1);
  assert.deepEqual(payload.files[0].dependsOn, ['src/db.ts']);
  assert.match(payload.files[0].functions[0].code, /authenticateUser/);
  assert.equal(payload.files[1].functions[0].code.length, 1500, 'each function excerpt is clipped');
});

test('saved views: names, sections, files and branches are validated', () => {
  const { validateView } = tsRequire(resolve('server/src/db/savedViews.ts'), import.meta.url);
  assert.deepEqual(validateView({ name: ' Hot path ', section: 'hotspots' }), { name: 'Hot path', section: 'hotspots', file: null, branch: null });
  assert.throws(() => validateView({ name: '', section: 'explorer' }), /name/);
  assert.throws(() => validateView({ name: 'x', section: '<script>' }), /section/);
  assert.throws(() => validateView({ name: 'x', section: 'explorer', file: '../../etc/passwd' }), /file path/);
  assert.throws(() => validateView({ name: 'x', section: 'explorer', branch: '--upload-pack=x' }), /branch/);
});
