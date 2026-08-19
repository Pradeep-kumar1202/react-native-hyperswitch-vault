/* TypeScript file generated from VaultEmbedded.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as VaultEmbeddedJS from './VaultEmbedded.bs.js';

import type {cardFieldSelection as CardFormTypes_cardFieldSelection} from './CardFormTypes.gen';

import type {cardFieldSpec as CardFormTypes_cardFieldSpec} from './CardFormTypes.gen';

import type {cardLabels as CardFormTypes_cardLabels} from './CardFormTypes.gen';

import type {cardLayout as CardFormTypes_cardLayout} from './CardFormTypes.gen';

import type {cardTheme as CardFormTypes_cardTheme} from './CardFormTypes.gen';

import type {eligibilityState as CardFormTypes_eligibilityState} from './CardFormTypes.gen';

import type {renderIcon as CardFormTypes_renderIcon} from './CardFormTypes.gen';

import type {scanCardCapability as CardFormTypes_scanCardCapability} from './CardFormTypes.gen';

import type {schemeAccessory as CardFormTypes_schemeAccessory} from './CardFormTypes.gen';

export type analyticsPayload = { readonly eventType: "focus" | "blur"; readonly field: "cvc" | "cardNumber" | "expiry" };

export type cardFieldSpec = CardFormTypes_cardFieldSpec;

export type cardFieldSelection = CardFormTypes_cardFieldSelection;

export type cardTheme = CardFormTypes_cardTheme;

export type cardLabels = CardFormTypes_cardLabels;

export type cardLayout = CardFormTypes_cardLayout;

export type eligibilityState = CardFormTypes_eligibilityState;

export type schemeAccessory = CardFormTypes_schemeAccessory;

export type scanCardCapability = CardFormTypes_scanCardCapability;

export abstract class maskedCardInfo { protected opaque!: any }; /* simulate opaque types */

export type props<selection,cardNumberValidator,cardNumberFormatter,makeExpiryValidator,makeCvcValidator,cardNetworkValidator,accessible,checkEligibility,theme,labels,layout,eligibilityStatus,isProcessing,onAnalytics,emitCardInfo,renderIcon,renderError,renderSchemeAccessory,scanCard> = {
  readonly selection: selection; 
  readonly cardNumberValidator: cardNumberValidator; 
  readonly cardNumberFormatter: cardNumberFormatter; 
  readonly makeExpiryValidator: makeExpiryValidator; 
  readonly makeCvcValidator: makeCvcValidator; 
  readonly cardNetworkValidator?: cardNetworkValidator; 
  readonly accessible?: accessible; 
  readonly checkEligibility: checkEligibility; 
  readonly theme: theme; 
  readonly labels: labels; 
  readonly layout: layout; 
  readonly eligibilityStatus: eligibilityStatus; 
  readonly isProcessing: isProcessing; 
  readonly onAnalytics: onAnalytics; 
  readonly emitCardInfo: emitCardInfo; 
  readonly renderIcon: renderIcon; 
  readonly renderError: renderError; 
  readonly renderSchemeAccessory?: renderSchemeAccessory; 
  readonly scanCard?: scanCard
};

export const selectCardFields: (_1:CardFormTypes_cardFieldSpec[]) => (undefined | CardFormTypes_cardFieldSelection) = VaultEmbeddedJS.selectCardFields as any;

export const make: React.ComponentType<{
  readonly selection: cardFieldSelection; 
  readonly cardNumberValidator: (_1:(undefined | string)) => (undefined | string); 
  readonly cardNumberFormatter: (_1:(undefined | string), _2:string) => (undefined | string); 
  readonly makeExpiryValidator: (_1:string) => (_1:(undefined | string)) => (undefined | string); 
  readonly makeCvcValidator: (_1:string) => (_1:(undefined | string)) => (undefined | string); 
  readonly cardNetworkValidator?: (_1:(undefined | string)) => (undefined | string); 
  readonly accessible?: boolean; 
  readonly checkEligibility: (_1:(undefined | string)) => void; 
  readonly theme: cardTheme; 
  readonly labels: cardLabels; 
  readonly layout: cardLayout; 
  readonly eligibilityStatus: eligibilityState; 
  readonly isProcessing: boolean; 
  readonly onAnalytics: (_1:analyticsPayload) => void; 
  readonly emitCardInfo: (_1:maskedCardInfo) => void; 
  readonly renderIcon: CardFormTypes_renderIcon; 
  readonly renderError: (_1:string) => JSX.Element; 
  readonly renderSchemeAccessory?: (_1:schemeAccessory) => JSX.Element; 
  readonly scanCard?: scanCardCapability
}> = VaultEmbeddedJS.make as any;
