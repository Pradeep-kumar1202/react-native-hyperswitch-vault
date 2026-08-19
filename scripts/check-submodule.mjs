#!/usr/bin/env node
/*
 * Fails the build (and CI) when the hyperswitch-sdk-utils submodule is not checked out at the
 * approved commit. Card validation has exactly one source of truth, so an unnoticed submodule drift
 * would silently change validation behaviour in the published package.
 *
 * The expected commit lives in package.json under `hyperswitch.sdkUtilsCommit`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const expected = pkg?.hyperswitch?.sdkUtilsCommit;
const submodule = path.join(root, 'shared-code');

const fail = (msg) => {
  console.error(`\n[check-submodule] FAIL: ${msg}\n`);
  process.exit(1);
};

if (!expected || !/^[0-9a-f]{40}$/.test(expected)) {
  fail('package.json "hyperswitch.sdkUtilsCommit" is missing or is not a full 40-char SHA.');
}

if (!existsSync(path.join(submodule, 'sdk-utils'))) {
  fail(
    'shared-code/sdk-utils is missing. Run:\n' +
      '  git submodule update --init --recursive'
  );
}

let actual;
try {
  actual = execFileSync('git', ['-C', submodule, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch (e) {
  fail(`could not read the submodule HEAD: ${e.message}`);
}

if (actual !== expected) {
  fail(
    `hyperswitch-sdk-utils is at the wrong commit.\n` +
      `  expected: ${expected}\n` +
      `  actual:   ${actual}\n\n` +
      `Fix with:\n` +
      `  git -C shared-code fetch origin && git -C shared-code checkout ${expected}`
  );
}

/* Refuse to build from a dirty submodule: the published bytes must match the pinned commit. */
const status = execFileSync('git', ['-C', submodule, 'status', '--porcelain'], {
  encoding: 'utf8',
}).trim();
if (status) {
  fail(
    'the sdk-utils submodule working tree is dirty; published validation code would not match ' +
      `the pinned commit.\n${status}`
  );
}

console.log(`[check-submodule] OK - hyperswitch-sdk-utils pinned at ${expected}`);
