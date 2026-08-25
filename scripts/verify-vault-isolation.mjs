#!/usr/bin/env node
/*
 * `/vault` must remain installable and usable by a consumer that has NEITHER React NOR React Native.
 *
 * WHY THIS EXISTS. The subpath exists so a server, a script or a non-React app can call the
 * payment-method-session confirm transport without dragging in a UI stack. That property is easy to
 * lose by accident: one stray import of a module that happens to `import 'react-native'` pulls the
 * whole thing in, and nothing else in the build would notice. Phase 2A also changed Rollup's chunk
 * grouping (the transport moved out of a shared chunk and into `vault.js`), which is exactly the
 * kind of rearrangement that could quietly reconnect the graph.
 *
 * So this does not reason about bundle SIZE. It extracts the packed tarball into a fixture whose
 * node_modules is EMPTY, imports `/vault` in plain Node, and asserts the module surface.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync, readdirSync } from 'node:fs';
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
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-isolation-')));
const pkgDir = path.join(workspace, 'node_modules', PKG);
mkdirSync(pkgDir, { recursive: true });
execFileSync('tar', ['-xzf', fixture.tgz, '-C', pkgDir, '--strip-components', '1'], { stdio: 'ignore' });

/* Deliberately NOTHING else is installed. No react, no react-native, no @types. */
const installed = readdirSync(path.join(workspace, 'node_modules')).filter((d) => d !== '@juspay-tech');
check(installed.length === 0, `the fixture installs no peer at all (found: ${installed.join(', ') || 'none'})`);

console.log('\nStatic surface of the published /vault files');

const cjs = readFileSync(path.join(pkgDir, 'dist/cjs/vault.js'), 'utf8');
const esm = readFileSync(path.join(pkgDir, 'dist/esm/vault.js'), 'utf8');

for (const [name, source] of [['cjs', cjs], ['esm', esm]]) {
  check(!/require\(['"]react['"]\)|from ['"]react['"]/.test(source), `${name}/vault.js does not import react`);
  check(
    !/require\(['"]react-native['"]\)|from ['"]react-native['"]/.test(source),
    `${name}/vault.js does not import react-native`
  );
  check(!/\bStyleSheet\b/.test(source), `${name}/vault.js contains no StyleSheet`);
  check(!/jsx|createElement|TextInput|Animated/.test(source), `${name}/vault.js contains no card UI`);
}

/* Whatever chunks it pulls must be just as clean. */
const chunkNames = [...esm.matchAll(/from ['"]\.\/([A-Za-z0-9_.-]+\.js)['"]/g)].map((m) => m[1]);
for (const chunk of chunkNames) {
  const source = readFileSync(path.join(pkgDir, 'dist/esm', chunk), 'utf8');
  check(
    !/from ['"]react(-native)?['"]/.test(source) && !/\bStyleSheet\b/.test(source),
    `the chunk /vault pulls (${chunk}) is also free of react, react-native and StyleSheet`
  );
}

console.log('\nThe transport exists exactly once in the output');
for (const flavour of ['esm', 'cjs']) {
  const dir = path.join(pkgDir, 'dist', flavour);
  const copies = readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => readFileSync(path.join(dir, f), 'utf8').includes('The vault did not respond in time'));
  check(copies.length === 1, `dist/${flavour}: the transport appears in exactly one file (${copies.join(', ') || 'none'})`);
}

console.log('\n/vault imported in plain Node, with no React and no React Native present');

writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ name: 'vault-only-consumer', type: 'module', private: true }));
writeFileSync(
  path.join(workspace, 'probe.mjs'),
  `import * as vault from '${PKG}/vault';\n` +
    `const keys = Object.keys(vault).filter((k) => k !== 'default').sort();\n` +
    `console.log(JSON.stringify({keys, kind: typeof vault.confirmPaymentMethodSession}));\n`
);
writeFileSync(
  path.join(workspace, 'probe.cjs'),
  `const vault = require('${PKG}/vault');\n` +
    `const keys = Object.keys(vault).filter((k) => k !== 'default').sort();\n` +
    `console.log(JSON.stringify({keys, kind: typeof vault.confirmPaymentMethodSession}));\n`
);

for (const [label, file] of [['ESM', 'probe.mjs'], ['CJS', 'probe.cjs']]) {
  let parsed;
  let error = '';
  try {
    parsed = JSON.parse(String(execFileSync(process.execPath, [file], { cwd: workspace, encoding: 'utf8' })).trim());
  } catch (e) {
    error = String(e.stdout ?? '') + String(e.stderr ?? '');
  }
  check(parsed !== undefined, `${label}: /vault imports in plain Node${error ? `:\n${error.split('\n').slice(0, 8).join('\n')}` : ''}`);
  if (!parsed) continue;
  check(parsed.kind === 'function', `${label}: confirmPaymentMethodSession is callable`);
  check(
    JSON.stringify(parsed.keys) === JSON.stringify(['confirmPaymentMethodSession']),
    `${label}: /vault exports ONLY confirmPaymentMethodSession (got ${parsed.keys.join(', ')})`
  );
}

fixture.cleanup();
rmSync(workspace, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-vault-isolation] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-vault-isolation] OK - /vault runs with no React and no React Native installed');
