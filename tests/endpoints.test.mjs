import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { extractEndpoints, resolveEndpointReach } = tsRequire(resolve('client/src/features/analysis/services/endpoints.ts'), import.meta.url);

const pick = list => list.map(e => `${e.method} ${e.path} ${e.handler ?? '-'} ${e.framework}`);

test('endpoints: express-style routers, but not HTTP clients or caches', () => {
  const eps = extractEndpoints([{ path: 'src/routes.ts', content: [
    "router.get('/users', auth, usersController.list);",
    "app.post('/users', async (req, res) => { res.json(await createUser(req.body)); });",
    "adminRouter.delete('/users/:id', removeUser)",
    "const r = await axios.get('/api/users', { headers });",
    "cache.get('/key', fallback);",
  ].join('\n') }]);
  assert.deepEqual(pick(eps), ['GET /users list express', 'POST /users - express', 'DELETE /users/:id removeUser express']);
  assert.deepEqual(eps.map(e => e.line), [1, 2, 3]);
});

test('endpoints: FastAPI, Flask and Django', () => {
  const eps = extractEndpoints([
    { path: 'api/main.py', content: '@app.get("/items/{item_id}")\nasync def read_item(item_id: int):\n    return get_item(item_id)\n\n@router.post("/orders", status_code=201)\n@requires_auth\ndef create_order(o):\n    pass\n' },
    { path: 'web/app.py', content: "@bp.route('/login', methods=['POST'])\ndef login():\n    pass\n" },
    { path: 'shop/urls.py', content: "urlpatterns = [\n    path('cart/', views.cart_view),\n    path('orders/<int:pk>/', OrderDetail.as_view()),\n    path('api/', include('api.urls')),\n]" },
  ]);
  assert.deepEqual(pick(eps), [
    'ANY /cart/ cart_view django', 'GET /items/{item_id} read_item fastapi', 'POST /login login flask',
    'POST /orders create_order fastapi', 'ANY /orders/<int:pk>/ OrderDetail django',
  ]);
});

test('endpoints: Go, Spring and Next.js', () => {
  const eps = extractEndpoints([
    { path: 'cmd/server.go', content: 'r.GET("/health", healthHandler)\nmux.HandleFunc("POST /jobs", h.createJob)\nhttp.HandleFunc("/metrics", metrics)\n' },
    { path: 'src/main/java/UserController.java', content: '@GetMapping("/users/{id}")\npublic ResponseEntity<User> findUser(@PathVariable Long id) {' },
    { path: 'app/(shop)/orders/[id]/route.ts', content: 'export async function GET(req) {}\nexport const DELETE = async () => {}' },
    { path: 'pages/api/stats/index.ts', content: 'export default function handler(req, res) {}' },
    { path: 'src/routes.test.ts', content: "app.get('/ignored', h)" },
  ]);
  // Sorted by path, then method.
  assert.deepEqual(pick(eps), [
    'ANY /api/stats - nextjs', 'GET /health healthHandler go', 'POST /jobs createJob go', 'ANY /metrics metrics go',
    'DELETE /orders/:id DELETE nextjs', 'GET /orders/:id GET nextjs', 'GET /users/{id} findUser spring',
  ]);
});

test('endpoint reach: starts at what the handler calls, then follows dependencies to tables', () => {
  const files = [
    { path: 'src/routes.ts', content: "router.get('/users', listUsers);\nrouter.get('/orders', (req, res) => listOrders(req));\n// orders table: select from orders" },
    { path: 'src/users.ts', content: '' }, { path: 'src/orders.ts', content: '' }, { path: 'src/db.ts', content: '' },
  ];
  // conn source = file defining the function, target = file calling it.
  const uses = (caller, defining) => ({ source: defining, target: caller, fn: 'x', count: 1 });
  const data = {
    files,
    connections: [uses('src/routes.ts', 'src/users.ts'), uses('src/routes.ts', 'src/orders.ts'), uses('src/users.ts', 'src/db.ts')],
    fnStats: {
      listUsers: { file: 'src/users.ts', code: 'function listUsers() { return queryUsers(); }' },
      queryUsers: { file: 'src/db.ts', code: 'function queryUsers() {}' },
      listOrders: { file: 'src/orders.ts', code: 'function listOrders() {}' },
    },
    tableUsage: { users: [{ file: 'src/db.ts', kinds: ['sql'] }], orders: [{ file: 'src/routes.ts', kinds: ['sql'] }] },
  };
  const [orders, users] = resolveEndpointReach(extractEndpoints(files), data);
  assert.deepEqual([users.path, users.calls, users.reach, users.tables], ['/users', ['queryUsers'], ['src/db.ts'], ['users']]);
  assert.deepEqual([orders.path, orders.calls, orders.reach, orders.tables], ['/orders', ['listOrders'], ['src/orders.ts'], ['orders']]);
  assert.ok(!users.reach.includes('src/orders.ts'), 'a sibling route in the same file is not reach');
});

test('PR review: endpoints are affected through their own file or anything they reach', () => {
  const prReview = tsRequire(resolve('server/src/services/prReview.ts'), import.meta.url);
  const eps = [
    { method: 'GET', path: '/users', file: 'src/routes.ts', reach: ['src/users.ts', 'src/db.ts'] },
    { method: 'POST', path: '/orders', file: 'src/orders/routes.ts', reach: ['src/orders/service.ts'] },
  ];
  assert.deepEqual(prReview.endpointsAffectedBy(eps, ['src/db.ts']), [{ method: 'GET', path: '/users', via: 'src/db.ts' }]);
  assert.deepEqual(prReview.endpointsAffectedBy(eps, ['src/orders/routes.ts']), [{ method: 'POST', path: '/orders', via: 'src/orders/routes.ts' }]);
  assert.deepEqual(prReview.endpointsAffectedBy(eps, ['README.md']), []);
});
