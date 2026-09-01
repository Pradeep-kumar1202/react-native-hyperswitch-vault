#!/usr/bin/env node
/*
 * Executes the REAL compiled final-confirm transport (`VaultFinalConfirm`) against a mocked
 * `fetch`, and asserts every status → outcome row, the failure taxonomy, and that nothing from a
 * response body except allowlisted navigation fields can reach the outcome.
 *
 * Why this exists as a Node script rather than a component test: the module imports neither React
 * nor React Native, so its behaviour can be executed directly instead of argued about through a
 * rendered form.
 *
 * The status table below is a REPRODUCTION of client-core's confirm-response handling, which was
 * characterized first in
 * `hyperswitch-client-core/__tests__/PaymentStatusCharacterization-test.js`. Two rows are easy to
 * get wrong and are asserted explicitly:
 *   - the four "still working" statuses collapse to Processing;
 *   - `cancelled` does NOT (that is the redirect-return site's rule, not this one's).
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const stage = mkdtempSync(path.join(tmpdir(), 'vault-final-confirm-'));
writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ type: 'module' }));
const bundle = await rollup({
  input: path.join(root, 'src/VaultFinalConfirm.bs.js'),
  plugins: [nodeResolve({ rootDir: root })],
  onwarn: () => {},
});
await bundle.write({ file: path.join(stage, 'final.js'), format: 'es' });
await bundle.close();
const VaultFinalConfirm = await import(pathToFileURL(path.join(stage, 'final.js')).href);

/* ── fetch stub ───────────────────────────────────────────────────────────── */

let calls = [];
const respondWith = ({ ok = true, status = 200, body = {}, throws = false, json = undefined }) => {
  globalThis.fetch = (url, options) => {
    calls.push({ url, options });
    if (throws) return Promise.reject(new Error('network down'));
    return Promise.resolve({
      ok,
      status,
      json: json ?? (async () => body),
    });
  };
};

const baseRequest = {
  baseUrl: 'https://api.example.com',
  paymentId: 'pay_123',
  sdkAuthorization: 'intent-credential',
  body: { payment_token: 'tok_1' },
};

const run = async (overrides = {}) => {
  calls = [];
  return VaultFinalConfirm.confirmPayment({ ...baseRequest, ...overrides });
};

const tagOf = (outcome) => (typeof outcome === 'string' ? outcome : outcome.TAG);

console.log('\nStatus -> outcome (reproducing client-core confirm-response handling)');

respondWith({ body: { status: 'succeeded' } });
check(tagOf(await run()) === 'Succeeded', 'succeeded -> Succeeded');

for (const status of ['requires_capture', 'processing', 'requires_confirmation', 'requires_merchant_action']) {
  respondWith({ body: { status } });
  check(tagOf(await run()) === 'Processing', `${status} -> Processing`);
}

/*
 * The difference between the two client-core sites, pinned. If this ever flips, it is a deliberate
 * behaviour change and not a refactor.
 */
respondWith({ body: { status: 'cancelled' } });
check(
  tagOf(await run()) === 'Failed',
  'cancelled -> Failed (NOT Processing — that is the redirect-return site\'s rule)'
);

respondWith({ body: { status: 'failed' } });
check(tagOf(await run()) === 'Failed', 'failed -> Failed');

respondWith({ body: { status: 'requires_customer_action', next_action: { type: 'redirect_to_url', redirect_to_url: 'https://3ds.example/go' } } });
{
  const outcome = await run();
  check(tagOf(outcome) === 'RequiresAction', 'requires_customer_action -> RequiresAction');
  check(outcome.type_ === 'redirect_to_url', 'the redirect action carries the closed redirect_to_url type');
  check(outcome.redirectUrl === 'https://3ds.example/go', 'the redirect URL is carried through');
}

console.log('\nNext action is consulted BEFORE status (as client-core does)');

for (const [type, assertion] of [
  ['three_ds_invoke', (o) => o.threeDs?.authenticationUrl === 'https://auth.example'],
  ['invoke_ddc', (o) => o.ddc?.iframeUrl === 'https://ddc.example'],
  ['third_party_sdk_session_token', (o) => o.sessionToken?.openBankingSessionToken === 'obst_1'],
  ['display_bank_transfer_information', (o) => o.type_ === 'display_bank_transfer_information'],
]) {
  respondWith({
    body: {
      /* A status that would otherwise mean "done" — the next action must win. */
      status: 'succeeded',
      next_action: {
        type,
        three_ds_data: {
          three_ds_authentication_url: 'https://auth.example',
          three_ds_authorize_url: 'https://authorize.example',
          message_version: '2.2.0',
          directory_server_id: 'ds_1',
          poll_config: { poll_id: 'poll_1', delay_in_secs: 2, frequency: 5 },
        },
        ddc_data: { iframe_url: 'https://ddc.example', timeout_ms: 15000 },
        session_token: { wallet_name: 'open_banking', open_banking_session_token: 'obst_1' },
      },
    },
  });
  const outcome = await run();
  check(tagOf(outcome) === 'RequiresAction' && outcome.type_ === type, `${type} -> RequiresAction(${type})`);
  check(assertion(outcome), `${type} carries only its own allowlisted navigation payload`);
}

console.log('\nFailure taxonomy');

respondWith({ ok: false, status: 400, body: { error: { code: 'IR_16', message: 'SECRET-OPERATOR-TEXT' } } });
{
  const outcome = await run();
  check(tagOf(outcome) === 'Failed', 'non-2xx -> Failed');
  /*
   * The outcome carries a closed REASON, not a message, so there is no slot a backend string could
   * travel in — this asserts the structural property, not just the absence of one string.
   */
  check(!JSON.stringify(outcome).includes('SECRET-OPERATOR-TEXT'), 'the backend message is NOT forwarded');
  check(!('message' in outcome), 'a failure carries no message field at all');
  check(outcome.reason === 'SessionAlreadyUsed', 'a known backend code maps to a closed reason');
}

respondWith({ ok: false, status: 500, body: { error: { code: 'SOMETHING_NEW' } } });
check((await run()).reason === 'GenericFailure', 'an unknown backend code falls back to the generic reason');

respondWith({ ok: false, status: 401, body: { error: { code: 'IR_01' } } });
check((await run()).reason === 'Unauthorized', 'an authorization code maps to Unauthorized');

respondWith({ throws: true });
check(tagOf(await run()) === 'UnknownOutcome', 'a thrown fetch -> UnknownOutcome');

respondWith({ ok: true, status: 200, json: async () => { throw new Error('not json'); } });
check(tagOf(await run()) === 'Failed', 'an unreadable 2xx body -> Failed');

respondWith({ body: 'not-an-object' });
{
  const outcome = await run();
  check(tagOf(outcome) === 'Failed', 'a non-object 2xx body -> Failed');
  check(outcome.reason === 'MalformedResponse', 'a non-object 2xx body reports MalformedResponse');
}

/* Timeout: the abort fires before any response arrives. */
globalThis.fetch = (url, options) =>
  new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
check(tagOf(await VaultFinalConfirm.confirmPayment({ ...baseRequest, timeoutMs: 10 })) === 'UnknownOutcome',
  'a timeout -> UnknownOutcome (never a silent success)');

console.log('\nNo card data can reach the outcome');

respondWith({
  body: {
    status: 'succeeded',
    payment_method_data: { card: { card_number: '4111111111111111', card_cvc: '123', last4_digits: '1111', card_isin: '411111' } },
    payment_method: { card: { last4: '1111' } },
  },
});
{
  const outcome = await run();
  const serialized = JSON.stringify(outcome);
  for (const leak of ['4111111111111111', '123', '1111', '411111', 'card_number', 'last4']) {
    check(!serialized.includes(leak), `a response carrying ${leak} never surfaces it in the outcome`);
  }
}

console.log('\nRequest shape');

respondWith({ body: { status: 'succeeded' } });
await run({ paymentId: 'pay/with spaces&' });
check(
  calls[0].url === 'https://api.example.com/payments/pay%2Fwith%20spaces%26/confirm',
  'the payment id is percent-encoded into the path'
);
check(calls[0].options.headers.Authorization === 'intent-credential', 'the payment-intent credential is sent raw, with no scheme');
check(calls[0].options.method === 'POST', 'the call is a POST');
check(JSON.parse(calls[0].options.body).payment_token === 'tok_1', 'the prebuilt body is sent unmodified');

/* ── Non-vacuity ──────────────────────────────────────────────────────────── */

console.log('\nHarness non-vacuity');
respondWith({ body: { status: 'succeeded' } });
check(tagOf(await run()) !== 'Processing', 'the harness distinguishes outcomes (succeeded is not Processing)');

rmSync(stage, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-final-confirm] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-final-confirm] OK - the final confirm maps every outcome and leaks nothing');
