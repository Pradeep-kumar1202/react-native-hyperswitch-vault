
/*
 * Runtime entry for the package root. The ONLY source of runtime values for `.`.
 *
 * `src/public.ts` is the parallel type-only surface (tsc runs with emitDeclarationOnly, so nothing
 * there executes). The two must agree; `scripts/verify-public-surface.mjs` fails the build if they
 * drift.
 *
 * Everything below is a binding or a plain object over the five ReScript components. No wrapper
 * component: a wrapper would break `===` identity, add a render frame, and give React.memo and
 * devtools a second name for the same thing.
 *
 * The namespace is a plain object literal rather than `Object.assign(...)` so an unreferenced
 * namespace tree-shakes away with the references it holds — `scripts/verify-treeshaking.mjs`
 * proves it. It has no `useForm`: that is a later phase.
 */

import { make as HyperswitchVaultFormImpl } from './HyperswitchVaultForm.bs.js';
import { make as HyperswitchVaultFormProviderImpl } from './HyperswitchVaultFormProvider.bs.js';
import { make as CardNumberWidgetImpl } from './CardNumberWidget.bs.js';
import { make as CardExpiryWidgetImpl } from './CardExpiryWidget.bs.js';
import { make as CardCVCWidgetImpl } from './CardCVCWidget.bs.js';

/* Existing published names — unchanged, not deprecated. */
export const HyperswitchVaultForm = HyperswitchVaultFormImpl;
export const HyperswitchVaultFormProvider = HyperswitchVaultFormProviderImpl;
export const CardNumberWidget = CardNumberWidgetImpl;
export const CardExpiryWidget = CardExpiryWidgetImpl;
export const CardCVCWidget = CardCVCWidgetImpl;

/* Canonical field names (ADR-0002 §1) — the same component objects. */
export const CardNumberField = CardNumberWidgetImpl;
export const CardExpiryField = CardExpiryWidgetImpl;
export const CardCVCField = CardCVCWidgetImpl;

/* Convenience namespace (ADR-0002 §2). */
export const HyperswitchVault = {
  CardForm: HyperswitchVaultFormImpl,
  Form: HyperswitchVaultFormProviderImpl,
  CardNumber: CardNumberWidgetImpl,
  Expiry: CardExpiryWidgetImpl,
  CVC: CardCVCWidgetImpl,
};
