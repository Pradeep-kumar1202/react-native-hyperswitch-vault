/* TypeScript file generated from HyperswitchVaultForm.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as HyperswitchVaultFormJS from './HyperswitchVaultForm.bs.js';

import type {appearance as VaultFormOptions_appearance} from './VaultFormOptions.gen';

import type {brandIconMode as VaultFormOptions_brandIconMode} from './VaultFormOptions.gen';

import type {cardFormState as VaultFormOptions_cardFormState} from './VaultFormOptions.gen';

import type {expiryStyles as CardFieldStyles_expiryStyles} from './CardFieldStyles.gen';

import type {fieldArrangement as CardFieldOptions_fieldArrangement} from './CardFieldOptions.gen';

import type {fieldStyles as CardFieldStyles_fieldStyles} from './CardFieldStyles.gen';

import type {formFieldOptions as CardFieldOptions_formFieldOptions} from './CardFieldOptions.gen';

import type {formFieldStyles as CardFieldStyles_formFieldStyles} from './CardFieldStyles.gen';

import type {formLayout as CardFieldOptions_formLayout} from './CardFieldOptions.gen';

import type {localisationLabels as VaultFormOptions_localisationLabels} from './VaultFormOptions.gen';

import type {localisationMessages as VaultFormOptions_localisationMessages} from './VaultFormOptions.gen';

import type {localisation as VaultFormOptions_localisation} from './VaultFormOptions.gen';

import type {safeVaultErrorCode as VaultResult_safeVaultErrorCode} from './VaultResult.gen';

import type {safeVaultError as VaultResult_safeVaultError} from './VaultResult.gen';

import type {vaultEnvironment as VaultFormOptions_vaultEnvironment} from './VaultFormOptions.gen';

import type {vaultFormHandle as VaultFormOptions_vaultFormHandle} from './VaultFormOptions.gen';

import type {vaultFormState as VaultPublicState_vaultFormState} from './VaultPublicState.gen';

import type {vaultSession as VaultFormOptions_vaultSession} from './VaultFormOptions.gen';

import type {vaultSubmitResult as VaultResult_vaultSubmitResult} from './VaultResult.gen';

export type vaultEnvironment = VaultFormOptions_vaultEnvironment;

export type vaultSession = VaultFormOptions_vaultSession;

export type brandIconMode = VaultFormOptions_brandIconMode;

export type appearance = VaultFormOptions_appearance;

export type localisationLabels = VaultFormOptions_localisationLabels;

export type localisationMessages = VaultFormOptions_localisationMessages;

export type localisation = VaultFormOptions_localisation;

export type cardFormState = VaultFormOptions_cardFormState;

export type safeVaultErrorCode = VaultResult_safeVaultErrorCode;

export type safeVaultError = VaultResult_safeVaultError;

export type vaultSubmitResult = VaultResult_vaultSubmitResult;

export type vaultFormHandle = VaultFormOptions_vaultFormHandle;

export type fieldStyles = CardFieldStyles_fieldStyles;

export type expiryStyles = CardFieldStyles_expiryStyles;

export type formFieldStyles = CardFieldStyles_formFieldStyles;

export type vaultFormState = VaultPublicState_vaultFormState;

export type formFieldOptions = CardFieldOptions_formFieldOptions;

export type formLayout = CardFieldOptions_formLayout;

export type fieldArrangement = CardFieldOptions_fieldArrangement;

export type Props = {
  readonly accessible?: boolean; 
  readonly appearance?: appearance; 
  readonly disabled?: boolean; 
  readonly environment: vaultEnvironment; 
  readonly fieldArrangement?: fieldArrangement; 
  readonly fieldOptions?: formFieldOptions; 
  readonly fieldStyles?: formFieldStyles; 
  readonly layout?: formLayout; 
  readonly localisation?: localisation; 
  readonly onFormStateChange?: (_1:vaultFormState) => void; 
  readonly onStateChange?: (_1:cardFormState) => void; 
  readonly session: vaultSession
};

export const make: React.ComponentType<{
  readonly accessible?: boolean; 
  readonly appearance?: appearance; 
  readonly disabled?: boolean; 
  readonly environment: vaultEnvironment; 
  readonly fieldArrangement?: fieldArrangement; 
  readonly fieldOptions?: formFieldOptions; 
  readonly fieldStyles?: formFieldStyles; 
  readonly layout?: formLayout; 
  readonly localisation?: localisation; 
  readonly onFormStateChange?: (_1:vaultFormState) => void; 
  readonly onStateChange?: (_1:cardFormState) => void; 
  readonly session: vaultSession
}> = HyperswitchVaultFormJS.make as any;
