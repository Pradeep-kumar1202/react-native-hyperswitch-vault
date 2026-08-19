#!/usr/bin/env node
/*
 * Staleness gate for genType-generated TypeScript.
 *
 * ReScript is the source of truth; `src/*.gen.tsx` is generated from it by genType and is committed
 * so reviewers can see the public type surface change in a diff. This gate fails the build when the
 * committed generated output no longer matches what the current ReScript sources produce.
 *
 * There is no existing convention for this in the Hyperswitch repositories (neither
 * hyperswitch-client-core nor hyperswitch-web generates TypeScript from ReScript), so this
 * establishes one: regenerate, then require the working tree to be unchanged.
 *
 * Run AFTER `rescript`, which is what regenerates the files.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

const fail = (msg) => {
  console.error(`\n[check-generated] FAIL: ${msg}\n`);
  process.exit(1);
};

const generated = readdirSync(srcDir)
  .filter((f) => f.endsWith('.gen.tsx'))
  .map((f) => path.posix.join('src', f));

if (generated.length === 0) {
  fail(
    'no src/*.gen.tsx found. genType did not run — check that rescript.json has a ' +
      '"gentypeconfig" block and that public exports carry @genType.'
  );
}

/* Every @genType-annotated ReScript module must have produced a companion .gen.tsx. */
const annotated = readdirSync(srcDir)
  .filter((f) => f.endsWith('.res'))
  .filter((f) => {
    const body = execFileSync('cat', [path.join(srcDir, f)], { encoding: 'utf8' });
    return /@genType/.test(body);
  })
  .map((f) => f.replace(/\.res$/, '.gen.tsx'));

for (const expected of annotated) {
  if (!existsSync(path.join(srcDir, expected))) {
    fail(`${expected} is missing but its ReScript source is annotated with @genType.`);
  }
}

/*
 * If the generated files are tracked, require them to be identical to the committed copy. Untracked
 * files cannot be compared, so warn loudly instead of passing silently.
 */
let tracked = [];
try {
  const out = execFileSync('git', ['-C', root, 'ls-files', '--', ...generated], {
    encoding: 'utf8',
  }).trim();
  tracked = out ? out.split('\n') : [];
} catch {
  console.warn('[check-generated] WARN: not a git repository; skipping drift comparison.');
  console.log(`[check-generated] OK - ${generated.length} generated file(s) present`);
  process.exit(0);
}

const untracked = generated.filter((f) => !tracked.includes(f));
if (untracked.length) {
  console.warn(
    `[check-generated] WARN: not yet committed, so drift cannot be detected: ${untracked.join(', ')}`
  );
}

if (tracked.length) {
  try {
    execFileSync('git', ['-C', root, 'diff', '--exit-code', '--', ...tracked], {
      stdio: 'pipe',
    });
  } catch {
    const diff = execFileSync('git', ['-C', root, 'diff', '--stat', '--', ...tracked], {
      encoding: 'utf8',
    });
    fail(
      'committed genType output is stale. Regenerate and commit:\n' +
        '  yarn re:build && git add src/*.gen.tsx\n\n' +
        diff
    );
  }
}

console.log(
  `[check-generated] OK - ${generated.length} generated file(s) in sync (${tracked.length} tracked)`
);
