#!/usr/bin/env node
/*
 * FLOW DOCUMENTATION GATE.
 *
 * `verify-docs.mjs` checks that the documentation does not present REMOVED surfaces as available.
 * This checks the other failure mode, which is subtler and more dangerous: documenting the three
 * flows as if they were interchangeable.
 *
 * The three flows have different security postures, and describing one with the other's contract is
 * how a merchant ends up holding a payment credential they were never meant to see, or believing a
 * broken vault configuration silently falls back to raw card entry.
 *
 * It fails if:
 *
 *   1. the MERCHANT flow is documented as performing the final payment confirmation;
 *   2. the CLIENT-CORE flow is documented as returning a token;
 *   3. a removed state callback reappears;
 *   4. Flow 3 (vault disabled) is described as a FALLBACK for a broken vault configuration.
 *
 * Checks are scoped to a "flow section" — a heading and the prose under it — so a document may
 * legitimately discuss both flows as long as each section says the right thing about its own.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const DOCS = [
  'README.md',
  'docs/app-integration.md',
  'docs/merchant-integration.md',
  'docs/control-surface.md',
  'docs/public-api-baseline.md',
];

/* ── 3. Removed state callbacks, anywhere, in any document ─────────────────── */

const REMOVED_CALLBACKS = [
  'onStateChange',
  'onFormStateChange',
  'canSubmit',
  'fieldsReady',
  'CardFormState',
  'VaultFormState',
  'VaultFieldState',
];

/*
 * A doc may NAME a removed callback to say it is gone. The marker must be on the same line, which
 * is what stops "use onStateChange to enable your button" from passing.
 */
const REMOVAL_MARKER = /\bremoved\b|\bno longer\b|\bdoes not exist\b|\bgone\b|gets no\b|gets nothing\b|gets neither\b|\bnot exposed\b|there is no\b|gets no\b/i;

/* ── 1 & 2. Flow confusion ─────────────────────────────────────────────────── */

/*
 * Sentences that mean "this flow performs the final payment confirmation". Deliberately narrow: it
 * matches claims ABOUT confirming a payment, not incidental mentions of the word "payment".
 */
const CONFIRMS_PAYMENT = /confirms? the payment|final(?:\s+payment)? confirm|charges? the (?:customer|card)|completes? the payment/i;

/* Sentences that mean "this flow hands the caller a token". */
const RETURNS_TOKEN = /returns? (?:a |the )?(?:payment[- ]method )?token|resolves? (?:to|with) (?:a |the )?(?:payment[- ]method )?token|receives? (?:a |the )?(?:payment[- ]method )?token|you (?:get|receive) (?:a |the )?token/i;

/*
 * Section detection. A heading naming the flow opens a section; the next heading of the same or
 * shallower depth closes it. That is enough to attribute a sentence to a flow without parsing
 * Markdown properly.
 */
const MERCHANT_FLOW = /flow 1|standalone merchant|merchant tokeni[sz]ation|tokenize\(\)/i;
const CLIENT_CORE_FLOW = /flow 2|client-core|confirmpayment\(\)/i;
const VAULT_DISABLED_FLOW = /flow 3|vault disabled/i;

/*
 * Claims that the HOST owns card entry. Narrow on purpose: it matches statements about who holds
 * the fields or the card values, not incidental uses of "your app".
 */
const HOST_OWNS_CARD = /(your|the host|client-core|the app)(?:'s)?\s+(?:own\s+)?(?:card (?:entry|form|fields?|input)|PAN)|(?:keeps?|owns?|renders?|holds?|builds?)\s+(?:its|their|your)\s+own\s+card/i;

/*
 * A mention is exempt only when it is explicitly HISTORICAL or explicitly NEGATED.
 *
 * The first version of this exemption was `/no longer|used to|previously|not\b|never/`, and the bare
 * `\bnot\b` swallowed the rule whole: "When the merchant profile does NOT ask for tokenization, the
 * host keeps its own card entry" was exempted by the `not` in an unrelated clause, so the gate
 * passed over exactly the sentence it exists to catch. The negation now has to attach to the
 * ownership claim itself.
 */
const HOST_OWNS_EXEMPT = /no longer|used to|previously|formerly|\bnever\b|does not (?:own|keep|render|hold|build|collect)|is not (?:rendered|involved|responsible)/i;

const headingLevel = (line) => (/^(#{1,6}) /.exec(line)?.[1].length ?? 0);

const sectionsOf = (lines, matcher) => {
  const sections = [];
  let current = null;
  let fenced = false;
  lines.forEach((raw, index) => {
    if (/^```/.test(raw.trim())) fenced = !fenced;
    const level = fenced ? 0 : headingLevel(raw);
    if (level > 0) {
      if (current && level <= current.level) current = null;
      if (!current && matcher.test(raw)) {
        current = { level, heading: raw.trim(), lines: [] };
        sections.push(current);
        return;
      }
    }
    if (current) current.lines.push({ text: raw, number: index + 1 });
  });
  return sections;
};

console.log('Flow documentation');

for (const file of DOCS) {
  const full = path.join(root, file);
  if (!existsSync(full)) {
    check(false, `${file} exists`);
    continue;
  }
  const lines = readFileSync(full, 'utf8').split('\n');

  /*
   * 3. Removed callbacks.
   *
   * Prose wraps, so "`onStateChange` … was\nremoved" is one sentence across two lines. The marker
   * is looked for in a small WINDOW around the mention rather than on the line alone — the same rule
   * `verify-docs.mjs` uses, and for the same reason: otherwise the docs would have to be written to
   * suit the scanner.
   */
  const WINDOW = 2;
  const windowAround = (i) => lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join(' ');
  const revived = lines
    .map((text, i) => ({ text, number: i + 1, index: i }))
    .filter(({ text, index }) =>
      REMOVED_CALLBACKS.some((name) => text.includes(name)) && !REMOVAL_MARKER.test(windowAround(index))
    );
  check(
    revived.length === 0,
    `${file} presents no removed state callback as available` +
      (revived.length ? ` (line ${revived[0].number}: ${revived[0].text.trim().slice(0, 70)})` : '')
  );

  /* 1. The merchant flow must not claim to confirm the payment. */
  for (const section of sectionsOf(lines, MERCHANT_FLOW)) {
    const offending = section.lines.filter(
      ({ text }) => CONFIRMS_PAYMENT.test(text) && !/does not|never|cannot|no longer|not\b.*confirm/i.test(text)
    );
    check(
      offending.length === 0,
      `${file} — "${section.heading.slice(0, 48)}" does not claim the merchant flow confirms the payment` +
        (offending.length ? ` (line ${offending[0].number}: ${offending[0].text.trim().slice(0, 70)})` : '')
    );
  }

  /* 2. The client-core flow must not claim to return a token. */
  for (const section of sectionsOf(lines, CLIENT_CORE_FLOW)) {
    const offending = section.lines.filter(
      ({ text }) => RETURNS_TOKEN.test(text) && !/does not|never|cannot|no longer|without/i.test(text)
    );
    check(
      offending.length === 0,
      `${file} — "${section.heading.slice(0, 48)}" does not claim the client-core flow returns a token` +
        (offending.length ? ` (line ${offending[0].number}: ${offending[0].text.trim().slice(0, 70)})` : '')
    );
  }

  /* 4. Flow 3 must never be described as a fallback for a broken vault configuration. */
  for (const section of sectionsOf(lines, VAULT_DISABLED_FLOW)) {
    const offending = section.lines.filter(({ text }) => /fall(s|ing)?[ -]?back|fallback/i.test(text) && !/never|not a|no fallback|does not/i.test(text));
    check(
      offending.length === 0,
      `${file} — "${section.heading.slice(0, 48)}" does not describe the non-vault flow as a fallback` +
        (offending.length ? ` (line ${offending[0].number}: ${offending[0].text.trim().slice(0, 70)})` : '')
    );

    /*
     * 5. And it must not be described as the HOST owning card entry.
     *
     * This is what the documentation used to say, correctly, when Flow 3 meant "this library is not
     * involved". It no longer does: vaulting being off changes the request, not the owner. A doc
     * that still says the host keeps its own card fields is describing a posture that no longer
     * exists, and a merchant reading it would believe they were responsible for a PAN they never
     * receive.
     */
    const hostOwns = section.lines.filter(
      ({ text }) => HOST_OWNS_CARD.test(text) && !HOST_OWNS_EXEMPT.test(text)
    );
    check(
      hostOwns.length === 0,
      `${file} — "${section.heading.slice(0, 48)}" does not say the host owns card entry when vaulting is off` +
        (hostOwns.length ? ` (line ${hostOwns[0].number}: ${hostOwns[0].text.trim().slice(0, 70)})` : '')
    );
  }
}

/*
 * ── NON-VACUITY ──────────────────────────────────────────────────────────────
 *
 * A gate that never fires proves nothing. Run every rule against synthetic prose that violates it
 * and assert each one is caught.
 */
console.log('\nGate non-vacuity');

const violations = [
  ['a merchant section claiming to confirm the payment', '## Flow 1 — merchant tokenization\n\nThe library confirms the payment for you.\n', MERCHANT_FLOW, CONFIRMS_PAYMENT, /does not|never|cannot|no longer|not\b.*confirm/i],
  ['a client-core section claiming to return a token', '## Flow 2 — client-core\n\nThe call returns a token you can store.\n', CLIENT_CORE_FLOW, RETURNS_TOKEN, /does not|never|cannot|no longer|without/i],
];

for (const [label, markdown, sectionMatcher, offenceMatcher, exemption] of violations) {
  const lines = markdown.split('\n');
  const caught = sectionsOf(lines, sectionMatcher).some((section) =>
    section.lines.some(({ text }) => offenceMatcher.test(text) && !exemption.test(text))
  );
  check(caught, `the gate catches ${label}`);
}

const fallbackCaught = sectionsOf(
  '## Flow 3 — vault disabled\n\nIf vault details are missing we fall back to the card form.\n'.split('\n'),
  VAULT_DISABLED_FLOW
).some((section) => section.lines.some(({ text }) => /fall(s|ing)?[ -]?back|fallback/i.test(text) && !/never|not a|no fallback|does not/i.test(text)));
check(fallbackCaught, 'the gate catches Flow 3 described as a fallback');

const callbackCaught = ['Use onStateChange to enable your button.']
  .some((text) => REMOVED_CALLBACKS.some((name) => text.includes(name)) && !REMOVAL_MARKER.test(text));
check(callbackCaught, 'the gate catches a revived state callback');

const hostOwnsCaught = sectionsOf(
  '## Flow 3 — vault disabled\n\nWith vaulting off your app keeps its own card entry.\n'.split('\n'),
  VAULT_DISABLED_FLOW
).some((section) =>
  section.lines.some(({ text }) => HOST_OWNS_CARD.test(text) && !HOST_OWNS_EXEMPT.test(text))
);
check(hostOwnsCaught, 'the gate catches Flow 3 described as host-owned card entry');

/*
 * The regression that motivated the tightened exemption: an unrelated "does not" in the same
 * sentence must NOT buy an exemption for the ownership claim after it.
 */
const incidentalNot =
  'When the merchant profile does not ask for tokenization, the host keeps its own card entry.';
check(
  HOST_OWNS_CARD.test(incidentalNot) && !HOST_OWNS_EXEMPT.test(incidentalNot),
  'an incidental "does not" elsewhere in the sentence does not exempt the claim'
);

const historicalMention = 'Flow 3 used to mean your app kept its own card entry; it no longer does.';
check(
  !(HOST_OWNS_CARD.test(historicalMention) && !HOST_OWNS_EXEMPT.test(historicalMention)),
  'the gate still allows describing the old host-owned arrangement in order to say it is gone'
);

const allowedMention = 'onStateChange was removed in this release.';
check(
  !(REMOVED_CALLBACKS.some((n) => allowedMention.includes(n)) && !REMOVAL_MARKER.test(allowedMention)),
  'the gate still allows naming a removed callback in order to say it is gone'
);

if (failures.length) {
  console.error('\n[verify-flow-docs] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-flow-docs] OK - each flow is documented with its own contract');
