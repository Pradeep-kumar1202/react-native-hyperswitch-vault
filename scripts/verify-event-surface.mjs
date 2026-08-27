#!/usr/bin/env node
/*
 * Published-declaration proof that the library has NO merchant state-emission surface
 * (ADR-0003).
 *
 * This gate used to assert the opposite: that the emitted snapshots were correctly typed and
 * card-free. ADR-0003 removes emission entirely — typing, focusing, blurring, validating and brand
 * changes produce zero external callbacks — so the gate now proves ABSENCE, checked against the
 * PACKED tarball rather than the working tree.
 *
 * Absence is checked by EXACT declared-name matching with word boundaries, never a substring
 * search: `brandIconMode` is legitimate configuration and must not be mistaken for an emitted
 * `brand`. The consumer compile below carries negative controls and is verified non-vacuous, because
 * a declaration typed `any` would satisfy any assertion.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packFixture } from './pack-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@juspay-tech/react-native-hyperswitch-vault';

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const fixture = packFixture({ quiet: true });
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-events-')));
const nodeModules = path.join(workspace, 'node_modules');
const pkgDir = path.join(nodeModules, PKG);
mkdirSync(pkgDir, { recursive: true });
execFileSync('tar', ['-xzf', fixture.tgz, '-C', pkgDir, '--strip-components', '1'], { stdio: 'ignore' });

for (const dep of ['react', 'react-native', '@types/react', 'typescript', '@react-native']) {
  const source = path.join(root, 'node_modules', dep);
  if (!existsSync(source)) continue;
  const target = path.join(nodeModules, dep);
  mkdirSync(path.dirname(target), { recursive: true });
  symlinkSync(source, target, 'dir');
}

const declDir = path.join(pkgDir, 'dist/types');
const declFiles = readdirSync(declDir).filter((f) => f.endsWith('.d.ts'));
const decls = declFiles.map((file) => [file, readFileSync(path.join(declDir, file), 'utf8')]);
const allDecl = decls.map(([, text]) => text).join('\n');

console.log('\nPacked declarations: the state-emission surface is gone');

/*
 * ── Removed modules ──────────────────────────────────────────────────────────
 * The two modules that existed only to build and emit merchant state.
 */
for (const gone of ['VaultPublicState.gen.d.ts', 'VaultStateEmitter.gen.d.ts']) {
  check(!declFiles.includes(gone), `${gone} is not published (module deleted)`);
}

/*
 * ── Forbidden IDENTIFIERS, matched exactly ───────────────────────────────────
 * Any declared property, type name, or export with one of these exact names is a regression. The
 * word-boundary regex is what keeps `brandIconMode` legal while `brand` is not.
 */
const FORBIDDEN_NAMES = [
  'onStateChange',
  'onFormStateChange',
  'cardFormState',
  'CardFormState',
  'vaultFormState',
  'VaultFormState',
  'vaultFormFields',
  'VaultFormFields',
  'VaultFieldState',
  'vaultFieldStatus',
  'VaultFieldStatus',
  'vaultFieldError',
  'VaultFieldError',
  'vaultFieldErrorCode',
  'VaultFieldErrorCode',
  'vaultSessionStatus',
  'VaultSessionStatus',
  'cardNumberState',
  'expiryState',
  'cvcState',
  'VaultCardNumberState',
  'VaultExpiryState',
  'VaultCVCState',
  'canSubmit',
  'fieldsReady',
  'sessionStatus',
  'submitting',
  'complete',
  'cardBrand',
  'CardBrand',
  'cardNumberValid',
  'expiryValid',
  'cvcValid',
];

for (const name of FORBIDDEN_NAMES) {
  const hits = decls
    .filter(([, text]) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text))
    .map(([file]) => file);
  check(hits.length === 0, `no \`${name}\` anywhere in the published declarations${hits.length ? ` (found in ${hits.join(', ')})` : ''}`);
}

/*
 * ── `brand` as an emitted member, with the config allowlist ───────────────────
 * `brandIconMode` / `brandIcon` are visual configuration the merchant SETS; they are not state the
 * library emits. Only an exact `brand` property or type name is forbidden.
 */
/*
 * All four spellings name the SAME icon-configuration union — `fieldBrandIconMode` is the import
 * alias `public.ts` gives it, which survives into the emitted declarations. Configuration the
 * merchant SETS is not state the library EMITS, which is the distinction this gate exists to keep.
 */
/*
 * `selectCardBrandLabel` joined this list with the co-badge chooser. It is a LOCALISATION STRING —
 * the heading a merchant puts on the network picker — and it is set, never emitted. The chooser
 * itself publishes nothing: which network the customer picked changes the request the library
 * builds and is not readable through any prop, callback or result. If a `selectedBrand`,
 * `onBrandChange` or `cardBrand` ever appeared here, this gate would still fail, which is what
 * keeps the exception narrow.
 */
const ALLOWED_BRAND_NAMES = new Set([
  'brandIconMode',
  'brandIcon',
  'fieldBrandIconMode',
  'VaultBrandIconMode',
  'VaultFormBrandIconMode',
  'selectCardBrandLabel',
]);
const brandIdentifiers = [...allDecl.matchAll(/(?<![A-Za-z0-9_])(brand[A-Za-z0-9_]*|[A-Za-z0-9_]*Brand[A-Za-z0-9_]*)(?![A-Za-z0-9_])/g)]
  .map((m) => m[1]);
const badBrand = [...new Set(brandIdentifiers.filter((id) => !ALLOWED_BRAND_NAMES.has(id)))];
check(
  badBrand.length === 0,
  `the only brand identifiers published are the icon-config ones (offending: ${badBrand.join(', ') || 'none'})`
);
check(
  allDecl.includes('brandIconMode'),
  'the gate is not trivially satisfied: brandIconMode IS still published (config, not state)'
);

/*
 * ── No emitted-state callback of any shape ───────────────────────────────────
 * A renamed callback would evade the exact-name list above, so also forbid the SHAPE: a declared
 * `on*` property whose single parameter is an object type. The library has no such prop left.
 */
const onProps = [...allDecl.matchAll(/(?<![A-Za-z0-9_])(on[A-Z][A-Za-z0-9_]*)\??:/g)].map((m) => m[1]);
const ALLOWED_ON_PROPS = new Set([]);
const unexpectedOnProps = [...new Set(onProps.filter((p) => !ALLOWED_ON_PROPS.has(p)))];
check(
  unexpectedOnProps.length === 0,
  `no \`on*\` callback prop is published (found: ${unexpectedOnProps.join(', ') || 'none'})`
);

/* ── Consumer compile, with non-vacuous negative controls ──────────────────── */

console.log('\nConsumer compile: emission props are rejected at the type level');

writeFileSync(
  path.join(workspace, 'tsconfig.json'),
  JSON.stringify({
    extends: '@react-native/typescript-config/tsconfig.json',
    compilerOptions: { noEmit: true, jsx: 'react-jsx', types: ['react-native'], skipLibCheck: true },
    include: ['consumer.tsx'],
  }, null, 2)
);

const consumer = `
import * as React from 'react';
import {
  CardNumberField, CardExpiryField, CardCVCField, HyperswitchVault,
} from '${PKG}';

/* POSITIVE — the fields still render with their configuration props. */
export const a = <CardNumberField placeholder="Card number" brandIconMode="standard" />;
export const b = <CardExpiryField placeholder="MM / YY" />;
export const c = <CardCVCField cvcIcon="default" />;
export const d = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" />;

/* NEGATIVE — every one must be an error. On an \`any\`, all of them would pass. */
// @ts-expect-error - per-field state emission is gone
export const n1 = <CardNumberField onStateChange={(s: unknown) => s} />;
// @ts-expect-error - per-field state emission is gone
export const n2 = <CardExpiryField onStateChange={(s: unknown) => s} />;
// @ts-expect-error - per-field state emission is gone
export const n3 = <CardCVCField onStateChange={(s: unknown) => s} />;
// @ts-expect-error - aggregate form state emission is gone
export const n4 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" onFormStateChange={(s: unknown) => s} />;
// @ts-expect-error - the ready-made form has no per-field emission either
export const n5 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" onStateChange={(s: unknown) => s} />;
// @ts-expect-error - the provider (custom layout) has no emission
export const n6 = <HyperswitchVault.Form session={{} as never} environment="sandbox" onFormStateChange={(s: unknown) => s}><CardNumberField /></HyperswitchVault.Form>;
`;
writeFileSync(path.join(workspace, 'consumer.tsx'), consumer);

const tsc = path.join(root, 'node_modules/.bin/tsc');
let tscOutput = '';
let tscFailed = false;
try {
  execFileSync(tsc, ['-p', 'tsconfig.json'], { cwd: workspace, stdio: 'pipe', encoding: 'utf8' });
} catch (error) {
  tscFailed = true;
  tscOutput = String(error.stdout ?? '') + String(error.stderr ?? '');
}
check(!tscFailed, `the packed types compile a real consumer and reject every emission prop${tscFailed ? `:\n${tscOutput.split('\n').slice(0, 12).join('\n')}` : ''}`);

/*
 * Non-vacuity: removing one guard must make tsc fail. If the props were silently accepted (an `any`
 * prop bag, say), the @ts-expect-error would be the only thing erroring and this would not detect it.
 */
writeFileSync(path.join(workspace, 'consumer.tsx'), consumer.replace('// @ts-expect-error - aggregate form state emission is gone\n', ''));
let harnessDetects = false;
try {
  execFileSync(tsc, ['-p', 'tsconfig.json'], { cwd: workspace, stdio: 'pipe' });
} catch {
  harnessDetects = true;
}
check(harnessDetects, 'the harness is not vacuous: removing one guard makes tsc fail');

fixture.cleanup();
rmSync(workspace, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-event-surface] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-event-surface] OK - the library publishes no state-emission surface');
