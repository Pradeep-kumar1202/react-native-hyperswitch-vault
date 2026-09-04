/**
 * Listing a customer's saved cards — the call a MERCHANT'S BACKEND makes.
 *
 * `GET /v1/payment-method-sessions/{id}/list-payment-methods?include_new=true` returns the cards
 * already stored for this customer, each with a `requires_cvv` flag. That flag is the whole
 * decision:
 *
 *   requires_cvv: false  use the listed token directly; mount nothing
 *   requires_cvv: true   mount <CardCVCField savedCard={{paymentToken, paymentMethodData:
 *                        {card: {cardNetwork}}}} /> inside <CardForm>, collect the CVC, and use the
 *                        token `tokenize()` hands back
 *
 * The library deliberately does not make this call or accept `requires_cvv` as a prop: by the time
 * the component is on screen the decision has been made, and a second copy of it would be a second
 * place for the two to disagree.
 *
 * It is done here, in the app, only because this example has no backend of its own beyond the
 * session server. A real integration makes this call server-side.
 *
 * @format
 */
import {
  type MerchantSession,
  type VaultEnvironment,
} from '@juspay-tech/react-native-hyperswitch-vault';

const VAULT_HOSTS: Record<VaultEnvironment, string> = {
  production: 'https://checkout.hyperswitch.io/api',
  sandbox: 'https://beta.hyperswitch.io/api',
  integ: 'https://dev.hyperswitch.io/api',
};

export type SavedCard = {
  token: string;
  network: string;
  last4: string;
  /** The backend's verdict, and the only thing that decides whether a CVC is collected. */
  requiresCvc: boolean;
};

/* eslint-disable no-bitwise */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const fromBase64 = (input: string): string => {
  const clean = input.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const symbol of clean) {
    const value = B64.indexOf(symbol);
    if (value < 0) {
      return '';
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
};
/* eslint-enable no-bitwise */

/** The session id is carried inside the session's own `sdk_authorization` envelope. */
export const sessionIdOf = (session: MerchantSession): string | null => {
  const authorization = session.vault_details?.vault_data?.sdk_authorization;
  if (typeof authorization !== 'string') {
    return null;
  }
  const pair = fromBase64(authorization)
    .split(',')
    .map(part => part.trim())
    .find(part => part.startsWith('payment_method_session_id='));
  return pair ? pair.slice('payment_method_session_id='.length) : null;
};

export const listSavedCards = async (
  session: MerchantSession,
  environment: VaultEnvironment,
): Promise<SavedCard[]> => {
  const authorization = session.vault_details?.vault_data?.sdk_authorization;
  const sessionId = sessionIdOf(session);
  if (typeof authorization !== 'string' || !sessionId) {
    throw new Error('the session carries no payment_method_session_id');
  }
  const response = await fetch(
    `${VAULT_HOSTS[environment]}/v1/payment-method-sessions/${encodeURIComponent(
      sessionId,
    )}/list-payment-methods`,
    {headers: {Authorization: authorization}},
  );
  if (!response.ok) {
    throw new Error(`list-payment-methods answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    customer_payment_methods?: Array<Record<string, any>>;
  };
  return (body.customer_payment_methods ?? [])
    .filter(entry => (entry.payment_method_type ?? entry.payment_method) === 'card')
    .map(entry => {
      /*
       * The card sits at `payment_method_data.card`. Reading it from `entry.card` — which the
       * response does NOT have — silently produced an empty network, and an empty network means the
       * CVC field falls back to accepting three OR four digits. That is why a Visa card was taking
       * a 4-digit code. The older flat shape is kept as a fallback, nothing more.
       */
      const card = (entry.payment_method_data?.card ?? entry.card ?? {}) as Record<string, any>;
      return {
        token: String(entry.payment_method_token ?? entry.payment_token ?? ''),
        network: String(card.card_network ?? ''),
        last4: String(card.last4_digits ?? card.last4 ?? '????'),
        requiresCvc: entry.requires_cvv === true,
      };
    })
    .filter(card => card.token.length > 0);
};
