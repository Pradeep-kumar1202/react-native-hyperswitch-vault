#!/usr/bin/env node
/*
 * The merchant consumer contract, proved against the PACKED TARBALL.
 *
 * There is now exactly ONE published entry and one audience, so there is one fixture: a standalone
 * merchant with only react + react-native installed. It pins down what an installed consumer
 * actually sees — not what `src/` reads — namely that the root entry resolves and loads, exports
 * exactly the documented value surface, and that every alias and namespace member is the SAME
 * OBJECT as the component it aliases (`===`, which is what rules out a wrapper).
 *
 * The `/embedded` and `/vault` fixtures, and the client-core host fixture, were deleted in the
 * merchant-only scope reset along with the entries they tested. `verify-merchant-only.mjs` now
 * asserts those entries are UNREACHABLE rather than asserting how they behave.
 *
 * Everything here runs offline: the fixture is assembled from the packed tarball and from
 * node_modules, never from a registry.
 *
 * The tarball is packed here, to a unique temp path, so this script has no ordering dependency on
 * any other and can never test a stale artifact left behind by a previous run.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  cpSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { packFixture } from './pack-fixture.mjs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@juspay-tech/react-native-hyperswitch-vault';

const failures = [];
const notes = [];
const check = (ok, what) => {
  if (ok) notes.push(`    ok   ${what}`);
  else failures.push(what);
};

if (!existsSync(path.join(root, 'dist/esm/index.js'))) {
  console.error('[verify-consumers] FAIL: dist/ is missing. Run `yarn build` first.');
  process.exit(1);
}

/* Packed here, to a path that has never existed before — see scripts/pack-fixture.mjs. */
const fixture = packFixture({ quiet: true });
const tgz = fixture.tgz;

/* ── Fixture plumbing ────────────────────────────────────────────────────── */

/*
 * realpathSync matters: on macOS the temp dir is /var/... which is a symlink to /private/var/...,
 * and Node's resolver reports realpaths. Comparing an unresolved fixture path against a resolved
 * module path would make the nested-copy assertion below fail for the wrong reason.
 */
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-consumers-')));
const requireFromRoot = createRequire(path.join(root, 'app.js'));

/*
 * A stub react-native. The real package's entry is Flow-typed source that Node cannot parse, and
 * copying it would take hundreds of megabytes. Every access returns a callable/indexable dummy,
 * which is enough for a module to LOAD — which is all this fixture asserts. Rendering behaviour is
 * covered by the example's jest suite, which uses the real React Native preset.
 */
const writeReactNativeStub = (nodeModules) => {
  const dir = path.join(nodeModules, 'react-native');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'react-native', version: '0.79.7', main: 'index.js' }));
  writeFileSync(
    path.join(dir, 'index.js'),
    `const handler = {
       get: (target, prop) => {
         if (prop === '__esModule') return false;
         if (!(prop in target)) target[prop] = new Proxy(function stub() { return {}; }, handler);
         return target[prop];
       },
     };
     module.exports = new Proxy({}, handler);\n`
  );
};

/* Extracts the packed tarball into <fixture>/node_modules/<PKG>, as an install would. */
const installPackage = (fixture) => {
  const target = path.join(fixture, 'node_modules', PKG);
  mkdirSync(target, { recursive: true });
  execFileSync('tar', ['-xzf', tgz, '-C', target, '--strip-components=1']);
  return target;
};

const linkReal = (nodeModules, name) => {
  const target = path.join(nodeModules, name);
  mkdirSync(path.dirname(target), { recursive: true });
  /* Symlink keeps the realpath, and therefore the module instance, identical to this repo's copy. */
  symlinkSync(path.join(root, 'node_modules', name), target, 'dir');
};

/* A real, physically separate copy — this is what makes two instances distinguishable. */
const copyReal = (nodeModules, name) => {
  cpSync(path.join(root, 'node_modules', name), path.join(nodeModules, name), { recursive: true });
};

const makeFixture = (name) => {
  const fixture = path.join(workspace, name);
  const nodeModules = path.join(fixture, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({ name: `fixture-${name}`, version: '1.0.0', private: true }, null, 2)
  );
  return { fixture, nodeModules };
};

/*
 * Walks a bundle's module graph and reports every BARE specifier it will ask the host bundler for.
 * That set is the package's true runtime contract — package.json only states intent.
 */
const bareImports = (entryFile) => {
  const seen = new Set();
  const bare = new Set();
  const visit = (file) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) visit(path.resolve(path.dirname(file), specifier));
      else bare.add(specifier);
    }
  };
  visit(entryFile);
  return { bare: [...bare].sort(), files: seen.size };
};

/* Concatenated source of an entry and every relative file it pulls in. */
const graphSource = (entryFile) => {
  const seen = new Set();
  let out = '';
  const visit = (file) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    out += source;
    for (const match of source.matchAll(/(?:from|require\()\s*['"](\.[^'"]+)['"]/g)) {
      visit(path.resolve(path.dirname(file), match[1]));
    }
  };
  visit(entryFile);
  return out;
};

/* ── Package metadata: the layout must be impossible to install ──────────── */

console.log('\nPackaging metadata (packed tarball)');
const stagedPkgDir = installPackage(makeFixture('metadata').fixture);
const packed = JSON.parse(readFileSync(path.join(stagedPkgDir, 'package.json'), 'utf8'));

check(
  !packed.dependencies || Object.keys(packed.dependencies).length === 0,
  'published package declares no runtime `dependencies`'
);

/* The whole point of this phase: no form library may be declared at all. */
check(
  packed.peerDependencies?.['react-final-form'] === undefined &&
    packed.peerDependencies?.['final-form'] === undefined,
  'the package declares NEITHER react-final-form NOR final-form as a peer'
);
check(
  packed.peerDependenciesMeta === undefined ||
    (packed.peerDependenciesMeta['react-final-form'] === undefined &&
      packed.peerDependenciesMeta['final-form'] === undefined),
  'no form-library entry survives in peerDependenciesMeta'
);
check(
  JSON.stringify(packed.dependencies ?? {}).includes('final-form') === false,
  'no form library appears in runtime dependencies either'
);


/* ── Entry contracts, straight off the packed bundles ────────────────────── */

console.log('\nEntry import contracts (packed bundles)');
const dist = (rel) => path.join(stagedPkgDir, rel);
const readAll = (file) => readFileSync(file, 'utf8');

for (const format of ['esm', 'cjs']) {
  for (const entry of ['index', 'embedded', 'vault']) {
    const file = dist(`dist/${format}/${entry}.js`);
    const imports = bareImports(file).bare;
    check(
      !imports.includes('react-final-form') && !imports.includes('final-form'),
      `${format}: /${entry} imports no form library (imports: ${imports.join(', ') || 'none'})`
    );
    check(
      !/createForm|ReactFinalForm/.test(graphSource(file)),
      `${format}: /${entry} bundles no form-library implementation`
    );
  }
  check(
    bareImports(dist(`dist/${format}/vault.js`)).bare.every(
      (id) => id !== 'react' && id !== 'react-native'
    ),
    `${format}: /vault stays free of React and React Native`
  );
}


/* ── Fixture A — standalone consumer, nothing else installed ─────────────── */

console.log('\nA. standalone consumer (no form library installed anywhere)');
{
  const { fixture, nodeModules } = makeFixture('a-standalone');
  const pkgDir = installPackage(fixture);
  linkReal(nodeModules, 'react');
  writeReactNativeStub(nodeModules);

  const requireFromPackage = createRequire(path.join(pkgDir, 'dist/cjs/index.js'));
  let resolvedRff = null;
  try {
    resolvedRff = requireFromPackage.resolve('react-final-form');
  } catch {
    /* expected */
  }
  check(resolvedRff === null, 'react-final-form is genuinely absent from the fixture (resolution fails)');

  /*
   * React Native resolves `require('../assets/x.png')` through Metro's asset pipeline; plain Node
   * would try to PARSE the PNG. Registering a stub extension models what Metro does, so this check
   * still proves what it is meant to prove: the root entry needs no bare dependency beyond react
   * and react-native.
   */
  const Module = requireFromRoot('module');
  const previousPngLoader = Module._extensions['.png'];
  Module._extensions['.png'] = (module, filename) => {
    module.exports = { __asset: path.basename(filename) };
  };

  const requireFromApp = createRequire(path.join(fixture, 'app.js'));
  let loaded = null;
  let loadError = null;
  try {
    loaded = requireFromApp(PKG);
  } catch (error) {
    loadError = error;
  } finally {
    if (previousPngLoader) Module._extensions['.png'] = previousPngLoader;
    else delete Module._extensions['.png'];
  }

  /*
   * Every asset the bundle asks for must exist on disk in the INSTALLED package — a missing copy
   * step would otherwise surface only as a blank icon on a device.
   */
  const entrySource = readFileSync(path.join(pkgDir, 'dist/cjs/index.js'), 'utf8');
  const assetSpecifiers = [...entrySource.matchAll(/require\('(\.\.\/assets\/[^']+)'\)/g)].map((m) => m[1]);
  const missingAssets = assetSpecifiers.filter(
    (spec) => !existsSync(path.resolve(pkgDir, 'dist/cjs', spec))
  );
  check(
    assetSpecifiers.length > 0,
    `the root entry references packaged artwork (${assetSpecifiers.length} assets)`
  );
  check(missingAssets.length === 0, `every referenced asset exists in the installed package${missingAssets.length ? `: missing ${missingAssets.join(', ')}` : ''}`);

  /* And each one must have its @2x and @3x siblings. */
  const missingDensities = assetSpecifiers.flatMap((spec) =>
    ['@2x', '@3x']
      .map((d) => spec.replace(/\.png$/, `${d}.png`))
      .filter((sibling) => !existsSync(path.resolve(pkgDir, 'dist/cjs', sibling)))
  );
  check(missingDensities.length === 0, `every asset ships @2x and @3x${missingDensities.length ? `: missing ${missingDensities.length}` : ''}`);
  check(loadError === null, `root entry loads with only react + react-native present${loadError ? `: ${loadError.message}` : ''}`);
  check(
    typeof loaded?.HyperswitchVaultForm === 'object' &&
      loaded.HyperswitchVaultForm.$$typeof === Symbol.for('react.forward_ref'),
    'the loaded export is a real forwardRef component'
  );

  /*
   * ── ADR-0002 §1–§3: the merchant facade ────────────────────────────────────
   *
   * These are IDENTITY assertions, deliberately, not shape assertions. A wrapper component would
   * satisfy "is a forwardRef" and "renders the same thing" while silently breaking `===` checks,
   * React.memo identity and devtools naming. `===` is the only test that rules a wrapper out, and
   * it is run here against the PACKED tarball rather than against src.
   */
  const forwardRef = Symbol.for('react.forward_ref');
  const isForwardRef = (v) => typeof v === 'object' && v !== null && v.$$typeof === forwardRef;

  const CANONICAL_ALIASES = [
    ['CardNumberField', 'CardNumberWidget'],
    ['CardExpiryField', 'CardExpiryWidget'],
    ['CardCVCField', 'CardCVCWidget'],
  ];

  for (const [next, legacy] of CANONICAL_ALIASES) {
    check(isForwardRef(loaded?.[legacy]), `${legacy} is a real forwardRef component`);
    check(isForwardRef(loaded?.[next]), `${next} is a real forwardRef component`);
    check(loaded?.[next] === loaded?.[legacy], `${next} === ${legacy} (same object, not a wrapper)`);
  }

  /*
   * ── ADR-0010: ./host is the same objects under a wider type surface ────────
   *
   * Loaded from the PACKED tarball and compared by `===`. A second bundle of the form would pass
   * every shape check and still break the app: two React contexts, a field from one entry never
   * registering with a provider from the other. Identity is the only test that rules that out.
   */
  let hostLoaded = null;
  let hostError = null;
  try {
    hostLoaded = requireFromApp(`${PKG}/host`);
  } catch (error) {
    hostError = error;
  }
  check(hostError === null, `./host loads with only react + react-native present${hostError ? `: ${hostError.message}` : ''}`);
  for (const name of ['HyperswitchVaultFormProvider', 'CardNumberField', 'CardExpiryField', 'CardCVCField', 'CardholderNameField']) {
    check(hostLoaded?.[name] === loaded?.[name], `host.${name} === root.${name} (one object, two type surfaces)`);
  }
  check(
    hostLoaded !== null && ['HyperswitchVaultForm', 'HyperswitchVault', 'CardNumberWidget', 'CardExpiryWidget', 'CardCVCWidget', 'CardholderNameWidget']
      .every((name) => !(name in hostLoaded)),
    './host exports no ready-made form, namespace or *Widget alias'
  );

  const NAMESPACE_MEMBERS = [
    ['CardForm', 'HyperswitchVaultForm'],
    ['Form', 'HyperswitchVaultFormProvider'],
    ['CardNumber', 'CardNumberField'],
    ['Expiry', 'CardExpiryField'],
    ['CVC', 'CardCVCField'],
    ['CardholderName', 'CardholderNameField'],
  ];

  check(
    loaded?.HyperswitchVault !== null && typeof loaded?.HyperswitchVault === 'object',
    'HyperswitchVault is exported as a plain object'
  );
  check(
    isForwardRef(loaded?.HyperswitchVault) === false,
    'HyperswitchVault is a namespace, not itself a component'
  );

  for (const [member, canonical] of NAMESPACE_MEMBERS) {
    check(
      loaded?.HyperswitchVault?.[member] === loaded?.[canonical],
      `HyperswitchVault.${member} === ${canonical}`
    );
  }

  check(
    Object.keys(loaded?.HyperswitchVault ?? {}).sort().join(',') ===
      NAMESPACE_MEMBERS.map(([m]) => m).sort().join(','),
    `HyperswitchVault has exactly ${NAMESPACE_MEMBERS.length} members and no extras`
  );

  /* Phase 1 does not ship the hook. It must be absent, not undefined-but-present. */
  check(
    !('useForm' in (loaded?.HyperswitchVault ?? {})),
    'HyperswitchVault.useForm does not exist yet (the hook is a later phase)'
  );
  check(
    loaded?.useHyperswitchVaultForm === undefined,
    'useHyperswitchVaultForm is not exported yet (the hook is a later phase)'
  );

  /* The full root value surface, pinned. A new export must be a deliberate edit here. */
  const EXPECTED_ROOT_VALUES = [
    'CardCVCField',
    'CardCVCWidget',
    'CardExpiryField',
    'CardExpiryWidget',
    'CardNumberField',
    'CardNumberWidget',
    'CardholderNameField',
    'CardholderNameWidget',
    'HyperswitchVault',
    'HyperswitchVaultForm',
    'HyperswitchVaultFormProvider',
  ];
  const actualRootValues = Object.keys(loaded ?? {}).sort();
  check(
    actualRootValues.join(',') === EXPECTED_ROOT_VALUES.join(','),
    `the root entry exports exactly the expected ${EXPECTED_ROOT_VALUES.length} values ` +
      `(got: ${actualRootValues.join(', ')})`
  );
}


/* ── Report ──────────────────────────────────────────────────────────────── */

for (const note of notes) console.log(note);

if (failures.length) {
  console.error('\n[verify-consumers] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n[verify-consumers] OK - ${notes.length} checks in the merchant consumer fixture`);
