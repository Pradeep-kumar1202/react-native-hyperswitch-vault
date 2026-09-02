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
 *   1. REACHABILITY — the root is the merchant's only entry. `/embedded` and `/vault` do not
 *      resolve, and no physical file for them is shipped. `/orchestration` and `/host` resolve —
 *      they are the checkout SDK's entries (ADR-0007, ADR-0010) — and deep paths into `dist/` are
 *      refused by the export map.
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
  JSON.stringify(subpaths.sort()) === JSON.stringify(['.', './host', './orchestration', './package.json']),
  `the export map publishes the root, ./host and ./orchestration only (got: ${subpaths.join(', ')})`
);

const req = createRequire(path.join(workspace, 'probe.js'));

for (const removed of [`${PKG}/embedded`, `${PKG}/vault`]) {
  let resolved = null;
  try { resolved = req.resolve(removed); } catch { /* expected */ }
  check(resolved === null, `${removed} does not resolve`);
}

/*
 * `./orchestration` is the host-facing entry for payment-methods (externally tokenized cards). It
 * must RESOLVE — a subpath in the export map that doesn't is a broken publish — while staying off
 * the merchant surface, which sections 3 and 4 prove.
 */
{
  let resolved = null;
  try { resolved = req.resolve(`${PKG}/orchestration`); } catch { /* checked below */ }
  check(resolved !== null, `${PKG}/orchestration resolves`);
}
for (const deep of [`${PKG}/orchestration/internal`, `${PKG}/dist/esm/orchestration.js`]) {
  let resolved = null;
  try { resolved = req.resolve(deep); } catch { /* expected */ }
  check(resolved === null, `deep import ${deep.replace(PKG, '…')} is refused`);
}

/*
 * `./host` is the checkout SDK's typed view of the SAME components (ADR-0010). It must resolve, its
 * runtime must be a re-export of the root bundle (section 4), and its type vocabulary must stay off
 * the root (section 3).
 */
{
  let resolved = null;
  try { resolved = req.resolve(`${PKG}/host`); } catch { /* checked below */ }
  check(resolved !== null, `${PKG}/host resolves`);
}
for (const deep of [`${PKG}/host/internal`, `${PKG}/dist/esm/host.js`, `${PKG}/dist/types/host.d.ts`, `${PKG}/src/host.ts`]) {
  let resolved = null;
  try { resolved = req.resolve(deep); } catch { /* expected */ }
  check(resolved === null, `deep import ${deep.replace(PKG, '…')} is refused`);
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
{
  const shipped = files.filter((f) => /^dist\/(esm|cjs)\/.*\.js$/.test(f)).sort();
  check(
    JSON.stringify(shipped) ===
      JSON.stringify([
        'dist/cjs/host.js', 'dist/cjs/index.js', 'dist/cjs/orchestration.js',
        'dist/esm/host.js', 'dist/esm/index.js', 'dist/esm/orchestration.js',
      ]),
    `exactly the three entry files ship per format (got: ${shipped.join(', ')})`
  );
}

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
  'paymentMethodData', 'authorization', 'sdkAuthorization', 'clientSecret', 'sessionId',
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
/*
 * ── THE ORCHESTRATION EXEMPTION ──────────────────────────────────────────────
 *
 * The `./orchestration` entry HANDS IN a canonical provider-tokenized card (the backend's
 * `vault_data_card` shape): alias stand-ins, the real expiry, and PROVIDER-REPORTED masked
 * digits. These member names are forbidden everywhere else precisely so that the two orchestration
 * declarations are the only ones that may carry them — each pinned to its exact narrow type, so a
 * widening still fails. The merchant root re-exports none of this (section 1 + the surface gate).
 */
const ORCHESTRATION_CARD_DECL = 'VaultConfirmBody.gen.d.ts';
const ORCHESTRATION_INPUT_DECL = 'VaultOrchestration.gen.d.ts';
/*
 * `clientSecret` is the legacy half of the payment credential (publishable key + client secret),
 * handed IN on the same three declarations and nowhere else — the same treatment as
 * `sdkAuthorization`, and the same exact `string` type so a widening still fails.
 */
const INPUT_EXEMPT = {
  [INPUT_DECL]: {
    sdkAuthorization: /^string$/,
    clientSecret: /^string$/,
    paymentMethodData: /^(VaultPaymentMethodData_)?hostPaymentMethodData$/,
  },
  [ELIGIBILITY_DECL]: { sdkAuthorization: /^string$/, clientSecret: /^string$/ },
  [ORCHESTRATION_CARD_DECL]: {
    expiryMonth: /^string$/,
    expiryYear: /^string$/,
    binNumber: /^string$/,
  },
  [ORCHESTRATION_INPUT_DECL]: {
    sdkAuthorization: /^string$/,
    clientSecret: /^string$/,
    paymentMethodData: /^(VaultPaymentMethodData_)?hostPaymentMethodData$/,
  },
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

/*
 * ── ADR-0010: the payment vocabulary lives on ./host, not on the merchant root ──
 *
 * The same regex runs against both declaration files: the host MUST declare the payment result (and
 * still without a token), the root MUST NOT declare it — nor the operation, the props, the mode or the
 * error codes that only mean something with a confirm input.
 */
const hostDecl = decls.get('host.d.ts') ?? '';
const hostUnionBody = (name) =>
  new RegExp(`export type ${name} =([\\s\\S]*?)\\n(?=export |declare |$)`).exec(hostDecl)?.[1] ?? '';

const paymentUnion = hostUnionBody('VaultPaymentResult');
check(paymentUnion.length > 0, 'the host surface (./host) publishes VaultPaymentResult');
check(!/token/.test(paymentUnion), 'the payment result declares no token in any branch');
check(/confirmPayment\s*\(/.test(hostDecl), 'the host handle declares confirmPayment');

check(unionBody('VaultPaymentResult').length === 0, 'the merchant root does not publish VaultPaymentResult');
check(!/confirmPayment\s*\(/.test(publicDecl), 'the merchant root handle has no confirmPayment');
check(!/VaultPaymentConfirmInput|VaultNextAction|VaultHost[A-Z]|VaultEligibility/.test(publicDecl), 'the merchant root names no confirm-input, next-action, host-data or eligibility type');
check(!/\beligibility\??:/.test(publicDecl), 'the merchant root declares no eligibility member');
check(!/'external'/.test(publicDecl), "the merchant root has no 'external' cardholder-name mode");
check(!/forbidden_card_data|card_not_eligible/.test(publicDecl), 'the merchant root has no confirm-only error code');
{
  const rootCodes = [...(/export type SafeVaultErrorCode =([^;]*);/.exec(publicDecl)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  check(
    JSON.stringify(rootCodes) === JSON.stringify(['invalid_card_data', 'invalid_session', 'not_ready', 'server_error', 'unknown_outcome', 'unsupported_configuration']),
    `the merchant root's SafeVaultErrorCode is exactly the six tokenize codes (got: ${rootCodes.join(', ') || 'none'})`
  );
}

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

/*
 * The host bundles are RE-EXPORTS of the root bundle (ADR-0010), never a second copy of the form. A
 * second copy would mean a second React context, and a field imported from one entry would stop
 * registering with a provider imported from the other. `verify-consumers.mjs` proves the `===`
 * identity at runtime; this checks the shape of the shipped file.
 */
for (const rel of ['dist/esm/host.js', 'dist/cjs/host.js']) {
  const code = readFileSync(path.join(pkgDir, rel), 'utf8');
  check(/['"]\.\/index\.js['"]/.test(code), `${rel} re-exports from ./index.js`);
  check(!/payment-method-sessions|forwardRef|createElement|useReducer/.test(code), `${rel} contains no form code of its own`);
  check(code.length < 2000, `${rel} is a re-export stub (${code.length} bytes)`);
  check(!/HyperswitchVaultForm\b(?!Provider)|HyperswitchVault\b(?!Form)|Widget/.test(code), `${rel} exports no ready-made form, namespace or *Widget alias`);
}

/*
 * The orchestration bundles are a PLAIN FUNCTION surface: no React, no components, and no PMS
 * transport — the external flow has no call 1, its token was minted by the provider. The root
 * bundle above stays self-contained (separate Rollup configuration), so these checks and the ones
 * above cannot interfere.
 */
const orchestrationBundles = ['dist/esm/orchestration.js', 'dist/cjs/orchestration.js']
  .map((f) => [f, readFileSync(path.join(pkgDir, f), 'utf8')]);

for (const [name, code] of orchestrationBundles) {
  check(!/from\s*['"]react['"]|require\(\s*['"]react['"]/.test(code), `${name} imports no React`);
  check(
    !/payment-method-sessions|confirmPaymentMethodSession/.test(code),
    `${name} contains no PMS transport (this flow has no call 1)`
  );
  check(/vault_card/.test(code), `${name} writes the vault_card subtree`);
  const exportBlock =
    code.match(/export\s*\{[^}]*\}/g)?.join('\n') ??
    (code.match(/exports\.[A-Za-z0-9_]+\s*=/g) ?? []).join('\n');
  check(
    /confirmTokenizedCardPayment/.test(exportBlock),
    `${name} exports confirmTokenizedCardPayment`
  );
  const exportedNames = new Set(
    [...exportBlock.matchAll(/(?:exports\.|\b)([A-Za-z0-9_]+)(?:\s*=|\s*\}|,)/g)].map((m) => m[1])
  );
  check(
    ![...exportedNames].some((n) => /^(HyperswitchVault|Card[A-Z])/.test(n)),
    `${name} exports no component — the provider renders the fields in this flow`
  );
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
  type VaultFormHandle, type VaultTokenizeResult,
} from '${PKG}';
import {
  HyperswitchVaultFormProvider as HostProvider, CardNumberField as HostCardNumberField,
  type HostFormHandle, type VaultPaymentResult,
} from '${PKG}/host';

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

/* ADR-0010 — the merchant handle has three operations; the payment one is a ./host member. */
// @ts-expect-error - confirmPayment is not on the merchant root's handle
export const m1 = (ref: React.RefObject<VaultFormHandle>) => ref.current!.confirmPayment;
export const m2 = (
  <HyperswitchVaultFormProvider session={{} as never} environment="sandbox"
    // @ts-expect-error - live eligibility is a ./host prop
    eligibility={{paymentId: 'pay_1', sdkAuthorization: 'intent'}}>
    <CardNumberField />
  </HyperswitchVaultFormProvider>
);
export const m3 = (
  // @ts-expect-error - 'external' is a ./host cardholder-name mode
  <HyperswitchVaultFormProvider session={{} as never} environment="sandbox" cardholderName="external">
    <CardNumberField />
  </HyperswitchVaultFormProvider>
);

/* HOST — the same components with the checkout SDK's contract: eligibility, 'external', confirmPayment. */
export const hostForm = (
  <HostProvider session={{} as never} environment="sandbox" cardholderName="external"
    eligibility={{paymentId: 'pay_1', sdkAuthorization: 'intent'}}
    onFormStateChange={(s) => s.eligibility}>
    <HostCardNumberField onStateChange={(s) => s.eligibility} />
  </HostProvider>
);

/* FLOW 2 — the vault source: tokenize internally, then confirm. Navigation, never a token. */
export const pay = async (ref: React.RefObject<HostFormHandle>) => {
  const result: VaultPaymentResult = await ref.current!.confirmPayment({
    cardSource: {type_: 'vault', session: {} as never},
    paymentId: 'pay_1', sdkAuthorization: 'intent',
    paymentMethodData: {billing: {email: 'a@b.co'}, nickName: 'Card'},
  });
  return result.status === 'requires_customer_action' ? result.nextAction.type_ : result.status;
};

/* FLOW 3 — the direct source: no session, no token, one request. Same result union. */
export const payDirect = async (ref: React.RefObject<HostFormHandle>) => {
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
/*
 * ADR-0005 restored emission, so the callback itself is legitimate now. What must still be rejected
 * is reading a card value off the snapshot it hands you — the boundary the callback was allowed
 * back across.
 */
export const n6ok = <CardNumberField onStateChange={(s) => s.valid} />;
// @ts-expect-error - no card value on an emitted snapshot
export const n6 = <CardNumberField onStateChange={(s) => s.last4} />;
// @ts-expect-error - the ambiguous submit() was replaced by tokenize()/confirmPayment()
export const n7 = (ref: React.RefObject<VaultFormHandle>) => ref.current!.submit;
export const n8 = async (ref: React.RefObject<HostFormHandle>) => {
  const r = await ref.current!.confirmPayment({cardSource: {type_: 'direct'}, paymentId: 'p', sdkAuthorization: 'a'});
  // @ts-expect-error - a payment result never carries a token
  return r.status === 'succeeded' ? r.token : undefined;
};
export const n9 = async (ref: React.RefObject<VaultFormHandle>) => {
  const r = await ref.current!.tokenize();
  // @ts-expect-error - a tokenize success carries the token and nothing else
  return r.status === 'success' ? r.card : undefined;
};

/* ── ORCHESTRATION — its own subpath, its own audience, never the root ── */
import {confirmTokenizedCardPayment, type ProviderTokenizedCard} from '${PKG}/orchestration';

export const orchestrated = async () => {
  const card: ProviderTokenizedCard = {
    cardNumberAlias: 'tok_num', cardCvcAlias: 'tok_cvc',
    expiryMonth: '03', expiryYear: '2030', lastFour: '4242',
  };
  const r = await confirmTokenizedCardPayment({
    tokenizedCard: card, paymentId: 'pay_1', sdkAuthorization: 'intent', environment: 'sandbox',
  });
  return r.status === 'requires_customer_action' ? r.nextAction.type_ : r.status;
};
// @ts-expect-error - the merchant root does not export the orchestration function
export const o1 = HyperswitchVault.confirmTokenizedCardPayment;
// @ts-expect-error - a raw card-number member is not part of the canonical card
export const o2: ProviderTokenizedCard = {cardNumber: '4242424242424242', cardCvcAlias: 'c', expiryMonth: '01', expiryYear: '2030'};
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
console.log('\n[verify-merchant-only] OK - three entries, one audience each, no raw card data on the merchant surface');
