#!/usr/bin/env node
/*
 * LAYER 2 — the opt-in, authenticated saved-card smoke check (ADR-0008).
 *
 *   yarn smoke:saved-card
 *
 * Mints a REAL payment-method session, lists the customer's saved cards with it, and performs ONE
 * real `PUT …/update-saved-payment-method` through the library's own compiled transport. It proves
 * the thing Layer 1 (`verify-saved-card.mjs`) cannot: that the SERVER accepts what we send — the
 * raw `sdkAuthorization`, the body, the route.
 *
 * NOT a CI gate and NOT part of `yarn verify`, on purpose. Credentials, sandbox availability and
 * session expiry would fail builds for reasons unrelated to the change under review. It is run by a
 * named owner before a release, or as a controlled scheduled job — see
 * docs/manual-device-checklist.md §12.
 *
 * Configuration comes from the environment, or from example-server/.env (the same file the example
 * merchant server reads). Nothing secret is ever printed: not the api key, not the session
 * authorization, not the CVC, not the token that comes back.
 *
 *   HYPERSWITCH_API_KEY, HYPERSWITCH_PROFILE_ID, HYPERSWITCH_CUSTOMER_ID   required
 *   HYPERSWITCH_ENVIRONMENT      sandbox | integration | production        default sandbox
 *   HYPERSWITCH_BASE_URL         the API host, overriding the environment's default
 *   HYPERSWITCH_VAULT_BASE_URL   the vault host, overriding the library's default for the environment
 *   SAVED_CARD_TOKEN             a specific listed token to use (default: the first card needing a CVC)
 *   SAVED_CARD_CVC               the CVC to send (default: 123 — right for the sandbox test cards)
 *
 * Exit codes: 0 the server accepted the update and returned a token; 1 it did not; 2 a precondition
 * is missing (no credentials, no saved card for the customer, no vault details on the session).
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Configuration (the merchant server's tiny .env reader, values never printed) ── */

const loadEnv = () => {
  const envPath = path.join(root, 'example-server', '.env');
  if (!existsSync(envPath)) return false;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (value.length > 0 && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
};
loadEnv();

const read = (name) => {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
};

const ENVIRONMENT = (read('HYPERSWITCH_ENVIRONMENT') ?? 'sandbox').toLowerCase();
const API_KEY = read('HYPERSWITCH_API_KEY');
const PROFILE_ID = read('HYPERSWITCH_PROFILE_ID');
const CUSTOMER_ID = read('HYPERSWITCH_CUSTOMER_ID');
const API_HOSTS = {
  sandbox: 'https://sandbox.hyperswitch.io',
  integration: 'https://integ-api.hyperswitch.io',
  production: 'https://api.hyperswitch.io',
};
/* The library's own vault hosts — the same table `VaultConfirm.vaultBaseUrl` holds. */
const VAULT_HOSTS = {
  sandbox: 'https://beta.hyperswitch.io/api',
  integration: 'https://dev.hyperswitch.io/api',
  production: 'https://checkout.hyperswitch.io/api',
};
const API_BASE = read('HYPERSWITCH_BASE_URL') ?? API_HOSTS[ENVIRONMENT];
const VAULT_BASE = read('HYPERSWITCH_VAULT_BASE_URL') ?? VAULT_HOSTS[ENVIRONMENT];
const CVC = read('SAVED_CARD_CVC') ?? '123';
const PINNED_TOKEN = read('SAVED_CARD_TOKEN');

const precondition = (message) => {
  console.error(`[smoke-saved-card] precondition failed: ${message}`);
  process.exit(2);
};

const missing = [
  ['HYPERSWITCH_API_KEY', API_KEY],
  ['HYPERSWITCH_PROFILE_ID', PROFILE_ID],
  ['HYPERSWITCH_CUSTOMER_ID', CUSTOMER_ID],
].filter(([, value]) => value === undefined).map(([name]) => name);
if (missing.length) precondition(`missing ${missing.join(', ')} (set them in example-server/.env)`);
if (!API_BASE || !VAULT_BASE) precondition(`HYPERSWITCH_ENVIRONMENT must be one of ${Object.keys(API_HOSTS).join(', ')}`);

console.log(`[smoke-saved-card] environment: ${ENVIRONMENT} · api host: ${API_BASE} · vault host: ${VAULT_BASE}`);

/* ── The library's compiled transport, bundled the way verify-saved-card bundles it ── */

const stage = mkdtempSync(path.join(tmpdir(), 'vault-saved-card-smoke-'));
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
const Confirm = await load('VaultConfirm');

const finish = (code) => {
  rmSync(stage, { recursive: true, force: true });
  process.exit(code);
};

/* ── 1. A real session, minted exactly as the example merchant server mints one ── */

const intentResponse = await fetch(`${API_BASE}/payments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'api-key': API_KEY },
  body: JSON.stringify({
    customer_id: CUSTOMER_ID,
    profile_id: PROFILE_ID,
    amount: 1000,
    currency: 'USD',
    capture_method: 'automatic',
    confirm: false,
    authentication_type: 'no_three_ds',
  }),
});
if (!intentResponse.ok) {
  console.error(`[smoke-saved-card] payment intent create failed with HTTP ${intentResponse.status}`);
  finish(1);
}
const intent = await intentResponse.json();

const sessionResponse = await fetch(`${API_BASE}/payments/session_tokens`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: intent.sdk_authorization },
  body: JSON.stringify({ payment_id: intent.payment_id, wallets: [] }),
});
if (!sessionResponse.ok) {
  console.error(`[smoke-saved-card] session_tokens failed with HTTP ${sessionResponse.status}`);
  finish(1);
}
const session = await sessionResponse.json();
const sdkAuthorization = session?.vault_details?.vault_data?.sdk_authorization;
if (typeof sdkAuthorization !== 'string' || sdkAuthorization.length === 0) {
  precondition('session_tokens returned no vault_details; is vaulting enabled on this profile?');
}
const resolved = Confirm.resolveSessionId(sdkAuthorization);
if (resolved.TAG !== 'Ok') precondition('the session authorization does not carry a payment_method_session_id');
const sessionId = resolved._0;
console.log('[smoke-saved-card] session minted');

/* ── 2. The merchant's own listing call, with the SAME session ─────────────── */

const listResponse = await fetch(
  `${VAULT_BASE}/v1/payment-method-sessions/${encodeURIComponent(sessionId)}/list-payment-methods`,
  { headers: { Authorization: sdkAuthorization } }
);
if (!listResponse.ok) {
  console.error(`[smoke-saved-card] list-payment-methods failed with HTTP ${listResponse.status}`);
  finish(1);
}
const listing = await listResponse.json();
const cards = (listing?.customer_payment_methods ?? []).filter(
  (entry) => (entry.payment_method ?? entry.payment_method_type) === 'card'
);
const tokenOf = (entry) => entry.payment_method_token ?? entry.payment_token;
const needingCvc = cards.filter((entry) => entry.requires_cvv === true);
console.log(`[smoke-saved-card] ${cards.length} saved card(s) listed, ${needingCvc.length} requiring a CVC`);

const chosen = PINNED_TOKEN
  ? cards.find((entry) => tokenOf(entry) === PINNED_TOKEN)
  : (needingCvc[0] ?? cards[0]);
if (!chosen) {
  precondition(
    PINNED_TOKEN
      ? 'SAVED_CARD_TOKEN is not among the tokens this session listed'
      : 'the customer has no saved card; vault one first (the example app\'s Save card) and rerun'
  );
}
const inputToken = tokenOf(chosen);
console.log(`[smoke-saved-card] using the ${chosen?.card?.card_network ?? 'unknown-network'} card (requires_cvv: ${chosen.requires_cvv === true})`);

/* ── 3. ONE real update through the library's own transport ───────────────── */

const result = await SavedCard.updateSavedPaymentMethod({
  vaultBaseUrl: VAULT_BASE,
  sdkAuthorization,
  paymentMethodToken: inputToken,
  cvc: CVC,
  timeoutMs: 20000,
});

if (result.status !== 'success' || typeof result.token !== 'string' || result.token.length === 0) {
  console.error(`[smoke-saved-card] FAIL: ${result.status}/${result.error?.code ?? '-'} — ${result.error?.message ?? ''}`);
  finish(1);
}

console.log(
  `[smoke-saved-card] OK - the server accepted the raw sdkAuthorization on PUT …/update-saved-payment-method ` +
    `and returned a token (${result.token === inputToken ? 'the same value as the input' : 'a value different from the input'}; use what came back). ` +
    'The CVC is retained for 15 minutes from now.'
);
finish(0);
