#!/usr/bin/env node
/*
 * Executes the REAL compiled host-input modules and asserts the three separate guarantees:
 *
 *   1. REJECTION — a card key anywhere in the host's `paymentMethodData`, at any depth and through
 *      arrays, fails the whole submission. Nothing is stripped-and-accepted.
 *   2. ENCODING  — every public camelCase field is written to its snake_case backend key by name.
 *      The host object is never passed through, so an unknown property cannot ride along.
 *   3. ROUTING   — `nickName` reaches call 1 and ONLY call 1; the final-confirm encoder has no
 *      branch that can emit it.
 *
 * Plus endpoint validation, which decides where a payment-intent credential is allowed to be sent.
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

const stage = mkdtempSync(path.join(tmpdir(), 'vault-noncard-'));
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

const PMD = await load('VaultPaymentMethodData');
const Body = await load('VaultConfirmBody');
const Endpoint = await load('VaultEndpoint');
const Confirm = await load('VaultConfirm');

const isError = (result) => result.TAG === 'Error';
const isOk = (result) => result.TAG === 'Ok';

/* ── 1. Rejection ─────────────────────────────────────────────────────────── */

console.log('\nForbidden card keys are rejected at any depth');

check(isOk(PMD.validateHostData({ billing: { address: { first_name: 'Ada' } } })), 'plain billing is accepted');
check(isOk(PMD.validateHostData({ nickName: 'Travel card' })), 'a nickName is accepted');
check(isOk(PMD.validateHostData({})), 'an empty object is accepted');

const rejections = [
  ['a top-level card object', { card: {} }],
  ['a nested card number', { billing: { card_number: '4111111111111111' }}],
  ['a camelCase card number', { billing: { cardNumber: '4111111111111111' }}],
  ['a nested payment_method_data.card', { payment_method_data: { card: {} } }],
  ['a cvc', { cvc: '123' }],
  ['an expiry', { billing: { address: { expiry: '12/30' } } }],
  ['a cardholder name', { cardHolderName: 'Ada' }],
  ['a bin', { bin: '411111' }],
  ['last4', { billing: { last4: '1111' } }],
  ['a card network', { card_network: 'visa' }],
  ['a brand', { brand: 'visa' }],
  ['a payment token', { payment_token: 'tok' }],
  ['a vault_card', { vault_card: {} }],
  ['a card key inside an array', { billing: { lines: [{ ok: 1 }, { card_number: '4111' }] } }],
  ['a card key deep inside arrays of arrays', { a: [[{ b: { card_cvc: '1' } }]] }],
];
for (const [what, value] of rejections) {
  check(isError(PMD.validateHostData(value)), `${what} is rejected`);
}

check(isError(PMD.validateHostData({ billing: { card_number: '1' }, nickName: 'ok' })),
  'rejection is whole-submission: a valid sibling does not rescue it');

/* ── 2. Encoding ──────────────────────────────────────────────────────────── */

console.log('\nEvery public camelCase field is encoded to its backend key');

const encoded = PMD.encodeHostPaymentMethodData({
  billing: {
    address: {
      firstName: 'Ada', lastName: 'Lovelace',
      line1: '1 Analytical Way', line2: 'Floor 2', line3: 'Desk 3',
      city: 'London', state: 'Greater London', country: 'GB', zip: 'NW1',
    },
    email: 'ada@example.com',
    phone: { number: '5551234', countryCode: '+44' },
  },
  nickName: 'Travel card',
});

const address = encoded.billing.address;
for (const [camel, snake, value] of [
  ['firstName', 'first_name', 'Ada'],
  ['lastName', 'last_name', 'Lovelace'],
  ['line1', 'line1', '1 Analytical Way'],
  ['city', 'city', 'London'],
  ['country', 'country', 'GB'],
  ['zip', 'zip', 'NW1'],
]) {
  check(address[snake] === value, `${camel} -> ${snake}`);
}
check(address.firstName === undefined && address.lastName === undefined,
  'the camelCase spellings are NOT also present (the host object is not passed through)');
check(encoded.billing.phone.country_code === '+44', 'phone.countryCode -> phone.country_code');
check(encoded.billing.phone.countryCode === undefined, 'phone.countryCode is not passed through');
check(encoded.billing.email === 'ada@example.com', 'billing email is carried');

const withExtra = PMD.encodeHostPaymentMethodData({
  billing: { address: { firstName: 'Ada', sneaky: 'value' }, unknownField: 'x' },
});
check(JSON.stringify(withExtra).includes('sneaky') === false, 'an unknown nested property cannot ride along');
check(JSON.stringify(withExtra).includes('unknownField') === false, 'an unknown billing property cannot ride along');

check(PMD.encodeHostPaymentMethodData({ billing: { email: '   ' } }) === undefined,
  'whitespace-only text is treated as absent, not written as an empty string');
check(PMD.encodeHostPaymentMethodData(undefined) === undefined, 'absent host data encodes to nothing');
check(PMD.encodeHostPaymentMethodData({}) === undefined, 'an empty host object encodes to nothing');

/* ── 3. nickName routing ──────────────────────────────────────────────────── */

console.log('\nnickName goes to call 1 and only call 1');

check(PMD.nickNameOf({ nickName: 'Travel card' }) === 'Travel card', 'nickNameOf reads the nickname for call 1');
check(PMD.nickNameOf({ nickName: '   ' }) === undefined, 'a blank nickname is absent');
check(PMD.nickNameOf(undefined) === undefined, 'no host data means no nickname');
check(
  JSON.stringify(encoded).includes('nick_name') === false &&
    JSON.stringify(encoded).includes('nickName') === false,
  'the FINAL-confirm encoder cannot emit a nickname in any spelling'
);

const call1Body = Confirm.buildConfirmBody(
  { cardNumber: '4111 1111 1111 1111', expiryMonth: '12', expiryYear: '2030', cvc: '123' },
  'Ada Lovelace',
  'Travel card'
);
check(call1Body.payment_method_data.card.nick_name === 'Travel card', 'call 1 carries nick_name');
check(call1Body.payment_method_data.card.card_holder_name === 'Ada Lovelace', 'call 1 carries card_holder_name');
check(call1Body.payment_method_data.card.card_number === '4111111111111111', 'call 1 carries the un-spaced PAN');

const call1Blank = Confirm.buildConfirmBody(
  { cardNumber: '4111111111111111', expiryMonth: '12', expiryYear: '2030', cvc: '123' },
  '   ',
  undefined
);
check(call1Blank.payment_method_data.card.card_holder_name === undefined,
  'a blank cardholder name is omitted from call 1 entirely');
check(call1Blank.payment_method_data.card.nick_name === undefined, 'an absent nickname is omitted');

/* ── Final body assembly ──────────────────────────────────────────────────── */

console.log('\nFinal-confirm body assembly');

const metadata = { last4Digits: '1111', binNumber: '411111', expiryMonth: '12', expiryYear: '2030' };
const hostData = { billing: { address: { firstName: 'Ada' } }, nickName: 'Travel card' };

/*
 * `build` now takes a closed `cardPayload` variant rather than a token plus a mode: one request
 * builder serving both the tokenized flow and the direct one. `TokenPayload` and `DirectPayload`
 * are ReScript inline-record constructors, so the runtime shape is `{TAG, ...fields}`.
 */
const tokenPayload = (mode, token) => ({ TAG: 'TokenPayload', mode, token, metadata });
const directPayload = (card, cardholderName, cardNetwork) =>
  ({ TAG: 'DirectPayload', card, cardholderName, cardNetwork });

const tokenBody = Body.build(
  tokenPayload('payment_token', 'tok_abc'), 'credit', hostData,
  { acceptanceType: 'online', acceptedAt: '2026-01-01T00:00:00Z', online: { userAgent: 'UA' } },
  { userAgent: 'UA', colorDepth: 32, javaEnabled: true, screenHeight: 800 },
  'https://return.example', 'new_mandate', 'ada@example.com'
);

check(tokenBody.payment_token === 'tok_abc', 'payment_token mode puts the token top-level');
check(tokenBody.payment_method === 'card', 'payment_method is card');
check(tokenBody.payment_method_type === 'credit', 'the closed payment-method-type union is written as its wire string');
check(tokenBody.payment_type === 'new_mandate', 'the closed payment-type union is written as its wire string');
check(tokenBody.customer_acceptance.acceptance_type === 'online', 'acceptanceType -> acceptance_type');
check(tokenBody.customer_acceptance.accepted_at === '2026-01-01T00:00:00Z', 'acceptedAt -> accepted_at');
check(tokenBody.customer_acceptance.online.user_agent === 'UA', 'online.userAgent -> online.user_agent');
check(tokenBody.browser_info.user_agent === 'UA', 'browserInfo.userAgent -> browser_info.user_agent');
check(tokenBody.browser_info.color_depth === 32, 'browserInfo.colorDepth -> browser_info.color_depth');
check(tokenBody.browser_info.java_enabled === true, 'browserInfo.javaEnabled -> browser_info.java_enabled');
check(tokenBody.browser_info.screen_height === 800, 'browserInfo.screenHeight -> browser_info.screen_height');
check(tokenBody.return_url === 'https://return.example', 'returnUrl -> return_url');
check(tokenBody.email === 'ada@example.com', 'email is carried');
check(tokenBody.client_secret === undefined, 'client_secret is never sent (the intent credential is present)');
check(tokenBody.payment_method_data.billing.address.first_name === 'Ada', 'host billing reaches the final body');
check(JSON.stringify(tokenBody).includes('nick_name') === false, 'the final body carries NO nickname');
check(tokenBody.payment_method_data.vault_card === undefined, 'payment_token mode adds no vault_card');

const vaultBody = Body.build(
  tokenPayload('vault_card', 'tok_abc'), undefined, hostData,
  undefined, undefined, undefined, undefined, undefined
);
check(vaultBody.payment_token === undefined, 'vault_card mode does NOT also send a top-level token');
check(vaultBody.payment_method_data.vault_card.card_number === 'tok_abc', 'vault_card carries the token as the number');
check(vaultBody.payment_method_data.vault_card.card_cvc === 'tok_abc', 'vault_card carries the token as the cvc');
check(vaultBody.payment_method_data.vault_card.last_four === '1111', 'vault_card carries the masked last four from call 1');
check(vaultBody.payment_method_data.vault_card.bin_number === '411111', 'vault_card carries the bin from call 1');
check(vaultBody.payment_method_data.billing.address.first_name === 'Ada', 'host billing survives alongside vault_card');
check(vaultBody.payment_method_type === 'credit', 'the payment method type defaults to credit');

const keys = Object.keys(vaultBody.payment_method_data);
check(keys[keys.length - 1] === 'vault_card', 'the card subtree is attached LAST, by explicit assignment');

/* ── The DIRECT body (Flow 3) ─────────────────────────────────────────────── */

/*
 * Flow 3 is the one that could quietly go wrong. It is the only body in the library that carries a
 * real PAN to `/payments/{id}/confirm`, and it is assembled by the same function that assembles the
 * tokenized one — so the checks below are about keeping the two apart: the direct body must carry
 * the card and NO token, and the tokenized body must carry a token and NO card.
 */
console.log('\nDirect-confirm body assembly (Flow 3)');

const typedCard = {
  cardNumber: '4111 1111 1111 1111',
  expiryMonth: '12',
  expiryYear: '30',
  cvc: '737',
};

const directBody = Body.build(
  directPayload(typedCard, 'Ada Lovelace', undefined), 'debit', hostData,
  undefined, undefined, undefined, undefined, undefined
);

const directCard = directBody.payment_method_data.card;
check(directCard.card_number === '4111111111111111', 'the direct body carries the un-spaced PAN');
check(directCard.card_exp_month === '12', 'the direct body carries the expiry month');
check(directCard.card_exp_year === '2030', 'a two-digit year is expanded to four, as on call 1');
check(directCard.card_cvc === '737', 'the direct body carries the CVC');
check(directCard.card_holder_name === 'Ada Lovelace', 'the direct body carries the cardholder name');
check(directBody.payment_method === 'card', 'the direct body declares payment_method card');
check(directBody.payment_method_type === 'debit', 'the direct body carries the closed method type');
check(directBody.payment_token === undefined, 'the direct body sends NO payment_token');
check(directBody.payment_method_data.vault_card === undefined, 'the direct body sends NO vault_card');
check(
  directBody.payment_method_data.billing.address.first_name === 'Ada',
  'host billing reaches the direct body too'
);
check(
  JSON.stringify(directBody).includes('nick_name') === false,
  'the direct body carries NO nickname — there is no saved card to name'
);

const directKeys = Object.keys(directBody.payment_method_data);
check(
  directKeys[directKeys.length - 1] === 'card',
  'the card subtree is attached LAST in the direct body as well'
);

/* The two payload kinds are genuinely exclusive. */
check(
  tokenBody.payment_method_data.card === undefined,
  'the tokenized body has no card subtree at all'
);
check(
  JSON.stringify(tokenBody).includes('4111111111111111') === false,
  'no PAN appears anywhere in a tokenized body'
);
check(
  JSON.stringify(directBody).includes('tok_abc') === false,
  'no token appears anywhere in a direct body'
);

/*
 * `card_network` rides along ONLY when a co-badge choice was actually made, AND only when the
 * chosen scheme is one the backend's `CardNetwork` enum can represent.
 *
 * The spelling is load-bearing: the enum member is `RuPay`, not `rupay`. This fixture used the
 * lowercase form and the allowlist correctly refused it — which is the behaviour we want, since
 * sending an unparseable enum value would reject a payment that works.
 */
const coBadged = Body.build(
  directPayload(typedCard, undefined, 'RuPay'), undefined, undefined,
  undefined, undefined, undefined, undefined, undefined
);
check(
  coBadged.payment_method_data.card.card_network === 'RuPay',
  'a co-badge selection reaches payment_method_data.card.card_network'
);

const misspelled = Body.build(
  directPayload(typedCard, undefined, 'rupay'), undefined, undefined,
  undefined, undefined, undefined, undefined, undefined
);
check(
  misspelled.payment_method_data.card.card_network === undefined,
  'a spelling the backend enum does not have is OMITTED, not sent'
);

const unknownScheme = Body.build(
  directPayload(typedCard, undefined, 'SODEXO'), undefined, undefined,
  undefined, undefined, undefined, undefined, undefined
);
check(
  unknownScheme.payment_method_data.card.card_network === undefined,
  'a scheme with no enum member (SODEXO) is omitted rather than 400ing the payment'
);
check(
  directBody.payment_method_data.card.card_network === undefined,
  'a single-network card sends no card_network'
);
check(
  coBadged.payment_method_data.card.card_holder_name === undefined,
  'an absent cardholder name is omitted from the direct body'
);

/* ── Endpoint validation ──────────────────────────────────────────────────── */

console.log('\nEndpoint validation (correction: an invalid endpoint is a CONFIGURATION error)');

const accepts = (url, env) => isOk(Endpoint.validateEndpoint({ baseUrl: url }, env));
check(accepts('https://api.example.com', 'production'), 'https is accepted in production');
check(!accepts('http://evil.com', 'production'), 'plain http is rejected in production');
check(!accepts('http://localhost:5252', 'production'), 'even loopback http is rejected in production');
check(accepts('http://localhost:5252', 'sandbox'), 'loopback http is accepted in sandbox');
check(accepts('http://10.0.2.2:5252', 'sandbox'), 'the Android emulator host is accepted in sandbox');
check(!accepts('http://192.168.1.5:5252', 'sandbox'), 'a non-loopback http host is rejected even in sandbox');
check(!accepts('https://user:pass@host.example', 'production'), 'credentials in the authority are rejected');
check(!accepts('https://host.example/path', 'production'), 'a path is rejected');
check(!accepts('https://host.example/?q=1', 'production'), 'a query is rejected');
check(!accepts('https://host.example/#frag', 'production'), 'a fragment is rejected');
check(!accepts('not a url', 'production'), 'an unparseable value is rejected');
check(!accepts('   ', 'production'), 'a blank value is rejected');
check(isOk(Endpoint.validateEndpoint(undefined, 'production')), 'an absent endpoint is fine (the default is used)');

check(
  Endpoint.resolveBaseUrl(undefined, 'sandbox')._0 === 'https://beta.hyperswitch.io/api',
  'the sandbox default base URL is used when no override is given'
);
check(
  Endpoint.resolveBaseUrl({ baseUrl: 'https://api.example.com/' }, 'production')._0 === 'https://api.example.com',
  'a valid override resolves to its normalised origin'
);

rmSync(stage, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-noncard-input] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-noncard-input] OK - host input is narrow, rejected on card keys, and explicitly encoded');
