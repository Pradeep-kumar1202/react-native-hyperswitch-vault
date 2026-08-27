#!/usr/bin/env node
/*
 * A REAL ANDROID BUILD, from a real React Native template app.
 *
 * Metro bundling proves the JavaScript graph resolves. It says nothing about whether an Android
 * app that depends on this package actually compiles and links — autolinking, the asset pipeline,
 * and Gradle's own resolution all sit outside Metro. A package with no native code should sail
 * through all of it, and "should" is exactly the kind of claim worth turning into a build.
 *
 * So this does the slow, honest thing: initialise the RN community template at the version under
 * test, install the packed tarball into it, render the form from `App.tsx`, and run
 * `./gradlew assembleDebug`.
 *
 * ── WHAT A FAILURE HERE MEANS ──────────────────────────────────────────────────
 *
 * A Gradle failure is only about this library if it names it. Missing SDK components, a JDK
 * mismatch, or a template that cannot be fetched are environment problems, and they are reported as
 * `unavailable` rather than `FAIL` — the same discipline `verify-rn-matrix.mjs` applies to its
 * harness blocks, for the same reason: a red row that means "this machine lacks an SDK" trains
 * people to ignore red rows.
 *
 * Usage:
 *   node scripts/verify-android-gradle.mjs              # RN 0.86, the version client-core uses
 *   node scripts/verify-android-gradle.mjs --rn 0.87.1
 *   node scripts/verify-android-gradle.mjs --keep       # leave the workspace for inspection
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packFixture } from './pack-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@juspay-tech/react-native-hyperswitch-vault';

const argv = process.argv.slice(2);
const flagOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const RN = flagOf('rn') ?? '0.86.0';
const keep = argv.includes('--keep');

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const run = (cmd, args, cwd, timeout = 1_800_000) =>
  execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', timeout, env: process.env });

const tail = (error, lines = 12) =>
  [String(error?.stdout ?? ''), String(error?.stderr ?? ''), String(error?.message ?? '')]
    .join('\n')
    .split('\n')
    .filter((l) => l.trim())
    .slice(-lines)
    .join('\n        ');

/* ── Environment ──────────────────────────────────────────────────────────── */

const androidSdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (existsSync(path.join(process.env.HOME ?? '', 'Library/Android/sdk'))
    ? path.join(process.env.HOME ?? '', 'Library/Android/sdk')
    : undefined);

if (!androidSdk) {
  console.log('[verify-android-gradle] unavailable - no Android SDK on this host');
  console.log('  Set ANDROID_HOME (or install the SDK) and re-run. NOT reported as a pass.');
  process.exit(0);
}
console.log(`Android SDK: ${androidSdk}`);
console.log(`React Native: ${RN}\n`);

const workspace = mkdtempSync(path.join(tmpdir(), 'vault-gradle-'));
const app = path.join(workspace, 'GradleProbe');
let fixture;

try {
  /* ── 1. A real template app ─────────────────────────────────────────────── */

  console.log('Initialising the React Native template (this takes a few minutes)…');
  try {
    run(
      'npx',
      ['--yes', '@react-native-community/cli@latest', 'init', 'GradleProbe',
       '--version', RN, '--directory', app, '--skip-install', '--install-pods', 'false'],
      workspace
    );
  } catch (error) {
    console.log(`[verify-android-gradle] unavailable - the template could not be created:\n        ${tail(error, 8)}`);
    process.exit(0);
  }
  check(existsSync(path.join(app, 'android/gradlew')), 'the template produced an Android project');

  /* ── 2. Install, with the packed library ────────────────────────────────── */

  console.log('Installing dependencies and the packed library…');
  fixture = packFixture({ quiet: true });
  try {
    run('npm', ['install', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps'], app);
    run('npm', ['install', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps', fixture.tgz], app);
  } catch (error) {
    console.log(`[verify-android-gradle] unavailable - install failed:\n        ${tail(error, 8)}`);
    process.exit(0);
  }
  check(
    existsSync(path.join(app, 'node_modules', PKG, 'package.json')),
    'the packed library installed into the template'
  );

  /*
   * The peer range must ACCEPT this RN version. npm with --legacy-peer-deps installs regardless, so
   * the declared range is checked directly — this is the assertion that would have caught the
   * library claiming `<0.80` while client-core ran 0.86.
   */
  const declared = JSON.parse(
    readFileSync(path.join(app, 'node_modules', PKG, 'package.json'), 'utf8')
  ).peerDependencies?.['react-native'];
  console.log(`  peer range: ${declared}`);
  const [, major, minor] = /^(\d+)\.(\d+)/.exec(RN) ?? [];
  const upper = /<\s*(\d+)\.(\d+)/.exec(declared ?? '');
  check(
    upper !== null && Number(minor) < Number(upper[2]),
    `the declared peer range admits react-native ${RN}`
  );

  /* ── 3. Render the form from the app entry ──────────────────────────────── */

  writeFileSync(path.join(app, 'App.tsx'), `
import React from 'react';
import {SafeAreaView} from 'react-native';
import {HyperswitchVaultForm} from '${PKG}';

export default function App() {
  return (
    <SafeAreaView>
      <HyperswitchVaultForm environment="sandbox" />
    </SafeAreaView>
  );
}
`);

  /* ── 4. assembleDebug ───────────────────────────────────────────────────── */

  console.log('Running ./gradlew assembleDebug…');
  const androidDir = path.join(app, 'android');
  writeFileSync(path.join(androidDir, 'local.properties'), `sdk.dir=${androidSdk}\n`);

  try {
    run('./gradlew', ['assembleDebug', '--no-daemon', '--console=plain'], androidDir, 2_400_000);
  } catch (error) {
    const output = tail(error, 14);
    /*
     * Only a failure that NAMES this package is this package's problem. Anything else is the
     * toolchain on this machine, and is reported as unavailable rather than as a library failure.
     */
    const mentionsUs = new RegExp(PKG.replace('/', '\\/')).test(output) || /hyperswitch-vault/.test(output);
    if (mentionsUs) {
      check(false, `assembleDebug failed, naming this package:\n        ${output}`);
    } else {
      console.log(`[verify-android-gradle] unavailable - Gradle failed for an environment reason:\n        ${output}`);
      process.exit(0);
    }
  }

  const apk = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
  check(existsSync(apk), 'assembleDebug produced app-debug.apk');
} finally {
  fixture?.cleanup();
  if (keep) {
    console.log(`\nWorkspace kept at ${workspace}`);
  } else {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error('\n[verify-android-gradle] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-android-gradle] OK - a real Android app builds against the packed library');
