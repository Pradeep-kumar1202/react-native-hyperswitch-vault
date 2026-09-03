#!/usr/bin/env node
/*
 * Executes the REAL compiled saved-card transport (`VaultSavedCard`) against a mocked `fetch`, and
 * pins OUR side of the ADR-0008 contract: the method, the URL, the header set, the request body,
 * the one token path, and every refusal.
 *
 * ── LAYER 1 OF TWO ─────────────────────────────────────────────────────────────
 *
 * This is the deterministic, offline gate, and it runs on every change. It PREVENTS DRIFT: a green
 * run says the SDK still sends what ADR-0008 decided it should send. It says nothing about whether
 * the server agrees — `scripts/smoke-saved-card.mjs` (Layer 2, credentials required, never a CI
 * gate) is what DETECTS ERROR against the live sandbox. A green Layer 1 on a wrong URL is exactly as
 * green as a green Layer 1 on a right one, which is why the two are kept apart and named.
 *
 * Why a Node script rather than a component test: the module imports neither React nor React
 * Native, so its behaviour can be executed directly instead of argued about through a rendered
 * form. `example/__tests__/savedCardCvc.test.tsx` covers the component around it.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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

const stage = mkdtempSync(path.join(tmpdir(), 'vault-saved-card-'));
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

const SavedCard = await load('VaultSavedCard');
/* The shared decoder, loaded on its own so the CLOSED internal code can be pinned as well. */
const Confirm = await load('VaultConfirm');

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const envelope = (parts) => Buffer.from(parts.join(','), 'utf8').toString('base64');
const SESSION_ID = 'pms/with space&';
const AUTHORIZATION = envelope([
  'publishable_key=pk_snd_EXAMPLE_FAKE',
  `payment_method_session_id=${SESSION_ID}`,
  'profile_id=pro_EXAMPLE_FAKE',
]);
const BASE = 'https://vault.example.com/api';
const INPUT_TOKEN = 'token_from_list_payment_methods';
const RESPONSE_TOKEN = 'token_from_the_response';
const CVC = '9876';

const okBody = (token = RESPONSE_TOKEN) => ({
  associated_payment_methods: [
    { payment_method_token: { type: 'payment_method_session_token', data: token } },
  ],
  payment_method_data: { card: { last4_digits: '4242', card_isin: '424242', expiry_month: '12', expiry_year: '2030' } },
});

/* ── fetch stub ───────────────────────────────────────────────────────────── */

let calls = [];
const respondWith = ({ ok = true, status = 200, body = {}, throws = false, json = undefined, hang = false }) => {
  globalThis.fetch = (url, options) => {
    calls.push({ url, options });
    if (throws) return Promise.reject(new Error('network down'));
    return new Promise((resolve, reject) => {
      const abort = () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (options?.signal?.aborted) return abort();
      options?.signal?.addEventListener('abort', abort);
      if (hang) return;
      resolve({ ok, status, json: json ?? (async () => body) });
    });
  };
};

const baseRequest = {
  vaultBaseUrl: BASE,
  sdkAuthorization: AUTHORIZATION,
  paymentMethodToken: INPUT_TOKEN,
  cvc: CVC,
};

const run = async (overrides = {}) => {
  calls = [];
  return SavedCard.updateSavedPaymentMethod({ ...baseRequest, ...overrides });
};

const codeOf = (result) => `${result.status}/${result.error?.code ?? '-'}`;

/* ── Wire exactness ───────────────────────────────────────────────────────── */

console.log('\nWire exactness (ADR-0008: PUT, the route, the header set, the body)');

respondWith({ body: okBody() });
{
  const result = await run();
  check(calls.length === 1, 'a well-formed request opens exactly one fetch');
  const { url, options } = calls[0];

  check(options.method === 'PUT', 'the method is PUT, not POST');
  check(
    url === `${BASE}/v1/payment-method-sessions/${encodeURIComponent(SESSION_ID)}/update-saved-payment-method`,
    `the URL is exactly {base}/v1/payment-method-sessions/{encodedId}/update-saved-payment-method (got: ${url})`
  );
  check(!/\/confirm(\b|$)/.test(url), 'the URL is NOT the session confirm route');
  check(url.includes(encodeURIComponent(SESSION_ID)) && !url.includes(SESSION_ID), 'the session id is percent-encoded into the path');

  const headers = options.headers;
  const headerNames = Object.keys(headers).sort();
  check(
    headerNames.join(',') === ['Authorization', 'Content-Type', 'x-app-id', 'x-redirect-uri'].join(','),
    `the header set is exactly the session confirm's (got: ${headerNames.join(', ')})`
  );
  check(headers.Authorization === AUTHORIZATION, 'Authorization is the raw sdkAuthorization, no scheme, nothing decoded');
  check(!headerNames.some((h) => /^x-profile-id$/i.test(h)), 'no X-Profile-Id is sent (the SDK-auth path does not read one)');
  check(!headerNames.some((h) => /^api-key$/i.test(h)), 'no api-key header is sent');
  check(
    !Object.values(headers).some((v) => /publishable-key=|client-secret=/.test(String(v))),
    'no header synthesises the publishable-key / client-secret fallback form'
  );
  check(headers['x-app-id'] === '', 'x-app-id is sent blank when no app id is given (as client-core does)');
  check(headers['Content-Type'] === 'application/json', 'Content-Type is application/json');

  const raw = options.body;
  const body = JSON.parse(raw);
  check(
    Object.keys(body).sort().join(',') === 'payment_method_data,payment_method_token',
    `the body has exactly payment_method_token and payment_method_data (got: ${Object.keys(body).join(', ')})`
  );
  check(body.payment_method_token === INPUT_TOKEN, 'payment_method_token is the merchant\'s token, unmodified');
  check(
    Object.keys(body.payment_method_data).join(',') === 'card',
    `payment_method_data holds only card (got: ${Object.keys(body.payment_method_data).join(', ')})`
  );
  check(
    Object.keys(body.payment_method_data.card).join(',') === 'card_cvc',
    `card holds only card_cvc (got: ${Object.keys(body.payment_method_data.card).join(', ')})`
  );
  check(body.payment_method_data.card.card_cvc === CVC, 'card_cvc is the CVC the component collected');
  for (const forbidden of ['card_holder_name', 'nick_name', 'card_number', 'card_exp_month', 'card_exp_year', 'card_network', 'payment_method_type', 'client_secret']) {
    check(!raw.includes(forbidden), `the body carries no ${forbidden}`);
  }

  check(result.status === 'success', 'a 2xx with a token resolves success');
  check(result.token === RESPONSE_TOKEN, 'the token returned is the one the RESPONSE carries, not the one passed in');
  check(result.token !== INPUT_TOKEN, '(control) the fixture\'s response token differs from the input token');
  check(Object.keys(result).sort().join(',') === 'status,token', 'a success carries status and token, nothing else');
}

respondWith({ body: okBody() });
await run({ appId: 'com.example.app.hyperswitch://' });
check(calls[0].options.headers['x-app-id'] === 'com.example.app', 'x-app-id strips the .hyperswitch:// suffix exactly as client-core does');

respondWith({ body: okBody() });
await run({ paymentMethodToken: `  ${INPUT_TOKEN}  ` });
check(JSON.parse(calls[0].options.body).payment_method_token === INPUT_TOKEN, 'surrounding whitespace on the token is trimmed before it is sent');

/* ── The one token path ───────────────────────────────────────────────────── */

console.log('\nThe token is read from associated_payment_methods[0].payment_method_token.data and nowhere else');

respondWith({ body: { associated_token_id: 'a_different_kind_of_identifier' } });
{
  const result = await run();
  check(codeOf(result) === 'error/server_error', `a 2xx carrying only associated_token_id is a closed failure, never a token (got: ${codeOf(result)})`);
  check(!JSON.stringify(result).includes('a_different_kind_of_identifier'), 'the other identifier is not returned as a token');
  const closed = Confirm.decodeConfirmResponse({ associated_token_id: 'x' }, 200);
  check(closed.status === 'failure' && closed.error.code === 'missing_token', 'the shared decoder reports the closed code missing_token for that response');
}

respondWith({ body: { associated_payment_methods: [] } });
check(codeOf(await run()) === 'error/server_error', 'an empty associated_payment_methods is a closed failure');

respondWith({ body: { associated_payment_methods: [{ payment_method_token: { type: 'payment_method_session_token' } }] } });
check(codeOf(await run()) === 'error/server_error', 'an entry without .data is a closed failure');

respondWith({
  body: {
    associated_payment_methods: [
      { payment_method_token: { type: 'payment_method_session_token', data: 'tok_first' } },
      { payment_method_token: { type: 'payment_method_session_token', data: 'tok_second' } },
    ],
  },
});
{
  const result = await run();
  check(result.token === 'tok_first', 'with several entries, index 0 is the one read (the backend moves the updated card to the front)');
}

/* ── Refusals before anything is sent ─────────────────────────────────────── */

console.log('\nRefusals cost zero requests');

for (const [token, label] of [['', 'an empty token'], ['   ', 'a whitespace-only token']]) {
  respondWith({ body: okBody() });
  const result = await run({ paymentMethodToken: token });
  check(codeOf(result) === 'not_ready/not_ready' && calls.length === 0, `${label} is refused as not_ready with no request — omitting it would mint a NEW token`);
}

for (const [cvc, label] of [['', 'an empty CVC'], ['12', 'a two-digit CVC'], ['12345', 'a five-digit CVC']]) {
  respondWith({ body: okBody() });
  const result = await run({ cvc });
  check(codeOf(result) === 'validation_error/invalid_card_data' && calls.length === 0, `${label} is refused as validation_error with no request`);
}

respondWith({ body: okBody() });
{
  const result = await run({ sdkAuthorization: '!!! not base64 !!!' });
  check(codeOf(result) === 'error/invalid_session' && calls.length === 0, 'an undecodable sdkAuthorization is invalid_session with no request');
}
respondWith({ body: okBody() });
{
  const result = await run({ sdkAuthorization: envelope(['publishable_key=pk', 'profile_id=pro']) });
  check(codeOf(result) === 'error/invalid_session' && calls.length === 0, 'an envelope without a session id is invalid_session with no request');
}
respondWith({ body: okBody() });
{
  const result = await run({ sdkAuthorization: '' });
  check(codeOf(result) === 'error/invalid_session' && calls.length === 0, 'a blank sdkAuthorization is invalid_session with no request');
}

/* ── Failure taxonomy ─────────────────────────────────────────────────────── */

console.log('\nFailures are closed codes; the backend message never surfaces');

respondWith({ ok: false, status: 401, body: { error: { code: 'IR_01', message: 'SECRET-OPERATOR-TEXT' } } });
{
  const result = await run();
  check(codeOf(result) === 'error/server_error', '401 -> error/server_error');
  check(!JSON.stringify(result).includes('SECRET-OPERATOR-TEXT'), 'the backend message is NOT forwarded');
  check(typeof result.error.message === 'string' && result.error.message.length > 0, 'a library-owned message is present instead');
}
respondWith({ ok: false, status: 404, body: { error: { code: 'HE_02', message: 'No associated payment method found in the session' } } });
{
  const result = await run();
  check(codeOf(result) === 'error/server_error', '404 (a token not associated with this session) -> error/server_error');
  check(!JSON.stringify(result).includes('associated'), 'that backend message is not forwarded either');
}
respondWith({ ok: false, status: 500, body: {} });
check(codeOf(await run()) === 'error/server_error', '500 -> error/server_error');
respondWith({ ok: false, status: 400, json: async () => { throw new Error('not json'); } });
check(codeOf(await run()) === 'error/server_error', 'a non-2xx with an unreadable body -> error/server_error');
respondWith({ ok: true, status: 200, json: async () => { throw new Error('not json'); } });
check(codeOf(await run()) === 'error/server_error', 'a 2xx with an unreadable body -> error/server_error');
respondWith({ body: 'not-an-object' });
check(codeOf(await run()) === 'error/server_error', 'a 2xx non-object body -> error/server_error');

respondWith({ throws: true });
check(codeOf(await run()) === 'error/unknown_outcome', 'a thrown fetch -> error/unknown_outcome');

respondWith({ hang: true });
check(codeOf(await run({ timeoutMs: 10 })) === 'error/unknown_outcome', 'a timeout -> error/unknown_outcome (never a silent success)');

{
  respondWith({ hang: true });
  const controller = new AbortController();
  const pending = run({ signal: controller.signal });
  controller.abort();
  check(codeOf(await pending) === 'error/unknown_outcome', 'a caller abort mid-flight -> error/unknown_outcome');
}
{
  respondWith({ body: okBody() });
  const controller = new AbortController();
  controller.abort();
  check(codeOf(await run({ signal: controller.signal })) === 'error/unknown_outcome', 'an already-aborted caller signal -> error/unknown_outcome');
}

/* ── Nothing sensitive in any outcome ─────────────────────────────────────── */

console.log('\nNo CVC and no credential reaches any outcome');

{
  const outcomes = [];
  respondWith({ body: okBody() });
  outcomes.push(await run());
  respondWith({ ok: false, status: 400, body: { error: { code: 'IR_05', message: `cvc ${CVC} rejected` } } });
  outcomes.push(await run());
  respondWith({ throws: true });
  outcomes.push(await run());
  respondWith({ body: okBody() });
  outcomes.push(await run({ cvc: '' }));
  for (const outcome of outcomes) {
    const serialized = JSON.stringify(outcome);
    check(!serialized.includes(CVC), `an outcome (${codeOf(outcome)}) never carries the CVC`);
    check(!serialized.includes(AUTHORIZATION), `an outcome (${codeOf(outcome)}) never carries the credential`);
  }
  check(outcomes.slice(1).every((o) => o.token === undefined), 'only a success carries a token');
}

/* ── Non-vacuity ──────────────────────────────────────────────────────────── */

console.log('\nHarness non-vacuity');
respondWith({ body: okBody() });
check(codeOf(await run()) !== 'error/server_error', 'the harness distinguishes outcomes (success is not server_error)');
check(typeof SavedCard.updateSavedPaymentMethod === 'function', 'the transport is the compiled module, not a stub');

rmSync(stage, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-saved-card] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-saved-card] OK - the saved-card transport sends exactly what ADR-0008 decided, and leaks nothing');
