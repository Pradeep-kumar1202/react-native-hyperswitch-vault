#!/usr/bin/env node
/*
 * Published-declaration proof for the merchant styling boundary.
 *
 * WHY THIS EXISTS. `tsconfig.consumer.json` type-checks `type-tests/` against `dist/types`, which is
 * the BUILT output. That is not the same artifact a merchant installs: the tarball has its own
 * `files` allowlist, and a declaration can reference a module that exists in this repository's
 * node_modules but is never published (an earlier candidate did exactly that — it emitted
 * `import type {Style_t} from 'rescript-react-native/ReactNative.gen'`, a devDependency path that
 * does not resolve for anyone else).
 *
 * So this script proves the styling types against the PACKED TARBALL, extracted into a fixture that
 * has only what a merchant has: react, react-native and typescript. If the declaration depends on
 * anything unpublished, tsc fails here and nowhere else.
 *
 * It asserts four things:
 *   1. the `%identity` coercion of a merchant style exists ONLY in the reviewed bridge module — the
 *      containment the safety argument depends on;
 *   2. the packed `.d.ts` names React Native's own StyleProp/ViewStyle/TextStyle, and contains none
 *      of the forbidden constructs (opaque genType class, any, unknown, broad index signature);
 *   3. a real merchant style compiles against the packed types under the stock React Native
 *      tsconfig;
 *   4. wrong values are REJECTED — without which (2) and (3) could both pass on an `any`.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
  existsSync,
  readdirSync,
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

/* ── 0. Coercion containment (source gate) ────────────────────────────────
 *
 * `%identity` is a zero-runtime TYPE REINTERPRETATION, i.e. a localized unsafe coercion the
 * compiler does not check. The design depends on there being exactly ONE of them for merchant
 * styles, inside the reviewed bridge module, so that the safety argument has a single location to
 * be true about. This gate fails the build the moment that stops holding — for example if a field
 * component grows its own `%identity` shortcut, or reaches around the helpers into `Unsafe.`.
 */
console.log('Coercion containment (src/*.res)');

const BRIDGE = 'CardFieldStyles.res';
const srcDir = path.join(root, 'src');
const resFiles = readdirSync(srcDir).filter((f) => f.endsWith('.res'));

const bridgeSource = readFileSync(path.join(srcDir, BRIDGE), 'utf8');
const styleTypeNames = /(viewStyleProp|textStyleProp|StyleProp|Style\.t)/;

const strayIdentity = [];
const strayUnsafe = [];
for (const file of resFiles) {
  const source = readFileSync(path.join(srcDir, file), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  if (file !== BRIDGE) {
    for (const line of code.split('\n')) {
      if (line.includes('"%identity"') && styleTypeNames.test(line)) strayIdentity.push(`${file}: ${line.trim()}`);
      if (/CardFieldStyles\.Unsafe\b/.test(line)) strayUnsafe.push(`${file}: ${line.trim()}`);
      if (/\b(viewStyleToStyle|textStyleToStyle)\b/.test(line)) strayUnsafe.push(`${file}: ${line.trim()}`);
    }
  }
}

check(
  strayIdentity.length === 0,
  `merchant-style %identity coercion appears only in ${BRIDGE}${strayIdentity.length ? `:\n      ${strayIdentity.join('\n      ')}` : ''}`
);
check(
  strayUnsafe.length === 0,
  `no module outside ${BRIDGE} reaches into the Unsafe coercions${strayUnsafe.length ? `:\n      ${strayUnsafe.join('\n      ')}` : ''}`
);

const bridgeCode = bridgeSource.replace(/\/\*[\s\S]*?\*\//g, '');
const identityCount = (bridgeCode.match(/"%identity"/g) || []).length;
const unsafeBlock = bridgeCode.slice(bridgeCode.indexOf('module Unsafe = {'));
const unsafeEnd = unsafeBlock.indexOf('\n}');
const insideUnsafe = ((unsafeBlock.slice(0, unsafeEnd).match(/"%identity"/g) || []).length);
check(
  identityCount === 4,
  `the bridge declares exactly four coercions - two write, one read, one rebuild (found ${identityCount})`
);
check(
  insideUnsafe === identityCount,
  `every coercion is inside the Unsafe submodule (${insideUnsafe} of ${identityCount})`
);
check(
  /flattenStyleProp/.test(bridgeCode) && /splitAnimatedText/.test(bridgeCode),
  'the read-direction coercion is only reachable behind StyleSheet.flatten, via splitAnimatedText'
);
check(
  /module Unsafe = \{/.test(bridgeCode),
  'both coercions are contained in a single clearly named `Unsafe` submodule'
);
check(
  /Unsafe\.viewStyleToStyle/.test(bridgeCode) && /Unsafe\.textStyleToStyle/.test(bridgeCode),
  'the bridge itself routes every write coercion through `withView` / `withText`'
);

const fixture = packFixture({ quiet: true });
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-stylebridge-')));

const nodeModules = path.join(workspace, 'node_modules');
const pkgDir = path.join(nodeModules, PKG);
mkdirSync(pkgDir, { recursive: true });
execFileSync('tar', ['-xzf', fixture.tgz, '-C', pkgDir, '--strip-components', '1'], { stdio: 'ignore' });

/* Only what a merchant has. Real react-native, for real StyleProp types. */
for (const dep of ['react', 'react-native', '@types/react', 'typescript', '@react-native']) {
  const source = path.join(root, 'node_modules', dep);
  if (!existsSync(source)) continue;
  const target = path.join(nodeModules, dep);
  mkdirSync(path.dirname(target), { recursive: true });
  symlinkSync(source, target, 'dir');
}

/* ── 1. What the packed declarations actually say ─────────────────────────── */

console.log('\nPacked declarations (from the tarball, not from dist/)');

const declDir = path.join(pkgDir, 'dist/types');
const publicDecl = readFileSync(path.join(declDir, 'public.d.ts'), 'utf8');
const stylesDecl = existsSync(path.join(declDir, 'CardFieldStyles.gen.d.ts'))
  ? readFileSync(path.join(declDir, 'CardFieldStyles.gen.d.ts'), 'utf8')
  : '';
const styleTypesDecl = existsSync(path.join(declDir, 'styleTypes.d.ts'))
  ? readFileSync(path.join(declDir, 'styleTypes.d.ts'), 'utf8')
  : '';

check(stylesDecl.length > 0, 'the packed tarball contains CardFieldStyles.gen.d.ts');
check(styleTypesDecl.length > 0, 'the packed tarball contains styleTypes.d.ts');
check(
  /StyleProp<ViewStyle>/.test(styleTypesDecl) && /StyleProp<TextStyle>/.test(styleTypesDecl),
  "the style aliases resolve to React Native's own StyleProp<ViewStyle> / StyleProp<TextStyle>"
);
check(
  /from ['"]react-native['"]/.test(styleTypesDecl),
  'the style types are imported from react-native itself'
);
/* Forbidden constructs, checked across the whole styling declaration path. */
const stylingSurface = stylesDecl + styleTypesDecl;

check(
  /CardNumberField: VaultStyledFieldComponent<fieldStyles,/.test(publicDecl) &&
    /CardCVCField: VaultStyledFieldComponent<fieldStyles,/.test(publicDecl),
  'the card-number and CVC fields declare the full `fieldStyles` slot set'
);
check(
  /CardExpiryField: VaultStyledFieldComponent<expiryStyles,/.test(publicDecl),
  'the expiry field declares the narrower `expiryStyles` slot set'
);
check(
  /accessory\?: viewStyleProp/.test(stylesDecl),
  'the full slot set publishes `accessory`'
);
check(
  !/expiryStyles = \{[^}]*accessory/s.test(stylesDecl),
  'the expiry slot set does NOT publish `accessory` (it renders no such element)'
);
check(
  /formFieldStyles/.test(stylesDecl) && /cardNumber\?:/.test(stylesDecl),
  'the grouped form prop `formFieldStyles` is published with one record per field'
);
check(
  !/helperText/.test(stylesDecl),
  'helperText is not published (no helper-text element is rendered)'
);

check(!/abstract class/.test(stylingSurface), 'no opaque genType handle (`abstract class`) in the styling types');
check(!/\bany\b/.test(stylingSurface), 'no `any` in the styling types');
check(!/\bunknown\b/.test(stylingSurface), 'no `unknown` in the styling types');
check(!/\[key: string\]/.test(stylingSurface), 'no broad index signature in the styling types');
check(
  !/rescript-react-native/.test(stylingSurface),
  'the styling types do not reference the unpublished rescript-react-native package'
);

/* ── 2 & 3. Compile positive and negative cases against the packed types ──── */

console.log('\nConsumer compile against the packed types (stock React Native tsconfig)');

writeFileSync(
  path.join(workspace, 'tsconfig.json'),
  JSON.stringify(
    {
      extends: '@react-native/typescript-config/tsconfig.json',
      compilerOptions: { noEmit: true, jsx: 'react-jsx', types: ['react-native'], skipLibCheck: true },
      include: ['consumer.tsx'],
    },
    null,
    2
  )
);

const consumer = `
import * as React from 'react';
import type {StyleProp, ViewStyle, TextStyle} from 'react-native';
import {StyleSheet} from 'react-native';
import {
  CardNumberField, CardExpiryField, CardCVCField, HyperswitchVault,
  type VaultFieldStyles, type VaultExpiryStyles, type VaultFormFieldStyles,
} from '${PKG}';

/* POSITIVE — a real merchant style compiles. */
const sheet = StyleSheet.create({box: {borderWidth: 3}, text: {fontSize: 22}});
export const styles: VaultFieldStyles = {
  root: {padding: 8},
  container: [sheet.box, {borderColor: '#FF00AA', borderRadius: 12}],
  input: sheet.text,
  placeholder: {color: '#7C3AED'},
  label: {fontWeight: '900'},
  error: {fontSize: 23},
  accessory: {width: 88},
};
export const used = <CardNumberField styles={styles} />;

/* ALL THREE FIELDS accept styles, and the expiry type is the narrower one. */
const expiryStyles: VaultExpiryStyles = {
  root: {padding: 2}, container: {flex: 1}, input: {fontSize: 14},
  placeholder: {color: '#888888'}, label: {color: '#111111'}, error: {color: '#B91C1C'},
};
export const e1 = <CardExpiryField styles={expiryStyles} />;
export const c1 = <CardCVCField styles={styles} />;

/* The ready-made form takes one grouped prop, not flat per-slot props. */
const grouped: VaultFormFieldStyles = {
  cardNumber: {container: {borderColor: '#2563EB'}, accessory: {width: 44}},
  expiry: {container: {flex: 1}},
  cvc: {container: {flex: 1}, accessory: {width: 32}},
};
export const form = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" fieldStyles={grouped} />;

/*
 * TYPOGRAPHY CONTRACT. \`placeholder\` / \`label\` keep the FULL StyleProp<TextStyle>: a narrowed
 * type was measured and rejected (it blocks only inline literals, and a strict variant produces a
 * false positive on a clean TextStyle variable). \`fontSize\` is removed at RUNTIME and used as the
 * animation endpoint instead. Every route below must therefore keep compiling.
 */
const sharedLabel: TextStyle = {color: '#334155', fontSize: 18};
const registeredLabel = StyleSheet.create({lbl: {color: '#334155', fontSize: 18}}).lbl;
const cleanLabel: TextStyle = {color: '#334155', letterSpacing: 2};
export const t1: VaultFieldStyles = {placeholder: {fontSize: 18}};
export const t2: VaultFieldStyles = {placeholder: sharedLabel};
export const t3: VaultFieldStyles = {label: registeredLabel};
export const t4: VaultFieldStyles = {label: [registeredLabel, {fontSize: 11}]};
export const t5: VaultFieldStyles = {placeholder: [[sharedLabel], [null, {letterSpacing: 2}], undefined, false]};
export const t6: VaultFieldStyles = {label: cleanLabel};

/* The slots ARE React Native's StyleProp, in both directions. */
export const a: StyleProp<ViewStyle> | undefined = {} as VaultFieldStyles['container'];
export const b: VaultFieldStyles['container'] = {} as StyleProp<ViewStyle> | undefined;
export const c: StyleProp<TextStyle> | undefined = {} as VaultFieldStyles['input'];
export const d: VaultFieldStyles['input'] = {} as StyleProp<TextStyle> | undefined;

/* NEGATIVE — these must all be errors. If the type were \`any\`, every one would pass. */
// @ts-expect-error - fontSize is not a ViewStyle property
export const n1: VaultFieldStyles = {container: {fontSize: 12}};
// @ts-expect-error - not a style property
export const n2: VaultFieldStyles = {input: {colour: 'red'}};
// @ts-expect-error - borderWidth is a number
export const n3: VaultFieldStyles = {container: {borderWidth: 'thick'}};
// @ts-expect-error - the slot set is closed
export const n4: VaultFieldStyles = {footer: {margin: 1}};
// @ts-expect-error - helperText has no rendered target, so it is not published
export const n5: VaultFieldStyles = {helperText: {fontSize: 10}};
// @ts-expect-error - the field still takes no value prop
export const n6 = <CardNumberField value="4242" />;
// @ts-expect-error - the field still takes no onChangeText
export const n7 = <CardNumberField onChangeText={() => {}} />;
// @ts-expect-error - maxLength stays library-owned
export const n8 = <CardNumberField maxLength={19} />;
// @ts-expect-error - the expiry field renders no accessory element
export const n9: VaultExpiryStyles = {accessory: {width: 40}};
// @ts-expect-error - and the component rejects it too
export const n10 = <CardExpiryField styles={{accessory: {width: 40}}} />;
// @ts-expect-error - the grouped prop inherits the narrower expiry type
export const n11: VaultFormFieldStyles = {expiry: {accessory: {width: 1}}};
// @ts-expect-error - flat per-slot props are deliberately not offered
export const n12 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" expiryInputStyle={{margin: 1}} />;
// @ts-expect-error - CVC still takes no value prop
export const n13 = <CardCVCField value="123" />;
`;
writeFileSync(path.join(workspace, 'consumer.tsx'), consumer);

let tscOutput = '';
let tscFailed = false;
try {
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], {
    cwd: workspace,
    stdio: 'pipe',
    encoding: 'utf8',
  });
} catch (error) {
  tscFailed = true;
  tscOutput = String(error.stdout ?? '') + String(error.stderr ?? '');
}

check(
  !tscFailed,
  `the packed types compile a real merchant style and reject every wrong value${tscFailed ? `:\n${tscOutput.split('\n').slice(0, 12).join('\n')}` : ''}`
);

/*
 * The negative controls are load-bearing: tsc reports an unused @ts-expect-error as an error, so a
 * clean run above means each of n1..n8 really did fail to compile. Prove the harness can fail by
 * removing one directive and requiring tsc to complain.
 */
writeFileSync(
  path.join(workspace, 'consumer.tsx'),
  consumer.replace('// @ts-expect-error - not a style property\n', '')
);
let harnessDetects = false;
try {
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], {
    cwd: workspace,
    stdio: 'pipe',
  });
} catch {
  harnessDetects = true;
}
check(harnessDetects, 'the harness is not vacuous: removing one guard makes tsc fail');

fixture.cleanup();
rmSync(workspace, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-style-bridge] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log('\n[verify-style-bridge] OK - coercion contained; packed styling types are React Native StyleProp, and enforced');
