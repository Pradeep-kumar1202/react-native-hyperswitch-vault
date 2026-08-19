#!/usr/bin/env node
/* Removes bundled output and any stray tarballs. ReScript artifacts are removed by `rescript clean`. */
import { rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
rmSync(path.join(root, 'dist'), { recursive: true, force: true });
for (const f of readdirSync(root)) {
  if (f.endsWith('.tgz')) rmSync(path.join(root, f), { force: true });
}
console.log('[clean] OK - removed dist/ and *.tgz');
