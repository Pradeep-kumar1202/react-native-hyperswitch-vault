/**
 * Lifecycle contract for <HyperswitchVaultForm />.
 *
 * These render the PUBLISHED package (resolved by name, through its `exports` map) with the real
 * React Native jest preset, so the behaviour asserted here is the behaviour a merchant gets — not a
 * reading of the source.
 *
 * ONE submit is now TWO requests: call 1 mints a payment-method token from the card the library
 * owns, call 2 confirms the payment with it. The token lives only between them; `submit()` resolves
 * to a navigation decision and never carries it out.
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
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';
/* The payment flows are the checkout SDK's contract: handle and result types come from ./host. */
import type {HostFormHandle, VaultPaymentResult} from '@juspay-tech/react-native-hyperswitch-vault/host';

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

/* Call 1 — the payment-method-session confirm that mints a token. */
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

/* Call 2 — the payment confirm the library performs itself. */
const paymentSucceeded = {status: 'succeeded'};

/* The two NON-CARD values submit() requires. Neither is a real credential. */
const PAYMENT = {
  paymentId: 'pay_lifecycle_fake',
  sdkAuthorization: 'intent_auth_lifecycle_fake',
};

/*
 * The confirm input names its own card source. Flow 2 — the sequence this suite exercises — is the
 * VAULT source, which carries the session the token is minted against; the session prop on the
 * component backs `tokenize()` and is not what a confirmation reads.
 */
const paymentWith = (session: MerchantSession) =>
  ({...PAYMENT, cardSource: {type_: 'vault' as const, session}});

const PAYMENT_VAULT = paymentWith(sessionWith('pms_fake_0001'));

/*
 * `Succeeded` and `Processing` carry no payload, so the published union renders them as plain
 * strings; every other outcome is an object with a `status`. These two readers keep every
 * assertion below written against one shape.
 */
const statusOf = (result: VaultPaymentResult) => result.status;

const errorOf = (result: VaultPaymentResult) => ('error' in result ? result.error : undefined);

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
  ref: React.RefObject<HostFormHandle | null>;
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
  const ref = React.createRef<HostFormHandle>();
  let tree!: Renderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <HyperswitchVaultForm
        ref={ref}
        session={session}
        environment="sandbox"
        /*
         * Inline error RENDERING is opt-in since the merchant UI reset. The lifecycle suite asserts
         * what is on screen, so it asks for it; nothing about validation changed either way.
         */
        fieldOptions={{
          cardNumber: {errorDisplay: 'inline'},
          expiry: {errorDisplay: 'inline'},
          cvc: {errorDisplay: 'inline'},
        }}
      />,
    );
  });
  mounted.push(tree);
  return {tree, ref};
};

/*
 * Settles call 1, waits for the payment confirm it triggers, and settles that too. Both have to be
 * answered now: one press of a merchant's Pay button is two requests.
 */
const settlePair = async (
  first: unknown = confirmResponse,
  second: unknown = paymentSucceeded,
  statuses: {first?: number; second?: number} = {},
) => {
  const index = calls.length - 1;
  await ReactTestRenderer.act(async () => {
    calls[index].settle(first, statuses.first);
  });
  await ReactTestRenderer.act(async () => {
    calls[index + 1].settle(second, statuses.second);
  });
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
  it('returns the same promise instance and issues exactly one pair of requests', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    let first!: Promise<VaultPaymentResult>;
    let second!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      first = ref.current!.confirmPayment(PAYMENT_VAULT);
      second = ref.current!.confirmPayment(PAYMENT_VAULT);
    });

    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/payment-method-sessions/pms_fake_0001/confirm');

    await settlePair();
    await ReactTestRenderer.act(async () => {
      await first;
    });

    /* The second call is the payment confirm the library owns; it carries the payment id. */
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('/payments/pay_lifecycle_fake/confirm');

    const result = await first;
    /* Success means the PAYMENT succeeded. There is no token anywhere in the result. */
    expect(result.status).toBe('succeeded');
    expect(JSON.stringify(result)).not.toContain('tok_');
    expect(await second).toBe(result);
  });

  it('allows a new request once the first has settled, and does not re-mint the token', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    await ReactTestRenderer.act(async () => {
      ref.current!.confirmPayment(PAYMENT_VAULT);
    });
    await settlePair();
    expect(calls).toHaveLength(2);

    /*
     * The card and the session are unchanged, so the token minted by call 1 is still valid and is
     * deliberately REUSED — the payment-method-session confirm has no idempotency key, and
     * re-confirming it could vault the same card twice. Only the payment confirm runs again.
     */
    await ReactTestRenderer.act(async () => {
      ref.current!.confirmPayment(PAYMENT_VAULT);
    });
    expect(calls).toHaveLength(3);
    expect(calls[2].url).toContain('/payments/pay_lifecycle_fake/confirm');
  });
});

describe('reset', () => {
  it('clears values, the visible expiry text, validation state and displayed errors', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));

    /*
     * An invalid card, submitted. Inline error RENDERING is opt-in since the merchant UI reset, so
     * this form asks for it; the error EVENT is unaffected either way.
     */
    await type(tree, 'CardNumberInputTestId', '4242424242424241');
    let result!: VaultPaymentResult;
    await ReactTestRenderer.act(async () => {
      result = await ref.current!.confirmPayment(PAYMENT_VAULT);
    });
    expect(statusOf(result)).toBe('validation_error');
    expect(errorOf(result)?.code).toBe('invalid_card_data');
    /* Neither call is made: an invalid card never reaches the network. */
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

    let pending!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.confirmPayment(PAYMENT_VAULT);
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

    await settlePair();
    await ReactTestRenderer.act(async () => {
      await pending;
    });
    expect((await pending).status).toBe('succeeded');
    expect(calls).toHaveLength(2);

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
    const ref = React.createRef<HostFormHandle>();

    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <HyperswitchVaultForm ref={ref} session={first} environment="sandbox" />,
      );
    });
    mounted.push(tree);
    await fillValidCard(tree);

    let pending!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.confirmPayment(paymentWith(first));
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('pms_fake_OLD');
    /*
     * Call 1 authenticates with the VAULT credential from the session — never with the
     * payment-intent credential the host passed to submit(). They are different secrets.
     */
    expect(calls[0].options.headers.Authorization).toBe(first.vault_details!.vault_data!.sdk_authorization);
    expect(calls[0].options.headers.Authorization).not.toBe(PAYMENT.sdkAuthorization);

    await ReactTestRenderer.act(() => {
      tree.update(<HyperswitchVaultForm ref={ref} session={second} environment="sandbox" />);
    });

    expect(calls[0].aborted()).toBe(true);

    /*
     * The next submit is a fresh request carrying only the NEW authorization: a replaced session
     * also discards the token minted under the old one, so call 1 genuinely runs again.
     */
    await ReactTestRenderer.act(async () => {
      ref.current!.confirmPayment(paymentWith(second));
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
    expect(statusOf(outcome)).toBe('failed');
    expect(errorOf(outcome)?.code).toBe('unknown_outcome');
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
    const ref = React.createRef<HostFormHandle>();

    let tree!: Renderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <HyperswitchVaultForm ref={ref} session={first} environment="sandbox" />,
      );
    });
    mounted.push(tree);
    await fillValidCard(tree);

    let stale!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      stale = ref.current!.confirmPayment(paymentWith(first));
    });

    await ReactTestRenderer.act(() => {
      tree.update(<HyperswitchVaultForm ref={ref} session={second} environment="sandbox" />);
    });
    expect(calls[0].aborted()).toBe(true);

    /* The replacement request starts while the superseded one is still unresolved. */
    await ReactTestRenderer.act(async () => {
      ref.current!.confirmPayment(paymentWith(second));
    });
    expect(calls).toHaveLength(2);

    /* Now the superseded one finally settles. */
    calls[0].settleAbort();
    expect(statusOf(await stale)).toBe('failed');

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

    let pending!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.confirmPayment(PAYMENT_VAULT);
    });
    expect(calls[0].aborted()).toBe(false);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
    expect(calls[0].aborted()).toBe(true);

    const result = await pending;
    expect(statusOf(result)).toBe('failed');
    expect(errorOf(result)?.code).toBe('unknown_outcome');
  });
});

describe('focus', () => {
  it('reaches the fields while mounted and is a safe no-op after unmount', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    const handle = ref.current!;

    expect(() => handle.focus('cardholderName')).not.toThrow();
    expect(() => handle.focus('cardNumber')).not.toThrow();
    expect(() => handle.focus('expiry')).not.toThrow();
    expect(() => handle.focus('cvc')).not.toThrow();

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });

    /* The registration is removed on unmount, so this must not reach into a dead tree. */
    expect(() => handle.focus('cardNumber')).not.toThrow();
    expect(() => handle.focus('cardholderName')).not.toThrow();
  });
});

describe('unusable session', () => {
  it('reports failed / invalid_session and sends nothing', async () => {
    const unusable = {vault_details: {vault_type: 'external', vault_data: {}}} as MerchantSession;
    const {tree, ref} = await mount(unusable);
    await fillValidCard(tree);

    let result!: VaultPaymentResult;
    await ReactTestRenderer.act(async () => {
      result = await ref.current!.confirmPayment(paymentWith(unusable));
    });

    expect(statusOf(result)).toBe('failed');
    expect(errorOf(result)?.code).toBe('invalid_session');
    expect(calls).toHaveLength(0);
  });

  it('refuses a blank paymentId or sdkAuthorization without touching the network', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    for (const args of [
      {...PAYMENT_VAULT, paymentId: '   '},
      {...PAYMENT_VAULT, sdkAuthorization: '   '},
    ]) {
      let result!: VaultPaymentResult;
      await ReactTestRenderer.act(async () => {
        result = await ref.current!.confirmPayment(args);
      });
      expect(statusOf(result)).toBe('failed');
      expect(errorOf(result)?.code).toBe('invalid_session');
      expect(calls).toHaveLength(0);
    }
  });
});

describe('backend failure', () => {
  it('maps a refused token mint to failed / server_error and never confirms the payment', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    let pending!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.confirmPayment(PAYMENT_VAULT);
    });
    await ReactTestRenderer.act(async () => {
      calls[0].settle({error: {code: 'IR_05', message: 'internal detail 4242424242424242'}}, 400);
      await pending;
    });

    const result = await pending;
    expect(statusOf(result)).toBe('failed');
    expect(errorOf(result)?.code).toBe('server_error');
    /* The backend's own message never reaches the merchant. */
    expect(JSON.stringify(result)).not.toContain('4242424242424242');
    expect(JSON.stringify(result)).not.toContain('internal detail');
    /* Call 1 failed, so there is no token and call 2 is never attempted. */
    expect(calls).toHaveLength(1);
  });

  it('maps a refused payment confirm to failed / server_error, with no backend prose', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    let pending!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.confirmPayment(PAYMENT_VAULT);
    });
    await settlePair(
      confirmResponse,
      {error: {code: 'IR_05', message: 'internal detail 4242424242424242'}},
      {second: 400},
    );

    const result = await pending;
    expect(statusOf(result)).toBe('failed');
    expect(errorOf(result)?.code).toBe('server_error');
    expect(JSON.stringify(result)).not.toContain('4242424242424242');
    expect(JSON.stringify(result)).not.toContain('internal detail');
    /* And no token leaked out with the failure. */
    expect(JSON.stringify(result)).not.toContain('tok_');
    expect(calls).toHaveLength(2);
  });

  it('reports a customer action without exposing anything but navigation', async () => {
    const {tree, ref} = await mount(sessionWith('pms_fake_0001'));
    await fillValidCard(tree);

    let pending!: Promise<VaultPaymentResult>;
    await ReactTestRenderer.act(async () => {
      pending = ref.current!.confirmPayment(PAYMENT_VAULT);
    });
    await settlePair(confirmResponse, {
      status: 'requires_customer_action',
      next_action: {type: 'redirect_to_url', redirect_to_url: 'https://example.test/3ds'},
      /* A confirm response legitimately can carry this. It must never be read out. */
      payment_method_data: {card: {last4_digits: '4242', card_isin: '424242'}},
    });

    const result = await pending;
    expect(statusOf(result)).toBe('requires_customer_action');
    expect(result.status === 'requires_customer_action' ? result.nextAction.redirectUrl : undefined)
      .toBe('https://example.test/3ds');
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('tok_');
    expect(serialised).not.toContain('424242');
    expect(serialised).not.toContain('4242');
  });
});

describe('layout and fieldArrangement', () => {
  /*
   * `fieldArrangement` decides the container styles, not the TextInput props: `fused` merges the
   * three fields into one block by squaring the inner corners, `separate` gives each its own
   * rounded box with a gap between them. Both are shown here in the `inline` layout, where expiry
   * and CVC share a row. The DEFAULT is `stacked` + `separate` — see the zero-configuration suite.
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
          layout="inline"
          fieldArrangement={split ? 'separate' : 'fused'}
        />,
      );
    });
    mounted.push(tree);
    return containerStyles(tree);
  };

  it('fuses the fields into one block, and separates them when asked', async () => {
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
