/**
 * Behaviour contract for <HyperswitchVaultFormProvider /> + the card widgets (ADR-0001, CP2).
 *
 * Rendered from the PUBLISHED package (resolved by name through its `exports` map) with the real
 * React Native jest preset. `fetch` is stubbed exactly as in vaultFormLifecycle.test.tsx: no
 * network call is made and no real credential exists anywhere in this file.
 *
 * @format
 */
import React from 'react';
import {TextInput, View} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVaultFormProvider,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type HyperswitchVaultFormHandle,
  type WidgetHandle,
  type CardFormState,
  type MerchantSession,
  type VaultSubmitResult,
} from '@juspay-tech/react-native-hyperswitch-vault';

declare const global: {fetch: unknown};

/* ── Fixtures (mirrors vaultFormLifecycle.test.tsx) ──────────────────────── */

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

const fakeAuthorization = (sessionId: string) =>
  toBase64(
    [
      'publishable_key=pk_snd_EXAMPLE_FAKE',
      `payment_method_session_id=${sessionId}`,
      'profile_id=pro_EXAMPLE_FAKE',
    ].join(','),
  );

const sessionWith = (sessionId: string): MerchantSession => ({
  session_token: [],
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {sdk_authorization: fakeAuthorization(sessionId)},
  },
});

const CARD_NUMBER = '4242424242424242';
const EXPIRY = `12${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;
const CVC = '123';

const confirmResponse = {
  associated_payment_methods: [{payment_method_token: {data: 'tok_fake_0001'}}],
  payment_method_data: {
    card: {last4_digits: '4242', card_isin: '424242', expiry_month: '12', expiry_year: '2030'},
  },
};

/* ── fetch stub ──────────────────────────────────────────────────────────── */

type Call = {
  url: string;
  options: any;
  settle: (body: unknown, status?: number) => void;
  aborted: () => boolean;
};

let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  (global as any).fetch = jest.fn((url: string, options: any) => {
    let settle: (body: unknown, status?: number) => void = () => {};
    const promise = new Promise((resolve, reject) => {
      settle = (body, status = 200) =>
        resolve({ok: status >= 200 && status < 300, status, json: async () => body});
      options?.signal?.addEventListener('abort', () => {
        const error: Error & {name?: string} = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
    calls.push({
      url,
      options,
      settle: (body, status) => settle(body, status),
      aborted: () => options?.signal?.aborted === true,
    });
    return promise;
  });
});

/* ── Focus/blur observation ──────────────────────────────────────────────────
 *
 * The React Native jest preset mocks TextInput as a class whose focus/blur are SHARED jest.fn()s
 * on the prototype (MockNativeMethods). Which input a call targeted is recovered from
 * `mock.contexts` — the `this` of each call — matched against the class instance that carries the
 * wanted testID.
 */
const focusMock = (TextInput as any).prototype.focus as jest.Mock;
const blurMock = (TextInput as any).prototype.blur as jest.Mock;

beforeEach(() => {
  focusMock.mockClear();
  blurMock.mockClear();
});

const instanceOf = (tree: Renderer, testID: string) =>
  tree.root.findAll(node => node.props?.testID === testID && node.instance != null)[0]?.instance;

const focusCallsOn = (tree: Renderer, testID: string) =>
  focusMock.mock.contexts.filter(context => context === instanceOf(tree, testID)).length;

const blurCallsOn = (tree: Renderer, testID: string) =>
  blurMock.mock.contexts.filter(context => context === instanceOf(tree, testID)).length;

/* ── Render helpers ──────────────────────────────────────────────────────── */

const mounted: Renderer[] = [];
afterEach(async () => {
  for (const tree of mounted.splice(0)) {
    try {
      await ReactTestRenderer.act(() => {
        tree.unmount();
      });
    } catch {
      /* already unmounted */
    }
  }
});

type HarnessProps = {
  showNumber?: boolean;
  showExpiry?: boolean;
  showCvc?: boolean;
  duplicate?: 'number' | 'expiry' | 'cvc' | null;
  session?: MerchantSession;
  onState?: (state: CardFormState) => void;
  formRef?: React.RefObject<HyperswitchVaultFormHandle | null>;
  numberRef?: React.RefObject<WidgetHandle | null>;
  strict?: boolean;
};

/* Widgets are deliberately nested in merchant-owned Views and a fragment. */
function Layout(props: HarnessProps) {
  const {showNumber = true, showExpiry = true, showCvc = true, duplicate = null} = props;
  return (
    <HyperswitchVaultFormProvider
      ref={props.formRef}
      session={props.session ?? sessionWith('pms_fake_0001')}
      environment="sandbox"
      onStateChange={props.onState}>
      <View>
        {showNumber && <CardNumberWidget ref={props.numberRef} />}
        {duplicate === 'number' && <CardNumberWidget />}
      </View>
      <>
        <View>
          {showExpiry && <CardExpiryWidget />}
          {duplicate === 'expiry' && <CardExpiryWidget />}
          {showCvc && <CardCVCWidget />}
          {duplicate === 'cvc' && <CardCVCWidget />}
        </View>
      </>
    </HyperswitchVaultFormProvider>
  );
}

type MountedHarness = {
  tree: Renderer;
  ref: React.RefObject<HyperswitchVaultFormHandle | null>;
  states: CardFormState[];
  update: (props: HarnessProps) => Promise<void>;
};

const mountHarness = async (props: HarnessProps = {}): Promise<MountedHarness> => {
  const ref = React.createRef<HyperswitchVaultFormHandle>();
  const states: CardFormState[] = [];
  const onState = (state: CardFormState) => {
    states.push(state);
    props.onState?.(state);
  };
  const element = (extra: HarnessProps) => {
    const merged = {...props, ...extra, formRef: ref, onState};
    return merged.strict ? (
      <React.StrictMode>
        <Layout {...merged} />
      </React.StrictMode>
    ) : (
      <Layout {...merged} />
    );
  };
  let tree!: Renderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(element({}));
  });
  mounted.push(tree);
  return {
    tree,
    ref,
    states,
    update: async extra => {
      await ReactTestRenderer.act(() => {
        tree.update(element(extra));
      });
    },
  };
};

const input = (tree: Renderer, testID: string) =>
  tree.root.findAll(
    node => node.props?.testID === testID && typeof node.props?.onChangeText === 'function',
  )[0];

const type = async (tree: Renderer, testID: string, text: string) => {
  await ReactTestRenderer.act(() => {
    input(tree, testID).props.onChangeText(text);
  });
};

const fillValidCard = async (tree: Renderer) => {
  await type(tree, 'CardNumberInputTestId', CARD_NUMBER);
  await type(tree, 'ExpiryInputTestId', EXPIRY);
  await type(tree, 'CVCInputTestId', CVC);
};

const pressKey = async (tree: Renderer, testID: string, key: string) => {
  await ReactTestRenderer.act(() => {
    input(tree, testID).props.onKeyPress({nativeEvent: {key}});
  });
};

const submit = async (ref: React.RefObject<HyperswitchVaultFormHandle | null>) => {
  let result!: VaultSubmitResult;
  await ReactTestRenderer.act(async () => {
    result = await ref.current!.submit();
  });
  return result;
};

const last = (states: CardFormState[]) => states[states.length - 1];

/* ── 1–2, 14: happy path, one request, token, shared promise ─────────────── */

describe('submission through the provider', () => {
  it('submits ONE PMS-confirm request when all three widgets are mounted and valid, and returns the token', async () => {
    const {tree, ref, states} = await mountHarness();
    await fillValidCard(tree);
    expect(last(states).complete).toBe(true);

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/payment-method-sessions/pms_fake_0001/confirm');

    let result!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      result = await pending;
    });
    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.token).toBe('tok_fake_0001');

    /* 17: nothing sensitive in the result or the emitted states. */
    const serialized = JSON.stringify({result, states});
    expect(serialized).not.toContain(CARD_NUMBER);
    expect(serialized).not.toContain(fakeAuthorization('pms_fake_0001'));
    expect(serialized).not.toContain('pms_fake_0001');
    for (const state of states) {
      expect(Object.keys(state).sort()).toEqual(
        ['brand', 'cardNumberValid', 'complete', 'cvcValid', 'expiryValid'].sort(),
      );
    }
  });

  it('repeated submit while in flight returns the same promise and issues one request', async () => {
    const {tree, ref} = await mountHarness();
    await fillValidCard(tree);

    let first!: Promise<VaultSubmitResult>;
    let second!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      first = ref.current!.submit();
      second = ref.current!.submit();
    });
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await first;
    });
    expect((await first).status).toBe('success');
  });
});

/* ── 3, 6: presence gating ───────────────────────────────────────────────── */

describe('widget presence gating', () => {
  it.each([
    ['CardNumberWidget', {showNumber: false}],
    ['CardExpiryWidget', {showExpiry: false}],
    ['CardCVCWidget', {showCvc: false}],
  ] as const)('missing %s -> not_ready naming it, zero fetches', async (name, props) => {
    const {ref, states} = await mountHarness(props);
    const result = await submit(ref);
    expect(result.status).toBe('not_ready');
    expect(result.status === 'not_ready' && result.error.message).toContain(name);
    expect(calls).toHaveLength(0);
    expect(last(states).complete).toBe(false);
  });

  it.each([
    ['CardNumberWidget', 'number'],
    ['CardExpiryWidget', 'expiry'],
    ['CardCVCWidget', 'cvc'],
  ] as const)('duplicate %s -> not_ready, zero fetches, nothing logged', async (name, kind) => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const {tree, ref, states} = await mountHarness({duplicate: kind});
      await fillValidCard(tree);
      const result = await submit(ref);
      expect(result.status).toBe('not_ready');
      expect(result.status === 'not_ready' && result.error.message).toContain(name);
      expect(result.status === 'not_ready' && result.error.message).toContain('Only one');
      expect(calls).toHaveLength(0);
      expect(last(states).complete).toBe(false);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

/* ── 4, 5, 10: unmount + stale values + aggregate ────────────────────────── */

describe('unmount and the aggregate state', () => {
  it('unmounting a valid CVC widget immediately emits complete=false, submit is not_ready, and the retained value is never sent', async () => {
    const {tree, ref, states, update} = await mountHarness();
    await fillValidCard(tree);
    expect(last(states).complete).toBe(true);
    expect(last(states).cvcValid).toBe(true);

    await update({showCvc: false});
    expect(last(states).complete).toBe(false);
    expect(last(states).cvcValid).toBe(false);

    const result = await submit(ref);
    expect(result.status).toBe('not_ready');
    expect(calls).toHaveLength(0);
  });

  it('aggregate state tracks per-field validity as fields are filled', async () => {
    const {tree, states} = await mountHarness();
    expect(last(states).complete).toBe(false);

    await type(tree, 'CardNumberInputTestId', CARD_NUMBER);
    expect(last(states).cardNumberValid).toBe(true);
    expect(last(states).complete).toBe(false);
    expect(last(states).brand).toBe('Visa');

    await type(tree, 'ExpiryInputTestId', EXPIRY);
    expect(last(states).expiryValid).toBe(true);

    await type(tree, 'CVCInputTestId', CVC);
    expect(last(states)).toEqual({
      complete: true,
      cardNumberValid: true,
      expiryValid: true,
      cvcValid: true,
      brand: 'Visa',
    });
  });
});

/* ── 7: outside-provider throw ───────────────────────────────────────────── */

describe('placement errors', () => {
  it('a widget outside HyperswitchVaultFormProvider throws an actionable error', () => {
    /* React 19 delivers render errors to the nearest boundary rather than throwing at the root. */
    let caught: Error | null = null;
    class Boundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
      state = {failed: false};
      static getDerivedStateFromError() {
        return {failed: true};
      }
      componentDidCatch(error: Error) {
        caught = error;
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    }
    /* React logs the render error itself; silence only that expected noise. */
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      ReactTestRenderer.act(() => {
        const tree = ReactTestRenderer.create(
          <Boundary>
            <CardNumberWidget />
          </Boundary>,
        );
        mounted.push(tree);
      });
    } finally {
      errorSpy.mockRestore();
    }
    expect(String(caught)).toMatch(
      /CardNumberWidget must be rendered inside a <HyperswitchVaultFormProvider>/,
    );
  });
});

/* ── 8: multiple providers ───────────────────────────────────────────────── */

describe('multiple providers on one screen', () => {
  it('keeps registration and card state isolated', async () => {
    const refA = React.createRef<HyperswitchVaultFormHandle>();
    const refB = React.createRef<HyperswitchVaultFormHandle>();
    const statesB: CardFormState[] = [];
    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <View>
          <HyperswitchVaultFormProvider
            ref={refA}
            session={sessionWith('pms_fake_000A')}
            environment="sandbox">
            <CardNumberWidget />
            <CardExpiryWidget />
            <CardCVCWidget />
          </HyperswitchVaultFormProvider>
          <HyperswitchVaultFormProvider
            ref={refB}
            session={sessionWith('pms_fake_000B')}
            environment="sandbox"
            onStateChange={state => statesB.push(state)}>
            <CardNumberWidget />
            <CardExpiryWidget />
            <CardCVCWidget />
          </HyperswitchVaultFormProvider>
        </View>,
      );
    });
    mounted.push(tree);

    /* Fill only provider A (its inputs come first in the tree). */
    const inputsOf = (testID: string) =>
      tree.root.findAll(
        node => node.props?.testID === testID && typeof node.props?.onChangeText === 'function',
      );
    await ReactTestRenderer.act(() => {
      inputsOf('CardNumberInputTestId')[0].props.onChangeText(CARD_NUMBER);
    });
    await ReactTestRenderer.act(() => {
      inputsOf('ExpiryInputTestId')[0].props.onChangeText(EXPIRY);
    });
    await ReactTestRenderer.act(() => {
      inputsOf('CVCInputTestId')[0].props.onChangeText(CVC);
    });

    /* B has all three widgets mounted but no values: validation error, not a presence failure. */
    let resultB!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      resultB = await refB.current!.submit();
    });
    expect(resultB.status).toBe('validation_error');
    expect(statesB.every(state => state.complete === false)).toBe(true);
    expect(calls).toHaveLength(0);

    /* A submits its own card to its own session. */
    let pendingA!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pendingA = refA.current!.submit();
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('pms_fake_000A');
    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await pendingA;
    });
    expect((await pendingA).status).toBe('success');
  });
});

/* ── 9: StrictMode ───────────────────────────────────────────────────────── */

describe('React StrictMode', () => {
  it('effect replay creates no false duplicates and submission works', async () => {
    const {tree, ref, states} = await mountHarness({strict: true});
    await fillValidCard(tree);
    expect(last(states).complete).toBe(true);

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    expect(calls).toHaveLength(1);
    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await pending;
    });
    expect((await pending).status).toBe('success');
  });
});

/* ── 11, 12: focus behaviour ─────────────────────────────────────────────── */

describe('focus behaviour', () => {
  it('WidgetHandle.focus()/blur() and formRef.focus(field) drive the right inputs', async () => {
    const numberRef = React.createRef<WidgetHandle>();
    const {tree, ref} = await mountHarness({numberRef});

    await ReactTestRenderer.act(() => {
      numberRef.current!.focus();
    });
    expect(focusCallsOn(tree, 'CardNumberInputTestId')).toBe(1);

    await ReactTestRenderer.act(() => {
      numberRef.current!.blur();
    });
    expect(blurCallsOn(tree, 'CardNumberInputTestId')).toBe(1);

    await ReactTestRenderer.act(() => {
      ref.current!.focus('cvc');
    });
    expect(focusCallsOn(tree, 'CVCInputTestId')).toBe(1);

    await ReactTestRenderer.act(() => {
      ref.current!.focus('expiry');
    });
    expect(focusCallsOn(tree, 'ExpiryInputTestId')).toBe(1);
    expect(focusCallsOn(tree, 'CardNumberInputTestId')).toBe(1);
  });

  it('auto-advance stays semantic across the merchant layout: number -> expiry -> cvc', async () => {
    const {tree} = await mountHarness();

    await type(tree, 'CardNumberInputTestId', CARD_NUMBER);
    expect(focusCallsOn(tree, 'ExpiryInputTestId')).toBe(1);

    await type(tree, 'ExpiryInputTestId', EXPIRY);
    expect(focusCallsOn(tree, 'CVCInputTestId')).toBe(1);
  });

  it('auto-advance is a no-op when the next widget is not mounted', async () => {
    const {tree} = await mountHarness({showExpiry: false});
    await type(tree, 'CardNumberInputTestId', CARD_NUMBER);
    /* No expiry widget: nothing to focus, nothing thrown. */
    expect(focusMock).not.toHaveBeenCalled();
  });

  it('empty-field backspace navigates cvc -> expiry -> number, and number blurs itself', async () => {
    const {tree} = await mountHarness();

    await pressKey(tree, 'CVCInputTestId', 'Backspace');
    expect(focusCallsOn(tree, 'ExpiryInputTestId')).toBe(1);

    await pressKey(tree, 'ExpiryInputTestId', 'Backspace');
    expect(focusCallsOn(tree, 'CardNumberInputTestId')).toBe(1);

    await pressKey(tree, 'CardNumberInputTestId', 'Backspace');
    expect(blurCallsOn(tree, 'CardNumberInputTestId')).toBe(1);
  });
});

/* ── Approved correction: canonical expiry survives remount ──────────────── */

describe('expiry is canonical in the controller', () => {
  /*
   * INTENTIONAL BEHAVIOUR CHANGE (approved). The visible "MM / YY" string used to live in the
   * expiry widget's own React state, so unmounting and remounting the widget cleared the display
   * while the month and year survived — the two could disagree. The display now lives in the
   * controller's reducer beside the month and year, so it cannot diverge.
   */
  it('keeps the displayed expiry across an unmount and remount, and clears it on reset', async () => {
    const ref = React.createRef<HyperswitchVaultFormHandle>();
    const states: CardFormState[] = [];
    const Harness = ({showExpiry}: {showExpiry: boolean}) => (
      <HyperswitchVaultFormProvider
        ref={ref}
        session={sessionWith('pms_fake_0001')}
        environment="sandbox"
        onStateChange={state => states.push(state)}>
        <CardNumberWidget />
        {showExpiry ? <CardExpiryWidget /> : null}
        <CardCVCWidget />
      </HyperswitchVaultFormProvider>
    );

    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Harness showExpiry={true} />);
    });
    mounted.push(tree);

    await type(tree, 'CardNumberInputTestId', CARD_NUMBER);
    await type(tree, 'ExpiryInputTestId', EXPIRY);
    await type(tree, 'CVCInputTestId', CVC);
    const typedExpiry = input(tree, 'ExpiryInputTestId').props.value;
    expect(typedExpiry).not.toBe('');
    expect(last(states).complete).toBe(true);

    /* 2. unmount -> the widget is gone, so the form is not complete */
    await ReactTestRenderer.act(() => {
      tree.update(<Harness showExpiry={false} />);
    });
    expect(last(states).complete).toBe(false);
    expect(last(states).expiryValid).toBe(false);

    /* 3-4. remount -> the display matches the canonical value again, and validity agrees */
    await ReactTestRenderer.act(() => {
      tree.update(<Harness showExpiry={true} />);
    });
    expect(input(tree, 'ExpiryInputTestId').props.value).toBe(typedExpiry);
    expect(last(states).expiryValid).toBe(true);
    expect(last(states).complete).toBe(true);

    /* 5. reset clears the canonical values AND the visible display together */
    await ReactTestRenderer.act(() => {
      ref.current!.reset();
    });
    expect(input(tree, 'ExpiryInputTestId').props.value).toBe('');
    expect(input(tree, 'CardNumberInputTestId').props.value).toBe('');
    expect(input(tree, 'CVCInputTestId').props.value).toBe('');
    expect(last(states).expiryValid).toBe(false);
  });

  it('a replaced session cannot restore a stale expiry display', async () => {
    const ref = React.createRef<HyperswitchVaultFormHandle>();
    const Harness = ({sessionId}: {sessionId: string}) => (
      <HyperswitchVaultFormProvider
        ref={ref}
        session={sessionWith(sessionId)}
        environment="sandbox">
        <CardNumberWidget />
        <CardExpiryWidget />
        <CardCVCWidget />
      </HyperswitchVaultFormProvider>
    );

    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Harness sessionId="pms_fake_0001" />);
    });
    mounted.push(tree);

    await type(tree, 'ExpiryInputTestId', EXPIRY);
    expect(input(tree, 'ExpiryInputTestId').props.value).not.toBe('');

    await ReactTestRenderer.act(() => {
      tree.update(<Harness sessionId="pms_fake_0002" />);
    });
    await ReactTestRenderer.act(() => {
      ref.current!.reset();
    });

    /* Nothing may bring the previous session's expiry back onto the screen. */
    expect(input(tree, 'ExpiryInputTestId').props.value).toBe('');
  });
});

/* ── Preserved defect D4: the CVC auto-blur must stay unreachable ────────── */

describe('preserved behaviour', () => {
  /*
   * The pre-refactor code computed a "CVC is valid and at max length" transition and blurred a ref
   * that was never attached, so the auto-blur has never run. The react-final-form removal made that
   * transition explicit (`CardFieldLogic` reports it as `blurField`), so this asserts no consumer
   * started acting on it. Activating it is a product decision that has not been taken.
   */
  it('does NOT blur the CVC field when a complete, valid CVC is typed', async () => {
    const {tree} = await mountHarness();

    await type(tree, 'CardNumberInputTestId', CARD_NUMBER); // Visa -> 3-digit CVC
    await type(tree, 'CVCInputTestId', CVC);

    expect(blurCallsOn(tree, 'CVCInputTestId')).toBe(0);
  });
});

/* ── 13: per-widget errors ───────────────────────────────────────────────── */

describe('per-widget validation errors', () => {
  it('an invalid, touched field shows its own message beneath its own widget', async () => {
    const {tree} = await mountHarness();

    /* Type an invalid number, then blur so `touched` is set. */
    await type(tree, 'CardNumberInputTestId', '4242');
    await ReactTestRenderer.act(() => {
      input(tree, 'CardNumberInputTestId').props.onBlur();
    });

    const texts = tree.root
      .findAll(node => typeof node.type === 'string')
      .flatMap(node =>
        Array.isArray(node.props?.children) ? node.props.children : [node.props?.children],
      )
      .filter((child): child is string => typeof child === 'string');
    expect(texts.some(text => /card number/i.test(text))).toBe(true);
  });
});

/* ── 15: reset refusal in flight ─────────────────────────────────────────── */

describe('reset through the provider', () => {
  it('refuses while in flight (values stay, request untouched), then clears after settle', async () => {
    const {tree, ref} = await mountHarness();
    await fillValidCard(tree);
    const typedNumber = input(tree, 'CardNumberInputTestId').props.value;
    expect(typedNumber).not.toBe('');

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    expect(calls).toHaveLength(1);

    /* Non-interactive while in flight. */
    for (const testID of ['CardNumberInputTestId', 'ExpiryInputTestId', 'CVCInputTestId']) {
      expect(input(tree, testID).props.editable).toBe(false);
    }

    await ReactTestRenderer.act(() => {
      ref.current!.reset();
    });
    expect(input(tree, 'CardNumberInputTestId').props.value).toBe(typedNumber);
    expect(calls[0].aborted()).toBe(false);

    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await pending;
    });

    await ReactTestRenderer.act(() => {
      ref.current!.reset();
    });
    expect(input(tree, 'CardNumberInputTestId').props.value).toBe('');
    expect(input(tree, 'ExpiryInputTestId').props.value).toBe('');
    expect(input(tree, 'CVCInputTestId').props.value).toBe('');
  });
});

/* ── 16: session replacement ─────────────────────────────────────────────── */

describe('session replacement', () => {
  it('aborts an in-flight confirmation issued under the previous session', async () => {
    const {tree, ref, update} = await mountHarness();
    await fillValidCard(tree);

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    expect(calls).toHaveLength(1);

    await update({session: sessionWith('pms_fake_0002')});
    expect(calls[0].aborted()).toBe(true);

    const result = await pending;
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.error.code).toBe('unknown_outcome');
  });
});
