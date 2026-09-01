#!/usr/bin/env node
/*
 * Documentation scope gate.
 *
 * The package is merchant-only: one entry point, and no supported way for a merchant to supply or
 * receive raw card values. Code enforces that. This script enforces the other half — that the
 * DOCUMENTATION does not keep telling merchants otherwise.
 *
 * The failure mode this exists to prevent is real and already happened once: after the removal, two
 * merchant guides still carried a bolded "`/vault` accepts raw card details by design", which is a
 * security statement about a surface that no longer exists. A reader auditing the boundary would
 * have believed a raw-card entry was available.
 *
 * TWO TIERS.
 *
 *   CURRENT   merchant documentation. A forbidden term may appear on a line ONLY if that same line
 *             also marks it as removed. Naming a removed surface in order to say it is gone is
 *             useful to a migrating merchant; presenting it as available is the defect.
 *
 *   ACCEPTED  decision records that are still in force. An ADR argues for a change by naming the
 *             surface it removes, so it cannot pass the merchant-term scan and should not have to —
 *             but it is NOT historical either, and labelling it "removed design" would misdescribe
 *             the decision a reader is meant to follow. It is exempt from the term scan and must
 *             instead carry an explicit `**Status:** Accepted` line near the top, so a record cannot
 *             sit in this tier without saying it is in force.
 *
 *   HISTORICAL decision and investigation records (ADRs, the styling spike). These legitimately
 *             describe designs that no longer exist, so they are exempt from the term scan — but
 *             only if they carry an explicit "Historical / removed design" marker near the top, so
 *             a reader cannot mistake them for current guidance. A historical document that loses
 *             its marker fails here.
 *
 * Anything not listed in either tier fails as unclassified, so a new document cannot quietly avoid
 * the scan by not being mentioned.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

/* Documentation a merchant is expected to act on. */
const CURRENT = [
  'README.md',
  'docs/app-integration.md',
  'docs/control-surface.md',
  'docs/merchant-integration.md',
  'docs/manual-device-checklist.md',
  'docs/public-api-baseline.md',
  'docs/followup-sdk-utils-card-validation.md',
  /*
   * The parity inventory NAMES the surfaces it replaced — that is its whole job — so it lives in
   * the CURRENT tier and relies on the removal-marker rule: each row says what happened to the
   * feature, which is exactly the framing the scan requires.
   */
  'docs/cardelement-parity-inventory.md',
];

/* Decision and investigation records. Exempt from the term scan, but must be marked. */
const HISTORICAL = [
  'docs/adr/0001-widget-api-shape.md',
  'docs/adr/0002-merchant-public-api-contract.md',
  'docs/phase-2a-style-bridge-spike.md',
];

const HISTORICAL_MARKER = /Historical \/ removed design/;

/* Decision records still in force. Exempt from the term scan; must declare their status. */
const ACCEPTED = [
  'docs/adr/0003-remove-state-emission-and-own-final-confirmation.md',
  'docs/adr/0004-library-owns-every-new-card-flow.md',
  'docs/adr/0005-restore-card-safe-state-emission.md',
  'docs/adr/0006-default-ui.md',
  'docs/adr/0007-orchestration-entry-for-externally-tokenized-cards.md',
];
const ACCEPTED_MARKER = /\*\*Status:\*\*\s*Accepted/;

/*
 * Terms that name a removed surface or a removed contract. `/vault-session` is a merchant's own
 * backend endpoint in the examples and is not this package's subpath, so the patterns require a
 * word boundary that excludes it.
 */
const FORBIDDEN = [
  ['the /vault subpath', /(?<![\w-])\/vault(?![\w-])/],
  ['the /embedded subpath', /(?<![\w-])\/embedded(?![\w-])/],
  ['controlled fields', /controlled[ -](card )?field/i],
  /*
   * `client-core` was forbidden while the package was merchant-only and had no business naming its
   * other consumer. ADR-0003 made the client-core payment confirmation an explicitly supported flow
   * (Flow 2), so the docs must now describe it by name. `verify-flow-docs.mjs` enforces the thing
   * that actually matters — that Flow 2 is never documented as returning a token, and Flow 1 never
   * as confirming a payment.
   */
  ['caller-supplied card details', /accepts raw card details|takes a `?cardDetails|supply(ing)? raw card|pass(es|ing)? (in )?(the )?card (number|values|details)/i],
];

/*
 * A mention is allowed when it is framed as a removal. Prose wraps, so the marker is looked for
 * across a small window around the line rather than on the line alone — "…were\nremoved" is one
 * sentence, and treating it as two would force the docs to be written to suit the scanner.
 */
const REMOVAL_MARKER =
  /\bremoved\b|\bno longer\b|\bdoes not exist\b|\bdeleted\b|there is no\b|\bno [\w-]+ subpath\b|Historical \/ removed design/i;
const WINDOW = 2;

/*
 * Section-level containment. Once a heading names itself historical, the lines under it are exempt
 * until a heading of the same or shallower level ends the section — which is exactly the
 * containment the contract asks for.
 */
const headingLevel = (line) => (/^(#{1,6}) /.exec(line)?.[1].length ?? 0);

/* Fenced code blocks are examples of merchant code; they are scanned too — a code sample importing
 * a removed subpath is exactly the defect this gate is for. */

/*
 * TABLE SHAPE.
 *
 * Not a Markdown parser — a cell count. A row that drops a column renders its description in the
 * wrong place and leaves the last column empty, which is what happened when `splitCardFields` was
 * replaced by three two-cell rows in the merchant guide. Comparing each row's pipe count against
 * its own header catches that without understanding Markdown.
 *
 * Rows inside fenced code blocks are skipped, and so are rows whose cells contain an escaped pipe,
 * because the count is then no longer the column count.
 */
const checkTables = (file, lines) => {
  const offences = [];
  let fenced = false;
  let header = null;      /* { line, cells } */
  let expectSeparator = false;

  const cellCount = (line) => line.replace(/\\\|/g, '').split('|').length - 1;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (/^```/.test(line)) {
      fenced = !fenced;
      header = null;
      return;
    }
    if (fenced) return;

    const isRow = line.startsWith('|') && line.endsWith('|') && line.length > 2;
    if (!isRow) {
      header = null;
      expectSeparator = false;
      return;
    }
    if (/^\|[\s:|-]+\|$/.test(line)) {          /* the |---|---| separator */
      if (header && cellCount(line) !== header.cells) {
        offences.push(`${file}:${i + 1} separator has ${cellCount(line)} columns, header has ${header.cells}`);
      }
      expectSeparator = false;
      return;
    }
    if (!header) {
      header = { line: i + 1, cells: cellCount(line) };
      expectSeparator = true;
      return;
    }
    if (expectSeparator) return;
    const cells = cellCount(line);
    if (cells !== header.cells) {
      offences.push(
        `${file}:${i + 1} row has ${cells} column(s), the header on line ${header.line} has ${header.cells}: ${line.slice(0, 60)}`
      );
    }
  });

  check(
    offences.length === 0,
    `${file} tables have a consistent column count${offences.length ? `\n        ${offences.slice(0, 4).join('\n        ')}` : ''}`
  );
};

console.log('Current merchant documentation');

for (const file of CURRENT) {
  const full = path.join(root, file);
  if (!existsSync(full)) {
    check(false, `${file} exists`);
    continue;
  }
  const lines = readFileSync(full, 'utf8').split('\n');
  const offences = [];
  let historicalDepth = 0;
  lines.forEach((line, i) => {
    const level = headingLevel(line);
    if (level > 0) {
      if (HISTORICAL_MARKER.test(line)) historicalDepth = level;
      else if (historicalDepth > 0 && level <= historicalDepth) historicalDepth = 0;
    }
    if (historicalDepth > 0) return;

    const context = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join(' ');
    if (REMOVAL_MARKER.test(context)) return;
    for (const [label, re] of FORBIDDEN) {
      if (re.test(line)) offences.push(`${file}:${i + 1} (${label}) ${line.trim().slice(0, 80)}`);
    }
  });
  check(offences.length === 0, `${file} describes only the current surface${offences.length ? `\n        ${offences.slice(0, 4).join('\n        ')}` : ''}`);
  checkTables(file, lines);
}

console.log('\nHistorical records are labelled as such');

for (const file of HISTORICAL) {
  const full = path.join(root, file);
  if (!existsSync(full)) {
    check(false, `${file} exists`);
    continue;
  }
  const head = readFileSync(full, 'utf8').split('\n').slice(0, 12).join('\n');
  check(HISTORICAL_MARKER.test(head), `${file} carries the "Historical / removed design" marker near the top`);
}

console.log('\nAccepted decision records declare their status');

for (const file of ACCEPTED) {
  const full = path.join(root, file);
  if (!existsSync(full)) {
    check(false, `${file} exists`);
    continue;
  }
  const head = readFileSync(full, 'utf8').split('\n').slice(0, 12).join('\n');
  check(ACCEPTED_MARKER.test(head), `${file} declares "**Status:** Accepted" near the top`);
  check(!HISTORICAL_MARKER.test(head), `${file} is not also labelled historical`);
}

console.log('\nEvery document is classified');

const allDocs = ['README.md', ...walk(path.join(root, 'docs')).map((f) => path.relative(root, f))]
  .filter((f) => f.endsWith('.md'))
  .sort();
const classified = new Set([...CURRENT, ...ACCEPTED, ...HISTORICAL]);
const unclassified = allDocs.filter((f) => !classified.has(f));
check(
  unclassified.length === 0,
  `no document escapes the scan (unclassified: ${unclassified.join(', ') || 'none'})`
);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
}

console.log('\nThe accepted security statement is used where the boundary is stated');

const STATEMENT = /PAN, expiry and CVC never cross the library's supported public API/;
for (const file of ['README.md', 'docs/app-integration.md', 'docs/merchant-integration.md']) {
  check(STATEMENT.test(readFileSync(path.join(root, file), 'utf8')), `${file} uses the accepted statement`);
}

/* Claims that must never appear anywhere. */
const OVERCLAIMS = [
  ['automatic PCI-scope reduction', /reduces? your PCI scope|automatically reduces? PCI|PCI[- ]scope reduction(?! determination)/i],
  ['protection from in-process malicious code', /protects? (you )?(against|from) (malicious|hostile) code/i],
];
/*
 * Only an ASSERTION counts. A document that quotes the phrase in order to forbid it — ADR-0002
 * keeps a table of claims the package must never make — is doing the right thing, so lines that
 * negate or quote the phrase are not offences.
 */
const isAssertion = (line) => !/["\u201c\u201d]/.test(line) && !/\bnot\b|\bnever\b|\bno\b|\bdoes not\b/i.test(line);
for (const [label, re] of OVERCLAIMS) {
  const hits = [];
  for (const f of [...CURRENT, ...HISTORICAL]) {
    readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
      if (re.test(line) && isAssertion(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  check(hits.length === 0, `no document claims ${label} (${hits.join(', ') || 'none'})`);
}

if (failures.length) {
  console.error('\n[verify-docs] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-docs] OK - documentation describes the merchant-only surface');
