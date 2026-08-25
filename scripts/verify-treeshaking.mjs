#!/usr/bin/env node
/*
 * Tree-shaking gate for the convenience namespace and the canonical field aliases.
 *
 * WHY THIS EXISTS. `HyperswitchVault` (ADR-0002 §2) is one object holding references to all five
 * components. If a bundler cannot prove that object is dead when a merchant imports only, say,
 * `CardNumberField`, then merely ADDING the namespace would drag the ready-made form, the layout,
 * the submit coordinator and the PMS-confirm transport into every bundle. That is a real regression
 * no type check and no runtime test would notice.
 *
 * Source inspection cannot answer it: whether the object is dropped depends on the bundler's purity
 * analysis and on the package's `sideEffects` flag, not on how the source reads. So this runs an
 * ACTUAL bundler over the ACTUAL packed tarball and inspects the emitted output.
 *
 * WHAT THIS DOES AND DOES NOT CLAIM.
 *
 * Measured on this package (see the report below), a consumer importing ONLY `CardNumberWidget` —
 * the legacy name, with no namespace in the picture at all — already retains the PMS-confirm
 * transport and the form coordinator. The root entry is not meaningfully tree-shakable today: the
 * compiled ReScript modules cross-reference each other through the shared context and controller,
 * and Rollup's chunk graph keeps them together. That is a PRE-EXISTING property, independent of
 * anything in ADR-0002, and this gate deliberately does not pretend otherwise.
 *
 * What this gate therefore asserts is the property that is actually at risk, stated as a DELTA:
 *
 *   1. the namespace object itself is dropped from a named-import bundle, and
 *   2. importing a canonical field name (`CardNumberField`) retains exactly the same library code
 *      as importing the legacy name (`CardNumberWidget`) — byte-identical once comments are
 *      stripped and the consumer's own identifier is normalised — so the new surface costs a
 *      consumer nothing.
 *
 * Making the root entry shakable end-to-end is a separate piece of work; it is not in scope here,
 * and this gate would keep passing across it.
 *
 * Rollup is used because it is already a devDependency and has the strictest, most legible
 * tree-shaking available here. Metro (React Native's default) does not tree-shake at all, so a
 * Metro consumer pays for the whole root entry either way — before and after this change alike.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
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
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-treeshake-')));

/* Extract the packed tarball the way an install would. */
const pkgDir = path.join(workspace, 'node_modules', PKG);
mkdirSync(pkgDir, { recursive: true });
execFileSync('tar', ['-xzf', fixture.tgz, '-C', pkgDir, '--strip-components', '1'], { stdio: 'ignore' });

const packedPkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
check(packedPkg.sideEffects === false, 'the packed package declares "sideEffects": false');
check(existsSync(path.join(pkgDir, 'dist/esm/index.js')), 'the packed ESM root entry exists');

/*
 * Each case gets its own directory INSIDE the workspace, so `node_modules/<PKG>` resolves by
 * ordinary Node resolution walking up — exactly as it would in a merchant's app.
 */
const bundle = (name, source) => {
  const dir = path.join(workspace, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'entry.mjs'), source);

  writeFileSync(
    path.join(dir, 'rollup.config.mjs'),
    `import { nodeResolve } from ${JSON.stringify(
      path.join(root, 'node_modules/@rollup/plugin-node-resolve/dist/es/index.js')
    )};
export default {
  input: 'entry.mjs',
  external: (id) => id === 'react' || id === 'react/jsx-runtime' || id === 'react-native' || /\\.(png|jpe?g|gif|webp)$/.test(id),
  plugins: [nodeResolve({ extensions: ['.js', '.mjs'] })],
  treeshake: { moduleSideEffects: false, propertyReadSideEffects: false },
  output: { file: 'out.mjs', format: 'es' },
};
`
  );

  try {
    execFileSync(path.join(root, 'node_modules/.bin/rollup'), ['-c', 'rollup.config.mjs'], {
      cwd: dir,
      stdio: 'pipe',
    });
  } catch (error) {
    console.error(String(error.stderr ?? error.message));
    throw new Error(`rollup failed for fixture "${name}"`);
  }
  return readFileSync(path.join(dir, 'out.mjs'), 'utf8');
};

const importOnly = (name) =>
  bundle(`uses-${name}`, `import { ${name} } from ${JSON.stringify(PKG)};\nexport const used = ${name};\n`);

/*
 * Comments are attached to whichever statement survives, so two bundles containing identical CODE
 * can differ by a few dozen bytes of prose. Strip comments before comparing so the assertion is
 * about retained code, not about how the entry file is annotated.
 */
const codeOnly = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/*
 * The consumer's own imported identifier appears in the output, and the two names differ in length
 * (`CardNumberField` is one character shorter than `CardNumberWidget`). Normalise it away so the
 * comparison is about retained LIBRARY code, not about which name the consumer typed.
 */
const normalised = (source) => codeOnly(source).replace(/\bCardNumber(?:Field|Widget)\b/g, 'X');

const run = () => {
  console.log('\nTree-shaking the packed root entry with Rollup');

  const fieldOnly = importOnly('CardNumberField');
  const legacyOnly = importOnly('CardNumberWidget');
  const withNamespace = importOnly('HyperswitchVault');

  /* ── 1. the namespace object must be dead code on a named-import ──────────── */

  check(
    !/HyperswitchVault\s*=\s*\{/.test(fieldOnly),
    'CardNumberField-only import DROPS the HyperswitchVault namespace object'
  );
  check(
    !/HyperswitchVault\s*=\s*\{/.test(legacyOnly),
    'CardNumberWidget-only import DROPS the HyperswitchVault namespace object'
  );
  check(
    /HyperswitchVault\s*=\s*\{/.test(withNamespace),
    'namespace import RETAINS it (control: the assertion above can fail)'
  );

  /* ── 2. the canonical alias must cost a consumer exactly nothing ──────────── */

  const fieldCode = normalised(fieldOnly);
  const legacyCode = normalised(legacyOnly);

  check(
    fieldCode === legacyCode,
    `CardNumberField and CardNumberWidget retain byte-identical library code ` +
      `(${fieldCode.length} B each, comments stripped and the consumer's identifier normalised)`
  );

  /* ── 3. the namespace must cost MORE than a named import ──────────────────── */

  const namespaceCode = normalised(withNamespace);
  check(
    namespaceCode.length > fieldCode.length,
    `importing the namespace retains strictly more than a named field ` +
      `(${namespaceCode.length} B > ${fieldCode.length} B) — the namespace is genuinely shakeable, ` +
      `not merely absent`
  );

  console.log(
    `\n  retained code: field ${fieldCode.length} B · legacy ${legacyCode.length} B · namespace ${namespaceCode.length} B`
  );
  console.log(
    '  note: the root entry retains form/transport code for ANY named import — a pre-existing\n' +
      '        property of the compiled chunk graph, unchanged by this phase and out of scope here.'
  );
};

try {
  run();
} finally {
  fixture.cleanup();
  rmSync(workspace, { recursive: true, force: true });
}

if (failures.length) {
  console.error('\n[verify-treeshaking] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log('\n[verify-treeshaking] OK - the namespace costs a named-import consumer nothing');
