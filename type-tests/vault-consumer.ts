/*
 * Consumer-side assertions for the `<package>/vault` entry — the bare transport.
 *
 * Compiled against the PUBLISHED declarations in dist/types, under the stock React Native tsconfig
 * (see tsconfig.consumer.json). Every `@ts-expect-error` is a negative control: TypeScript fails the
 * build if the line it marks stops being an error.
 */
import {confirmPaymentMethodSession} from '../dist/types/vault';
import type {
  confirmOutcome,
  confirmRequest,
  vaultErrorCode,
  vaultEnvironment,
} from '../dist/types/vault';

/* ── The point of this file: a real AbortSignal, with NO cast ────────────── */

export async function cancellable(): Promise<confirmOutcome> {
  const controller = new AbortController();

  const request: confirmRequest = {
    sdkAuthorization: 'ZmFrZQ==',
    environment: 'sandbox',
    card: {
      cardNumber: '4242424242424242',
      expiryMonth: '12',
      expiryYear: '30',
      cvc: '123',
    },
    timeoutMs: 15000,
    /* No `as unknown as ...` anywhere. If this ever needs one, the published type is wrong. */
    signal: controller.signal,
  };

  const outcome = await confirmPaymentMethodSession(request);
  controller.abort();
  return outcome;
}

/* The signal a fetch-style API hands you must be accepted just as directly. */
export function fromAnotherSignal(signal: AbortSignal): confirmRequest {
  return {
    sdkAuthorization: 'ZmFrZQ==',
    environment: 'sandbox',
    card: {cardNumber: '4242424242424242', expiryMonth: '12', expiryYear: '2030', cvc: '123'},
    signal,
  };
}

/* Both optional fields really are optional. */
export const minimal: confirmRequest = {
  sdkAuthorization: 'ZmFrZQ==',
  environment: 'sandbox',
  card: {cardNumber: '4242424242424242', expiryMonth: '12', expiryYear: '2030', cvc: '123'},
};

/* ── Negative controls ───────────────────────────────────────────────────── */

export const wrongSignal: confirmRequest = {
  sdkAuthorization: 'ZmFrZQ==',
  environment: 'sandbox',
  card: {cardNumber: '4242424242424242', expiryMonth: '12', expiryYear: '2030', cvc: '123'},
  // @ts-expect-error - a signal is not an arbitrary object
  signal: {aborted: false},
};

// @ts-expect-error - only production | sandbox | integration
export const wrongEnvironment: vaultEnvironment = 'staging';

export const missingCvc: confirmRequest = {
  sdkAuthorization: 'ZmFrZQ==',
  environment: 'sandbox',
  // @ts-expect-error - every card field is required by the transport
  card: {cardNumber: '4242424242424242', expiryMonth: '12', expiryYear: '2030'},
};

/* ── The outcome narrows, and carries nothing unsafe ─────────────────────── */

export function readOutcome(outcome: confirmOutcome): string {
  if (outcome.status === 'success') {
    const token: string = outcome.result.token;
    const last4: string = outcome.result.card.last4Digits;
    // @ts-expect-error - a success carries no error
    void outcome.error;
    return token + last4;
  }

  const code: vaultErrorCode = outcome.error.code;
  const unknownOutcome: boolean = outcome.error.unknownOutcome;
  const retryable: boolean = outcome.error.retryable;
  // @ts-expect-error - a failure carries no result
  void outcome.result;
  return `${code}${unknownOutcome}${retryable}`;
}

/* The transport's own code union is closed, and still has no `network_error`. */
export function transportCodes(code: vaultErrorCode): number {
  switch (code) {
    case 'invalid_authorization':
    case 'missing_session_id':
    case 'invalid_card_data':
    case 'unknown_outcome':
    case 'http_error':
    case 'malformed_response':
    case 'missing_token':
      return 1;
  }
}

// @ts-expect-error - deliberately absent: a thrown fetch may still have been processed
export const noNetworkErrorCode: vaultErrorCode = 'network_error';
