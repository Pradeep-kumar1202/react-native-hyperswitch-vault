/* TypeScript file generated from CardFormTypes.res by genType. */

/* eslint-disable */
/* tslint:disable */

export abstract class styleObject { protected opaque!: any }; /* simulate opaque types */

export type cardTheme = {
  readonly borderWidth: number; 
  readonly borderRadius: number; 
  readonly gap: number; 
  readonly inputHeight: number; 
  readonly fontFamily: string; 
  readonly fontScale: number; 
  readonly placeholderTextSizeAdjust: number; 
  readonly placeholderColor: string; 
  readonly primaryColor: string; 
  readonly dangerColor: string; 
  readonly textColor: string; 
  readonly inputBackground: string; 
  readonly dividerColor: string; 
  readonly errorBorderColor: string; 
  readonly normalBorderColor: string; 
  readonly bgStyle: styleObject; 
  readonly shadowStyle: styleObject
};

export type cardLabels = {
  readonly cardNumberPlaceholder: string; 
  readonly cardNumberFloatingLabel: string; 
  readonly expiryPlaceholder: string; 
  readonly expiryFloatingLabel: string; 
  readonly cvcPlaceholder: string; 
  readonly cvcFloatingLabel: string; 
  readonly notEligibleText: string; 
  readonly isRtl: boolean
};

export type cardLayout = { readonly splitCardFields: boolean; readonly showCvcIcon: boolean };

export type eligibilityState = "allowed" | "pending" | "denied";

export type scanCardCapability = { readonly isAvailable: boolean; readonly launch: (onScanned:((pan:string, expiry:string) => void)) => void };

export type schemeAccessory = {
  readonly availableSchemes: string[]; 
  readonly selectedScheme: string; 
  readonly detectedScheme: string; 
  readonly showPicker: boolean; 
  readonly onSelectScheme: (_1:string) => void
};

export type renderIcon = (name:string, width:number, height:number, fill:string) => JSX.Element;

export type cardFieldSpec = { readonly renderType: string; readonly writePath: string };

export type cardFieldSelection = {
  readonly cardNumberPath: string; 
  readonly cardExpiryMonthPath: string; 
  readonly cardExpiryYearPath: string; 
  readonly cardCvcPath: (undefined | string); 
  readonly cardNetworkPath: (undefined | string)
};
