#!/usr/bin/env node
/*
 * React Final Form module identity, proved against the PACKED TARBALL with three consumer fixtures.
 *
 * The hazard: react-final-form connects <Form> to useField through a React context that lives in
 * the module instance. Two copies means two contexts, and the second one does not degrade quietly —
 * react-final-form's own useForm() guard throws. The three entries of this package have different
 * requirements, so each fixture pins one of them down:
 *
 *   A  standalone consumer  - no react-final-form installed anywhere, and the root entry still
 *                             resolves and loads. react-final-form is bundled INTO it.
 *   B  embedded consumer    - one host copy of react-final-form; the /embedded entry resolves that
 *                             exact instance, and a field from it registers on the host's <Form>.
 *   C  nested copy (hazard) - a second copy planted under the package. Demonstrates that the
 *                             failure is loud, and that this package's metadata cannot produce the
 *                             layout in the first place.
 *
 * Everything here runs offline: the fixtures are assembled from the packed tarball and from
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
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@juspay-tech/react-native-hyperswitch-vault';

const failures = [];
const notes = [];
const check = (ok, what) => {
  if (ok) notes.push(`    ok   ${what}`);
  else failures.push(what);
};

if (!existsSync(path.join(root, 'dist/esm/embedded.js'))) {
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
 * which is enough for a module to LOAD — which is all these fixtures assert. Rendering behaviour is
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

/* ── Package metadata: the layout must be impossible to install ──────────── */

console.log('\nPackaging metadata (packed tarball)');
const stagedPkgDir = installPackage(makeFixture('metadata').fixture);
const packed = JSON.parse(readFileSync(path.join(stagedPkgDir, 'package.json'), 'utf8'));

check(
  !packed.dependencies || Object.keys(packed.dependencies).length === 0,
  'published package declares no runtime `dependencies` (so no install can create a nested copy)'
);
check(
  packed.peerDependencies?.['react-final-form'] !== undefined &&
    packed.peerDependencies?.['final-form'] !== undefined,
  'react-final-form and final-form are declared as peers'
);
check(
  packed.peerDependenciesMeta?.['react-final-form']?.optional === true &&
    packed.peerDependenciesMeta?.['final-form']?.optional === true,
  'both are OPTIONAL peers, so a standalone merchant gets no missing-peer warning'
);

/* ── Entry contracts, straight off the packed bundles ────────────────────── */

console.log('\nEntry import contracts (packed bundles)');
const dist = (rel) => path.join(stagedPkgDir, rel);

for (const format of ['esm', 'cjs']) {
  const rootEntry = bareImports(dist(`dist/${format}/index.js`));
  check(
    !rootEntry.bare.includes('react-final-form') && !rootEntry.bare.includes('final-form'),
    `${format}: root entry asks the host for no react-final-form (imports: ${rootEntry.bare.join(', ')})`
  );

  const embedded = bareImports(dist(`dist/${format}/embedded.js`));
  check(
    embedded.bare.includes('react-final-form'),
    `${format}: /embedded asks the host for react-final-form, so the host instance resolves`
  );

  const vault = bareImports(dist(`dist/${format}/vault.js`));
  check(
    !vault.bare.includes('react') && !vault.bare.includes('react-native'),
    `${format}: /vault is React and React Native free (imports: ${vault.bare.join(', ') || 'none'})`
  );
}

/* Inlining must be exclusive to the root entry. */
const readAll = (file) => {
  const { files } = bareImports(file);
  void files;
  const seen = new Set();
  const collect = (f) => {
    if (seen.has(f) || !existsSync(f)) return '';
    seen.add(f);
    const source = readFileSync(f, 'utf8');
    let out = source;
    for (const match of source.matchAll(/(?:from|require\()\s*['"](\.[^'"]+)['"]/g)) {
      out += collect(path.resolve(path.dirname(f), match[1]));
    }
    return out;
  };
  return collect(file);
};

check(/createForm/.test(readAll(dist('dist/esm/index.js'))), 'root entry has react-final-form bundled in');
check(
  !/createForm/.test(readAll(dist('dist/esm/embedded.js'))),
  '/embedded has NO bundled react-final-form'
);

/* ── Fixture A — standalone consumer, nothing else installed ─────────────── */

console.log('\nA. standalone consumer (no react-final-form installed)');
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
}

/* ── Fixture B — embedded consumer with one host copy ────────────────────── */

console.log('\nB. embedded consumer (host owns react-final-form)');
let hostReactFinalFormPath = null;
{
  const { fixture, nodeModules } = makeFixture('b-embedded');
  const pkgDir = installPackage(fixture);
  linkReal(nodeModules, 'react');
  writeReactNativeStub(nodeModules);
  copyReal(nodeModules, 'react-final-form');
  copyReal(nodeModules, 'final-form');
  linkReal(nodeModules, '@babel');

  const requireFromPackage = createRequire(path.join(pkgDir, 'dist/cjs/embedded.js'));
  const requireFromHost = createRequire(path.join(fixture, 'app.js'));

  hostReactFinalFormPath = requireFromHost.resolve('react-final-form');
  const fromPackage = requireFromPackage.resolve('react-final-form');

  check(
    fromPackage === hostReactFinalFormPath,
    'the /embedded entry resolves react-final-form to the HOST copy, not a copy of its own'
  );
  check(
    requireFromPackage('react-final-form') === requireFromHost('react-final-form'),
    'both resolve to the SAME module instance (=== on the module exports)'
  );

  /*
   * The behavioural half: a field created through the package's resolution of react-final-form
   * registers on a <Form> created through the host's. Rendered with react-dom/server because the
   * question is about React context identity, not about React Native.
   */
  const React = requireFromHost('react');
  const { renderToStaticMarkup } = createRequire(path.join(root, 'app.js'))('react-dom/server');
  const hostRff = requireFromHost('react-final-form');
  const packageRff = requireFromPackage('react-final-form');

  const Field = () => {
    const { input, meta } = packageRff.useField('payment_method_data.card.card_number');
    return React.createElement('span', null, `${input.name}:${meta.valid ? 'valid' : 'invalid'}`);
  };

  let markup = null;
  let renderError = null;
  try {
    markup = renderToStaticMarkup(
      React.createElement(hostRff.Form, {
        onSubmit: () => {},
        render: () => React.createElement(Field),
      })
    );
  } catch (error) {
    renderError = error;
  }
  check(renderError === null, `a field from the package renders inside the host's <Form>${renderError ? `: ${renderError.message}` : ''}`);
  check(
    markup?.includes('payment_method_data.card.card_number'),
    'the field registered against the host form instance'
  );
}

/* ── Fixture C — a deliberately nested copy ──────────────────────────────── */

console.log('\nC. nested react-final-form (the hazard, deliberately created)');
{
  const { fixture, nodeModules } = makeFixture('c-nested');
  const pkgDir = installPackage(fixture);
  linkReal(nodeModules, 'react');
  writeReactNativeStub(nodeModules);
  copyReal(nodeModules, 'react-final-form');
  copyReal(nodeModules, 'final-form');
  linkReal(nodeModules, '@babel');

  /* Exactly what a `dependencies` entry with a conflicting range would produce. */
  const nested = path.join(pkgDir, 'node_modules');
  mkdirSync(nested, { recursive: true });
  copyReal(nested, 'react-final-form');
  copyReal(nested, 'final-form');

  const requireFromPackage = createRequire(path.join(pkgDir, 'dist/cjs/embedded.js'));
  const requireFromHost = createRequire(path.join(fixture, 'app.js'));

  const nestedResolved = requireFromPackage.resolve('react-final-form');
  check(
    nestedResolved.startsWith(nested),
    'with a nested copy present the package resolves the NESTED one — the hazard is real'
  );
  check(
    requireFromPackage('react-final-form') !== requireFromHost('react-final-form'),
    'host and package now hold two different module instances'
  );

  /* And the failure mode is loud, not silent. */
  const React = requireFromHost('react');
  const { renderToStaticMarkup } = createRequire(path.join(root, 'app.js'))('react-dom/server');
  const hostRff = requireFromHost('react-final-form');
  const nestedRff = requireFromPackage('react-final-form');

  const Field = () => {
    const { input } = nestedRff.useField('payment_method_data.card.card_number');
    return React.createElement('span', null, input.name);
  };

  let thrown = null;
  try {
    renderToStaticMarkup(
      React.createElement(hostRff.Form, { onSubmit: () => {}, render: () => React.createElement(Field) })
    );
  } catch (error) {
    thrown = error;
  }
  check(
    thrown !== null && /must be used inside of a <Form>/.test(thrown.message),
    `a mismatched field throws react-final-form's own guard instead of failing silently (${thrown ? thrown.message : 'nothing was thrown'})`
  );

  /*
   * Prevention. This layout cannot arise from this package's metadata: it declares no runtime
   * dependencies at all, so neither npm nor yarn has anything to nest. The standalone entry is
   * immune regardless, because it never asks the host for react-final-form.
   */
  const requireStandalone = createRequire(path.join(pkgDir, 'dist/cjs/index.js'));
  const rootGraph = bareImports(path.join(pkgDir, 'dist/cjs/index.js'));
  void requireStandalone;
  check(
    !rootGraph.bare.includes('react-final-form'),
    'even with a nested copy present, the standalone entry never asks for react-final-form'
  );
}

rmSync(workspace, { recursive: true, force: true });
fixture.cleanup();

/* ── Report ──────────────────────────────────────────────────────────────── */

for (const note of notes) console.log(note);

if (failures.length) {
  console.error('\n[verify-consumers] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n[verify-consumers] OK - ${notes.length} checks across 3 consumer fixtures`);
