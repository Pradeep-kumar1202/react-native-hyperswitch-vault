#!/usr/bin/env node
/*
 * The merchant-only contract, proved against a freshly packed tarball.
 *
 * This package renders the card fields, keeps the PAN, expiry and CVC in its own state, confirms
 * the payment-method session itself, and hands the merchant a token. Nothing about that flow lets a
 * merchant supply or receive a card value — and this script is what makes "nothing" checkable
 * rather than asserted.
 *
 * It proves three separate things, and the distinction matters:
 *
 *   1. REACHABILITY — the root is the only entry. `/embedded` and `/vault` do not resolve, and no
 *      physical file for them is shipped. Deep paths into `dist/` are refused by the export map.
 *   2. DECLARATIONS — nothing a merchant can see in TypeScript describes a raw card value, a
 *      controlled field, or the transport's request/response shapes.
 *   3. RUNTIME CONTAINMENT — the confirmation transport still exists inside the merchant bundle,
 *      exactly once, because the form cannot tokenize without it. Its INTERNAL identifiers are not
 *      a leak, and this script deliberately does not treat them as one: what would be a leak is an
 *      importable entry or an exported declaration, and both are checked above.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, existsSync,
} from 'node:fs';
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
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-merchant-only-')));
const nodeModules = path.join(workspace, 'node_modules');
const pkgDir = path.join(nodeModules, PKG);
mkdirSync(pkgDir, { recursive: true });
execFileSync('tar', ['-xzf', fixture.tgz, '-C', pkgDir, '--strip-components', '1'], { stdio: 'ignore' });

for (const dep of ['react', 'react-native', '@types/react', 'typescript', '@react-native']) {
  const source = path.join(root, 'node_modules', dep);
  if (!existsSync(source)) continue;
  const target = path.join(nodeModules, dep);
  mkdirSync(path.dirname(target), { recursive: true });
  execFileSync('ln', ['-s', source, target]);
}
writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ name: 'probe', private: true }));

/* ── 1. Reachability ───────────────────────────────────────────────────────── */

console.log('\nEntry points');

const packed = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const subpaths = Object.keys(packed.exports ?? {});
check(
  JSON.stringify(subpaths.sort()) === JSON.stringify(['.', './package.json']),
  `the export map publishes only the root (got: ${subpaths.join(', ')})`
);

const req = createRequire(path.join(workspace, 'probe.js'));

for (const removed of [`${PKG}/embedded`, `${PKG}/vault`]) {
  let resolved = null;
  try { resolved = req.resolve(removed); } catch { /* expected */ }
  check(resolved === null, `${removed} does not resolve`);
}

for (const deep of [
  `${PKG}/dist/esm/index.js`, `${PKG}/dist/cjs/index.js`, `${PKG}/dist/esm/embedded.js`,
  `${PKG}/dist/esm/vault.js`, `${PKG}/dist/types/public.d.ts`, `${PKG}/src/public.ts`,
  `${PKG}/dist`, `${PKG}/internal`,
]) {
  let resolved = null;
  try { resolved = req.resolve(deep); } catch { /* expected */ }
  check(resolved === null, `deep import ${deep.replace(PKG, '…')} is refused`);
}

console.log('\nShipped files');

const walk = (dir, base = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel];
  });
const files = walk(pkgDir);

for (const gone of ['dist/esm/embedded.js', 'dist/cjs/embedded.js', 'dist/types/embedded.d.ts',
                    'dist/esm/vault.js', 'dist/cjs/vault.js', 'dist/types/vault.d.ts']) {
  check(!files.includes(gone), `no ${gone} is shipped`);
}
check(
  files.filter((f) => /^dist\/(esm|cjs)\/.*\.js$/.test(f) && !f.endsWith('package.json')).length === 2,
  'exactly two runtime bundles ship (one esm, one cjs)'
);

/* ── 2. Declarations ───────────────────────────────────────────────────────── */

console.log('\nPublished declarations carry no card data');

const declDir = path.join(pkgDir, 'dist/types');
const decls = new Map(
  readdirSync(declDir).filter((f) => f.endsWith('.d.ts'))
    .map((f) => [f, readFileSync(path.join(declDir, f), 'utf8')])
);

/*
 * Declared PROPERTY names, not raw substrings. `fields.cardNumber` is a state RECORD on the
 * aggregate snapshot and is allowed by name; a `cardNumber: string` would not be.
 */
const declaredProps = [];
for (const [file, text] of decls) {
  for (const m of text.matchAll(/readonly\s+([A-Za-z0-9_]+)\??:\s*([^;\n]+)/g)) {
    declaredProps.push({ file, name: m[1], type: m[2].trim() });
  }
  for (const m of text.matchAll(/^\s{2,}([A-Za-z0-9_]+)\??:\s*([^;\n]+);/gm)) {
    declaredProps.push({ file, name: m[1], type: m[2].trim() });
  }
}

const FORBIDDEN_PROPS = [
  'value', 'defaultValue', 'onChange', 'onChangeText', 'rawValue', 'formattedValue',
  'pan', 'expiryMonth', 'expiryYear', 'cvv', 'binNumber', 'bin', 'last4', 'last4Digits',
  'paymentMethodData', 'authorization', 'sdkAuthorization', 'sessionId',
  'paymentMethodSessionId', 'nativeEvent', 'target',
];
/*
 * `cardNumber` / `cvc` / `expiry` name per-field RECORDS (state, styles, options). A member of
 * those names typed as anything else — a string, a number — is a card value and fails.
 */
const FIELD_RECORD_TYPES = /State$|Styles$|Options$|state\b|styles\b|options\b/;

/*
 * ── THE CONFIRM-INPUT EXEMPTION ──────────────────────────────────────────────
 *
 * `sdkAuthorization` and `paymentMethodData` are forbidden as things the library HANDS OUT. They
 * are also what the host HANDS IN on `confirmPayment()`: the payment-intent credential and the
 * non-card billing data. The exemption is pinned to that one declaration file AND to the exact
 * narrow type each must carry, so widening `paymentMethodData` to an open map — the actual risk —
 * still fails here.
 */
const INPUT_DECL = 'VaultFormCoordinator.gen.d.ts';
/*
 * The live-eligibility config is the second place a host hands the payment-intent credential IN:
 * the library cannot probe an endpoint it has no credential for. Same treatment — pinned to one
 * file and one exact type.
 */
const ELIGIBILITY_DECL = 'VaultFormOptions.gen.d.ts';
const INPUT_EXEMPT = {
  [INPUT_DECL]: {
    sdkAuthorization: /^string$/,
    paymentMethodData: /^(VaultPaymentMethodData_)?hostPaymentMethodData$/,
  },
  [ELIGIBILITY_DECL]: { sdkAuthorization: /^string$/ },
};
const isExemptInput = ({ file, name, type }) =>
  INPUT_EXEMPT[file]?.[name]?.test(String(type).replace(/\s+/g, ''));

const leaks = declaredProps.filter((d) => {
  if (isExemptInput(d)) return false;
  if (FORBIDDEN_PROPS.includes(d.name)) return true;
  if ((d.name === 'cardNumber' || d.name === 'cvc' || d.name === 'expiry') && !FIELD_RECORD_TYPES.test(d.type)) return true;
  return false;
});
check(
  leaks.length === 0,
  `no forbidden property in any shipped declaration (${leaks.slice(0, 3).map((l) => `${l.file}:${l.name}: ${l.type}`).join(' | ') || 'none'})`
);

const allDecl = [...decls.values()].join('\n');
for (const [label, re] of [
  ['confirmPaymentMethodSession', /confirmPaymentMethodSession/],
  ['transport request types', /confirmRequest|cardDetails|confirmOutcome|vaultConfirmResult|vaultCardMetadata/],
  ['controlled-field types', /numberChange|expiryChange|cvcChange|cardFieldSpec|cardFieldSelection/],
  ['embedded identifiers', /VaultEmbedded|CardCvcField\b|selectCardFields/],
  ['client-core concepts', /schemeAccessory|scanCardCapability|eligibilityState|renderSchemeAccessory/],
  ['react-final-form', /react-final-form|useField|__card_[a-z]+_unbound/],
]) {
  check(!re.test(allDecl), `no ${label} in any shipped declaration`);
}

/* ── 3. The public surface a merchant actually compiles against ────────────── */

console.log('\nMerchant surface');

const publicDecl = decls.get('public.d.ts') ?? '';
check(/widgetHandle/.test(publicDecl), 'the field handle type is published');
const handleDecl = decls.get('HyperswitchVaultFormProvider.gen.d.ts') ?? '';
const handleBody = /widgetHandle = \{([^}]*)\}/s.exec(handleDecl)?.[1] ?? '';
const handleMembers = [...handleBody.matchAll(/readonly\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort();
check(
  JSON.stringify(handleMembers) === JSON.stringify(['blur', 'focus']),
  `the field ref is exactly focus and blur (got: ${handleMembers.join(', ')})`
);

/*
 * The token lives in exactly ONE result. `tokenize()` may return one; the payment result must not
 * carry one in any branch — that separation is the point of having two operations.
 */
const unionBody = (name) =>
  new RegExp(`export type ${name} =([\\s\\S]*?)\\n(?=export |declare |$)`).exec(publicDecl)?.[1] ?? '';

const tokenizeUnion = unionBody('VaultTokenizeResult');
check(tokenizeUnion.length > 0, 'the merchant surface publishes VaultTokenizeResult');
const successBody = /status:\s*'success';([^}]*)\}/.exec(tokenizeUnion)?.[1] ?? '';
const successMembers = [...successBody.matchAll(/readonly\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort();
check(
  JSON.stringify(successMembers) === JSON.stringify(['token']),
  `a successful tokenize carries only the token (got: ${successMembers.join(', ') || 'nothing'})`
);

const paymentUnion = unionBody('VaultPaymentResult');
check(paymentUnion.length > 0, 'the merchant surface publishes VaultPaymentResult');
check(!/token/.test(paymentUnion), 'the payment result declares no token in any branch');

const resultDecl = decls.get('VaultResult.gen.d.ts') ?? '';
check(
  !/httpStatus|body|response|request/i.test(/safeVaultError = \{[^}]*\}/s.exec(resultDecl)?.[0] ?? ''),
  'the safe error carries no request or response body'
);

/* ── 4. Runtime containment ────────────────────────────────────────────────── */

console.log('\nInternal transport is present, once, and not callable from outside');

const bundles = ['dist/esm/index.js', 'dist/cjs/index.js']
  .map((f) => [f, readFileSync(path.join(pkgDir, f), 'utf8')]);

for (const [name, code] of bundles) {
  const occurrences = (code.match(/payment-method-sessions/g) ?? []).length;
  check(occurrences >= 1, `${name} contains the confirmation transport (the form needs it)`);
  const confirmFns = (code.match(/function confirmPaymentMethodSession/g) ?? []).length;
  check(confirmFns <= 1, `${name} contains the transport exactly once (found ${confirmFns})`);
  /* It must not be re-exported from the bundle a merchant imports. */
  const exportBlock = code.match(/export\s*\{[^}]*\}/g)?.join('\n') ?? code.match(/exports\.[A-Za-z]+ =/g)?.join('\n') ?? '';
  check(
    !/confirmPaymentMethodSession/.test(exportBlock),
    `${name} does not export confirmPaymentMethodSession`
  );
  check(!/VaultEmbedded|selectCardFields/.test(code), `${name} contains no /embedded code`);
  check(!/react-final-form|__card_cvc_unbound|__card_network_unbound/.test(code), `${name} contains no React Final Form integration`);
}

/* ── 5. A merchant consumer compiles, and the removed surfaces do not ──────── */

console.log('\nConsumer compile against the packed types');

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
  HyperswitchVault, HyperswitchVaultFormProvider,
  CardNumberField, CardExpiryField, CardCVCField, CardholderNameField,
  type VaultFormHandle, type VaultTokenizeResult, type VaultPaymentResult,
} from '${PKG}';

/* POSITIVE — the whole merchant surface still compiles. */
export const ok = (
  <HyperswitchVault.CardForm session={{} as never} environment="sandbox"
    fieldStyles={{cardNumber: {container: {borderWidth: 1}}}}
    layout="stacked" fieldArrangement="separate"
    fieldOptions={{cardNumber: {placeholder: 'Card number', brandIconMode: 'standard'}}} />
);
export const custom = (
  <HyperswitchVaultFormProvider session={{} as never} environment="sandbox">
    <CardholderNameField label="Name on card" />
    <CardNumberField styles={{input: {fontSize: 16}}} placeholder="Card number" brandIconMode="standard" />
    <CardExpiryField labelBehavior="static" label="Expiration date" />
    <CardCVCField cvcIcon="default" errorDisplay="inline" />
  </HyperswitchVaultFormProvider>
);

/* FLOW 1 — tokenize is the one operation that yields a token. */
export const token = async (ref: React.RefObject<VaultFormHandle>) => {
  const result: VaultTokenizeResult | undefined = await ref.current?.tokenize();
  return result?.status === 'success' ? result.token : undefined;
};

/* FLOW 2 — the vault source: tokenize internally, then confirm. Navigation, never a token. */
export const pay = async (ref: React.RefObject<VaultFormHandle>) => {
  const result: VaultPaymentResult = await ref.current!.confirmPayment({
    cardSource: {type_: 'vault', session: {} as never},
    paymentId: 'pay_1', sdkAuthorization: 'intent',
    paymentMethodData: {billing: {email: 'a@b.co'}, nickName: 'Card'},
  });
  return result.status === 'requires_customer_action' ? result.nextAction.type_ : result.status;
};

/* FLOW 3 — the direct source: no session, no token, one request. Same result union. */
export const payDirect = async (ref: React.RefObject<VaultFormHandle>) => {
  const result: VaultPaymentResult = await ref.current!.confirmPayment({
    cardSource: {type_: 'direct'},
    paymentId: 'pay_1', sdkAuthorization: 'intent',
  });
  return result.status;
};

/* NEGATIVE — the removed surfaces must not type-check. */
// @ts-expect-error - /embedded no longer exists
export const n1 = await import('${PKG}/embedded');
// @ts-expect-error - /vault no longer exists
export const n2 = await import('${PKG}/vault');
// @ts-expect-error - no controlled value prop
export const n3 = <CardNumberField value="4242424242424242" />;
// @ts-expect-error - no controlled onChange prop
export const n4 = <CardNumberField onChange={() => {}} />;
// @ts-expect-error - the transport is not exported
export const n5 = HyperswitchVault.confirmPaymentMethodSession;
// @ts-expect-error - state emission was removed
export const n6 = <CardNumberField onStateChange={(s: unknown) => s} />;
// @ts-expect-error - the ambiguous submit() was replaced by tokenize()/confirmPayment()
export const n7 = (ref: React.RefObject<VaultFormHandle>) => ref.current!.submit;
export const n8 = async (ref: React.RefObject<VaultFormHandle>) => {
  const r = await ref.current!.confirmPayment({cardSource: {type_: 'direct'}, paymentId: 'p', sdkAuthorization: 'a'});
  // @ts-expect-error - a payment result never carries a token
  return r.status === 'succeeded' ? r.token : undefined;
};
export const n9 = async (ref: React.RefObject<VaultFormHandle>) => {
  const r = await ref.current!.tokenize();
  // @ts-expect-error - a tokenize success carries the token and nothing else
  return r.status === 'success' ? r.card : undefined;
};
`;
writeFileSync(path.join(workspace, 'consumer.tsx'), consumer);

const tsc = path.join(root, 'node_modules/.bin/tsc');
let tscOut = '';
let tscFailed = false;
try {
  execFileSync(tsc, ['-p', 'tsconfig.json'], { cwd: workspace, stdio: 'pipe', encoding: 'utf8' });
} catch (error) {
  tscFailed = true;
  tscOut = String(error.stdout ?? '') + String(error.stderr ?? '');
}
check(!tscFailed, `the merchant surface compiles and every removed surface is rejected${tscFailed ? `:\n${tscOut.split('\n').slice(0, 12).join('\n')}` : ''}`);

writeFileSync(path.join(workspace, 'consumer.tsx'), consumer.replace('// @ts-expect-error - no controlled value prop\n', ''));
let detects = false;
try { execFileSync(tsc, ['-p', 'tsconfig.json'], { cwd: workspace, stdio: 'pipe' }); } catch { detects = true; }
check(detects, 'the harness is not vacuous: removing one guard makes tsc fail');

fixture.cleanup();
rmSync(workspace, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-merchant-only] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-merchant-only] OK - one entry, no raw card data on the public surface');
