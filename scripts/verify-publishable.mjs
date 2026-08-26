#!/usr/bin/env node
/*
 * The merchant-only boundary, checked on the PUBLICATION PATH.
 *
 * WHY THIS EXISTS SEPARATELY FROM verify-merchant-only.mjs.
 *
 * `verify-merchant-only.mjs` is the stronger proof: it packs the package, installs it, and checks
 * how a real consumer's resolver and `tsc` behave. It cannot run inside `prepack`, because it packs
 * — and `yarn pack` runs `prepack`, so putting it there would recurse forever:
 *
 *     yarn pack -> prepack -> verify-merchant-only -> packFixture -> yarn pack -> prepack -> ...
 *
 * The same is true of `verify-tarball`, `verify-consumers` and `verify-package-contents`: all four
 * go through `scripts/pack-fixture.mjs`, which shells out to `yarn pack`. None of them belongs in
 * `prepack`.
 *
 * So this script asserts the same invariants WITHOUT packing. It reads `package.json`, the built
 * `dist/` that `prepack` has just produced, and — for the file list — `npm pack --dry-run`, which
 * does not execute lifecycle scripts (verified; `--ignore-scripts` is passed anyway so the property
 * does not depend on that staying true).
 *
 * The result: `yarn pack` and `npm publish` both fail if someone restores `/embedded`, `/vault`, a
 * controlled raw-value declaration, a public transport type, or a non-token success result.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

/* ── 1. The export map ─────────────────────────────────────────────────────── */

console.log('Export map');

const subpaths = Object.keys(pkg.exports ?? {});
const executable = subpaths.filter((s) => s !== './package.json');
check(
  JSON.stringify(executable) === JSON.stringify(['.']),
  `the only executable export is the root (got: ${executable.join(', ') || 'none'})`
);
check(
  subpaths.includes('./package.json'),
  '`./package.json` is present as the one metadata export'
);
check(
  JSON.stringify([...subpaths].sort()) === JSON.stringify(['.', './package.json']),
  `no other subpath is published (got: ${subpaths.join(', ')})`
);
for (const gone of ['./embedded', './vault']) {
  check(!subpaths.includes(gone), `${gone} is absent from the export map`);
}
for (const field of ['main', 'module', 'react-native', 'types']) {
  const value = pkg[field];
  if (value === undefined) continue;
  check(
    !/embedded|vault\.js|vault\.d\.ts/.test(value),
    `\`${field}\` does not point at a removed entry (${value})`
  );
}

/* ── 2. What would actually be packed ──────────────────────────────────────── */

console.log('\nFiles that would be packed');

/*
 * `npm pack --dry-run` enumerates the tarball WITHOUT producing one and without running lifecycle
 * scripts, so this is safe to call from inside `prepack`.
 */
let packedFiles = [];
try {
  const out = execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  packedFiles = JSON.parse(out)[0].files.map((f) => f.path);
} catch (error) {
  check(false, `npm pack --dry-run could enumerate the tarball: ${String(error).slice(0, 120)}`);
}

if (packedFiles.length > 0) {
  for (const gone of [
    'dist/esm/embedded.js', 'dist/cjs/embedded.js', 'dist/types/embedded.d.ts',
    'dist/esm/vault.js', 'dist/cjs/vault.js', 'dist/types/vault.d.ts',
  ]) {
    check(!packedFiles.includes(gone), `${gone} would not be packed`);
  }

  const bundles = packedFiles.filter((f) => /^dist\/(esm|cjs)\/[^/]+\.js$/.test(f));
  check(
    JSON.stringify(bundles.sort()) === JSON.stringify(['dist/cjs/index.js', 'dist/esm/index.js']),
    `exactly one runtime bundle per format would be packed (got: ${bundles.join(', ')})`
  );

  const ALLOWED = [
    /^dist\/(esm|cjs)\/index\.js$/,
    /^dist\/(esm|cjs)\/package\.json$/,
    /^dist\/types\/[A-Za-z0-9_.-]+\.d\.ts$/,
    /^dist\/assets\/[A-Za-z0-9@._-]+\.png$/,
    /^(README|THIRD-PARTY-NOTICES)\.md$/,
    /^LICENSE$/,
    /^package\.json$/,
  ];
  const stray = packedFiles.filter((f) => !ALLOWED.some((re) => re.test(f)));
  check(stray.length === 0, `only expected runtime and declaration files would be packed (stray: ${stray.join(', ') || 'none'})`);
}

/* ── 3. The declarations that would ship ───────────────────────────────────── */

console.log('\nPublished declarations');

const declDir = path.join(root, 'dist/types');
if (!existsSync(declDir)) {
  check(false, 'dist/types exists — run the build before this gate');
} else {
  const decls = new Map(
    readdirSync(declDir).filter((f) => f.endsWith('.d.ts'))
      .map((f) => [f, readFileSync(path.join(declDir, f), 'utf8')])
  );

  /* Declared property NAMES, so a state record called `cardNumber` is not confused with a value. */
  const declared = [];
  for (const [file, text] of decls) {
    for (const m of text.matchAll(/readonly\s+([A-Za-z0-9_]+)\??:\s*([^;\n]+)/g)) {
      declared.push({ file, name: m[1], type: m[2].trim() });
    }
    for (const m of text.matchAll(/^\s{2,}([A-Za-z0-9_]+)\??:\s*([^;\n]+);/gm)) {
      declared.push({ file, name: m[1], type: m[2].trim() });
    }
  }

  const CONTROLLED = ['value', 'defaultValue', 'onChange', 'onChangeText'];
  const RAW_DATA = [
    'rawValue', 'formattedValue', 'pan', 'expiryMonth', 'expiryYear', 'cvv', 'binNumber', 'bin',
    'last4', 'last4Digits', 'paymentMethodData', 'authorization', 'sdkAuthorization', 'sessionId',
    'paymentMethodSessionId', 'nativeEvent', 'target',
  ];
  /*
   * `cardNumber` / `cvc` / `expiry` are allowed as MEMBER NAMES only when the member's type is a
   * per-field record — a state snapshot, a style record or an options record. A member of those
   * names typed `string` is a card value and still fails.
   */
  const isFieldRecord = (type) => /State$|Styles$|Options$|state\b|styles\b|options\b/.test(type);

  const controlled = declared.filter(({ name }) => CONTROLLED.includes(name));
  check(
    controlled.length === 0,
    `no controlled value/onChange declaration ships (${controlled.slice(0, 3).map((d) => `${d.file}:${d.name}`).join(', ') || 'none'})`
  );

  const rawData = declared.filter(
    ({ name, type }) =>
      RAW_DATA.includes(name) ||
      ((name === 'cardNumber' || name === 'cvc' || name === 'expiry') && !isFieldRecord(type))
  );
  check(
    rawData.length === 0,
    `no forbidden raw-data property ships (${rawData.slice(0, 3).map((d) => `${d.file}:${d.name}`).join(', ') || 'none'})`
  );

  const all = [...decls.values()].join('\n');
  for (const [label, re] of [
    ['the transport function', /confirmPaymentMethodSession/],
    ['transport request/response types', /confirmRequest|cardDetails|confirmOutcome|vaultConfirmResult|vaultCardMetadata/],
    ['controlled-field payload types', /numberChange|expiryChange|cvcChange|cardFieldSpec|cardFieldSelection/],
    ['removed embedded identifiers', /VaultEmbedded|selectCardFields/],
  ]) {
    check(!re.test(all), `no ${label} in any shipped declaration`);
  }

  /* Success must stay token-only. */
  const result = decls.get('VaultResult.gen.d.ts') ?? '';
  const successBody = /status:\s*"success";([^}]*)\}/s.exec(result)?.[1] ?? '';
  const members = [...successBody.matchAll(/readonly\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort();
  check(
    JSON.stringify(members) === JSON.stringify(['token']),
    `a successful submit result carries only the token (got: ${members.join(', ') || 'nothing'})`
  );
}

/* ── 4. The runtime bundles that would ship ────────────────────────────────── */

console.log('\nRuntime bundles');

for (const rel of ['dist/esm/index.js', 'dist/cjs/index.js']) {
  const full = path.join(root, rel);
  if (!existsSync(full)) {
    check(false, `${rel} exists — run the build before this gate`);
    continue;
  }
  const code = readFileSync(full, 'utf8');
  const exported =
    (code.match(/export\s*\{[^}]*\}/g) ?? []).join('\n') +
    (code.match(/exports\.[A-Za-z0-9_]+\s*=/g) ?? []).join('\n');

  check(
    !/confirmPaymentMethodSession/.test(exported),
    `${rel} does not export the internal transport`
  );
  check(
    /payment-method-sessions/.test(code),
    `${rel} still contains the internal transport (the merchant form needs it)`
  );
  check(!/VaultEmbedded|selectCardFields/.test(code), `${rel} contains no removed /embedded code`);
}

if (failures.length) {
  console.error('\n[verify-publishable] FAIL — refusing to pack or publish');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-publishable] OK - the merchant-only boundary holds for what would be packed');
