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

/*
 * Two executable entries, each with its own audience: the root is the merchant card form; the
 * `./orchestration` subpath is the host-facing confirm for payment-methods (externally tokenized
 * cards). `verify-public-surface.mjs` keeps the two surfaces disjoint; `verify-merchant-only.mjs`
 * proves the root never re-exports the orchestration function.
 */
const subpaths = Object.keys(pkg.exports ?? {});
const executable = subpaths.filter((s) => s !== './package.json');
check(
  JSON.stringify([...executable].sort()) === JSON.stringify(['.', './host', './orchestration']),
  `the executable exports are the root, ./host and ./orchestration (got: ${executable.join(', ') || 'none'})`
);
check(
  subpaths.includes('./package.json'),
  '`./package.json` is present as the one metadata export'
);
check(
  JSON.stringify([...subpaths].sort()) === JSON.stringify(['.', './host', './orchestration', './package.json']),
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
    JSON.stringify(bundles.sort()) ===
      JSON.stringify([
        'dist/cjs/host.js', 'dist/cjs/index.js', 'dist/cjs/orchestration.js',
        'dist/esm/host.js', 'dist/esm/index.js', 'dist/esm/orchestration.js',
      ]),
    `exactly the three entry files per format would be packed (got: ${bundles.join(', ')})`
  );

  const ALLOWED = [
    /^dist\/(esm|cjs)\/(index|orchestration|host)\.js$/,
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

  /*
   * ── THE CONFIRM-INPUT EXEMPTION ────────────────────────────────────────────
   *
   * `sdkAuthorization` and `paymentMethodData` are forbidden as things the library HANDS OUT, and
   * that is what this list is for. They are also, necessarily, things the host HANDS IN on
   * `confirmPayment()`: the payment-intent credential and the non-card billing data.
   *
   * The exemption is therefore pinned to the one declaration file that describes that input, AND to
   * the exact narrow type each must have. Widening `paymentMethodData` to `JSON`/`any`/an index
   * signature — the actual risk — still fails here, because the exemption checks the type, not just
   * the name.
   */
  const INPUT_DECL = 'VaultFormCoordinator.gen.d.ts';
  /*
   * The live-eligibility config is the SECOND legitimate place a host hands the payment-intent
   * credential in: the library cannot probe an endpoint it has no credential for. It is exempted by
   * file AND by type, exactly like the confirm input, and it is the only other file that may name
   * this member.
   */
  const ELIGIBILITY_DECL = 'VaultFormOptions.gen.d.ts';
  /*
   * ── THE ORCHESTRATION EXEMPTION ────────────────────────────────────────────
   *
   * The `./orchestration` entry (for payment-methods, never merchants — the root exports none of
   * it) HANDS IN a canonical provider-tokenized card: alias stand-ins plus the card's real expiry
   * and PROVIDER-REPORTED masked digits, exactly the backend's `vault_data_card` shape. Those
   * member names are forbidden everywhere else precisely so that this is the only declaration
   * that can carry them; each is pinned to its exact narrow type, so widening any of them to an
   * open map or `any` still fails.
   */
  const ORCHESTRATION_CARD_DECL = 'VaultConfirmBody.gen.d.ts';
  const ORCHESTRATION_INPUT_DECL = 'VaultOrchestration.gen.d.ts';
  const INPUT_EXEMPT = {
    [INPUT_DECL]: {
      sdkAuthorization: /^string$/,
      /* tsc prefixes the imported generated type on emit. */
      paymentMethodData: /^(VaultPaymentMethodData_)?hostPaymentMethodData$/,
    },
    [ELIGIBILITY_DECL]: { sdkAuthorization: /^string$/ },
    [ORCHESTRATION_CARD_DECL]: {
      expiryMonth: /^string$/,
      expiryYear: /^string$/,
      binNumber: /^string$/,
    },
    [ORCHESTRATION_INPUT_DECL]: {
      sdkAuthorization: /^string$/,
      paymentMethodData: /^(VaultPaymentMethodData_)?hostPaymentMethodData$/,
    },
  };
  const isExemptInput = ({ file, name, type }) =>
    INPUT_EXEMPT[file]?.[name]?.test(type.replace(/\s+/g, ''));

  const rawData = declared.filter(
    (d) =>
      !isExemptInput(d) &&
      (RAW_DATA.includes(d.name) ||
        ((d.name === 'cardNumber' || d.name === 'cvc' || d.name === 'expiry') && !isFieldRecord(d.type)))
  );
  check(
    rawData.length === 0,
    `no forbidden raw-data property ships (${rawData.slice(0, 3).map((d) => `${d.file}:${d.name}`).join(', ') || 'none'})`
  );

  /*
   * The exemption must not be vacuous: those inputs really are declared, with those types. The
   * credential arrives in either of two shapes (ADR-0009): the payment-intent `sdkAuthorization`,
   * or the legacy `publishableKey` + `clientSecret` pair — each an optional plain string, and
   * nothing wider.
   */
  const inputDecl = decls.get(INPUT_DECL) ?? '';
  check(
    /sdkAuthorization\?:\s*string/.test(inputDecl),
    'the confirm input declares sdkAuthorization as an optional plain string'
  );
  check(
    /publishableKey\?:\s*string/.test(inputDecl) && /clientSecret\?:\s*string/.test(inputDecl),
    'the confirm input declares the legacy publishableKey + clientSecret pair as optional plain strings'
  );
  check(
    /paymentMethodData\?:\s*(VaultPaymentMethodData_)?hostPaymentMethodData/.test(inputDecl),
    'the confirm input declares paymentMethodData as the narrow host record'
  );
  check(
    !/\[key:\s*string\]/.test(inputDecl),
    'the confirm input has no index signature through which card keys could pass'
  );

  /* The eligibility exemption is likewise not vacuous. */
  const eligibilityDecl = decls.get(ELIGIBILITY_DECL) ?? '';
  check(
    /eligibilityConfig[\s\S]{0,400}?sdkAuthorization\?:\s*string/.test(eligibilityDecl),
    'the eligibility config declares sdkAuthorization as an optional plain string'
  );
  check(
    /eligibilityConfig[\s\S]{0,400}?clientSecret\?:\s*string/.test(eligibilityDecl),
    'the eligibility config declares the legacy clientSecret as an optional plain string'
  );
  /*
   * The whole reason eligibility could move inside the library is that its request body is built
   * there from the PAN the library owns. If the config ever grew a card member, the host would be
   * supplying card data again and the move would have bought nothing.
   */
  check(
    !/eligibilityConfig[\s\S]{0,300}?(cardNumber|card_number|pan|cvc)\s*\??:/.test(eligibilityDecl),
    'the eligibility config names no card member'
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

  /*
   * ── THE TOKEN LIVES IN EXACTLY ONE RESULT ──────────────────────────────────
   *
   * `tokenize()` is allowed to return one, and it is the only operation that may. The payment
   * result must not carry one in any branch — that is the whole point of splitting the two
   * operations, so it is asserted against the published unions rather than trusted.
   */
  const publicDecl = decls.get('public.d.ts') ?? '';

  const unionBody = (name) =>
    new RegExp(`export type ${name} =([\\s\\S]*?)\\n(?=export |declare |$)`).exec(publicDecl)?.[1] ?? '';
  const tokenizeUnion = unionBody('VaultTokenizeResult');
  check(tokenizeUnion.length > 0, 'the published surface declares VaultTokenizeResult');
  const tokenizeSuccess = /status:\s*'success';([^}]*)\}/.exec(tokenizeUnion)?.[1] ?? '';
  const tokenizeMembers = [...tokenizeSuccess.matchAll(/readonly\s+([A-Za-z0-9_]+)/g)]
    .map((m) => m[1])
    .sort();
  check(
    JSON.stringify(tokenizeMembers) === JSON.stringify(['token']),
    `a successful tokenize result carries only the token (got: ${tokenizeMembers.join(', ') || 'nothing'})`
  );

  /* ADR-0010: the payment result is declared on ./host, and NOT on the merchant root. */
  const hostDecl = decls.get('host.d.ts') ?? '';
  const paymentUnion =
    new RegExp(`export type VaultPaymentResult =([\\s\\S]*?)\\n(?=export |declare |$)`).exec(hostDecl)?.[1] ?? '';
  check(paymentUnion.length > 0, 'the published ./host surface declares VaultPaymentResult');
  check(unionBody('VaultPaymentResult').length === 0, 'the merchant root does not declare VaultPaymentResult');
  check(!/confirmPayment\s*\(/.test(publicDecl), 'the merchant root declares no confirmPayment');
  check(!/token/.test(paymentUnion), 'the payment result declares no token in any branch');
  for (const status of ['succeeded', 'processing', 'requires_customer_action', 'failed', 'validation_error', 'not_ready']) {
    check(paymentUnion.includes(`'${status}'`), `the payment result declares the "${status}" branch`);
  }

  /* The generated record backing the payment result must not grow a token either. */
  const resultDecl = decls.get('VaultResult.gen.d.ts') ?? '';
  const paymentRecord = /vaultPaymentResult = \{([\s\S]*?)\}/.exec(resultDecl)?.[1] ?? '';
  check(paymentRecord.length > 0, 'the generated payment record is published');
  check(!/token/.test(paymentRecord), 'the generated payment record has no token member');
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
