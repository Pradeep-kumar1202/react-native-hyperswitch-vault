#!/usr/bin/env node
/*
 * Removes dist/types immediately BEFORE tsc emits it.
 *
 * `tsc` overwrites the declarations it still produces, but it does not delete the ones it no
 * longer does. A module removed from src/ therefore leaves its `.d.ts` behind in dist/types
 * forever, and that file is packed into the tarball — so a consumer keeps seeing a type for a
 * surface that no longer exists.
 *
 * This is not hypothetical: after `VaultPublicState` was deleted in the state-emission removal, its
 * stale `VaultPublicState.gen.d.ts` kept shipping, and `verify-event-surface` failed the build for
 * exactly the right reason. Cleaning here is the fix; the gate stays as the proof.
 *
 * Runs before `tsc -p tsconfig.build.json`. The bundle equivalent is `clean-bundles.mjs`, which has
 * to run later because Rollup writes dist/esm and dist/cjs after tsc.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
rmSync(path.join(root, 'dist', 'types'), { recursive: true, force: true });
console.log('[clean-declarations] OK - removed dist/types');
