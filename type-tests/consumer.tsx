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
 *   - the checkout-SDK contract (ADR-0010) is ABSENT here: no `confirmPayment`, no `eligibility`
 *     prop, no `'external'` cardholder-name mode, no confirm-only error code. Its positive half is
 *     type-tests/host.tsx, against `./host`.
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
  HyperswitchVaultSavedCardForm,
} from '../dist/types/public';
import type {
  MerchantSession,
  VaultFormHandle,
  VaultFieldHandle,
  VaultField,
  VaultTokenizeResult,
  VaultSavedCardHandle,
  HyperswitchVaultSavedCardFormProps,
  VaultCVCState,
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
  SafeVaultErrorCode,
  VaultCardBrand,
  VaultFieldErrorCode,
  VaultSessionStatus,
  VaultCardholderNameMode,
  VaultFormValidationMessages,
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

/* ══ 3. The checkout-SDK contract is not on this entry (ADR-0010) ════════════ */

/* The six codes `tokenize()` can produce — and only those. */
export const tokenizeCodes: SafeVaultErrorCode[] = [
  'invalid_card_data',
  'not_ready',
  'invalid_session',
  'unsupported_configuration',
  'server_error',
  'unknown_outcome',
];
// @ts-expect-error - a confirm-only code is not a tokenize code
export const notATokenizeCode1: SafeVaultErrorCode = 'forbidden_card_data';
// @ts-expect-error - nor is the eligibility refusal
export const notATokenizeCode2: SafeVaultErrorCode = 'card_not_eligible';

export function noConfirmOnRoot(handle: VaultFormHandle) {
  // @ts-expect-error - confirmPayment lives on the ./host handle, not the merchant one
  return handle.confirmPayment;
}

export const noEligibilityProp = (
  <HyperswitchVaultFormProvider
    session={session}
    environment="sandbox"
    // @ts-expect-error - live eligibility is a ./host prop
    eligibility={{paymentId: 'pay_1', sdkAuthorization: 'intent'}}>
    <CardNumberField />
  </HyperswitchVaultFormProvider>
);

export const twoNameModes: VaultCardholderNameMode[] = ['collect', 'omit'];
// @ts-expect-error - 'external' only means something with a confirm input, so it is ./host only
export const noExternalMode: VaultCardholderNameMode = 'external';
export const noExternalProp = (
  // @ts-expect-error - the prop takes the two merchant modes
  <HyperswitchVaultFormProvider session={session} environment="sandbox" cardholderName="external">
    <CardNumberField />
  </HyperswitchVaultFormProvider>
);

export const messages: VaultFormValidationMessages = {cardNumberInvalid: 'Check the number'};
// @ts-expect-error - the eligibility message has no reader on this entry
export const noEligibilityMessage: VaultFormValidationMessages = {cardNotEligible: 'Not accepted'};

/* ══ 4. (moved) The confirm input and its rejections are exercised in host.tsx ══ */

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
      const code: VaultFieldErrorCode | undefined = s.error?.code;
      const message: string | undefined = s.error?.message;
      return [valid, status, touched, focused, brand, coBadged, code, message];
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
// @ts-expect-error - the eligibility verdict is a ./host member; here it is always 'unknown' and not declared
export const noHost1 = formState.eligibility;
// @ts-expect-error - nor on the card-number snapshot
export const noHost2 = numberState.eligibility;
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
  return [handle.tokenize];
}

// @ts-expect-error - focus takes a closed field union
export const badFocus = (handle: VaultFormHandle) => handle.focus('postalCode');

export function noValueAccessors(handle: VaultFormHandle) {
  // @ts-expect-error - there is no way to read the card number
  return handle.getCardNumber;
}

export function noSubmit(handle: VaultFormHandle) {
  // @ts-expect-error - the ambiguous submit() was replaced by tokenize()
  return handle.submit;
}

export function fieldHandleSurface(handle: VaultFieldHandle) {
  handle.focus();
  handle.blur();
  // @ts-expect-error - a field handle exposes no value
  return handle.value;
}

/* ══ 10. The saved-card CVC component (ADR-0008) ═════════════════════════════ */

const savedCardRef = React.createRef<VaultSavedCardHandle>();

/* Bare minimum: the four required props. */
export const savedCardMinimal = (
  <HyperswitchVaultSavedCardForm
    ref={savedCardRef}
    session={session}
    environment="sandbox"
    paymentMethodToken="token_from_list_payment_methods"
  />
);

/* Everything optional, and the emitted state is the existing CVC state. */
export const savedCardFull = (
  <HyperswitchVaultSavedCardForm
    session={session}
    environment="production"
    paymentMethodToken="token_from_list_payment_methods"
    cardNetwork="AmericanExpress"
    vaultEndpoint={{baseUrl: 'https://vault.example.com/api'}}
    appearance={{primaryColor: '#0570DE', borderRadius: 8}}
    cvcOptions={{placeholder: 'CVC', cvcIcon: 'default', errorDisplay: 'inline', testID: 'cvc'}}
    cvcStyles={{input: textStyle, error: textStyle}}
    containerStyle={rootStyle}
    onStateChange={(s: VaultCVCState) => {
      const valid: boolean = s.valid;
      const status: 'empty' | 'incomplete' | 'complete' = s.status;
      const touched: boolean = s.touched;
      const code: VaultFieldErrorCode | undefined = s.error?.code;
      return [valid, status, touched, code];
    }}
  />
);

export const savedCardProps: HyperswitchVaultSavedCardFormProps = {
  session,
  environment: 'sandbox',
  paymentMethodToken: 'token_from_list_payment_methods',
};

/* The operation resolves to the SAME tokenize result: `token` on success and nowhere else. */
export async function savedCardFlow(): Promise<string | null> {
  const result: VaultTokenizeResult = await savedCardRef.current!.updateSavedPaymentMethod();
  switch (result.status) {
    case 'success':
      return result.token;
    case 'validation_error':
    case 'not_ready':
    case 'error':
      return result.error.code === 'not_ready' ? null : result.error.message;
  }
}

/* Four members, no accessor, and focus/blur take no argument. */
export function savedCardHandleSurface(handle: VaultSavedCardHandle) {
  handle.reset();
  handle.focus();
  handle.blur();
  return [handle.updateSavedPaymentMethod];
}

/* NEGATIVE — the contract's edges are compile errors. */
// @ts-expect-error - the token is required: there is no saved card to collect a CVC for without one
export const savedCardNoToken = <HyperswitchVaultSavedCardForm session={session} environment="sandbox" />;
// @ts-expect-error - the environment cannot be inferred from the session
export const savedCardNoEnvironment = <HyperswitchVaultSavedCardForm session={session} paymentMethodToken="t" />;
// @ts-expect-error - the session is required
export const savedCardNoSession = <HyperswitchVaultSavedCardForm environment="sandbox" paymentMethodToken="t" />;
export const savedCardNoChildren = (
  // @ts-expect-error - it renders its own CVC field and takes no children: never zero fields, never two
  <HyperswitchVaultSavedCardForm session={session} environment="sandbox" paymentMethodToken="t">
    <CardCVCField />
  </HyperswitchVaultSavedCardForm>
);
export const savedCardNoRequiresCvv = (
  // @ts-expect-error - the merchant has already read requires_cvv; the library does not take a copy
  <HyperswitchVaultSavedCardForm session={session} environment="sandbox" paymentMethodToken="t" requiresCvv />
);
export const savedCardNotControlled = (
  // @ts-expect-error - the CVC is library-owned; there is no value prop
  <HyperswitchVaultSavedCardForm session={session} environment="sandbox" paymentMethodToken="t" value="123" />
);
export const savedCardNoChangeHandler = (
  // @ts-expect-error - and no change handler
  <HyperswitchVaultSavedCardForm session={session} environment="sandbox" paymentMethodToken="t" onChangeText={(v: string) => v} />
);
export const savedCardNoFocusArgument = (handle: VaultSavedCardHandle) =>
  // @ts-expect-error - one field, so focus() takes no argument
  handle.focus('cvc');
export const savedCardNoTokenize = (handle: VaultSavedCardHandle) =>
  // @ts-expect-error - the saved-card handle has no tokenize(): it updates a card that is already saved
  handle.tokenize;
export const savedCardNoConfirm = (handle: VaultSavedCardHandle) =>
  // @ts-expect-error - and it confirms no payment
  handle.confirmPayment;
declare const savedCardState: VaultCVCState;
// @ts-expect-error - the CVC value is unreachable
export const savedCardNoLeak1 = savedCardState.value;
// @ts-expect-error - so is its length
export const savedCardNoLeak2 = savedCardState.length;
// @ts-expect-error - the network hint is never reflected back: VaultCVCState has no brand member
export const savedCardNoLeak3 = savedCardState.brand;
// @ts-expect-error - there is no canSubmit on a field snapshot; `valid` answers that question
export const savedCardNoCanSubmit = savedCardState.canSubmit;
// @ts-expect-error - no new emitted type was minted for this flow
export type {SavedCardFormState} from '../dist/types/public';

/* Keeps `View` used so the import is not reported as unused. */
export const wrapper = <View>{form}</View>;
