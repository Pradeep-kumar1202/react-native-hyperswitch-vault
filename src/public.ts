
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
  cardFormState as CardFormState,
  appearance as VaultFormAppearance,
  vaultEnvironment as VaultEnvironment,
} from './HyperswitchVaultForm.gen';

export type { MerchantSession } from './merchantTypes';
