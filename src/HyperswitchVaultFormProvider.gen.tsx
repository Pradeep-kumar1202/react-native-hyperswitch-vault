/* TypeScript file generated from HyperswitchVaultFormProvider.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as HyperswitchVaultFormProviderJS from './HyperswitchVaultFormProvider.bs.js';

import type {appearance as VaultFormOptions_appearance} from './VaultFormOptions.gen';

import type {cardFormState as VaultFormOptions_cardFormState} from './VaultFormOptions.gen';

import type {localisation as VaultFormOptions_localisation} from './VaultFormOptions.gen';

import type {vaultEnvironment as VaultFormOptions_vaultEnvironment} from './VaultFormOptions.gen';

import type {vaultSession as VaultFormOptions_vaultSession} from './VaultFormOptions.gen';

export type widgetHandle = { readonly focus: () => void; readonly blur: () => void };

export type Props = {
  readonly accessible?: boolean; 
  readonly appearance?: VaultFormOptions_appearance; 
  readonly children: React.ReactNode; 
  readonly disabled?: boolean; 
  readonly environment: VaultFormOptions_vaultEnvironment; 
  readonly localisation?: VaultFormOptions_localisation; 
  readonly onStateChange?: (_1:VaultFormOptions_cardFormState) => void; 
  readonly session: VaultFormOptions_vaultSession
};

export const make: React.ComponentType<{
  readonly accessible?: boolean; 
  readonly appearance?: VaultFormOptions_appearance; 
  readonly children: React.ReactNode; 
  readonly disabled?: boolean; 
  readonly environment: VaultFormOptions_vaultEnvironment; 
  readonly localisation?: VaultFormOptions_localisation; 
  readonly onStateChange?: (_1:VaultFormOptions_cardFormState) => void; 
  readonly session: VaultFormOptions_vaultSession
}> = HyperswitchVaultFormProviderJS.make as any;
