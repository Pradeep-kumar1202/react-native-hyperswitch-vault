/*
 * Minimal stand-in for a MERCHANT backend.
 *
 * It lives OUTSIDE the React Native app on purpose. A merchant mints the vault session with their
 * SECRET api key and returns the client-safe `session_tokens`-shaped response to their app. The secret never reaches a device, so it must never live in the app's directory, its bundle,
 * or a React Native .env file.
 *
 * Two modes, chosen by whether HYPERSWITCH_API_KEY is set:
 *
 *   live    - mints a real vault session against the Hyperswitch API. The other credentials become
 *             REQUIRED, and startup fails listing any that are missing by NAME.
 *   offline - no api key: serves a structurally valid FAKE session, so the app, the form and the
 *             wiring can be exercised with no credentials at all.
 *
 * Logging rules, checkable by reading this file: no variable VALUE is ever printed, no session
 * response is printed, and no payment-method token or card value passes through here at all.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* ── .env ─────────────────────────────────────────────────────────────────── */

/*
 * A tiny reader rather than `--env-file` or `process.loadEnvFile`: both are Node 20+, and this
 * example supports Node 18. It also keeps the server dependency-free, so there is nothing to
 * install before running it. A real environment variable always wins over the file.
 */
const loadEnv = () => {
  const envPath = path.resolve(here, '.env');
  if (!fs.existsSync(envPath)) return false;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (value.length > 0 && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
};
const envFileFound = loadEnv();

const read = (name) => {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
};

/* ── Configuration ────────────────────────────────────────────────────────── */

const PORT = Number(read('PORT') ?? 3001);
const ENVIRONMENT = (read('HYPERSWITCH_ENVIRONMENT') ?? 'sandbox').toLowerCase();
const API_KEY = read('HYPERSWITCH_API_KEY');
const PROFILE_ID = read('HYPERSWITCH_PROFILE_ID');
const CUSTOMER_ID = read('HYPERSWITCH_CUSTOMER_ID');

/*
 * The vault session is minted through a payment intent (see createRealSession). These describe that
 * intent; it is never confirmed, so no money moves. Both optional.
 */
const AMOUNT = Number(read('HYPERSWITCH_AMOUNT') ?? 1000);
const CURRENCY = read('HYPERSWITCH_CURRENCY') ?? 'USD';

/* API hosts per environment, overridable. These are the API hosts, not the vault hosts. */
const DEFAULT_BASE_URL = {
  sandbox: 'https://sandbox.hyperswitch.io',
  integration: 'https://integ-api.hyperswitch.io',
  production: 'https://api.hyperswitch.io',
};
const BASE_URL = read('HYPERSWITCH_BASE_URL') ?? DEFAULT_BASE_URL[ENVIRONMENT];

const live = API_KEY !== undefined;

/*
 * Fail fast in live mode, naming ONLY the missing variables — never a value, never a partial value.
 *
 * These are what the two live calls actually need: the secret api key for the payment intent, the
 * profile the intent belongs to, and the customer the saved card will belong to. Nothing else is
 * required, so nothing else is demanded here.
 */
if (live) {
  const missing = [
    ['HYPERSWITCH_PROFILE_ID', PROFILE_ID],
    ['HYPERSWITCH_CUSTOMER_ID', CUSTOMER_ID],
    ['HYPERSWITCH_BASE_URL', BASE_URL],
  ]
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error('[merchant-server] cannot start. Missing required configuration:');
    for (const name of missing) console.error(`  - ${name}`);
    console.error('\nSet them in example-server/.env (copy from example-server/.env.example).');
    if (BASE_URL === undefined) {
      console.error(
        `HYPERSWITCH_ENVIRONMENT must be one of: ${Object.keys(DEFAULT_BASE_URL).join(', ')}, ` +
          'or set HYPERSWITCH_BASE_URL explicitly.'
      );
    }
    process.exit(1);
  }
}

/* ── Fake session (offline mode) ──────────────────────────────────────────── */

/*
 * Structurally valid, and obviously fake. `sdk_authorization` is base64 of the comma-separated
 * key=value envelope the real one uses, carrying a fake payment_method_session_id.
 */
const fakeSession = () => {
  const envelope = [
    'publishable_key=pk_snd_EXAMPLE_FAKE',
    'payment_method_session_id=pms_EXAMPLE_FAKE_0000',
    'profile_id=pro_EXAMPLE_FAKE',
  ].join(',');
  return {
    session_token: [],
    vault_details: {
      vault_type: 'hyperswitch',
      vault_data: { sdk_authorization: Buffer.from(envelope, 'utf8').toString('base64') },
    },
  };
};

/* ── Live session ─────────────────────────────────────────────────────────── */

/*
 * Two calls, mirroring exactly what hyperswitch-client-core does — its own mock backend
 * (`mockServer.js`) creates the intent, and the SDK then calls session_tokens:
 *
 *   1. POST /payments                 api-key: <secret>
 *                                     -> payment_id + sdk_authorization
 *   2. POST /payments/session_tokens  Authorization: <sdk_authorization>
 *                                     body { payment_id, wallets: [] }
 *                                     -> session_token + VAULT_DETAILS
 *
 * Step 2's response IS the `session_tokens`-shaped payload that
 * `<HyperswitchVaultForm session={...} />` expects, so it is handed to the app verbatim.
 *
 * Why not `POST /v2/payment-method-sessions`, which reads like the more natural "create a
 * card-saving session" API: it is a different API with a different auth model, and this account
 * does not serve it. Verified against the live sandbox with these same credentials — v1 /payments
 * answers 200, while the v2 route answers 400 IR_04 "Missing required param: Authorization" and
 * 401 for every Authorization form tried. The credentials are fine; that route is simply not the
 * one this account exposes.
 *
 * The intent is created with `confirm: false` and is never confirmed, so no money moves. It exists
 * only to mint a vault session. The library does not care where `vault_details` came from.
 */
const createRealSession = async () => {
  const intentResponse = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': API_KEY },
    body: JSON.stringify({
      customer_id: CUSTOMER_ID,
      profile_id: PROFILE_ID,
      amount: AMOUNT,
      currency: CURRENCY,
      capture_method: 'automatic',
      confirm: false,
      authentication_type: 'no_three_ds',
    }),
  });
  if (!intentResponse.ok) {
    /*
     * The STATUS only. The body can echo request context, so it is never logged or forwarded to the
     * app. Read the detail from your own API dashboard.
     */
    throw new Error(`payment intent create failed with HTTP ${intentResponse.status}`);
  }
  const intent = await intentResponse.json();

  const sessionResponse = await fetch(`${BASE_URL}/payments/session_tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      /* The intent's own sdk_authorization authenticates this call — not the secret key. */
      Authorization: intent.sdk_authorization,
    },
    body: JSON.stringify({ payment_id: intent.payment_id, wallets: [] }),
  });
  if (!sessionResponse.ok) {
    throw new Error(`session_tokens failed with HTTP ${sessionResponse.status}`);
  }

  const session = await sessionResponse.json();
  if (session?.vault_details?.vault_data?.sdk_authorization === undefined) {
    /*
     * Fail loudly rather than hand the app a session it cannot vault with: the form would otherwise
     * report `error / invalid_session` and the real cause — vaulting not enabled for this profile —
     * would be invisible. Nothing from the response is included in the message.
     */
    throw new Error('session_tokens returned no vault_details; is vaulting enabled on this profile?');
  }
  return session;
};

/* ── Server ───────────────────────────────────────────────────────────────── */

/*
 * `no-store` is not decoration. The response body carries `sdk_authorization`, a short-lived client
 * credential for one payment-method session. Any intermediate cache, service worker or HTTP client
 * cache holding it extends its lifetime beyond the session it belongs to. `no-store` is the only
 * directive that forbids storing it at all — `no-cache` still allows storing it.
 */
const noStore = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/vault-session')) {
    try {
      const session = live ? await createRealSession() : fakeSession();
      res.writeHead(200, noStore);
      res.end(JSON.stringify(session));
      /* The mode only — never the session, the authorization, or anything decoded from it. */
      console.log(`[merchant-server] served a ${live ? 'live' : 'fake'} vault session`);
    } catch (error) {
      res.writeHead(502, noStore);
      res.end(JSON.stringify({ error: 'could not create a payment-method session' }));
      console.error(`[merchant-server] session creation failed: ${error.message}`);
    }
    return;
  }

  /* Lets the app (and a device) confirm reachability without creating a session. */
  if (req.url?.startsWith('/health')) {
    res.writeHead(200, noStore);
    res.end(JSON.stringify({ status: 'ok', mode: live ? 'live' : 'offline' }));
    return;
  }

  res.writeHead(404, noStore);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[merchant-server] listening on http://localhost:${PORT}`);
  console.log(`[merchant-server] Android emulator reaches this at http://10.0.2.2:${PORT}`);
  /* Names and mode only. No value read from .env is ever printed. */
  if (live) {
    console.log(`[merchant-server] mode: live (${ENVIRONMENT})`);
  } else {
    console.log('[merchant-server] mode: offline — serving a FAKE session; no card will be vaulted');
    console.log(
      `[merchant-server] for live mode set these in example-server/.env${envFileFound ? '' : ' (file not found)'}:` +
        '\n  - HYPERSWITCH_API_KEY\n  - HYPERSWITCH_PROFILE_ID\n  - HYPERSWITCH_CUSTOMER_ID'
    );
  }
});
