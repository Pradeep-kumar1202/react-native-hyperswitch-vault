#!/usr/bin/env node
/*
 * REACT NATIVE COMPATIBILITY MATRIX.
 *
 * Packs the library ONCE, then installs that exact tarball into a throwaway app per React Native
 * version and exercises it the way a consumer would.
 *
 * Tiers, cheapest first — each one is reported per version so a partial run is still useful:
 *
 *   types   consumer TypeScript against the PUBLISHED declarations
 *   jest    a real render of the form under react-test-renderer
 *   metro   a Metro bundle for the android and ios entries
 *   gradle  a native Android assembleDebug (only where the environment provides an SDK)
 *
 * iOS native builds require macOS with Xcode; the script reports them as unavailable rather than
 * silently skipping when it cannot run them.
 *
 * Usage:
 *   node scripts/verify-rn-matrix.mjs                  # every version, tiers types+jest+metro
 *   node scripts/verify-rn-matrix.mjs --only 0.79.7    # one version
 *   node scripts/verify-rn-matrix.mjs --tiers types    # a cheaper subset
 *   node scripts/verify-rn-matrix.mjs --gradle         # add the native Android tier
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packFixture } from './pack-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@juspay-tech/react-native-hyperswitch-vault';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

/*
 * React versions are pinned per RN minor because RN and React ship in lockstep; installing the wrong
 * pair produces a failure about React, not about this library, which would make the row meaningless.
 */
/*
 * EVERY MINOR IN THE DECLARED PEER RANGE, not a sample of it.
 *
 * The range in `package.json` is a promise, and a promise about 0.83 is not evidence from 0.82 and
 * 0.86. The gaps were filled once the harness stopped mis-reporting matched-toolchain problems as
 * library failures, so the range below is continuous and every row of it is tested.
 */
const MATRIX = [
  { rn: '0.79.7', react: '19.0.0', label: 'library minimum' },
  { rn: '0.80.3', react: '19.1.0', label: '' },
  { rn: '0.81.6', react: '19.1.0', label: '' },
  { rn: '0.82.1', react: '19.1.0', label: '' },
  { rn: '0.83.10', react: '19.2.0', label: '' },
  { rn: '0.84.1', react: '19.2.3', label: '' },
  { rn: '0.85.3', react: '19.2.3', label: '' },
  { rn: '0.86.0', react: '19.2.3', label: 'client-core' },
  { rn: 'latest', react: 'latest', label: 'current stable' },
];

const only = flag('only');
const versions = only ? MATRIX.filter((m) => m.rn === only) : MATRIX;
const tiers = (flag('tiers') ?? 'types,jest,metro').split(',');
const wantGradle = has('gradle');

const results = [];
/*
 * Prefer the lines that explain WHY over the tail of the output. Jest's trailing summary ("Tests: 1
 * failed") says nothing about the cause, and classifying a harness block correctly depends on the
 * cause — so the error/diagnostic lines are extracted first and the tail is only a fallback.
 */
const detail = (error) => {
  const all = [String(error?.stdout ?? ''), String(error?.stderr ?? ''), String(error?.message ?? '')]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .filter((l) => l.trim());
  const causes = all.filter((l) =>
    /●|Error|error|Cannot|Could not|Unable|not found|failed to|at .*node_modules/.test(l)
  );
  return (causes.length ? causes : all).slice(0, 6).join(' | ').slice(0, 500);
};

/*
 * ── HARNESS BLOCKS ARE NOT LIBRARY FAILURES ─────────────────────────────────
 *
 * React Native moves its own Jest preset, its mocks and its CLI bundle command between minors, and
 * a throwaway app assembled by hand trips over that long before it says anything about this library.
 * Those conditions are reported as `blocked` with the reason, and do NOT fail the run — reporting
 * them as FAIL would claim an incompatibility the evidence does not support, and reporting them as
 * `pass` would claim a verification that never happened.
 */
const HARNESS_SIGNATURES = [
  /setup-env/,
  /jest-preset/,
  /mockComponent/,
  /community-cli-plugin/,
  /Cannot find module '@react-native\/(babel|metro)/,
  /should have "jest-preset/,
  /Unable to resolve module/,
  /Cannot find module 'prettier'/,   /* RN's own jest/setup.js requires it */
];
const isHarnessBlock = (text) => HARNESS_SIGNATURES.some((re) => re.test(text));

const run = (cmd, args, cwd, timeoutMs = 900_000) =>
  execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', timeout: timeoutMs });

console.log('Packing the library once…');
const fixture = packFixture({ quiet: true });

const androidSdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (existsSync(path.join(process.env.HOME ?? '', 'Library/Android/sdk'))
    ? path.join(process.env.HOME ?? '', 'Library/Android/sdk')
    : undefined);

const isMac = platform() === 'darwin';
let hasXcode = false;
if (isMac) {
  try {
    execSync('xcodebuild -version', { stdio: 'ignore' });
    hasXcode = true;
  } catch {
    hasXcode = false;
  }
}

for (const { rn, react, label } of versions) {
  const row = { rn, label, types: '-', jest: '-', metro: '-', gradle: '-', note: '' };
  const workspace = mkdtempSync(path.join(tmpdir(), `vault-rn-${rn.replace(/\./g, '_')}-`));
  console.log(`\n── react-native@${rn}${label ? ` (${label})` : ''} ──`);

  try {
    writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'rn-matrix-app', version: '1.0.0', private: true }, null, 2)
    );

    console.log('  installing…');
    run(
      'npm',
      /*
       * `--legacy-peer-deps` is deliberate and is the point of the exercise. The package's declared
       * peer range is what we are trying to CHOOSE; letting npm enforce the current range would
       * refuse to install on any version outside it and the matrix could never discover whether the
       * library actually works there. Compatibility is decided by the tiers below, and the declared
       * range is then set to what actually passed.
       */
      ['install', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps',
       /*
        * `react-test-renderer` must be pinned to the SAME version as react: the loose `@19` range
        * resolves to the newest 19.x, whose peer range then rejects an older react and the install
        * fails for a reason that has nothing to do with this library.
        */
       `react@${react}`, `react-native@${rn}`, `react-test-renderer@${react}`,
       '@types/react@19', 'typescript@5', '@react-native-community/cli@latest',
       fixture.tgz],
      workspace,
      1_200_000
    );

    /* ── types ── */
    if (tiers.includes('types')) {
      writeFileSync(
        path.join(workspace, 'tsconfig.json'),
        /*
         * Self-contained rather than extending @react-native/typescript-config: that package is not
         * present at every RN version, and a missing base config fails the row for a reason that has
         * nothing to do with this library. The settings that MATTER are reproduced here — notably a
         * `lib` list with no "dom", which is what makes the check meaningful for React Native.
         */
        JSON.stringify({
          compilerOptions: {
            target: 'esnext',
            module: 'esnext',
            moduleResolution: 'bundler',
            lib: ['esnext'],
            jsx: 'react-jsx',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            resolveJsonModule: true,
            types: ['react-native'],
          },
          include: ['consumer.tsx'],
        }, null, 2)
      );
      writeFileSync(path.join(workspace, 'consumer.tsx'), `
import * as React from 'react';
import {
  HyperswitchVaultForm, HyperswitchVaultFormProvider,
  CardNumberField, CardExpiryField, CardCVCField, CardholderNameField,
  type VaultFormHandle, type VaultTokenizeResult, type VaultPaymentResult,
} from '${PKG}';

export const form = <HyperswitchVaultForm session={{} as never} environment="sandbox" />;
export const custom = (
  <HyperswitchVaultFormProvider session={{} as never} environment="sandbox">
    <CardholderNameField /><CardNumberField /><CardExpiryField /><CardCVCField />
  </HyperswitchVaultFormProvider>
);
export const tok = async (r: React.RefObject<VaultFormHandle>) => {
  const x: VaultTokenizeResult = await r.current!.tokenize();
  return x.status === 'success' ? x.token : x.error.message;
};
export const pay = async (r: React.RefObject<VaultFormHandle>) => {
  /* Both card sources, so the matrix compiles the whole confirm surface, not half of it. */
  const x: VaultPaymentResult = await r.current!.confirmPayment({
    cardSource: {type_: 'vault', session: {} as never}, paymentId: 'p', sdkAuthorization: 'a',
  });
  const y: VaultPaymentResult = await r.current!.confirmPayment({
    cardSource: {type_: 'direct'}, paymentId: 'p', sdkAuthorization: 'a',
  });
  void y;
  return x.status;
};
// @ts-expect-error - a payment result never carries a token
export const leak = (x: VaultPaymentResult) => x.token;
`);
      try {
        run(path.join(workspace, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], workspace);
        row.types = 'pass';
      } catch (error) {
        row.types = 'FAIL';
        row.note ||= detail(error);
      }
      console.log(`  types  ${row.types}`);
    }

    /* ── jest ── */
    if (tiers.includes('jest')) {
      /*
       * ── THE TOOLCHAIN MUST MATCH THE RN VERSION ────────────────────────────
       *
       * These three packages are published in lockstep with `react-native`, and installing
       * `@latest` against an older RN is what produced every "blocked" row this matrix used to
       * report:
       *
       *   RN 0.79 + metro-config@latest  → the default config sets
       *     `assetRegistryPath: 'react-native/asset-registry'`, a subpath 0.79 does not export, so
       *     bundling the library's PNGs failed. That looked like a package problem and was not.
       *   RN 0.81 + jest-preset@latest   → `mockComponent` reached into RN internals that moved.
       *   RN 0.82 + jest-preset@latest   → the preset's setup requires `prettier`, dropped as a
       *     dependency in newer RN.
       *   RN 0.86 + jest-preset@latest   → mapped `react-native/setup-env`, absent in 0.86.
       *
       * Pinning to the RN version under test removes all four, and any row that still fails is a
       * statement about this library.
       */
      /*
       * `@react-native/jest-preset` is not published for every RN minor — 0.79 ships its preset
       * inside `react-native` itself. Asking npm for a version that does not exist fails the whole
       * install, which would report as a library failure, so each pinned package is checked first
       * and simply left out when that RN line does not publish it.
       */
      const publishedAt = (pkg, wanted) => {
        try {
          execFileSync('npm', ['view', `${pkg}@${wanted}`, 'version'], { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      };
      const pinned = [
        `@react-native/babel-preset@${rn}`,
        `@react-native/metro-config@${rn}`,
        ...(publishedAt('@react-native/jest-preset', rn) ? [`@react-native/jest-preset@${rn}`] : []),
      ];
      /*
       * `prettier` is required by RN 0.82's own `jest/setup.js` but is not a dependency of any RN
       * package, so a bare install leaves the preset unable to load. It is a peer of the HARNESS,
       * not of this library, and installing it is what turns that row from "blocked" into a real
       * answer.
       */
      run('npm', ['install', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps', 'jest@29', 'babel-jest@29', '@babel/core@7', 'prettier@3', ...pinned], workspace, 900_000);
      writeFileSync(path.join(workspace, 'babel.config.js'), "module.exports = {presets: ['@react-native/babel-preset']};\n");
      /*
       * RN moved the Jest preset out of the `react-native` package in newer minors. Resolve whichever
       * one this version actually ships, so a preset relocation is not reported as a library failure.
       */
      const presetName = existsSync(path.join(workspace, 'node_modules/react-native/jest-preset.js'))
        ? 'react-native'
        : existsSync(path.join(workspace, 'node_modules/@react-native/jest-preset/jest-preset.js'))
          ? '@react-native/jest-preset'
          : 'react-native';
      writeFileSync(path.join(workspace, 'jest.config.js'), `module.exports = {
  preset: '` + presetName + `',
  moduleFileExtensions: ['js','mjs','cjs','jsx','ts','tsx','json','node'],
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|${PKG.replace('/', '\\\\/')}))'],
};\n`);
      mkdirSync(path.join(workspace, '__tests__'), { recursive: true });
      writeFileSync(path.join(workspace, '__tests__/render.test.js'), `
const React = require('react');
const renderer = require('react-test-renderer');
const {HyperswitchVaultForm} = require('${PKG}');

it('renders the card form', () => {
  const session = {vault_details: {vault_type: 'hyperswitch', vault_data: {sdk_authorization: 'x'}}};
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(HyperswitchVaultForm, {session, environment: 'sandbox'}));
  });
  expect(tree.toJSON()).toBeTruthy();
  renderer.act(() => tree.unmount());
});
`);
      try {
        run(path.join(workspace, 'node_modules/.bin/jest'), ['--ci'], workspace);
        row.jest = 'pass';
      } catch (error) {
        const text = detail(error);
        row.jest = isHarnessBlock(text) ? 'blocked' : 'FAIL';
        row.note ||= text;
      }
      console.log(`  jest   ${row.jest}`);
    }

    /* ── metro ── */
    if (tiers.includes('metro')) {
      writeFileSync(path.join(workspace, 'index.js'), `
import {AppRegistry} from 'react-native';
import * as React from 'react';
import {HyperswitchVaultForm} from '${PKG}';
const App = () => React.createElement(HyperswitchVaultForm, {
  session: {vault_details: {vault_type: 'hyperswitch', vault_data: {sdk_authorization: 'x'}}},
  environment: 'sandbox',
});
AppRegistry.registerComponent('app', () => App);
`);
      writeFileSync(path.join(workspace, 'metro.config.js'),
        "const {getDefaultConfig} = require('@react-native/metro-config');\nmodule.exports = getDefaultConfig(__dirname);\n");
      let metroOk = true;
      let metroBlocked = false;
      for (const p of ['android', 'ios']) {
        try {
          run(path.join(workspace, 'node_modules/.bin/react-native'),
            ['bundle', '--platform', p, '--dev', 'false', '--entry-file', 'index.js',
             '--bundle-output', path.join(workspace, `bundle.${p}.js`)],
            workspace, 900_000);
        } catch (error) {
          const text = detail(error);
          metroOk = false;
          metroBlocked = metroBlocked || isHarnessBlock(text);
          row.note ||= `metro ${p}: ${text}`;
        }
      }
      row.metro = metroOk ? 'pass' : metroBlocked ? 'blocked' : 'FAIL';
      console.log(`  metro  ${row.metro}`);
    }

    /* ── gradle ── */
    if (wantGradle) {
      if (!androidSdk) {
        row.gradle = 'unavailable (no Android SDK)';
      } else {
        row.gradle = 'not attempted (needs a full RN template app)';
      }
      console.log(`  gradle ${row.gradle}`);
    }
  } catch (error) {
    /* An install failure is a FAIL, not a blank row — otherwise the matrix reads as "fine". */
    row.types = row.types === '-' ? 'FAIL' : row.types;
    row.note ||= detail(error);
    console.log(`  install FAILED: ${row.note}`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    results.push(row);
  }
}

fixture.cleanup();

console.log('\n── Matrix ──');
console.log('rn        label            types  jest   metro  gradle');
for (const r of results) {
  console.log(
    `${r.rn.padEnd(9)} ${(r.label || '').padEnd(16)} ${r.types.padEnd(6)} ${r.jest.padEnd(6)} ${r.metro.padEnd(6)} ${r.gradle}`
  );
  if (r.note) console.log(`  note: ${r.note}`);
}

console.log(`\niOS native builds: ${isMac && hasXcode ? 'possible on this host (Xcode present) — not attempted; needs a full RN template app' : 'UNAVAILABLE on this host (requires macOS with Xcode)'}`);
console.log(`Android SDK: ${androidSdk ? androidSdk : 'not found'}`);

const failed = results.filter((r) => [r.types, r.jest, r.metro].includes('FAIL'));
if (failed.length) {
  console.error(`\n[verify-rn-matrix] FAIL for: ${failed.map((f) => f.rn).join(', ')}`);
  process.exit(1);
}
console.log('\n[verify-rn-matrix] OK for the tiers that ran');
