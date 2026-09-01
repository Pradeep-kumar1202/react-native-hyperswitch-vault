/**
 * The state-emission contract (ADR-0005).
 *
 * The suite that used to live here was deleted with the surface itself. What is asserted now is
 * narrower and aimed squarely at the five promises the ADR makes:
 *
 *   1. exactly one snapshot on mount, then one per real change;
 *   2. the snapshot tracks validity, completeness, focus and touched as the customer types;
 *   3. no card value is reachable on any snapshot — checked by walking every one recursively,
 *      rather than by asserting the members we happened to think of;
 *   4. an inline arrow callback causes no extra emission;
 *   5. a throwing merchant callback does not break card entry.
 *
 * Sensitive values are compared as booleans inside this file only. Nothing is printed or
 * snapshotted, and no failure message can carry a card value.
 *
 * @format
 */
import React from 'react';
import {TextInput} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardholderNameField,
  type MerchantSession,
  type VaultFormState,
  type VaultCardNumberState,
  type VaultCardholderNameState,
} from '@juspay-tech/react-native-hyperswitch-vault';

const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64 = (i: string) => {
  let o = '';
  for (let k = 0; k < i.length; k += 3) {
    const c =
      (i.charCodeAt(k) << 16) |
      ((k + 1 < i.length ? i.charCodeAt(k + 1) : 0) << 8) |
      (k + 2 < i.length ? i.charCodeAt(k + 2) : 0);
    o += B[(c >> 18) & 63] + B[(c >> 12) & 63] +
      (k + 1 < i.length ? B[(c >> 6) & 63] : '=') + (k + 2 < i.length ? B[c & 63] : '=');
  }
  return o;
};

const session = {
  session_token: [],
  payment_id: 'pay_state_events',
  sdk_authorization: 'intent_auth_state_events',
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: b64(
        'publishable_key=pk_snd_EXAMPLE_FAKE,payment_method_session_id=pms_events,profile_id=pro_X',
      ),
    },
  },
} as unknown as MerchantSession;

/* Private test data. Never rendered into an assertion message. */
const CARD = {number: '4242424242424242', expiry: '12/30', cvc: '123'};

/*
 * The values a leak would carry, and the fragments of them. `expect(...).toBe(false)` is used
 * throughout rather than matchers that print the received value, so a FAILING assertion still
 * cannot put a card number in the output.
 */
const FORBIDDEN_SUBSTRINGS = [
  CARD.number,
  CARD.number.slice(0, 6),   /* BIN */
  CARD.number.slice(-4),     /* last four */
  CARD.expiry,
  '12/30',
  CARD.cvc,
];

const walk = (node: unknown, visit: (key: string, value: unknown) => void, key = '$') => {
  visit(key, node);
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, visit, k);
    }
  }
};

/* Every string anywhere in a snapshot, and every key name, for the leak walk. */
const leaksACardValue = (snapshot: unknown) => {
  let leaked = false;
  walk(snapshot, (key, value) => {
    if (/^(pan|bin|iin|last4|lastFour|value|rawValue|cvv|securityCode|expiryMonth|expiryYear|token)$/.test(key)) {
      leaked = true;
    }
    if (typeof value === 'string') {
      for (const secret of FORBIDDEN_SUBSTRINGS) {
        if (secret.length > 0 && value.includes(secret)) leaked = true;
      }
    }
    /* A number member could carry a length or a BIN just as well as a string. */
    if (typeof value === 'number' && key !== 'timeoutMs') leaked = true;
  });
  return leaked;
};

type Harness = {
  form: VaultFormState[];
  number: VaultCardNumberState[];
};

const mount = (options: {inlineCallbacks?: boolean; throwOnEmit?: boolean} = {}) => {
  const seen: Harness = {form: [], number: []};
  let r!: Renderer;

  const Screen = () => (
    <HyperswitchVaultFormProvider
      session={session}
      environment="sandbox"
      onFormStateChange={
        options.inlineCallbacks
          ? (s) => seen.form.push(s)
          : (s: VaultFormState) => seen.form.push(s)
      }>
      <CardNumberField
        testID="num"
        onStateChange={(s) => {
          seen.number.push(s);
          if (options.throwOnEmit) throw new Error('merchant handler blew up');
        }}
      />
      <CardExpiryField testID="exp" />
      <CardCVCField testID="cvc" />
    </HyperswitchVaultFormProvider>
  );

  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(<Screen />);
  });
  /* `Screen` is returned so a test can re-render it, which builds fresh inline arrows every time. */
  return {r, seen, Screen};
};

const inputs = (r: Renderer) => r.root.findAll((n) => n.type === TextInput);
const by = (r: Renderer, id: string) => inputs(r).find((i) => i.props.testID === id)!;
const type = (r: Renderer, id: string, text: string) =>
  ReactTestRenderer.act(() => by(r, id).props.onChangeText(text));

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/* ── 1. One snapshot on mount ───────────────────────────────────────────────── */

it('emits exactly one snapshot on mount, describing an untouched empty form', () => {
  const {r, seen} = mount();

  expect(seen.form).toHaveLength(1);
  expect(seen.number).toHaveLength(1);

  const form = seen.form[0];
  expect(form.fieldsReady).toBe(true);
  expect(form.sessionStatus).toBe('valid');
  expect(form.complete).toBe(false);
  expect(form.canSubmit).toBe(false);
  expect(form.submitting).toBe(false);

  const num = seen.number[0];
  expect(num.field).toBe('cardNumber');
  expect(num.status).toBe('empty');
  expect(num.valid).toBe(false);
  expect(num.touched).toBe(false);
  expect(num.focused).toBe(false);
  expect(num.brand).toBe('unknown');
  expect(num.error).toBeUndefined();

  ReactTestRenderer.act(() => r.unmount());
});

/* ── 2. The snapshot tracks what the customer does ──────────────────────────── */

it('reports a field becoming valid, and the form becoming submittable', () => {
  const {r, seen} = mount();

  type(r, 'num', CARD.number);
  const afterNumber = seen.number[seen.number.length - 1];
  expect(afterNumber.status).toBe('complete');
  expect(afterNumber.valid).toBe(true);
  expect(afterNumber.brand).toBe('visa');

  /* One field does not make a form. */
  expect(seen.form[seen.form.length - 1].canSubmit).toBe(false);

  type(r, 'exp', CARD.expiry);
  type(r, 'cvc', CARD.cvc);

  const form = seen.form[seen.form.length - 1];
  expect(form.complete).toBe(true);
  expect(form.valid).toBe(true);
  expect(form.canSubmit).toBe(true);
  expect(form.fields.cvc.valid).toBe(true);
  expect(form.fields.expiry.status).toBe('complete');

  ReactTestRenderer.act(() => r.unmount());
});

it('reports an invalid number as incomplete, with a reason once the field is touched', () => {
  const {r, seen} = mount();

  type(r, 'num', '4242424242424241'); /* fails the Luhn check */
  const typed = seen.number[seen.number.length - 1];
  expect(typed.status).toBe('incomplete');
  expect(typed.valid).toBe(false);

  /* Untouched: the customer is not being shown a problem yet, so neither is the merchant. */
  expect(typed.touched).toBe(false);
  expect(typed.error).toBeUndefined();

  ReactTestRenderer.act(() => by(r, 'num').props.onBlur());
  const blurred = seen.number[seen.number.length - 1];
  expect(blurred.touched).toBe(true);
  expect(blurred.error?.code).toBe('invalid_card_number');
  expect(typeof blurred.error?.message).toBe('string');

  ReactTestRenderer.act(() => r.unmount());
});

it('reports focus', () => {
  const {r, seen} = mount();

  ReactTestRenderer.act(() => by(r, 'num').props.onFocus());
  expect(seen.number[seen.number.length - 1].focused).toBe(true);

  ReactTestRenderer.act(() => by(r, 'num').props.onBlur());
  expect(seen.number[seen.number.length - 1].focused).toBe(false);

  ReactTestRenderer.act(() => r.unmount());
});

/* ── 3. Nothing card-shaped is ever on a snapshot ───────────────────────────── */

it('never puts a card value, a fragment of one, or a bare number on any snapshot', () => {
  const {r, seen} = mount();

  type(r, 'num', CARD.number);
  type(r, 'exp', CARD.expiry);
  type(r, 'cvc', CARD.cvc);
  ReactTestRenderer.act(() => by(r, 'num').props.onBlur());
  ReactTestRenderer.act(() => by(r, 'cvc').props.onBlur());

  /* The walk covers every snapshot either callback ever received, not just the last. */
  const every = [...seen.form, ...seen.number];
  expect(every.length).toBeGreaterThan(3);
  for (const snapshot of every) {
    expect(leaksACardValue(snapshot)).toBe(false);
  }

  /*
   * Non-vacuity: the walk must actually be capable of catching a leak, or the assertion above
   * proves nothing.
   */
  expect(leaksACardValue({field: 'cardNumber', last4: '4242'})).toBe(true);
  expect(leaksACardValue({field: 'cardNumber', hint: CARD.number})).toBe(true);
  expect(leaksACardValue({field: 'cardNumber', digits: 16})).toBe(true);

  ReactTestRenderer.act(() => r.unmount());
});

/* ── 4. De-duplication and inline callbacks ─────────────────────────────────── */

it('does not emit when a re-render changes only the callback identity', () => {
  const {r, seen, Screen} = mount({inlineCallbacks: true});
  const formEmissions = seen.form.length;
  const fieldEmissions = seen.number.length;
  const inputBefore = by(r, 'num');

  /*
   * Three parent re-renders. `Screen` builds a fresh arrow for every callback on each pass, so if
   * identity were part of the emission decision this would emit three more times per callback.
   */
  for (let i = 0; i < 3; i++) {
    ReactTestRenderer.act(() => r.update(<Screen />));
  }

  expect(seen.form.length).toBe(formEmissions);
  expect(seen.number.length).toBe(fieldEmissions);

  /* Nor did the fields re-register: a remount here would lose focus and the customer's caret. */
  expect(by(r, 'num')).toBe(inputBefore);

  ReactTestRenderer.act(() => r.unmount());
});

it('does not re-emit when a keystroke changes nothing observable', () => {
  const {r, seen} = mount();

  type(r, 'num', CARD.number);
  const settled = seen.number.length;

  /* The same formatted value again: the reducer state is identical, so the snapshot is too. */
  type(r, 'num', CARD.number);
  expect(seen.number.length).toBe(settled);

  ReactTestRenderer.act(() => r.unmount());
});

/* ── 5. A throwing merchant callback ────────────────────────────────────────── */

it('keeps card entry alive when a merchant callback throws, and reports it NON-fatally', () => {
  /*
   * The distinction this asserts is the whole point. An earlier revision re-raised inside
   * `setTimeout(_, 0)`; that reaches the same global handler but with `isFatal = true`, which in a
   * release build is `NativeExceptionsManager.reportException` — it ends the customer's session. In
   * development both look like a harmless LogBox entry, which is what made it easy to miss. So the
   * assertion is on the CHANNEL, not merely on the error arriving.
   */
  const reported: unknown[] = [];
  const previous = (globalThis as any).ErrorUtils;
  (globalThis as any).ErrorUtils = {
    reportError: (e: unknown) => reported.push(e),
    reportFatalError: () => {
      throw new Error('the fatal channel must never be used for a merchant callback');
    },
  };

  try {
    const {r, seen} = mount({throwOnEmit: true});

    /* It threw on the mount emission, and the form still rendered. */
    expect(seen.number).toHaveLength(1);
    expect(inputs(r)).toHaveLength(3);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe('merchant handler blew up');

    /* It still accepts input, and the form-level callback still runs. */
    expect(() => type(r, 'num', CARD.number)).not.toThrow();
    expect(seen.form[seen.form.length - 1].fields.cardNumber.valid).toBe(true);

    /* Nothing was queued onto a timer, so nothing can surface later as a fatal. */
    expect(() => jest.runOnlyPendingTimers()).not.toThrow();

    ReactTestRenderer.act(() => r.unmount());
  } finally {
    (globalThis as any).ErrorUtils = previous;
  }
});

/* ── 6. No callback, no cost ────────────────────────────────────────────────── */

it('renders and works with no callbacks at all', () => {
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField testID="num" />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
      </HyperswitchVaultFormProvider>,
    );
  });

  expect(inputs(r)).toHaveLength(3);
  expect(() => type(r, 'num', CARD.number)).not.toThrow();
  expect(by(r, 'num').props.value.length).toBeGreaterThan(0);

  ReactTestRenderer.act(() => r.unmount());
});

/* ── P1-1 regression: canSubmit must never disagree with the library's own gate ─────────────── */

it('reports canSubmit false for a complete card of a network the merchant does not accept', () => {
  const seen: VaultFormState[] = [];
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        enabledCardSchemes={['Visa']}
        onFormStateChange={(s) => seen.push(s)}>
        <CardNumberField testID="num" />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
      </HyperswitchVaultFormProvider>,
    );
  });

  /* A well-formed Mastercard: single-network, so no picker is shown and nothing is "touched". */
  type(r, 'num', '5555555555554444');
  type(r, 'exp', CARD.expiry);
  type(r, 'cvc', CARD.cvc);

  const form = seen[seen.length - 1];

  /* Every value is well-formed, so the fields are complete... */
  expect(form.complete).toBe(true);

  /*
   * ...but the network is not accepted, and `tokenize()` would answer `invalid_card_data`. The
   * form state must say so BEFORE the customer presses a button the merchant was told to enable.
   */
  expect(form.valid).toBe(false);
  expect(form.canSubmit).toBe(false);
  expect(form.networkError?.code).toBe('unsupported_network');

  ReactTestRenderer.act(() => r.unmount());
});

it('accepts the same card when the merchant accepts its network', () => {
  const seen: VaultFormState[] = [];
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        enabledCardSchemes={['Mastercard']}
        onFormStateChange={(s) => seen.push(s)}>
        <CardNumberField testID="num" />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
      </HyperswitchVaultFormProvider>,
    );
  });

  type(r, 'num', '5555555555554444');
  type(r, 'exp', CARD.expiry);
  type(r, 'cvc', CARD.cvc);

  const form = seen[seen.length - 1];
  expect(form.canSubmit).toBe(true);
  expect(form.networkError).toBeUndefined();

  ReactTestRenderer.act(() => r.unmount());
});

/* ── P2-6: the cardholder name is optional, so an empty one is valid ────────────────────────── */

it('reports an empty cardholder name as valid, because it does not block submission', () => {
  const seen: VaultFormState[] = [];
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => seen.push(s)}>
        <CardNumberField testID="num" />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
        <CardholderNameField testID="name" />
      </HyperswitchVaultFormProvider>,
    );
  });

  type(r, 'num', CARD.number);
  type(r, 'exp', CARD.expiry);
  type(r, 'cvc', CARD.cvc);

  const form = seen[seen.length - 1];
  const name = form.fields.cardholderName!;

  /* Empty, but valid — and the form is submittable without it. */
  expect(name.status).toBe('empty');
  expect(name.valid).toBe(true);
  expect(form.canSubmit).toBe(true);

  /* A merchant ANDing the four `valid` flags therefore gets a usable button. */
  const allValid =
    form.fields.cardNumber.valid &&
    form.fields.expiry.valid &&
    form.fields.cvc.valid &&
    name.valid;
  expect(allValid).toBe(true);

  ReactTestRenderer.act(() => r.unmount());
});

/* ── P2-A: the network verdict must not fire on the first digit ─────────────── */

it('does not report a network fault until the number is complete', () => {
  const seen: VaultFormState[] = [];
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        enabledCardSchemes={['Mastercard']}
        onFormStateChange={(s) => seen.push(s)}>
        <CardNumberField testID="num" />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
      </HyperswitchVaultFormProvider>,
    );
  });

  /*
   * `4` alone resolves to Visa — detection fires on the first digit. A merchant rendering
   * `networkError` must not be handed "card not supported" for one keystroke, while the library's
   * own chrome stays silent.
   */
  type(r, 'num', '4');
  expect(seen[seen.length - 1].networkError).toBeUndefined();

  type(r, 'num', '424242');
  expect(seen[seen.length - 1].networkError).toBeUndefined();

  /* Once the number is actually complete, the verdict is meaningful and is reported. */
  type(r, 'num', CARD.number);
  expect(seen[seen.length - 1].networkError?.code).toBe('unsupported_network');
  expect(seen[seen.length - 1].canSubmit).toBe(false);

  ReactTestRenderer.act(() => r.unmount());
});

/* ── P2-C: the reporting path must not become the thing that breaks the form ── */

it('survives an ErrorUtils that is broken or missing reportError', () => {
  const previous = (globalThis as any).ErrorUtils;

  for (const broken of [
    {} as any,                                                    /* no reportError at all */
    {reportError: () => { throw new Error('reporter is broken'); }},
  ]) {
    (globalThis as any).ErrorUtils = broken;
    try {
      /* The merchant callback throws AND the reporter fails. The form must still mount and work. */
      const {r} = mount({throwOnEmit: true});
      expect(inputs(r)).toHaveLength(3);
      expect(() => type(r, 'num', CARD.number)).not.toThrow();
      ReactTestRenderer.act(() => r.unmount());
    } finally {
      (globalThis as any).ErrorUtils = previous;
    }
  }
});

/* ══ Custom-layout event structure ═════════════════════════════════════════════
 *
 * In a custom layout the MERCHANT decides which widgets exist, so the form state has to describe
 * the fields that are actually on screen. These are the cases the ready-made form cannot produce.
 */

const mountCustom = (children: React.ReactNode) => {
  const seen: VaultFormState[] = [];
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => seen.push(s)}>
        {children}
      </HyperswitchVaultFormProvider>,
    );
  });
  return {r, seen};
};

it('omits cardholderName from fields when the merchant does not mount that widget', () => {
  const {r, seen} = mountCustom(
    <>
      <CardNumberField testID="num" />
      <CardExpiryField testID="exp" />
      <CardCVCField testID="cvc" />
    </>,
  );

  const form = seen[seen.length - 1];

  /*
   * The default cardholderName mode is `collect`, so keying presence on the MODE reported a field
   * that is not on screen. Presence is keyed on the widget being mounted instead.
   */
  expect(form.fields.cardholderName).toBeUndefined();

  /* The three that ARE mounted are all reported, and the form is usable without the fourth. */
  expect(form.fields.cardNumber.status).toBe('empty');
  expect(form.fields.expiry.status).toBe('empty');
  expect(form.fields.cvc.status).toBe('empty');
  expect(form.fieldsReady).toBe(true);

  ReactTestRenderer.act(() => r.unmount());
});

it('includes cardholderName as soon as the merchant mounts that widget', () => {
  const perField: VaultCardholderNameState[] = [];
  const seen: VaultFormState[] = [];
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => seen.push(s)}>
        <CardNumberField testID="num" />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
        <CardholderNameField testID="name" onStateChange={(s) => perField.push(s)} />
      </HyperswitchVaultFormProvider>,
    );
  });

  const form = seen[seen.length - 1];
  expect(form.fields.cardholderName).toBeDefined();

  /* The two channels describe the same field. That is the invariant worth holding. */
  const latestPerField = perField[perField.length - 1];
  expect(form.fields.cardholderName!.status).toBe(latestPerField.status);
  expect(form.fields.cardholderName!.valid).toBe(latestPerField.valid);
  expect(form.fields.cardholderName!.touched).toBe(latestPerField.touched);

  ReactTestRenderer.act(() => r.unmount());
});

it('agrees with each widget own callback across a full typing sequence', () => {
  const numberEvents: VaultCardNumberState[] = [];
  const seen: VaultFormState[] = [];
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => seen.push(s)}>
        <CardNumberField testID="num" onStateChange={(s) => numberEvents.push(s)} />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
      </HyperswitchVaultFormProvider>,
    );
  });

  type(r, 'num', '4242');
  ReactTestRenderer.act(() => by(r, 'num').props.onBlur());
  type(r, 'num', CARD.number);
  type(r, 'exp', CARD.expiry);
  type(r, 'cvc', CARD.cvc);

  const form = seen[seen.length - 1];
  const field = numberEvents[numberEvents.length - 1];

  expect(form.fields.cardNumber.status).toBe(field.status);
  expect(form.fields.cardNumber.valid).toBe(field.valid);
  expect(form.fields.cardNumber.touched).toBe(field.touched);
  expect(form.fields.cardNumber.brand).toBe(field.brand);
  expect(form.fields.cardNumber.error?.code).toBe(field.error?.code);

  ReactTestRenderer.act(() => r.unmount());
});

it('reports fieldsReady false when a required widget is missing or duplicated', () => {
  const missing = mountCustom(
    <>
      <CardNumberField testID="num" />
      <CardExpiryField testID="exp" />
    </>,
  );
  expect(missing.seen[missing.seen.length - 1].fieldsReady).toBe(false);
  expect(missing.seen[missing.seen.length - 1].canSubmit).toBe(false);
  ReactTestRenderer.act(() => missing.r.unmount());

  const duplicated = mountCustom(
    <>
      <CardNumberField testID="num" />
      <CardNumberField testID="num2" />
      <CardExpiryField testID="exp" />
      <CardCVCField testID="cvc" />
    </>,
  );
  expect(duplicated.seen[duplicated.seen.length - 1].fieldsReady).toBe(false);
  ReactTestRenderer.act(() => duplicated.r.unmount());
});
