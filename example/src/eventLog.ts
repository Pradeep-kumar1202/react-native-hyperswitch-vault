/**
 * A merchant-side logger for the library's state events.
 *
 * This is example code, not library code. It logs to the console on purpose — that is what a
 * merchant would do to watch the events arrive in Metro — and it is safe to do so precisely
 * because of what the snapshots are: `VaultFormState` and the four field states carry no PAN, no
 * BIN, no last four, no length, no expiry parts, no CVC and no token. Logging one cannot leak a
 * card value, which is the property `scripts/verify-event-surface.mjs` holds in place.
 *
 * `assertCardFree` is a belt-and-braces demonstration of that claim rather than a necessary check:
 * it walks whatever it is handed and refuses to print anything that looks card-shaped. If it ever
 * fires, the library has regressed and the gate missed it.
 *
 * @format
 */
import type {
  VaultFormState,
  VaultCardNumberState,
  VaultExpiryState,
  VaultCVCState,
  VaultCardholderNameState,
} from '@juspay-tech/react-native-hyperswitch-vault';

type AnyFieldState =
  | VaultCardNumberState
  | VaultExpiryState
  | VaultCVCState
  | VaultCardholderNameState;

const CARD_SHAPED_KEY =
  /^(pan|bin|iin|last4|lastFour|first6|value|rawValue|cvv|securityCode|expiryMonth|expiryYear|token|sdkAuthorization)$/;

/* A run of 12+ digits is a PAN however it got there. */
const LOOKS_LIKE_A_PAN = /\d[\d ]{11,}/;

const assertCardFree = (node: unknown, key = '$'): boolean => {
  if (CARD_SHAPED_KEY.test(key)) return false;
  if (typeof node === 'string' && LOOKS_LIKE_A_PAN.test(node)) return false;
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).every(([k, v]) =>
      assertCardFree(v, k),
    );
  }
  return true;
};

const emit = (label: string, payload: Record<string, unknown>) => {
  if (!assertCardFree(payload)) {
    console.warn(`[vault] ${label} BLOCKED — payload looked card-shaped and was not printed`);
    return;
  }
  console.log(`[vault] ${label}`, payload);
};

/*
 * Only the members that changed since the last snapshot are printed. The callbacks already
 * de-duplicate whole snapshots, but a form snapshot has fourteen members and reprinting all of them
 * on every keystroke buries the one that moved.
 */
const lastByLabel = new Map<string, Record<string, unknown>>();

const changedOnly = (label: string, next: Record<string, unknown>) => {
  const previous = lastByLabel.get(label);
  lastByLabel.set(label, next);
  if (!previous) return next;
  const delta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    if (JSON.stringify(previous[k]) !== JSON.stringify(v)) delta[k] = v;
  }
  return delta;
};

/** Log one field's state. Pass the snapshot straight through from `onStateChange`. */
export const logFieldState = (state: AnyFieldState) => {
  const flat: Record<string, unknown> = {
    status: state.status,
    valid: state.valid,
    touched: state.touched,
    focused: state.focused,
    error: state.error ? `${state.error.code}: ${state.error.message}` : undefined,
  };
  if (state.field === 'cardNumber') {
    flat.brand = state.brand;
    flat.isCoBadged = state.isCoBadged;
    flat.eligibility = state.eligibility;
  }
  const delta = changedOnly(`field:${state.field}`, flat);
  if (Object.keys(delta).length > 0) emit(`field ${state.field}`, delta);
};

/** Log the whole-form state. Pass the snapshot straight through from `onFormStateChange`. */
export const logFormState = (state: VaultFormState) => {
  const flat: Record<string, unknown> = {
    canSubmit: state.canSubmit,
    valid: state.valid,
    complete: state.complete,
    fieldsReady: state.fieldsReady,
    sessionStatus: state.sessionStatus,
    submitting: state.submitting,
    brand: state.brand,
    isCoBadged: state.isCoBadged,
    eligibility: state.eligibility,
    networkError: state.networkError
      ? `${state.networkError.code}: ${state.networkError.message}`
      : undefined,
    fields: {
      cardNumber: state.fields.cardNumber.status,
      expiry: state.fields.expiry.status,
      cvc: state.fields.cvc.status,
      cardholderName: state.fields.cardholderName?.status,
    },
  };
  const delta = changedOnly('form', flat);
  if (Object.keys(delta).length > 0) emit('form', delta);
};

/** Reset between mounts so a remount logs a full snapshot again rather than an empty delta. */
export const resetEventLog = () => lastByLabel.clear();
