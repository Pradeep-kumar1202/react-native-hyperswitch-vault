/**
 * The bare-minimum independent-fields screen.
 *
 * Sensitive values are asserted as booleans inside this file only. Nothing is printed or
 * snapshotted, and no failure message can carry a card value.
 *
 * @format
 */
import React from 'react';
import {Button, TextInput} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {BareMinimumFields} from '../src/BareMinimumFields';

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
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: b64(
        'publishable_key=pk_snd_EXAMPLE_FAKE,payment_method_session_id=pms_bare,profile_id=pro_X',
      ),
    },
  },
} as unknown as MerchantSession;

/* Private test data. Never rendered into an assertion message. */
const CARD = {number: '4242424242424242', expiry: '12/30', cvc: '123'};
const TOKEN = 'tok_bare_minimum';

let calls: {settle: (body: unknown, status?: number) => void}[] = [];

beforeEach(() => {
  calls = [];
  jest.useFakeTimers();
  (globalThis as any).fetch = jest.fn(() => {
    let settle: any = () => {};
    const p = new Promise((res) => {
      settle = (body: unknown, status = 200) =>
        res({ok: status < 300, status, json: async () => body});
    });
    calls.push({settle});
    return p;
  });
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

const mount = (onTokenized: (token: string) => void = () => {}) => {
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <BareMinimumFields session={session} onTokenized={onTokenized} />,
    );
  });
  return r;
};

const inputs = (r: Renderer) => r.root.findAll((n) => n.type === TextInput);
const by = (r: Renderer, id: string) => inputs(r).find((i) => i.props.testID === id)!;
const button = (r: Renderer) => r.root.findByType(Button);
const fill = (r: Renderer) => {
  ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText(CARD.number));
  ReactTestRenderer.act(() => by(r, 'ExpiryInputTestId').props.onChangeText(CARD.expiry));
  ReactTestRenderer.act(() => by(r, 'CVCInputTestId').props.onChangeText(CARD.cvc));
};

it('renders the three independent fields and nothing optional', () => {
  const r = mount();

  expect(r.root.findAllByType(CardNumberField)).toHaveLength(1);
  expect(r.root.findAllByType(CardExpiryField)).toHaveLength(1);
  expect(r.root.findAllByType(CardCVCField)).toHaveLength(1);

  /* three empty inputs, and no field carries an optional presentation prop */
  expect(inputs(r)).toHaveLength(3);
  for (const i of inputs(r)) expect(i.props.value).toBe('');
  for (const type of [CardNumberField, CardExpiryField, CardCVCField]) {
    expect(Object.keys(r.root.findAllByType(type)[0].props)).toEqual([]);
  }

  ReactTestRenderer.act(() => r.unmount());
});

it('the Tokenize button follows canSubmit', () => {
  const r = mount();
  expect(button(r).props.disabled).toBe(true);
  fill(r);
  expect(button(r).props.disabled).toBe(false);
  ReactTestRenderer.act(() => r.unmount());
});

it('tokenizes successfully and hands back only the token', async () => {
  const tokens: unknown[] = [];
  const r = mount((token) => tokens.push(token));
  fill(r);

  await ReactTestRenderer.act(async () => {
    const pressed = button(r).props.onPress();
    calls[0].settle({
      associated_payment_methods: [{payment_method_token: {data: TOKEN}}],
    });
    await pressed;
  });

  /* exactly one tokenization request, and the callback received exactly the token */
  expect(calls).toHaveLength(1);
  expect(tokens).toEqual([TOKEN]);
  expect(typeof tokens[0]).toBe('string');

  /*
   * The public result is token-only: nothing else reached the merchant.
   *
   * The walk covers the callback arguments and the rendered tree MINUS each card field's own
   * `TextInput.value`. That value is what the library draws inside the field it owns, so counting
   * it would make the assertion vacuously false; the question is whether the digits reach anywhere
   * the merchant controls.
   */
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const n = node as {type?: string; props?: Record<string, unknown>; children?: unknown};
    const props = {...(n.props ?? {})};
    if (n.type === 'TextInput') delete props.value;
    return {type: n.type, props, children: strip(n.children)};
  };
  const observable = JSON.stringify({tokens, rendered: strip(r.toJSON())});
  const SECRETS = [
    CARD.number, '4242 4242 4242 4242', CARD.number.slice(0, 6), CARD.number.slice(-4),
    CARD.expiry, CARD.cvc, 'pk_snd_EXAMPLE_FAKE', 'pms_bare', 'sdk_authorization',
  ];
  SECRETS.forEach((secret, index) => {
    /* boolean only — the value itself never reaches a failure message */
    expect({index, leaked: observable.includes(secret)}).toEqual({index, leaked: false});
  });
  /* the search is not vacuous */
  expect(JSON.stringify({a: `xx${CARD.cvc}xx`}).includes(CARD.cvc)).toBe(true);

  ReactTestRenderer.act(() => r.unmount());
});

it('a refused submit calls nothing back', async () => {
  const tokens: unknown[] = [];
  const r = mount((token) => tokens.push(token));
  fill(r);

  await ReactTestRenderer.act(async () => {
    const pressed = button(r).props.onPress();
    calls[0].settle({error: {type: 'invalid_request', message: 'nope'}}, 400);
    await pressed;
  });

  expect(tokens).toEqual([]);
  ReactTestRenderer.act(() => r.unmount());
});
