#!/usr/bin/env node
/*
 * Executes the REAL compiled orchestration entrypoint (`VaultOrchestration`) against a mocked
 * `fetch`, and asserts the externally-tokenized confirm contract end to end.
 *
 * WHO THIS SURFACE IS FOR. `confirmTokenizedCardPayment` is not merchant-facing: it exists for
 * @juspay-tech/react-native-hyperswitch-payment-methods, which owns the third-party vault
 * providers (VGS today), parses their responses, and hands this library a canonical
 * provider-tokenized card. The library then owns the one and only `/payments/{id}/confirm`
 * implementation — same transport, same sanitization, same result type as the form flows.
 *
 * THE THREE GUARANTEES:
 *
 *   1. WIRE EXACTNESS — the canonical card becomes `payment_method_data.vault_card` with the
 *      backend's field names (`ProxyCardData`: card_number/card_cvc are the ALIASES, expiry is
 *      normalised, `last_four`/`bin_number` are provider-reported or ABSENT). No metadata is ever
 *      derived from an alias: an absent last_four stays absent even when the alias is 16 digits.
 *   2. FAIL BEFORE SEND — blank required aliases, a blank credential, an invalid endpoint, or a
 *      card key inside host data refuse the submission with zero network calls.
 *   3. SANITIZED RESULT — the caller receives `vaultPaymentResult` and nothing else: no token
 *      member, no raw response, only allowlisted navigation fields.
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

const stage = mkdtempSync(path.join(tmpdir(), 'vault-orchestration-'));
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

const Orchestration = await load('VaultOrchestration');
const Body = await load('VaultConfirmBody');

/* ── fetch stub ───────────────────────────────────────────────────────────── */

let calls = [];
const respondWith = ({ ok = true, status = 200, body = {}, throws = false }) => {
  globalThis.fetch = (url, options) => {
    calls.push({ url, options });
    if (throws) return Promise.reject(new Error('network down'));
    return Promise.resolve({ ok, status, json: async () => body });
  };
};

const card = {
  cardNumberAlias: 'tok_sandbox_4242424242424242',
  cardCvcAlias: 'tok_sandbox_cvc_998',
  expiryMonth: '3',
  expiryYear: '30',
};

const baseInput = {
  tokenizedCard: card,
  paymentId: 'pay_123',
  sdkAuthorization: 'intent-credential',
  environment: 'production',
  endpoint: { baseUrl: 'https://api.example.com' },
};

const run = async (overrides = {}) => {
  calls = [];
  return Orchestration.confirmTokenizedCardPayment({ ...baseInput, ...overrides });
};

const sentBody = () => JSON.parse(calls[0].options.body);

/* ── 1. Wire exactness ────────────────────────────────────────────────────── */

console.log('\nThe canonical tokenized card becomes payment_method_data.vault_card');

respondWith({ body: { status: 'succeeded' } });
let result = await run();

check(calls.length === 1, 'exactly one request is sent');
check(
  calls[0].url === 'https://api.example.com/payments/pay_123/confirm',
  `the final confirm URL is used (got: ${calls[0]?.url})`
);
check(calls[0].options.method === 'POST', 'the request is a POST');
check(
  calls[0].options.headers.Authorization === 'intent-credential',
  'the payment-intent credential is the Authorization header, raw'
);
check(calls[0].options.headers['x-redirect-uri'] === '', 'x-redirect-uri is sent blank');

let body = sentBody();
check(body.payment_method === 'card', 'payment_method is card');
check(body.payment_method_type === 'credit', 'payment_method_type defaults to credit');
check(body.payment_token === undefined, 'no top-level payment_token exists in this flow');
check(body.client_secret === undefined, 'client_secret is never sent');

let vaultCard = body.payment_method_data?.vault_card;
check(vaultCard !== undefined, 'the card subtree is payment_method_data.vault_card');
check(vaultCard.card_number === 'tok_sandbox_4242424242424242', 'card_number carries the alias verbatim');
check(vaultCard.card_cvc === 'tok_sandbox_cvc_998', 'card_cvc carries the CVC alias verbatim');
check(vaultCard.card_exp_month === '03', 'a single-digit month is normalised to two digits');
check(vaultCard.card_exp_year === '2030', 'a two-digit year is expanded to four digits');
check(!('card' in (body.payment_method_data ?? {})), 'no plain card subtree is built');

console.log('\nMetadata is provider-reported or absent — never derived from the alias');

respondWith({ body: { status: 'succeeded' } });
await run({ tokenizedCard: { ...card, cardNumberAlias: '4111111111111111' } });
vaultCard = sentBody().payment_method_data.vault_card;
check(
  !('last_four' in vaultCard),
  'an absent last_four stays ABSENT even when the alias is 16 numeric digits'
);
check(
  !('bin_number' in vaultCard),
  'an absent bin_number stays ABSENT even when the alias is 16 numeric digits'
);

respondWith({ body: { status: 'succeeded' } });
await run({
  tokenizedCard: {
    ...card,
    cardHolderName: '  Jane Doe  ',
    cardNetwork: 'Visa',
    lastFour: '4242',
    binNumber: '424242',
    nickName: 'Work card',
  },
});
vaultCard = sentBody().payment_method_data.vault_card;
check(vaultCard.last_four === '4242', 'a provider-reported last_four is carried');
check(vaultCard.bin_number === '424242', 'a provider-reported bin_number is carried');
check(vaultCard.card_holder_name === 'Jane Doe', 'the cardholder name is trimmed');
check(vaultCard.nick_name === 'Work card', 'the nickname is carried on the vault_card object');
check(vaultCard.card_network === 'Visa', 'an enum-mappable network is declared');

respondWith({ body: { status: 'succeeded' } });
await run({ tokenizedCard: { ...card, cardNetwork: 'SODEXO' } });
check(
  !('card_network' in sentBody().payment_method_data.vault_card),
  'a network with no backend enum member is omitted, not passed through'
);

respondWith({ body: { status: 'succeeded' } });
await run({ paymentMethodData: { billing: { email: 'a@b.co' }, nickName: 'ignored-here' } });
body = sentBody();
{
  const keys = Object.keys(body.payment_method_data);
  check(body.payment_method_data.billing?.email === 'a@b.co', 'host billing is encoded alongside the card');
  check(keys[keys.length - 1] === 'vault_card', 'the card subtree is written LAST, over the host data');
}

console.log('\nRequest headers and options thread through');

respondWith({ body: { status: 'succeeded' } });
await run({ appId: 'com.merchant.app.hyperswitch://' });
check(
  calls[0].options.headers['x-app-id'] === 'com.merchant.app',
  'x-app-id strips the .hyperswitch:// suffix exactly as client-core does'
);

respondWith({ body: { status: 'succeeded' } });
await run({ paymentMethodType: 'debit', returnUrl: 'https://merchant.example/return', email: 'a@b.co' });
body = sentBody();
check(body.payment_method_type === 'debit', 'an explicit payment_method_type is used');
check(body.return_url === 'https://merchant.example/return', 'return_url is carried');
check(body.email === 'a@b.co', 'email is carried');

console.log('\nEndpoint resolution');

respondWith({ body: { status: 'succeeded' } });
await run({ environment: 'sandbox', endpoint: undefined });
check(
  calls[0].url.startsWith('https://beta.hyperswitch.io/api/'),
  'no endpoint falls back to the environment host'
);

respondWith({ body: { status: 'succeeded' } });
await run({ endpoint: { baseUrl: 'https://pay.example.com/api/' } });
check(
  calls[0].url === 'https://pay.example.com/api/payments/pay_123/confirm',
  'a path prefix is kept and normalised'
);

/* ── 2. Fail before send ──────────────────────────────────────────────────── */

console.log('\nRefusals happen before any request opens');

const refusal = async (overrides, expectStatus, expectCode, what) => {
  respondWith({ body: { status: 'succeeded' } });
  const res = await run(overrides);
  check(
    calls.length === 0 && res.status === expectStatus && res.error?.code === expectCode,
    `${what} (got: ${res.status}/${res.error?.code}, ${calls.length} calls)`
  );
};

await refusal({ tokenizedCard: { ...card, cardNumberAlias: '   ' } }, 'validation_error', 'invalid_card_data', 'a blank card-number alias refuses with zero calls');
await refusal({ tokenizedCard: { ...card, cardCvcAlias: '' } }, 'validation_error', 'invalid_card_data', 'a blank CVC alias refuses with zero calls');
await refusal({ tokenizedCard: { ...card, expiryMonth: '' } }, 'validation_error', 'invalid_card_data', 'a blank expiry month refuses with zero calls');
await refusal({ tokenizedCard: { ...card, expiryYear: ' ' } }, 'validation_error', 'invalid_card_data', 'a blank expiry year refuses with zero calls');
await refusal({ sdkAuthorization: '  ' }, 'failed', 'invalid_session', 'a blank credential refuses with zero calls');
await refusal({ endpoint: { baseUrl: 'http://evil.example' } }, 'failed', 'unsupported_configuration', 'a cleartext endpoint in production refuses with zero calls');
await refusal(
  { paymentMethodData: { billing: { card_number: '4242424242424242' } } },
  'failed', 'forbidden_card_data',
  'a card key inside host data refuses the whole submission with zero calls'
);

/* ── 3. Sanitized result ──────────────────────────────────────────────────── */

console.log('\nOnly the safe result crosses back');

respondWith({ body: { status: 'succeeded', payment_method_data: { card: { last4: '4242' } } } });
result = await run();
check(result.status === 'succeeded', 'succeeded maps to succeeded');
check(!('token' in result), 'the result has no token member');
check(!('error' in result) || result.error === undefined, 'a success carries no error');
check(JSON.stringify(result).includes('4242') === false, 'nothing from the response body rides along');

respondWith({
  body: {
    status: 'requires_customer_action',
    next_action: {
      type: 'three_ds_invoke',
      three_ds_data: {
        three_ds_authentication_url: 'https://auth.example',
        three_ds_authorize_url: 'https://authorize.example',
        message_version: '2.2.0',
        directory_server_id: 'ds_1',
        poll_config: { poll_id: 'poll_1', delay_in_secs: 2, frequency: 5 },
      },
    },
  },
});
result = await run();
check(result.status === 'requires_customer_action', 'a 3DS next action maps to requires_customer_action');
check(result.nextAction?.type_ === 'three_ds_invoke', 'the next-action type survives');
check(result.nextAction?.threeDs?.authenticationUrl === 'https://auth.example', 'the 3DS payload survives sanitization');

respondWith({ throws: true });
result = await run();
check(
  result.status === 'failed' && result.error?.code === 'unknown_outcome',
  'a thrown fetch is an unknown outcome, never retried'
);

/* ── 4. The pre-existing vault_card mode omits absent metadata too ────────── */

console.log('\nTokenPayload #vault_card omits an absent bin_number (backend Option, not "")');

const tokenBody = Body.build(
  { TAG: 'TokenPayload', mode: 'vault_card', token: 'tok_1', metadata: { last4Digits: '4242', expiryMonth: '12', expiryYear: '2030' } },
  undefined, undefined, undefined, undefined, undefined, undefined, undefined
);
check(
  !('bin_number' in tokenBody.payment_method_data.vault_card),
  'an absent bin_number is omitted from the minted-token vault_card'
);
check(tokenBody.payment_method_data.vault_card.last_four === '4242', 'the minted-token last_four is kept');

/* ── result ───────────────────────────────────────────────────────────────── */

rmSync(stage, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n[verify-orchestration] FAIL\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\n[verify-orchestration] OK - the orchestration confirm is exact, fail-closed and sanitized');
