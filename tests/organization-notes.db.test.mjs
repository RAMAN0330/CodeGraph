import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// Needs a disposable Postgres database: TEST_DATABASE_URL=postgres://localhost/scratch node --test tests/organization-notes.db.test.mjs
// Skipped otherwise. The schema is created in that database; drop it afterwards.
const url = process.env.TEST_DATABASE_URL;

test('invites, team notes and coverage against Postgres', { skip: url ? false : 'set TEST_DATABASE_URL to run' }, async () => {
  process.env.DATABASE_URL = url;
  const serverRequire = createRequire(resolve('server/package.json'));
  const { require: tsRequire } = serverRequire('tsx/cjs/api');
  const load = p => tsRequire(resolve(p), import.meta.url);
  const { initSchema, pool } = load('server/src/db/pool.ts');
  const users = load('server/src/db/users.ts');
  const org = load('server/src/db/organization.ts');
  const notes = load('server/src/db/annotations.ts');
  try {
    await initSchema();
    const admin = await users.createOrganizationWithAdmin('Acme', 'alice', 'x');
    const outsider = await users.createOrganizationWithAdmin('Other', 'mallory', 'x');

    const { token } = await org.createInvite(admin.organization_id, admin.id);
    assert.deepEqual(await org.findOpenInvite(token), { organizationName: 'Acme' });
    const stored = await pool.query('SELECT token_hash FROM organization_invites');
    assert.notEqual(stored.rows[0].token_hash, token, 'raw token is never stored');

    // Two people race for one link: exactly one gets in.
    const results = await Promise.allSettled([org.joinOrganizationWithInvite(token, 'bob', 'x'), org.joinOrganizationWithInvite(token, 'carol', 'x')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(results.find(r => r.status === 'rejected').reason instanceof org.InviteUnavailableError);
    const member = results.find(r => r.status === 'fulfilled').value;
    assert.equal(member.organization_id, admin.organization_id);
    assert.equal(member.role, 'member');
    assert.equal(await org.findOpenInvite(token), null, 'used link no longer resolves');
    assert.equal(await org.findOpenInvite('short'), null);
    await pool.query("UPDATE organization_invites SET expires_at = now() - interval '1 minute'");
    const { token: t2 } = await org.createInvite(admin.organization_id, admin.id);
    await pool.query("UPDATE organization_invites SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL");
    await assert.rejects(org.joinOrganizationWithInvite(t2, 'dave', 'x'), org.InviteUnavailableError, 'expired link is refused');
    assert.deepEqual((await org.listMembers(admin.organization_id)).map(m => [m.username, m.role]), [['alice', 'admin'], [member.username, 'member']]);

    // Notes: shared in the org, invisible outside it.
    const n1 = await notes.createAnnotation(admin.organization_id, admin.id, 'Octo', 'Repo', 'src/a.ts', 'careful: legacy');
    await notes.createAnnotation(outsider.organization_id, outsider.id, 'octo', 'repo', 'src/a.ts', 'other org');
    const seenByMember = await notes.listAnnotations(member.organization_id, 'octo', 'repo');
    assert.deepEqual(seenByMember.map(n => [n.body, n.author]), [['careful: legacy', 'alice']]);
    assert.equal((await notes.listAnnotations(outsider.organization_id, 'octo', 'repo')).length, 1);

    // Member may resolve but not reword or delete the admin's note.
    const resolved = await notes.updateAnnotation(member.organization_id, member.id, n1.id, { resolved: true });
    assert.ok(resolved.resolvedAt);
    await assert.rejects(notes.updateAnnotation(member.organization_id, member.id, n1.id, { body: 'hijack' }), /Only the author/);
    assert.equal(await notes.deleteAnnotation(member.organization_id, { id: member.id, role: 'member' }, n1.id), false);
    assert.equal(await notes.updateAnnotation(outsider.organization_id, outsider.id, n1.id, { resolved: false }), null, 'other org cannot touch it');
    assert.equal(await notes.deleteAnnotation(outsider.organization_id, { id: outsider.id, role: 'admin' }, n1.id), false, 'other org admin cannot delete it');
    const reopened = await notes.updateAnnotation(admin.organization_id, admin.id, n1.id, { resolved: false, body: 'reworded' });
    assert.equal(reopened.resolvedAt, null);
    assert.equal(reopened.body, 'reworded');
    // Admin may delete a member's note.
    const n2 = await notes.createAnnotation(member.organization_id, member.id, 'octo', 'repo', 'src/b.ts', 'mine');
    assert.equal(await notes.deleteAnnotation(admin.organization_id, { id: admin.id, role: 'admin' }, n2.id), true);
    assert.throws(() => notes.validateNote('../etc/passwd', 'x'), /repository path/);
    assert.throws(() => notes.validateNote('a.ts', 'x'.repeat(2001)), /limited/);
    // Coverage is per organization: another org's upload never replaces ours.
    const coverage = load('server/src/db/coverage.ts');
    await coverage.saveCoverage(admin.organization_id, admin.id, 'Octo', 'Repo', 'HEAD', 'lcov', { 'src/a.ts': { found: 10, hit: 9 } });
    await coverage.saveCoverage(outsider.organization_id, outsider.id, 'octo', 'repo', 'HEAD', 'lcov', { 'src/a.ts': { found: 10, hit: 0 } });
    assert.deepEqual((await coverage.getCoverage(member.organization_id, 'octo', 'repo', 'HEAD')).files, { 'src/a.ts': { found: 10, hit: 9 } });
    await coverage.saveCoverage(admin.organization_id, member.id, 'octo', 'repo', 'HEAD', 'cobertura', { 'src/b.ts': { found: 2, hit: 1 } });
    const replaced = await coverage.getCoverage(admin.organization_id, 'octo', 'repo', 'HEAD');
    assert.deepEqual([replaced.format, replaced.uploadedBy, Object.keys(replaced.files)], ['cobertura', member.username, ['src/b.ts']]);
    // Weekly digest: one per repository + channel, with the week's activity.
    const projects = load('server/src/db/projectStore.ts');
    const history = load('server/src/db/analysisHistory.ts');
    const digest = load('server/src/services/weeklyDigest.ts');
    const actor = { id: admin.id, organizationId: admin.organization_id, role: admin.role };
    const ws = await projects.createWorkspace(actor, 'Main');
    const project = await projects.createProject(actor, { workspaceId: ws.id, name: 'Shop', instructions: '', projectType: 'codebase', repositoryFullName: 'Octo/Repo' });
    await projects.setAlertWebhook(actor, project.id, 'https://hooks.slack.com/services/T0/B0/x');
    const snap = (score, grade) => ({ timestamp: 't', healthScore: score, healthGrade: grade, circular: 0, stats: { files: 1, functions: 1, connections: 0, loc: 1, security: 0, dead: 0, violations: 0, duplicates: 0, patterns: 0 } });
    await history.insertSnapshot('octo', 'repo', 'HEAD', { ...snap(90, 'A'), commitSha: 'a1' });
    await pool.query("UPDATE analysis_snapshots SET captured_at = now() - interval '10 days'");
    await history.insertSnapshot('octo', 'repo', 'HEAD', { ...snap(84, 'B'), commitSha: 'b2' });
    await history.insertAlerts('octo', 'repo', 'HEAD', 'b2', [{ kind: 'health', message: 'Health dropped from A (90) to B (84)', previous: 90, current: 84 }]);
    const digests = await digest.buildDigests();
    assert.equal(digests.length, 1);
    assert.match(digests[0].text, /Structrace weekly: Shop \(Octo\/Repo\)\n• Health A \(90\) → B \(84\), -6 over 1 analyzed commit\n• 1 regression:/);
    assert.match(digests[0].text, /Team notes: 1 open, 1 new this week/);
    // Saved views: shared in the org, invisible outside it; creator or admin deletes.
    const views = load('server/src/db/savedViews.ts');
    const v = await views.createView(member.organization_id, member.id, 'Octo', 'Repo', views.validateView({ name: 'Payments', section: 'explorer', file: 'src/pay.ts', branch: 'main' }));
    assert.deepEqual([v.name, v.section, v.file, v.branch, v.createdBy], ['Payments', 'explorer', 'src/pay.ts', 'main', member.username]);
    assert.equal((await views.listViews(admin.organization_id, 'octo', 'repo')).length, 1);
    assert.equal((await views.listViews(outsider.organization_id, 'octo', 'repo')).length, 0);
    assert.equal(await views.deleteView(outsider.organization_id, { id: outsider.id, role: 'admin' }, v.id), false);
    assert.equal(await views.deleteView(admin.organization_id, { id: admin.id, role: 'admin' }, v.id), true);
  } finally {
    await pool.end();
  }
});
