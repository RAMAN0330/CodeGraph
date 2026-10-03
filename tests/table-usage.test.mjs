import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { linkTablesToCode } = tsRequire(resolve('client/src/features/database/services/tableUsage.ts'), import.meta.url);
const { parseDbSchema } = tsRequire(resolve('client/src/features/database/services/dbParser.ts'), import.meta.url);

const files = [
  { path: 'db/schema.sql', content: 'CREATE TABLE users (id int primary key);\nCREATE TABLE orders (id int, user_id int references users(id));' },
  { path: 'src/repo.ts', content: 'const q = `SELECT * FROM users u JOIN orders o ON o.user_id = u.id`;\nawait db.query("UPDATE \\"users\\" SET name = $1");' },
  { path: 'src/report.py', content: 'cursor.execute("select count(*) from public.orders")' },
  { path: 'src/notes.ts', content: '// users can place orders; the user table is important' },
  { path: 'src/users_service.ts', content: 'const usersById = new Map(); // from users_archive' },
  { path: 'db/migrations/002_add_email.sql', content: 'ALTER TABLE users ADD COLUMN email text;' },
];

test('table usage: SQL references are found per file, the definition is not a use', () => {
  const tables = parseDbSchema(files).tables;
  assert.deepEqual(tables.map(t => t.name).sort(), ['orders', 'users']);
  const usage = linkTablesToCode(tables, files);
  assert.deepEqual(usage.users, [
    { file: 'src/repo.ts', count: 2, kinds: ['sql'] },
    { file: 'db/migrations/002_add_email.sql', count: 1, kinds: ['migration'] },
  ]);
  assert.deepEqual(usage.orders.map(u => u.file), ['src/repo.ts', 'src/report.py']);
});

test('table usage: bare words, longer identifiers and prefixes are not uses', () => {
  const usage = linkTablesToCode([{ name: 'users', file: 'db/schema.sql' }], files);
  const used = usage.users.map(u => u.file);
  assert.ok(!used.includes('src/notes.ts'));
  assert.ok(!used.includes('src/users_service.ts'), '"from users_archive" names a different table');
});

test('table usage: ORM access to a model counts, a mention does not', () => {
  const tables = [
    { name: 'shop_order', file: 'shop/models.py', modelName: 'Order', dbTableName: 'shop_order' },
    { name: 'UserProfile', file: 'prisma/schema.prisma', modelName: 'UserProfile' },
  ];
  const code = [
    { path: 'shop/views.py', content: 'orders = Order.objects.filter(paid=True)\nexcept Order.DoesNotExist: pass' },
    { path: 'shop/tasks.py', content: 'stmt = select(Order).where(Order.id == 1)' },
    { path: 'shop/docs.py', content: '"""Order handling lives elsewhere."""' },
    { path: 'web/profile.ts', content: 'const p = await prisma.userProfile.findUnique({ where: { id } })' },
    { path: 'shop/migrations/0003_order.py', content: "migrations.AddField(model_name='order', name='paid', field=models.BooleanField())" },
    { path: 'alembic/versions/a1_users.py', content: "op.add_column('shop_order', sa.Column('note', sa.Text()))" },
  ];
  const usage = linkTablesToCode(tables, code);
  assert.deepEqual(usage.shop_order.map(u => [u.file, u.kinds[0]]), [
    ['shop/views.py', 'model'],
    ['alembic/versions/a1_users.py', 'migration'],
    ['shop/migrations/0003_order.py', 'migration'],
    ['shop/tasks.py', 'model'],
  ]);
  assert.deepEqual(usage.UserProfile, [{ file: 'web/profile.ts', count: 1, kinds: ['model'] }]);
});
