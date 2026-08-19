/**
 * The session_tokens-shaped response returned by the merchant's own backend.
 *
 * Only `vault_details.vault_type` and `vault_details.vault_data.sdk_authorization` are read; the
 * index signature means any other field the backend returns is carried through untouched and never
 * inspected.
 */
export type MerchantSession = {
  vault_details?: {
    vault_type?: string;
    vault_data?: { sdk_authorization?: string };
  };
  [key: string]: unknown;
};
