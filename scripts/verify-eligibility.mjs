#!/usr/bin/env node
/*
 * THE ELIGIBILITY GATE.
 *
 * Eligibility is the one PAN-dependent feature that had to move rather than be dropped: client-core
 * used to build `{payment_method_data: {card: {card_number}}}` from the card form it owned, and it
 * owns no card form any more. So the library makes the call now, and this script pins the contract
 * it is reproducing — endpoint, body shape, verdict reading, and the fail-open policy.
 *
 * ── WHY FAIL-OPEN IS ASSERTED, NOT ASSUMED ─────────────────────────────────────
 *
 * Anything that is not an explicit `deny` resolves to ALLOWED. That is the one place in the library
 * that fails open, so it is checked explicitly rather than left as a comment — and the checks below
 * are worded so that flipping the policy fails this file rather than passing it quietly.
 *
 * It is the established product contract, not an inherited accident:
 *
 *   client-core 4d1f420 "feat(api): eligibility check (#470)"       — introduced the `.catch` that
 *                                                                     allows on a transport failure
 *   client-core 94b89ee "fix: allowing the payment for all the cases and blocking for deny (#474)"
 *                                                                   — changed the response decoding
 *                                                                     FROM fail-closed TO fail-open
 *
 * A DENIAL is a different matter, and is asserted to block.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const stage = mkdtempSync(path.join(tmpdir(), 'vault-eligibility-'));
writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ type: 'module' }));

const load = async (name) => {
  const bundle = await rollup({
    input: path.join(root, `src/${name}.bs.js`),
    plugins: [nodeResolve({ rootDir: root })],
    onwarn: () => {},
  });
  const file = path.join(stage, `${name}.js`);
  await bundle.write({ file, format: 'es' });
  await bundle.close();
  return import(pathToFileURL(file).href);
};

const Eligibility = await load('VaultEligibility');

/* ── 1. The request reproduces client-core's ──────────────────────────────── */

console.log('The request reproduces client-core useEligibilityCheckHook');

check(
  Eligibility.eligibilityUrl('https://api.example.com', 'pay_123') ===
    'https://api.example.com/payments/pay_123/eligibility',
  'the endpoint is {baseUrl}/payments/{paymentId}/eligibility'
);
check(
  Eligibility.eligibilityUrl('https://api.example.com', 'pay/../evil') ===
    'https://api.example.com/payments/pay%2F..%2Fevil/eligibility',
  'a hostile payment id is percent-encoded rather than reshaping the path'
);

const body = JSON.parse(Eligibility.buildBody('4111 1111 1111 1111'));
check(body.payment_method_type === 'card', 'payment_method_type is "card"');
check(
  body.payment_method_data.card.card_number === '4111111111111111',
  'the PAN travels un-spaced under payment_method_data.card.card_number'
);
check(
  Object.keys(body.payment_method_data.card).join(',') === 'card_number',
  'the card object carries ONLY the number — no CVC, no expiry, no cardholder name'
);
check(
  Object.keys(body).sort().join(',') === 'payment_method_data,payment_method_type',
  'the body has exactly the two members client-core sent'
);

check(
  Eligibility.appIdHeader('com.example.app.hyperswitch://') === 'com.example.app',
  'the x-app-id header strips the scheme suffix, matching Utils.getHeader'
);
check(Eligibility.appIdHeader(undefined) === '', 'an absent appId sends the header blank, not "undefined"');

/* ── 2. Verdict reading ───────────────────────────────────────────────────── */

console.log('\nVerdict reading covers both shapes client-core accepted');

const verdict = (json) => Eligibility.readVerdict(json);

check(verdict({ sdk_next_action: { next_action: 'deny' } }) === 'Denied', 'the string "deny" denies');
check(
  verdict({ sdk_next_action: { next_action: { deny: {} } } }) === 'Denied',
  'an object carrying a `deny` key denies'
);
check(
  verdict({ sdk_next_action: { next_action: 'confirm' } }) === 'Allowed',
  'any other action allows'
);
check(verdict({ sdk_next_action: {} }) === 'Allowed', 'a missing next_action allows');
check(verdict({}) === 'Allowed', 'an empty response allows');
check(verdict(null) === 'Allowed', 'a null response allows');
check(
  verdict({ sdk_next_action: { next_action: { allow: {} } } }) === 'Allowed',
  'an object WITHOUT a deny key allows'
);

/*
 * Non-vacuity: the reader is not simply answering "Allowed" to everything. Exactly the two deny
 * shapes above must be the ones that block.
 */
check(
  verdict({ sdk_next_action: { next_action: 'deny' } }) !== verdict({}),
  'the reader is not vacuous: a denial and a blank response differ'
);

/* ── 3. Fail-open, stated as a check ──────────────────────────────────────── */

console.log(
  '\nAnything but an explicit deny resolves to Allowed (client-core 94b89ee; the only fail-open path)'
);

const withFetch = async (impl, run) => {
  const saved = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = saved;
  }
};

const request = {
  baseUrl: 'https://api.example.com',
  paymentId: 'pay_123',
  sdkAuthorization: 'intent',
  appId: undefined,
  cardNumber: '4111111111111111',
};

const thrown = await withFetch(
  () => Promise.reject(new Error('network down')),
  () => Eligibility.check(request)
);
check(thrown === 'Allowed', 'a thrown fetch allows');

const http500 = await withFetch(
  () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
  () => Eligibility.check(request)
);
check(http500 === 'Allowed', 'a 5xx allows');

const unparseable = await withFetch(
  () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  () => Eligibility.check(request)
);
check(unparseable === 'Allowed', 'an unreadable body allows');

/* And the happy paths still work, so the fail-open branches are not the only ones exercised. */
let seen = null;
const denied = await withFetch(
  (url, options) => {
    seen = { url, options };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ sdk_next_action: { next_action: 'deny' } }),
    });
  },
  () => Eligibility.check({ ...request, appId: 'com.example.app.hyperswitch://' })
);
check(denied === 'Denied', 'an explicit denial DENIES — the fail-open policy is not blanket');
check(seen.url === 'https://api.example.com/payments/pay_123/eligibility', 'the request went where expected');
check(seen.options.method === 'POST', 'it is a POST');
check(seen.options.headers.Authorization === 'intent', 'it authenticates with the payment-intent credential');
check(seen.options.headers['x-app-id'] === 'com.example.app', 'it sends the x-app-id header');
check(
  JSON.parse(seen.options.body).payment_method_data.card.card_number === '4111111111111111',
  'it carries the PAN the library owns'
);

const allowed = await withFetch(
  () => Promise.resolve({ ok: true, status: 200, json: async () => ({ sdk_next_action: { next_action: 'confirm' } }) }),
  () => Eligibility.check(request)
);
check(allowed === 'Allowed', 'a confirm verdict allows');

if (failures.length) {
  console.error('\n[verify-eligibility] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-eligibility] OK - the library-owned eligibility check reproduces the contract');
