/* TypeScript file generated from VaultProviderCard.res by genType. */

/* eslint-disable */
/* tslint:disable */

export type providerVaultType = 
    "vgs"
  | "skyflow"
  | "basis_theory"
  | "evervault";

export type providerTokenizedCard = {
  readonly cardNumber: string; 
  readonly cardCvc: string; 
  readonly expiryMonth: string; 
  readonly expiryYear: string; 
  readonly lastFour?: string; 
  readonly binNumber?: string; 
  readonly cardNetwork?: string; 
  readonly cardHolderName?: string
};
