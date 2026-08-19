/*
 * Type entry for the package root — the standalone merchant API.
 *
 * Every type below is generated from ReScript by genType. The one thing expressed here is the ref
 * attachment: genType types a forwardRef component as `React.ComponentType<Props>` and drops the
 * ref, so the handle is re-attached using the generated `Props` and `vaultFormHandle` types. No
 * type is re-declared by hand.
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
import { make as RawCardExpiryWidget } from './CardExpiryWidget.gen';
import { make as RawCardCVCWidget } from './CardCVCWidget.gen';

export type HyperswitchVaultFormHandle = vaultFormHandle;
export type HyperswitchVaultFormProps = Props;

export const HyperswitchVaultForm =
  RawHyperswitchVaultForm as unknown as React.ForwardRefExoticComponent<
    Props & React.RefAttributes<vaultFormHandle>
  >;

/*
 * The custom-layout surface (ADR-0001). The provider's Props are generated — including
 * `children: React.ReactNode`, straight from genType — so the only hand-written piece is, as for
 * the form above, the ref re-attachment. Widgets take no props in this phase: only a ref exposing
 * focus()/blur(). There is no CardHolderWidget and no raw-value accessor anywhere.
 */
export type WidgetHandle = widgetHandle;
export type HyperswitchVaultFormProviderProps = ProviderProps;

export const HyperswitchVaultFormProvider =
  RawHyperswitchVaultFormProvider as unknown as React.ForwardRefExoticComponent<
    ProviderProps & React.RefAttributes<vaultFormHandle>
  >;

export const CardNumberWidget =
  RawCardNumberWidget as unknown as React.ForwardRefExoticComponent<
    React.RefAttributes<widgetHandle>
  >;
export const CardExpiryWidget =
  RawCardExpiryWidget as unknown as React.ForwardRefExoticComponent<
    React.RefAttributes<widgetHandle>
  >;
export const CardCVCWidget =
  RawCardCVCWidget as unknown as React.ForwardRefExoticComponent<
    React.RefAttributes<widgetHandle>
  >;

export type {
  brandIconMode as VaultFormBrandIconMode,
  localisation as VaultFormLocalisation,
  localisationLabels as VaultFormLabels,
  localisationMessages as VaultFormValidationMessages,
  vaultSubmitResult as VaultSubmitResult,
  safeVaultError as SafeVaultError,
  safeVaultErrorCode as SafeVaultErrorCode,
  vaultCardMetadata as VaultCardMetadata,
  cardFormState as CardFormState,
  appearance as VaultFormAppearance,
  vaultEnvironment as VaultEnvironment,
} from './HyperswitchVaultForm.gen';

export type { MerchantSession } from './merchantTypes';
