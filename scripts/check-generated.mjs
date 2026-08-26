#!/usr/bin/env node
/*
 * Staleness gate for genType-generated TypeScript.
 *
 * ReScript is the source of truth; `src/*.gen.tsx` is generated from it by genType and is committed
 * so reviewers can see the public type surface change in a diff. This gate fails when the committed
 * generated output no longer matches what the current ReScript sources produce.
 *
 * ── WHY THIS DOES NOT USE GIT ──────────────────────────────────────────────────────────────────
 *
 * The previous version ran `git diff --exit-code` over the generated files. `git diff` with no
 * revision compares the working tree against the INDEX, so `git add src/*.gen.tsx` made the gate
 * pass whether or not the ReScript sources those files came from were being committed at all. That
 * is exactly backwards: staging is a statement of intent, not evidence of correctness, and it let a
 * generated declaration be staged while its untracked `.res` source was not.
 *
 * So there is no git in here any more. The gate hashes the generated files, regenerates them, and
 * hashes them again. Correctness now depends only on what the generator produces from the sources
 * on disk, which is identical in every staging state: both unstaged, both staged, or mixed.
 *
 * ── WHY THE REGENERATION IS A CLEAN ONE ────────────────────────────────────────────────────────
 *
 * `rescript` is incremental and keys off its own build state, not off the emitted `.gen.tsx`.
 * Measured: appending a line to `src/CardIcons.gen.tsx` and running `rescript` leaves the corrupted
 * file exactly as it was — the compiler sees nothing to do. A gate built on a plain `rescript` would
 * therefore pass on hand-edited generated output, which is one of the cases it exists to catch.
 * `rescript clean` first forces every file to be re-emitted. It costs about 3 seconds.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

const fail = (msg) => {
  console.error(`\n[check-generated] FAIL: ${msg}\n`);
  process.exit(1);
};

const GEN = /\.gen\.tsx$/;
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/* name -> sha256, for every generated file currently on disk. */
const snapshot = () => {
  const out = new Map();
  for (const f of readdirSync(srcDir).filter((f) => GEN.test(f)).sort()) {
    out.set(f, hash(path.join(srcDir, f)));
  }
  return out;
};

/* ── 1. Structural checks, before regenerating ──────────────────────────────────────────────── */

const resFiles = readdirSync(srcDir).filter((f) => f.endsWith('.res'));
const annotated = new Set(
  resFiles
    .filter((f) => /@genType/.test(readFileSync(path.join(srcDir, f), 'utf8')))
    .map((f) => f.replace(/\.res$/, '.gen.tsx'))
);

const before = snapshot();

if (before.size === 0) {
  fail(
    'no src/*.gen.tsx found. genType did not run — check that rescript.json has a ' +
      '"gentypeconfig" block and that public exports carry @genType.'
  );
}

/* A generated file whose ReScript source is gone, or is no longer @genType-annotated. */
const orphans = [...before.keys()].filter((g) => !annotated.has(g));
if (orphans.length) {
  fail(
    `orphan generated file(s) with no @genType ReScript source:\n  ${orphans.join('\n  ')}\n\n` +
      'Delete them, or restore the @genType annotation on the source they came from.'
  );
}

/* An annotated source that never produced its companion. */
const missing = [...annotated].filter((g) => !before.has(g));
if (missing.length) {
  fail(
    `missing generated file(s) for @genType-annotated source(s):\n  ${missing.join('\n  ')}\n\n` +
      'Run `yarn re:build`.'
  );
}

/* ── 2. Regenerate from a clean state ───────────────────────────────────────────────────────── */

const run = (args) => {
  try {
    execFileSync(path.join(root, 'node_modules', '.bin', 'rescript'), args, {
      cwd: root,
      stdio: 'pipe',
    });
  } catch (e) {
    fail(`\`rescript ${args.join(' ')}\` failed:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  }
};

run(['clean']);
run([]);

/* ── 3. Compare ─────────────────────────────────────────────────────────────────────────────── */

const after = snapshot();

const added = [...after.keys()].filter((f) => !before.has(f));
const removed = [...before.keys()].filter((f) => !after.has(f));
const changed = [...after.keys()].filter((f) => before.has(f) && before.get(f) !== after.get(f));

if (added.length || removed.length || changed.length) {
  const lines = [
    ...changed.map((f) => `  changed  src/${f}`),
    ...added.map((f) => `  added    src/${f}`),
    ...removed.map((f) => `  removed  src/${f}`),
  ];
  fail(
    'the committed genType output does not match what the ReScript sources produce.\n' +
      'Generation has already written the correct files; commit them:\n\n' +
      `${lines.join('\n')}\n\n` +
      '  git add src/*.gen.tsx\n\n' +
      'A generated declaration must be committed together with the .res source it came from.'
  );
}

console.log(
  `[check-generated] OK - ${after.size} generated file(s) reproduce exactly from source ` +
    `(${annotated.size} @genType module(s))`
);
