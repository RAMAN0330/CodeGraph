#!/usr/bin/env node
// Copies tree-sitter's core runtime + the language grammars this app uses
// into public/wasm/ as plain static files. This is the officially documented
// Vite pattern for web-tree-sitter (see its README's "Setup" section) —
// serving the .wasm untouched avoids a bundler transform corrupting its
// Emscripten dynamic-linking metadata (a bundled ?url import produced a
// "need dylink section" runtime error when this was tried instead).
// Runs on `npm install` via package.json's "postinstall" so the binaries
// never need to be committed to the repo.
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public', 'wasm');

// Must match the languages initTreeSitter() in parser.ts knows how to load.
const GRAMMARS = ['python', 'ruby', 'php', 'java'];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const corePath = require.resolve('web-tree-sitter/tree-sitter.wasm');
  await copyFile(corePath, resolve(OUT_DIR, 'tree-sitter.wasm'));

  for (const grammar of GRAMMARS) {
    const source = require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);
    await copyFile(source, resolve(OUT_DIR, `tree-sitter-${grammar}.wasm`));
  }

  console.log(`[copy-tree-sitter-wasm] wrote ${GRAMMARS.length + 1} files to public/wasm/`);
}

main().catch(error => {
  console.error('[copy-tree-sitter-wasm] failed:', error.message);
  process.exit(1);
});
