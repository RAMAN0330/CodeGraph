import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { indexPaths, resolveImports, bindCall } = tsRequire(resolve('server/src/analysis/imports.ts'), import.meta.url);

const index = indexPaths([
  'client/src/components/ui/button.tsx', 'client/src/lib/key.ts', 'client/src/features/a/view.tsx', 'client/src/features/a/index.ts',
  'server/src/cli/check.ts', 'server/src/lib/key.ts', 'server/src/db/pool.ts',
  'app/db.py', 'app/models/__init__.py', 'app/models/user.py', 'app/views.py', 'app/api/routes.py',
]);
const sorted = set => [...set].sort();

test('imports: relative, extensionless, index, .js-for-.ts and aliases', () => {
  const content = [
    "import { Button } from '@/components/ui/button';",
    "import key from '../../lib/key';",
    "export * from './index';",
    "const lazy = import('./view');",
    "const pool = require('../../../../server/src/db/pool.js');",
    "import React from 'react';",
  ].join('\n');
  assert.deepEqual(sorted(resolveImports('client/src/features/a/other.tsx', content, index)), [
    'client/src/components/ui/button.tsx', 'client/src/features/a/index.ts', 'client/src/features/a/view.tsx', 'client/src/lib/key.ts', 'server/src/db/pool.ts',
  ]);
});

test('imports: Python absolute, relative and module imports', () => {
  const content = 'from app.db import query\nfrom .models import User\nfrom . import views\nimport app.models.user\n';
  assert.deepEqual(sorted(resolveImports('app/api/routes.py', content, index)), ['app/db.py', 'app/models/user.py']);
  assert.deepEqual(sorted(resolveImports('app/views.py', 'from .models import User\nfrom . import db\n', index)), ['app/db.py', 'app/models/__init__.py']);
});

test('binding: own definition, then imported file, then the only definition, else nothing', () => {
  const defs = new Set(['client/src/lib/key.ts', 'server/src/lib/key.ts']);
  assert.equal(bindCall('key', 'client/src/lib/key.ts', defs, new Set()), 'client/src/lib/key.ts');
  assert.equal(bindCall('key', 'client/src/x.ts', defs, new Set(['client/src/lib/key.ts'])), 'client/src/lib/key.ts');
  assert.equal(bindCall('key', 'client/src/x.ts', defs, new Set()), null, 'a shared name nobody imported binds to nothing');
  assert.equal(bindCall('createProject', 'client/store.ts', new Set(['server/db/projectStore.ts']), new Set()), null, 'JS/TS needs an import, even for a unique name');
  assert.equal(bindCall('query', 'app/views.py', new Set(['app/db.py']), new Set()), null, 'so does Python');
  assert.equal(bindCall('Run', 'cmd/a.go', new Set(['cmd/b.go', 'pkg/run.go']), new Set()), 'cmd/b.go', 'Go: same package without an import');
  assert.equal(bindCall('helper', 'lib/x.rb', new Set(['lib/y.rb']), new Set()), 'lib/y.rb', 'other languages: a unique name');
  assert.equal(bindCall('nope', 'a.ts', undefined, new Set()), null);
});

test('imports: a barrel index makes its re-exported files visible', () => {
  const { resolveReexports, visibleFiles } = tsRequire(resolve('server/src/analysis/imports.ts'), import.meta.url);
  const barrel = resolveReexports('client/src/features/a/index.ts', "export * from './view';\nexport { key } from '../../lib/key';", index);
  assert.deepEqual(sorted(barrel), ['client/src/features/a/view.tsx', 'client/src/lib/key.ts']);
  const visible = visibleFiles(new Set(['client/src/features/a/index.ts']), new Map([['client/src/features/a/index.ts', barrel]]));
  assert.deepEqual(sorted(visible), ['client/src/features/a/index.ts', 'client/src/features/a/view.tsx', 'client/src/lib/key.ts']);
});

test('binding never crosses languages', () => {
  assert.equal(bindCall('handler', 'server/api_test.go', new Set(['client/src/endpoints.ts']), new Set()), null);
  assert.equal(bindCall('render', 'docs/design.json', new Set(['tests/ui.test.mjs']), new Set()), null);
  assert.equal(bindCall('init', 'web/index.html', new Set(['web/app.js']), new Set(['web/app.js'])), 'web/app.js', 'HTML pages reach the scripts they load');
  assert.equal(bindCall('init', 'web/index.html', new Set(['web/app.js']), new Set()), null, 'but not scripts they never load');
  const idx = indexPaths(['web/index.html', 'web/js/app.js', 'web/vendor.js']);
  assert.deepEqual(sorted(resolveImports('web/index.html', '<script src="js/app.js"></script><script defer src="./vendor.js"></script><script src="https://cdn.x/y.js"></script>', idx)), ['web/js/app.js', 'web/vendor.js']);
});
