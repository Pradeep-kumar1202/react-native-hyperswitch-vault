#!/usr/bin/env node
/*
 * Places the packaged PNG artwork at dist/assets/.
 *
 * The bundled entries live at dist/esm/ and dist/cjs/, and the asset specifiers Rollup leaves
 * external are written as `../assets/<name>.png`. Copying the artwork here makes that resolve from
 * either output directory, and keeps dist/ self-contained so the `files` allowlist only has to ship
 * `dist/**`.
 *
 * The @2x/@3x siblings come along with it — React Native's asset pipeline discovers them by name.
 */
import { cpSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'assets');
const to = path.join(root, 'dist/assets');

if (!existsSync(from)) {
  console.error('[copy-assets] FAIL: assets/ is missing. Run `node scripts/generate-icons.mjs`.');
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
/* PNGs only — the source SVGs stay in the repository and never ship. */
cpSync(from, to, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(from, src);
    if (rel === '') return true;
    if (rel === 'source' || rel.startsWith(`source${path.sep}`)) return false;
    return src.endsWith('.png') || !path.extname(src);
  },
});

const copied = readdirSync(to).filter((f) => f.endsWith('.png'));
console.log(`[copy-assets] OK - ${copied.length} PNG files -> dist/assets`);
