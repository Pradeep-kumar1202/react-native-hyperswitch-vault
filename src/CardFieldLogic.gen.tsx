/* TypeScript file generated from CardFieldLogic.res by genType. */

/* eslint-disable */
/* tslint:disable */

export type numberChange = {
  readonly formatted: string; 
  readonly brand: string; 
  readonly matchedSchemes: string[]; 
  readonly showSchemePicker: boolean; 
  readonly clearDependents: boolean; 
  readonly advanceFocus: boolean
};

export type expiryChange = {
  readonly display: string; 
  readonly month: string; 
  readonly year: string; 
  readonly advanceFocus: boolean
};

export type cvcChange = { readonly formatted: string; readonly blurField: boolean };

export type scanFocus = "cvc" | "expiry" | "none";

export type scanResult = {
  readonly cardNumber: string; 
  readonly brand: string; 
  readonly expiryDisplay: string; 
  readonly expiryMonth: string; 
  readonly expiryYear: string; 
  readonly focus: scanFocus
};

export type backspaceAction = 
    "blurSelf"
  | "focusCardNumber"
  | "focusExpiry"
  | "none";

export type eligibilityProbe = 
    "reset"
  | "idle"
  | { NAME: "check"; VAL: string };
