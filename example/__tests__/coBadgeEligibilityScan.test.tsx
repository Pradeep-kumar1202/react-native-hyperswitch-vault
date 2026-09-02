/**
 * The three behaviours that MOVED into the library when it took over the non-vault flow.
 *
 * Each of them used to live in client-core, and each depended on client-core holding a PAN. They
 * are the reason "just render the library instead" was not the whole job: a form that compiles and
 * takes a payment, but silently drops the customer's network choice, their scanner and their
 * merchant's eligibility rule, is a regression dressed as a migration.
 *
 *   CO-BADGE      a card matching two networks lets the customer pick; the pick reaches the wire
 *                 as `card_network` and changes nothing that is observable from outside.
 *   ELIGIBILITY   the library asks the backend about the BIN, inline as the number completes and
 *                 again before it confirms.
 *   SCAN          the optional native scanner feeds the library's own fields.
 *
 * What is asserted throughout: none of it creates a route out. There is no callback carrying the
 * selected network, no prop reporting eligibility, and no result member for either.
 */
import * as React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {TextInput} from 'react-native';
import {
  HyperswitchVaultForm,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';
/*
 * Live eligibility and the payment flows are the checkout SDK's contract, so the handle is typed
 * from ./host (vault ADR-0010). The ready-made form is the same runtime object under either type.
 */
import type {HostFormHandle} from '@juspay-tech/react-native-hyperswitch-vault/host';

/* Matches RuPay AND Discover, is Luhn-valid, and is 16 digits — all three are needed. */
const CO_BADGED = '6522000000000006';
/* Matches Visa alone. */
const SINGLE = '4242424242424242';
const EXPIRY = `12${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;
const CVC = '123';

const INTENT = 'intent-credential';
const DIRECT_CONFIRM = {
  cardSource: {type_: 'direct'} as const,
  paymentId: 'pay_123',
  sdkAuthorization: INTENT,
};

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toBase64 = (input: string) => {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const chunk =
      (input.charCodeAt(i) << 16) +
      ((i + 1 < input.length ? input.charCodeAt(i + 1) : 0) << 8) +
      (i + 2 < input.length ? input.charCodeAt(i + 2) : 0);
    out +=
      BASE64[(chunk >> 18) & 63] +
      BASE64[(chunk >> 12) & 63] +
      (i + 1 < input.length ? BASE64[(chunk >> 6) & 63] : '=') +
      (i + 2 < input.length ? BASE64[chunk & 63] : '=');
  }
  return out;
};

const session = {
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: toBase64(
        [
          'publishable_key=pk_snd_EXAMPLE_FAKE',
          'payment_method_session_id=pms_fake_cobadge',
          'profile_id=pro_EXAMPLE_FAKE',
        ].join(','),
      ),
    },
  },
} as unknown as MerchantSession;

type Call = {url: string; options: any};
let calls: Call[] = [];
let eligibilityVerdict: unknown = {sdk_next_action: {next_action: 'confirm'}};

const stubFetch = () => {
  calls = [];
  (global as any).fetch = jest.fn((url: string, options: any) => {
    calls.push({url, options});
    if (url.includes('/eligibility')) {
      return Promise.resolve({ok: true, status: 200, json: async () => eligibilityVerdict});
    }
    if (url.includes('payment-method-sessions')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          associated_payment_methods: [{payment_method_token: {data: 'tok_fake'}}],
          payment_method_data: {card: {last4_digits: '0006', card_isin: '652200'}},
        }),
      });
    }
    return Promise.resolve({ok: true, status: 200, json: async () => ({status: 'succeeded'})});
  });
};

beforeEach(() => {
  eligibilityVerdict = {sdk_next_action: {next_action: 'confirm'}};
  stubFetch();
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) {
    try {
      ReactTestRenderer.act(() => mounted.pop()!.unmount());
    } catch {
      /* already unmounted by the test */
    }
  }
});

const inputs = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(TextInput);
const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  inputs(r).find(i => i.props.testID === id)!;

type MountOptions = {
  enabledCardSchemes?: string[];
  eligibility?: {paymentId: string; sdkAuthorization: string; appId?: string};
  withSession?: boolean;
};

const mount = (options: MountOptions = {}) => {
  const formRef = React.createRef<HostFormHandle>();
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultForm
        ref={formRef}
        environment="sandbox"
        {...(options.withSession ? {session} : {})}
        {...(options.enabledCardSchemes ? {enabledCardSchemes: options.enabledCardSchemes} : {})}
        {...(options.eligibility ? {eligibility: options.eligibility} : {})}
        fieldOptions={{
          cardNumber: {errorDisplay: 'inline'},
          expiry: {errorDisplay: 'inline'},
          cvc: {errorDisplay: 'inline'},
        }}
      />,
    );
  });
  mounted.push(r);
  return {r, formRef};
};

const fill = (r: ReactTestRenderer.ReactTestRenderer, pan: string) => {
  ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId').props.onChangeText(pan));
  ReactTestRenderer.act(() => byId(r, 'ExpiryInputTestId').props.onChangeText(EXPIRY));
  ReactTestRenderer.act(() => byId(r, 'CVCInputTestId').props.onChangeText(CVC));
};

/*
 * `findAll` returns every node carrying the testID, and a Pressable contributes several (the
 * component, its host view, and the wrappers between). Counting them would be counting an
 * implementation detail, so presence/absence is what these tests assert; `pressable` picks the one
 * node that actually has the handler.
 */
const findByTestId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll(node => node.props?.testID === id, {deep: true});

const pressable = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  findByTestId(r, id).find(node => typeof node.props?.onPress === 'function')!;

/* ══ CO-BADGE ═══════════════════════════════════════════════════════════════ */

describe('co-badge network selection', () => {
  it('offers no chooser for a single-network card', () => {
    const {r} = mount();
    fill(r, SINGLE);
    expect(findByTestId(r, 'CardNetworkTriggerTestId')).toHaveLength(0);
  });

  it('offers a chooser once a co-badged number is complete', () => {
    const {r} = mount();
    fill(r, CO_BADGED);
    expect(findByTestId(r, 'CardNetworkTriggerTestId').length).toBeGreaterThan(0);
  });

  it('does not offer one while the number is still too short to be sure', () => {
    const {r} = mount();
    /* The same prefix, but under the 16-digit threshold the match set is still narrowing. */
    ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId').props.onChangeText('652200'));
    expect(findByTestId(r, 'CardNetworkTriggerTestId')).toHaveLength(0);
  });

  it('narrows the offered schemes to those the merchant accepts, and drops the chooser at one', () => {
    const {r} = mount({enabledCardSchemes: ['RuPay']});
    fill(r, CO_BADGED);
    /* Only one acceptable network left, so there is no choice to offer. */
    expect(findByTestId(r, 'CardNetworkTriggerTestId')).toHaveLength(0);
  });

  it('sends the chosen network as card_network in a direct confirm', async () => {
    const {r, formRef} = mount();
    fill(r, CO_BADGED);

    ReactTestRenderer.act(() => pressable(r, 'CardNetworkTriggerTestId').props.onPress({}));
    ReactTestRenderer.act(() => pressable(r, 'CardNetworkOption-Discover').props.onPress({}));

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    const card = JSON.parse(calls[0].options.body).payment_method_data.card;
    expect(card.card_network).toBe('Discover');
  });

  it('sends the detected network when the customer makes no choice', async () => {
    const {r, formRef} = mount();
    fill(r, CO_BADGED);

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    /* RuPay is the first match; the customer simply did not override it. */
    expect(JSON.parse(calls[0].options.body).payment_method_data.card.card_network).toBe('RuPay');
  });

  it('sends no card_network at all for a single-network card', async () => {
    const {r, formRef} = mount();
    fill(r, SINGLE);
    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });
    const card = JSON.parse(calls[0].options.body).payment_method_data.card;
    expect('card_network' in card).toBe(false);
  });

  it('rejects a network the merchant does not accept, without sending anything', async () => {
    /*
     * The customer's card matches RuPay and Discover; the merchant accepts neither. This is the
     * `unsupportedCard` rule, which could only ever be evaluated where the PAN is.
     */
    const {r, formRef} = mount({enabledCardSchemes: ['Visa', 'Mastercard']});
    fill(r, CO_BADGED);

    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    expect(result.status).toBe('validation_error');
    expect(calls).toHaveLength(0);
  });

  it('retires a stale choice when the number changes to a card that cannot support it', async () => {
    const {r, formRef} = mount();
    fill(r, CO_BADGED);
    ReactTestRenderer.act(() => pressable(r, 'CardNetworkTriggerTestId').props.onPress({}));
    ReactTestRenderer.act(() => pressable(r, 'CardNetworkOption-Discover').props.onPress({}));

    /* Now type a Visa-only number over it. */
    fill(r, SINGLE);

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    const body = calls[0].options.body;
    expect(body).not.toContain('Discover');
    expect(JSON.parse(body).payment_method_data.card.card_network).toBeUndefined();
  });

  it('sends the chosen network to the VAULT confirm too, not only the direct one', async () => {
    /*
     * The gap this closes: the selector used to be a control that changed nothing in the tokenized
     * flow, because `card_network` was not sent on the payment-method-session confirm. It IS
     * accepted there — `PaymentMethodSessionConfirmRequest.payment_method_data` carries the same
     * card object the payment confirm does — so a customer's choice now reaches the saved card.
     */
    const {r, formRef} = mount({withSession: true});
    fill(r, CO_BADGED);

    ReactTestRenderer.act(() => pressable(r, 'CardNetworkTriggerTestId').props.onPress({}));
    ReactTestRenderer.act(() => pressable(r, 'CardNetworkOption-Discover').props.onPress({}));

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment({
        cardSource: {type_: 'vault', session},
        paymentId: 'pay_123',
        sdkAuthorization: INTENT,
      });
    });

    const pms = calls.find(c => c.url.includes('payment-method-sessions'))!;
    expect(JSON.parse(pms.options.body).payment_method_data.card.card_network).toBe('Discover');
  });

  it('sends it on tokenize() as well', async () => {
    const {r, formRef} = mount({withSession: true});
    fill(r, CO_BADGED);
    ReactTestRenderer.act(() => pressable(r, 'CardNetworkTriggerTestId').props.onPress({}));
    ReactTestRenderer.act(() => pressable(r, 'CardNetworkOption-Discover').props.onPress({}));

    await ReactTestRenderer.act(async () => {
      await formRef.current!.tokenize();
    });

    expect(JSON.parse(calls[0].options.body).payment_method_data.card.card_network).toBe('Discover');
  });

  it('omits a network the backend enum has no member for, rather than 400ing the payment', async () => {
    /*
     * `BAJAJ` and `SODEXO` are schemes this library can detect and `common_enums::CardNetwork`
     * cannot represent. Sending one would fail an enum parse and reject a payment that otherwise
     * works; the backend derives the brand from the PAN anyway, so the field is simply omitted.
     */
    const {r, formRef} = mount();
    /* A Sodexo-range number: detected by the library, absent from the backend enum. */
    ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId').props.onChangeText('6371000000000000'));
    ReactTestRenderer.act(() => byId(r, 'ExpiryInputTestId').props.onChangeText(EXPIRY));
    ReactTestRenderer.act(() => byId(r, 'CVCInputTestId').props.onChangeText(CVC));

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    if (calls.length > 0) {
      const body = calls[0].options.body;
      expect(body).not.toContain('SODEXO');
      expect(body).not.toContain('BAJAJ');
    }
  });

  it('publishes nothing about the selection', () => {
    const {r} = mount();
    fill(r, CO_BADGED);
    const form = r.root.findByProps({environment: 'sandbox'});
    /* No callback prop of any kind, so no channel for the choice to travel out on. */
    for (const key of Object.keys(form.props)) {
      expect(key).not.toMatch(/^on[A-Z]/);
    }
    expect(JSON.stringify(Object.keys(form.props))).not.toMatch(/network|brand(?!IconMode)/i);
  });
});

/* ══ ELIGIBILITY ════════════════════════════════════════════════════════════ */

describe('library-owned eligibility', () => {
  const eligibility = {paymentId: 'pay_123', sdkAuthorization: INTENT, appId: 'com.example'};

  it('probes as the number completes, with the PAN only the library holds', async () => {
    const {r} = mount({eligibility});
    await ReactTestRenderer.act(async () => {
      byId(r, 'CardNumberInputTestId').props.onChangeText(SINGLE);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/payments/pay_123/eligibility');
    expect(JSON.parse(calls[0].options.body).payment_method_data.card.card_number).toBe(SINGLE);
  });

  it('does not probe at all when the merchant has no eligibility step', async () => {
    const {r} = mount();
    await ReactTestRenderer.act(async () => {
      byId(r, 'CardNumberInputTestId').props.onChangeText(SINGLE);
    });
    expect(calls).toHaveLength(0);
  });

  it('does not probe on a partial number', async () => {
    const {r} = mount({eligibility});
    await ReactTestRenderer.act(async () => {
      byId(r, 'CardNumberInputTestId').props.onChangeText('424242');
    });
    expect(calls).toHaveLength(0);
  });

  it('blocks the confirm on a denial and sends no payment request', async () => {
    eligibilityVerdict = {sdk_next_action: {next_action: 'deny'}};
    const {r, formRef} = mount({eligibility});
    await ReactTestRenderer.act(async () => fill(r, SINGLE));

    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment({...DIRECT_CONFIRM, eligibilityRequired: true});
    });

    expect(result.status).toBe('failed');
    expect(result.error.code).toBe('card_not_eligible');
    /* The probe request only. Nothing was confirmed. */
    expect(calls.filter(c => c.url.includes('/confirm'))).toHaveLength(0);
  });

  it('reuses the probe verdict rather than asking twice for one card', async () => {
    const {r, formRef} = mount({eligibility});
    await ReactTestRenderer.act(async () => fill(r, SINGLE));
    expect(calls.filter(c => c.url.includes('/eligibility'))).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment({...DIRECT_CONFIRM, eligibilityRequired: true});
    });

    expect(calls.filter(c => c.url.includes('/eligibility'))).toHaveLength(1);
    expect(calls.filter(c => c.url.includes('/payments/pay_123/confirm'))).toHaveLength(1);
  });

  it('checks at confirm time even when no live probe was configured', async () => {
    eligibilityVerdict = {sdk_next_action: {next_action: 'deny'}};
    /* No `eligibility` prop: the inline message is forgone, the enforcement is not. */
    const {r, formRef} = mount();
    await ReactTestRenderer.act(async () => fill(r, SINGLE));
    expect(calls).toHaveLength(0);

    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment({...DIRECT_CONFIRM, eligibilityRequired: true});
    });

    expect(calls.filter(c => c.url.includes('/eligibility'))).toHaveLength(1);
    expect(result.error.code).toBe('card_not_eligible');
    expect(calls.filter(c => c.url.includes('/payments/pay_123/confirm'))).toHaveLength(0);
  });

  it('confirms normally when the check is not requested, even with a denying backend', async () => {
    eligibilityVerdict = {sdk_next_action: {next_action: 'deny'}};
    const {r, formRef} = mount();
    await ReactTestRenderer.act(async () => fill(r, SINGLE));

    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    /* `eligibilityRequired` is the merchant saying this payment HAS that step. */
    expect(result.status).toBe('succeeded');
    expect(calls.filter(c => c.url.includes('/eligibility'))).toHaveLength(0);
  });

  it('gates the vault flow too, before anything is tokenized', async () => {
    eligibilityVerdict = {sdk_next_action: {next_action: 'deny'}};
    const {r, formRef} = mount({withSession: true});
    await ReactTestRenderer.act(async () => fill(r, SINGLE));

    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment({
        cardSource: {type_: 'vault', session},
        paymentId: 'pay_123',
        sdkAuthorization: INTENT,
        eligibilityRequired: true,
      });
    });

    expect(result.error.code).toBe('card_not_eligible');
    /* Crucially: the card was never vaulted. A denied card must not end up saved. */
    expect(calls.filter(c => c.url.includes('payment-method-sessions'))).toHaveLength(0);
  });

  it('allows the payment through when the probe cannot be reached', async () => {
    /*
     * The deliberate fail-open. Eligibility is a routing preference, not an authorization control,
     * and the backend still refuses an ineligible card at confirm time — so a dropped packet must
     * not become a declined checkout. Asserted here so the choice stays visible.
     */
    (global as any).fetch = jest.fn((url: string, options: any) => {
      calls.push({url, options});
      if (url.includes('/eligibility')) return Promise.reject(new Error('network down'));
      return Promise.resolve({ok: true, status: 200, json: async () => ({status: 'succeeded'})});
    });

    const {r, formRef} = mount();
    await ReactTestRenderer.act(async () => fill(r, SINGLE));

    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment({...DIRECT_CONFIRM, eligibilityRequired: true});
    });

    expect(result.status).toBe('succeeded');
  });

  it('publishes no eligibility state', async () => {
    eligibilityVerdict = {sdk_next_action: {next_action: 'deny'}};
    const {r, formRef} = mount({eligibility});
    await ReactTestRenderer.act(async () => fill(r, SINGLE));

    /*
     * `eligibility` is an INPUT — where to ask, supplied by the host. What must not exist is an
     * output: no callback of any kind, so no channel for the verdict to travel back on.
     */
    const form = r.root.findByProps({environment: 'sandbox'});
    for (const key of Object.keys(form.props)) {
      expect(key).not.toMatch(/^on[A-Z]/);
    }

    /* The only route to the verdict is the result of a call the host asked for. */
    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment({...DIRECT_CONFIRM, eligibilityRequired: true});
    });
    expect(Object.keys(result).sort()).toEqual(['error', 'status']);
  });
});

/* ══ SCAN CARD ══════════════════════════════════════════════════════════════ */

describe('scan card', () => {
  it('offers no scan button when the optional package is not installed', () => {
    /*
     * The default in this repository and for most merchants:
     * `@juspay-tech/react-native-hyperswitch-scancard` is not a dependency, the `require` inside
     * `ScanCardBridge` throws, and `isAvailable` is false. No button, and no error either.
     */
    const {r} = mount();
    expect(findByTestId(r, 'ScanCardButtonTestId')).toHaveLength(0);
  });

  it('renders nothing extra in the accessory slot when there is nothing to show', () => {
    /* brandIconMode defaults to hidden, so with no chooser and no scanner the slot is empty. */
    const {r} = mount();
    fill(r, SINGLE);
    expect(findByTestId(r, 'ScanCardButtonTestId')).toHaveLength(0);
    expect(findByTestId(r, 'CardNetworkTriggerTestId')).toHaveLength(0);
  });
});
