/**
 * The saved-card CVC contract (ADR-0008), exercised through the PUBLISHED package.
 *
 * `<HyperswitchVaultSavedCardForm />` renders one CVC field for a card the merchant has already
 * saved, and `updateSavedPaymentMethod()` sends that CVC to the vault and resolves to the token the
 * response carries. These tests pin what the ADR promises:
 *
 *   1. exactly one input, and no PAN, expiry or name input anywhere;
 *   2. `onStateChange` carries the EXISTING `VaultCVCState`, and no snapshot carries the CVC, any
 *      prefix of it, or its length — checked by walking every snapshot, with a non-vacuity control;
 *   3. one request, exactly as the contract spells it; a double submit shares one promise;
 *   4. every refusal costs zero requests, and every failure is a closed code;
 *   5. the lifecycle: a token or session change clears the CVC and aborts, a host change aborts but
 *      keeps the CVC, `reset()` clears and aborts, a network-hint change re-emits without a keystroke;
 *   6. the network table — including the documented case that `valid` is true at three digits when
 *      no recognised hint is given.
 *
 * `fetch` is stubbed with a deferred that honours the AbortSignal the way a real fetch does. No
 * network call is made and no real credential is used.
 *
 * @format
 */
import React from 'react';
import {TextInput, Text} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVaultSavedCardForm,
  type MerchantSession,
  type VaultSavedCardHandle,
  type VaultCVCState,
  type VaultTokenizeResult,
  type VaultEnvironment,
} from '@juspay-tech/react-native-hyperswitch-vault';

declare const global: {fetch: unknown};

/* ── Fixtures ────────────────────────────────────────────────────────────── */

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

const SESSION = sessionWith('pms_saved_0001');
const INPUT_TOKEN = 'token_from_list_payment_methods';
const RESPONSE_TOKEN = 'token_from_the_response';
/* Private test data. Never rendered into an assertion message. */
const CVC = '742';

const okResponse = (token = RESPONSE_TOKEN) => ({
  associated_payment_methods: [
    {payment_method_token: {type: 'payment_method_session_token', data: token}},
  ],
});

/* ── fetch stub ──────────────────────────────────────────────────────────── */

type Call = {
  url: string;
  options: {method: string; headers: Record<string, string>; body: string; signal?: AbortSignal};
  settle: (body: unknown, status?: number) => void;
  fail: () => void;
  aborted: () => boolean;
};

let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  (global as any).fetch = jest.fn((url: string, options: any) => {
    let settle: (body: unknown, status?: number) => void = () => {};
    let fail = () => {};
    const promise = new Promise((resolve, reject) => {
      settle = (body, status = 200) =>
        resolve({ok: status >= 200 && status < 300, status, json: async () => body});
      fail = () => reject(new Error('network down'));
      const rejectAsAborted = () => {
        const error: Error & {name?: string} = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (options?.signal?.aborted) rejectAsAborted();
      options?.signal?.addEventListener('abort', rejectAsAborted);
    });
    calls.push({
      url,
      options,
      settle: (body, status) => settle(body, status),
      fail: () => fail(),
      aborted: () => options?.signal?.aborted === true,
    });
    return promise;
  });
});

/* ── Render helpers ──────────────────────────────────────────────────────── */

type Props = {
  session?: MerchantSession;
  environment?: VaultEnvironment;
  paymentMethodToken?: string;
  cardNetwork?: string;
  vaultEndpoint?: {baseUrl: string};
  onStateChange?: (s: VaultCVCState) => void;
};

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

const element = (ref: React.RefObject<VaultSavedCardHandle | null>, props: Props) => (
  <HyperswitchVaultSavedCardForm
    ref={ref}
    session={props.session ?? SESSION}
    environment={props.environment ?? 'sandbox'}
    paymentMethodToken={props.paymentMethodToken ?? INPUT_TOKEN}
    cardNetwork={props.cardNetwork}
    vaultEndpoint={props.vaultEndpoint}
    onStateChange={props.onStateChange}
  />
);

const mount = async (props: Props = {}) => {
  const ref = React.createRef<VaultSavedCardHandle>();
  let tree!: Renderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(element(ref, props));
  });
  mounted.push(tree);
  const update = (next: Props) =>
    ReactTestRenderer.act(() => {
      tree.update(element(ref, {...props, ...next}));
    });
  return {tree, ref, update};
};

const inputs = (tree: Renderer) => tree.root.findAll((n) => n.type === TextInput);
const cvcInput = (tree: Renderer) => inputs(tree).find((i) => i.props.testID === 'CVCInputTestId')!;
const type = (tree: Renderer, text: string) =>
  ReactTestRenderer.act(() => cvcInput(tree).props.onChangeText(text));
const flush = () =>
  ReactTestRenderer.act(async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  });
const submit = (ref: React.RefObject<VaultSavedCardHandle | null>) => {
  let pending!: Promise<VaultTokenizeResult>;
  ReactTestRenderer.act(() => {
    pending = ref.current!.updateSavedPaymentMethod();
  });
  return pending;
};

/* Settle inside act(), so the coordinator's own state update after the response is not stray. */
const resolved = async (pending: Promise<VaultTokenizeResult>) => {
  let result!: VaultTokenizeResult;
  await ReactTestRenderer.act(async () => {
    result = await pending;
  });
  return result;
};

const codeOf = (result: VaultTokenizeResult) =>
  `${result.status}/${result.status === 'success' ? '-' : result.error.code}`;

/* ── Leak walk ───────────────────────────────────────────────────────────── */

const walk = (node: unknown, visit: (key: string, value: unknown) => void, key = '$') => {
  visit(key, node);
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, visit, k);
  }
};

const FORBIDDEN_KEYS =
  /^(pan|bin|iin|last4|lastFour|value|rawValue|cvv|cvc|cvcValue|securityCode|length|digits|token|brand|canSubmit|sdkAuthorization|authorization)$/;

/* Every prefix of the CVC, and the CVC itself. */
const CVC_FRAGMENTS = Array.from({length: CVC.length}, (_, i) => CVC.slice(0, i + 1));

const leaksTheCvc = (snapshot: unknown) => {
  let leaked = false;
  walk(snapshot, (key, value) => {
    if (FORBIDDEN_KEYS.test(key)) leaked = true;
    if (typeof value === 'string' && CVC_FRAGMENTS.some((f) => value.includes(f))) leaked = true;
    /* A number member could carry the length as well as a string could carry the value. */
    if (typeof value === 'number') leaked = true;
  });
  return leaked;
};

/* ══ 1. One field, and only that field ═══════════════════════════════════════ */

describe('rendering', () => {
  it('renders exactly one input: a masked CVC, no PAN, expiry or name', async () => {
    const {tree} = await mount();
    const all = inputs(tree);
    expect(all).toHaveLength(1);
    expect(all[0].props.testID).toBe('CVCInputTestId');
    expect(all[0].props.secureTextEntry).toBe(true);
    expect(all[0].props.maxLength).toBe(4);
    expect(all.some((i) => /Card|Expiry|Cardholder/.test(String(i.props.testID)))).toBe(false);
  });

  it('exposes a handle of exactly four members, and focus/blur take no argument', async () => {
    const {ref} = await mount();
    expect(Object.keys(ref.current!).sort()).toEqual(['blur', 'focus', 'reset', 'updateSavedPaymentMethod']);
    expect(() => ref.current!.focus()).not.toThrow();
    expect(() => ref.current!.blur()).not.toThrow();
  });
});

/* ══ 2. Emitted state ════════════════════════════════════════════════════════ */

describe('onStateChange', () => {
  it('emits one VaultCVCState on mount, then tracks typing, focus and blur', async () => {
    const seen: VaultCVCState[] = [];
    const {tree} = await mount({onStateChange: (s) => seen.push(s)});

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({field: 'cvc', status: 'empty', valid: false, touched: false, focused: false});

    await ReactTestRenderer.act(() => cvcInput(tree).props.onFocus());
    expect(seen[seen.length - 1].focused).toBe(true);

    await type(tree, CVC.slice(0, 2));
    expect(seen[seen.length - 1].status).toBe('incomplete');
    expect(seen[seen.length - 1].valid).toBe(false);

    await type(tree, CVC);
    expect(seen[seen.length - 1].status).toBe('complete');
    expect(seen[seen.length - 1].valid).toBe(true);

    await ReactTestRenderer.act(() => cvcInput(tree).props.onBlur());
    const last = seen[seen.length - 1];
    expect(last.touched).toBe(true);
    expect(last.focused).toBe(false);
    expect(last.error).toBeUndefined();

    /* The whole conversation, walked recursively. */
    for (const snapshot of seen) expect(leaksTheCvc(snapshot)).toBe(false);
  });

  it('shows the required message on the snapshot after a blank submit, and never the value', async () => {
    const seen: VaultCVCState[] = [];
    const {ref} = await mount({onStateChange: (s) => seen.push(s)});
    const result = await resolved(submit(ref));
    expect(codeOf(result)).toBe('validation_error/invalid_card_data');
    const last = seen[seen.length - 1];
    expect(last.touched).toBe(true);
    expect(last.error?.code).toBe('required');
    expect(typeof last.error?.message).toBe('string');
    for (const snapshot of seen) expect(leaksTheCvc(snapshot)).toBe(false);
  });

  it('the leak walk is not vacuous', () => {
    expect(leaksTheCvc({field: 'cvc', value: CVC})).toBe(true);
    expect(leaksTheCvc({field: 'cvc', error: {message: `typed ${CVC.slice(0, 1)}`}})).toBe(true);
    expect(leaksTheCvc({field: 'cvc', length: 3})).toBe(true);
    expect(leaksTheCvc({field: 'cvc', brand: 'visa'})).toBe(true);
    expect(leaksTheCvc({field: 'cvc', status: 'complete', valid: true})).toBe(false);
  });

  it('attaching a callback later opens with exactly one snapshot describing the current state', async () => {
    const {tree, update} = await mount();
    await type(tree, CVC);
    const seen: VaultCVCState[] = [];
    await update({onStateChange: (s) => seen.push(s)});
    expect(seen).toHaveLength(1);
    expect(seen[0].status).toBe('complete');
    expect(seen[0].valid).toBe(true);
  });

  it('a throwing merchant callback does not break CVC entry', async () => {
    const {tree} = await mount({
      onStateChange: () => {
        throw new Error('merchant handler blew up');
      },
    });
    await type(tree, CVC);
    expect(cvcInput(tree).props.value).toBe(CVC);
  });
});

/* ══ 3. The request ══════════════════════════════════════════════════════════ */

describe('updateSavedPaymentMethod()', () => {
  it('sends exactly the ADR-0008 request and returns the token the response carries', async () => {
    const {tree, ref} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    expect(calls).toHaveLength(1);

    const {url, options} = calls[0];
    expect(options.method).toBe('PUT');
    expect(url).toBe(
      'https://beta.hyperswitch.io/api/v1/payment-method-sessions/pms_saved_0001/update-saved-payment-method',
    );
    expect(Object.keys(options.headers).sort()).toEqual(['Authorization', 'Content-Type', 'x-app-id', 'x-redirect-uri']);
    expect(options.headers.Authorization).toBe(fakeAuthorization('pms_saved_0001'));
    expect(Object.keys(options.headers).some((h) => /profile/i.test(h))).toBe(false);
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      payment_method_token: INPUT_TOKEN,
      payment_method_data: {card: {card_cvc: CVC}},
    });

    calls[0].settle(okResponse());
    const result = await resolved(pending);
    expect(result).toEqual({status: 'success', token: RESPONSE_TOKEN});
  });

  it('uses the given environment and vaultEndpoint for the host', async () => {
    const {tree, ref} = await mount({environment: 'production'});
    await type(tree, CVC);
    submit(ref);
    expect(calls[0].url.startsWith('https://checkout.hyperswitch.io/api/')).toBe(true);
    calls[0].settle(okResponse());
    await flush();

    const second = await mount({vaultEndpoint: {baseUrl: 'https://vault.example.com/api/'}});
    await type(second.tree, CVC);
    const again = submit(second.ref);
    expect(calls[1].url.startsWith('https://vault.example.com/api/v1/')).toBe(true);
    calls[1].settle(okResponse());
    expect(codeOf(await resolved(again))).toBe('success/-');
  });

  it('a double submit shares one promise and one request', async () => {
    const {tree, ref} = await mount();
    await type(tree, CVC);
    const first = submit(ref);
    const second = submit(ref);
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
    calls[0].settle(okResponse());
    expect(await resolved(first)).toEqual({status: 'success', token: RESPONSE_TOKEN});
  });

  it('after a settled call, a new call sends a fresh request (the update is idempotent)', async () => {
    const {tree, ref} = await mount();
    await type(tree, CVC);
    const first = submit(ref);
    calls[0].settle(okResponse());
    await resolved(first);
    await flush();
    const second = submit(ref);
    expect(calls).toHaveLength(2);
    calls[1].settle(okResponse('token_second_time'));
    expect(await resolved(second)).toEqual({status: 'success', token: 'token_second_time'});
  });
});

/* ══ 4. Refusals and failures ════════════════════════════════════════════════ */

describe('refusals cost zero requests', () => {
  it('an empty CVC is validation_error, and the field shows the message', async () => {
    const {tree, ref} = await mount();
    expect(codeOf(await resolved(submit(ref)))).toBe('validation_error/invalid_card_data');
    expect(calls).toHaveLength(0);
    const errors = tree.root.findAll((n) => n.type === Text && n.props.testID === 'CardFieldErrorTestId');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('a CVC of the wrong length for the network is validation_error', async () => {
    const {tree, ref} = await mount({cardNetwork: 'AmericanExpress'});
    await type(tree, '123');
    expect(codeOf(await resolved(submit(ref)))).toBe('validation_error/invalid_card_data');
    expect(calls).toHaveLength(0);
  });

  it('an empty or blank paymentMethodToken is not_ready — it is never sent, so no new token is minted', async () => {
    for (const token of ['', '   ']) {
      const {tree, ref} = await mount({paymentMethodToken: token});
      await type(tree, CVC);
      const result = await resolved(submit(ref));
      expect(codeOf(result)).toBe('not_ready/not_ready');
      expect(calls).toHaveLength(0);
    }
  });

  it('a session this component cannot use is invalid_session', async () => {
    const unusable: MerchantSession[] = [
      {session_token: [], vault_details: {vault_type: 'vgs', vault_data: {sdk_authorization: 'x'}}},
      {session_token: []},
      {session_token: [], vault_details: {vault_type: 'hyperswitch', vault_data: {}}},
    ];
    for (const session of unusable) {
      const {tree, ref} = await mount({session});
      await type(tree, CVC);
      expect(codeOf(await resolved(submit(ref)))).toBe('error/invalid_session');
      expect(calls).toHaveLength(0);
    }
  });

  it('an invalid vaultEndpoint is unsupported_configuration', async () => {
    const {tree, ref} = await mount({vaultEndpoint: {baseUrl: 'ftp://nope'}});
    await type(tree, CVC);
    expect(codeOf(await resolved(submit(ref)))).toBe('error/unsupported_configuration');
    expect(calls).toHaveLength(0);
  });
});

describe('failures are closed codes', () => {
  it('a 2xx without the associated payment-method token is server_error, not a different identifier', async () => {
    const {tree, ref} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    calls[0].settle({associated_token_id: 'not_the_token_we_want'});
    const result = await resolved(pending);
    expect(codeOf(result)).toBe('error/server_error');
    expect(JSON.stringify(result)).not.toContain('not_the_token_we_want');
  });

  it('an HTTP error is server_error and the backend message is never surfaced', async () => {
    for (const status of [400, 401, 404, 500]) {
      const {tree, ref} = await mount();
      await type(tree, CVC);
      const pending = submit(ref);
      calls[calls.length - 1].settle({error: {code: 'IR_05', message: 'SECRET-OPERATOR-TEXT'}}, status);
      const result = await resolved(pending);
      expect(codeOf(result)).toBe('error/server_error');
      expect(JSON.stringify(result)).not.toContain('SECRET-OPERATOR-TEXT');
      expect(JSON.stringify(result)).not.toContain(CVC);
      await flush();
    }
  });

  it('a network failure is unknown_outcome, and is not retried', async () => {
    const {tree, ref} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    calls[0].fail();
    expect(codeOf(await resolved(pending))).toBe('error/unknown_outcome');
    expect(calls).toHaveLength(1);
  });
});

/* ══ 5. Lifecycle ════════════════════════════════════════════════════════════ */

describe('lifecycle', () => {
  it('a paymentMethodToken change clears the CVC and aborts the request in flight', async () => {
    const {tree, ref, update} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    expect(calls[0].aborted()).toBe(false);
    await update({paymentMethodToken: 'token_of_another_card'});
    expect(calls[0].aborted()).toBe(true);
    expect(codeOf(await resolved(pending))).toBe('error/unknown_outcome');
    expect(cvcInput(tree).props.value).toBe('');
  });

  it('a session change clears the CVC and aborts', async () => {
    const {tree, ref, update} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    await update({session: sessionWith('pms_saved_0002')});
    expect(calls[0].aborted()).toBe(true);
    expect(codeOf(await resolved(pending))).toBe('error/unknown_outcome');
    expect(cvcInput(tree).props.value).toBe('');
    await flush();

    /* And the next call goes to the new session. */
    await type(tree, CVC);
    const next = submit(ref);
    expect(calls[1].url).toContain('/pms_saved_0002/');
    calls[1].settle(okResponse());
    expect(codeOf(await resolved(next))).toBe('success/-');
  });

  it('an environment or vaultEndpoint change aborts but RETAINS the CVC', async () => {
    const {tree, ref, update} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    await update({environment: 'production'});
    expect(calls[0].aborted()).toBe(true);
    expect(codeOf(await resolved(pending))).toBe('error/unknown_outcome');
    expect(cvcInput(tree).props.value).toBe(CVC);
    await flush();

    const again = submit(ref);
    await update({vaultEndpoint: {baseUrl: 'https://vault.example.com'}});
    expect(calls[1].aborted()).toBe(true);
    expect(codeOf(await resolved(again))).toBe('error/unknown_outcome');
    expect(cvcInput(tree).props.value).toBe(CVC);
  });

  it('reset() clears the CVC, and aborts a request in flight', async () => {
    const {tree, ref} = await mount();
    await type(tree, CVC);
    await ReactTestRenderer.act(() => ref.current!.reset());
    expect(cvcInput(tree).props.value).toBe('');

    await type(tree, CVC);
    const pending = submit(ref);
    await ReactTestRenderer.act(() => ref.current!.reset());
    expect(calls[0].aborted()).toBe(true);
    expect(codeOf(await resolved(pending))).toBe('error/unknown_outcome');
    expect(cvcInput(tree).props.value).toBe('');
  });

  it('unmounting aborts the request in flight and resolves it unknown_outcome', async () => {
    const {tree, ref} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    await ReactTestRenderer.act(() => tree.unmount());
    expect(calls[0].aborted()).toBe(true);
    expect(codeOf(await resolved(pending))).toBe('error/unknown_outcome');
  });

  it('a presentation prop change neither aborts nor clears', async () => {
    const {tree, ref, update} = await mount();
    await type(tree, CVC);
    const pending = submit(ref);
    await update({onStateChange: () => {}});
    expect(calls[0].aborted()).toBe(false);
    expect(cvcInput(tree).props.value).toBe(CVC);
    calls[0].settle(okResponse());
    expect(codeOf(await resolved(pending))).toBe('success/-');
  });

  it('a cardNetwork change re-validates and re-emits without a keystroke', async () => {
    const seen: VaultCVCState[] = [];
    const {tree, update} = await mount({cardNetwork: 'American Express', onStateChange: (s) => seen.push(s)});
    await type(tree, '123');
    expect(seen[seen.length - 1].valid).toBe(false);
    const before = seen.length;

    await update({cardNetwork: 'Visa'});
    expect(seen.length).toBe(before + 1);
    expect(seen[seen.length - 1].valid).toBe(true);

    await update({cardNetwork: 'amex'});
    expect(seen[seen.length - 1].valid).toBe(false);
    for (const snapshot of seen) expect(leaksTheCvc(snapshot)).toBe(false);
  });
});

/* ══ 6. The network table ════════════════════════════════════════════════════ */

describe('the network hint selects the CVC length rule', () => {
  const cases: Array<{hint: string | undefined; three: boolean; four: boolean; label: string}> = [
    {hint: undefined, three: true, four: true, label: 'no hint: three OR four (documented: valid at three digits even on an Amex)'},
    {hint: 'Visa', three: true, four: true, label: 'Visa: three; a fourth digit is not accepted by the field'},
    {hint: 'American Express', three: false, four: true, label: 'American Express (spaced): four only'},
    {hint: 'amex', three: false, four: true, label: 'amex: four only'},
    {hint: 'AmericanExpress', three: false, four: true, label: 'AmericanExpress (as list-payment-methods spells it): four only'},
    {hint: 'NotARealNetwork', three: true, four: true, label: 'unrecognised: three OR four'},
  ];

  for (const {hint, three, four, label} of cases) {
    it(label, async () => {
      const seen: VaultCVCState[] = [];
      const {tree} = await mount({cardNetwork: hint, onStateChange: (s) => seen.push(s)});
      await type(tree, '123');
      expect(seen[seen.length - 1].valid).toBe(three);
      await type(tree, '1234');
      expect(seen[seen.length - 1].valid).toBe(four);
      if (hint === 'Visa') {
        /* The field truncates to the network's maximum, so the fourth digit never lands. */
        expect(cvcInput(tree).props.value).toBe('123');
      }
    });
  }
});
