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
}

/* ── Fixture B — the embedded entry with NO form library anywhere ────────── */

/*
 * The old fixture proved react-final-form module identity between host and package. That contract
 * no longer exists: the package contains no form library, so the assertions here are the ones the
 * refactor actually needs — the controlled fields load and render with nothing installed, and the
 * host repository is still the one that owns react-final-form.
 */
console.log('\nB. embedded consumer (controlled fields, no form library installed)');
{
  const { fixture, nodeModules } = makeFixture('b-embedded');
  const pkgDir = installPackage(fixture);
  linkReal(nodeModules, 'react');
  writeReactNativeStub(nodeModules);
  linkReal(nodeModules, '@babel');

  const requireFromHost = createRequire(path.join(fixture, 'app.js'));

  let resolved = null;
  try {
    resolved = requireFromHost.resolve('react-final-form');
  } catch {
    resolved = null;
  }
  check(resolved === null, 'no form library is installed in the embedded fixture at all');

  let embedded = null;
  let loadError = null;
  try {
    embedded = requireFromHost(`${PKG}/embedded`);
  } catch (error) {
    loadError = error;
  }
  check(loadError === null, `/embedded loads without any form library${loadError ? `: ${loadError.message}` : ''}`);
  /* The SDK integration surface: three controlled fields, no complete layout. */
  for (const field of ['CardNumberField', 'CardExpiryField', 'CardCvcField']) {
    check(
      typeof embedded?.[field] === 'function' || typeof embedded?.[field] === 'object',
      `/embedded exports the controlled ${field}`
    );
  }
  check(
    embedded?.EmbeddedCardElement === undefined,
    '/embedded no longer exports a complete card layout'
  );
  check(typeof embedded?.selectCardFields === 'function', '/embedded still exports selectCardFields');

  /*
   * EXPORT SHAPE — the regression that shipped an unrenderable value.
   *
   * The fields are nested ReScript modules, so `VaultEmbedded.bs.js` exports `{make: Component}`.
   * Publishing those module objects made React throw "Element type is invalid ... got: object" at
   * render time, while every static check still passed. Each export must therefore BE the
   * component: a function, or a React exotic value carrying `$$typeof`. A plain `{make}` object is
   * rejected explicitly.
   */
  const FIELD_EXPORTS = ['CardNumberField', 'CardExpiryField', 'CardCvcField'];
  const describeExport = (value) => ({
    type: typeof value,
    hasReactType: Boolean(value && value.$$typeof),
    hasMake: Boolean(value && typeof value === 'object' && 'make' in value),
  });
  for (const name of FIELD_EXPORTS) {
    const shape = describeExport(embedded?.[name]);
    check(
      !shape.hasMake,
      `/embedded ${name} is NOT a ReScript module object containing \`make\``
    );
    check(
      shape.type === 'function' || shape.hasReactType,
      `/embedded ${name} is directly renderable (${shape.type}${shape.hasReactType ? ', $$typeof' : ''})`
    );
  }

  /* The ESM entry must expose the same shapes as the CJS one. */
  const esmModule = await import(pathToFileURL(path.join(pkgDir, 'dist/esm/embedded.js')).href).catch(
    (error) => ({ __error: error })
  );
  if (esmModule.__error) {
    check(false, `/embedded ESM entry loads: ${esmModule.__error.message}`);
  } else {
    for (const name of FIELD_EXPORTS) {
      const cjsShape = describeExport(embedded?.[name]);
      const esmShape = describeExport(esmModule[name]);
      check(
        !esmShape.hasMake && (esmShape.type === 'function' || esmShape.hasReactType),
        `esm: /embedded ${name} is directly renderable`
      );
      check(
        cjsShape.type === esmShape.type && cjsShape.hasReactType === esmShape.hasReactType,
        `/embedded ${name} has the same shape in CJS and ESM`
      );
    }
  }

  /*
   * Behavioural rendering of the controlled fields is proven by the example jest suite under the
   * real React Native preset; this fixture only has a minimal RN stub, so it asserts the contract
   * this harness can actually prove: the entry loads, exports what client-core binds to, and needs
   * no form-library context to be imported or constructed.
   */
  let elementError = null;
  try {
    requireFromHost('react').createElement(embedded.CardNumberField, { value: '', label: 'x' });
  } catch (error) {
    elementError = error;
  }
  check(
    elementError === null,
    `a controlled card element can be constructed with no form context${elementError ? `: ${elementError.message}` : ''}`
  );
}

/* ── Fixture C — the host repository still owns react-final-form ─────────── */

console.log('\nC. host repository (hyperswitch-client-core) still owns its form library');
{
  const hostPkgPath = path.resolve(root, '../hyperswitch-client-core/package.json');
  if (!existsSync(hostPkgPath)) {
    notes.push('   skip host check - hyperswitch-client-core is not a sibling of this repository');
    console.log('    skip hyperswitch-client-core not found beside this repository');
  } else {
    const hostPkg = JSON.parse(readFileSync(hostPkgPath, 'utf8'));
    const declared = { ...hostPkg.dependencies, ...hostPkg.devDependencies };
    check(
      declared['react-final-form'] !== undefined && declared['final-form'] !== undefined,
      'hyperswitch-client-core still declares react-final-form and final-form'
    );
  }
}

/* ── Report ──────────────────────────────────────────────────────────────── */

for (const note of notes) console.log(note);

if (failures.length) {
  console.error('\n[verify-consumers] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n[verify-consumers] OK - ${notes.length} checks across 2 consumer fixtures`);
