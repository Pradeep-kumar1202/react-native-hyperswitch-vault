/**
 * Lifecycle contract for <HyperswitchVaultForm />.
 *
 * These render the PUBLISHED package (resolved by name, through its `exports` map) with the real
 * React Native jest preset, so the behaviour asserted here is the behaviour a merchant gets — not a
 * reading of the source.
 *
 * `fetch` is stubbed with a deferred that honours the AbortSignal exactly as a real fetch does
 * (reject with an AbortError once the signal fires), which is what makes the cancellation
 * assertions meaningful. No network call is ever made and no real credential is used: the session
 * authorization below is base64 of an obviously fake envelope.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVaultForm,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
  type VaultSubmitResult,
} from '@juspay-tech/react-native-hyperswitch-vault';

/*
 * jest runs these in Node, but the React Native tsconfig types neither Node nor the DOM — by
 * design, since the app itself has neither. Declaring exactly what this file touches keeps
 * `tsc --noEmit` clean without widening the app's global types.
 */
declare const global: {fetch: unknown};

/* ── Fixtures ────────────────────────────────────────────────────────────── */

/* Base64 without Buffer or btoa, for the same reason: neither is typed here. */
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

const CARD_NUMBER = '4242424242424242'; // the published Visa test number
const EXPIRY = `12${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;
const CVC = '123';

const confirmResponse = {
  associated_payment_methods: [{payment_method_token: {data: 'tok_fake_0001'}}],
  payment_method_data: {
    card: {
      last4_digits: '4242',
      card_isin: '424242',
      expiry_month: '12',
      expiry_year: '2030',
    },
  },
};

/* ── fetch stub ──────────────────────────────────────────────────────────── */

type Call = {
  url: string;
  options: {headers: Record<string, string>; signal?: AbortSignal};
  /** Resolve this request with a response body. */
  settle: (body: unknown, status?: number) => void;
  /** Deliver the abort rejection. Separate from `abort()` on purpose — see below. */
  settleAbort: () => void;
  aborted: () => boolean;
};

let calls: Call[] = [];
/*
 * When true, an abort marks the request aborted but withholds the rejection until the test calls
 * settleAbort(). Only the ordering-sensitive test needs it; everywhere else the rejection lands
 * immediately, which keeps those tests simple.
 */
let deferAbortRejection = false;

beforeEach(() => {
  calls = [];
  deferAbortRejection = false;
  (global as any).fetch = jest.fn((url: string, options: any) => {
    let settle: (body: unknown, status?: number) => void = () => {};
    let settleAbort = () => {};
    const promise = new Promise((resolve, reject) => {
      settle = (body, status = 200) =>
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        });
      /*
       * A real fetch rejects when its signal aborts — the whole unknown-outcome path depends on it —
       * but it does NOT necessarily reject in the same tick as abort(). `deferAbortRejection` models
       * the later delivery, which is what makes the "a superseded request settles AFTER its
       * replacement has already started" ordering reachable instead of being hidden by microtask
       * timing.
       */
      const rejectAsAborted = () => {
        const error: Error & {name?: string} = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      };
      let abortPending = false;
      settleAbort = () => {
        if (abortPending) rejectAsAborted();
      };
      options?.signal?.addEventListener('abort', () => {
        abortPending = true;
        if (!deferAbortRejection) rejectAsAborted();
      });
    });
    calls.push({
      url,
      options,
      settle: (body, status) => settle(body, status),
      settleAbort: () => settleAbort(),
      aborted: () => options?.signal?.aborted === true,
    });
    return promise;
  });
});

/* ── Render helpers ──────────────────────────────────────────────────────── */

type Mounted = {
  tree: Renderer;
  ref: React.RefObject<HyperswitchVaultFormHandle | null>;
  state: () => {complete: boolean};
};

/*
 * Every renderer is tracked and torn down after its test. Without this, the floating-label
 * animation can still be running when a suite finishes and React's act warning lands in the next
 * one — reported by jest as "Cannot log after tests are done".
 */
const mounted: Renderer[] = [];

afterEach(async () => {
  for (const tree of mounted.splice(0)) {
    try {
      await ReactTestRenderer.act(() => {
        tree.unmount();
      });
    } catch {
      /* already unmounted by the test itself */
    }
  }
});

const mount = async (session: MerchantSession): Promise<Mounted> => {
  const ref = React.createRef<HyperswitchVaultFormHandle>();
  let latest = {complete: false};
  let tree!: Renderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <HyperswitchVaultForm
        ref={ref}
        session={session}
        environment="sandbox"
        onStateChange={next => {
          latest = next;
        }}
      />,
    );
  });
  mounted.push(tree);
  return {tree, ref, state: () => latest};
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

const textsIn = (tree: Renderer): string[] =>
  tree.root
    .findAll(node => typeof node.type === 'string' || typeof node.type === 'function')
    .flatMap(node => (Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]))
    .filter((child): child is string => typeof child === 'string');

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe('duplicate submit', () => {
  it('returns the same promise instance and issues exactly one request', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
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

    const result = await first;
    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.token).toBe('tok_fake_0001');
    expect(await second).toBe(result);
    expect(calls).toHaveLength(1);
  });

  it('allows a new request once the first has settled', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    await ReactTestRenderer.act(async () => {
      const pending = ref.current!.submit();
      calls[0].settle(confirmResponse);
      await pending;
    });

    await ReactTestRenderer.act(async () => {
      ref.current!.submit();
    });
    expect(calls).toHaveLength(2);
  });
});

describe('reset', () => {
  it('clears values, the visible expiry text, validation state and displayed errors', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));

    /* An invalid card, submitted, so an inline error is on screen. */
    await type(tree, 'CardNumberInputTestId', '4242424242424241');
    let result!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      result = await ref.current!.submit();
    });
    expect(result.status).toBe('validation_error');
    expect(result.status !== 'success' && result.error.code).toBe('invalid_card_data');
    expect(calls).toHaveLength(0);
    expect(textsIn(tree).some(text => /card/i.test(text) && /invalid|valid/i.test(text))).toBe(true);

    await type(tree, 'ExpiryInputTestId', EXPIRY);
    expect(input(tree, 'ExpiryInputTestId').props.value).not.toBe('');

    await ReactTestRenderer.act(() => {
      ref.current!.reset();
    });

    expect(input(tree, 'CardNumberInputTestId').props.value).toBe('');
    /* The visible expiry string is React state, not a form value — reset must clear it too. */
    expect(input(tree, 'ExpiryInputTestId').props.value).toBe('');
    expect(input(tree, 'CVCInputTestId').props.value).toBe('');
    expect(textsIn(tree).some(text => /invalid/i.test(text))).toBe(false);
  });

  it('is refused while a confirmation is in flight, and never cancels it', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);
    const typedCardNumber = input(tree, 'CardNumberInputTestId').props.value;
    expect(typedCardNumber).not.toBe('');

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    expect(calls).toHaveLength(1);

    /* The three inputs are genuinely non-interactive for the whole in-flight window. */
    for (const testID of ['CardNumberInputTestId', 'ExpiryInputTestId', 'CVCInputTestId']) {
      expect(input(tree, testID).props.editable).toBe(false);
    }

    await ReactTestRenderer.act(() => {
      ref.current!.reset();
    });

    /* Refused: the values stay put, so nothing can be misread as belonging to a newer card. */
    expect(input(tree, 'CardNumberInputTestId').props.value).toBe(typedCardNumber);
    expect(input(tree, 'ExpiryInputTestId').props.value).not.toBe('');
    expect(input(tree, 'CVCInputTestId').props.value).not.toBe('');
    /* And the request the merchant already dispatched is untouched: it may already be processed. */
    expect(calls[0].aborted()).toBe(false);

    await ReactTestRenderer.act(async () => {
      calls[0].settle(confirmResponse);
      await pending;
    });
    expect((await pending).status).toBe('success');
    expect(calls).toHaveLength(1);

    /* Once it has settled the form is interactive again and reset() works normally. */
    for (const testID of ['CardNumberInputTestId', 'ExpiryInputTestId', 'CVCInputTestId']) {
      expect(input(tree, testID).props.editable).toBe(true);
    }
    await ReactTestRenderer.act(() => {
      ref.current!.reset();
    });
    expect(input(tree, 'CardNumberInputTestId').props.value).toBe('');
    expect(input(tree, 'ExpiryInputTestId').props.value).toBe('');
    expect(input(tree, 'CVCInputTestId').props.value).toBe('');
  });
});

describe('session replacement', () => {
  it('aborts the in-flight request and never reuses the old authorization', async () => {
    const first = sessionWith('pms_fake_OLD');
    const second = sessionWith('pms_fake_NEW');
    const ref = React.createRef<HyperswitchVaultFormHandle>();

    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <HyperswitchVaultForm ref={ref} session={first} environment="sandbox" />,
      );
    });
    mounted.push(tree);
    await fillValidCard(tree);

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('pms_fake_OLD');
    expect(calls[0].options.headers.Authorization).toBe(first.vault_details!.vault_data!.sdk_authorization);

    await ReactTestRenderer.act(() => {
      tree.update(<HyperswitchVaultForm ref={ref} session={second} environment="sandbox" />);
    });

    expect(calls[0].aborted()).toBe(true);

    /* The next submit is a fresh request carrying only the NEW authorization. */
    await ReactTestRenderer.act(async () => {
      ref.current!.submit();
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('pms_fake_NEW');
    expect(calls[1].url).not.toContain('pms_fake_OLD');
    expect(calls[1].options.headers.Authorization).toBe(second.vault_details!.vault_data!.sdk_authorization);
    expect(calls[1].options.headers.Authorization).not.toBe(
      first.vault_details!.vault_data!.sdk_authorization,
    );

    /* Awaited outside act(): the abort settles this promise through the fetch stub, not through a
     * React update, and act() would sit waiting for a queue that has nothing left in it. */
    const outcome = await pending;
    expect(outcome.status).toBe('error');
    expect(outcome.status !== 'success' && outcome.error.code).toBe('unknown_outcome');
  });

  it('leaves the replacement request cancellable when the superseded one settles late', async () => {
    /*
     * The ordering that matters: abort the old request, start the new one, and only THEN let the old
     * one's rejection land. If the settling request cleared the shared cancellation slot on its way
     * out, the live request would be left with nothing to cancel it on unmount — a request carrying
     * a PAN and CVC that outlives its form.
     */
    deferAbortRejection = true;

    const first = sessionWith('pms_fake_OLD');
    const second = sessionWith('pms_fake_NEW');
    const ref = React.createRef<HyperswitchVaultFormHandle>();

    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <HyperswitchVaultForm ref={ref} session={first} environment="sandbox" />,
      );
    });
    mounted.push(tree);
    await fillValidCard(tree);

    let stale!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      stale = ref.current!.submit();
    });

    await ReactTestRenderer.act(() => {
      tree.update(<HyperswitchVaultForm ref={ref} session={second} environment="sandbox" />);
    });
    expect(calls[0].aborted()).toBe(true);

    /* The replacement request starts while the superseded one is still unresolved. */
    await ReactTestRenderer.act(async () => {
      ref.current!.submit();
    });
    expect(calls).toHaveLength(2);

    /* Now the superseded one finally settles. */
    calls[0].settleAbort();
    expect((await stale).status).toBe('error');

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
    expect(calls[1].aborted()).toBe(true);
  });
});

describe('unmount', () => {
  it('aborts an in-flight confirmation', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    expect(calls[0].aborted()).toBe(false);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
    expect(calls[0].aborted()).toBe(true);

    const result = await pending;
    expect(result.status).toBe('error');
    expect(result.status !== 'success' && result.error.code).toBe('unknown_outcome');
  });
});

describe('focus', () => {
  it('reaches the fields while mounted and is a safe no-op after unmount', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    const handle = ref.current!;

    expect(() => handle.focus('cardNumber')).not.toThrow();
    expect(() => handle.focus('expiry')).not.toThrow();
    expect(() => handle.focus('cvc')).not.toThrow();

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });

    /* The registration is removed on unmount, so this must not reach into a dead tree. */
    expect(() => handle.focus('cardNumber')).not.toThrow();
  });
});

describe('unusable session', () => {
  it('reports error / invalid_session and sends nothing', async () => {
    const {ref} = await mount({vault_details: {vault_type: 'external', vault_data: {}}});

    let result!: VaultSubmitResult;
    await ReactTestRenderer.act(async () => {
      result = await ref.current!.submit();
    });

    expect(result.status).toBe('error');
    expect(result.status !== 'success' && result.error.code).toBe('invalid_session');
    expect(calls).toHaveLength(0);
  });
});

describe('backend failure', () => {
  it('maps a confirmed non-2xx to error / server_error and never retries', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    let pending!: Promise<VaultSubmitResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.submit();
    });
    await ReactTestRenderer.act(async () => {
      calls[0].settle({error: {code: 'IR_05', message: 'internal detail 4242424242424242'}}, 400);
      await pending;
    });

    const result = await pending;
    expect(result.status).toBe('error');
    expect(result.status !== 'success' && result.error.code).toBe('server_error');
    /* The backend's own message never reaches the merchant. */
    expect(JSON.stringify(result)).not.toContain('4242424242424242');
    expect(JSON.stringify(result)).not.toContain('internal detail');
    expect(calls).toHaveLength(1);
  });
});

describe('splitCardFields', () => {
  /*
   * The two layouts differ in the container styles, not in the TextInput props: stacked merges the
   * three fields into one block by squaring the inner corners, split separates them with a gap.
   */
  const flatten = (style: any): any[] =>
    Array.isArray(style) ? style.flatMap(flatten) : style ? [style] : [];

  const containerStyles = (tree: Renderer) =>
    tree.root
      .findAll(node => typeof node.type === 'string' && node.props?.style)
      .flatMap(node => flatten(node.props.style));

  const mountWith = async (split: boolean) => {
    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <HyperswitchVaultForm
          session={sessionWith('pms_fake_layout')}
          environment="sandbox"
          splitCardFields={split}
        />,
      );
    });
    mounted.push(tree);
    return containerStyles(tree);
  };

  it('defaults to one merged block, and separates the fields when asked', async () => {
    const stacked = await mountWith(false);
    /* Inner corners squared so the fields read as a single bordered block, and no gap between them. */
    expect(stacked.filter(s => s?.borderBottomLeftRadius === 0 || s?.borderTopLeftRadius === 0).length)
      .toBeGreaterThan(0);
    expect(stacked.filter(s => typeof s?.gap === 'number').length).toBe(0);

    const split = await mountWith(true);
    /* Every field keeps its own rounded box, and a gap appears between expiry and CVC. */
    expect(split.filter(s => s?.borderBottomLeftRadius === 0 || s?.borderTopLeftRadius === 0).length)
      .toBe(0);
    expect(split.filter(s => typeof s?.gap === 'number').length).toBeGreaterThan(0);
  });
});
