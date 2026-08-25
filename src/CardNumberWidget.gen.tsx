/* TypeScript file generated from CardNumberWidget.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as CardNumberWidgetJS from './CardNumberWidget.bs.js';

import type {cardNumberState as VaultPublicState_cardNumberState} from './VaultPublicState.gen';

import type {fieldStyles as CardFieldStyles_fieldStyles} from './CardFieldStyles.gen';

export type Props = {
  readonly children?: React.ReactNode; 
  readonly onStateChange?: (_1:VaultPublicState_cardNumberState) => void; 
  readonly styles?: CardFieldStyles_fieldStyles
};

export const make: React.ComponentType<{
  readonly children?: React.ReactNode; 
  readonly onStateChange?: (_1:VaultPublicState_cardNumberState) => void; 
  readonly styles?: CardFieldStyles_fieldStyles
}> = CardNumberWidgetJS.make as any;
