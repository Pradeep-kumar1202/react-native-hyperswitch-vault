import {Platform} from 'react-native';
import type {
  MerchantSession,
  VaultPaymentCardSource,
} from '@juspay-tech/react-native-hyperswitch-vault';

/*
 * The merchant server — see `example-server/`. This app holds no API key and no .env: the only
 * thing it ever receives is the client-safe session response.
 *
 * Must match PORT in example-server/.env (default 3001).
 */
export const MERCHANT_SERVER_PORT = 3001;

/*
 * Physical Android device? An emulator reaches the host machine on 10.0.2.2, but a real handset
 * does not — set this to your machine's LAN address for the run, e.g.
 *
 *   export const LAN_OVERRIDE = 'http://192.168.1.20:3001';
 *
 * (`ipconfig getifaddr en0` on macOS.) Both devices must be on the same network. Leave it null
 * otherwise; it exists so a device run needs no secret-bearing React Native .env.
 */
export const LAN_OVERRIDE: string | null = null;

export const MERCHANT_BACKEND =
  LAN_OVERRIDE ??
  (Platform.OS === 'android'
    ? `http://10.0.2.2:${MERCHANT_SERVER_PORT}`
    : `http://localhost:${MERCHANT_SERVER_PORT}`);

/**
 * Asks the merchant's own backend for a vault session.
 *
 * This is the ONLY network call the app makes itself. The secret API key stays on the server; what
 * comes back is the client-safe session response, which is handed to <HyperswitchVaultForm/>
 * untouched.
 */
export async function fetchMerchantSession(): Promise<MerchantSession> {
  const response = await fetch(`${MERCHANT_BACKEND}/vault-session`);
  if (!response.ok) {
    /*
     * The server reached Hyperswitch and was refused. Its body carries no detail on purpose — the
     * server logs the HTTP status and nothing else.
     */
    throw new Error(
      `The store could not start checkout (HTTP ${response.status}). Check the merchant server log.`,
    );
  }
  return response.json();
}

/* ── The payment the card is being saved against ──────────────────────────── */

/**
 * The two NON-CARD values `submit()` requires.
 *
 * `submit()` now performs the final `POST /payments/{payment_id}/confirm` itself, so it needs the
 * payment id and the payment-INTENT `sdk_authorization`. Neither is card data, and neither is the
 * VAULT credential: that one lives inside `vault_details` and the library reads it off the session
 * on its own — an app never extracts, decodes or forwards it.
 */
export type PaymentCredentials = {
  paymentId: string;
  sdkAuthorization: string;
};

/*
 * ── THE CARD SOURCE ──────────────────────────────────────────────────────────
 *
 * `confirmPayment()` needs one more thing than the credentials: WHICH card source to confirm with.
 *
 *   vault  — tokenize the card first, then confirm with the token. Needs the session.
 *   direct — confirm with the card values themselves. No session, no token, one request.
 *
 * The app chooses; the library never guesses. Both keep the card inside the library — the
 * difference is what the request carries, not who owns the fields.
 */
export type PaymentConfirmArgs = PaymentCredentials & {
  cardSource: VaultPaymentCardSource;
};

/*
 * PLACEHOLDERS. Obviously fake, and deliberately not secret-shaped.
 *
 * `example-server/` creates the payment intent (POST /payments) and then exchanges it for the vault
 * session (POST /payments/session_tokens). Only the session_tokens payload is forwarded to the app,
 * and a live one carries `payment_id`. A real merchant server should forward the intent's
 * `sdk_authorization` beside it — it is a short-lived client credential for one payment, not the
 * secret api key. Until it does, these stand in so the offline mode still exercises the whole flow.
 */
export const PLACEHOLDER_PAYMENT_ID = 'pay_EXAMPLE_REPLACE_ME';
export const PLACEHOLDER_SDK_AUTHORIZATION = 'sdkauth_EXAMPLE_REPLACE_ME';

const nonEmptyString = (session: MerchantSession, key: string): string | null => {
  const value = session[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

/**
 * Reads the payment credentials off the session response, falling back to the placeholders above.
 *
 * Nothing here is logged or rendered: the values are read and handed straight to `submit()`.
 */
export function paymentCredentialsFrom(session: MerchantSession): PaymentCredentials {
  return {
    paymentId: nonEmptyString(session, 'payment_id') ?? PLACEHOLDER_PAYMENT_ID,
    sdkAuthorization:
      nonEmptyString(session, 'sdk_authorization') ?? PLACEHOLDER_SDK_AUTHORIZATION,
  };
}

/** Flow 2 — tokenize against `session`, then confirm the payment with the token. */
export function vaultPaymentFrom(session: MerchantSession): PaymentConfirmArgs {
  return {...paymentCredentialsFrom(session), cardSource: {type_: 'vault', session}};
}

/**
 * Flow 3 — confirm with the card the library holds, with no tokenization step.
 *
 * The session is still where the credentials are read from, but it is deliberately NOT put in the
 * source: a direct confirm that carried one would be refused, because a caller who supplies a vault
 * session is asking for their customer's card to be saved, and this flow does not save it.
 */
export function directPaymentFrom(session: MerchantSession): PaymentConfirmArgs {
  return {...paymentCredentialsFrom(session), cardSource: {type_: 'direct'}};
}
