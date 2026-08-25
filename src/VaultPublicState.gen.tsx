/* TypeScript file generated from VaultPublicState.res by genType. */

/* eslint-disable */
/* tslint:disable */

export type cardBrand = 
    "visa"
  | "mastercard"
  | "americanExpress"
  | "dinersClub"
  | "discover"
  | "jcb"
  | "cartesBancaires"
  | "interac"
  | "maestro"
  | "unionPay"
  | "rupay"
  | "sodexo"
  | "bajaj"
  | "unknown";

export type vaultFieldStatus = "empty" | "incomplete" | "complete";

export type vaultFieldErrorCode = 
    "required"
  | "invalid_card_number"
  | "invalid_expiry"
  | "invalid_cvc";

export type vaultFieldError = { readonly code: vaultFieldErrorCode; readonly message: string };

export type cardNumberState = {
  readonly field: 
    "cardNumber"; 
  readonly status: vaultFieldStatus; 
  readonly focused: boolean; 
  readonly brand: cardBrand; 
  readonly error?: vaultFieldError
};

export type expiryState = {
  readonly field: 
    "expiry"; 
  readonly status: vaultFieldStatus; 
  readonly focused: boolean; 
  readonly error?: vaultFieldError
};

export type cvcState = {
  readonly field: 
    "cvc"; 
  readonly status: vaultFieldStatus; 
  readonly focused: boolean; 
  readonly error?: vaultFieldError
};

export type vaultSessionStatus = "valid" | "invalid";

export type vaultFormFields = {
  readonly cardNumber: cardNumberState; 
  readonly expiry: expiryState; 
  readonly cvc: cvcState
};

export type vaultFormState = {
  readonly fieldsReady: boolean; 
  readonly sessionStatus: vaultSessionStatus; 
  readonly complete: boolean; 
  readonly submitting: boolean; 
  readonly canSubmit: boolean; 
  readonly brand: cardBrand; 
  readonly fields: vaultFormFields
};
