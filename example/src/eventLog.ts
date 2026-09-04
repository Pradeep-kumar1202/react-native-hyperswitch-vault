/**
 * A merchant-side logger for the library's events.
 *
 * This is example code, not library code. It logs to the console on purpose — that is what a
 * merchant would do to watch the events arrive in Metro. Field events carry no card value. The
 * form's `change` carries the web SDK's `cardDetailsChange` payload, which DOES include the BIN and
 * the last four once typed, exactly as it does on the web; those two are the only card-derived
 * strings, and `assertCardFree` lets them through by name while refusing anything PAN-shaped.
 *
 * @format
 */
import type {
  VaultCardFormChange,
  VaultCardFormEvent,
  VaultFieldChange,
  VaultFieldEvent,
} from '@juspay-tech/react-native-hyperswitch-vault';

const CARD_SHAPED_KEY =
  /^(pan|iin|first6|value|rawValue|cvv|cvc|securityCode|token|sdkAuthorization)$/;

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
 * de-duplicate whole snapshots, but reprinting every member on every keystroke buries the one
 * that moved.
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

/** Log one field's `change`. Pass the event straight through from `onChange`. */
export const logFieldChange = (e: VaultFieldChange) => {
  const flat: Record<string, unknown> = {
    empty: e.empty,
    complete: e.complete,
    valid: e.valid,
    touched: e.touched,
    brand: e.brand,
    error: e.error ? `${e.errorCode}: ${e.error}` : undefined,
    isCoBadged: e.isCoBadged,
  };
  const delta = changedOnly(`field:${e.elementType}`, flat);
  if (Object.keys(delta).length > 0) emit(`change ${e.elementType}`, delta);
};

/** Log a field's `ready` / `focus` / `blur`. */
export const logFieldEvent = (name: 'ready' | 'focus' | 'blur') => (e: VaultFieldEvent) =>
  emit(`${name} ${e.elementType}`, {});

/** Log the form's `change`. Pass the event straight through from `onChange`. */
export const logFormChange = (e: VaultCardFormChange) => {
  const flat: Record<string, unknown> = {
    canSubmit: e.canSubmit,
    valid: e.valid,
    complete: e.complete,
    fieldsReady: e.fieldsReady,
    sessionStatus: e.sessionStatus,
    submitting: e.submitting,
    isCoBadged: e.isCoBadged,
    networkError: e.networkError ? `${e.networkError.code}: ${e.networkError.message}` : undefined,
    payload: e.payload,
    fields: {
      cardNumber: e.fields.cardNumber.valid,
      cardExpiry: e.fields.cardExpiry.valid,
      cardCvc: e.fields.cardCvc.valid,
      cardholderName: e.fields.cardholderName?.valid,
    },
  };
  const delta = changedOnly('form', flat);
  if (Object.keys(delta).length > 0) emit(`${e.eventName}`, delta);
};

export const logFormReady = (e: VaultCardFormEvent) => emit(`ready ${e.elementType}`, {});

/** Reset between mounts so a remount logs a full snapshot again rather than an empty delta. */
export const resetEventLog = () => lastByLabel.clear();
