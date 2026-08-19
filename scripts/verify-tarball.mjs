#!/usr/bin/env node
/*
 * Packs the library with Yarn and asserts the tarball contents.
 *
 * Guarantees enforced here (Phase 3 amendment):
 *   - the sdk-utils submodule source directory never ships;
 *   - unrelated sdk-utils compiled modules never ship;
 *   - no ReScript source, build cache or source map ships;
 *   - no peer dependency is bundled into the artifact.
 *
 * Packing goes through `yarn pack` so the whole pipeline uses one package manager. The tarball is
 * extracted and stat-ed rather than parsed from a --json flag, because the `prepack` lifecycle
 * writes build logs to stdout and would corrupt a machine-readable payload.
 *
 * Note: `yarn pack` force-includes README/LICENSE files at ANY depth, which pulled
 * shared-code/README.md into the archive. The negative `!shared-code/**` entries in package.json
 * "files" are what suppress that — do not remove them.
 */
import { execFileSync } from 'node:child_process';
import { packFixture } from './pack-fixture.mjs';
import { readFileSync, existsSync, statSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(path.join(root, 'dist/esm/embedded.js'))) {
  console.error('[verify-tarball] FAIL: dist/ is missing. Run `yarn build` first.');
  process.exit(1);
}

/*
 * Artwork coverage runs first: a tarball whose icon mapping has drifted from sdk-utils is not worth
 * inspecting further.
 */
execFileSync('node', [path.join(root, 'scripts/verify-icon-coverage.mjs')], { stdio: 'inherit' });

/* Packed to a unique path outside the repository — see scripts/pack-fixture.mjs. */
const fixture = packFixture();
const tgz = fixture.tgz;

/*
 * Extract to a temp dir and stat the files rather than parsing `tar -tzv`: the column layout of
 * verbose tar output differs between BSD and GNU tar, and mis-parsing it silently reports 0-byte
 * entries, which would hide a size regression.
 */
const stage = mkdtempSync(path.join(tmpdir(), 'vault-tarball-'));
execFileSync('tar', ['-xzf', tgz, '-C', stage]);
const pkgRoot = path.join(stage, 'package');
const walk = (dir, base = '') => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ path: rel, size: statSync(abs).size });
  }
  return out;
};
const listing = walk(pkgRoot).sort((a, b) => a.path.localeCompare(b.path));

const failures = [];
const forbidden = [
  [/^shared-code\//, 'sdk-utils submodule source directory'],
  [/(^|\/)\.git($|\/)/, 'git metadata'],
  [/^src\//, 'ReScript source'],
  [/\.res$/, 'ReScript source file'],
  [/^lib\//, 'ReScript build cache (lib/bs, lib/ocaml)'],
  [/\.bs\.js$/, 'unbundled ReScript per-module output'],
  [/\.gen\.tsx$/, 'genType intermediate TypeScript (declarations ship instead)'],
  [/\.map$/, 'source map — its sourcesContent embeds compiled sdk-utils source'],
  [/\.env/, 'environment file'],
  [/(^|\/)node_modules\//, 'node_modules'],
  [/\.svg$/, 'source SVG artwork (only rasterised PNGs ship)'],
  [/camera.*\.png$/i, 'camera artwork (scan-card is parked)'],
  [/^assets\/source\//, 'artwork source directory'],
  [/PostalCodes/i, 'unrelated sdk-utils module (postal codes for all countries)'],
  [/CpfValidation|CnpjValidation/i, 'unrelated sdk-utils module (BR tax-ID validation)'],
  [/CardValidations|CardPattern/i, 'near-dead duplicate sdk-utils validation module'],
];

for (const e of listing) {
  for (const [re, why] of forbidden) {
    if (re.test(e.path)) failures.push(`tarball contains ${e.path} (${why})`);
  }
}

/* Required content. */
for (const required of [
  'dist/esm/index.js',
  'dist/cjs/index.js',
  'dist/esm/embedded.js',
  'dist/cjs/embedded.js',
  'dist/esm/vault.js',
  'dist/cjs/vault.js',
  'dist/types/vault.d.ts',
  'dist/types/public.d.ts',
  'dist/types/merchantTypes.d.ts',
  'dist/types/embedded.d.ts',
  'README.md',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'package.json',
]) {
  if (!listing.some((e) => e.path === required)) {
    failures.push(`tarball is missing required file ${required}`);
  }
}

/*
 * Packaged artwork: every icon must be present at all three densities. A missing @2x/@3x does not
 * fail loudly at runtime — React Native silently falls back to another density and the icon renders
 * blurry — so it has to be caught here.
 */
const ICONS = [
  'visa', 'mastercard', 'americanexpress', 'dinersclub', 'discover',
  'jcb', 'cartesbancaires', 'interac', 'waitcard', 'cvv',
];
for (const icon of ICONS) {
  for (const suffix of ['', '@2x', '@3x']) {
    const asset = `dist/assets/${icon}${suffix}.png`;
    if (!listing.some((e) => e.path === asset)) {
      failures.push(`tarball is missing packaged artwork ${asset}`);
    }
  }
}
const packagedIcons = listing.filter((e) => e.path.startsWith('dist/assets/') && e.path.endsWith('.png'));
if (packagedIcons.length !== ICONS.length * 3) {
  failures.push(
    `expected ${ICONS.length * 3} packaged PNG files, found ${packagedIcons.length} — an unexpected asset is shipping`
  );
}

/* No unrelated sdk-utils module may survive tree-shaking, in ANY entry. */
const bundle = listing
  .filter((e) => e.path.endsWith('.js') && !e.path.endsWith('.d.ts'))
  .map((e) => readFileSync(path.join(pkgRoot, e.path), 'utf8'))
  .join('\n');
const bundleChecks = [
  ['postalCode table', /defaultPostalCode/],
  ['CPF validation', /isValidCPF/],
  ['CNPJ validation', /isValidCNPJ/],
  /*
   * String literals from the same modules. Identifier names disappear under a minifier, so these
   * are what keep the check meaningful if the published output is ever minified, and they are what
   * make the equivalent grep over a merchant's Metro bundle worth anything.
   */
  ['postalCode country data', /Afghanistan|Postal code lookup/],
];
for (const [what, re] of bundleChecks) {
  if (re.test(bundle)) failures.push(`bundle still contains ${what}`);
}

/*
 * react-final-form is inlined into the ROOT entry on purpose (a merchant then installs exactly one
 * package) and must stay external in /embedded, which has to resolve the HOST's instance — two
 * copies means two React contexts, and react-final-form's own useForm() guard throws rather than
 * degrading quietly. Checked per entry by walking each one's own chunk graph;
 * `scripts/verify-consumers.mjs` proves the same thing again against real consumer fixtures.
 */
const graphSource = (entry) => {
  const seen = new Set();
  const read = (rel) => {
    const abs = path.join(pkgRoot, rel);
    if (seen.has(rel) || !existsSync(abs)) return '';
    seen.add(rel);
    const source = readFileSync(abs, 'utf8');
    let combined = source;
    for (const match of source.matchAll(/(?:from|require\()\s*['"](\.[^'"]+)['"]/g)) {
      combined += read(path.posix.join(path.posix.dirname(rel), match[1]));
    }
    return combined;
  };
  return read(entry);
};

for (const format of ['esm', 'cjs']) {
  if (/createForm/.test(graphSource(`dist/${format}/embedded.js`))) {
    failures.push(`dist/${format}/embedded.js bundles react-final-form; it must resolve the host's copy`);
  }
  if (!/createForm/.test(graphSource(`dist/${format}/index.js`))) {
    failures.push(
      `dist/${format}/index.js does not bundle react-final-form; a standalone merchant would have to install it`
    );
  }
  if (/(?:from|require\()\s*['"]react(-native)?['"]/.test(graphSource(`dist/${format}/vault.js`))) {
    failures.push(`dist/${format}/vault.js pulls in React or React Native; the transport must be free of both`);
  }
}

/* Bundling third-party MIT code into the root entry requires shipping its notices. */
const notices = readFileSync(path.join(pkgRoot, 'THIRD-PARTY-NOTICES.md'), 'utf8');
for (const dependency of ['react-final-form', 'final-form', '@babel/runtime']) {
  if (!notices.includes(dependency)) {
    failures.push(`THIRD-PARTY-NOTICES.md does not cover bundled dependency ${dependency}`);
  }
}

const compressed = statSync(tgz).size;
const unpacked = listing.reduce((a, e) => a + e.size, 0);

console.log(`\ntarball: ${path.basename(tgz)} (packed to a unique temp path)`);
console.log(`  files:      ${listing.length}`);
console.log(`  compressed: ${(compressed / 1024).toFixed(1)} KiB`);
console.log(`  unpacked:   ${(unpacked / 1024).toFixed(1)} KiB`);
const artworkBytes = packagedIcons.reduce((a, e) => a + e.size, 0);
console.log(`  artwork:    ${(artworkBytes / 1024).toFixed(1)} KiB (${packagedIcons.length} PNG files)`);
console.log('\ncontents:');
for (const e of listing) console.log(`  ${String(e.size).padStart(8)}  ${e.path}`);

fixture.cleanup();

if (failures.length) {
  console.error('\n[verify-tarball] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-tarball] OK - no forbidden content, no bundled peers');
