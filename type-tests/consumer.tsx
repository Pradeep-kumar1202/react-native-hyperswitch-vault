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
import type {
  VaultBrandIconMode as VaultBrandIconModeAlias,
  VaultCardNumberOptions as VaultCardNumberOptionsAlias,
} from '../dist/types/public';

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

/* The mode is optional at every level; omitting it everywhere resolves to 'hidden'. */
export const noMode: VaultFormAppearance = {};
export const modeOnly: VaultFormAppearance = {brandIconMode: 'standard'};

/*
 * ONE control, published under two names for two audiences: `VaultFormBrandIconMode` names the
 * `appearance` token, `VaultBrandIconMode` names the field option. They must stay the SAME type —
 * if they ever drift, a merchant could not move a value from one to the other, and the precedence
 * chain would stop being expressible. These two assignments fail the moment they diverge.
 */
export const formNameTakesFieldValue: VaultFormBrandIconMode =
  'hideGeneric' satisfies VaultBrandIconModeAlias;
export const fieldNameTakesFormValue: VaultBrandIconModeAlias =
  'animated' satisfies VaultFormBrandIconMode;

/* The superseded display type is gone from the published surface. */
// @ts-expect-error - VaultBrandIconDisplay was removed when the two controls were merged
export type RemovedBrandIconDisplay = import('../dist/types/public').VaultBrandIconDisplay;
// @ts-expect-error - the boolean-ish field option it fed was removed with it
export const removedFieldOption: VaultCardNumberOptionsAlias = {brandIcon: 'auto'};

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

/* The legacy widget spelling receives the identical callback — it is the same object. */
export const widgetEvents = <CardCVCWidget onStateChange={(s) => s.status} />;

// @ts-expect-error - no raw-value accessor exists on the widget handle
export const noRawValueGetter = (ref: React.RefObject<WidgetHandle>) => ref.current?.getValue();

export const noRawValueOnForm = (ref: React.RefObject<HyperswitchVaultFormHandle>) =>
  // @ts-expect-error - no raw-value accessor exists on the form handle either
  ref.current?.getCardNumber();

// @ts-expect-error - there is no CardHolderWidget: the PMS-confirm contract needs number/expiry/CVC only
import {CardHolderWidget} from '../dist/types/public';

/* ══════════════════════════════════════════════════════════════════════════
 * Phase 1 — the merchant facade (ADR-0002 §1–§3)
 *
 * Canonical field names, handle type aliases and the convenience namespace.
 * Everything here is additive: nothing above this line changed.
 * ═══════════════════════════════════════════════════════════════════════════ */

import {
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  HyperswitchVault,
  type VaultFieldHandle,
  type VaultFormHandle,
} from '../dist/types/public';

/* ── 1. The canonical names compile in a custom layout ────────────────────── */

export function CanonicalNames() {
  const formRef = React.useRef<VaultFormHandle>(null);
  const numberRef = React.useRef<VaultFieldHandle>(null);

  return (
    <HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
      <CardNumberField ref={numberRef} />
      <View>
        <CardExpiryField />
        <CardCVCField />
      </View>
    </HyperswitchVaultFormProvider>
  );
}

/* ── 2. Namespace usage compiles, including the ready-made form ───────────── */

export function NamespaceReadyMade() {
  const formRef = React.useRef<VaultFormHandle>(null);
  return <HyperswitchVault.CardForm ref={formRef} session={session} environment="sandbox" />;
}

export function NamespaceCustomLayout() {
  const formRef = React.useRef<VaultFormHandle>(null);
  return (
    <HyperswitchVault.Form ref={formRef} session={session} environment="sandbox">
      <HyperswitchVault.CardNumber />
      <View>
        <HyperswitchVault.Expiry />
        <HyperswitchVault.CVC />
      </View>
    </HyperswitchVault.Form>
  );
}

/* ── 3. Aliases are the SAME TYPE, both directions ────────────────────────── */

/*
 * Mutual assignability is what proves these are aliases rather than two structurally-similar
 * declarations that could drift. A one-way assignment would pass even for a widened type.
 */
export const fieldHandleIsWidgetHandle: VaultFieldHandle = {} as WidgetHandle;
export const widgetHandleIsFieldHandle: WidgetHandle = {} as VaultFieldHandle;
export const formHandleAlias: VaultFormHandle = {} as HyperswitchVaultFormHandle;
export const formHandleAliasBack: HyperswitchVaultFormHandle = {} as VaultFormHandle;

/* The component types are interchangeable in both directions too. */
export const fieldIsWidget: typeof CardNumberWidget = CardNumberField;
export const widgetIsField: typeof CardNumberField = CardNumberWidget;
export const namespaceIsCanonical: typeof CardNumberField = HyperswitchVault.CardNumber;
export const namespaceFormIsCanonical: typeof HyperswitchVaultForm = HyperswitchVault.CardForm;
export const namespaceProviderIsCanonical: typeof HyperswitchVaultFormProvider =
  HyperswitchVault.Form;

/* A ref taken on the legacy name is accepted by the canonical one, and vice versa. */
export function refsInterchange(
  widgetRef: React.RefObject<WidgetHandle>,
  fieldRef: React.RefObject<VaultFieldHandle>
) {
  return (
    <>
      <CardNumberField ref={widgetRef} />
      <CardNumberWidget ref={fieldRef} />
    </>
  );
}

/* ── 4. Existing props and handles are unchanged ──────────────────────────── */

/* The canonical form name accepts every existing prop, unchanged. */
export function canonicalFormTakesEveryExistingProp() {
  return (
    <HyperswitchVault.CardForm
      session={session}
      environment="sandbox"
      appearance={{primaryColor: '#0570DE', brandIconMode: 'animated'}}
      localisation={fullyTranslated}
      disabled={false}
      layout="inline"
      fieldArrangement="fused"
      accessible
      onStateChange={(state: CardFormState) => void state.complete}
    />
  );
}

/* The handle is still exactly submit / reset / focus. */
export async function canonicalHandleSurface(handle: VaultFormHandle): Promise<string> {
  const result: VaultSubmitResult = await handle.submit();
  handle.reset();
  handle.focus('cvc');
  return result.status;
}

export function canonicalFieldHandleSurface(ref: React.RefObject<VaultFieldHandle>) {
  ref.current?.focus();
  ref.current?.blur();
}

/* ── 5. Out-of-scope surfaces must still be rejected ──────────────────────── */

// @ts-expect-error - the hook is a later phase; the namespace has no useForm
export const noNamespaceHook = HyperswitchVault.useForm;

// @ts-expect-error - useHyperswitchVaultForm is not exported yet
import {useHyperswitchVaultForm} from '../dist/types/public';

/* Merchant state events are published — see the dedicated block at the end of this file. */

/* All three fields accept `styles` — see the per-field style block at the end of this file. */
export const expiryTakesStyles = <CardExpiryField styles={{input: {color: 'red'}}} />;
export const cvcTakesStyles = <CardCVCField styles={{input: {color: 'red'}}} />;

// @ts-expect-error - a bare `style` prop is not part of the contract, on any field
export const noFieldStyleProp = <CardExpiryField style={{flex: 1}} />;

// @ts-expect-error - a bare `style` prop is not the slot API, on any field
export const noBareStyleOnNumber = <CardNumberField style={{flex: 1}} />;

// @ts-expect-error - render slots are a later phase
export const noRenderSlot = <CardNumberField renderBrandIcon={() => null} />;

/* `testID` is now a published field option, alongside the accessibility props. */
export const cvcTestID = <CardCVCField testID="cvc" />;

// @ts-expect-error - the namespace is closed; there is no cardholder field
export const noNamespaceCardHolder = HyperswitchVault.CardHolder;

// @ts-expect-error - the namespace carries no transport
export const noNamespaceVault = HyperswitchVault.confirmPaymentMethodSession;

/* No raw-value accessor may exist under the new names either. */
// @ts-expect-error - no raw-value accessor on the canonical field handle
export const noRawValueOnFieldHandle = (ref: React.RefObject<VaultFieldHandle>) => ref.current?.getValue();

export const noRawValueOnCanonicalForm = (ref: React.RefObject<VaultFormHandle>) =>
  // @ts-expect-error - no raw-value accessor on the canonical form handle
  ref.current?.getCardNumber();

/* ── 6. The namespace is a namespace, not a component ─────────────────────── */

// @ts-expect-error - HyperswitchVault is a plain object; it cannot be rendered
export const namespaceIsNotRenderable = <HyperswitchVault session={session} environment="sandbox" />;

/* ══════════════════════════════════════════════════════════════════════════
 * The merchant styling boundary (ADR-0002 §9 layer 2)
 *
 * These assertions are the TYPE half of the proof. The runtime half — that the
 * style actually reaches the rendered element — is in
 * example/__tests__/fieldStyles.test.tsx, because a type check alone cannot
 * distinguish a working bridge from a cast.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type {StyleProp, ViewStyle, TextStyle} from 'react-native';
import {StyleSheet} from 'react-native';
import type {VaultFieldStyles} from '../dist/types/public';

/* ── 1. The slots ARE React Native's own StyleProp types ──────────────────── */

/*
 * Mutual assignability against RN's types is the assertion that a cast cannot fake: if genType had
 * emitted an opaque handle, `any` or `unknown`, at least one direction here would fail (an opaque
 * class rejects a plain object; `any`/`unknown` would make the negative controls below stop
 * erroring, which tsc reports as an unused @ts-expect-error).
 */
/* Each slot is an OPTIONAL property, so its type is `StyleProp<X> | undefined` exactly. */
type OptionalViewStyle = StyleProp<ViewStyle> | undefined;
type OptionalTextStyle = StyleProp<TextStyle> | undefined;

export const rootIsViewStyleProp: OptionalViewStyle = {} as VaultFieldStyles['root'];
export const viewStylePropIsRoot: VaultFieldStyles['root'] = {} as OptionalViewStyle;
export const containerIsViewStyleProp: OptionalViewStyle = {} as VaultFieldStyles['container'];
export const viewStylePropIsContainer: VaultFieldStyles['container'] = {} as OptionalViewStyle;
export const accessoryIsViewStyleProp: OptionalViewStyle = {} as VaultFieldStyles['accessory'];
export const viewStylePropIsAccessory: VaultFieldStyles['accessory'] = {} as OptionalViewStyle;

export const inputIsTextStyleProp: OptionalTextStyle = {} as VaultFieldStyles['input'];
export const textStylePropIsInput: VaultFieldStyles['input'] = {} as OptionalTextStyle;
export const placeholderIsTextStyleProp: OptionalTextStyle = {} as VaultFieldStyles['placeholder'];
export const textStylePropIsPlaceholder: VaultFieldStyles['placeholder'] = {} as OptionalTextStyle;
export const labelIsTextStyleProp: OptionalTextStyle = {} as VaultFieldStyles['label'];
export const textStylePropIsLabel: VaultFieldStyles['label'] = {} as OptionalTextStyle;
export const errorIsTextStyleProp: OptionalTextStyle = {} as VaultFieldStyles['error'];
export const textStylePropIsError: VaultFieldStyles['error'] = {} as OptionalTextStyle;

/*
 * The two slot families are NOT the same type. React Native's `TextStyle` extends `ViewStyle`, so a
 * ViewStyle value is legitimately assignable to a TextStyle slot — that is RN's own hierarchy, not a
 * bridge defect. The asymmetry that matters is the other direction, asserted by `rejectsTextInView`
 * below: a text-only property must be rejected in a ViewStyle slot.
 */

/* Every slot is optional, and an empty object is a valid value. */
export const emptySlots: VaultFieldStyles = {};

/* ── 2. Everything StyleProp accepts, the slot accepts ────────────────────── */

const sheet = StyleSheet.create({
  box: {backgroundColor: '#101828', borderWidth: 3},
  text: {fontSize: 22, color: '#F97316'},
});

export const acceptsPlainObject: VaultFieldStyles = {container: {borderWidth: 4}};
export const acceptsRegisteredStyle: VaultFieldStyles = {container: sheet.box, input: sheet.text};
export const acceptsArray: VaultFieldStyles = {container: [sheet.box, {borderRadius: 20}]};
export const acceptsNestedArray: VaultFieldStyles = {container: [[sheet.box], {margin: 2}]};
export const acceptsFalsy: VaultFieldStyles = {container: null, input: undefined, label: false};

/* ── 2a. Animated-label typography is accepted, and handled at RUNTIME ────── */

/*
 * `placeholder` and `label` style the same Animated.Text, whose only animated key is `fontSize`.
 * A static value there would shadow the interpolation, collapse AnimatedStyle and leak an
 * unresolved AnimatedNode to the host element.
 *
 * That is NOT prevented here, deliberately. It was measured (docs/phase-2a-style-bridge-spike.md):
 * `StyleProp<Omit<TextStyle, 'fontSize'>>` rejects only an inline object literal — a TextStyle
 * variable, a registered style, an array and a type assertion all still compile, and JavaScript
 * consumers have no types at all. A type that DOES block them (`fontSize?: never`) also rejects a
 * legitimate `TextStyle` variable that has no fontSize, which is a worse merchant experience than
 * the problem it solves.
 *
 * So the slots keep React Native's full `StyleProp<TextStyle>` — asserted mutually in section 1 —
 * and the library removes `fontSize` at runtime, using it as the animation ENDPOINT for that state.
 * These are the routes that must keep compiling; the runtime proof is in
 * example/__tests__/fieldStyles.test.tsx.
 */
const sharedLabelStyle: TextStyle = {color: '#334155', fontSize: 18};
const registeredLabelStyle = StyleSheet.create({lbl: {color: '#334155', fontSize: 18}}).lbl;

export const acceptsInlineFontSize: VaultFieldStyles = {placeholder: {fontSize: 18}};
export const acceptsWiderTextStyleVariable: VaultFieldStyles = {placeholder: sharedLabelStyle};
export const acceptsRegisteredWithFontSize: VaultFieldStyles = {label: registeredLabelStyle};
export const acceptsArrayWithFontSize: VaultFieldStyles = {
  label: [registeredLabelStyle, {fontSize: 11}],
};
export const acceptsNestedArrayWithFontSize: VaultFieldStyles = {
  placeholder: [[sharedLabelStyle], [null, {letterSpacing: 2}], undefined, false],
};

/* A TextStyle variable WITHOUT fontSize must also compile — the false positive a stricter type had. */
const cleanLabelStyle: TextStyle = {color: '#334155', letterSpacing: 2};
export const acceptsCleanTextStyleVariable: VaultFieldStyles = {label: cleanLabelStyle};

/* ── 3. Wrong values must NOT compile ─────────────────────────────────────── */

/* A ViewStyle slot must reject a text-only property. */
// @ts-expect-error - fontSize is not a ViewStyle property
export const rejectsTextInView: VaultFieldStyles = {container: {fontSize: 12}};

// @ts-expect-error - `colour` is not a style property at all
export const rejectsUnknownProperty: VaultFieldStyles = {input: {colour: 'red'}};

// @ts-expect-error - borderWidth is a number, not a string
export const rejectsWrongValueType: VaultFieldStyles = {container: {borderWidth: 'thick'}};

// @ts-expect-error - there is no such slot; the slot set is closed
export const rejectsUnknownSlot: VaultFieldStyles = {footer: {margin: 1}};

/* helperText is deliberately absent: no helper-text element is rendered anywhere yet. */
// @ts-expect-error - helperText has no rendered target, so it is not published
export const rejectsHelperText: VaultFieldStyles = {helperText: {fontSize: 10}};

/* State-based callbacks are layer 3, not this phase. */
// @ts-expect-error - state-based style callbacks are a later phase
export const rejectsStyleCallback: VaultFieldStyles = {container: () => ({borderWidth: 1})};

/* ── 4. The styles prop does not open a route to card data ────────────────── */

export const stylesOnNumber = (
  <CardNumberField styles={{container: {borderWidth: 2}, input: {fontSize: 18}}} />
);

// @ts-expect-error - the field still takes no value prop
export const stillNoValue = <CardNumberField value="4242" />;
// @ts-expect-error - the field still takes no onChangeText
export const stillNoOnChangeText = <CardNumberField onChangeText={() => {}} />;
// @ts-expect-error - the field still takes no onChange
export const stillNoOnChange = <CardNumberField onChange={() => {}} />;
// @ts-expect-error - the field still takes no defaultValue
export const stillNoDefaultValue = <CardNumberField defaultValue="4242" />;
// @ts-expect-error - secureTextEntry stays library-owned
export const stillNoSecureTextEntry = <CardNumberField secureTextEntry />;
// @ts-expect-error - maxLength stays library-owned
export const stillNoMaxLength = <CardNumberField maxLength={19} />;
// @ts-expect-error - keyboardType stays library-owned
export const stillNoKeyboardType = <CardNumberField keyboardType="numeric" />;
// @ts-expect-error - autoCorrect stays library-owned
export const stillNoAutoCorrect = <CardNumberField autoCorrect />;
// @ts-expect-error - textContentType stays library-owned
export const stillNoTextContentType = <CardNumberField textContentType="creditCardNumber" />;
// @ts-expect-error - autoComplete stays library-owned
export const stillNoAutoComplete = <CardNumberField autoComplete="cc-number" />;

/* ── 5. The ref contract is untouched by the styles prop ──────────────────── */

export function styledFieldStillTakesARef(ref: React.RefObject<VaultFieldHandle>) {
  return <CardNumberField ref={ref} styles={{root: {padding: 4}}} />;
}

export function styledFieldHandleIsStillFocusBlur(ref: React.RefObject<VaultFieldHandle>) {
  ref.current?.focus();
  ref.current?.blur();
  // @ts-expect-error - still no raw-value accessor
  ref.current?.getValue();
}

/* The legacy name carries the identical type — they are the same object. */
export const stylesOnLegacyName = <CardNumberWidget styles={{input: {fontSize: 18}}} />;
export const stylesViaNamespace = <HyperswitchVault.CardNumber styles={{input: {fontSize: 18}}} />;


/* ══ Per-field style types and the ready-made form's grouped prop ═══════════════════════════════
 *
 * The expiry field renders NO accessory element: `CardFields.Expiry` never passes `iconRight`, so
 * `CardInput` matches `NoIcon` and returns nothing. Publishing an `accessory` slot there would be a
 * silent no-op, so the expiry type simply does not have it. These assertions are what keep the
 * difference real rather than a comment.
 */

import type {
  VaultCardNumberStyles,
  VaultExpiryStyles,
  VaultCVCStyles,
  VaultFormFieldStyles,
} from '../dist/types/public';

/* Card number and CVC carry the full slot set. */
export const numberHasAccessory: VaultCardNumberStyles = {accessory: {width: 40}};
export const cvcHasAccessory: VaultCVCStyles = {accessory: {width: 40}};

/* Expiry does not. */
// @ts-expect-error - the expiry field renders no accessory element
export const expiryHasNoAccessory: VaultExpiryStyles = {accessory: {width: 40}};

// @ts-expect-error - and the field component rejects it too, not just the bare type
export const expiryFieldRejectsAccessory = <CardExpiryField styles={{accessory: {width: 40}}} />;

/* Every other slot IS available on expiry. */
export const expiryHasEverythingElse: VaultExpiryStyles = {
  root: {padding: 2},
  container: {borderWidth: 1},
  input: {fontSize: 14},
  placeholder: {color: '#888888'},
  label: {color: '#111111'},
  error: {color: '#B91C1C'},
};

/* The grouped form prop routes each field to its own type. */
export const formFieldStyles: VaultFormFieldStyles = {
  cardNumber: {container: {borderColor: '#2563EB'}, input: {fontSize: 18}, accessory: {width: 44}},
  expiry: {container: {flex: 1}},
  cvc: {container: {flex: 1}, accessory: {width: 32}},
};

export const styledCardForm = (
  <HyperswitchVault.CardForm session={session} environment="sandbox" fieldStyles={formFieldStyles} />
);

// @ts-expect-error - the expiry group inherits the narrower type
export const formRejectsExpiryAccessory: VaultFormFieldStyles = {expiry: {accessory: {width: 1}}};

// @ts-expect-error - the field group set is closed
export const formRejectsUnknownField: VaultFormFieldStyles = {cardHolder: {root: {margin: 1}}};

/* eslint-disable-next-line -- one line so the directive lands on the erroring expression */
// @ts-expect-error - flat per-slot props (cardNumberContainerStyle, expiryInputStyle, ...) are deliberately not offered
export const noFlatStyleProps = <HyperswitchVault.CardForm session={session} environment="sandbox" cardNumberContainerStyle={{margin: 1}} />;

/* The provider API keeps working unchanged alongside the ready-made form. */
export const styledViaProvider = (
  <HyperswitchVaultFormProvider session={session} environment="sandbox">
    <CardNumberField styles={{container: {borderWidth: 2}}} />
    <CardExpiryField styles={{container: {borderWidth: 2}}} />
    <CardCVCField styles={{container: {borderWidth: 2}, accessory: {width: 30}}} />
  </HyperswitchVaultFormProvider>
);

/* The legacy alias names have the identical capability — they are the same component objects. */
export const legacyAliasesTakeStyles = (
  <HyperswitchVaultFormProvider session={session} environment="sandbox">
    <CardNumberWidget styles={{container: {borderWidth: 2}}} />
    <CardExpiryWidget styles={{container: {borderWidth: 2}}} />
    <CardCVCWidget styles={{accessory: {width: 30}}} />
  </HyperswitchVaultFormProvider>
);

/* ══ Merchant state events (ADR-0002 §4, §4a, §5) ═══════════════════════════════════════════════
 *
 * The TYPE half. The runtime half — that the emitted object really has this shape and really
 * contains no card value — is example/__tests__/fieldEvents.test.tsx.
 */

import type {
  CardBrand,
  VaultField,
  VaultFieldStatus,
  VaultFieldErrorCode,
  VaultFieldError,
  VaultFieldState,
  VaultCardNumberState,
  VaultExpiryState,
  VaultCVCState,
  VaultSessionStatus,
  VaultFormState,
} from '../dist/types/public';

/* ── 1. Each field callback receives its own narrowed state ────────────────── */

export const numberEvents = (
  <CardNumberField
    onStateChange={(state) => {
      const field: 'cardNumber' = state.field;
      const status: VaultFieldStatus = state.status;
      const focused: boolean = state.focused;
      const brand: CardBrand = state.brand; // REQUIRED on the card number
      const error: VaultFieldError | undefined = state.error;
      return [field, status, focused, brand, error];
    }}
  />
);

export const expiryEvents = (
  <CardExpiryField
    onStateChange={(state) => {
      const field: 'expiry' = state.field;
      return [field, state.status, state.focused, state.error];
    }}
  />
);

export const cvcEvents = (
  <CardCVCField
    onStateChange={(state) => {
      const field: 'cvc' = state.field;
      return [field, state.status, state.focused, state.error];
    }}
  />
);

/* ── 2. Card-number-only members are absent from the other two ─────────────── */

// @ts-expect-error - only the card number carries a brand
export const noExpiryBrand = <CardExpiryField onStateChange={(s) => s.brand} />;

// @ts-expect-error - only the card number carries a brand
export const noCvcBrand = <CardCVCField onStateChange={(s) => s.brand} />;

// @ts-expect-error - the expiry state is not the card-number state
export const expiryFieldIsNotCardNumber: VaultExpiryState = {} as VaultCardNumberState;

/* The narrowed records ARE assignable to the published union. */
export const numberIsFieldState: VaultFieldState = {} as VaultCardNumberState;
export const expiryIsFieldState: VaultFieldState = {} as VaultExpiryState;
export const cvcIsFieldState: VaultFieldState = {} as VaultCVCState;

/* And the union discriminates on `field`. */
export const discriminates = (state: VaultFieldState): CardBrand =>
  state.field === 'cardNumber' ? state.brand : 'unknown';

/* ── 3. Literal unions, never broad strings ───────────────────────────────── */

// @ts-expect-error - status is a closed union, not string
export const statusIsNotString: VaultFieldStatus = 'nearly';
// @ts-expect-error - the field name is a closed union
export const fieldIsNotString: VaultField = 'cardHolder';
// @ts-expect-error - error codes are a closed union
export const codeIsNotString: VaultFieldErrorCode = 'expired_card';
// @ts-expect-error - the brand union is lower-camel and closed
export const brandIsNotString: CardBrand = 'Visa';
// @ts-expect-error - session status is a two-member union
export const sessionIsNotString: VaultSessionStatus = 'expired';

/* A string variable must not be assignable to any of them. */
declare const someString: string;
// @ts-expect-error - broad string is not a VaultFieldStatus
export const noWideningStatus: VaultFieldStatus = someString;
// @ts-expect-error - broad string is not a CardBrand
export const noWideningBrand: CardBrand = someString;

/* All fourteen brands, spelled as the contract states. */
export const everyBrand: CardBrand[] = [
  'visa', 'mastercard', 'americanExpress', 'dinersClub', 'discover', 'jcb',
  'cartesBancaires', 'interac', 'maestro', 'unionPay', 'rupay', 'sodexo', 'bajaj', 'unknown',
];

/* ── 4. The aggregate callback, on both integration styles ─────────────────── */

const readFormState = (state: VaultFormState) => {
  const fieldsReady: boolean = state.fieldsReady;
  const sessionStatus: VaultSessionStatus = state.sessionStatus;
  const complete: boolean = state.complete;
  const submitting: boolean = state.submitting;
  const canSubmit: boolean = state.canSubmit;
  const brand: CardBrand = state.brand;
  const number: VaultCardNumberState = state.fields.cardNumber;
  const expiry: VaultExpiryState = state.fields.expiry;
  const cvc: VaultCVCState = state.fields.cvc;
  return [fieldsReady, sessionStatus, complete, submitting, canSubmit, brand, number, expiry, cvc];
};

export const readyMadeFormEvents = (
  <HyperswitchVault.CardForm session={session} environment="sandbox" onFormStateChange={readFormState} />
);

export const providerFormEvents = (
  <HyperswitchVaultFormProvider session={session} environment="sandbox" onFormStateChange={readFormState}>
    <CardNumberField />
    <CardExpiryField />
    <CardCVCField />
  </HyperswitchVaultFormProvider>
);

/* The pre-existing `onStateChange` on the form components keeps its own payload — not a rename. */
export const legacyFormStateStillWorks = (
  <HyperswitchVault.CardForm
    session={session}
    environment="sandbox"
    onStateChange={(s: CardFormState) => s.complete}
    onFormStateChange={readFormState}
  />
);

/* ── 5. Forbidden properties are compile errors, at every depth ────────────── */

// @ts-expect-error - no raw value
export const noValue = <CardNumberField onStateChange={(s) => (s as VaultCardNumberState).value} />;
// @ts-expect-error - no formatted value
export const noFormatted = <CardNumberField onStateChange={(s) => s.formattedValue} />;
// @ts-expect-error - no length
export const noLength = <CardNumberField onStateChange={(s) => s.length} />;
// @ts-expect-error - no BIN
export const noBin = <CardNumberField onStateChange={(s) => s.bin} />;
// @ts-expect-error - no last four
export const noLast4 = <CardNumberField onStateChange={(s) => s.last4} />;
// @ts-expect-error - no expiry month
export const noExpiryMonth = <CardExpiryField onStateChange={(s) => s.expiryMonth} />;
// @ts-expect-error - no CVC value
export const noCvcValue = <CardCVCField onStateChange={(s) => s.cvc} />;
// @ts-expect-error - no native event
export const noNativeEvent = <CardNumberField onStateChange={(s) => s.nativeEvent} />;
// @ts-expect-error - no target
export const noTarget = <CardNumberField onStateChange={(s) => s.target} />;
// @ts-expect-error - no token before submit resolves
export const noToken = <HyperswitchVault.CardForm session={session} environment="sandbox" onFormStateChange={(s) => s.token} />;
// @ts-expect-error - no authorization
export const noAuth = <HyperswitchVault.CardForm session={session} environment="sandbox" onFormStateChange={(s) => s.authorization} />;
// @ts-expect-error - no session id
export const noSessionId = <HyperswitchVault.CardForm session={session} environment="sandbox" onFormStateChange={(s) => s.sessionId} />;
// @ts-expect-error - the aggregate carries no raw values either
export const noAggregateValue = <HyperswitchVault.CardForm session={session} environment="sandbox" onFormStateChange={(s) => s.fields.cardNumber.value} />;

/* ── 6. Aliases and namespace carry the identical callback types ───────────── */

export const eventsOnLegacyName = <CardNumberWidget onStateChange={(s) => s.brand} />;
export const eventsViaNamespace = <HyperswitchVault.CardNumber onStateChange={(s) => s.brand} />;
export const eventsViaNamespaceExpiry = <HyperswitchVault.Expiry onStateChange={(s) => s.field} />;
export const eventsViaNamespaceCvc = <HyperswitchVault.CVC onStateChange={(s) => s.field} />;

/* Styling and events compose; neither disturbs the other. */
export const stylesAndEvents = (
  <CardNumberField
    styles={{container: {borderWidth: 2}, placeholder: {fontSize: 18}}}
    onStateChange={(s) => s.status}
  />
);


/* ══ Field options: which visual elements exist ═════════════════════════════════════════════ */

import type {
  VaultLabelBehavior, VaultErrorDisplay, VaultBrandIconMode, VaultCVCIconDisplay,
  VaultFieldOptions, VaultCardNumberOptions, VaultExpiryOptions, VaultCVCOptions,
  VaultFormFieldOptions, VaultFormLayout, VaultFieldArrangement,
} from '../dist/types/public';

/* Closed literal unions, never broad strings. */
export const lb: VaultLabelBehavior[] = ['none', 'static', 'floating'];
export const ed: VaultErrorDisplay[] = ['none', 'inline'];
export const bi: VaultBrandIconMode[] = ['hidden', 'standard', 'animated', 'hideGeneric'];
export const ci: VaultCVCIconDisplay[] = ['none', 'default'];
export const fl: VaultFormLayout[] = ['stacked', 'inline'];
export const fa: VaultFieldArrangement[] = ['separate', 'fused'];

declare const someText: string;
// @ts-expect-error - labelBehavior is a closed union, not string
export const lbNotString: VaultLabelBehavior = someText;
// @ts-expect-error - 'inline' is not a label behaviour
export const lbWrongMember: VaultLabelBehavior = 'inline';
// @ts-expect-error - errorDisplay is a closed union
export const edWrongMember: VaultErrorDisplay = 'hidden';
// @ts-expect-error - layout is a closed union
export const flWrongMember: VaultFormLayout = 'grid';

/* Flattened options on the independent fields. */
export const numberOptioned = (
  <CardNumberField
    placeholder="Card number"
    label="Card number"
    labelBehavior="floating"
    errorDisplay="inline"
    brandIconMode="standard"
    accessibilityLabel="Card number"
    accessibilityHint="16 digits"
    testID="card-number"
  />
);
export const expiryOptioned = (
  <CardExpiryField placeholder="MM/YY" label="Expiration date" labelBehavior="static" errorDisplay="none" />
);
export const cvcOptioned = (
  <CardCVCField placeholder="CVC" label="Security code" labelBehavior="none" errorDisplay="inline" cvcIcon="default" />
);

/* Each icon option belongs to exactly one field. */
// @ts-expect-error - the expiry field has no brandIconMode
export const noExpiryBrandIcon = <CardExpiryField brandIconMode="standard" />;
// @ts-expect-error - the expiry field has no cvcIcon
export const noExpiryCvcIcon = <CardExpiryField cvcIcon="default" />;
// @ts-expect-error - the card number has no cvcIcon
export const noNumberCvcIcon = <CardNumberField cvcIcon="default" />;
// @ts-expect-error - the CVC field has no brandIconMode
export const noCvcBrandIcon = <CardCVCField brandIconMode="standard" />;
// @ts-expect-error - the expiry option type has no accessory-style member
export const noExpiryAccessoryOption: VaultExpiryOptions = {accessory: 'auto'};
// @ts-expect-error - the base option type has no brandIconMode
export const baseHasNoBrandIcon: VaultFieldOptions = {brandIconMode: 'standard'};

/* The grouped form prop, and no flat props. */
export const grouped: VaultFormFieldOptions = {
  cardNumber: {placeholder: 'Card number', brandIconMode: 'standard', errorDisplay: 'inline'},
  expiry: {placeholder: 'MM/YY'},
  cvc: {placeholder: 'CVC', cvcIcon: 'default'},
};
export const optionedForm = (
  <HyperswitchVault.CardForm session={session} environment="sandbox" layout="stacked" fieldArrangement="separate" fieldOptions={grouped} />
);
// @ts-expect-error - the expiry group inherits the narrower option type
export const groupedRejectsExpiryBrandIcon: VaultFormFieldOptions = {expiry: {brandIconMode: 'standard'}};
/* eslint-disable-next-line -- one line so the directive lands on the erroring expression */
// @ts-expect-error - flat per-field props are deliberately not offered
export const noFlatPlaceholderProp = <HyperswitchVault.CardForm session={session} environment="sandbox" cardNumberPlaceholder="Card number" />;
/* eslint-disable-next-line -- one line so the directive lands on the erroring expression */
// @ts-expect-error - splitCardFields was replaced by layout + fieldArrangement
export const noSplitCardFields = <HyperswitchVault.CardForm session={session} environment="sandbox" splitCardFields />;

/* Aliases and the namespace carry the identical option props. */
export const optionsOnLegacyName = <CardNumberWidget placeholder="Card number" brandIconMode="standard" />;
export const optionsViaNamespace = <HyperswitchVault.CardNumber labelBehavior="floating" label="Card" />;
export const optionsViaNamespaceCvc = <HyperswitchVault.CVC cvcIcon="default" />;

/* Options and styles compose; neither disturbs the other. */
export const optionsAndStyles = (
  <CardNumberField placeholder="Card number" brandIconMode="standard" styles={{container: {borderWidth: 2}, accessory: {width: 40}}} />
);

/* The consolidated brand-icon control: one union, no second on/off type. */
// @ts-expect-error - `brandIcon` was removed; the one control is `brandIconMode`
export const noBrandIconProp = <CardNumberField brandIcon="auto" />;
// @ts-expect-error - and it is gone from the option record too
export const noBrandIconMember: VaultCardNumberOptions = {brandIcon: 'auto'};
// @ts-expect-error - 'auto' was never a brandIconMode member
export const noAutoMember: VaultBrandIconMode = 'auto';
// @ts-expect-error - and 'none' is spelled 'hidden'
export const noNoneMember: VaultBrandIconMode = 'none';

/* The appearance-level spelling and the field-level one are the same union. */
export const sameUnionA: VaultBrandIconMode = {} as VaultFormBrandIconMode;
export const sameUnionB: VaultFormBrandIconMode = {} as VaultBrandIconMode;
