/* TypeScript file generated from HyperswitchVaultForm.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as HyperswitchVaultFormJS from './HyperswitchVaultForm.bs.js';

import type {appearance as VaultFormOptions_appearance} from './VaultFormOptions.gen';

import type {brandIconMode as VaultFormOptions_brandIconMode} from './VaultFormOptions.gen';

import type {cardFormState as VaultFormOptions_cardFormState} from './VaultFormOptions.gen';

import type {localisationLabels as VaultFormOptions_localisationLabels} from './VaultFormOptions.gen';

import type {localisationMessages as VaultFormOptions_localisationMessages} from './VaultFormOptions.gen';

import type {localisation as VaultFormOptions_localisation} from './VaultFormOptions.gen';

import type {safeVaultErrorCode as VaultResult_safeVaultErrorCode} from './VaultResult.gen';

import type {safeVaultError as VaultResult_safeVaultError} from './VaultResult.gen';

import type {vaultEnvironment as VaultFormOptions_vaultEnvironment} from './VaultFormOptions.gen';

import type {vaultFormHandle as VaultFormOptions_vaultFormHandle} from './VaultFormOptions.gen';

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
