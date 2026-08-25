/* TypeScript file generated from CardExpiryWidget.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as CardExpiryWidgetJS from './CardExpiryWidget.bs.js';

import type {expiryState as VaultPublicState_expiryState} from './VaultPublicState.gen';

import type {expiryStyles as CardFieldStyles_expiryStyles} from './CardFieldStyles.gen';

export type Props = {
  readonly children?: React.ReactNode; 
  readonly onStateChange?: (_1:VaultPublicState_expiryState) => void; 
  readonly styles?: CardFieldStyles_expiryStyles
};

export const make: React.ComponentType<{
  readonly children?: React.ReactNode; 
  readonly onStateChange?: (_1:VaultPublicState_expiryState) => void; 
  readonly styles?: CardFieldStyles_expiryStyles
}> = CardExpiryWidgetJS.make as any;
