#!/usr/bin/env node
/*
 * Writes the per-directory "type" markers for the dual-package layout.
 *
 * The root package.json has no "type", so Node treats .js as CommonJS by default. These markers
 * tell Node how to read each output directory, which is what lets BOTH formats use the .js
 * extension — required because some consumer bundler configs only allowlist .js.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [dir, type] of [['esm', 'module'], ['cjs', 'commonjs']]) {
  const target = path.join(root, 'dist', dir);
  if (!existsSync(target)) mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, 'package.json'), JSON.stringify({ type }, null, 2) + '\n');
}
console.log('[emit-package-type] OK - wrote dist/esm/package.json and dist/cjs/package.json');
