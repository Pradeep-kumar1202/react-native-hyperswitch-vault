/**
 * `unstyled` — the escape hatch back to a plain text input.
 *
 * The distinction this file exists to hold: `unstyled` means the chrome is NOT RENDERED, never
 * styled flat. ADR-0004 makes that binding — a node that is merely zeroed out is still mounted,
 * still in the layout, and (for an input) still focusable and still announced. So the assertions
 * here are structural and DIFFERENTIAL: the unstyled tree must be strictly smaller, not merely
 * different.
 *
 * What must survive is behaviour and accessibility, never decoration.
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
} from '@juspay-tech/react-native-hyperswitch-vault';

const session = {
  session_token: [],
  payment_id: 'pay_unstyled',
  sdk_authorization: 'a',
  vault_details: {vault_type: 'hyperswitch', vault_data: {sdk_authorization: 'x'}},
} as unknown as MerchantSession;

const flat = (style: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

type Options = {formWide?: boolean; numberOverride?: boolean};

const mount = ({formWide, numberOverride}: Options = {}) => {
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(
      <HyperswitchVaultFormProvider session={session} environment="sandbox" unstyled={formWide}>
        <CardNumberField testID="num" unstyled={numberOverride} />
        <CardExpiryField testID="exp" />
        <CardCVCField testID="cvc" />
      </HyperswitchVaultFormProvider>,
    );
  });
  return r;
};

const inputs = (r: Renderer) => r.root.findAll((n) => n.type === TextInput);
const by = (r: Renderer, id: string) => inputs(r).find((i) => i.props.testID === id)!;
/* Any View that actually paints a box. */
const boxes = (r: Renderer) =>
  r.root.findAll((n) => {
    if (n.type !== View) return false;
    const s = flat(n.props.style);
    return s.borderTopWidth !== undefined || s.borderWidth !== undefined;
  });
const size = (r: Renderer) => JSON.stringify(r.toJSON()).length;

it('renders no bordered box when unstyled, and a strictly smaller tree', () => {
  const styled = mount();
  const bare = mount({formWide: true});

  expect(boxes(styled).length).toBeGreaterThan(0);
  expect(boxes(bare)).toHaveLength(0);

  /*
   * Differential. A styled-flat box would leave the node count unchanged and pass a
   * "borderWidth === 0" assertion, which is exactly the failure mode ADR-0004 forbids.
   */
  expect(size(bare)).toBeLessThan(size(styled));

  /* The inputs themselves are all still there — this removes chrome, not fields. */
  expect(inputs(bare)).toHaveLength(3);

  ReactTestRenderer.act(() => styled.unmount());
  ReactTestRenderer.act(() => bare.unmount());
});

it('keeps behaviour and accessibility when unstyled', () => {
  const styled = mount();
  const bare = mount({formWide: true});

  for (const id of ['num', 'exp', 'cvc']) {
    const before = by(styled, id).props;
    const after = by(bare, id).props;

    /* Accessibility is not decoration. */
    expect(after.accessibilityLabel).toBe(before.accessibilityLabel);
    expect(after.accessibilityLabel).toBeTruthy();
    expect(after.testID).toBe(before.testID);

    /* Nor is input behaviour. */
    expect(after.keyboardType).toBe(before.keyboardType);
    expect(after.maxLength).toBe(before.maxLength);
    expect(after.secureTextEntry).toBe(before.secureTextEntry);
    expect(after.autoCorrect).toBe(false);
    expect(after.autoCapitalize).toBe('none');
  }

  /* The CVC is still masked — the single most important thing not to lose here. */
  expect(by(bare, 'cvc').props.secureTextEntry).toBe(true);

  ReactTestRenderer.act(() => styled.unmount());
  ReactTestRenderer.act(() => bare.unmount());
});

it('still accepts input and formats it when unstyled', () => {
  const r = mount({formWide: true});
  ReactTestRenderer.act(() => by(r, 'num').props.onChangeText('4242424242424242'));

  /* Formatting is library behaviour, not chrome: the value comes back spaced. */
  expect(by(r, 'num').props.value.length).toBeGreaterThan(16);

  ReactTestRenderer.act(() => r.unmount());
});

it('lets one field opt back in inside an unstyled provider', () => {
  const r = mount({formWide: true, numberOverride: false});

  /*
   * Precedence is field -> provider -> false, so `unstyled={false}` on the card number wins over
   * the provider's `unstyled`. Exactly one field keeps its box.
   */
  expect(boxes(r)).toHaveLength(1);

  ReactTestRenderer.act(() => r.unmount());
});

it('lets one field opt out inside a styled provider', () => {
  const r = mount({numberOverride: true});

  /* The mirror case: three fields, one of them bare. */
  expect(boxes(r).length).toBeGreaterThan(0);
  expect(boxes(r).length).toBeLessThan(boxes(mount()).length);

  ReactTestRenderer.act(() => r.unmount());
});
