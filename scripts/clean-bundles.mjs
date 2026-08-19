#!/usr/bin/env node
/*
 * Removes dist/esm and dist/cjs immediately before Rollup runs.
 *
 * Rollup does not empty its output directory, and content-hashed chunk names change whenever the
 * code changes. Without this, a chunk from an earlier build lingers in dist/ and is packed into the
 * tarball — dead weight at best, and at worst a stale copy of code a reviewer believes was removed.
 *
 * dist/types is left alone: tsc writes it earlier in the same pipeline.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of ['esm', 'cjs']) {
  rmSync(path.join(root, 'dist', dir), { recursive: true, force: true });
}
console.log('[clean-bundles] OK - removed dist/esm and dist/cjs');
