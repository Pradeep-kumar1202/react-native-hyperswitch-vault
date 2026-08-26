
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
import { make as RawHyperswitchVaultForm, type Props, type vaultFormHandle } from './HyperswitchVaultForm.gen';
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
  formFieldOptions,
  formLayout,
  fieldArrangement,
} from './CardFieldOptions.gen';
import { make as RawCardExpiryWidget } from './CardExpiryWidget.gen';
import { make as RawCardCVCWidget } from './CardCVCWidget.gen';
import type {
  cardBrand,
  vaultFieldStatus,
  vaultFieldErrorCode,
  vaultFieldError,
  cardNumberState,
  expiryState,
  cvcState,
  vaultSessionStatus,
  vaultFormFields,
  vaultFormState,
} from './VaultPublicState.gen';

/* ── Component types ──────────────────────────────────────────────────────── */

type VaultFormComponent<P> = React.ForwardRefExoticComponent<
  P & React.RefAttributes<vaultFormHandle>
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
type VaultStyledFieldComponent<S, O, E> = React.ForwardRefExoticComponent<
  { styles?: S; onStateChange?: (state: E) => void } & O &
    React.RefAttributes<widgetHandle>
>;

/* ── Existing published names — unchanged ─────────────────────────────────── */

export type HyperswitchVaultFormHandle = vaultFormHandle;
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
 * ── Canonical field names (ADR-0002 §1) ──────────────────────────────────────
 *
 * Aliases of the bindings above, not fresh casts of the raw imports, so the declared type is
 * literally the same type and cannot drift. The runtime counterpart in standalone-entry.mjs binds
 * the same component objects, so `CardNumberField === CardNumberWidget` holds at runtime too.
 */

export const CardNumberField = CardNumberWidget;
export const CardExpiryField = CardExpiryWidget;
export const CardCVCField = CardCVCWidget;

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
export type VaultFormFieldOptions = formFieldOptions;

export type VaultFormLayout = formLayout;
export type VaultFieldArrangement = fieldArrangement;

/*
 * ── Merchant state events (ADR-0002 §4, §4a, §5) ─────────────────────────────
 *
 * All generated from VaultPublicState.res — imported, never re-declared, so the published shape
 * cannot drift from the value the library actually emits.
 *
 * `VaultFieldState` is published as the UNION of the three narrowed records rather than the ADR's
 * single record with `brand?: CardBrand // cardNumber only`. That comment becomes structural: the
 * card-number state has a REQUIRED `brand`, and the expiry and CVC states have no `brand` member at
 * all, so a merchant cannot read one where the library never produces it. Discriminating on
 * `state.field` narrows correctly, and every narrowed record is assignable to the ADR's base shape.
 *
 * None of these carries a card value. There is no `value`, `rawValue`, `formattedValue`, length,
 * BIN, `last4`, `expiryMonth`/`expiryYear`, `cvc`, authorization, session id, token, `nativeEvent`
 * or `target` anywhere in the tree. `submit()` remains the only route to a token.
 */
export type CardBrand = cardBrand;
export type VaultField = cardNumberState['field'] | expiryState['field'] | cvcState['field'];
export type VaultFieldStatus = vaultFieldStatus;
export type VaultFieldErrorCode = vaultFieldErrorCode;
export type VaultFieldError = vaultFieldError;

export type VaultCardNumberState = cardNumberState;
export type VaultExpiryState = expiryState;
export type VaultCVCState = cvcState;
export type VaultFieldState = cardNumberState | expiryState | cvcState;

export type VaultSessionStatus = vaultSessionStatus;
export type VaultFormFields = vaultFormFields;
export type VaultFormState = vaultFormState;

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
};

/* ── Public type re-exports ───────────────────────────────────────────────── */

export type {
  brandIconMode as VaultFormBrandIconMode,
  localisation as VaultFormLocalisation,
  localisationLabels as VaultFormLabels,
  localisationMessages as VaultFormValidationMessages,
  vaultSubmitResult as VaultSubmitResult,
  safeVaultError as SafeVaultError,
  safeVaultErrorCode as SafeVaultErrorCode,
  cardFormState as CardFormState,
  appearance as VaultFormAppearance,
  vaultEnvironment as VaultEnvironment,
} from './HyperswitchVaultForm.gen';

export type { MerchantSession } from './merchantTypes';
