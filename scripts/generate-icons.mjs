#!/usr/bin/env node
/*
 * Rasterises the approved card artwork into the PNG set the standalone form ships.
 *
 * Sources:
 *   - nine marks from the pinned `shared-code` submodule (the organisation's approved artwork);
 *   - `assets/source/cvv.svg`, which is not in shared-code and is kept here instead.
 *
 * Output: assets/<name>.png (@1x), <name>@2x.png, <name>@3x.png — the suffix convention React
 * Native's asset pipeline uses to pick a density per device scale.
 *
 * RENDERER: headless Chrome.
 *
 *   `qlmanage` was tried first and is NOT usable: QuickLook's SVG renderer draws the viewBox units
 *   as pixels and pads the result into the requested canvas, so a 24x16 viewBox produced a 24x16
 *   logo in the corner of a 90x90 transparent square. Rewriting the root width/height did not fix
 *   it. Chrome (Blink) honours width/height + viewBox correctly.
 *
 * The artwork has mixed aspect ratios (24x16, 40x24, 34x24, square), so each mark is drawn with
 * `object-fit: contain` inside a square canvas. That reproduces SVG's default
 * preserveAspectRatio="xMidYMid meet" — the behaviour client-core gets from SvgUri — and lets the
 * renderer draw every icon in one square box.
 *
 * Re-run after any artwork change:  yarn icons
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = path.join(root, 'shared-code/assets/v2/icons');
const localSource = path.join(root, 'assets/source');
const out = path.join(root, 'assets');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Brands with approved artwork, plus the two non-brand glyphs. `camera` is deliberately absent:
 * scan-card is parked. */
const ICONS = [
  'visa', 'mastercard', 'americanexpress', 'dinersclub',
  'discover', 'jcb', 'cartesbancaires', 'interac',
  'waitcard',
  'cvv',
];

const DENSITIES = [
  { suffix: '', size: 30 },
  { suffix: '@2x', size: 60 },
  { suffix: '@3x', size: 90 },
];

const sourceFor = (name) => {
  const local = path.join(localSource, `${name}.svg`);
  if (existsSync(local)) return local;
  const fromSubmodule = path.join(shared, `${name}.svg`);
  if (existsSync(fromSubmodule)) return fromSubmodule;
  throw new Error(`no source SVG for "${name}"`);
};

if (!existsSync(CHROME)) {
  console.error(`[generate-icons] FAIL: headless Chrome not found at ${CHROME}.`);
  console.error('Install Google Chrome, or re-render the assets with any faithful SVG rasteriser');
  console.error('(rsvg-convert, resvg, Inkscape) at 30 / 60 / 90 px square, object-fit: contain.');
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const staging = path.join(tmpdir(), 'vault-icon-render');
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

let written = 0;
for (const name of ICONS) {
  const src = sourceFor(name);
  for (const { suffix, size } of DENSITIES) {
    const page = path.join(staging, `${name}${suffix}.html`);
    writeFileSync(
      page,
      `<html><body style="margin:0;background:transparent">` +
        `<img src="file://${src}" style="width:${size}px;height:${size}px;object-fit:contain;display:block">` +
        `</body></html>`
    );
    const shot = path.join(staging, `${name}${suffix}.png`);
    execFileSync(
      CHROME,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--default-background-color=00000000',
        `--window-size=${size},${size}`,
        `--screenshot=${shot}`,
        `file://${page}`,
      ],
      { stdio: 'ignore' }
    );
    if (!existsSync(shot)) throw new Error(`rasterisation produced nothing for ${name}${suffix}`);
    renameSync(shot, path.join(out, `${name}${suffix}.png`));
    written++;
  }
}
rmSync(staging, { recursive: true, force: true });

console.log(`[generate-icons] OK - wrote ${written} PNG files for ${ICONS.length} icons`);
