/*
 * CONSUMER TYPE TESTS — compiled against the PUBLISHED declarations in dist/types, under the same
 * compiler configuration a React Native app uses.
 *
 * These are the type-level half of the boundary proof. The runtime half lives in the verify scripts
 * and the example suite; this file proves the things that must be impossible to WRITE:
 *
 *   - a token is reachable on the tokenize result, and NOWHERE else;
 *   - the removed state-emission callbacks cannot be passed;
 *   - card values and change events cannot be controlled from outside;
 *   - card keys cannot be smuggled into the payment-confirm input;
 *   - every navigation branch narrows, and `error` is absent on success branches.
 *
 * Every `@ts-expect-error` is load-bearing: if the surface widened, the directive itself would
 * become an unused-directive error and this file would fail. That is what makes the negatives
 * non-vacuous.
 */
import * as React from 'react';
import {View, StyleSheet} from 'react-native';
import type {StyleProp, ViewStyle, TextStyle} from 'react-native';
import {
  HyperswitchVaultForm,
  HyperswitchVaultFormProvider,
  HyperswitchVault,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardholderNameField,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  CardholderNameWidget,
} from '../dist/types/public';
import type {
  MerchantSession,
  VaultFormHandle,
  VaultFieldHandle,
  VaultField,
  VaultTokenizeResult,
  VaultPaymentResult,
  VaultPaymentConfirmInput,
  VaultHostPaymentMethodData,
  VaultFieldStyles,
  VaultExpiryStyles,
  VaultFormFieldStyles,
  VaultFormFieldOptions,
  VaultCardNumberOptions,
  VaultCVCOptions,
  VaultCardholderNameOptions,
  VaultLabelBehavior,
  VaultErrorDisplay,
  VaultBrandIconMode,
  VaultCVCIconDisplay,
  VaultFormLayout,
  VaultFieldArrangement,
  VaultEnvironment,
  SafeVaultError,
  VaultNextAction,
  VaultCardBrand,
  VaultFieldErrorCode,
  VaultEligibilityStatus,
  VaultSessionStatus,
  VaultCardNumberState,
  VaultFormState,
  VaultFieldState,
} from '../dist/types/public';

const session = {} as MerchantSession;
const formRef = React.createRef<VaultFormHandle>();
const fieldRef = React.createRef<VaultFieldHandle>();

/* ══ 1. The ready-made form and the provider render ═══════════════════════════ */

export const form = (
  <HyperswitchVaultForm ref={formRef} session={session} environment="sandbox" />
);

export const provider = (
  <HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
    <CardholderNameField />
    <CardNumberField />
    <CardExpiryField />
    <CardCVCField />
  </HyperswitchVaultFormProvider>
);

export const namespaced = (
  <HyperswitchVault.Form session={session} environment="sandbox">
    <HyperswitchVault.CardholderName />
    <HyperswitchVault.CardNumber />
    <HyperswitchVault.Expiry />
    <HyperswitchVault.CVC />
  </HyperswitchVault.Form>
);

/* The legacy widget spellings are the same components. */
export const legacy = (
  <HyperswitchVaultFormProvider session={session} environment="sandbox">
    <CardholderNameWidget />
    <CardNumberWidget />
    <CardExpiryWidget />
    <CardCVCWidget />
  </HyperswitchVaultFormProvider>
);

/* ══ 2. FLOW 1 — tokenize: `.token` IS reachable ══════════════════════════════ */

export async function tokenizeFlow(): Promise<string | null> {
  const result: VaultTokenizeResult = await formRef.current!.tokenize();

  switch (result.status) {
    case 'success':
      /* The one permitted token in the whole published surface. */
      return result.token;
    case 'validation_error':
    case 'not_ready':
    case 'error': {
      const error: SafeVaultError = result.error;
      void error.message;
      return null;
    }
  }
}

/* `token` is present ONLY on success. */
export function tokenizeNarrowing(result: VaultTokenizeResult) {
  if (result.status === 'success') {
    return result.token;
  }
  // @ts-expect-error - a non-success tokenize result has no token
  return result.token;
}

export function tokenizeErrorNarrowing(result: VaultTokenizeResult) {
  if (result.status === 'error') {
    return result.error.code;
  }
  if (result.status === 'success') {
    // @ts-expect-error - a successful tokenize result has no error
    return result.error;
  }
  return result.error.message;
}

/* ══ 3. FLOWS 2 AND 3 — confirmPayment: NO token, ever ════════════════════════ */

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

/* NEGATIVE — tokenize takes no arguments. */
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
// @ts-expect-error - sdkAuthorization is required
export const badInput8: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p'};

/* ══ 5. State emission reports validity, and nothing card-shaped ══════════════ */

/*
 * POSITIVE: what ADR-0005 exists to make possible. A merchant drives their own chrome from these
 * without ever holding a card value.
 */
export const emit1 = (
  <CardNumberField
    onStateChange={(s) => {
      const valid: boolean = s.valid;
      const status: 'empty' | 'incomplete' | 'complete' = s.status;
      const touched: boolean = s.touched;
      const focused: boolean = s.focused;
      const brand: VaultCardBrand = s.brand;
      const coBadged: boolean = s.isCoBadged;
      const eligibility: VaultEligibilityStatus = s.eligibility;
      const code: VaultFieldErrorCode | undefined = s.error?.code;
      const message: string | undefined = s.error?.message;
      return [valid, status, touched, focused, brand, coBadged, eligibility, code, message];
    }}
  />
);
export const emit2 = <CardExpiryField onStateChange={(s) => s.valid} />;
/* The form-level network fault, and the optional name's always-true validity. */
export const emitNetwork = (
  <HyperswitchVaultForm
    session={session}
    environment="sandbox"
    enabledCardSchemes={['Visa']}
    onFormStateChange={(s) => {
      const why: VaultFieldErrorCode | undefined = s.networkError?.code;
      const nameValid: boolean | undefined = s.fields.cardholderName?.valid;
      return [why, nameValid];
    }}
  />
);
export const emit3 = <CardCVCField onStateChange={(s) => s.error?.message} />;
export const emit4 = <CardholderNameField onStateChange={(s) => s.status} />;
export const emit5 = (
  <HyperswitchVaultForm
    session={session}
    environment="sandbox"
    onFormStateChange={(s) => {
      const canSubmit: boolean = s.canSubmit;
      const sessionStatus: VaultSessionStatus = s.sessionStatus;
      const cvcValid: boolean = s.fields.cvc.valid;
      const namePresent: boolean = s.fields.cardholderName !== undefined;
      return [canSubmit, sessionStatus, cvcValid, namePresent];
    }}
  />
);
export const emit6 = (
  <HyperswitchVaultFormProvider
    session={session}
    environment="sandbox"
    onFormStateChange={(s: VaultFormState) => s.complete}>
    <CardNumberField />
  </HyperswitchVaultFormProvider>
);

/* The union narrows on `field`, and `brand` lives on exactly one branch. */
export function narrowField(s: VaultFieldState): string {
  switch (s.field) {
    case 'cardNumber':
      return s.brand;
    case 'expiry':
    case 'cvc':
    case 'cardholderName':
      return s.status;
  }
}

/*
 * NEGATIVE: the emitted snapshot has no route to a card value. These are the assertions that make
 * "events without a leak" a compiler-enforced property rather than a claim in a comment.
 */
declare const numberState: VaultCardNumberState;
declare const formState: VaultFormState;

// @ts-expect-error - the PAN is not on the snapshot
export const noLeak1 = numberState.value;
// @ts-expect-error - the BIN is not on the snapshot (this is where VGS and this library part ways)
export const noLeak2 = numberState.bin;
// @ts-expect-error - the last four are not on the snapshot
export const noLeak3 = numberState.last4;
// @ts-expect-error - not even the length of what was typed
export const noLeak4 = numberState.length;
// @ts-expect-error - the CVC value is not on the snapshot
export const noLeak5 = formState.fields.cvc.value;
// @ts-expect-error - expiry parts are not on the snapshot
export const noLeak6 = formState.fields.expiry.expiryMonth;
// @ts-expect-error - the payment-method token never reaches a merchant surface
export const noLeak7 = formState.token;
// @ts-expect-error - the vault authorization never reaches a merchant surface
export const noLeak8 = formState.sdkAuthorization;
// @ts-expect-error - `brand` is card-number only
export const noLeak9 = formState.fields.expiry.brand;
export const noLeak10 = (
  // @ts-expect-error - the ready-made form emits form state, not per-field state
  <HyperswitchVaultForm session={session} environment="sandbox" onStateChange={(s: unknown) => s} />
);

/* ══ 6. Card values and events cannot be controlled from outside ══════════════ */

// @ts-expect-error - fields are not controlled inputs
export const noControl1 = <CardNumberField value="4111111111111111" />;
// @ts-expect-error - no defaultValue either
export const noControl2 = <CardNumberField defaultValue="4111111111111111" />;
// @ts-expect-error - no onChange
export const noControl3 = <CardNumberField onChange={(v: unknown) => v} />;
// @ts-expect-error - no onChangeText
export const noControl4 = <CardNumberField onChangeText={(v: string) => v} />;
// @ts-expect-error - no native events
export const noControl5 = <CardCVCField onKeyPress={(e: unknown) => e} />;
// @ts-expect-error - the expiry is not controlled either
export const noControl6 = <CardExpiryField value="12/30" />;
// @ts-expect-error - the CVC is not controlled either
export const noControl7 = <CardCVCField value="123" />;

/* ══ 7. Cardholder name: options yes, values no ═══════════════════════════════ */

export const cardholderOptions: VaultCardholderNameOptions = {
  placeholder: 'Name on card',
  label: 'Cardholder name',
  labelBehavior: 'floating',
  errorDisplay: 'inline',
  accessibilityLabel: 'Cardholder name',
  accessibilityHint: 'The name printed on your card',
  testID: 'cardholder',
};

export const cardholderStyled = (
  <CardholderNameField
    ref={fieldRef}
    placeholder="Name on card"
    label="Cardholder name"
    labelBehavior="static"
    errorDisplay="inline"
    accessibilityLabel="Cardholder name"
    testID="cardholder"
    styles={{root: {marginTop: 8}, input: {fontSize: 16}}}
  />
);

// @ts-expect-error - the cardholder name is library-owned; it takes no value
export const badCardholder1 = <CardholderNameField value="Ada Lovelace" />;
// @ts-expect-error - and no change handler
export const badCardholder2 = <CardholderNameField onChangeText={(v: string) => v} />;
// @ts-expect-error - it has no brand icon
export const badCardholder3 = <CardholderNameField brandIconMode="standard" />;
// @ts-expect-error - and no CVC icon
export const badCardholder4 = <CardholderNameField cvcIcon="default" />;

/* ══ 8. Field options and styles still work ══════════════════════════════════ */

export const numberOptions: VaultCardNumberOptions = {
  placeholder: 'Card number',
  labelBehavior: 'floating' satisfies VaultLabelBehavior,
  errorDisplay: 'inline' satisfies VaultErrorDisplay,
  brandIconMode: 'animated' satisfies VaultBrandIconMode,
};

export const cvcOptions: VaultCVCOptions = {
  placeholder: 'CVC',
  cvcIcon: 'default' satisfies VaultCVCIconDisplay,
};

export const formOptions: VaultFormFieldOptions = {
  cardNumber: numberOptions,
  expiry: {placeholder: 'MM / YY'},
  cvc: cvcOptions,
  cardholderName: cardholderOptions,
};

const sheet = StyleSheet.create({box: {marginTop: 4}});
const rootStyle: StyleProp<ViewStyle> = sheet.box;
const textStyle: StyleProp<TextStyle> = {fontSize: 14};

export const fieldStyles: VaultFieldStyles = {
  root: rootStyle,
  input: textStyle,
  placeholder: textStyle,
  error: textStyle,
};

export const expiryStyles: VaultExpiryStyles = {root: rootStyle, input: textStyle};

export const formStyles: VaultFormFieldStyles = {
  cardNumber: fieldStyles,
  expiry: expiryStyles,
  cvc: fieldStyles,
  cardholderName: fieldStyles,
};

export const fullyConfigured = (
  <HyperswitchVaultForm
    ref={formRef}
    session={session}
    environment={'production' satisfies VaultEnvironment}
    layout={'inline' satisfies VaultFormLayout}
    fieldArrangement={'fused' satisfies VaultFieldArrangement}
    fieldOptions={formOptions}
    fieldStyles={formStyles}
    appearance={{primaryColor: '#0570DE', borderRadius: 8}}
    localisation={{validationMessages: {cardNumberInvalid: 'Check the number'}, isRtl: false}}
    disabled={false}
    accessible
  />
);

// @ts-expect-error - the expiry renders no accessory, so it has no accessory slot
export const badExpiryStyles: VaultExpiryStyles = {accessory: rootStyle};
// @ts-expect-error - label behavior is a closed union
export const badLabelBehavior: VaultLabelBehavior = 'animated';
// @ts-expect-error - the brand icon mode union is closed
export const badBrandIcon: VaultBrandIconMode = 'visible';

/* ══ 9. The handle: three operations, no accessors ════════════════════════════ */

export function handleSurface(handle: VaultFormHandle) {
  handle.reset();
  handle.focus('cardNumber' satisfies VaultField);
  handle.focus('expiry');
  handle.focus('cvc');
  handle.focus('cardholderName');
  return [handle.tokenize, handle.confirmPayment];
}

// @ts-expect-error - focus takes a closed field union
export const badFocus = (handle: VaultFormHandle) => handle.focus('postalCode');

export function noValueAccessors(handle: VaultFormHandle) {
  // @ts-expect-error - there is no way to read the card number
  return handle.getCardNumber;
}

export function noSubmit(handle: VaultFormHandle) {
  // @ts-expect-error - the ambiguous submit() was replaced by tokenize()/confirmPayment()
  return handle.submit;
}

export function fieldHandleSurface(handle: VaultFieldHandle) {
  handle.focus();
  handle.blur();
  // @ts-expect-error - a field handle exposes no value
  return handle.value;
}

/* Keeps `View` used so the import is not reported as unused. */
export const wrapper = <View>{form}</View>;
