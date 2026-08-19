/* TypeScript file generated from VaultConfirm.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as VaultConfirmJS from './VaultConfirm.bs.js';

import type {AbortSignalType as $$abortSignal} from './dom-types';

export type vaultEnvironment = "production" | "sandbox" | "integration";

export type cardDetails = {
  readonly cardNumber: string; 
  readonly expiryMonth: string; 
  readonly expiryYear: string; 
  readonly cvc: string
};

export type abortSignal = $$abortSignal;

export type confirmRequest = {
  readonly sdkAuthorization: string; 
  readonly environment: vaultEnvironment; 
  readonly card: cardDetails; 
  readonly timeoutMs?: number; 
  readonly signal?: abortSignal
};

export type vaultCardMetadata = {
  readonly last4Digits: string; 
  readonly binNumber?: string; 
  readonly expiryMonth: string; 
  readonly expiryYear: string
};

export type vaultConfirmResult = { readonly token: string; readonly card: vaultCardMetadata };

export type vaultErrorCode = 
    "invalid_authorization"
  | "missing_session_id"
  | "invalid_card_data"
  | "unknown_outcome"
  | "http_error"
  | "malformed_response"
  | "missing_token";

export type vaultError = {
  readonly code: vaultErrorCode; 
  readonly message: string; 
  readonly httpStatus?: number; 
  readonly retryable: boolean; 
  readonly unknownOutcome: boolean
};

export type confirmOutcome = 
    { status: "success"; readonly result: vaultConfirmResult }
  | { status: "failure"; readonly error: vaultError };

export const confirmPaymentMethodSession: (request:confirmRequest) => Promise<confirmOutcome> = VaultConfirmJS.confirmPaymentMethodSession as any;
