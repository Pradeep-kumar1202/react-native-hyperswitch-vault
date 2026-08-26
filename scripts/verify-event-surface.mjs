#!/usr/bin/env node
/*
 * Published-declaration proof for the merchant STATE EVENTS (ADR-0002 §4, §4a, §5).
 *
 * The runtime half of this proof — that an emitted snapshot really contains no card value — is
 * example/__tests__/fieldEvents.test.tsx, which walks every captured object recursively. This is the
 * other half: that the published TYPE cannot describe one either, checked against the PACKED
 * tarball, and that `/embedded` does not gain the standalone callbacks.
 *
 * A type check alone would not be enough (a field typed `any` would satisfy any assertion), so the
 * consumer compile below carries negative controls and is verified non-vacuous.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync, existsSync } from 'node:fs';
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
const eventsDecl = readFileSync(path.join(declDir, 'VaultPublicState.gen.d.ts'), 'utf8');
const publicDecl = readFileSync(path.join(declDir, 'public.d.ts'), 'utf8');

console.log('\nPacked event declarations (from the tarball)');

check(/cardBrand/.test(eventsDecl), 'the packed tarball publishes the CardBrand union');
check(
  ['visa', 'mastercard', 'americanExpress', 'dinersClub', 'discover', 'jcb', 'cartesBancaires',
   'interac', 'maestro', 'unionPay', 'rupay', 'sodexo', 'bajaj', 'unknown']
    .every((member) => eventsDecl.includes(`"${member}"`)),
  'all fourteen CardBrand members are published, lower-camel as the contract states'
);
check(
  /"empty"/.test(eventsDecl) && /"incomplete"/.test(eventsDecl) && /"complete"/.test(eventsDecl),
  'VaultFieldStatus is the three-member literal union'
);
check(
  ['required', 'invalid_card_number', 'invalid_expiry', 'invalid_cvc'].every((c) => eventsDecl.includes(`"${c}"`)),
  'VaultFieldErrorCode is the four-member literal union'
);
check(!/"expired_card"/.test(eventsDecl), 'expired_card is NOT published (the validator cannot make that distinction)');
check(/"valid"/.test(eventsDecl) && /"invalid"/.test(eventsDecl), 'VaultSessionStatus is the two-member literal union');

/*
 * FORBIDDEN MEMBERS. Checked as declared property names, so a legitimate type NAME that merely
 * contains one of these words cannot mask a real leak.
 */
const declaredProperties = [...eventsDecl.matchAll(/readonly\s+([A-Za-z0-9_]+)\??:/g)].map((m) => m[1]);
const FORBIDDEN = [
  'value', 'rawValue', 'formattedValue', 'cardNumber', 'pan', 'expiryMonth', 'expiryYear',
  'cvc', 'cvv', 'bin', 'last4', 'authorization', 'sessionId', 'paymentMethodSessionId',
  'token', 'nativeEvent', 'target', 'text', 'length',
];
/* `fields.cardNumber` / `fields.cvc` are the state RECORDS on vaultFormFields, not card values. */
const ALLOWED = new Set(['cardNumber', 'cvc']);
const leaked = declaredProperties.filter((p) => FORBIDDEN.includes(p) && !ALLOWED.has(p));
check(leaked.length === 0, `no forbidden property in the event declarations (found: ${leaked.join(', ') || 'none'})`);

const fieldsBlock = /vaultFormFields\s*=\s*\{[^}]*\}/s.exec(eventsDecl)?.[0] ?? '';
check(
  /cardNumber:\s*cardNumberState/.test(fieldsBlock) && /cvc:\s*cvcState/.test(fieldsBlock),
  'the two allowed `cardNumber` / `cvc` members are the state RECORDS, not strings'
);

check(!/\bany\b/.test(eventsDecl), 'no `any` in the event declarations');
/* `"unknown"` is a legitimate CardBrand MEMBER; the forbidden thing is the TS `unknown` type. */
check(
  !/\bunknown\b/.test(eventsDecl.replace(/"unknown"/g, '')),
  'no `unknown` TYPE in the event declarations (the CardBrand member is not that)'
);
check(!/\[key: string\]/.test(eventsDecl), 'no broad index signature in the event declarations');
check(!/:\s*string(?![A-Za-z])/.test(eventsDecl.replace(/message\??:\s*string/g, '')),
  'the only bare `string` in the event declarations is the display `message`');

check(
  /onStateChange\?: \(state: E\) => void/.test(publicDecl),
  'the field component type declares an onStateChange callback'
);
for (const [name, payload] of [['CardNumberField', 'cardNumberState'], ['CardExpiryField', 'expiryState'], ['CardCVCField', 'cvcState']]) {
  check(
    new RegExp(`${name}: VaultStyledFieldComponent<[A-Za-z]+, [A-Za-z]+, ${payload}>`).test(publicDecl),
    `${name} is bound to its own narrowed payload (${payload})`
  );
}
for (const [name, payload] of [['CardNumberWidget', 'cardNumberState'], ['CardExpiryWidget', 'expiryState'], ['CardCVCWidget', 'cvcState']]) {
  check(
    new RegExp(`${name}: VaultStyledFieldComponent<[A-Za-z]+, [A-Za-z]+, ${payload}>`).test(publicDecl),
    `the legacy ${name} spelling carries the identical payload`
  );
}
check(
  /onFormStateChange\?: \(_1: vaultFormState\) => void/.test(publicDecl) ||
    /onFormStateChange/.test(readFileSync(path.join(declDir, 'HyperswitchVaultForm.gen.d.ts'), 'utf8')),
  'the ready-made form declares onFormStateChange with the aggregate payload'
);
check(
  /onFormStateChange/.test(readFileSync(path.join(declDir, 'HyperswitchVaultFormProvider.gen.d.ts'), 'utf8')),
  'the provider (custom layout) declares onFormStateChange too'
);

/* ── /embedded must not gain any of it ─────────────────────────────────────── */

console.log('\n/embedded keeps its own controlled-field contract');
const embeddedDecl = readFileSync(path.join(declDir, 'embedded.d.ts'), 'utf8');
for (const name of ['onStateChange', 'onFormStateChange', 'vaultFormState', 'cardNumberState', 'cardBrand', 'VaultFieldState']) {
  check(!embeddedDecl.includes(name), `/embedded does not expose ${name}`);
}

/* ── Consumer compile, with non-vacuous negative controls ──────────────────── */

console.log('\nConsumer compile against the packed event types');

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
  type CardBrand, type VaultFieldState, type VaultFormState, type VaultCardNumberState,
} from '${PKG}';

/* POSITIVE */
export const a = <CardNumberField placeholder="Card number" onStateChange={(s) => [s.field, s.status, s.focused, s.brand, s.error]} />;
export const b = <CardExpiryField onStateChange={(s) => [s.field, s.status, s.focused, s.error]} />;
export const c = <CardCVCField onStateChange={(s) => [s.field, s.status, s.focused, s.error]} />;
export const d = <HyperswitchVault.CardForm session={{} as never} environment="sandbox"
  onFormStateChange={(s: VaultFormState) => [s.fieldsReady, s.sessionStatus, s.complete, s.submitting, s.canSubmit, s.brand, s.fields.cardNumber.brand]} />;
export const e = (s: VaultFieldState): CardBrand => (s.field === 'cardNumber' ? s.brand : 'unknown');
export const f: VaultFieldState = {} as VaultCardNumberState;

/* NEGATIVE — every one must be an error. On an \`any\`, all of them would pass. */
// @ts-expect-error - no raw value anywhere
export const n1 = <CardNumberField onStateChange={(s) => s.value} />;
// @ts-expect-error - no formatted value
export const n2 = <CardNumberField onStateChange={(s) => s.formattedValue} />;
// @ts-expect-error - no length
export const n3 = <CardNumberField onStateChange={(s) => s.length} />;
// @ts-expect-error - no BIN
export const n4 = <CardNumberField onStateChange={(s) => s.bin} />;
// @ts-expect-error - no last4
export const n5 = <CardNumberField onStateChange={(s) => s.last4} />;
// @ts-expect-error - only the card number carries a brand
export const n6 = <CardExpiryField onStateChange={(s) => s.brand} />;
// @ts-expect-error - no expiry month
export const n7 = <CardExpiryField onStateChange={(s) => s.expiryMonth} />;
// @ts-expect-error - no cvc value
export const n8 = <CardCVCField onStateChange={(s) => s.cvc} />;
// @ts-expect-error - no native event
export const n9 = <CardNumberField onStateChange={(s) => s.nativeEvent} />;
// @ts-expect-error - no token before submit resolves
export const n10 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" onFormStateChange={(s) => s.token} />;
// @ts-expect-error - no authorization
export const n11 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" onFormStateChange={(s) => s.authorization} />;
// @ts-expect-error - no raw value in the aggregate either
export const n12 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" onFormStateChange={(s) => s.fields.cardNumber.value} />;
// @ts-expect-error - the brand union is closed and lower-camel
export const n13: CardBrand = 'Visa';
// @ts-expect-error - status is a closed union, not a broad string
export const n14 = <CardNumberField onStateChange={(s) => { const x: 'nearly' = s.status; return x; }} />;
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
check(!tscFailed, `the packed event types compile a real consumer and reject every leak${tscFailed ? `:\n${tscOutput.split('\n').slice(0, 12).join('\n')}` : ''}`);

writeFileSync(path.join(workspace, 'consumer.tsx'), consumer.replace('// @ts-expect-error - no BIN\n', ''));
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
console.log('\n[verify-event-surface] OK - the published event types carry no card data, and enforce it');
