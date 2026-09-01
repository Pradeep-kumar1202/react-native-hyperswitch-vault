/**
 * Error presentation is one switch, and it is the merchant's colour.
 *
 * `errorDisplay` used to govern the error MESSAGE only, so a merchant got no message and a red
 * field anyway — a judgement painted onto their form in a colour they never chose. One switch now
 * governs the message, the border and the typed text together.
 *
 * The DEFAULT is `inline`: a form that configures nothing shows its errors, in the `errorColor`
 * passed on `appearance`. `errorDisplay="none"` paints nothing and the merchant hears about the
 * problem through the state event instead.
 *
 * Sensitive values are compared as booleans inside this file only.
 *
 * @format
 */
import React from 'react';
import {View, TextInput, StyleSheet} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type MerchantSession,
  type VaultFormAppearance,
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
  payment_id: 'pay_error_presentation',
  sdk_authorization: 'intent_auth_error_presentation',
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: b64(
        'publishable_key=pk_snd_EXAMPLE_FAKE,payment_method_session_id=pms_err,profile_id=pro_X',
      ),
    },
  },
} as unknown as MerchantSession;

/* Distinctive so a match cannot be a coincidence, and plainly not the library's own #DF1B41. */
const MERCHANT_ERROR = '#123456';
const MERCHANT_BORDER = '#ABCDEF';
const MERCHANT_TEXT = '#654321';

const appearance: VaultFormAppearance = {
  errorColor: MERCHANT_ERROR,
  borderColor: MERCHANT_BORDER,
  textColor: MERCHANT_TEXT,
};

/* An invalid PAN: correct length, fails the Luhn check. */
const BAD_NUMBER = '4242424242424241';

const flat = (style: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

/* `undefined` exercises the DEFAULT, which is now `inline`. */
const mount = (errorDisplay?: 'none' | 'inline') => {
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider session={session} environment="sandbox" appearance={appearance}>
        <CardNumberField testID="num" errorDisplay={errorDisplay} />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
      </HyperswitchVaultFormProvider>,
    );
  });
  return r;
};

const numberInput = (r: Renderer) =>
  r.root.findAll((n) => n.type === TextInput).find((i) => i.props.testID === 'num')!;

/* The bordered container is the nearest View that actually carries a borderColor. */
const borderedContainer = (r: Renderer) =>
  r.root.findAll((n) => n.type === View && flat(n.props.style).borderColor !== undefined)[0];

const enterBadNumberAndBlur = (r: Renderer) => {
  ReactTestRenderer.act(() => numberInput(r).props.onChangeText(BAD_NUMBER));
  ReactTestRenderer.act(() => numberInput(r).props.onBlur());
};

it('paints nothing when errorDisplay is none', () => {
  const r = mount('none');
  enterBadNumberAndBlur(r);

  /* Not the merchant's error colour, and not the library's old #DF1B41 either. */
  const border = flat(borderedContainer(r).props.style).borderColor;
  expect(border).toBe(MERCHANT_BORDER);
  expect(border).not.toBe(MERCHANT_ERROR);
  expect(String(border).toUpperCase()).not.toBe('#DF1B41');

  expect(flat(numberInput(r).props.style).color).toBe(MERCHANT_TEXT);

  ReactTestRenderer.act(() => r.unmount());
});

it('paints border and text in the merchant colour by default', () => {
  const r = mount();
  enterBadNumberAndBlur(r);

  expect(flat(borderedContainer(r).props.style).borderColor).toBe(MERCHANT_ERROR);
  expect(flat(numberInput(r).props.style).color).toBe(MERCHANT_ERROR);

  ReactTestRenderer.act(() => r.unmount());
});

it('leaves a VALID field alone under either setting', () => {
  for (const mode of [undefined, 'none' as const]) {
    const r = mount(mode);
    ReactTestRenderer.act(() => numberInput(r).props.onChangeText('4242424242424242'));
    ReactTestRenderer.act(() => numberInput(r).props.onBlur());

    expect(flat(borderedContainer(r).props.style).borderColor).toBe(MERCHANT_BORDER);
    expect(flat(numberInput(r).props.style).color).toBe(MERCHANT_TEXT);

    ReactTestRenderer.act(() => r.unmount());
  }
});
