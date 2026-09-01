#!/usr/bin/env node
/*
 * SCAN CARD MUST NOT BREAK A CONSUMER THAT DOES NOT INSTALL THE SCANNER.
 *
 * `ScanCardBridge` resolves an optional native package with `require()` inside a `try`. That is the
 * pattern client-core used, and at RUNTIME it is sound — the throw is caught and `isAvailable`
 * becomes false.
 *
 * Bundlers are the problem. Metro resolves `require()` calls STATICALLY, at build time, before any
 * `try` can catch anything. A bare `require('@juspay-tech/react-native-hyperswitch-scancard')` in a
 * package that does not depend on it is exactly the shape that makes a bundle fail to build for
 * every consumer who has not installed it — and unit tests cannot see that, because jest resolves
 * lazily and would happily report the absent branch as working.
 *
 * So this bundles the REAL packed tarball with Metro, twice:
 *
 *   1. without the scanner installed — the common case, and the one that must not break;
 *   2. with a stand-in for it installed — the case that must actually pick it up.
 *
 * Both must produce a bundle. If the first fails, the optional dependency is not optional and the
 * feature has to be removed rather than shipped broken.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packFixture } from './pack-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@juspay-tech/react-native-hyperswitch-vault';
const SCANNER = '@juspay-tech/react-native-hyperswitch-scancard';

/* The RN line to bundle under. Matched toolchain, for the reasons in verify-rn-matrix.mjs. */
const RN = process.env.VAULT_SCAN_RN ?? '0.79.7';
const REACT = process.env.VAULT_SCAN_REACT ?? '19.0.0';

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const run = (cmd, args, cwd, timeout = 900_000) =>
  execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', timeout });

const detail = (error) =>
  [String(error?.stdout ?? ''), String(error?.stderr ?? ''), String(error?.message ?? '')]
    .join('\n')
    .split('\n')
    .filter((l) => l.trim())
    .slice(-6)
    .join(' | ')
    .slice(0, 400);

console.log(`Packing the library once, then bundling it under react-native@${RN}…\n`);
const fixture = packFixture({ quiet: true });
const tarball = fixture.tgz;

const buildConsumer = (label, { withScanner }) => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'vault-scan-'));
  try {
    writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'scan-consumer', version: '1.0.0', private: true }, null, 2)
    );

    run(
      'npm',
      ['install', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps',
       `react@${REACT}`, `react-native@${RN}`, `@react-native/metro-config@${RN}`,
       `@react-native/babel-preset@${RN}`,
       /* RN moved `bundle` out of the core package; without the CLI there is nothing to run. */
       '@react-native-community/cli@latest',
       tarball],
      workspace
    );

    if (withScanner) {
      /*
       * A stand-in, installed under the scanner's real name. The point is the RESOLUTION, not the
       * native module: if Metro can resolve the specifier, the optional dependency works, and the
       * runtime behaviour of a real scanner is covered by `example/__tests__/scanCard.test.tsx`.
       */
      const stub = path.join(workspace, 'scanner-stub');
      mkdirSync(stub, { recursive: true });
      writeFileSync(
        path.join(stub, 'package.json'),
        JSON.stringify({ name: SCANNER, version: '0.2.3', main: 'index.js' }, null, 2)
      );
      /*
       * The marker is how the assertions below tell "Metro resolved the scanner" from "Metro built
       * a bundle". It is a string literal, so it survives the production minifier.
       */
      writeFileSync(
        path.join(stub, 'index.js'),
        'const MARKER = "SCANCARD_STUB_WAS_RESOLVED";\n' +
          'module.exports = {isAvailable: true, launchScanCard: () => MARKER};\n'
      );
      run('npm', ['install', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps', './scanner-stub'], workspace);
    }

    writeFileSync(path.join(workspace, 'babel.config.js'),
      "module.exports = {presets: ['@react-native/babel-preset']};\n");
    writeFileSync(path.join(workspace, 'metro.config.js'),
      "const {getDefaultConfig} = require('@react-native/metro-config');\nmodule.exports = getDefaultConfig(__dirname);\n");
    writeFileSync(path.join(workspace, 'index.js'), `
import {AppRegistry} from 'react-native';
import * as React from 'react';
import {HyperswitchVaultForm} from '${PKG}';
const App = () => React.createElement(HyperswitchVaultForm, {environment: 'sandbox'});
AppRegistry.registerComponent('app', () => App);
`);

    let bundled = true;
    let why = '';
    for (const platform of ['android', 'ios']) {
      try {
        run(
          path.join(workspace, 'node_modules/.bin/react-native'),
          ['bundle', '--platform', platform, '--dev', 'false', '--entry-file', 'index.js',
           '--bundle-output', path.join(workspace, `bundle.${platform}.js`)],
          workspace
        );
      } catch (error) {
        bundled = false;
        why ||= `${platform}: ${detail(error)}`;
      }
    }
    check(bundled, `${label} — Metro bundles for android and ios${bundled ? '' : `\n        ${why}`}`);

    if (!bundled) return null;
    return readFileSync(path.join(workspace, 'bundle.android.js'), 'utf8');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
};

console.log('Consumer WITHOUT the scanner installed (the common case)');
const withoutBundle = buildConsumer('no scanner', { withScanner: false });

console.log('\nConsumer WITH the scanner installed');
const withBundle = buildConsumer('scanner installed', { withScanner: true });

/*
 * ── PROVING THE BUILDS WERE NOT VACUOUS ───────────────────────────────────────
 *
 * Two bundles that built could both be empty. The marker is what distinguishes "Metro resolved the
 * scanner" from "Metro produced a file": it appears only when the stub was genuinely pulled into
 * the graph.
 *
 * The specifier string itself is NOT a usable signal — a production bundle rewrites `require()`
 * targets to numeric module ids, so the package name is gone from both bundles whether resolution
 * succeeded or not. Asserting on it would have been a check that always failed for a reason
 * unrelated to the property under test.
 */
console.log('\nThe optional dependency behaves like one');
if (withoutBundle && withBundle) {
  const MARKER = 'SCANCARD_STUB_WAS_RESOLVED';
  check(withBundle.includes(MARKER), 'the scanner IS pulled into the bundle when it is installed');
  check(
    !withoutBundle.includes(MARKER),
    'and is absent from the bundle built without it — the guarded require resolved to nothing'
  );
  /* Neither bundle is empty, so "the marker is missing" is not just "the bundle is". */
  check(
    withoutBundle.length > 100_000 && withBundle.length > 100_000,
    `both bundles have real content (${Math.round(withoutBundle.length / 1024)}KB / ${Math.round(withBundle.length / 1024)}KB)`
  );
  check(
    withoutBundle.includes('HyperswitchVaultForm') || withoutBundle.includes('CardNumberInput'),
    'the library itself is in the bundle built without the scanner'
  );
}

fixture.cleanup();

if (failures.length) {
  console.error('\n[verify-scancard-packaging] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\n  A consumer that does not install the scanner must still be able to build. If this cannot\n' +
      '  be achieved, remove the scan-card feature rather than shipping a broken optional one.'
  );
  process.exit(1);
}
console.log('\n[verify-scancard-packaging] OK - the scanner is optional in both directions');
