/*
 * ORCHESTRATION TYPE TESTS — compiled against the PUBLISHED declarations in dist/types, under the
 * same compiler configuration a React Native app uses.
 *
 * The `./orchestration` subpath is for @juspay-tech/react-native-hyperswitch-payment-methods, not
 * merchants. These tests prove the things that must be impossible to WRITE on that surface:
 *
 *   - a raw card member (PAN spelling, cvc, expiry object) cannot be expressed on the canonical
 *     tokenized card — only alias members and provider-reported metadata exist;
 *   - both aliases and both expiry parts are REQUIRED — the backend's vault_data_card has no
 *     optional CVC;
 *   - the input takes the same closed non-card host data as the form flows, so a card key cannot
 *     ride in through `paymentMethodData`;
 *   - the result is the same `VaultPaymentResult` union as `confirmPayment()`: it narrows, and no
 *     branch carries a token or a raw response.
 *
 * Every `@ts-expect-error` is load-bearing: if the surface widened, the directive itself would
 * become an unused-directive error and this file would fail.
 */
import {
  confirmTokenizedCardPayment,
  type ProviderTokenizedCard,
  type OrchestrationConfirmInput,
  type VaultPaymentResult,
} from '../dist/types/orchestration';

/* ── The canonical card: aliases + provider-reported metadata, nothing else ── */

export const minimal: ProviderTokenizedCard = {
  cardNumberAlias: 'tok_sandbox_4242424242424242',
  cardCvcAlias: 'tok_sandbox_cvc',
  expiryMonth: '03',
  expiryYear: '2030',
};

export const full: ProviderTokenizedCard = {
  cardNumberAlias: 'tok_num',
  cardCvcAlias: 'tok_cvc',
  expiryMonth: '12',
  expiryYear: '2031',
  cardHolderName: 'Jane Doe',
  cardNetwork: 'Visa',
  lastFour: '4242',
  binNumber: '424242',
  nickName: 'Work card',
};

// @ts-expect-error - the CVC alias is required: vault_data_card has no optional CVC
export const missingCvc: ProviderTokenizedCard = {
  cardNumberAlias: 'tok_num',
  expiryMonth: '12',
  expiryYear: '2031',
};

// @ts-expect-error - the card-number alias is required
export const missingNumber: ProviderTokenizedCard = {
  cardCvcAlias: 'tok_cvc',
  expiryMonth: '12',
  expiryYear: '2031',
};

export const rawPan: ProviderTokenizedCard = {
  // @ts-expect-error - a raw card_number spelling is not part of the canonical card
  cardNumber: '4242424242424242',
  cardNumberAlias: 'tok_num',
  cardCvcAlias: 'tok_cvc',
  expiryMonth: '12',
  expiryYear: '2031',
};

export const rawCvc: ProviderTokenizedCard = {
  cardNumberAlias: 'tok_num',
  // @ts-expect-error - a bare cvc member does not exist; only the alias does
  cvc: '123',
  cardCvcAlias: 'tok_cvc',
  expiryMonth: '12',
  expiryYear: '2031',
};

/* ── The confirm input ─────────────────────────────────────────────────────── */

export const input: OrchestrationConfirmInput = {
  tokenizedCard: minimal,
  paymentId: 'pay_1',
  sdkAuthorization: 'intent-credential',
  environment: 'sandbox',
  endpoint: {baseUrl: 'https://api.example.com/api'},
  appId: 'com.merchant.app',
  paymentMethodType: 'credit',
  paymentMethodData: {billing: {email: 'a@b.co'}, nickName: 'Card'},
  returnUrl: 'https://merchant.example/return',
  email: 'a@b.co',
};

export const inputMinimal: OrchestrationConfirmInput = {
  tokenizedCard: minimal,
  paymentId: 'pay_1',
  sdkAuthorization: 'intent-credential',
  environment: 'production',
};

/* The legacy publishable-key credential is accepted on the orchestration entry too. */
export const inputLegacyCredential: OrchestrationConfirmInput = {
  tokenizedCard: minimal,
  paymentId: 'pay_1',
  publishableKey: 'pk_test_123',
  clientSecret: 'pay_1_secret',
  environment: 'production',
};

// @ts-expect-error - the environment is required: it decides endpoint validation and defaults
export const noEnvironment: OrchestrationConfirmInput = {
  tokenizedCard: minimal,
  paymentId: 'pay_1',
  sdkAuthorization: 'intent-credential',
};

export const noCardInHostData: OrchestrationConfirmInput = {
  tokenizedCard: minimal,
  paymentId: 'pay_1',
  sdkAuthorization: 'intent-credential',
  environment: 'sandbox',
  // @ts-expect-error - host data is the same closed non-card shape as the form flows
  paymentMethodData: {card: {card_number: '4242424242424242'}},
};

/* ── The result: the same sanitized union as confirmPayment() ──────────────── */

export const run = async () => {
  const result: VaultPaymentResult = await confirmTokenizedCardPayment(inputMinimal);
  switch (result.status) {
    case 'succeeded':
    case 'processing':
      return result.status;
    case 'requires_customer_action':
      return result.nextAction.type_;
    case 'failed':
    case 'validation_error':
    case 'not_ready':
      return result.error.code;
  }
};

export const noToken = async () => {
  const result = await confirmTokenizedCardPayment(inputMinimal);
  // @ts-expect-error - a payment result never carries a token, on any branch
  return result.token;
};

export const noRawResponse = async () => {
  const result = await confirmTokenizedCardPayment(inputMinimal);
  // @ts-expect-error - the raw backend response never crosses the boundary
  return result.response;
};
