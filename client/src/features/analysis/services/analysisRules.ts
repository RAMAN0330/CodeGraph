// Structural (AST-based) replacements for a handful of parser.ts's detection
// rules, plus a token-based duplicate detector. Pulled into its own module,
// with zero dependency on parser.ts, so the server's analysis pipeline can
// import this file directly (a relative path reach across the client/server
// boundary — see server/src/analysis/parser.ts) instead of hand-maintaining
// a second copy of this logic, the way the rest of parser.ts is today.
//
// JS/TS is AST-verified via acorn, which this pipeline already parses
// synchronously. Python/Ruby/PHP/Java are AST-verified via tree-sitter
// (web-tree-sitter + tree-sitter-wasms grammars), loaded asynchronously —
// see the tree-sitter section below and initTreeSitter() in parser.ts for
// how each environment (browser vs Node) loads the WASM. VBA has no
// tree-sitter grammar available anywhere and stays regex-based in parser.ts.
// Every function below is designed to fail closed: a parse error, or a
// language whose grammar failed to load, just means that file contributes
// nothing to these specific checks — never a thrown exception that aborts
// analysis.

import * as acorn from 'acorn';

export interface RuleFile {
  path: string;
  name: string;
  content?: string | null;
}

export interface PatternMatch {
  name: string;
  icon: string;
  desc: string;
  severity: 'info';
  files: { name: string; path: string }[];
  metrics: Record<string, number>;
}

export interface SecurityFinding {
  severity: 'high' | 'medium' | 'low';
  title: string;
  file: string;
  path: string;
  line: number;
  desc: string;
  code: string;
}

function isJsOrTs(file: RuleFile): boolean {
  return /\.(jsx?|tsx?|mjs|cjs)$/i.test(file.name || '');
}

// A minimal, best-effort strip — just enough for acorn to see the structural
// shape (classes, functions, calls) of typical TS/TSX. Not a real TS parser:
// on anything it can't handle, acorn.parse below throws and that one file is
// skipped for these checks, same as any other unparseable file.
function looseStripTypes(content: string): string {
  return content
    .replace(/^\s*(?:export\s+)?interface\s+[\s\S]*?\n\}\s*$/gm, '')
    .replace(/^\s*(?:export\s+)?type\s+\w+\s*=[\s\S]*?;?\s*$/gm, '')
    .replace(/:\s*[A-Za-z_$][\w$.<>[\]|&\s,]*(?=[,)])/g, '')
    .replace(/\)\s*:\s*[A-Za-z_$][\w$.<>[\]|&\s]*(?=\s*[{=])/g, ')')
    .replace(/<[A-Za-z_$][\w$,\s]*>(?=\()/g, '')
    .replace(/\bas\s+const\b/g, '')
    .replace(/\bas\s+[A-Za-z_$][\w$.<>[\]|&\s]*/g, '')
    .replace(/^\s*(?:export\s+)?(?:abstract\s+)?(?:public|private|protected|readonly)\s+/gm, '  ');
}

function tryParse(file: RuleFile): acorn.Node | null {
  if (!file.content || !isJsOrTs(file)) return null;
  const isTs = /\.tsx?$/i.test(file.name);
  const source = isTs ? looseStripTypes(file.content) : file.content;
  try {
    return acorn.parse(source, {
      ecmaVersion: 2022,
      sourceType: 'module',
      allowHashBang: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      locations: true,
    }) as unknown as acorn.Node;
  } catch {
    return null;
  }
}

// Shallow, iterative walk — every check below only needs to visit statement
// and expression nodes a few levels deep, not a full visitor framework.
function walk(node: any, visit: (node: any, parent: any) => void, parent: any = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key in node) {
    if (key === 'loc' || key === 'range' || key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, node));
    else if (value && typeof value.type === 'string') walk(value, visit, node);
  }
}

// ---- Singleton: a class with a static getInstance() method or a static
// `instance` field — not any file that merely contains the word "instance". ----
function hasSingletonShape(ast: any): boolean {
  let found = false;
  walk(ast, node => {
    if (found || node.type !== 'ClassDeclaration') return;
    for (const member of node.body?.body ?? []) {
      const isStatic = !!member.static;
      const name = member.key?.name;
      if (isStatic && member.type === 'MethodDefinition' && name === 'getInstance') { found = true; return; }
      if (isStatic && (member.type === 'PropertyDefinition' || member.type === 'ClassProperty') && /^_?instance$/i.test(name || '')) { found = true; return; }
    }
  });
  return found;
}

// ---- Factory: a create*() function that branches to construct different
// concrete types — not any function that merely contains `return new X()`. ----
function hasFactoryShape(fn: any): boolean {
  const newTargets = new Set<string>();
  let hasBranch = false;
  walk(fn.body, node => {
    if (node.type === 'IfStatement' || node.type === 'SwitchStatement') hasBranch = true;
    if (node.type === 'NewExpression' && node.callee?.name) newTargets.add(node.callee.name);
  });
  return hasBranch && newTargets.size >= 2;
}

// ---- Observer/Event: only counts .on(/.addEventListener(/.subscribe( calls
// on something actually traceable to an emitter — a `new XEmitter()`/`new
// EventTarget()` construction in this file, `this` inside a class extending
// one, or a well-known emitter global — not any object with a `.on(` method. ----
const EMITTER_RE = /Emitter|EventTarget|Emittery|Observable/i;
const EMITTER_GLOBALS = new Set(['process']);

function findEmitterUsage(ast: any): { name: string; count: number } | null {
  const emitterVars = new Set<string>();
  let emitterClassInScope = false;
  let hits = 0;

  walk(ast, node => {
    if (node.type === 'ClassDeclaration' && node.superClass?.name && EMITTER_RE.test(node.superClass.name)) {
      emitterClassInScope = true;
    }
    if (node.type === 'VariableDeclarator' && node.init?.type === 'NewExpression' && node.init.callee?.name && EMITTER_RE.test(node.init.callee.name) && node.id?.name) {
      emitterVars.add(node.id.name);
    }
  });

  walk(ast, node => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression') return;
    const method = node.callee.property?.name;
    if (!['on', 'addEventListener', 'subscribe', 'emit'].includes(method)) return;
    const receiver = node.callee.object;
    const isKnownEmitter =
      (receiver.type === 'ThisExpression' && emitterClassInScope) ||
      (receiver.type === 'Identifier' && (emitterVars.has(receiver.name) || EMITTER_GLOBALS.has(receiver.name)));
    if (isKnownEmitter) hits += 1;
  });

  return hits > 0 ? { name: 'emitter', count: hits } : null;
}

// ---- Custom Hooks: use[A-Z]... exported either as a named export or as a
// default export — the current regex only catches the named-export form. ----
function findExportedHookName(ast: any): string | null {
  let hookName: string | null = null;
  walk(ast, node => {
    if (hookName) return;
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const decl = node.declaration;
      if (decl.type === 'FunctionDeclaration' && /^use[A-Z]/.test(decl.id?.name || '')) hookName = decl.id.name;
      if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) if (/^use[A-Z]/.test(d.id?.name || '')) hookName = d.id.name;
      }
    }
    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if (decl?.type === 'FunctionDeclaration' && /^use[A-Z]/.test(decl.id?.name || '')) hookName = decl.id.name;
    }
  });
  return hookName;
}

// ---- HOC: with[A-Z]...(Component) that returns another function — not any
// function whose name happens to start with "with". ----
function hasHocShape(fn: any): boolean {
  const body = fn.body;
  if (body?.type === 'ArrowFunctionExpression' || body?.type === 'FunctionExpression') return true;
  if (body?.type !== 'BlockStatement') return false;
  return body.body.some((stmt: any) =>
    stmt.type === 'ReturnStatement' &&
    (stmt.argument?.type === 'ArrowFunctionExpression' || stmt.argument?.type === 'FunctionExpression'));
}

function topLevelFunctions(ast: any): { name: string; node: any }[] {
  const out: { name: string; node: any }[] = [];
  for (const stmt of (ast as any).body ?? []) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) out.push({ name: stmt.id.name, node: stmt });
    if (stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) {
        if (d.id?.name && (d.init?.type === 'ArrowFunctionExpression' || d.init?.type === 'FunctionExpression')) {
          out.push({ name: d.id.name, node: d.init });
        }
      }
    }
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      const decl = stmt.declaration;
      if (decl.type === 'FunctionDeclaration' && decl.id?.name) out.push({ name: decl.id.name, node: decl });
      if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (d.id?.name && (d.init?.type === 'ArrowFunctionExpression' || d.init?.type === 'FunctionExpression')) {
            out.push({ name: d.id.name, node: d.init });
          }
        }
      }
    }
  }
  return out;
}

// ---- God Object exclusion: a barrel/re-export file (mostly `export {x}
// from './y'` or one-line pass-through wrappers) isn't a god object no
// matter how many symbols it re-exports. ----
export function isReexportBarrel(file: RuleFile): boolean {
  const ast = tryParse(file);
  if (!ast) return false;
  const top = (ast as any).body ?? [];
  if (top.length === 0) return false;
  const qualifying = top.filter((stmt: any) => {
    if (stmt.type === 'ExportNamedDeclaration' && stmt.source) return true;
    if (stmt.type === 'ExportAllDeclaration') return true;
    if (stmt.type === 'ImportDeclaration') return true;
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration') {
      return stmt.declaration.declarations.every((d: any) => {
        const body = d.init?.body;
        return d.init?.type === 'ArrowFunctionExpression' &&
          (body?.type !== 'BlockStatement' || body.body.length <= 1);
      });
    }
    return false;
  });
  return qualifying.length / top.length >= 0.8;
}

export function detectJsPatterns(files: RuleFile[]): PatternMatch[] {
  const singletons: RuleFile[] = [];
  const factories: RuleFile[] = [];
  const observers: RuleFile[] = [];
  const hooks: { file: RuleFile; hookName: string }[] = [];
  const hocs: RuleFile[] = [];

  for (const file of files) {
    const ast = tryParse(file);
    if (!ast) continue;

    if (hasSingletonShape(ast)) singletons.push(file);
    if (findEmitterUsage(ast)) observers.push(file);
    const hookName = findExportedHookName(ast);
    if (hookName) hooks.push({ file, hookName });

    for (const { name, node } of topLevelFunctions(ast)) {
      if (/^create[A-Z]/.test(name) && hasFactoryShape(node)) { factories.push(file); break; }
    }
    for (const { name, node } of topLevelFunctions(ast)) {
      if (/^with[A-Z]/.test(name) && hasHocShape(node)) { hocs.push(file); break; }
    }
  }

  const patterns: PatternMatch[] = [];
  if (singletons.length) patterns.push({ name: 'Singleton', icon: 'lock', desc: 'A class exposing a static getInstance() or static instance field — verified structurally, not by keyword.', severity: 'info', files: singletons.map(f => ({ name: f.name, path: f.path })), metrics: { instances: singletons.length } });
  if (factories.length) patterns.push({ name: 'Factory', icon: 'factory', desc: 'A create*() function that branches to construct more than one concrete type.', severity: 'info', files: factories.map(f => ({ name: f.name, path: f.path })), metrics: { factories: factories.length } });
  if (observers.length) patterns.push({ name: 'Observer/Event', icon: 'eye', desc: 'Subscribes to or emits on a traced EventEmitter/EventTarget instance, not just any object with an .on() method.', severity: 'info', files: observers.map(f => ({ name: f.name, path: f.path })), metrics: { emitters: observers.length } });
  if (hooks.length) patterns.push({ name: 'Custom Hooks', icon: 'hook', desc: 'React hooks for reusable stateful logic, including default-exported hooks.', severity: 'info', files: hooks.map(h => ({ name: h.file.name, path: h.file.path })), metrics: { hooks: hooks.length } });
  if (hocs.length) patterns.push({ name: 'Higher-Order Component', icon: 'spark', desc: 'A with*() function that returns another function/component, not just a name starting with "with".', severity: 'info', files: hocs.map(f => ({ name: f.name, path: f.path })), metrics: { hocs: hocs.length } });
  return patterns;
}

// ---- Secrets: only flags an actual assignment/declaration whose LHS name
// looks credential-like, so documentation text that merely mentions
// "auth = 'demo1234'" inside an unrelated string is never visited — it's
// never itself a VariableDeclarator/AssignmentExpression/Property node. ----
const SECRET_NAME_RE = /password|passwd|secret|token|auth|api[_-]?key/i;
const PLACEHOLDER_RE = /^(your|my|example|xxx+|todo|changeme|change_me|insert|replace|<.*>|\$\{)/i;

function literalText(node: any): string | null {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral') {
    return node.quasis?.map((q: any) => q.value?.raw ?? '').join('') ?? '';
  }
  return null;
}

export function detectJsSecrets(files: RuleFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const file of files) {
    const ast = tryParse(file);
    if (!ast) continue;

    walk(ast, node => {
      let name: string | undefined;
      let value: any;
      let line = 0;
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
        name = node.id.name; value = node.init; line = node.loc?.start?.line ?? 0;
      } else if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier') {
        name = node.left.name; value = node.right; line = node.loc?.start?.line ?? 0;
      } else if (node.type === 'Property' && (node.key?.name || node.key?.value)) {
        name = node.key.name || node.key.value; value = node.value; line = node.loc?.start?.line ?? 0;
      } else {
        return;
      }
      if (!name || !SECRET_NAME_RE.test(name)) return;
      const text = literalText(value);
      if (!text || text.length < 8 || PLACEHOLDER_RE.test(text.trim())) return;

      findings.push({
        severity: 'high',
        title: 'Hardcoded credential',
        file: file.name,
        path: file.path,
        line,
        desc: `"${name}" is assigned a literal value that looks like a credential.`,
        code: text.slice(0, 80),
      });
    });
  }
  return findings;
}

// ---- Duplicate detection, all languages, via @jscpd/core's token-shingle
// matcher instead of a 2-of-N-sample truncated LCS comparison. Deliberately
// avoids @jscpd/core's getDefaultOptions()/getOption() — both call
// process.cwd() unconditionally, which doesn't exist in a browser bundle.
// Genuine copy-paste (the case this exists to catch) keeps most tokens
// identical, so this is not weakened by skipping those helpers — they only
// supply CLI/reporting defaults this call never needs. ----
export interface DuplicateBlock {
  type: 'code';
  fileA: string;
  fileB: string;
  startLineA: number;
  endLineA: number;
  startLineB: number;
  endLineB: number;
  lines: number;
}

function formatFor(name: string): string {
  const ext = (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'tsx', py: 'python', rb: 'ruby', php: 'php',
    java: 'java', go: 'go', cs: 'csharp', css: 'css', scss: 'scss',
    html: 'markup', vue: 'markup',
  };
  return map[ext] || 'javascript';
}

export async function detectDuplicatesViaTokens(
  files: RuleFile[],
  options: { minLines?: number; minTokens?: number } = {},
): Promise<DuplicateBlock[]> {
  const [{ Detector, MemoryStore, mild }, { Tokenizer }] = await Promise.all([
    import('@jscpd/core'),
    import('@jscpd/tokenizer'),
  ]);

  // jscpd's own CLI defaults (minLines:5, minTokens:50) reproduce the exact
  // gap this replaces — the audit's "6-line auth-check helper copy-pasted
  // five times is invisible" case falls below both. These are chosen to
  // actually catch that case: a genuine 5-8 line duplicated function clears
  // ~15-30 tokens after whitespace/punctuation are filtered by `mild` mode.
  const minLines = options.minLines ?? 3;
  const minTokens = options.minTokens ?? 15;
  const detector = new Detector(new Tokenizer(), new MemoryStore(), [], {
    minLines, minTokens, mode: mild, maxLines: 5000, maxSize: '2mb',
  });

  const blocks: DuplicateBlock[] = [];
  const byPath = new Map(files.map(f => [f.path, f]));
  for (const file of files) {
    if (!file.content || file.content.length < 40) continue;
    let clones: any[] = [];
    try {
      clones = await detector.detect(file.path, file.content, formatFor(file.name));
    } catch {
      continue; // one file's tokenizer failure shouldn't abort the whole scan
    }
    for (const clone of clones) {
      const a = clone.duplicationA;
      const b = clone.duplicationB;
      if (!a || !b || a.sourceId === b.sourceId) continue;
      if (!byPath.has(a.sourceId) || !byPath.has(b.sourceId)) continue;
      blocks.push({
        type: 'code',
        fileA: a.sourceId,
        fileB: b.sourceId,
        startLineA: a.start?.line ?? 0,
        endLineA: a.end?.line ?? 0,
        startLineB: b.start?.line ?? 0,
        endLineB: b.end?.line ?? 0,
        lines: (a.end?.line ?? 0) - (a.start?.line ?? 0),
      });
    }
  }
  return blocks;
}

// ============================================================================
// tree-sitter — Python/Ruby/PHP/Java secrets + Python's structural patterns
// ============================================================================
//
// A LanguageLoader is supplied by the caller (parser.ts in each environment),
// not by this module — this file stays environment-agnostic (it never touches
// `fetch`, `require`, or a browser global) and just consumes whatever
// tree-sitter Language object the loader resolves to. Each fork's
// initTreeSitter() is the thing that actually knows how to fetch WASM in a
// browser vs read it off disk in Node.

export type TreeSitterLang = 'python' | 'ruby' | 'php' | 'java';
// Resolves to an already-bound {parser, language, Query} triple, not a bare
// Language — and critically, Query must be THIS SAME triple's Query, not a
// separately-imported copy of web-tree-sitter's Query class. Parser.init()
// only initializes the Emscripten WASM runtime state on the specific module
// instance it was called through; a Query constructed from a different
// dynamically-imported copy of the package throws deep inside its own
// constructor (`Cannot read properties of undefined (reading
// 'lengthBytesUTF8')`) because that copy's runtime was never set up — a
// failure the try/catch below silently swallowed as "0 matches" until this
// was traced. Consuming the fork's own already-bound triple sidesteps the
// whole "which copy of the module" question for parser, language, AND query.
export interface BoundTreeSitterParser { parser: unknown; language: unknown; Query: unknown }
export type LanguageLoader = () => Promise<BoundTreeSitterParser | null>;
export type TreeSitterLoaders = Partial<Record<TreeSitterLang, LanguageLoader>>;

const LANG_BY_EXT: Record<string, TreeSitterLang> = {
  py: 'python', pyw: 'python', pyi: 'python',
  rb: 'ruby',
  php: 'php',
  java: 'java',
};

function languageForFile(file: RuleFile): TreeSitterLang | null {
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  return LANG_BY_EXT[ext] || null;
}

// Caches each language's already-bound {parser, language} pair (from the
// fork's own loader) for the duration of one detection pass — nothing here
// persists across separate detectPatterns/detectSecurity calls.
class TreeSitterSession {
  // No parameter-property shorthand here: this file is loaded server-side via
  // Node's native TypeScript type-STRIPPING (see the import-site comment in
  // server/src/analysis/parser.ts), which erases type syntax but cannot
  // perform real transforms — a parameter property implicitly creates and
  // assigns a class field, which is runtime behavior, not erasable syntax.
  // tsconfig.app.json's erasableSyntaxOnly catches this at typecheck time;
  // an explicit field + constructor assignment is what stripping can handle.
  private loaders: TreeSitterLoaders;
  private bound = new Map<TreeSitterLang, BoundTreeSitterParser | null>();

  constructor(loaders: TreeSitterLoaders) {
    this.loaders = loaders;
  }

  async parserFor(lang: TreeSitterLang): Promise<BoundTreeSitterParser | null> {
    if (this.bound.has(lang)) return this.bound.get(lang) ?? null;
    const loader = this.loaders[lang];
    if (!loader) { this.bound.set(lang, null); return null; }
    try {
      const result = await loader();
      this.bound.set(lang, result);
      return result;
    } catch {
      this.bound.set(lang, null);
      return null;
    }
  }

  async treeFor(file: RuleFile): Promise<{ tree: any; Language: any; lang: TreeSitterLang } | null> {
    const lang = languageForFile(file);
    if (!lang || !file.content) return null;
    const bound = await this.parserFor(lang);
    if (!bound) return null;
    try {
      const tree = (bound.parser as any).parse(file.content);
      // "Language" here bundles the fork's own Query class alongside the
      // language object — every call site below just forwards it straight
      // into queryMatches, which needs both from this exact bound triple.
      // See BoundTreeSitterParser's comment for why they can't be split.
      return tree ? { tree, Language: { language: bound.language, Query: bound.Query }, lang } : null;
    } catch {
      return null;
    }
  }
}

// web-tree-sitter's Query.matches() returns every STRUCTURAL match — it does
// NOT evaluate text predicates like `(#eq? @x "y")` or `(#match? @x "re")`
// itself (confirmed against the installed 0.25.10: predicatesForPattern
// returns real predicate data, but matches() never filters by it). Every
// query in this file relies on those predicates to narrow a structural match
// down to the right one (e.g. "the parameter is literally named
// get_response", not just "a parameter exists") — without evaluating them
// here, every predicate silently passed through as a no-op, so e.g. the
// Django-middleware check matched __init__(self, secret) as readily as
// __init__(self, get_response). This evaluates the subset of operators the
// queries in this file actually use.
function evaluatePredicates(query: any, match: any): boolean {
  const predicates = query.predicatesForPattern(match.patternIndex) as any[];
  for (const predicate of predicates) {
    const values = predicate.operands.map((operand: any) => {
      if (operand.type === 'string') return operand.value;
      const capture = match.captures.find((c: any) => c.name === operand.name);
      return capture ? capture.node.text : undefined;
    });
    if (predicate.operator === 'eq?' && values[0] !== values[1]) return false;
    if (predicate.operator === 'not-eq?' && values[0] === values[1]) return false;
    if (predicate.operator === 'match?' && (values[0] === undefined || !new RegExp(values[1]).test(values[0]))) return false;
    if (predicate.operator === 'not-match?' && values[0] !== undefined && new RegExp(values[1]).test(values[0])) return false;
  }
  return true;
}

async function queryMatches(Language: any, tree: any, source: string): Promise<any[]> {
  try {
    const { language, Query } = Language;
    const query = new Query(language, source);
    return query.matches(tree.rootNode).filter((match: any) => evaluatePredicates(query, match));
  } catch {
    return [];
  }
}

function capture(match: any, name: string): any {
  return match.captures.find((c: any) => c.name === name)?.node ?? null;
}

// Same static-text-extraction idea as the JS/TS path: strip each language's
// interpolation/concatenation syntax down to the literal segments before
// applying the shared length/placeholder heuristic, so `token = "sk-#{x}-live"`
// (Ruby), `$t = "sk-" . $x . "-live"` (PHP), and an f-string (Python) are all
// judged on their non-interpolated portions rather than skipped entirely.
function staticTextFromValueNode(node: any, lang: TreeSitterLang): string {
  const raw = node.text as string;
  if (lang === 'python' && node.type === 'string') {
    return raw.replace(/\{[^{}]*\}/g, '').replace(/^[a-zA-Z]*['"]{1,3}|['"]{1,3}$/g, '');
  }
  if (lang === 'ruby' && node.type === 'string') {
    return raw.replace(/#\{[^{}]*\}/g, '').replace(/^"|"$/g, '');
  }
  if (lang === 'php') {
    // encapsed_string (double-quoted, may interpolate) or a concatenation
    // (binary_expression joined with `.`) — either way, drop the moving
    // parts and keep the literal fragments.
    return raw
      .replace(/\{\$[^}]*\}|\$\w+/g, '')
      .split('.')
      .map(part => part.trim().replace(/^["']|["']$/g, ''))
      .join('');
  }
  return raw.replace(/^["']|["']$/g, '');
}

const TS_SECRET_QUERIES: Record<TreeSitterLang, string> = {
  python: `[
    (assignment left: (identifier) @name right: (_) @value)
    (keyword_argument name: (identifier) @name value: (_) @value)
  ]`,
  ruby: `[
    (assignment left: (identifier) @name right: (_) @value)
    (pair key: (hash_key_symbol) @name value: (_) @value)
  ]`,
  php: `(assignment_expression left: (variable_name) @name right: (_) @value)`,
  java: `(variable_declarator name: (identifier) @name value: (_) @value)`,
};

// Python is deliberately absent here: parser.ts's detectSecurity already has
// dedicated, more specific "Python eval()"/"Python exec()" checks (with
// correct per-call severity) — adding this query for Python would just
// triple-report the same call. Ruby and PHP have no existing eval detection
// anywhere in this pipeline, so their coverage here is net-new, not a dup.
const TS_DANGEROUS_CALL_QUERIES: Partial<Record<TreeSitterLang, string>> = {
  ruby: `(call method: (identifier) @fn (#eq? @fn "eval"))`,
  php: `(function_call_expression function: (name) @fn (#eq? @fn "eval"))`,
};

export async function detectTreeSitterSecrets(files: RuleFile[], loaders: TreeSitterLoaders): Promise<SecurityFinding[]> {
  const session = new TreeSitterSession(loaders);
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    const parsed = await session.treeFor(file);
    if (!parsed) continue;
    const { tree, Language, lang } = parsed;

    for (const match of await queryMatches(Language, tree, TS_SECRET_QUERIES[lang])) {
      const nameNode = capture(match, 'name');
      const valueNode = capture(match, 'value');
      if (!nameNode || !valueNode) continue;
      const name = nameNode.text.replace(/^[$@:]+/, '');
      if (!SECRET_NAME_RE.test(name)) continue;
      const text = staticTextFromValueNode(valueNode, lang);
      if (!text || text.length < 8 || PLACEHOLDER_RE.test(text.trim())) continue;
      findings.push({
        severity: 'high',
        title: 'Hardcoded credential',
        file: file.name,
        path: file.path,
        line: (nameNode.startPosition?.row ?? 0) + 1,
        desc: `"${name}" is assigned a literal value that looks like a credential.`,
        code: valueNode.text.slice(0, 80),
      });
    }

    const dangerousQuery = TS_DANGEROUS_CALL_QUERIES[lang];
    if (dangerousQuery) {
      for (const match of await queryMatches(Language, tree, dangerousQuery)) {
        const fnNode = capture(match, 'fn');
        if (!fnNode) continue;
        findings.push({
          severity: 'medium',
          title: 'Dynamic Code Execution',
          file: file.name,
          path: file.path,
          line: (fnNode.startPosition?.row ?? 0) + 1,
          desc: `${fnNode.text}() executes arbitrary code. Avoid if possible or validate input strictly.`,
          code: fnNode.text,
        });
      }
    }
  }

  return findings;
}

// ---- Python's existing language-specific patterns, AST-verified. Each
// replaces a regex that matched on class/file NAME or a loose substring —
// see the query comments for the concrete structural check that replaces it. ----
export async function detectPythonAstPatterns(files: RuleFile[], loaders: TreeSitterLoaders): Promise<PatternMatch[]> {
  const session = new TreeSitterSession(loaders);
  const pyFiles = files.filter(f => languageForFile(f) === 'python');
  if (!pyFiles.length) return [];

  const dataclasses: RuleFile[] = [];
  const abcFiles: RuleFile[] = [];
  const contextManagers: RuleFile[] = [];
  const mixins: RuleFile[] = [];
  const signals: RuleFile[] = [];
  const middleware: RuleFile[] = [];

  for (const file of pyFiles) {
    const parsed = await session.treeFor(file);
    if (!parsed) continue;
    const { tree, Language } = parsed;

    // @dataclass on a class definition — was: file.content.match(/@dataclass/)
    if ((await queryMatches(Language, tree, `(decorated_definition (decorator (identifier) @dec) definition: (class_definition) (#eq? @dec "dataclass"))`)).length) {
      dataclasses.push(file);
    }

    // Inherits from ABC, or has an @abstractmethod — was: /\bABC\b|@abstractmethod|ABCMeta/
    const inheritsAbc = (await queryMatches(Language, tree, `(class_definition superclasses: (argument_list (identifier) @base) (#match? @base "^(ABC|ABCMeta)$"))`)).length > 0;
    const hasAbstractMethod = (await queryMatches(Language, tree, `(decorated_definition (decorator (identifier) @dec) (#eq? @dec "abstractmethod"))`)).length > 0;
    if (inheritsAbc || hasAbstractMethod) abcFiles.push(file);

    // __enter__/__exit__ defined on a class, or @contextmanager on a function —
    // was: /@contextmanager|def\s+__enter__/
    const hasEnterExit = (await queryMatches(Language, tree, `(function_definition name: (identifier) @m (#eq? @m "__enter__"))`)).length > 0;
    const hasContextManagerDecorator = (await queryMatches(Language, tree, `(decorated_definition (decorator (identifier) @dec) (#eq? @dec "contextmanager"))`)).length > 0;
    if (hasEnterExit || hasContextManagerDecorator) contextManagers.push(file);

    // A class with 2+ base classes — real multiple inheritance, not a class
    // whose name happens to contain "Mixin". Was: /class\s+\w*Mixin\w*/
    const baseMatches = await queryMatches(Language, tree, `(class_definition name: (identifier) @cls superclasses: (argument_list (identifier) @base))`);
    const basesByClass = new Map<string, number>();
    for (const match of baseMatches) {
      const cls = capture(match, 'cls')?.text;
      if (!cls) continue;
      basesByClass.set(cls, (basesByClass.get(cls) ?? 0) + 1);
    }
    if ([...basesByClass.values()].some(count => count >= 2)) mixins.push(file);

    // Signal() instantiation or @receiver(...) decoration — was also matching
    // any bare `.connect(` call, which is too generic to attribute to signals
    // specifically (socket/db connections match it too) and is dropped here.
    const hasSignalInstance = (await queryMatches(Language, tree, `(assignment right: (call function: (identifier) @fn (#eq? @fn "Signal")))`)).length > 0;
    const hasReceiverDecorator = (await queryMatches(Language, tree, `(decorator (call function: (identifier) @dec (#eq? @dec "receiver")))`)).length > 0;
    if (hasSignalInstance || hasReceiverDecorator) signals.push(file);

    // The actual Django middleware protocol: __init__(self, get_response) —
    // was: class name containing "Middleware", or a bare `def middleware(`.
    const hasMiddlewareInit = (await queryMatches(
      Language, tree,
      `(function_definition name: (identifier) @init (#eq? @init "__init__") parameters: (parameters (identifier) @param) (#match? @param "^get_response$"))`,
    )).length > 0;
    if (hasMiddlewareInit) middleware.push(file);
  }

  const patterns: PatternMatch[] = [];
  if (dataclasses.length) patterns.push({ name: 'Dataclasses', icon: 'database', desc: 'Python dataclasses for structured data. Reduces boilerplate for data-holding classes.', severity: 'info', files: dataclasses.map(f => ({ name: f.name, path: f.path })), metrics: { dataclasses: dataclasses.length } });
  if (abcFiles.length) patterns.push({ name: 'Abstract Base Classes', icon: 'layers', desc: 'Python ABCs enforce interface contracts. Ensures subclasses implement required methods.', severity: 'info', files: abcFiles.map(f => ({ name: f.name, path: f.path })), metrics: { abcs: abcFiles.length } });
  if (contextManagers.length) patterns.push({ name: 'Context Managers', icon: 'refresh', desc: 'Python context managers for resource management (with statement). Ensures proper cleanup.', severity: 'info', files: contextManagers.map(f => ({ name: f.name, path: f.path })), metrics: { managers: contextManagers.length } });
  if (mixins.length) patterns.push({ name: 'Mixins', icon: 'puzzle', desc: 'Python classes with multiple inheritance for reusable behavior, verified structurally (2+ base classes), not by name.', severity: 'info', files: mixins.map(f => ({ name: f.name, path: f.path })), metrics: { mixins: mixins.length } });
  if (signals.length) patterns.push({ name: 'Django Signals', icon: 'radio', desc: 'Django signals for decoupled event-driven communication between components.', severity: 'info', files: signals.map(f => ({ name: f.name, path: f.path })), metrics: { signals: signals.length } });
  if (middleware.length) patterns.push({ name: 'Middleware', icon: 'link', desc: 'Django middleware (verified __init__(self, get_response) protocol) for cross-cutting concerns (auth, logging, CORS).', severity: 'info', files: middleware.map(f => ({ name: f.name, path: f.path })), metrics: { middleware: middleware.length } });
  return patterns;
}
