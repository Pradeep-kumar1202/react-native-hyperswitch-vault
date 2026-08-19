#!/usr/bin/env node
/*
 * Card-scheme artwork coverage gate.
 *
 * WHY THIS EXISTS. `CardIcons.res` uses a closed ReScript variant, which is easy to mistake for a
 * compile-time guarantee. It is not one: sdk-utils' `cardPatterns` holds issuer names as runtime
 * STRING data, and `fromDetectedName` ends in `| _ => Unrecognised`. Adding an issuer to sdk-utils
 * therefore compiles cleanly here and silently lands on the waitcard fallback — a new card brand
 * would ship showing a generic placeholder and nobody would be told.
 *
 * The runtime fallback stays exactly as it is: an unknown issuer must always render waitcard, and
 * this gate never changes that. What it adds is that a HUMAN has to classify each issuer explicitly,
 * as either HasArtwork or IntentionalWaitcardFallback, before the build passes.
 *
 * Reads the pinned submodule source and src/CardIcons.res, so it needs no compiled output.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validationSource = path.join(root, 'shared-code/sdk-utils/validation/Validation.res');
const iconsSource = path.join(root, 'src/CardIcons.res');
const assetsDir = path.join(root, 'assets');

const failures = [];
const fail = (msg) => failures.push(msg);
const die = (msg) => {
  console.error(`\n[verify-icon-coverage] FAIL: ${msg}\n`);
  process.exit(1);
};

/* ── 1. every distinct issuer sdk-utils can return ────────────────────────── */

if (!existsSync(validationSource)) die(`cannot read ${path.relative(root, validationSource)} — is the submodule initialised?`);
const validation = readFileSync(validationSource, 'utf8');
const sdkIssuers = [...new Set([...validation.matchAll(/issuer:\s*"([^"]+)"/g)].map((m) => m[1]))];
if (sdkIssuers.length === 0) die('found no `issuer: "…"` entries in Validation.res — the parser needs updating');

/* ── 2. what CardIcons explicitly classifies ──────────────────────────────── */

const icons = readFileSync(iconsSource, 'utf8');

const region = (startMarker) => {
  const start = icons.indexOf(startMarker);
  if (start === -1) die(`cannot find \`${startMarker}\` in CardIcons.res — the parser needs updating`);
  const rest = icons.slice(start + startMarker.length);
  const end = rest.indexOf('\n}');
  return rest.slice(0, end === -1 ? undefined : end);
};

/* name (as matched, lower-cased) -> variant */
const nameRegion = region('let fromDetectedName = ');
const nameToVariant = new Map();
const duplicateNames = [];
for (const m of nameRegion.matchAll(/\|\s*"([^"]+)"\s*=>\s*([A-Za-z]+)/g)) {
  const [, name, variant] = m;
  if (nameToVariant.has(name)) duplicateNames.push(name);
  nameToVariant.set(name, variant);
}
if (nameToVariant.size === 0) die('parsed no name→variant cases from `fromDetectedName`');

/* variant -> asset field, and the set that deliberately falls back */
const artworkRegion = region('let artworkFor = ');
const variantToAsset = new Map();
for (const m of artworkRegion.matchAll(/\|\s*([A-Za-z]+)\s*=>\s*assets\.([A-Za-z]+)/g)) {
  variantToAsset.set(m[1], m[2]);
}
/* A grouped branch: `| A\n | B\n | C =>\n assets.waitcard` */
const fallbackVariants = new Set();
for (const m of artworkRegion.matchAll(/((?:\|\s*[A-Za-z]+\s*\n\s*)+\|\s*[A-Za-z]+\s*)=>\s*\n?\s*assets\.waitcard/g)) {
  for (const v of m[1].matchAll(/\|\s*([A-Za-z]+)/g)) fallbackVariants.add(v[1]);
}
for (const [variant, asset] of variantToAsset) {
  if (asset === 'waitcard') fallbackVariants.add(variant);
}
if (variantToAsset.size === 0 && fallbackVariants.size === 0) die('parsed no variant→asset mapping from `artworkFor`');

/* ── 3. classify every sdk-utils issuer exactly once ──────────────────────── */

const HAS_ARTWORK = 'HasArtwork';
const FALLBACK = 'IntentionalWaitcardFallback';

const rows = [];
for (const issuer of sdkIssuers) {
  const key = issuer.trim().toLowerCase();
  const variant = nameToVariant.get(key);

  if (!variant) {
    fail(
      `sdk-utils issuer "${issuer}" is NOT classified by CardIcons.\n` +
        `      Add it to \`fromDetectedName\` and give it an explicit decision in \`artworkFor\`:\n` +
        `        - HasArtwork                  -> package artwork and map it to assets.<name>\n` +
        `        - IntentionalWaitcardFallback -> add it to the grouped waitcard branch`
    );
    rows.push({ issuer, variant: '—', classification: 'UNCLASSIFIED', asset: '—' });
    continue;
  }

  const asset = variantToAsset.get(variant);
  const isFallback = fallbackVariants.has(variant);
  const hasArtwork = Boolean(asset) && asset !== 'waitcard';

  if (hasArtwork && isFallback) {
    fail(`"${issuer}" is classified BOTH as HasArtwork (assets.${asset}) and as a waitcard fallback`);
  }
  if (!hasArtwork && !isFallback) {
    fail(`"${issuer}" maps to variant \`${variant}\`, which \`artworkFor\` does not handle`);
  }

  rows.push({
    issuer,
    variant,
    classification: hasArtwork ? HAS_ARTWORK : FALLBACK,
    asset: hasArtwork ? asset : 'waitcard',
  });
}

for (const name of duplicateNames) {
  fail(`"${name}" is matched more than once in \`fromDetectedName\``);
}

/* ── 4a. stale entries: classified here but no longer in sdk-utils ────────── */

const sdkKeys = new Set(sdkIssuers.map((i) => i.trim().toLowerCase()));
for (const [name, variant] of nameToVariant) {
  if (!sdkKeys.has(name)) {
    fail(
      `CardIcons classifies "${name}" (\`${variant}\`), which sdk-utils no longer returns — remove it, ` +
        `or confirm the pinned submodule is the intended one`
    );
  }
}

/* ── 4b. every HasArtwork mapping must have real files, at every density ──── */

for (const row of rows) {
  if (row.classification !== HAS_ARTWORK) continue;
  for (const suffix of ['', '@2x', '@3x']) {
    const file = path.join(assetsDir, `${row.asset}${suffix}.png`);
    if (!existsSync(file)) {
      fail(`"${row.issuer}" maps to assets.${row.asset} but ${path.relative(root, file)} is missing`);
    }
  }
}
/* waitcard itself must exist, since every fallback depends on it. */
for (const suffix of ['', '@2x', '@3x']) {
  const file = path.join(assetsDir, `waitcard${suffix}.png`);
  if (!existsSync(file)) fail(`the fallback artwork ${path.relative(root, file)} is missing`);
}

/* ── Report ──────────────────────────────────────────────────────────────── */

const withArtwork = rows.filter((r) => r.classification === HAS_ARTWORK);
const withFallback = rows.filter((r) => r.classification === FALLBACK);

console.log('\ncard-scheme artwork coverage');
console.log(`  ${'issuer (sdk-utils)'.padEnd(20)} ${'classification'.padEnd(28)} asset`);
console.log(`  ${'-'.repeat(20)} ${'-'.repeat(28)} ${'-'.repeat(16)}`);
for (const r of rows) {
  console.log(`  ${r.issuer.padEnd(20)} ${r.classification.padEnd(28)} ${r.asset}`);
}
console.log(
  `\n  ${sdkIssuers.length} issuers: ${withArtwork.length} with artwork, ${withFallback.length} intentional waitcard fallbacks`
);

if (failures.length) {
  console.error('\n[verify-icon-coverage] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log('\n[verify-icon-coverage] OK - every sdk-utils issuer has an explicit artwork decision');
