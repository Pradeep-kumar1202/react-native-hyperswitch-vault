/* TypeScript file generated from HyperswitchVaultForm.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as HyperswitchVaultFormJS from './HyperswitchVaultForm.bs.js';

import type {MerchantSession as $$vaultSession} from './merchantTypes';

import type {brandIconMode as CardIcons_brandIconMode} from './CardIcons.gen';

import type {safeVaultErrorCode as VaultResult_safeVaultErrorCode} from './VaultResult.gen';

import type {safeVaultError as VaultResult_safeVaultError} from './VaultResult.gen';

import type {vaultCardMetadata as VaultConfirm_vaultCardMetadata} from './VaultConfirm.gen';

import type {vaultEnvironment as VaultConfirm_vaultEnvironment} from './VaultConfirm.gen';

import type {vaultSubmitResult as VaultResult_vaultSubmitResult} from './VaultResult.gen';

export type vaultEnvironment = VaultConfirm_vaultEnvironment;

export type vaultSession = $$vaultSession;

export type brandIconMode = CardIcons_brandIconMode;

export type appearance = {
  readonly primaryColor?: string; 
  readonly textColor?: string; 
  readonly errorColor?: string; 
  readonly placeholderColor?: string; 
  readonly backgroundColor?: string; 
  readonly borderColor?: string; 
  readonly borderRadius?: number; 
  readonly borderWidth?: number; 
  readonly fontFamily?: string; 
  readonly inputHeight?: number; 
  readonly gap?: number; 
  readonly fontScale?: number; 
  readonly placeholderTextSizeAdjust?: number; 
  readonly errorTextSizeAdjust?: number; 
  readonly errorMessageSpacing?: number; 
  readonly brandIconMode?: brandIconMode
};

export type localisationLabels = {
  readonly cardNumberPlaceholder?: string; 
  readonly cardNumberFloatingLabel?: string; 
  readonly expiryPlaceholder?: string; 
  readonly expiryFloatingLabel?: string; 
  readonly cvcPlaceholder?: string; 
  readonly cvcFloatingLabel?: string
};

export type localisationMessages = {
  readonly cardNumberRequired?: string; 
  readonly cardNumberInvalid?: string; 
  readonly expiryRequired?: string; 
  readonly expiryInvalid?: string; 
  readonly cvcRequired?: string; 
  readonly cvcInvalid?: string
};

export type localisation = {
  readonly labels?: localisationLabels; 
  readonly validationMessages?: localisationMessages; 
  readonly isRtl?: boolean
};

export type cardFormState = {
  readonly complete: boolean; 
  readonly cardNumberValid: boolean; 
  readonly expiryValid: boolean; 
  readonly cvcValid: boolean; 
  readonly brand: string
};

export type vaultCardMetadata = VaultConfirm_vaultCardMetadata;

export type safeVaultErrorCode = VaultResult_safeVaultErrorCode;

export type safeVaultError = VaultResult_safeVaultError;

export type vaultSubmitResult = VaultResult_vaultSubmitResult;

export type vaultFormHandle = {
  readonly submit: () => Promise<vaultSubmitResult>; 
  readonly reset: () => void; 
  readonly focus: (_1:
    "cvc"
  | "cardNumber"
  | "expiry") => void
};

export type Props = {
  readonly accessible?: boolean; 
  readonly appearance?: appearance; 
  readonly disabled?: boolean; 
  readonly environment: vaultEnvironment; 
  readonly localisation?: localisation; 
  readonly onStateChange?: (_1:cardFormState) => void; 
  readonly session: vaultSession; 
  readonly splitCardFields?: boolean
};

export const make: React.ComponentType<{
  readonly accessible?: boolean; 
  readonly appearance?: appearance; 
  readonly disabled?: boolean; 
  readonly environment: vaultEnvironment; 
  readonly localisation?: localisation; 
  readonly onStateChange?: (_1:cardFormState) => void; 
  readonly session: vaultSession; 
  readonly splitCardFields?: boolean
}> = HyperswitchVaultFormJS.make as any;
