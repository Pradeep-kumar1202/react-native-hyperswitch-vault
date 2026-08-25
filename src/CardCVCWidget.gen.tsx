/* TypeScript file generated from CardCVCWidget.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as React from 'react';

import * as CardCVCWidgetJS from './CardCVCWidget.bs.js';

import type {cvcState as VaultPublicState_cvcState} from './VaultPublicState.gen';

import type {fieldStyles as CardFieldStyles_fieldStyles} from './CardFieldStyles.gen';

export type Props = {
  readonly children?: React.ReactNode; 
  readonly onStateChange?: (_1:VaultPublicState_cvcState) => void; 
  readonly styles?: CardFieldStyles_fieldStyles
};

export const make: React.ComponentType<{
  readonly children?: React.ReactNode; 
  readonly onStateChange?: (_1:VaultPublicState_cvcState) => void; 
  readonly styles?: CardFieldStyles_fieldStyles
}> = CardCVCWidgetJS.make as any;
