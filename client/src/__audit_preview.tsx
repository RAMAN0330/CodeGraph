// TEMPORARY audit preview — deleted after visual QA.
import { createRoot } from 'react-dom/client';
import './index.css';
import './shadcn.css';
import './App.css';
import 'highlight.js/styles/github.css';
import CommandPalette from './features/workspace/components/CommandPalette';
import { WORKSPACE_MODULES } from './features/workspace/config/workspaceModules';
const sections = WORKSPACE_MODULES.flatMap(m => m.tools.map(t => ({ id: t.id, label: t.label, description: t.description, group: m.label })));
const routerSrc = `import { Router } from 'express';\nimport { requireAuth } from '../auth/guard';\nimport { createInvoice } from '../billing/invoice';\n\nexport const router = Router();\n\nrouter.post('/invoices', requireAuth, async (req, res) => {\n  const invoice = await createInvoice(req.user.id, req.body);\n  res.status(201).json(invoice);\n});\n\nexport function handleError(err: Error) {\n  console.error(err);\n}`;
const files = [
  { path: 'src/api/router.ts', name: 'router.ts', folder: 'src/api', lines: 214, functions: [1,2,3,4], content: routerSrc },
  { path: 'src/api/middleware.ts', name: 'middleware.ts', folder: 'src/api', lines: 88, functions: [1,2] },
  { path: 'src/auth/session.ts', name: 'session.ts', folder: 'src/auth', lines: 132, functions: [1,2,3], content: 'export function createSession(userId: string) {\n  return sign({ sub: userId });\n}' },
  { path: 'src/auth/guard.ts', name: 'guard.ts', folder: 'src/auth', lines: 41, functions: [1] },
  { path: 'src/billing/invoice.ts', name: 'invoice.ts', folder: 'src/billing', lines: 302, functions: [1,2,3,4,5,6] },
  { path: 'src/billing/webhook.ts', name: 'webhook.ts', folder: 'src/billing', lines: 97, functions: [1,2] },
  { path: 'src/components/RouteTable.tsx', name: 'RouteTable.tsx', folder: 'src/components', lines: 156, functions: [1] },
];
const functions = [
  { name: 'handleError', file: 'src/api/router.ts', line: 12, type: 'function', isExported: true, code: 'export function handleError(err: Error) {\n  console.error(err);\n}' },
  { name: 'createInvoice', file: 'src/billing/invoice.ts', line: 18, type: 'function', isExported: true, code: 'export async function createInvoice(userId: string, input: InvoiceInput) {\n  const plan = await getPlan(userId);\n  return db.invoice.create({ data: { userId, total: plan.price } });\n}' },
  { name: 'requireAuth', file: 'src/auth/guard.ts', line: 4, type: 'arrow', isExported: true },
  { name: 'handleWebhook', file: 'src/billing/webhook.ts', line: 9, type: 'function' },
  { name: 'routeKey', file: 'src/api/middleware.ts', line: 30, type: 'method' },
];
const folders = ['src/api', 'src/auth', 'src/billing', 'src/components'];
const p = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(
  <CommandPalette files={files} functions={functions} folders={folders} sections={sections} scopeKey="acme/api"
    onSelectFile={f => (window as any).__picked = f.path} onSelectFunction={f => (window as any).__picked = f.name}
    onSelectFolder={f => (window as any).__picked = f} onSelectSection={s => (window as any).__picked = s} onClose={() => { (window as any).__closed = true; }} />
);
void p;
