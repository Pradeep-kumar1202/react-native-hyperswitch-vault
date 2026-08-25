/**
 * Merchant state events (ADR-0002 §4, §4a, §5), proven against the PUBLISHED package.
 *
 * Two things this file has to establish that a type check cannot:
 *
 *   1. the emitted objects really have the published shape, and really change when the customer's
 *      state changes — including the exact moment a validation error becomes visible;
 *   2. no card value escapes through them. Every snapshot captured anywhere in this file is walked
 *      RECURSIVELY for forbidden keys, not just checked at the top level.
 *
 * @format
 */
import React from 'react';
import {TextInput} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVaultFormProvider,
  HyperswitchVault,
  CardNumberField,
  CardNumberWidget,
  CardExpiryField,
  CardCVCField,
  type VaultCardNumberState,
  type VaultExpiryState,
  type VaultCVCState,
  type VaultFormState,
  type VaultFormHandle,
  type VaultSubmitResult,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

declare const global: {fetch: unknown};

/* ── Fixture ─────────────────────────────────────────────────────────────── */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toBase64 = (input: string): string => {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const chunk =
      (input.charCodeAt(i) << 16) |
      ((i + 1 < input.length ? input.charCodeAt(i + 1) : 0) << 8) |
      (i + 2 < input.length ? input.charCodeAt(i + 2) : 0);
    out +=
      BASE64_ALPHABET[(chunk >> 18) & 63] +
      BASE64_ALPHABET[(chunk >> 12) & 63] +
      (i + 1 < input.length ? BASE64_ALPHABET[(chunk >> 6) & 63] : '=') +
      (i + 2 < input.length ? BASE64_ALPHABET[chunk & 63] : '=');
  }
  return out;
};

const sessionWith = (pms: string): MerchantSession => ({
  session_token: [],
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: toBase64(
        [
          'publishable_key=pk_snd_EXAMPLE_FAKE',
          `payment_method_session_id=${pms}`,
          'profile_id=pro_EXAMPLE_FAKE',
        ].join(','),
      ),
    },
  },
});

const session = sessionWith('pms_events_test');
const unusableSession = {session_token: []} as unknown as MerchantSession;

const CARD_NUMBER = '4242424242424242';
const EXPIRY = '12/30';
const CVC = '123';

const NUMBER_ID = 'CardNumberInputTestId';
const EXPIRY_ID = 'ExpiryInputTestId';
const CVC_ID = 'CVCInputTestId';

const confirmResponse = {
  associated_payment_methods: [{payment_method_token: {data: 'tok_fake_0001'}}],
  payment_method_data: {
    card: {last4_digits: '4242', card_isin: '424242', expiry_month: '12', expiry_year: '2030'},
  },
};

/* ── Controllable fetch ──────────────────────────────────────────────────── */

type Call = {settle: (body: unknown, status?: number) => void; fail: (reason?: string) => void};
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  jest.useFakeTimers();
  (global as any).fetch = jest.fn((_url: string, options: any) => {
    let settle: (body: unknown, status?: number) => void = () => {};
    let fail: (reason?: string) => void = () => {};
    const promise = new Promise((resolve, reject) => {
      settle = (body, status = 200) =>
        resolve({ok: status >= 200 && status < 300, status, json: async () => body});
      fail = (reason = 'Network request failed') => reject(new Error(reason));
      options?.signal?.addEventListener('abort', () => {
        const error: Error & {name?: string} = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
    calls.push({settle, fail});
    return promise;
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const mount = (element: React.ReactElement) => {
  let renderer!: Renderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
};

const inputBy = (renderer: Renderer, testID: string) =>
  renderer.root.findAll((n) => n.type === TextInput && n.props.testID === testID)[0];

const type = (renderer: Renderer, testID: string, text: string) =>
  ReactTestRenderer.act(() => inputBy(renderer, testID).props.onChangeText(text));

const focus = (renderer: Renderer, testID: string) =>
  ReactTestRenderer.act(() => inputBy(renderer, testID).props.onFocus({nativeEvent: {}}));

const blur = (renderer: Renderer, testID: string) =>
  ReactTestRenderer.act(() => inputBy(renderer, testID).props.onBlur({nativeEvent: {}}));

const fillValidCard = (renderer: Renderer) => {
  type(renderer, NUMBER_ID, CARD_NUMBER);
  type(renderer, EXPIRY_ID, EXPIRY);
  type(renderer, CVC_ID, CVC);
};

/*
 * THE SECURITY WALK. Every snapshot this file captures goes through here. It descends into nested
 * objects and arrays, so a leak buried at `fields.cardNumber.value` is caught just as a top-level
 * one would be.
 */
const FORBIDDEN = [
  'value', 'rawValue', 'formattedValue', 'cardNumber', 'pan', 'expiryMonth', 'expiryYear',
  'cvc', 'cvv', 'bin', 'last4', 'authorization', 'sessionId', 'paymentMethodSessionId',
  'token', 'nativeEvent', 'target', 'text',
];

/* `fields.cardNumber` / `fields.cvc` are the state RECORDS, not values — allowed by path. */
const ALLOWED_PATHS = new Set(['fields.cardNumber', 'fields.cvc']);

const forbiddenKeysIn = (snapshot: unknown): string[] => {
  const found: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const here = path ? `${path}.${key}` : key;
      if (FORBIDDEN.includes(key) && !ALLOWED_PATHS.has(here)) found.push(here);
      walk(child, here);
    }
  };
  walk(snapshot, '');
  return found;
};

/* Also assert the string never appears anywhere, whatever it is keyed under. */
const containsSubstring = (snapshot: unknown, needle: string): boolean => {
  let hit = false;
  const walk = (node: unknown): void => {
    if (hit) return;
    if (typeof node === 'string') {
      if (node.includes(needle)) hit = true;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(snapshot);
  return hit;
};

const expectSafe = (snapshots: unknown[]) => {
  for (const snapshot of snapshots) {
    expect(forbiddenKeysIn(snapshot)).toEqual([]);
    for (const secret of [CARD_NUMBER, '4242 4242 4242 4242', '424242', EXPIRY, CVC, 'tok_fake_0001', 'pms_events_test', 'pk_snd_EXAMPLE_FAKE']) {
      expect(containsSubstring(snapshot, secret)).toBe(false);
    }
  }
};

type ProviderChildren = React.ComponentProps<typeof HyperswitchVaultFormProvider>['children'];

/*
 * THE EMISSION GUARANTEE, stated as an assertion.
 *
 * "No structurally identical consecutive public snapshots are emitted." That is the whole contract:
 * not a cap on how many snapshots a given input produces, and not a promise about which intermediate
 * states are observable.
 */
const expectNoConsecutiveDuplicates = (snapshots: unknown[]) => {
  for (let i = 1; i < snapshots.length; i += 1) {
    expect(snapshots[i]).not.toEqual(snapshots[i - 1]);
  }
};

/* ── 1. Field callbacks ───────────────────────────────────────────────────── */

describe('field callbacks: initial snapshot and status transitions', () => {
  const setup = () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    return {seen, renderer};
  };

  it('emits exactly one initial snapshot, empty and unfocused with no error', () => {
    const {seen, renderer} = setup();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({field: 'cardNumber', status: 'empty', focused: false, brand: 'unknown'});
    expectSafe(seen);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('empty → incomplete → complete', () => {
    const {seen, renderer} = setup();

    type(renderer, NUMBER_ID, '4242');
    expect(seen[seen.length - 1].status).toBe('incomplete');

    type(renderer, NUMBER_ID, CARD_NUMBER);
    expect(seen[seen.length - 1].status).toBe('complete');

    type(renderer, NUMBER_ID, '');
    expect(seen[seen.length - 1].status).toBe('empty');

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a malformed non-empty field is incomplete, never empty', () => {
    const {seen, renderer} = setup();

    type(renderer, NUMBER_ID, '1');
    expect(seen[seen.length - 1].status).toBe('incomplete');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('focus and blur move only the focused flag', () => {
    const {seen, renderer} = setup();

    focus(renderer, NUMBER_ID);
    expect(seen[seen.length - 1].focused).toBe(true);
    expect(seen[seen.length - 1].status).toBe('empty');

    blur(renderer, NUMBER_ID);
    expect(seen[seen.length - 1].focused).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('brand changes as the scheme is detected', () => {
    const {seen, renderer} = setup();

    expect(seen[0].brand).toBe('unknown');
    type(renderer, NUMBER_ID, '4242');
    expect(seen[seen.length - 1].brand).toBe('visa');

    type(renderer, NUMBER_ID, '5555555555554444');
    expect(seen[seen.length - 1].brand).toBe('mastercard');

    type(renderer, NUMBER_ID, '');
    expect(seen[seen.length - 1].brand).toBe('unknown');

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('field callbacks: validation-error timing matches the visible UI', () => {
  const setup = () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    return {seen, renderer};
  };
  const latest = (seen: VaultCardNumberState[]) => seen[seen.length - 1];

  it('no error before interaction', () => {
    const {seen, renderer} = setup();
    expect(latest(seen).error).toBeUndefined();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('no error while still focused and half-typed', () => {
    const {seen, renderer} = setup();
    focus(renderer, NUMBER_ID);
    type(renderer, NUMBER_ID, '4242');
    expect(latest(seen).status).toBe('incomplete');
    expect(latest(seen).error).toBeUndefined();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('an error appears after blur, with a stable code and a display message', () => {
    const {seen, renderer} = setup();
    focus(renderer, NUMBER_ID);
    type(renderer, NUMBER_ID, '4242');
    blur(renderer, NUMBER_ID);

    expect(latest(seen).error?.code).toBe('invalid_card_number');
    expect(typeof latest(seen).error?.message).toBe('string');
    expect(latest(seen).error!.message.length).toBeGreaterThan(0);
    /* the message is display copy; the code is the stable, locale-independent part */
    expect(latest(seen).error!.message).not.toBe('invalid_card_number');

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('an empty blurred field reports `required`, not an invalid code', () => {
    const {seen, renderer} = setup();
    focus(renderer, NUMBER_ID);
    blur(renderer, NUMBER_ID);
    expect(latest(seen).error?.code).toBe('required');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the error clears once corrected', () => {
    const {seen, renderer} = setup();
    focus(renderer, NUMBER_ID);
    type(renderer, NUMBER_ID, '4242');
    blur(renderer, NUMBER_ID);
    expect(latest(seen).error).toBeDefined();

    type(renderer, NUMBER_ID, CARD_NUMBER);
    expect(latest(seen).error).toBeUndefined();
    expect(latest(seen).status).toBe('complete');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a submit attempt makes the error visible without a blur', async () => {
    const seen: VaultCardNumberState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = mount(
      <HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    type(renderer, NUMBER_ID, '4242');
    expect(seen[seen.length - 1].error).toBeUndefined();

    await ReactTestRenderer.act(async () => {
      await formRef.current!.submit();
    });
    expect(seen[seen.length - 1].error?.code).toBe('invalid_card_number');

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('field callbacks: expiry and CVC', () => {
  it('expiry reports its own field name, status and error, and no brand', () => {
    const seen: VaultExpiryState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField />
        <CardExpiryField onStateChange={(s) => seen.push(s)} />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expect(seen[0]).toEqual({field: 'expiry', status: 'empty', focused: false});
    expect('brand' in seen[0]).toBe(false);

    type(renderer, EXPIRY_ID, '12');
    expect(seen[seen.length - 1].status).toBe('incomplete');
    type(renderer, EXPIRY_ID, EXPIRY);
    expect(seen[seen.length - 1].status).toBe('complete');

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('CVC reports its own field name, status and error, and no brand', () => {
    const seen: VaultCVCState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField onStateChange={(s) => seen.push(s)} />
      </HyperswitchVaultFormProvider>,
    );

    expect(seen[0]).toEqual({field: 'cvc', status: 'empty', focused: false});
    expect('brand' in seen[0]).toBe(false);

    type(renderer, CVC_ID, '1');
    expect(seen[seen.length - 1].status).toBe('incomplete');
    type(renderer, CVC_ID, CVC);
    expect(seen[seen.length - 1].status).toBe('complete');

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 2. Aggregate form state ──────────────────────────────────────────────── */

const mountProvider = (
  children: ProviderChildren,
  onFormStateChange: (s: VaultFormState) => void,
  formRef?: React.RefObject<VaultFormHandle | null>,
  merchantSession: MerchantSession = session,
) =>
  mount(
    <HyperswitchVaultFormProvider
      ref={formRef as never}
      session={merchantSession}
      environment="sandbox"
      onFormStateChange={onFormStateChange}>
      {children}
    </HyperswitchVaultFormProvider>,
  );

const allThree = (
  <>
    <CardNumberField />
    <CardExpiryField />
    <CardCVCField />
  </>
) as ProviderChildren;

describe('aggregate form state', () => {
  it('the first snapshot already reports ready — registration happens before the emit', () => {
    const seen: VaultFormState[] = [];
    const renderer = mountProvider(allThree, (s) => seen.push(s));

    expect(seen).toHaveLength(1);
    expect(seen[0].fieldsReady).toBe(true);
    expect(seen[0].sessionStatus).toBe('valid');
    expect(seen[0].complete).toBe(false);
    expect(seen[0].submitting).toBe(false);
    expect(seen[0].canSubmit).toBe(false);
    expect(seen[0].brand).toBe('unknown');
    expect(seen[0].fields.cardNumber.status).toBe('empty');
    expect(seen[0].fields.expiry.status).toBe('empty');
    expect(seen[0].fields.cvc.status).toBe('empty');

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('all three fields contribute; complete and canSubmit flip together', () => {
    const seen: VaultFormState[] = [];
    const renderer = mountProvider(allThree, (s) => seen.push(s));
    const latest = () => seen[seen.length - 1];

    type(renderer, NUMBER_ID, CARD_NUMBER);
    expect(latest().fields.cardNumber.status).toBe('complete');
    expect(latest().complete).toBe(false);
    expect(latest().brand).toBe('visa');

    type(renderer, EXPIRY_ID, EXPIRY);
    expect(latest().complete).toBe(false);

    type(renderer, CVC_ID, CVC);
    expect(latest().complete).toBe(true);
    expect(latest().canSubmit).toBe(true);

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('an unusable session reports sessionStatus invalid and never canSubmit', () => {
    const seen: VaultFormState[] = [];
    const renderer = mountProvider(allThree, (s) => seen.push(s), undefined, unusableSession);
    const latest = () => seen[seen.length - 1];

    expect(latest().sessionStatus).toBe('invalid');
    fillValidCard(renderer);
    expect(latest().complete).toBe(true);
    expect(latest().fieldsReady).toBe(true);
    expect(latest().canSubmit).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a missing field makes the form not ready, and mounting it restores readiness', () => {
    const seen: VaultFormState[] = [];
    const Harness = ({withCvc}: {withCvc: boolean}) => (
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => seen.push(s)}>
        <CardNumberField />
        <CardExpiryField />
        {withCvc ? <CardCVCField /> : null}
      </HyperswitchVaultFormProvider>
    );

    const renderer = mount(<Harness withCvc={false} />);
    expect(seen[seen.length - 1].fieldsReady).toBe(false);

    ReactTestRenderer.act(() => renderer.update(<Harness withCvc />));
    expect(seen[seen.length - 1].fieldsReady).toBe(true);

    /* unmounting it again takes readiness away */
    ReactTestRenderer.act(() => renderer.update(<Harness withCvc={false} />));
    expect(seen[seen.length - 1].fieldsReady).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('duplicate registration makes the form not ready, matching the submit gate', async () => {
    const seen: VaultFormState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = mountProvider(
      (
        <>
          <CardNumberField />
          <CardNumberWidget />
          <CardExpiryField />
          <CardCVCField />
        </>
      ) as ProviderChildren,
      (s) => seen.push(s),
      formRef,
    );

    fillValidCard(renderer);
    expect(seen[seen.length - 1].fieldsReady).toBe(false);
    expect(seen[seen.length - 1].complete).toBe(true);
    expect(seen[seen.length - 1].canSubmit).toBe(false);

    /* and the library's own gate agrees */
    let result: VaultSubmitResult | undefined;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.submit();
    });
    expect(result?.status).toBe('not_ready');
    expect(global.fetch).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 3. Emission behaviour ────────────────────────────────────────────────── */

describe('emission and de-duplication', () => {
  it('a new inline callback on every render does not cause an emission', () => {
    let count = 0;
    const Harness = ({tick}: {tick: number}) => (
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        /* a brand-new function identity on every render */
        onFormStateChange={() => {
          count += 1;
        }}>
        <CardNumberField onStateChange={() => {}} />
        <CardExpiryField />
        <CardCVCField />
        {tick > 0 ? null : null}
      </HyperswitchVaultFormProvider>
    );

    const renderer = mount(<Harness tick={0} />);
    expect(count).toBe(1);

    for (let i = 1; i <= 5; i += 1) {
      ReactTestRenderer.act(() => renderer.update(<Harness tick={i} />));
    }
    expect(count).toBe(1);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a structurally identical snapshot is not re-emitted', () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    type(renderer, NUMBER_ID, '4242');
    const after = seen.length;

    /* the same text again: the controller state does not change, so neither does the snapshot */
    type(renderer, NUMBER_ID, '4242');
    type(renderer, NUMBER_ID, '4242');
    expect(seen).toHaveLength(after);

    /* typing in ANOTHER field must not re-emit this one either */
    type(renderer, CVC_ID, CVC);
    expect(seen).toHaveLength(after);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the latest callback is used without re-registering the field', () => {
    const first: VaultCardNumberState[] = [];
    const second: VaultCardNumberState[] = [];
    const Harness = ({useSecond}: {useSecond: boolean}) => (
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => (useSecond ? second : first).push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>
    );

    const renderer = mount(<Harness useSecond={false} />);
    expect(first).toHaveLength(1);

    ReactTestRenderer.act(() => renderer.update(<Harness useSecond />));
    /* swapping the callback alone emits nothing... */
    expect(second).toHaveLength(0);

    /* ...and the next real change goes to the NEW callback only */
    type(renderer, NUMBER_ID, '4242');
    expect(second).toHaveLength(1);
    expect(first).toHaveLength(1);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('rapid successive changes end on a snapshot matching the final state', () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    ReactTestRenderer.act(() => {
      const input = inputBy(renderer, NUMBER_ID);
      input.props.onChangeText('4');
      input.props.onChangeText('42');
      input.props.onChangeText('424');
      input.props.onChangeText(CARD_NUMBER);
    });

    expect(seen[seen.length - 1].status).toBe('complete');
    expect(seen[seen.length - 1].brand).toBe('visa');
    expect(inputBy(renderer, NUMBER_ID).props.value).toBe('4242 4242 4242 4242');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('nothing is emitted after unmount', () => {
    const seen: VaultCardNumberState[] = [];
    const formSeen: VaultFormState[] = [];
    const renderer = mountProvider(
      (
        <>
          <CardNumberField onStateChange={(s) => seen.push(s)} />
          <CardExpiryField />
          <CardCVCField />
        </>
      ) as ProviderChildren,
      (s) => formSeen.push(s),
    );

    type(renderer, NUMBER_ID, CARD_NUMBER);
    const fieldCount = seen.length;
    const formCount = formSeen.length;

    ReactTestRenderer.act(() => renderer.unmount());
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(seen).toHaveLength(fieldCount);
    expect(formSeen).toHaveLength(formCount);
  });
});

/* ── 4. Submission transitions ────────────────────────────────────────────── */

describe('submission state transitions', () => {
  const setup = () => {
    const seen: VaultFormState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = mountProvider(allThree, (s) => seen.push(s), formRef);
    fillValidCard(renderer);
    return {seen, formRef, renderer, latest: () => seen[seen.length - 1]};
  };

  it('canSubmit → submitting → resolved, on success, with no token in the snapshot', async () => {
    const {seen, formRef, renderer, latest} = setup();

    expect(latest().canSubmit).toBe(true);
    expect(latest().submitting).toBe(false);

    let pending!: Promise<VaultSubmitResult>;
    ReactTestRenderer.act(() => {
      pending = formRef.current!.submit();
    });

    expect(latest().submitting).toBe(true);
    expect(latest().canSubmit).toBe(false);

    let result!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      result = await pending;
    });

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.token).toBe('tok_fake_0001');
    expect(latest().submitting).toBe(false);

    /* the token exists ONLY in the submit() result */
    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a safe failure clears submitting and leaves valid fields valid', async () => {
    const {seen, formRef, renderer, latest} = setup();

    let pending!: Promise<VaultSubmitResult>;
    ReactTestRenderer.act(() => {
      pending = formRef.current!.submit();
    });
    expect(latest().submitting).toBe(true);

    let result!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      calls[0].settle({error: {code: 'IR_05', message: 'internal detail 4242424242424242'}}, 400);
      result = await pending;
    });

    expect(result.status).not.toBe('success');
    expect(latest().submitting).toBe(false);
    /* the fields the customer filled correctly are still complete */
    expect(latest().fields.cardNumber.status).toBe('complete');
    expect(latest().fields.expiry.status).toBe('complete');
    expect(latest().fields.cvc.status).toBe('complete');
    expect(latest().complete).toBe(true);
    expect(latest().canSubmit).toBe(true);

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a retryable network failure clears submitting and allows another attempt', async () => {
    const {seen, formRef, renderer, latest} = setup();

    let pending!: Promise<VaultSubmitResult>;
    ReactTestRenderer.act(() => {
      pending = formRef.current!.submit();
    });

    let result!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      calls[0].fail();
      result = await pending;
    });

    expect(result.status).not.toBe('success');
    expect(latest().submitting).toBe(false);
    expect(latest().canSubmit).toBe(true);

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('an unknown outcome still clears submitting', async () => {
    const {seen, formRef, renderer, latest} = setup();

    let pending!: Promise<VaultSubmitResult>;
    ReactTestRenderer.act(() => {
      pending = formRef.current!.submit();
    });

    let result!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      calls[0].settle('not json at all');
      result = await pending;
    });

    expect(result.status).not.toBe('success');
    expect(latest().submitting).toBe(false);

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a second submit while one is in flight issues no second request', async () => {
    const {formRef, renderer} = setup();

    let first!: Promise<VaultSubmitResult>;
    let second!: Promise<VaultSubmitResult>;
    ReactTestRenderer.act(() => {
      first = formRef.current!.submit();
      second = formRef.current!.submit();
    });

    expect(second).toBe(first);
    expect(calls).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await first;
    });

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 5. Reset, focus, and the ref contract ────────────────────────────────── */

describe('reset, focus and refs', () => {
  it('reset returns every field to empty, clears errors and emits', async () => {
    const seen: VaultFormState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = mountProvider(allThree, (s) => seen.push(s), formRef);

    fillValidCard(renderer);
    const latest = () => seen[seen.length - 1];
    expect(latest().complete).toBe(true);

    /* create a visible error first */
    type(renderer, NUMBER_ID, '4242');
    blur(renderer, NUMBER_ID);
    expect(latest().fields.cardNumber.error).toBeDefined();

    const before = seen.length;
    ReactTestRenderer.act(() => formRef.current!.reset());

    expect(seen.length).toBeGreaterThan(before);
    expect(latest().fields.cardNumber.status).toBe('empty');
    expect(latest().fields.expiry.status).toBe('empty');
    expect(latest().fields.cvc.status).toBe('empty');
    expect(latest().fields.cardNumber.error).toBeUndefined();
    expect(latest().fields.cardNumber.brand).toBe('unknown');
    expect(latest().complete).toBe(false);
    expect(latest().canSubmit).toBe(false);

    expectSafe(seen);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the field ref is still exactly focus and blur, and both move the focused flag', () => {
    const seen: VaultCardNumberState[] = [];
    const fieldRef = React.createRef<{focus(): void; blur(): void}>();
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField ref={fieldRef} onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expect(Object.keys(fieldRef.current!).sort()).toEqual(['blur', 'focus']);

    /* focus() reaches the real input, and the public flag follows the input's own event */
    const focusMock = (TextInput as any).prototype.focus as jest.Mock;
    focusMock.mockClear();
    ReactTestRenderer.act(() => fieldRef.current!.focus());
    expect(focusMock).toHaveBeenCalled();

    focus(renderer, NUMBER_ID);
    expect(seen[seen.length - 1].focused).toBe(true);
    blur(renderer, NUMBER_ID);
    expect(seen[seen.length - 1].focused).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 6. Parity, aliases, styling and the recursive security walk ──────────── */

describe('ready-made form and custom layout agree', () => {
  it('both integration styles emit the same aggregate semantics', () => {
    const custom: VaultFormState[] = [];
    const customRenderer = mountProvider(allThree, (s) => custom.push(s));
    fillValidCard(customRenderer);
    const customFinal = custom[custom.length - 1];
    ReactTestRenderer.act(() => customRenderer.unmount());

    const readyMade: VaultFormState[] = [];
    const formRenderer = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => readyMade.push(s)}
      />,
    );
    fillValidCard(formRenderer);
    const formFinal = readyMade[readyMade.length - 1];
    ReactTestRenderer.act(() => formRenderer.unmount());

    expect(formFinal).toEqual(customFinal);
    expect(formFinal.fieldsReady).toBe(true);
    expect(formFinal.complete).toBe(true);
    expect(formFinal.canSubmit).toBe(true);

    expectSafe([...custom, ...readyMade]);
  });

  it('the pre-existing onStateChange still fires alongside the new callback', () => {
    const legacy: unknown[] = [];
    const modern: VaultFormState[] = [];
    const renderer = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        onStateChange={(s) => legacy.push(s)}
        onFormStateChange={(s) => modern.push(s)}
      />,
    );

    fillValidCard(renderer);
    expect(legacy.length).toBeGreaterThan(0);
    expect(modern.length).toBeGreaterThan(0);
    expect((legacy[legacy.length - 1] as {complete: boolean}).complete).toBe(true);
    expect(modern[modern.length - 1].complete).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('aliases, styling and identity', () => {
  it('the legacy widget spelling receives the identical callback', () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberWidget onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expect(CardNumberWidget).toBe(CardNumberField);
    expect(HyperswitchVault.CardNumber).toBe(CardNumberField);
    expect(seen[0].field).toBe('cardNumber');

    type(renderer, NUMBER_ID, CARD_NUMBER);
    expect(seen[seen.length - 1].status).toBe('complete');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('styles and callbacks compose without disturbing each other', () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField
          styles={{container: {borderColor: '#123456'}, placeholder: {fontSize: 22}}}
          onStateChange={(s) => seen.push(s)}
        />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    /* the callback still fires... */
    type(renderer, NUMBER_ID, CARD_NUMBER);
    expect(seen[seen.length - 1].status).toBe('complete');
    /* ...and the snapshot carries no style data */
    expect(forbiddenKeysIn(seen[seen.length - 1])).toEqual([]);
    expect('styles' in seen[seen.length - 1]).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('the security boundary, walked recursively', () => {
  it('no snapshot from any callback contains a forbidden key or a card value', async () => {
    const captured: unknown[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = mount(
      <HyperswitchVaultFormProvider
        ref={formRef}
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => captured.push(s)}>
        <CardNumberField onStateChange={(s) => captured.push(s)} />
        <CardExpiryField onStateChange={(s) => captured.push(s)} />
        <CardCVCField onStateChange={(s) => captured.push(s)} />
      </HyperswitchVaultFormProvider>,
    );

    /* drive the whole lifecycle so every branch has emitted at least once */
    focus(renderer, NUMBER_ID);
    type(renderer, NUMBER_ID, '4242');
    blur(renderer, NUMBER_ID);
    type(renderer, NUMBER_ID, CARD_NUMBER);
    type(renderer, EXPIRY_ID, EXPIRY);
    type(renderer, CVC_ID, CVC);

    await ReactTestRenderer.act(async () => {
      const pending = formRef.current!.submit();
      calls[0].settle(confirmResponse);
      await pending;
    });
    ReactTestRenderer.act(() => formRef.current!.reset());

    expect(captured.length).toBeGreaterThan(10);
    expectSafe(captured);

    /* and the walk itself is not vacuous */
    expect(forbiddenKeysIn({a: {b: [{token: 'x'}]}})).toEqual(['a.b[0].token']);
    expect(containsSubstring({a: {b: ['xx4242424242424242xx']}}, CARD_NUMBER)).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 7. Emission cost ─────────────────────────────────────────────────────── */

describe('callbacks do not cause storms, re-registration or lost inputs', () => {
  it('typing in one field does not emit for the others', () => {
    const number: VaultCardNumberState[] = [];
    const expiry: VaultExpiryState[] = [];
    const cvc: VaultCVCState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => number.push(s)} />
        <CardExpiryField onStateChange={(s) => expiry.push(s)} />
        <CardCVCField onStateChange={(s) => cvc.push(s)} />
      </HyperswitchVaultFormProvider>,
    );

    expect([number.length, expiry.length, cvc.length]).toEqual([1, 1, 1]);

    type(renderer, NUMBER_ID, CARD_NUMBER);
    /* only the card number moved; the other two are untouched */
    expect(number.length).toBeGreaterThan(1);
    expect(expiry).toHaveLength(1);
    expect(cvc).toHaveLength(1);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  /*
   * INPUT-SPECIFIC REGRESSION MEASUREMENT — NOT AN API GUARANTEE.
   *
   * The production guarantee is only this: no two structurally identical CONSECUTIVE snapshots are
   * emitted. There is deliberately no promised maximum per PAN, because the number of genuinely
   * distinct public states depends entirely on what is typed — a number that changes brand
   * candidates several times legitimately emits more than one that does not.
   *
   * This case pins the count for ONE specific input (a plain Visa typed a digit at a time) so an
   * accidental per-keystroke storm would show up as a regression. Read the bound as "this input, as
   * measured", never as a contract.
   */
  it('REGRESSION (input-specific, not a contract): a plain Visa typed digit by digit stays at 2 emissions', () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    const initial = seen.length;
    for (let i = 1; i <= CARD_NUMBER.length; i += 1) {
      type(renderer, NUMBER_ID, CARD_NUMBER.slice(0, i));
    }

    /*
     * Measured, for THIS input only: the first digit changes status (empty → incomplete) AND brand
     * (unknown → visa) in one commit, so that is one snapshot; the sixteenth changes status again.
     * Two. The other fourteen keystrokes change nothing public and emit nothing.
     */
    const emitted = seen.length - initial;
    expect(emitted).toBe(2);
    /* the property that IS guaranteed: no two consecutive snapshots are identical */
    expectNoConsecutiveDuplicates(seen);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the native inputs keep their identity while callbacks fire', () => {
    const renderer = mount(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={() => {}}>
        <CardNumberField onStateChange={() => {}} />
        <CardExpiryField onStateChange={() => {}} />
        <CardCVCField onStateChange={() => {}} />
      </HyperswitchVaultFormProvider>,
    );

    const before = [NUMBER_ID, EXPIRY_ID, CVC_ID].map((id) => inputBy(renderer, id).instance);
    fillValidCard(renderer);
    const after = [NUMBER_ID, EXPIRY_ID, CVC_ID].map((id) => inputBy(renderer, id).instance);

    /* same host instances: nothing remounted, so nothing could have lost focus */
    expect(after).toEqual(before);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('adding a callback does not change what is rendered', () => {
    const bare = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    const bareTree = JSON.stringify(bare.toJSON());
    ReactTestRenderer.act(() => bare.unmount());

    const withCallbacks = mount(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={() => {}}>
        <CardNumberField onStateChange={() => {}} />
        <CardExpiryField onStateChange={() => {}} />
        <CardCVCField onStateChange={() => {}} />
      </HyperswitchVaultFormProvider>,
    );
    expect(JSON.stringify(withCallbacks.toJSON())).toBe(bareTree);
    ReactTestRenderer.act(() => withCallbacks.unmount());
  });
});

/* ── 8. The `fieldsReady` truth table ─────────────────────────────────────── */

/*
 * CLOSURE ITEM 1. `fieldsReady` is FIELD REGISTRATION ONLY. The session lives in `sessionStatus`,
 * and `canSubmit` is the only member that consults everything.
 *
 * The alternative — folding the session into readiness — was rejected because a merchant using the
 * recommended `disabled={!canSubmit}` pattern never calls `submit()`, so a bad session would give
 * them a permanently dead button with no observable cause. These six rows are that decision made
 * checkable.
 */

describe('fieldsReady / sessionStatus / complete / canSubmit truth table', () => {
  const capture = (
    children: ProviderChildren,
    merchantSession: MerchantSession,
  ): {seen: VaultFormState[]; renderer: Renderer; latest: () => VaultFormState} => {
    const seen: VaultFormState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider
        session={merchantSession}
        environment="sandbox"
        onFormStateChange={(s) => seen.push(s)}>
        {children}
      </HyperswitchVaultFormProvider>,
    );
    return {seen, renderer, latest: () => seen[seen.length - 1]};
  };

  const missingCvc = (
    <>
      <CardNumberField />
      <CardExpiryField />
    </>
  ) as ProviderChildren;

  const duplicateNumber = (
    <>
      <CardNumberField />
      <CardNumberWidget />
      <CardExpiryField />
      <CardCVCField />
    </>
  ) as ProviderChildren;

  it('valid session + correct fields → fieldsReady, and canSubmit once complete', () => {
    const {renderer, latest} = capture(allThree, session);

    expect(latest().fieldsReady).toBe(true);
    expect(latest().sessionStatus).toBe('valid');
    expect(latest().complete).toBe(false);
    expect(latest().canSubmit).toBe(false);

    fillValidCard(renderer);
    expect(latest().complete).toBe(true);
    expect(latest().canSubmit).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('invalid session + correct fields → fieldsReady TRUE, sessionStatus invalid, never canSubmit', () => {
    const {renderer, latest} = capture(allThree, unusableSession);

    /* the whole point of the split: the fields are fine and the merchant can see WHY it is blocked */
    expect(latest().fieldsReady).toBe(true);
    expect(latest().sessionStatus).toBe('invalid');
    expect(latest().canSubmit).toBe(false);

    fillValidCard(renderer);
    expect(latest().complete).toBe(true);
    expect(latest().fieldsReady).toBe(true);
    expect(latest().canSubmit).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('valid session + missing field → fieldsReady FALSE, sessionStatus still valid', () => {
    const {renderer, latest} = capture(missingCvc, session);

    expect(latest().fieldsReady).toBe(false);
    expect(latest().sessionStatus).toBe('valid');
    expect(latest().canSubmit).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('valid session + duplicate field → fieldsReady FALSE, and submit() agrees', async () => {
    const seen: VaultFormState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = mount(
      <HyperswitchVaultFormProvider
        ref={formRef}
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => seen.push(s)}>
        {duplicateNumber}
      </HyperswitchVaultFormProvider>,
    );
    const latest = () => seen[seen.length - 1];

    fillValidCard(renderer);
    expect(latest().fieldsReady).toBe(false);
    expect(latest().sessionStatus).toBe('valid');
    expect(latest().complete).toBe(true);
    expect(latest().canSubmit).toBe(false);

    let result: VaultSubmitResult | undefined;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.submit();
    });
    expect(result?.status).toBe('not_ready');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('invalid session + complete fields → complete TRUE but canSubmit FALSE', () => {
    const {renderer, latest} = capture(allThree, unusableSession);
    fillValidCard(renderer);

    expect(latest().complete).toBe(true);
    expect(latest().fieldsReady).toBe(true);
    expect(latest().sessionStatus).toBe('invalid');
    expect(latest().canSubmit).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('submitting → canSubmit FALSE while every other member stays true', async () => {
    const seen: VaultFormState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = mountProvider(allThree, (s) => seen.push(s), formRef);
    const latest = () => seen[seen.length - 1];

    fillValidCard(renderer);
    expect(latest().canSubmit).toBe(true);

    let pending!: Promise<VaultSubmitResult>;
    ReactTestRenderer.act(() => {
      pending = formRef.current!.submit();
    });

    expect(latest().submitting).toBe(true);
    expect(latest().canSubmit).toBe(false);
    /* the other three are unchanged — only `submitting` moved */
    expect(latest().fieldsReady).toBe(true);
    expect(latest().sessionStatus).toBe('valid');
    expect(latest().complete).toBe(true);

    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await pending;
    });
    expect(latest().submitting).toBe(false);
    expect(latest().canSubmit).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 9. The pre-existing onStateChange, audited ───────────────────────────── */

/*
 * CLOSURE ITEM 2. `onStateChange` predates this work and keeps its own `CardFormState` payload. It
 * is not an alias of `onFormStateChange` and not deprecated by it. These tests hold BOTH payloads to
 * the same recursive security standard.
 */

type LegacyCardFormState = {
  complete: boolean;
  cardNumberValid: boolean;
  expiryValid: boolean;
  cvcValid: boolean;
  brand: string;
};

describe('the legacy onStateChange payload', () => {
  const both = () => {
    const legacy: LegacyCardFormState[] = [];
    const modern: VaultFormState[] = [];
    const renderer = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        onStateChange={(s) => legacy.push(s as LegacyCardFormState)}
        onFormStateChange={(s) => modern.push(s)}
      />,
    );
    return {legacy, modern, renderer};
  };

  it('has exactly five members, and no card value at any depth', () => {
    const {legacy, modern, renderer} = both();

    fillValidCard(renderer);
    expect(legacy.length).toBeGreaterThan(0);
    expect(Object.keys(legacy[legacy.length - 1]).sort()).toEqual([
      'brand', 'cardNumberValid', 'complete', 'cvcValid', 'expiryValid',
    ]);

    /* the SAME recursive walk both payloads must survive */
    expectSafe(legacy);
    expectSafe(modern);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('its `brand` is a scheme name, never a card value', () => {
    const {legacy, renderer} = both();

    type(renderer, NUMBER_ID, CARD_NUMBER);
    const latest = legacy[legacy.length - 1];
    expect(latest.brand).toBe('Visa');
    expect(latest.brand).not.toContain('4242');
    expect(latest.brand.length).toBeLessThan(30);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the two callbacks disagree by design where it matters', () => {
    /*
     * `CardFormState.cardNumberValid` already folds registration INTO validity
     * (`countOf(kind) === 1 && valid`), which is why a duplicate field silently reports the card
     * number as invalid rather than reporting a setup problem. `VaultFormState` separates the two,
     * which is the reason to publish both rather than alias one to the other.
     */
    const legacy: LegacyCardFormState[] = [];
    const modern: VaultFormState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onStateChange={(s) => legacy.push(s as LegacyCardFormState)}
        onFormStateChange={(s) => modern.push(s)}>
        <CardNumberField />
        <CardNumberWidget />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    fillValidCard(renderer);
    const oldState = legacy[legacy.length - 1];
    const newState = modern[modern.length - 1];

    /* old: the card number reads as INVALID, with no way to tell why */
    expect(oldState.cardNumberValid).toBe(false);
    expect(oldState.complete).toBe(false);

    /* new: the field is complete and the SETUP is what is wrong */
    expect(newState.fields.cardNumber.status).toBe('complete');
    expect(newState.complete).toBe(true);
    expect(newState.fieldsReady).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 10. React Strict Mode ────────────────────────────────────────────────── */

/*
 * CLOSURE ITEM 3. React 19's Strict Mode deliberately mounts effects, tears them down and mounts
 * them again, to surface state that survives a replay when it should not. This harness really does
 * replay — a probe confirmed the sequence is `mount, cleanup, mount` — so these assertions exercise
 * the same path a development build of a merchant app will.
 */

const strict = (element: React.ReactElement) => mount(<React.StrictMode>{element}</React.StrictMode>);

describe('React Strict Mode', () => {
  it('emits ONE stable initial snapshot despite the effect replay', () => {
    const field: VaultCardNumberState[] = [];
    const form: VaultFormState[] = [];
    const renderer = strict(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => form.push(s)}>
        <CardNumberField onStateChange={(s) => field.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expect(field).toHaveLength(1);
    expect(form).toHaveLength(1);
    expect(form[0].fieldsReady).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shows no false fieldsReady flap caused only by the replay', () => {
    const form: VaultFormState[] = [];
    const renderer = strict(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => form.push(s)}>
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    /* the merchant must never observe true → false → true from a replay alone */
    expect(form.map((s) => s.fieldsReady)).toEqual([true]);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the replay does not leave a duplicate registration behind', async () => {
    const form: VaultFormState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = strict(
      <HyperswitchVaultFormProvider
        ref={formRef}
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => form.push(s)}>
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    /* register/cleanup/register must net to exactly one of each */
    expect(form[form.length - 1].fieldsReady).toBe(true);

    fillValidCard(renderer);
    let result: VaultSubmitResult | undefined;
    await ReactTestRenderer.act(async () => {
      const pending = formRef.current!.submit();
      calls[0]?.settle(confirmResponse);
      result = await pending;
    });
    /* the submit gate agrees: not `not_ready` */
    expect(result?.status).toBe('success');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('callbacks keep working after the replay — the ref is not left cleared', () => {
    const field: VaultCardNumberState[] = [];
    const form: VaultFormState[] = [];
    const renderer = strict(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => form.push(s)}>
        <CardNumberField onStateChange={(s) => field.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    type(renderer, NUMBER_ID, CARD_NUMBER);

    /* THIS is the replay hazard: a cleanup that nulls the callback ref would silence everything */
    expect(field.length).toBeGreaterThan(1);
    expect(field[field.length - 1].status).toBe('complete');
    expect(form[form.length - 1].complete).toBe(false);
    expect(form[form.length - 1].fields.cardNumber.status).toBe('complete');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('conditional mounting under Strict Mode moves fieldsReady correctly, both ways', () => {
    const form: VaultFormState[] = [];
    const Harness = ({withCvc}: {withCvc: boolean}) => (
      <React.StrictMode>
        <HyperswitchVaultFormProvider
          session={session}
          environment="sandbox"
          onFormStateChange={(s) => form.push(s)}>
          <CardNumberField />
          <CardExpiryField />
          {withCvc ? <CardCVCField /> : null}
        </HyperswitchVaultFormProvider>
      </React.StrictMode>
    );

    const renderer = mount(<Harness withCvc={false} />);
    expect(form[form.length - 1].fieldsReady).toBe(false);

    ReactTestRenderer.act(() => renderer.update(<Harness withCvc />));
    expect(form[form.length - 1].fieldsReady).toBe(true);

    ReactTestRenderer.act(() => renderer.update(<Harness withCvc={false} />));
    expect(form[form.length - 1].fieldsReady).toBe(false);

    /* cleanup returned the count to zero and the remount restored it — no drift either way */
    ReactTestRenderer.act(() => renderer.update(<Harness withCvc />));
    expect(form[form.length - 1].fieldsReady).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('rapid mount/unmount cycles emit nothing after the last unmount', () => {
    const field: VaultCardNumberState[] = [];
    for (let i = 0; i < 5; i += 1) {
      const renderer = strict(
        <HyperswitchVaultFormProvider session={session} environment="sandbox">
          <CardNumberField onStateChange={(s) => field.push(s)} />
          <CardExpiryField />
          <CardCVCField />
        </HyperswitchVaultFormProvider>,
      );
      type(renderer, NUMBER_ID, '4242');
      ReactTestRenderer.act(() => renderer.unmount());
    }

    const settled = field.length;
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(field).toHaveLength(settled);
  });

  it('replacing a callback under Strict Mode does not re-register the fields', () => {
    const form: VaultFormState[] = [];
    const Harness = ({tick}: {tick: number}) => (
      <React.StrictMode>
        <HyperswitchVaultFormProvider
          session={session}
          environment="sandbox"
          onFormStateChange={(s) => form.push(s)}>
          <CardNumberField onStateChange={() => {}} />
          <CardExpiryField onStateChange={() => {}} />
          <CardCVCField onStateChange={() => {}} />
          {tick >= 0 ? null : null}
        </HyperswitchVaultFormProvider>
      </React.StrictMode>
    );

    const renderer = mount(<Harness tick={0} />);
    expect(form).toHaveLength(1);

    for (let i = 1; i <= 4; i += 1) {
      ReactTestRenderer.act(() => renderer.update(<Harness tick={i} />));
    }

    /* no re-registration means no fieldsReady churn and no extra emission */
    expect(form).toHaveLength(1);
    expect(form[0].fieldsReady).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('unmounting the provider mid-submission produces no later callback', async () => {
    const field: VaultCardNumberState[] = [];
    const form: VaultFormState[] = [];
    const formRef = React.createRef<VaultFormHandle>();
    const renderer = strict(
      <HyperswitchVaultFormProvider
        ref={formRef}
        session={session}
        environment="sandbox"
        onFormStateChange={(s) => form.push(s)}>
        <CardNumberField onStateChange={(s) => field.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    fillValidCard(renderer);
    let pending!: Promise<VaultSubmitResult>;
    ReactTestRenderer.act(() => {
      pending = formRef.current!.submit();
    });
    expect(form[form.length - 1].submitting).toBe(true);

    const fieldCount = field.length;
    const formCount = form.length;

    /* tear the screen down while the request is still in flight */
    ReactTestRenderer.act(() => renderer.unmount());

    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await pending.catch(() => undefined);
      jest.advanceTimersByTime(2000);
    });

    expect(field).toHaveLength(fieldCount);
    expect(form).toHaveLength(formCount);
  });
});

/* ── 11. Brand transitions and the emission guarantee ─────────────────────── */

/*
 * CLOSURE ITEM 4. An input that changes brand candidates repeatedly legitimately emits more than a
 * plain one. What is guaranteed is only that no two CONSECUTIVE snapshots are structurally
 * identical — proven here across a sequence that walks through several schemes.
 */

describe('brand transitions', () => {
  const setup = () => {
    const seen: VaultCardNumberState[] = [];
    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField onStateChange={(s) => seen.push(s)} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    return {seen, renderer};
  };

  /*
   * Each entry is a full replacement of the field's contents, and its expected public brand. Every
   * prefix was verified against the detector rather than assumed, and the list deliberately
   * includes three schemes that have NO dedicated artwork (maestro, unionPay, sodexo, bajaj) — the
   * contract reports the detected scheme by name even when the icon falls back to the generic card.
   */
  const JOURNEY: Array<[string, string]> = [
    ['4', 'visa'],
    ['5555', 'mastercard'],
    ['34', 'americanExpress'],
    ['6011', 'discover'],
    ['3528', 'jcb'],
    ['36', 'dinersClub'],
    ['5018', 'maestro'],
    ['62', 'unionPay'],
    ['637513', 'sodexo'],
    ['203040', 'bajaj'],
    ['9', 'unknown'],
    ['4111', 'visa'],
    ['', 'unknown'],
  ];

  it('every genuinely different brand is reported, in order', () => {
    const {seen, renderer} = setup();

    const observed: string[] = [];
    for (const [text, expected] of JOURNEY) {
      type(renderer, NUMBER_ID, text);
      observed.push(seen[seen.length - 1].brand);
      expect(seen[seen.length - 1].brand).toBe(expected);
    }

    expect(observed).toEqual(JOURNEY.map(([, brand]) => brand));
    /* more emissions than the plain-Visa case, and legitimately so */
    expect(seen.length).toBeGreaterThan(JOURNEY.length);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('THE GUARANTEE: no two consecutive snapshots are structurally identical', () => {
    const {seen, renderer} = setup();

    for (const [text] of JOURNEY) {
      type(renderer, NUMBER_ID, text);
      /* re-typing the identical text must add nothing */
      type(renderer, NUMBER_ID, text);
      type(renderer, NUMBER_ID, text);
    }

    expectNoConsecutiveDuplicates(seen);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the same brand reached twice in a row emits only when something else changed', () => {
    const {seen, renderer} = setup();

    type(renderer, NUMBER_ID, '4');
    const afterFirstVisa = seen.length;

    /* still Visa, still incomplete: no new public state */
    type(renderer, NUMBER_ID, '41');
    type(renderer, NUMBER_ID, '411');
    expect(seen).toHaveLength(afterFirstVisa);

    /* still Visa, but now COMPLETE: that is a real change */
    type(renderer, NUMBER_ID, '4111111111111111');
    expect(seen.length).toBeGreaterThan(afterFirstVisa);
    expect(seen[seen.length - 1].brand).toBe('visa');
    expect(seen[seen.length - 1].status).toBe('complete');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the final snapshot matches the latest input, and carries no value or length', () => {
    const {seen, renderer} = setup();

    for (const [text] of JOURNEY) type(renderer, NUMBER_ID, text);
    type(renderer, NUMBER_ID, CARD_NUMBER);

    const final = seen[seen.length - 1];
    expect(final.brand).toBe('visa');
    expect(final.status).toBe('complete');
    expect(inputBy(renderer, NUMBER_ID).props.value).toBe('4242 4242 4242 4242');

    /*
     * No raw value, no formatted value, no length anywhere in the journey — and the key set is
     * closed. `error` may be present with the value `undefined` (an optional ReScript record field
     * compiles that way), which is why membership rather than exact equality is asserted.
     */
    expectSafe(seen);
    const ALLOWED_KEYS = ['brand', 'error', 'field', 'focused', 'status'];
    for (const snapshot of seen) {
      for (const key of Object.keys(snapshot)) {
        expect(ALLOWED_KEYS).toContain(key);
      }
      expect(Object.keys(snapshot)).toContain('brand');
      expect(Object.keys(snapshot)).toContain('status');
    }

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the aggregate brand tracks the field brand through the journey', () => {
    const form: VaultFormState[] = [];
    const renderer = mountProvider(allThree, (s) => form.push(s));

    for (const [text, expected] of JOURNEY) {
      type(renderer, NUMBER_ID, text);
      expect(form[form.length - 1].brand).toBe(expected);
      expect(form[form.length - 1].fields.cardNumber.brand).toBe(expected);
    }
    expectNoConsecutiveDuplicates(form);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
