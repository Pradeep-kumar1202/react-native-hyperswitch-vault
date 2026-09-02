/*
 * HOST TYPE TESTS — compiled against the PUBLISHED declarations in dist/types, under the same
 * compiler configuration a React Native app uses.
 *
 * The `./host` subpath is for @juspay-tech/react-native-hyperswitch-payment-methods, not merchants
 * (ADR-0010). It publishes the SAME components as the root with a wider type surface: the
 * `confirmPayment()` operation, the `eligibility` prop, the `'external'` cardholder-name mode, and
 * the confirm-input / navigation types behind them. These tests prove what must hold on that surface:
 *
 *   - `confirmPayment()` exists, and its result has NO token in any branch;
 *   - card keys cannot be smuggled into the payment-confirm input;
 *   - the two card sources cannot be blended;
 *   - every navigation branch narrows, and `error` is absent on success branches;
 *   - the host-only props and state members are present here (and, per consumer.tsx, absent on the
 *     root).
 *
 * Every `@ts-expect-error` is load-bearing: if the surface widened, the directive itself would
 * become an unused-directive error and this file would fail.
 */
import * as React from 'react';
import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardholderNameField,
} from '../dist/types/host';
import type {
  MerchantSession,
  HostFormHandle,
  VaultTokenizeResult,
  VaultPaymentResult,
  VaultPaymentConfirmInput,
  VaultHostPaymentMethodData,
  VaultNextAction,
  VaultEligibilityStatus,
  VaultEligibilityConfig,
  VaultCardholderNameMode,
  SafeVaultErrorCode,
  VaultFormState,
  VaultFieldState,
  VaultFormLocalisation,
} from '../dist/types/host';

const session = {} as MerchantSession;
const formRef = React.createRef<HostFormHandle>();

/* ══ 1. The provider, with the host-only props ═══════════════════════════════ */

export const eligibility: VaultEligibilityConfig = {paymentId: 'pay_1', sdkAuthorization: 'intent'};
export const legacyEligibility: VaultEligibilityConfig = {
  paymentId: 'pay_1',
  publishableKey: 'pk_test',
  clientSecret: 'pay_1_secret',
};

export const hostProvider = (
  <HyperswitchVaultFormProvider
    ref={formRef}
    session={session}
    environment="sandbox"
    cardholderName={'external' satisfies VaultCardholderNameMode}
    eligibility={eligibility}
    localisation={{validationMessages: {cardNotEligible: 'Not accepted'}} satisfies VaultFormLocalisation}
    onFormStateChange={(s: VaultFormState) => {
      const verdict: VaultEligibilityStatus = s.eligibility;
      const numberVerdict: VaultEligibilityStatus = s.fields.cardNumber.eligibility;
      return [verdict, numberVerdict];
    }}>
    <CardNumberField onStateChange={(s) => s.eligibility} />
    <CardExpiryField />
    <CardCVCField />
  </HyperswitchVaultFormProvider>
);

export const collecting = (
  <HyperswitchVaultFormProvider session={session} environment="sandbox" cardholderName="collect">
    <CardholderNameField />
    <CardNumberField />
    <CardExpiryField />
    <CardCVCField />
  </HyperswitchVaultFormProvider>
);

/* The field-state union carries the verdict on the card-number branch only. */
export function narrowField(s: VaultFieldState): string {
  switch (s.field) {
    case 'cardNumber':
      return s.eligibility;
    case 'expiry':
    case 'cvc':
    case 'cardholderName':
      // @ts-expect-error - eligibility is card-number only
      return s.eligibility;
  }
}

/* ══ 2. tokenize on the host handle is the same operation as on the root ══════ */

export async function tokenizeFlow(): Promise<string | null> {
  const result: VaultTokenizeResult = await formRef.current!.tokenize();
  return result.status === 'success' ? result.token : null;
}

/* The full error vocabulary is visible here — including the two confirm-only codes. */
export const confirmOnlyCodes: SafeVaultErrorCode[] = ['forbidden_card_data', 'card_not_eligible'];

/* ══ 3. confirmPayment: NO token, ever ═══════════════════════════════════════ */

/* Flow 2 — the vault source. Tokenizes first; the token stays inside. */
const confirmInput: VaultPaymentConfirmInput = {
  cardSource: {type_: 'vault', session, confirmTokenMode: 'payment_token'},
  paymentId: 'pay_123',
  sdkAuthorization: 'intent-credential',
  paymentMethodType: 'credit',
  paymentMethodData: {
    billing: {
      address: {firstName: 'Ada', lastName: 'Lovelace', line1: '1 Way', city: 'London', country: 'GB', zip: 'NW1'},
      email: 'ada@example.com',
      phone: {number: '5551234', countryCode: '+44'},
    },
    nickName: 'Travel card',
  },
  customerAcceptance: {acceptanceType: 'online', acceptedAt: '2026-01-01T00:00:00Z', online: {userAgent: 'UA'}},
  browserInfo: {userAgent: 'UA', colorDepth: 32, javaEnabled: true},
  returnUrl: 'https://return.example',
  paymentType: 'new_mandate',
  email: 'ada@example.com',
  eligibilityRequired: false,
  appId: 'com.example.app',
  endpoint: {baseUrl: 'https://api.example.com'},
};

/* Flow 3 — the direct source. No session, no token, one request. */
const directInput: VaultPaymentConfirmInput = {
  cardSource: {type_: 'direct'},
  paymentId: 'pay_123',
  sdkAuthorization: 'intent-credential',
  paymentMethodType: 'debit',
  paymentMethodData: {billing: {email: 'ada@example.com'}},
  eligibilityRequired: true,
  cardholderName: 'Ada Lovelace',
};

export async function confirmFlow(): Promise<VaultPaymentResult> {
  return formRef.current!.confirmPayment(confirmInput);
}

export async function directFlow(): Promise<VaultPaymentResult> {
  return formRef.current!.confirmPayment(directInput);
}

/*
 * NEGATIVE — the two sources cannot be blended. Both of these describe a caller who believes their
 * card is being tokenized when it is not, which is the one confusion this union exists to prevent.
 */
export const badSource1: VaultPaymentConfirmInput = {
  // @ts-expect-error - a direct source carries no vault session
  cardSource: {type_: 'direct', session},
  paymentId: 'p',
  sdkAuthorization: 'a',
};
export const badSource2: VaultPaymentConfirmInput = {
  // @ts-expect-error - nor a token mode; nothing is minted in direct mode
  cardSource: {type_: 'direct', confirmTokenMode: 'vault_card'},
  paymentId: 'p',
  sdkAuthorization: 'a',
};
export const badSource3: VaultPaymentConfirmInput = {
  // @ts-expect-error - a vault source without a session is unrepresentable
  cardSource: {type_: 'vault'},
  paymentId: 'p',
  sdkAuthorization: 'a',
};
export const badSource4: VaultPaymentConfirmInput = {
  // @ts-expect-error - the source kind is a closed union
  cardSource: {type_: 'tokenize', session},
  paymentId: 'p',
  sdkAuthorization: 'a',
};
// @ts-expect-error - cardSource is required; there is no defensible default posture
export const badSource5: VaultPaymentConfirmInput = {paymentId: 'p', sdkAuthorization: 'a'};

/* Every navigation branch narrows. */
export function navigationNarrowing(result: VaultPaymentResult): string {
  switch (result.status) {
    case 'succeeded':
      return 'done';
    case 'processing':
      return 'waiting';
    case 'requires_customer_action': {
      const nextAction: VaultNextAction = result.nextAction;
      const type: VaultNextAction['type_'] = nextAction.type_;
      return type;
    }
    case 'failed':
    case 'validation_error':
    case 'not_ready':
      return result.error.message;
  }
}

/* Each next-action payload is optional and individually typed. */
export function nextActionPayloads(nextAction: VaultNextAction) {
  return [
    nextAction.redirectUrl,
    nextAction.threeDs?.authenticationUrl,
    nextAction.threeDs?.pollId,
    nextAction.ddc?.iframeUrl,
    nextAction.ddc?.timeoutMs,
    nextAction.sessionToken?.openBankingSessionToken,
  ];
}

/* NEGATIVE — the payment result may never carry a token. */
export function paymentHasNoToken(result: VaultPaymentResult) {
  if (result.status === 'succeeded') {
    // @ts-expect-error - a payment result never carries a token
    return result.token;
  }
  // @ts-expect-error - not on the failure branches either
  return result.token;
}

/* NEGATIVE — `error` is unavailable on the success branches. */
export function noErrorOnSuccess(result: VaultPaymentResult) {
  if (result.status === 'succeeded') {
    // @ts-expect-error - a succeeded result has no error
    return result.error;
  }
  if (result.status === 'processing') {
    // @ts-expect-error - a processing result has no error
    return result.error;
  }
  if (result.status === 'requires_customer_action') {
    // @ts-expect-error - a customer-action result has no error
    return result.error;
  }
  return result.error.message;
}

/* NEGATIVE — no nextAction on non-action branches. */
export function noNextActionElsewhere(result: VaultPaymentResult) {
  if (result.status === 'succeeded') {
    // @ts-expect-error - only requires_customer_action carries a next action
    return result.nextAction;
  }
  return null;
}

/* NEGATIVE — the two results are not interchangeable. */
export function statusesDoNotCross(payment: VaultPaymentResult, tokenize: VaultTokenizeResult) {
  // @ts-expect-error - 'success' is a tokenize status, not a payment status
  const a = payment.status === 'success';
  // @ts-expect-error - 'succeeded' is a payment status, not a tokenize status
  const b = tokenize.status === 'succeeded';
  return [a, b];
}

/* NEGATIVE — tokenize takes no arguments, on this handle too. */
export async function tokenizeTakesNothing() {
  // @ts-expect-error - tokenize accepts no input
  return formRef.current!.tokenize(confirmInput);
}

/* ══ 4. Host card keys are unrepresentable in the confirm input ═══════════════ */

export const hostData: VaultHostPaymentMethodData = {billing: {email: 'a@b.co'}, nickName: 'Card'};

// @ts-expect-error - a raw card number is not a host field
export const badHost1: VaultHostPaymentMethodData = {card_number: '4111111111111111'};
// @ts-expect-error - a card object is not a host field
export const badHost2: VaultHostPaymentMethodData = {card: {}};
// @ts-expect-error - camelCase spelling is rejected too
export const badHost3: VaultHostPaymentMethodData = {cardNumber: '4111111111111111'};
// @ts-expect-error - no CVC
export const badHost4: VaultHostPaymentMethodData = {cvc: '123'};
// @ts-expect-error - no cardholder name from the host; the library owns that field
export const badHost5: VaultHostPaymentMethodData = {cardHolderName: 'Ada'};
// @ts-expect-error - no expiry
export const badHost6: VaultHostPaymentMethodData = {expiryMonth: '12'};
// @ts-expect-error - no token may be supplied by the host
export const badHost7: VaultHostPaymentMethodData = {payment_token: 'tok'};
// @ts-expect-error - nested card data is rejected by the billing shape
export const badHost8: VaultHostPaymentMethodData = {billing: {card_number: '4111111111111111'}};
// @ts-expect-error - a card key nested in the address is rejected
export const badHost9: VaultHostPaymentMethodData = {billing: {address: {cvc: '123'}}};

/* The same rejections through the actual confirm input, in BOTH sources. */
const direct = {type_: 'direct'} as const;

export const badInput1: VaultPaymentConfirmInput = {
  cardSource: direct,
  paymentId: 'p',
  sdkAuthorization: 'a',
  // @ts-expect-error - card data cannot be smuggled through the confirm input
  paymentMethodData: {card: {}},
};
export const badInput2: VaultPaymentConfirmInput = {
  cardSource: direct,
  paymentId: 'p',
  sdkAuthorization: 'a',
  // @ts-expect-error - nor at the top level of the input
  card_number: '4111111111111111',
};
/*
 * The direct flow is where a caller might most plausibly expect to hand over card values, since
 * nothing is tokenized. It is exactly as closed as the vault flow.
 */
export const badInput2b: VaultPaymentConfirmInput = {
  cardSource: {type_: 'vault', session},
  paymentId: 'p',
  sdkAuthorization: 'a',
  // @ts-expect-error - and not through the vault source either
  paymentMethodData: {cardNumber: '4111111111111111'},
};

/* Closed unions on the confirm input. */
// @ts-expect-error - payment method type is a closed union
export const badInput3: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p', sdkAuthorization: 'a', paymentMethodType: 'Credit'};
// @ts-expect-error - payment type is a closed union
export const badInput4: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p', sdkAuthorization: 'a', paymentType: 'newMandate'};
export const badInput5: VaultPaymentConfirmInput = {
  cardSource: direct,
  paymentId: 'p',
  sdkAuthorization: 'a',
  // @ts-expect-error - acceptance type is a closed union
  customerAcceptance: {acceptanceType: 'ONLINE', acceptedAt: 'x', online: {}},
};
export const badInput6: VaultPaymentConfirmInput = {
  // @ts-expect-error - confirm token mode is a closed union
  cardSource: {type_: 'vault', session, confirmTokenMode: 'token'},
  paymentId: 'p',
  sdkAuthorization: 'a',
};
// @ts-expect-error - confirm token mode is no longer a top-level field; it belongs to the source
export const badInput6b: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p', sdkAuthorization: 'a', confirmTokenMode: 'payment_token'};
// @ts-expect-error - paymentId is required
export const badInput7: VaultPaymentConfirmInput = {cardSource: direct, sdkAuthorization: 'a'};
/*
 * The payment credential arrives in either shape Hyperswitch accepts. Which one is complete is a
 * run-time question (`invalid_session` when neither is), so both compile — and so does an input
 * with neither, because the type cannot know which of the two the host meant to supply.
 */
export const legacyInput: VaultPaymentConfirmInput = {
  cardSource: direct,
  paymentId: 'p',
  publishableKey: 'pk_test_123',
  clientSecret: 'pay_123_secret',
};
export const bareCredentialInput: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p'};
// @ts-expect-error - the legacy publishable key is a string
export const badInput8: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p', publishableKey: 42};
// @ts-expect-error - the legacy client secret is a string
export const badInput8b: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p', clientSecret: {}};

/* ══ 5. The handle: four operations, no accessors ═════════════════════════════ */

export function handleSurface(handle: HostFormHandle) {
  handle.reset();
  handle.focus('cardNumber');
  return [handle.tokenize, handle.confirmPayment];
}

export function noValueAccessors(handle: HostFormHandle) {
  // @ts-expect-error - there is no way to read the card number
  return handle.getCardNumber;
}

export function noSubmit(handle: HostFormHandle) {
  // @ts-expect-error - the ambiguous submit() was replaced by tokenize()/confirmPayment()
  return handle.submit;
}
