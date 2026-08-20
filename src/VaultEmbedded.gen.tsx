/* TypeScript file generated from VaultEmbedded.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as VaultEmbeddedJS from './VaultEmbedded.bs.js';

import type {backspaceAction as CardFieldLogic_backspaceAction} from './CardFieldLogic.gen';

import type {cardFieldSelection as CardFormTypes_cardFieldSelection} from './CardFormTypes.gen';

import type {cardFieldSpec as CardFormTypes_cardFieldSpec} from './CardFormTypes.gen';

import type {cardLabels as CardFormTypes_cardLabels} from './CardFormTypes.gen';

import type {cardLayout as CardFormTypes_cardLayout} from './CardFormTypes.gen';

import type {cardTheme as CardFormTypes_cardTheme} from './CardFormTypes.gen';

import type {cvcChange as CardFieldLogic_cvcChange} from './CardFieldLogic.gen';

import type {eligibilityState as CardFormTypes_eligibilityState} from './CardFormTypes.gen';

import type {expiryChange as CardFieldLogic_expiryChange} from './CardFieldLogic.gen';

import type {numberChange as CardFieldLogic_numberChange} from './CardFieldLogic.gen';

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

export type CardNumberField_props<value,onChange,currentBrand,onFocus,onBlur,onBackspace,error,isValid,renderError,label,floatingLabel,theme,isProcessing,editable,accessible,onAnalytics,iconRight,registerFocus,registerBlur,borderBottomWidth,borderBottomLeftRadius,borderBottomRightRadius> = {
  readonly value: value; 
  readonly onChange: onChange; 
  readonly currentBrand?: currentBrand; 
  readonly onFocus?: onFocus; 
  readonly onBlur?: onBlur; 
  readonly onBackspace?: onBackspace; 
  readonly error?: error; 
  readonly isValid?: isValid; 
  readonly renderError?: renderError; 
  readonly label: label; 
  readonly floatingLabel: floatingLabel; 
  readonly theme: theme; 
  readonly isProcessing?: isProcessing; 
  readonly editable?: editable; 
  readonly accessible?: accessible; 
  readonly onAnalytics?: onAnalytics; 
  readonly iconRight?: iconRight; 
  readonly registerFocus?: registerFocus; 
  readonly registerBlur?: registerBlur; 
  readonly borderBottomWidth?: borderBottomWidth; 
  readonly borderBottomLeftRadius?: borderBottomLeftRadius; 
  readonly borderBottomRightRadius?: borderBottomRightRadius
};

export type CardExpiryField_props<value,onChange,onFocus,onBlur,onBackspace,error,isValid,renderError,label,floatingLabel,theme,isProcessing,editable,accessible,onAnalytics,registerFocus,registerBlur,borderTopWidth,borderRightWidth,borderTopLeftRadius,borderTopRightRadius,borderBottomRightRadius> = {
  readonly value: value; 
  readonly onChange: onChange; 
  readonly onFocus?: onFocus; 
  readonly onBlur?: onBlur; 
  readonly onBackspace?: onBackspace; 
  readonly error?: error; 
  readonly isValid?: isValid; 
  readonly renderError?: renderError; 
  readonly label: label; 
  readonly floatingLabel: floatingLabel; 
  readonly theme: theme; 
  readonly isProcessing?: isProcessing; 
  readonly editable?: editable; 
  readonly accessible?: accessible; 
  readonly onAnalytics?: onAnalytics; 
  readonly registerFocus?: registerFocus; 
  readonly registerBlur?: registerBlur; 
  readonly borderTopWidth?: borderTopWidth; 
  readonly borderRightWidth?: borderRightWidth; 
  readonly borderTopLeftRadius?: borderTopLeftRadius; 
  readonly borderTopRightRadius?: borderTopRightRadius; 
  readonly borderBottomRightRadius?: borderBottomRightRadius
};

export type CardCvcField_props<value,onChange,brand,onFocus,onBlur,onBackspace,error,isValid,renderError,label,floatingLabel,theme,isProcessing,editable,accessible,onAnalytics,iconRight,registerFocus,registerBlur,borderTopWidth,borderLeftWidth,borderTopLeftRadius,borderTopRightRadius,borderBottomLeftRadius,borderBottomRightRadius,borderBottomWidth,borderRightWidth> = {
  readonly value: value; 
  readonly onChange: onChange; 
  readonly brand?: brand; 
  readonly onFocus?: onFocus; 
  readonly onBlur?: onBlur; 
  readonly onBackspace?: onBackspace; 
  readonly error?: error; 
  readonly isValid?: isValid; 
  readonly renderError?: renderError; 
  readonly label: label; 
  readonly floatingLabel: floatingLabel; 
  readonly theme: theme; 
  readonly isProcessing?: isProcessing; 
  readonly editable?: editable; 
  readonly accessible?: accessible; 
  readonly onAnalytics?: onAnalytics; 
  readonly iconRight?: iconRight; 
  readonly registerFocus?: registerFocus; 
  readonly registerBlur?: registerBlur; 
  readonly borderTopWidth?: borderTopWidth; 
  readonly borderLeftWidth?: borderLeftWidth; 
  readonly borderTopLeftRadius?: borderTopLeftRadius; 
  readonly borderTopRightRadius?: borderTopRightRadius; 
  readonly borderBottomLeftRadius?: borderBottomLeftRadius; 
  readonly borderBottomRightRadius?: borderBottomRightRadius; 
  readonly borderBottomWidth?: borderBottomWidth; 
  readonly borderRightWidth?: borderRightWidth
};

export const selectCardFields: (_1:CardFormTypes_cardFieldSpec[]) => (undefined | CardFormTypes_cardFieldSelection) = VaultEmbeddedJS.selectCardFields as any;

export const CardNumberField_make: React.ComponentType<{
  readonly value: string; 
  readonly onChange: (_1:CardFieldLogic_numberChange) => void; 
  readonly currentBrand?: string; 
  readonly onFocus?: () => void; 
  readonly onBlur?: () => void; 
  readonly onBackspace?: (_1:CardFieldLogic_backspaceAction) => void; 
  readonly error?: string; 
  readonly isValid?: boolean; 
  readonly renderError?: (_1:string) => JSX.Element; 
  readonly label: string; 
  readonly floatingLabel: string; 
  readonly theme: cardTheme; 
  readonly isProcessing?: boolean; 
  readonly editable?: boolean; 
  readonly accessible?: boolean; 
  readonly onAnalytics?: (_1:analyticsPayload) => void; 
  readonly iconRight?: JSX.Element; 
  readonly registerFocus?: (_1:(() => void)) => void; 
  readonly registerBlur?: (_1:(() => void)) => void; 
  readonly borderBottomWidth?: number; 
  readonly borderBottomLeftRadius?: number; 
  readonly borderBottomRightRadius?: number
}> = VaultEmbeddedJS.CardNumberField.make as any;

export const CardExpiryField_make: React.ComponentType<{
  readonly value: string; 
  readonly onChange: (_1:CardFieldLogic_expiryChange) => void; 
  readonly onFocus?: () => void; 
  readonly onBlur?: () => void; 
  readonly onBackspace?: (_1:CardFieldLogic_backspaceAction) => void; 
  readonly error?: string; 
  readonly isValid?: boolean; 
  readonly renderError?: (_1:string) => JSX.Element; 
  readonly label: string; 
  readonly floatingLabel: string; 
  readonly theme: cardTheme; 
  readonly isProcessing?: boolean; 
  readonly editable?: boolean; 
  readonly accessible?: boolean; 
  readonly onAnalytics?: (_1:analyticsPayload) => void; 
  readonly registerFocus?: (_1:(() => void)) => void; 
  readonly registerBlur?: (_1:(() => void)) => void; 
  readonly borderTopWidth?: number; 
  readonly borderRightWidth?: number; 
  readonly borderTopLeftRadius?: number; 
  readonly borderTopRightRadius?: number; 
  readonly borderBottomRightRadius?: number
}> = VaultEmbeddedJS.CardExpiryField.make as any;

export const CardCvcField_make: React.ComponentType<{
  readonly value: string; 
  readonly onChange: (_1:CardFieldLogic_cvcChange) => void; 
  readonly brand?: string; 
  readonly onFocus?: () => void; 
  readonly onBlur?: () => void; 
  readonly onBackspace?: (_1:CardFieldLogic_backspaceAction) => void; 
  readonly error?: string; 
  readonly isValid?: boolean; 
  readonly renderError?: (_1:string) => JSX.Element; 
  readonly label: string; 
  readonly floatingLabel: string; 
  readonly theme: cardTheme; 
  readonly isProcessing?: boolean; 
  readonly editable?: boolean; 
  readonly accessible?: boolean; 
  readonly onAnalytics?: (_1:analyticsPayload) => void; 
  readonly iconRight?: JSX.Element; 
  readonly registerFocus?: (_1:(() => void)) => void; 
  readonly registerBlur?: (_1:(() => void)) => void; 
  readonly borderTopWidth?: number; 
  readonly borderLeftWidth?: number; 
  readonly borderTopLeftRadius?: number; 
  readonly borderTopRightRadius?: number; 
  readonly borderBottomLeftRadius?: number; 
  readonly borderBottomRightRadius?: number; 
  readonly borderBottomWidth?: number; 
  readonly borderRightWidth?: number
}> = VaultEmbeddedJS.CardCvcField.make as any;

export const CardExpiryField: { make: React.ComponentType<{
  readonly value: string; 
  readonly onChange: (_1:CardFieldLogic_expiryChange) => void; 
  readonly onFocus?: () => void; 
  readonly onBlur?: () => void; 
  readonly onBackspace?: (_1:CardFieldLogic_backspaceAction) => void; 
  readonly error?: string; 
  readonly isValid?: boolean; 
  readonly renderError?: (_1:string) => JSX.Element; 
  readonly label: string; 
  readonly floatingLabel: string; 
  readonly theme: cardTheme; 
  readonly isProcessing?: boolean; 
  readonly editable?: boolean; 
  readonly accessible?: boolean; 
  readonly onAnalytics?: (_1:analyticsPayload) => void; 
  readonly registerFocus?: (_1:(() => void)) => void; 
  readonly registerBlur?: (_1:(() => void)) => void; 
  readonly borderTopWidth?: number; 
  readonly borderRightWidth?: number; 
  readonly borderTopLeftRadius?: number; 
  readonly borderTopRightRadius?: number; 
  readonly borderBottomRightRadius?: number
}> } = VaultEmbeddedJS.CardExpiryField as any;

export const CardNumberField: { make: React.ComponentType<{
  readonly value: string; 
  readonly onChange: (_1:CardFieldLogic_numberChange) => void; 
  readonly currentBrand?: string; 
  readonly onFocus?: () => void; 
  readonly onBlur?: () => void; 
  readonly onBackspace?: (_1:CardFieldLogic_backspaceAction) => void; 
  readonly error?: string; 
  readonly isValid?: boolean; 
  readonly renderError?: (_1:string) => JSX.Element; 
  readonly label: string; 
  readonly floatingLabel: string; 
  readonly theme: cardTheme; 
  readonly isProcessing?: boolean; 
  readonly editable?: boolean; 
  readonly accessible?: boolean; 
  readonly onAnalytics?: (_1:analyticsPayload) => void; 
  readonly iconRight?: JSX.Element; 
  readonly registerFocus?: (_1:(() => void)) => void; 
  readonly registerBlur?: (_1:(() => void)) => void; 
  readonly borderBottomWidth?: number; 
  readonly borderBottomLeftRadius?: number; 
  readonly borderBottomRightRadius?: number
}> } = VaultEmbeddedJS.CardNumberField as any;

export const CardCvcField: { make: React.ComponentType<{
  readonly value: string; 
  readonly onChange: (_1:CardFieldLogic_cvcChange) => void; 
  readonly brand?: string; 
  readonly onFocus?: () => void; 
  readonly onBlur?: () => void; 
  readonly onBackspace?: (_1:CardFieldLogic_backspaceAction) => void; 
  readonly error?: string; 
  readonly isValid?: boolean; 
  readonly renderError?: (_1:string) => JSX.Element; 
  readonly label: string; 
  readonly floatingLabel: string; 
  readonly theme: cardTheme; 
  readonly isProcessing?: boolean; 
  readonly editable?: boolean; 
  readonly accessible?: boolean; 
  readonly onAnalytics?: (_1:analyticsPayload) => void; 
  readonly iconRight?: JSX.Element; 
  readonly registerFocus?: (_1:(() => void)) => void; 
  readonly registerBlur?: (_1:(() => void)) => void; 
  readonly borderTopWidth?: number; 
  readonly borderLeftWidth?: number; 
  readonly borderTopLeftRadius?: number; 
  readonly borderTopRightRadius?: number; 
  readonly borderBottomLeftRadius?: number; 
  readonly borderBottomRightRadius?: number; 
  readonly borderBottomWidth?: number; 
  readonly borderRightWidth?: number
}> } = VaultEmbeddedJS.CardCvcField as any;
