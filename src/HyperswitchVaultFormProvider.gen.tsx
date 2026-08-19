/* TypeScript file generated from HyperswitchVaultFormProvider.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as HyperswitchVaultFormProviderJS from './HyperswitchVaultFormProvider.bs.js';

import type {appearance as HyperswitchVaultForm_appearance} from './HyperswitchVaultForm.gen';

import type {cardFormState as HyperswitchVaultForm_cardFormState} from './HyperswitchVaultForm.gen';

import type {localisation as HyperswitchVaultForm_localisation} from './HyperswitchVaultForm.gen';

import type {vaultEnvironment as HyperswitchVaultForm_vaultEnvironment} from './HyperswitchVaultForm.gen';

import type {vaultSession as HyperswitchVaultForm_vaultSession} from './HyperswitchVaultForm.gen';

export type widgetHandle = { readonly focus: () => void; readonly blur: () => void };

export type Props = {
  readonly accessible?: boolean; 
  readonly appearance?: HyperswitchVaultForm_appearance; 
  readonly children: React.ReactNode; 
  readonly disabled?: boolean; 
  readonly environment: HyperswitchVaultForm_vaultEnvironment; 
  readonly localisation?: HyperswitchVaultForm_localisation; 
  readonly onStateChange?: (_1:HyperswitchVaultForm_cardFormState) => void; 
  readonly session: HyperswitchVaultForm_vaultSession
};

export const make: React.ComponentType<{
  readonly accessible?: boolean; 
  readonly appearance?: HyperswitchVaultForm_appearance; 
  readonly children: React.ReactNode; 
  readonly disabled?: boolean; 
  readonly environment: HyperswitchVaultForm_vaultEnvironment; 
  readonly localisation?: HyperswitchVaultForm_localisation; 
  readonly onStateChange?: (_1:HyperswitchVaultForm_cardFormState) => void; 
  readonly session: HyperswitchVaultForm_vaultSession
}> = HyperswitchVaultFormProviderJS.make as any;
