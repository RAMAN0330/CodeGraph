import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { packageImports } = tsRequire(resolve('server/src/analysis/imports.ts'), import.meta.url);
const reach = tsRequire(resolve('client/src/features/security/services/vulnReach.ts'), import.meta.url);

test('package imports: npm (scoped, deep, require), not relative, aliases or builtins', () => {
  const js = "import _ from 'lodash';\nimport { x } from '@scope/pkg/sub/path';\nconst e = require('Express');\nimport y from './local';\nimport b from '@/components/b';\nimport fs from 'node:fs';\nimport p from 'path';";
  assert.deepEqual(packageImports('src/a.ts', js).sort(), ['npm:@scope/pkg', 'npm:express', 'npm:lodash']);
});

test('package imports: Python modules, Go paths, Ruby gems', () => {
  assert.deepEqual(packageImports('app/x.py', 'import requests, yaml\nfrom django.db import models\nfrom .local import thing\n').sort(), ['pypi:django', 'pypi:requests', 'pypi:yaml']);
  assert.deepEqual(packageImports('cmd/main.go', 'import (\n\t"fmt"\n\t"github.com/gin-gonic/gin/binding"\n)\n').sort(), ['go:github.com/gin-gonic/gin/binding']);
  assert.deepEqual(packageImports('lib/x.rb', "require 'active_support'\nrequire_relative 'local'\nrequire './x'\n"), ['rubygems:active_support']);
});

const usage = {
  'npm:lodash': ['src/a.ts', 'src/b.ts'], 'pypi:yaml': ['app/config.py'], 'pypi:pil': ['app/img.py'],
  'go:github.com/gin-gonic/gin/binding': ['cmd/main.go'], 'go:github.com/gin-gonic/ginx': ['cmd/other.go'],
  'rubygems:active_support': ['lib/x.rb'],
};

test('vulnerability reach: advisory package names map to the files that import them', () => {
  assert.deepEqual(reach.importersOf('lodash', 'npm', usage), ['src/a.ts', 'src/b.ts']);
  assert.deepEqual(reach.importersOf('PyYAML', 'PyPI', usage), ['app/config.py']);
  assert.deepEqual(reach.importersOf('Pillow', 'PyPI', usage), ['app/img.py']);
  assert.deepEqual(reach.importersOf('github.com/gin-gonic/gin', 'Go', usage), ['cmd/main.go'], 'sub-packages count, a different module with a shared prefix does not');
  assert.deepEqual(reach.importersOf('activesupport', 'RubyGems', usage), ['lib/x.rb']);
  assert.deepEqual(reach.importersOf('left-pad', 'npm', usage), []);
});

test('vulnerability reach: downstream files depend on the importers; old analyses say nothing', () => {
  const uses = (caller, defining) => ({ source: defining, target: caller });
  const data = { packageUsage: usage, connections: [uses('src/c.ts', 'src/a.ts'), uses('src/d.ts', 'src/c.ts'), uses('src/b.ts', 'src/a.ts')] };
  assert.deepEqual(reach.vulnReach('lodash', 'npm', data), { importers: ['src/a.ts', 'src/b.ts'], downstream: 2 });
  assert.deepEqual(reach.vulnReach('left-pad', 'npm', data), { importers: [], downstream: 0 });
  assert.equal(reach.vulnReach('lodash', 'npm', { connections: [] }), null);
});
