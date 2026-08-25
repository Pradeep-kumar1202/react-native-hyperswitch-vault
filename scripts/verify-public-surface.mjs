#!/usr/bin/env node
/*
 * Root-entry surface drift gate.
 *
 * WHY THIS EXISTS. The package root has two halves that are compiled by different tools and can
 * disagree without either one failing:
 *
 *   src/standalone-entry.mjs  -> Rollup -> dist/{esm,cjs}/index.js   (the RUNTIME values)
 *   src/public.ts             -> tsc    -> dist/types/public.d.ts    (the TYPES)
 *
 * tsc runs with `emitDeclarationOnly`, so nothing in public.ts ever executes. A value exported from
 * public.ts but not from standalone-entry.mjs type-checks perfectly and is `undefined` at runtime;
 * the reverse ships a value no merchant can see. Neither shows up in any other check.
 *
 * This gate reads the two sources and requires their exported VALUE names to be identical, and it
 * additionally requires the runtime namespace object's member names to match the declared one.
 *
 * Type-only exports are deliberately not compared: they exist only in public.ts by definition.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFile = path.join(root, 'src/standalone-entry.mjs');
const typesFile = path.join(root, 'src/public.ts');

const failures = [];
const fail = (msg) => failures.push(msg);
const die = (msg) => {
  console.error(`\n[verify-public-surface] FAIL: ${msg}\n`);
  process.exit(1);
};

const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    die(`cannot read ${path.relative(root, file)}`);
  }
};

/* Strip comments so commented-out examples never count as exports. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const runtimeSource = stripComments(read(runtimeFile));
const typesSource = stripComments(read(typesFile));

/* ── 1. exported value names on each side ─────────────────────────────────── */

const valueExports = (source) => {
  const names = new Set();
  /* `export const X =` and `export declare const X:` */
  for (const m of source.matchAll(/\bexport\s+(?:declare\s+)?const\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  /* `export { a, b as c }` — but never `export type { … }` */
  for (const m of source.matchAll(/\bexport\s+(?!type\b)\{([^}]*)\}/g)) {
    for (const clause of m[1].split(',')) {
      const text = clause.trim();
      if (!text || /^type\s/.test(text)) continue;
      const parts = text.split(/\s+as\s+/);
      names.add((parts[1] ?? parts[0]).trim());
    }
  }
  return names;
};

const runtimeNames = valueExports(runtimeSource);
const typeNames = valueExports(typesSource);

if (runtimeNames.size === 0) die('parsed no value exports from standalone-entry.mjs');
if (typeNames.size === 0) die('parsed no value exports from public.ts');

for (const name of runtimeNames) {
  if (!typeNames.has(name)) {
    fail(
      `\`${name}\` is exported at runtime (standalone-entry.mjs) but has no declaration in ` +
        `public.ts — merchants would get an untyped export`
    );
  }
}
for (const name of typeNames) {
  if (!runtimeNames.has(name)) {
    fail(
      `\`${name}\` is declared in public.ts but is NOT exported at runtime ` +
        `(standalone-entry.mjs) — it would type-check and be \`undefined\` on a device`
    );
  }
}

/* ── 2. the namespace object's members must match on both sides ───────────── */

const runtimeNamespace = runtimeSource.match(
  /export\s+const\s+HyperswitchVault\s*=\s*\{([\s\S]*?)\n\}/
);
const declaredNamespace = typesSource.match(
  /export\s+declare\s+const\s+HyperswitchVault\s*:\s*\{([\s\S]*?)\n\}/
);

if (!runtimeNamespace) fail('no `export const HyperswitchVault = { … }` found in standalone-entry.mjs');
if (!declaredNamespace) fail('no `export declare const HyperswitchVault: { … }` found in public.ts');

if (runtimeNamespace && declaredNamespace) {
  const runtimeMembers = [...runtimeNamespace[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
  const declaredMembers = [...declaredNamespace[1].matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);

  const runtimeSet = new Set(runtimeMembers);
  const declaredSet = new Set(declaredMembers);

  for (const m of runtimeMembers) {
    if (!declaredSet.has(m)) fail(`HyperswitchVault.${m} exists at runtime but is not declared in public.ts`);
  }
  for (const m of declaredMembers) {
    if (!runtimeSet.has(m)) fail(`HyperswitchVault.${m} is declared in public.ts but does not exist at runtime`);
  }

  /*
   * Phase 1 explicitly does not ship the hook. If `useForm` ever appears here, it must be because
   * `useHyperswitchVaultForm` was actually implemented — not because the namespace grew a name that
   * resolves to undefined.
   */
  if (runtimeSet.has('useForm') && !runtimeNames.has('useHyperswitchVaultForm')) {
    fail('HyperswitchVault.useForm exists but `useHyperswitchVaultForm` is not exported');
  }

  console.log('\nroot entry surface');
  console.log(`  value exports          ${[...runtimeNames].sort().join(', ')}`);
  console.log(`  HyperswitchVault.*     ${runtimeMembers.join(', ')}`);
}

/* ── 3. no wrapper components ─────────────────────────────────────────────── */

/*
 * The aliases must be bindings to the same component object. A `forwardRef(...)`, a `function`
 * component or a JSX return in the root entry would mean a wrapper was introduced, which breaks the
 * `===` identity contract in ADR-0002 §3.
 */
for (const [re, what] of [
  [/\bforwardRef\s*\(/, 'a forwardRef(...) call'],
  [/\bcreateElement\s*\(/, 'a React.createElement(...) call'],
  [/\bfunction\s+[A-Z]/, 'a function component declaration'],
  [/=>\s*</, 'JSX returned from an arrow function'],
]) {
  if (re.test(runtimeSource)) {
    fail(`standalone-entry.mjs contains ${what} — the root entry must only re-bind components, never wrap them`);
  }
}

if (failures.length) {
  console.error('\n[verify-public-surface] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log('\n[verify-public-surface] OK - runtime and declared root surfaces agree, no wrappers');
