#!/usr/bin/env node
/*
 * Published-declaration proof that the merchant state-emission surface carries NO card data
 * (ADR-0005).
 *
 * ── WHAT THIS GATE ASSERTS, AND WHY IT CHANGED SHAPE ───────────────────────────────────────────
 *
 * It has now been all three things:
 *
 *   ADR-0002  the emitted snapshots are correctly typed and card-free
 *   ADR-0003  there is no emission at all — assert ABSENCE
 *   ADR-0005  emission is back, and the payload is pinned MEMBER BY MEMBER
 *
 * The ADR-0003 gate could be satisfied by deleting things. This one cannot: it fails if emission
 * disappears AND it fails if emission grows. That matters, because ADR-0003's real objection was
 * never that the payload was unsafe — it says the opposite in as many words — but that a live
 * callback channel is "widened by the next contributor". An exact-member-set assertion is the
 * answer to that objection: widening the payload is not a judgement call a future contributor makes
 * quietly, it is a red build with this file naming the member they added.
 *
 * Checked against the PACKED tarball, not the working tree, because what a merchant compiles
 * against is the published declaration.
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

/*
 * ── The payload, pinned ──────────────────────────────────────────────────────────────────────
 *
 * Every emitted object type and the EXACT set of members it may declare. Not a forbidden-name
 * denylist: a denylist only catches the leaks somebody already thought of, and `last4` spelled
 * `tail` walks straight through one. An allowlist inverts the burden — anything not listed here
 * fails, so a new member is a deliberate, reviewed edit to this file.
 *
 * `message` is the only member permitted to be a free `string`. It is the localised validation text
 * the customer is already reading on screen. Every other member is a boolean or a closed union, so
 * there is no slot of an open type for a card value to travel in.
 */
const EMITTED_SHAPES = {
  vaultFieldError: ['code', 'message'],
  cardNumberState: ['field', 'status', 'valid', 'touched', 'focused', 'brand', 'isCoBadged', 'eligibility', 'error'],
  expiryState: ['field', 'status', 'valid', 'touched', 'focused', 'error'],
  cvcState: ['field', 'status', 'valid', 'touched', 'focused', 'error'],
  cardholderNameState: ['field', 'status', 'valid', 'touched', 'focused', 'error'],
  vaultFormFields: ['cardNumber', 'expiry', 'cvc', 'cardholderName'],
  vaultFormState: ['fieldsReady', 'sessionStatus', 'complete', 'valid', 'submitting', 'canSubmit', 'brand', 'isCoBadged', 'eligibility', 'networkError', 'fields'],
};

/* The only members allowed to be typed `string`. Anything else of an open type is a leak slot. */
const STRING_MEMBERS_ALLOWED = new Set(['message']);

const publicState = decls.find(([file]) => file === 'VaultPublicState.gen.d.ts');

console.log('\nPacked declarations: the emitted payload is exactly what ADR-0005 describes');

check(Boolean(publicState), 'VaultPublicState.gen.d.ts IS published (emission exists)');

/*
 * Members are read off the declaration text rather than a TypeScript AST because the shape genType
 * emits is fixed and trivially regular: one `readonly name?: type;` per line inside a braced body.
 * A parser dependency would be a heavier thing to trust than the four lines below.
 */
const bodyOf = (text, name) => {
  const m = new RegExp(`export type ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(text);
  return m ? m[1] : null;
};
const membersOf = (body) =>
  [...body.matchAll(/(?:^|\n)\s*readonly\s+([A-Za-z0-9_]+)\??\s*:/g)].map((m) => m[1]);
const memberTypes = (body) =>
  [...body.matchAll(/(?:^|\n)\s*readonly\s+([A-Za-z0-9_]+)\??\s*:\s*([\s\S]*?)(?=;\s*(?:\n\s*readonly|\n?$))/g)]
    .map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]);

if (publicState) {
  const [, text] = publicState;
  for (const [typeName, allowed] of Object.entries(EMITTED_SHAPES)) {
    const body = bodyOf(text, typeName);
    if (!body) {
      check(false, `${typeName} is declared in the published types`);
      continue;
    }
    const found = membersOf(body);
    const extra = found.filter((m) => !allowed.includes(m));
    const missing = allowed.filter((m) => !found.includes(m));
    check(
      extra.length === 0,
      `${typeName} declares no member beyond its allowlist${extra.length ? ` (added: ${extra.join(', ')})` : ''}`
    );
    check(
      missing.length === 0,
      `${typeName} still declares every member merchants rely on${missing.length ? ` (lost: ${missing.join(', ')})` : ''}`
    );

    for (const [member, type] of memberTypes(body)) {
      if (STRING_MEMBERS_ALLOWED.has(member)) continue;
      check(
        type !== 'string',
        `${typeName}.${member} is not an open \`string\` (found: ${type})`
      );
    }
  }
}

/*
 * ── Card vocabulary, banned as a MEMBER name ─────────────────────────────────────────────────
 *
 * The allowlist above already makes these unreachable; this is the second lock, and it is the one
 * that reads as intent to someone skimming the file. `cardNumber` is absent from the list on
 * purpose: it is a legitimate member of `vaultFormFields` and a legitimate `field` discriminant.
 * What must never appear is a member CARRYING the number, which the allowlist and the no-open-string
 * rule between them already forbid.
 */
const BANNED_MEMBERS = [
  'pan', 'bin', 'iin', 'last4', 'lastFour', 'first6', 'firstSix',
  'value', 'rawValue', 'number', 'cvv', 'cvcValue', 'securityCode',
  'expiryMonth', 'expiryYear', 'month', 'year',
  'token', 'paymentMethodToken', 'authorization', 'sdkAuthorization', 'sessionId',
  'length', 'valueLength', 'digits',
];
if (publicState) {
  const [, text] = publicState;
  const declared = [...text.matchAll(/readonly\s+([A-Za-z0-9_]+)\??\s*:/g)].map((m) => m[1]);
  const banned = [...new Set(declared.filter((m) => BANNED_MEMBERS.includes(m)))];
  check(banned.length === 0, `no card-value member name in the emitted types (found: ${banned.join(', ') || 'none'})`);
}

/*
 * ── The callbacks are published ──────────────────────────────────────────────────────────────
 * Absence is a regression now, so it is asserted directly rather than implied by the consumer
 * compile, which could pass for the wrong reason if a prop bag went `any`.
 */
check(/onFormStateChange\??:/.test(allDecl), 'onFormStateChange is published on the form surface');
check(/onStateChange\??:/.test(allDecl), 'onStateChange is published on the field surface');

/*
 * ── And no OTHER callback channel ────────────────────────────────────────────────────────────
 *
 * The ADR-0003 gate forbade every `on*` prop; dropping that check wholesale left the payload
 * allowlist guarding what a callback CARRIES with nothing guarding how many callbacks EXIST. A
 * future `onScanResult?: (r: {digits: string}) => void` on a widget would have satisfied every
 * other assertion in this file. The allowlist now covers the channel as well as the payload, for
 * the same reason: adding one is a deliberate edit here, not a quiet decision in review.
 */
const ALLOWED_ON_PROPS = new Set(['onStateChange', 'onFormStateChange']);
const onProps = [...allDecl.matchAll(/(?<![A-Za-z0-9_])(on[A-Z][A-Za-z0-9_]*)\??:/g)].map((m) => m[1]);
const unexpectedOnProps = [...new Set(onProps.filter((n) => !ALLOWED_ON_PROPS.has(n)))];
check(
  unexpectedOnProps.length === 0,
  `no callback prop beyond the two ADR-0005 names is published (found: ${unexpectedOnProps.join(', ') || 'none'})`
);

/*
 * The denylist deliberately stays scoped to the emitted-state module rather than sweeping every
 * shipped declaration. A repo-wide sweep flags members that are correct where they are: `token` on
 * `VaultTokenizeResult` is Flow 1's entire purpose, `sdkAuthorization` is a host-supplied confirm
 * INPUT, and `number` is a billing phone. Those are inputs and results the merchant already holds —
 * the opposite direction from an emitted snapshot.
 *
 * The channel allowlist above is what closes the gap it would have covered: a future
 * `onScanResult` carrying `{digits}` in some other declaration file cannot be published without
 * failing `unexpectedOnProps` first, which brings the contributor here to extend both lists
 * deliberately. Bounding the channel is what makes bounding the payload sufficient.
 */

/* ── Consumer compile, with non-vacuous negative controls ──────────────────── */

console.log('\nConsumer compile: state is readable, card values are not');

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
import type {
  VaultFormState, VaultCardNumberState, VaultExpiryState, VaultCVCState, VaultFieldState,
} from '${PKG}';

/* POSITIVE — the whole point of ADR-0005: a merchant can drive their own chrome. */
export const a = (
  <CardNumberField
    placeholder="Card number"
    brandIconMode="standard"
    onStateChange={(s: VaultCardNumberState) => {
      const valid: boolean = s.valid;
      const empty: boolean = s.status === 'empty';
      const focused: boolean = s.focused;
      const touched: boolean = s.touched;
      const brand: string = s.brand;
      const reason: string | undefined = s.error?.code;
      return [valid, empty, focused, touched, brand, reason];
    }}
  />
);
export const b = <CardExpiryField onStateChange={(s: VaultExpiryState) => s.valid} />;
export const c = <CardCVCField onStateChange={(s: VaultCVCState) => s.error?.message} />;
export const d = (
  <HyperswitchVault.CardForm
    session={{} as never}
    environment="sandbox"
    onFormStateChange={(s: VaultFormState) => {
      const canSubmit: boolean = s.canSubmit;
      const perField: boolean = s.fields.cvc.valid;
      return canSubmit && perField;
    }}
  />
);
/* The discriminated union narrows, and \`brand\` exists on exactly one branch. */
export function narrow(s: VaultFieldState): string {
  switch (s.field) {
    case 'cardNumber': return s.brand;
    default: return s.status;
  }
}

/* NEGATIVE — every one must be an error. On an \`any\`, all of them would pass. */
declare const num: VaultCardNumberState;
declare const form: VaultFormState;
// @ts-expect-error - no PAN on an emitted snapshot
export const n1 = num.value;
// @ts-expect-error - no BIN on an emitted snapshot
export const n2 = num.bin;
// @ts-expect-error - no last four on an emitted snapshot
export const n3 = num.last4;
// @ts-expect-error - no value length on an emitted snapshot
export const n4 = num.length;
// @ts-expect-error - no CVC value on an emitted snapshot
export const n5 = form.fields.cvc.value;
// @ts-expect-error - no expiry values on an emitted snapshot
export const n6 = form.fields.expiry.expiryMonth;
// @ts-expect-error - no token on an emitted snapshot
export const n7 = form.token;
// @ts-expect-error - \`brand\` is card-number only; it is not on the expiry branch
export const n8 = form.fields.expiry.brand;
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
check(!tscFailed, `the packed types compile a real consumer and reject every card-value read${tscFailed ? `:\n${tscOutput.split('\n').slice(0, 14).join('\n')}` : ''}`);

/*
 * Non-vacuity: removing one guard must make tsc fail. If the snapshot were silently `any`, the
 * @ts-expect-error would be the only thing erroring and this would not detect it.
 */
writeFileSync(path.join(workspace, 'consumer.tsx'), consumer.replace('// @ts-expect-error - no BIN on an emitted snapshot\n', ''));
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
console.log('\n[verify-event-surface] OK - emission is published and carries no card data');
