/*
 * Flows 2 and 3 — the checkout SDK's contract, typed against the vault's `./host` entry.
 *
 * The example APP never imports this file: a merchant integration is `session → fields →
 * tokenize()`, and the root entry it uses has no `confirmPayment`. The test-suite does exercise the
 * payment flows (the library owns them and this is where they are covered end to end), and those
 * suites take their handle and input types from `./host`, exactly as payment-methods does
 * (vault ADR-0010). The runtime components are the same objects either way.
 */
import type {MerchantSession} from '@juspay-tech/react-native-hyperswitch-vault';
import type {VaultPaymentCardSource} from '@juspay-tech/react-native-hyperswitch-vault/host';

/**
 * The two NON-CARD values `confirmPayment()` requires: the payment id and the payment-INTENT
 * `sdk_authorization`. Neither is card data, and neither is the VAULT credential — that one lives
 * inside `vault_details` and the library reads it off the session on its own.
 */
export type PaymentCredentials = {
  paymentId: string;
  sdkAuthorization: string;
};

/*
 * ── THE CARD SOURCE ──────────────────────────────────────────────────────────
 *
 *   vault  — tokenize the card first, then confirm with the token. Needs the session.
 *   direct — confirm with the card values themselves. No session, no token, one request.
 *
 * The caller chooses; the library never guesses. Both keep the card inside the library — the
 * difference is what the request carries, not who owns the fields.
 */
export type PaymentConfirmArgs = PaymentCredentials & {
  cardSource: VaultPaymentCardSource;
};

/* PLACEHOLDERS. Obviously fake, and deliberately not secret-shaped. */
export const PLACEHOLDER_PAYMENT_ID = 'pay_EXAMPLE_REPLACE_ME';
export const PLACEHOLDER_SDK_AUTHORIZATION = 'sdkauth_EXAMPLE_REPLACE_ME';

const nonEmptyString = (session: MerchantSession, key: string): string | null => {
  const value = session[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

/** Reads the payment credentials off the session response, falling back to the placeholders. */
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
 * Flow 3 — confirm with the card the library holds, with no tokenization step. The session is still
 * where the credentials are read from, but it is deliberately NOT put in the source: a direct
 * confirm that carried one is refused.
 */
export function directPaymentFrom(session: MerchantSession): PaymentConfirmArgs {
  return {...paymentCredentialsFrom(session), cardSource: {type_: 'direct'}};
}
