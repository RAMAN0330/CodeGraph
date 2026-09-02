import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require('../client/node_modules/typescript');

async function loadDbParser() {
  const parserPath = resolve(__dirname, '../client/src/features/database/services/dbParser.ts');
  const source = readFileSync(parserPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    fileName: parserPath,
  }).outputText;
  const encoded = Buffer.from(js, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}#${pathToFileURL(parserPath).href}`);
}

test('parseDjangoModels parses class bodies and multiline relation fields', async () => {
  const { parseDjangoModels } = await loadDbParser();
  const source = `
from django.conf import settings
from django.db import models

class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    friends = models.ManyToManyField('self', blank=True)

    class Meta:
        db_table = "user_profile"
`;

  const tables = parseDjangoModels(source, 'accounts/models.py');
  assert.equal(tables.length, 1);
  assert.equal(tables[0].name, 'accounts.Profile');
  assert.equal(tables[0].app, 'accounts');
  assert.equal(tables[0].modelName, 'Profile');
  assert.equal(tables[0].dbTableName, 'user_profile');
  assert.ok(tables[0].columns.some(c => c.name === 'id' && c.isPrimaryKey));
  assert.ok(tables[0].columns.some(c => c.name === 'user_id' && c.references?.table === 'auth.User'));
  assert.ok(tables[0].relations.some(r => r.type === 'one-to-one' && r.toTable === 'auth.User'));
  assert.ok(tables[0].relations.some(r => r.type === 'many-to-many' && r.toTable === 'accounts.Profile'));
});

test('parseDbSchema groups Django app models and preserves cross-app links', async () => {
  const { dbSchemaToFlowSchema, parseDbSchema } = await loadDbParser();
  const schema = parseDbSchema([
    {
      path: 'users/models.py',
      content: `
from django.db import models

class User(models.Model):
    email = models.EmailField(unique=True)
`,
    },
    {
      path: 'orders/models/order.py',
      content: `
from django.db import models

class Order(models.Model):
    customer = models.ForeignKey('users.User', on_delete=models.CASCADE)
    reviewer = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
`,
    },
  ]);

  assert.equal(schema.source, 'django');
  assert.deepEqual(schema.tables.map(t => t.name).sort(), ['orders.Order', 'users.User']);
  assert.ok(schema.relations.some(r => r.fromTable === 'orders.Order' && r.fromColumn === 'customer_id' && r.toTable === 'users.User'));
  assert.ok(schema.relations.some(r => r.fromTable === 'orders.Order' && r.fromColumn === 'reviewer_id' && r.toTable === 'orders.User'));

  const flow = dbSchemaToFlowSchema(schema);
  const order = flow.tables.find(t => t.name === 'orders.Order');
  assert.ok(order);
  assert.ok(order.foreignKeys.some(fk => fk.column === 'customer_id' && fk.referencedTable === 'users.User'));
});
