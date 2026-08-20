/*
 * Consumer-side TypeScript assertions, checked against the PUBLISHED declarations in dist/types —
 * not against src — so this is the same surface a merchant's `tsc` sees.
 *
 * Every `@ts-expect-error` below is a negative control: TypeScript fails the build if the line it
 * marks stops being an error, so this file cannot pass vacuously. `tsc -p tsconfig.consumer.json`
 * runs as the last step of `yarn build`.
 *
 * The generated ReScript types are the source of truth. The one hand-written piece in `public.ts`
 * is the forwardRef composition — genType types a forwardRef component as ComponentType<Props> and
 * drops the ref — and assertion 1 is what keeps that facade honest.
 */
import * as React from 'react';
import {
  HyperswitchVaultForm,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
  type VaultSubmitResult,
  type CardFormState,
  type VaultFormAppearance,
} from '../dist/types/public';

/* ── 1. the ref is accepted, and typed ───────────────────────────────────── */

const session: MerchantSession = {
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: { sdk_authorization: 'ZmFrZQ==' },
  },
};

export function Accepts() {
  const ref = React.useRef<HyperswitchVaultFormHandle>(null);
  const appearance: VaultFormAppearance = { primaryColor: '#0570DE' };

  return (
    <HyperswitchVaultForm
      ref={ref}
      session={session}
      environment="sandbox"
      appearance={appearance}
      disabled={false}
      onStateChange={(state: CardFormState) => state.complete}
    />
  );
}

/* Required props stay required. */
// @ts-expect-error - `session` is required
const missingSession = <HyperswitchVaultForm environment="sandbox" />;
// @ts-expect-error - `environment` is required
const missingEnvironment = <HyperswitchVaultForm session={session} />;
void missingSession;
void missingEnvironment;

/* ── 2, 3, 4. the result narrows by status ───────────────────────────────── */

export function narrows(result: VaultSubmitResult): string {
  switch (result.status) {
    case 'success': {
      const token: string = result.token;
      /* TOKEN ONLY: masked card metadata is not part of the public success result. */
      // @ts-expect-error - `card` does not exist on a standalone success result
      result.card;
      // @ts-expect-error - no PAN accessor exists
      result.cardNumber;
      // @ts-expect-error - no last4 accessor exists
      result.last4Digits;
      // @ts-expect-error - no expiry accessor exists
      result.expiryMonth;
      const onlyToken: string = result.token;
      void onlyToken;
      // @ts-expect-error - a success carries no error
      void result.error;
      return token;
    }
    case 'validation_error':
    case 'not_ready':
    case 'error': {
      const message: string = result.error.message;
      // @ts-expect-error - only a success carries a token
      void result.token;
      // @ts-expect-error - only a success carries card metadata
      void result.card;
      return message;
    }
  }
}

/* The error code is a closed union — and `network_error` is not in it. */
export function codes(result: VaultSubmitResult): boolean {
  if (result.status === 'success') return true;
  switch (result.error.code) {
    case 'invalid_session':
    case 'invalid_card_data':
    case 'not_ready':
    case 'server_error':
    case 'unknown_outcome':
      return false;
  }
}

const removedCode: VaultSubmitResult = {
  status: 'error',
  // @ts-expect-error - removed from the public union: no reachable condition can safely produce it
  error: { code: 'network_error', message: 'x' },
};
void removedCode;

/* Exhaustiveness: adding a status without handling it must break a consumer's switch. */
export function exhaustive(result: VaultSubmitResult): string {
  switch (result.status) {
    case 'success':
      return 'ok';
    case 'validation_error':
    case 'not_ready':
    case 'error':
      return result.error.code;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

/* ── 5, 6. the session shape ─────────────────────────────────────────────── */

/* Extra backend fields are carried through untouched, so a payload change cannot break a build. */
const withExtras: MerchantSession = {
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: { sdk_authorization: 'ZmFrZQ==' },
  },
  session_token: [],
  payment_id: 'pay_fake',
  anything_the_backend_adds_later: { nested: true },
};
void withExtras;

/* The two fields the component actually reads are typed, not `any`. */
export function readsSession(input: MerchantSession): string {
  const vaultType: string | undefined = input.vault_details?.vault_type;
  const authorization: string | undefined = input.vault_details?.vault_data?.sdk_authorization;
  return `${vaultType ?? ''}${authorization ?? ''}`;
}

// @ts-expect-error - vault_type is a string, not a number
const badVaultType: MerchantSession = { vault_details: { vault_type: 7 } };
void badVaultType;

/* ── 7. wrong values must not compile ────────────────────────────────────── */

export function rejectsBadValues(ref: React.RefObject<HyperswitchVaultFormHandle>) {
  // @ts-expect-error - "staging" is not one of the three environments
  const wrongEnvironment = <HyperswitchVaultForm session={session} environment="staging" />;
  void wrongEnvironment;

  ref.current?.focus('cardNumber');
  ref.current?.focus('expiry');
  ref.current?.focus('cvc');
  // @ts-expect-error - "postalCode" is not a field of this form
  ref.current?.focus('postalCode');

  // @ts-expect-error - onStateChange never receives a card value, so there is nothing to destructure
  const leaks = <HyperswitchVaultForm session={session} environment="sandbox" onStateChange={(s) => s.cardNumber} />;
  void leaks;
}

/* ── The handle's own shape ──────────────────────────────────────────────── */

export async function usesHandle(handle: HyperswitchVaultFormHandle): Promise<string> {
  const result: VaultSubmitResult = await handle.submit();
  handle.reset();
  // @ts-expect-error - reset takes no arguments
  handle.reset('everything');
  return result.status;
}

/* ── Phase A1: localisation, accessibility, appearance completeness ───────── */

import type {
  VaultFormLocalisation,
  VaultFormLabels,
  VaultFormValidationMessages,
} from '../dist/types/public';

/* The four-step Quick Start must still compile with none of the new props. */
export function unchangedQuickStart() {
  const ref = React.useRef<HyperswitchVaultFormHandle>(null);
  return <HyperswitchVaultForm ref={ref} session={session} environment="sandbox" />;
}

/* Every new property is optional — an empty object is valid at each level. */
export const emptyLocalisation: VaultFormLocalisation = {};
export const emptyLabels: VaultFormLabels = {};
export const emptyMessages: VaultFormValidationMessages = {};

/* Partial overrides compile: one string, without supplying its siblings. */
export const oneLabel: VaultFormLocalisation = {labels: {cvcPlaceholder: 'Code'}};
export const oneMessage: VaultFormLocalisation = {
  validationMessages: {cardNumberInvalid: 'Numéro de carte invalide'},
};
export const rtlOnly: VaultFormLocalisation = {isRtl: true};

/* Labels and validation messages are usable together — the localisation case. */
export const fullyTranslated: VaultFormLocalisation = {
  labels: {
    cardNumberPlaceholder: 'Numéro de carte',
    cardNumberFloatingLabel: 'Numéro de carte',
    expiryPlaceholder: 'MM / AA',
    expiryFloatingLabel: 'Expiration',
    cvcPlaceholder: 'CVC',
    cvcFloatingLabel: 'CVC',
  },
  validationMessages: {
    cardNumberRequired: 'Le numéro de carte est requis',
    cardNumberInvalid: 'Numéro de carte invalide',
    expiryRequired: "La date d'expiration est requise",
    expiryInvalid: "Date d'expiration invalide",
    cvcRequired: 'Le code de sécurité est requis',
    cvcInvalid: 'Code de sécurité invalide',
  },
  isRtl: false,
};

export function withAllPhaseA1Props() {
  return (
    <HyperswitchVaultForm
      session={session}
      environment="sandbox"
      accessible
      localisation={fullyTranslated}
      appearance={{
        gap: 16,
        fontScale: 1.15,
        placeholderTextSizeAdjust: 1,
        errorTextSizeAdjust: 1,
        errorMessageSpacing: 6,
      }}
    />
  );
}

/* ── Negative controls ───────────────────────────────────────────────────── */

// @ts-expect-error - labels take strings, not numbers
export const badLabelType: VaultFormLabels = {cvcPlaceholder: 7};

// @ts-expect-error - no such label; the surface is closed
export const unknownLabel: VaultFormLabels = {cardHolderName: 'Name'};

// @ts-expect-error - no such validation message
export const unknownMessage: VaultFormValidationMessages = {postalCodeInvalid: 'x'};

// @ts-expect-error - isRtl is a boolean
export const badRtl: VaultFormLocalisation = {isRtl: 'yes'};

// @ts-expect-error - eligibility text is client-core-only and deliberately not exposed
export const noEligibilityText: VaultFormLabels = {notEligibleText: 'x'};

export function rejectsBadNewValues() {
  // @ts-expect-error - accessible is a boolean
  const a = <HyperswitchVaultForm session={session} environment="sandbox" accessible="yes" />;
  // @ts-expect-error - appearance sizes are numbers
  const b = <HyperswitchVaultForm session={session} environment="sandbox" appearance={{gap: '16'}} />;
  // @ts-expect-error - localisation is an object, not a locale string
  const c = <HyperswitchVaultForm session={session} environment="sandbox" localisation="fr-FR" />;
  return [a, b, c];
}

/* ── Phase A3: brand icon modes ──────────────────────────────────────────── */

import type {VaultFormBrandIconMode} from '../dist/types/public';

export const allModes: VaultFormBrandIconMode[] = ['standard', 'animated', 'hidden', 'hideGeneric'];

export function withEachMode() {
  return allModes.map((brandIconMode) => (
    <HyperswitchVaultForm
      key={brandIconMode}
      session={session}
      environment="sandbox"
      appearance={{brandIconMode}}
    />
  ));
}

/* Default stays standard: the mode is optional at every level. */
export const noMode: VaultFormAppearance = {};
export const modeOnly: VaultFormAppearance = {brandIconMode: 'standard'};

// @ts-expect-error - "Standard" is not one of the four modes; the union is lower-camel
export const wrongCase: VaultFormBrandIconMode = 'Standard';

// @ts-expect-error - not a member of the union
export const unknownMode: VaultFormBrandIconMode = 'rotating';

// @ts-expect-error - the mode is a string union, not a boolean
export const boolMode: VaultFormAppearance = {brandIconMode: true};

/* ── Checkpoint 2: the custom-layout surface ─────────────────────────────── */

import {View} from 'react-native';
import {
  HyperswitchVaultFormProvider,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type WidgetHandle,
} from '../dist/types/public';

/*
 * The acceptance shape: children are React.ReactNode — multiple siblings, fragments and widgets
 * nested inside merchant-owned Views must all compile. The provider ref is the SAME
 * HyperswitchVaultFormHandle as the ready-made form; widget refs are WidgetHandle.
 */
export function CustomLayout() {
  const formRef = React.useRef<HyperswitchVaultFormHandle>(null);
  const numberRef = React.useRef<WidgetHandle>(null);

  return (
    <HyperswitchVaultFormProvider
      ref={formRef}
      session={session}
      environment="sandbox"
      appearance={{primaryColor: '#0570DE'}}
      localisation={{labels: {cvcPlaceholder: 'CVV'}}}
      onStateChange={(state: CardFormState) => void state.complete}>
      <CardNumberWidget ref={numberRef} />
      <>
        <View>
          <CardExpiryWidget />
          <CardCVCWidget />
        </View>
      </>
    </HyperswitchVaultFormProvider>
  );
}

/* The provider handle is the existing one: submit/reset/focus, nothing else. */
export async function customLayoutHandle(formRef: React.RefObject<HyperswitchVaultFormHandle>) {
  const result: VaultSubmitResult | undefined = await formRef.current?.submit();
  formRef.current?.reset();
  formRef.current?.focus('cvc');
  return result;
}

/* WidgetHandle exposes focus and blur ONLY. */
export function widgetHandleSurface(ref: React.RefObject<WidgetHandle>) {
  ref.current?.focus();
  ref.current?.blur();
}

export const noSplitOnProvider = (
  // @ts-expect-error - splitCardFields is rejected on the provider: layout belongs to the merchant
  <HyperswitchVaultFormProvider session={session} environment="sandbox" splitCardFields={true}>
    <CardNumberWidget />
  </HyperswitchVaultFormProvider>
);

export const childrenRequired = (
  // @ts-expect-error - children are required on the provider
  <HyperswitchVaultFormProvider session={session} environment="sandbox" />
);

// @ts-expect-error - widgets take no style prop in this phase
export const noWidgetStyle = <CardNumberWidget style={{flex: 1}} />;

// @ts-expect-error - widgets take no onStateChange in this phase (events are a later phase)
export const noWidgetEvents = <CardCVCWidget onStateChange={() => {}} />;

// @ts-expect-error - no raw-value accessor exists on the widget handle
export const noRawValueGetter = (ref: React.RefObject<WidgetHandle>) => ref.current?.getValue();

export const noRawValueOnForm = (ref: React.RefObject<HyperswitchVaultFormHandle>) =>
  // @ts-expect-error - no raw-value accessor exists on the form handle either
  ref.current?.getCardNumber();

// @ts-expect-error - there is no CardHolderWidget: the PMS-confirm contract needs number/expiry/CVC only
import {CardHolderWidget} from '../dist/types/public';
