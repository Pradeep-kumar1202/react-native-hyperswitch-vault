/* TypeScript file generated from VaultResult.res by genType. */

/* eslint-disable */
/* tslint:disable */

import type {vaultCardMetadata as VaultConfirm_vaultCardMetadata} from './VaultConfirm.gen';

export type safeVaultErrorCode = 
    "invalid_session"
  | "invalid_card_data"
  | "not_ready"
  | "server_error"
  | "unknown_outcome";

export type safeVaultError = { readonly code: safeVaultErrorCode; readonly message: string };

export type vaultSubmitResult = 
    { status: "success"; readonly token: string; readonly card: VaultConfirm_vaultCardMetadata }
  | { status: "validation_error"; readonly error: safeVaultError }
  | { status: "not_ready"; readonly error: safeVaultError }
  | { status: "error"; readonly error: safeVaultError };
