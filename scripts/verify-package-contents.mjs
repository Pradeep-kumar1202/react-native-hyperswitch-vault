#!/usr/bin/env node
/*
 * What actually ships, and what must never ship.
 *
 * The other verification scripts prove the published API. This one proves the published ARTEFACT:
 * every file in the tarball is accounted for by category, and the bytes are scanned for the classes
 * of thing that leak by accident — machine-specific absolute paths, credentials, dangling
 * source-map references, repository-only scripts, and source from the neighbouring repositories.
 *
 * Offline and deterministic: it packs and reads, and never installs or fetches.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packFixture } from './pack-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const fixture = packFixture({ quiet: true });
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-contents-')));
mkdirSync(path.join(workspace, 'pkg'), { recursive: true });
const pkgDir = path.join(workspace, 'pkg');
execFileSync('tar', ['-xzf', fixture.tgz, '-C', pkgDir, '--strip-components', '1'], { stdio: 'ignore' });

/* Every file, relative to the package root. */
const walk = (dir, base = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
  });
const files = walk(pkgDir).sort();

/* ── 1. Every shipped file belongs to a declared category ──────────────────── */

console.log('\nShipped categories');

const CATEGORIES = [
  ['runtime JavaScript (esm)', /^dist\/esm\/.*\.js$/],
  ['runtime JavaScript (cjs)', /^dist\/cjs\/.*\.js$/],
  ['module-type markers', /^dist\/(esm|cjs)\/package\.json$/],
  ['TypeScript declarations', /^dist\/types\/.*\.d\.ts$/],
  ['image assets', /^dist\/assets\/.*\.png$/],
  ['documentation', /^(README|THIRD-PARTY-NOTICES)\.md$/],
  ['licence', /^LICENSE$/],
  ['package manifest', /^package\.json$/],
];

const uncategorised = files.filter((f) => !CATEGORIES.some(([, re]) => re.test(f)));
for (const [label, re] of CATEGORIES) {
  const matched = files.filter((f) => re.test(f));
  console.log(`  ${String(matched.length).padStart(3)}  ${label}`);
}
check(uncategorised.length === 0, `every shipped file is in a declared category (stray: ${uncategorised.join(', ') || 'none'})`);

/* ── 2. Things that must NOT ship ──────────────────────────────────────────── */

console.log('\nMust not ship');

const FORBIDDEN_PATHS = [
  ['an /embedded entry', /^dist\/(esm|cjs)\/embedded\.js$|^dist\/types\/embedded\.d\.ts$/],
  ['a /vault entry', /^dist\/(esm|cjs)\/vault\.js$|^dist\/types\/vault\.d\.ts$/],
  ['controlled-field declarations', /VaultEmbedded|CardFieldLogic\.gen|CardStateReducer\.gen/],
  ['ReScript sources or artefacts', /\.(res|resi|cmi|cmj|cmt)$|\.bs\.js$/],
  ['internal src/', /^src\//],
  ['repository-only scripts', /^scripts\//],
  ['tests', /(^|\/)(__tests__|test|tests)\/|\.(test|spec)\.[jt]sx?$/],
  ['the example app', /^example/],
  ['the shared-code submodule', /^shared-code/],
  ['source maps (excluded by files\\[\\])', /\.map$/],
  ['environment files', /(^|\/)\.env/],
  ['logs', /\.log$/],
  ['lockfiles', /(yarn\.lock|package-lock\.json|pnpm-lock\.yaml)$/],
  ['editor/OS junk', /(^|\/)(\.DS_Store|\.idea|\.vscode)/],
  ['build config', /^(rollup\.config|tsconfig|rescript\.json|babel\.config)/],
  ['design notes', /^docs\//],
];
for (const [label, re] of FORBIDDEN_PATHS) {
  const hits = files.filter((f) => re.test(f));
  check(hits.length === 0, `no ${label} (${hits.slice(0, 3).join(', ') || 'none'})`);
}

/* ── 3. Byte-level scans ───────────────────────────────────────────────────── */

console.log('\nContent scans');

const textFiles = files.filter((f) => /\.(js|ts|tsx|json|md)$/.test(f));
const contents = new Map(textFiles.map((f) => [f, readFileSync(path.join(pkgDir, f), 'utf8')]));

const scan = (label, re, { allow = () => false } = {}) => {
  const hits = [];
  for (const [file, text] of contents) {
    if (allow(file)) continue;
    const found = text.match(re);
    if (found) hits.push(`${file}: ${found[0].slice(0, 60)}`);
  }
  check(hits.length === 0, `${label} (${hits.slice(0, 2).join(' | ') || 'none'})`);
};

/* Machine-specific paths leak the builder's home directory into a published artefact. */
scan('no absolute build-machine paths', /\/(Users|home)\/[A-Za-z0-9._-]+\//);
scan('no Windows build-machine paths', /[A-Z]:\\\\Users\\\\/);

/*
 * A `sourceMappingURL` comment pointing at a map that `files[]` excludes is a dangling reference
 * every consumer receives. Rollup is configured with `sourcemap: 'hidden'` so the maps are still
 * written locally but the comment is not emitted.
 */
scan('no dangling sourceMappingURL in shipped JavaScript', /sourceMappingURL/, {
  allow: (f) => !/^dist\/(esm|cjs)\//.test(f),
});

scan('no publishable/secret keys', /\b(pk|sk)_(live|snd|test|prod)_[A-Za-z0-9]{6,}/, {
  allow: (f) => f === 'README.md',
});
scan('no bearer tokens', /Bearer\s+[A-Za-z0-9._-]{20,}/);
scan('no cloud access keys', /AKIA[0-9A-Z]{16}/);
scan('no private key blocks', /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
scan('no card-number-shaped digit runs', /(?<![0-9])[0-9]{13,19}(?![0-9])/, {
  allow: (f) => f === 'README.md',
});

/* Source from the neighbouring repositories must never be inside this package. */
scan('no client-core source', /CardVaultHook|VaultConfiguration|NavigationRouter/, {
  allow: (f) => f.endsWith('.md'),
});
scan('no unrelated sdk-utils modules', /PostalCodes|SuperpositionHelper|CountryStateDataHook/, {
  allow: (f) => f.endsWith('.md'),
});

/* ── 4. Things consumers DO need ───────────────────────────────────────────── */

console.log('\nMust ship');

for (const required of [
  'package.json', 'LICENSE', 'README.md', 'THIRD-PARTY-NOTICES.md',
  'dist/types/public.d.ts', 'dist/types/host.d.ts', 'dist/types/orchestration.d.ts',
  'dist/esm/index.js', 'dist/cjs/index.js',
  'dist/esm/host.js', 'dist/cjs/host.js',
  'dist/esm/orchestration.js', 'dist/cjs/orchestration.js',
]) {
  check(files.includes(required), `ships ${required}`);
}

const icons = files.filter((f) => /^dist\/assets\/.*\.png$/.test(f));
check(icons.length >= 30, `ships the card artwork (${icons.length} PNG files, @1x/@2x/@3x)`);
for (const icon of ['visa', 'mastercard', 'americanexpress', 'cvv', 'waitcard']) {
  check(icons.some((f) => f.includes(icon)), `ships the ${icon} artwork`);
}

const totalBytes = files.reduce((sum, f) => sum + statSync(path.join(pkgDir, f)).size, 0);
console.log(`\n  ${files.length} files, ${totalBytes} bytes unpacked, ${statSync(fixture.tgz).size} bytes packed`);

fixture.cleanup();
rmSync(workspace, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-package-contents] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-package-contents] OK - the tarball ships what consumers need and nothing else');
