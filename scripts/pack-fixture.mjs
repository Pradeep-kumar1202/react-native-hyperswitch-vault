#!/usr/bin/env node
/*
 * Packs the library to a UNIQUE path for verification, and cleans it up afterwards.
 *
 * Why unique rather than a fixed `package.tgz` at the repo root:
 *
 *   Package managers cache `file:` tarball dependencies by path, so a rebuilt tarball at the same
 *   path is often served stale — which previously led to bumping the package VERSION purely to
 *   force a refresh. Version numbers are release metadata; using them as a cache-busting device
 *   puts development noise into the published history. A unique path per run removes the reason
 *   entirely: nothing can be cached from a path that has never existed before.
 *
 *   It also removes an ordering dependency between the verification scripts — each one packs its
 *   own artifact instead of relying on another script having left one behind.
 *
 * Nothing is written inside the repository, so there is no `.tgz` to gitignore, clean up or
 * accidentally publish.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const packFixture = ({ quiet = false } = {}) => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-pack-')));
  const tgz = path.join(dir, 'hyperswitch-vault-fixture.tgz');

  execFileSync('yarn', ['pack', '--out', tgz], {
    cwd: root,
    stdio: quiet ? 'ignore' : 'inherit',
  });

  return {
    tgz,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
};
