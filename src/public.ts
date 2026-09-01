
/*
 * Type-only surface for the package root.
 *
 * tsc runs with `emitDeclarationOnly`, so nothing here executes: the runtime values come from
 * `src/standalone-entry.mjs`, which Rollup bundles into dist/{esm,cjs}/index.js. This file exists
 * to re-attach the ref types genType drops (it emits a forwardRef component as
 * `React.ComponentType<Props>`) and to name the public types.
 *
 * The two files must stay in lockstep — `scripts/verify-public-surface.mjs` fails the build if the
 * value exports here and there differ.
 */

import './jsx-global';
import type * as React from 'react';
import { make as RawHyperswitchVaultForm, type Props } from './HyperswitchVaultForm.gen';
import {
  make as RawHyperswitchVaultFormProvider,
  type Props as ProviderProps,
  type widgetHandle,
} from './HyperswitchVaultFormProvider.gen';
import { make as RawCardNumberWidget } from './CardNumberWidget.gen';
import type {
  fieldStyles,
  expiryStyles,
  formFieldStyles,
} from './CardFieldStyles.gen';
import type {
  labelBehavior,
  errorDisplay,
  brandIconMode as fieldBrandIconMode,
  cvcIconDisplay,
  fieldOptions,
  cardNumberOptions,
  expiryOptions,
  cvcOptions,
  cardholderNameOptions,
  formFieldOptions,
  formLayout,
  fieldArrangement,
} from './CardFieldOptions.gen';
import { make as RawCardExpiryWidget } from './CardExpiryWidget.gen';
import { make as RawCardCVCWidget } from './CardCVCWidget.gen';
import { make as RawCardholderNameWidget } from './CardholderNameWidget.gen';
import type { paymentConfirmInput as VaultPaymentConfirmInputInternal } from './VaultFormCoordinator.gen';
import type { safeVaultError as SafeVaultErrorInternal } from './VaultResult.gen';
import type { safeNextAction as SafeNextActionInternal } from './VaultNavigation.gen';
import type { confirmTokenMode as VaultConfirmTokenModeInternal } from './VaultConfirmBody.gen';
import type { MerchantSession as MerchantSessionInternal } from './merchantTypes';
import type {
  cardNumberState,
  expiryState,
  cvcState,
  cardholderNameState,
} from './VaultPublicState.gen';

/* ── Component types ──────────────────────────────────────────────────────── */

/*
* The handle is re-declared rather than re-exported so the two operations resolve to the narrowed
 * unions below instead of the wider generated records. The runtime object is unchanged — this only
 * sharpens what the compiler knows about it.
 */
export type VaultField = 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName';

/*
 * ── TWO OPERATIONS, NOT ONE ──────────────────────────────────────────────────
 *
 * Which function you call decides what can come back. `tokenize()` is the only route to a token;
 * `confirmPayment()` is the only route that charges anything, and its result has no `token` member
 * at all. A single `submit()` returning one union could not express that: the caller would have had
 * to reason about which arguments they passed to know whether a payment credential was in hand.
 */
export type VaultFormHandleShape = {
  /** Flow 1 — mint a payment-method token and stop. Takes no input; charges nothing. */
  tokenize(): Promise<VaultTokenizeResult>;
  /**
   * Flows 2 and 3 — confirm the payment. `cardSource` chooses which: `'vault'` tokenizes first and
   * keeps the token internal, `'direct'` confirms with the library's own card values and mints
   * nothing. Neither returns a token.
   */
  confirmPayment(input: VaultPaymentConfirmInput): Promise<VaultPaymentResult>;
  reset(): void;
  focus(field: VaultField): void;
};

/*
 * ── WHICH CARD CREDENTIAL THE CONFIRM USES ───────────────────────────────────
 *
 * A closed union, so the two flows cannot be blurred: there is no way to ask for the vault flow
 * without a session, and no way to attach vault settings to a direct confirm. Both would otherwise
 * be silent — the first would fall back to something, the second would be ignored — and both change
 * the customer's PCI posture, which is not a thing to get wrong quietly.
 *
 * The runtime value is the generated `paymentCardSource` record (see the note in
 * `VaultCardSource.res` for why it is a record and not a ReScript `@tag` variant);
 * `scripts/verify-card-source.mjs` asserts that this declaration and that record describe the same
 * runtime shapes.
 */
export type VaultPaymentCardSource =
  | {
      readonly type_: 'vault';
      readonly session: MerchantSessionInternal;
      readonly confirmTokenMode?: VaultConfirmTokenModeInternal;
    }
  | { readonly type_: 'direct' };

/**
 * The confirm input, with `cardSource` narrowed to the union above. Every other member is the
 * generated one, so this cannot drift from what the library actually reads.
 */
export type VaultPaymentConfirmInput = Omit<VaultPaymentConfirmInputInternal, 'cardSource'> & {
  readonly cardSource: VaultPaymentCardSource;
};

/*
 * ── WHO OWNS THE CARDHOLDER NAME ─────────────────────────────────────────────
 *
 *   'collect'    the library renders its own bare input and uses what was typed. The default.
 *   'external'   the library renders NO name field; the value arrives as `cardholderName` on the
 *                confirm input. For a host that already owns the field, with its own validation,
 *                localisation and error timing.
 *   'omit'       the library renders no name field and sends no name.
 *
 * The last two look identical on screen and differ entirely in what is sent, which is why they are
 * distinct: "I will supply it" and "there is none" must not be spelled the same way.
 *
 * Supplying `cardholderName` in any mode but 'external' is a configuration error, answered with
 * `unsupported_configuration` before any request. It is never resolved by precedence, because a
 * host with two names has no way to know which one was sent.
 *
 * Omitting it in 'external' is NOT an error: it means the host's own field was optional and the
 * customer left it blank, and `card_holder_name` is simply not sent. A host whose field is required
 * blocks its own submission long before this point.
 */
export type VaultCardholderNameMode = 'collect' | 'external' | 'omit';

/*
 * The ONLY published type with a `token`. Deliberately permitted here, and nowhere else.
 */
export type VaultTokenizeResult =
  | { readonly status: 'success'; readonly token: string }
  | { readonly status: 'validation_error'; readonly error: SafeVaultErrorInternal }
  | { readonly status: 'not_ready'; readonly error: SafeVaultErrorInternal }
  | { readonly status: 'error'; readonly error: SafeVaultErrorInternal };

/*
 * ── The result, as a discriminated union ─────────────────────────────────────
 *
 * The runtime value is the generated `vaultPaymentResult` record — `{status, error?, nextAction?}`.
 * That record is what the library actually produces (see the note in `VaultResult.res` for why it
 * is a record and not a ReScript `@tag` variant), but publishing it verbatim would leave `error`
 * optional on every branch, so a merchant reading `result.error.message` after a `failed` status
 * would get no help from the compiler.
 *
 * This declaration describes the SAME runtime objects with the narrowing a merchant wants:
 * checking `status` proves what else is there. It is hand-written, so it could in principle drift
 * from what the library emits — `scripts/verify-result-mapping.mjs` asserts the exact member set
 * produced for every status and fails if it ever does.
 */
export type VaultPaymentResult =
  | { readonly status: 'succeeded' }
  | { readonly status: 'processing' }
  | { readonly status: 'requires_customer_action'; readonly nextAction: SafeNextActionInternal }
  | { readonly status: 'failed'; readonly error: SafeVaultErrorInternal }
  | { readonly status: 'validation_error'; readonly error: SafeVaultErrorInternal }
  | { readonly status: 'not_ready'; readonly error: SafeVaultErrorInternal };

type VaultFormComponent<P> = React.ForwardRefExoticComponent<
  P & React.RefAttributes<VaultFormHandleShape>
>;

/*
 * ── Per-field style slots (ADR-0002 §9 layer 2) ──────────────────────────────
 *
 * `fieldStyles` / `expiryStyles` / `formFieldStyles` are the GENERATED types from
 * CardFieldStyles.res, imported — not re-declared and not re-cast here. That is what makes this a
 * proof rather than an assertion: if genType ever emitted an opaque handle or `any`, the type-tests
 * in type-tests/consumer.tsx would stop rejecting a plainly-wrong style value, and
 * `check:generated` would show the drift.
 *
 * The bridge does contain localized zero-runtime coercions, inside `CardFieldStyles.Unsafe`. They
 * are the only ones in the library and `scripts/verify-style-bridge.mjs` gates that; see
 * docs/phase-2a-style-bridge-spike.md for the full argument and the measurements behind it.
 *
 * The expiry field takes a SMALLER slot set. It renders no accessory element — `CardFields.Expiry`
 * never passes `iconRight`, so `CardInput` matches `NoIcon` and returns nothing — and a slot with no
 * rendered target would be a silent no-op.
 *
 * Note `children` is absent from every field type: the generated Props carries it, but it has never
 * been part of the published field surface.
 */
/*
 * ── Field options: which visual elements exist ────────────────────────────────
 *
 * Separate from `styles`, which says how the enabled elements look. With no options a field renders
 * an empty, neutral input: no placeholder, no label, no animation, no icon, no error text and no
 * space reserved for any of them.
 *
 * The option props are FLATTENED onto the component rather than nested, because a merchant placing
 * one field writes `<CardNumberField placeholder="Card number" />`. The grouped `fieldOptions`
 * record exists on the ready-made form, where three fields are addressed at once.
 *
 * Each field's option set is its own type: only the card number has `brandIconMode`, only the CVC has
 * `cvcIcon`, and the expiry has neither — the same rule that already keeps `accessory` off the
 * expiry style type.
 */
/*
 * ── State emission (ADR-0005, superseding ADR-0003) ──────────────────────────
 *
 * A field takes styles, options, a ref, and one callback reporting its own state. The callback
 * carries validity, completeness, focus, whether the customer has touched it, and the message it is
 * currently showing — and, for the card number, the detected scheme. It carries no card value:
 * no PAN, no BIN, no last four, no length, no expiry parts, no CVC.
 *
 * The state type is a parameter rather than a union so each field publishes ITS OWN shape:
 * `brand` exists on the card-number callback and on no other, structurally rather than by comment.
 * `scripts/verify-event-surface.mjs` pins the payload member by member against the packed
 * declarations, so widening it is a build failure rather than a judgement call.
 */
type VaultStyledFieldComponent<S, O, State> = React.ForwardRefExoticComponent<
  { styles?: S; onStateChange?: (state: State) => void } & O & React.RefAttributes<widgetHandle>
>;

/* ── Existing published names — unchanged ─────────────────────────────────── */

export type HyperswitchVaultFormHandle = VaultFormHandleShape;
export type HyperswitchVaultFormProps = Props;

export const HyperswitchVaultForm =
  RawHyperswitchVaultForm as unknown as VaultFormComponent<Props>;

export type WidgetHandle = widgetHandle;
export type HyperswitchVaultFormProviderProps = ProviderProps;

export const HyperswitchVaultFormProvider =
  RawHyperswitchVaultFormProvider as unknown as VaultFormComponent<ProviderProps>;

export const CardNumberWidget = RawCardNumberWidget as unknown as VaultStyledFieldComponent<
  fieldStyles,
  cardNumberOptions,
  cardNumberState
>;
export const CardExpiryWidget = RawCardExpiryWidget as unknown as VaultStyledFieldComponent<
  expiryStyles,
  expiryOptions,
  expiryState
>;
export const CardCVCWidget = RawCardCVCWidget as unknown as VaultStyledFieldComponent<
  fieldStyles,
  cvcOptions,
  cvcState
>;

/*
 * The cardholder name is a LIBRARY-OWNED field like the other three: the merchant styles and
 * labels it, and has no route to read or set what was typed.
 *
 * It is optional. The ready-made form always renders it, full width above the card number; a custom
 * layout may omit it entirely and `submit()` still succeeds, because it is not part of the presence
 * gate. When it is left blank the field is omitted from the tokenization request altogether.
 */
export const CardholderNameWidget = RawCardholderNameWidget as unknown as VaultStyledFieldComponent<
  fieldStyles,
  cardholderNameOptions,
  cardholderNameState
>;

/*
 * ── Canonical field names (ADR-0002 §1) ──────────────────────────────────────
 *
 * Aliases of the bindings above, not fresh casts of the raw imports, so the declared type is
 * literally the same type and cannot drift. The runtime counterpart in standalone-entry.mjs binds
 * the same component objects, so `CardNumberField === CardNumberWidget` holds at runtime too.
 */

export const CardNumberField = CardNumberWidget;
export const CardExpiryField = CardExpiryWidget;
export const CardCVCField = CardCVCWidget;
export const CardholderNameField = CardholderNameWidget;

/*
 * ── Handle type aliases (ADR-0002 §3) ────────────────────────────────────────
 *
 * Aliases, never re-declarations: writing the members out again would let the two drift silently.
 */

export type VaultFieldHandle = WidgetHandle;
export type VaultFormHandle = HyperswitchVaultFormHandle;

/*
 * ── Style types (ADR-0002 §9 layer 2) ────────────────────────────────────────
 *
 * `VaultFieldStyles` is the full slot set and the base every field type derives from.
 * `VaultExpiryStyles` is the same minus `accessory`, because the expiry field renders none.
 */
export type VaultFieldStyles = fieldStyles;
export type VaultCardNumberStyles = fieldStyles;
export type VaultExpiryStyles = expiryStyles;
export type VaultCVCStyles = fieldStyles;
export type VaultFormFieldStyles = formFieldStyles;

/*
 * ── Field option types ───────────────────────────────────────────────────────
 *
 * All generated from CardFieldOptions.res — imported, never re-declared, so the published shape
 * cannot drift from what the library actually reads. Every union is closed and literal.
 */
export type VaultLabelBehavior = labelBehavior;
export type VaultErrorDisplay = errorDisplay;
export type VaultCVCIconDisplay = cvcIconDisplay;

/*
 * ONE brand-icon control. `VaultBrandIconMode` is the same union `appearance.brandIconMode` has
 * always used — it already had a `hidden` member, so a second on/off type would have been a second
 * way to spell "off". It is published under both names because `VaultFormBrandIconMode` is the
 * existing appearance-level spelling and merchants may already reference it.
 *
 * Precedence, resolved in exactly one place:
 *   fieldOptions.cardNumber.brandIconMode  →  appearance.brandIconMode  →  'hidden'
 */
export type VaultBrandIconMode = fieldBrandIconMode;

export type VaultFieldOptions = fieldOptions;
export type VaultCardNumberOptions = cardNumberOptions;
export type VaultExpiryOptions = expiryOptions;
export type VaultCVCOptions = cvcOptions;
export type VaultCardholderNameOptions = cardholderNameOptions;
export type VaultFormFieldOptions = formFieldOptions;

export type VaultFormLayout = formLayout;
export type VaultFieldArrangement = fieldArrangement;

/*
 * ── Convenience namespace (ADR-0002 §2) ──────────────────────────────────────
 *
 * Declared, not constructed — the object itself lives in standalone-entry.mjs. `useForm` is
 * deliberately absent: `useHyperswitchVaultForm` belongs to a later phase.
 */

export declare const HyperswitchVault: {
  readonly CardForm: typeof HyperswitchVaultForm;
  readonly Form: typeof HyperswitchVaultFormProvider;
  readonly CardNumber: typeof CardNumberField;
  readonly Expiry: typeof CardExpiryField;
  readonly CVC: typeof CardCVCField;
  readonly CardholderName: typeof CardholderNameField;
};

/* ── Public type re-exports ───────────────────────────────────────────────── */

export type {
  brandIconMode as VaultFormBrandIconMode,
  localisation as VaultFormLocalisation,
  localisationLabels as VaultFormLabels,
  localisationMessages as VaultFormValidationMessages,
  safeVaultError as SafeVaultError,
  safeVaultErrorCode as SafeVaultErrorCode,
  appearance as VaultFormAppearance,
  vaultEnvironment as VaultEnvironment,
} from './HyperswitchVaultForm.gen';

export type { vaultPaymentStatus as VaultPaymentStatus, vaultTokenizeStatus as VaultTokenizeStatus } from './VaultResult.gen';

/*
 * ── Confirm input and result (ADR-0003, as corrected by ADR-0004) ────────────
 *
 * `confirmPayment(args)` runs every network call inside the library and resolves to a navigation
 * decision. Every input type below is non-card and closed: `VaultHostPaymentMethodData` names
 * `billing` and `nickName` and nothing else, so a card field cannot be expressed, let alone passed.
 *
 * `VaultPaymentConfirmInput` is declared above rather than re-exported, so that `cardSource`
 * narrows to the discriminated union.
 */
export type { cardSourceType as VaultCardSourceType } from './VaultCardSource.gen';

/*
 * Live eligibility. Optional, and entirely non-card — it only tells the library WHERE to ask about
 * the PAN it already holds, so the "card not accepted" message can appear while the customer types
 * instead of only at confirm time.
 */
export type { eligibilityConfig as VaultEligibilityConfig } from './VaultFormOptions.gen';

export type {
  hostPaymentMethodData as VaultHostPaymentMethodData,
  hostBilling as VaultHostBilling,
  hostBillingAddress as VaultHostBillingAddress,
  hostPhone as VaultHostPhone,
} from './VaultPaymentMethodData.gen';

export type {
  confirmTokenMode as VaultConfirmTokenMode,
  paymentMethodType as VaultPaymentMethodType,
  paymentType as VaultPaymentType,
  acceptanceType as VaultAcceptanceType,
  hostBrowserInfo as VaultHostBrowserInfo,
  hostCustomerAcceptance as VaultHostCustomerAcceptance,
  hostOnlineAcceptance as VaultHostOnlineAcceptance,
} from './VaultConfirmBody.gen';

export type { vaultEndpointConfig as VaultEndpointConfig } from './VaultEndpoint.gen';

export type {
  nextActionType as VaultNextActionType,
  safeNextAction as VaultNextAction,
  safeThreeDs as VaultThreeDsData,
  safeDdc as VaultDdcData,
  safeSessionToken as VaultSessionTokenData,
} from './VaultResult.gen';

export type { MerchantSession } from './merchantTypes';

/*
 * ── Emitted state (ADR-0005) ────────────────────────────────────────────────────────────────────
 *
 * What the form and the individual fields report while the customer types. Every one of these is
 * derived from library-owned state and carries no card value: no PAN, no BIN, no last four, no
 * value length, no expiry month or year, no CVC, no token and no credential. The only card-derived
 * members are the detected scheme name and the localised message already on screen.
 *
 * `scripts/verify-event-surface.mjs` gates that claim against the PACKED declarations.
 */
export type {
  cardBrand as VaultCardBrand,
  vaultFieldStatus as VaultFieldStatus,
  vaultFieldErrorCode as VaultFieldErrorCode,
  vaultFieldError as VaultFieldError,
  vaultEligibilityStatus as VaultEligibilityStatus,
  vaultSessionStatus as VaultSessionStatus,
  cardNumberState as VaultCardNumberState,
  expiryState as VaultExpiryState,
  cvcState as VaultCVCState,
  cardholderNameState as VaultCardholderNameState,
  vaultFormFields as VaultFormFields,
  vaultFormState as VaultFormState,
} from './VaultPublicState.gen';

/*
 * The union a merchant writes when one handler serves several fields. Each member is narrowed by
 * its own `field` discriminant, so `switch (state.field)` gives back the exact shape — and reading
 * `brand` is a type error anywhere but the card-number branch.
 */
export type VaultFieldState =
  | import('./VaultPublicState.gen').cardNumberState
  | import('./VaultPublicState.gen').expiryState
  | import('./VaultPublicState.gen').cvcState
  | import('./VaultPublicState.gen').cardholderNameState;

