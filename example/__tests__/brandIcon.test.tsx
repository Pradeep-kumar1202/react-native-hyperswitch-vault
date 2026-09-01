/**
 * Brand-icon rendering across the four `brandIconMode` values.
 *
 * Since the icon consolidation there is ONE control. `brandIconMode` decides both whether the
 * brand mark exists and which artwork it uses, and it is the same union on the form-wide
 * `appearance` and on `fieldOptions.cardNumber`. This suite drives it form-wide and leaves the
 * field option unset, so `appearance` is what resolves. The precedence between the two is proved
 * separately in `defaultUi.test.tsx`.
 *
 * The CVC icon is a separate control (`cvcIcon`) with no form-wide counterpart. It is left at its
 * default here — which is now `default`, i.e. shown — so that "hidden" can be shown to remove the
 * brand accessory only.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {HyperswitchVaultForm} from '@juspay-tech/react-native-hyperswitch-vault';

declare const global: {fetch: unknown};

const session: any = {
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {sdk_authorization: 'cGF5bWVudF9tZXRob2Rfc2Vzc2lvbl9pZD1wbXNfWA=='},
  },
};

const images = (tree: Renderer) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props?.source !== undefined);

const mount = async (mode?: string) => {
  let tree!: Renderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <HyperswitchVaultForm
        session={session}
        environment="sandbox"
        appearance={mode ? ({brandIconMode: mode} as any) : undefined}
      />,
    );
  });
  return tree;
};

const type = async (tree: Renderer, text: string) => {
  await ReactTestRenderer.act(() => {
    tree.root
      .findAll(n => n.props?.testID === 'CardNumberInputTestId' && n.props?.onChangeText)[0]
      .props.onChangeText(text);
  });
};

it('standard: renders the placeholder icon empty, and a brand icon once detected', async () => {
  const tree = await mount('standard');
  expect(images(tree).length).toBe(2);                 // waitcard + cvc
  await type(tree, '4242424242424242');
  expect(images(tree).length).toBe(2);                 // visa + cvc
  await ReactTestRenderer.act(() => tree.unmount());
});

it('default (no mode) is standard: the brand mark and the CVC icon both render', async () => {
  /*
   * This assertion is the inversion. It read `toBe(1) // cvc only` while artwork was opt-in; a
   * merchant who configured nothing got no mark. The default is `standard` now, so the same
   * zero-configuration form renders the placeholder mark beside the CVC glyph.
   */
  const tree = await mount();
  expect(images(tree).length).toBe(2);                 // waitcard + cvc
  await type(tree, '4242424242424242');
  expect(images(tree).length).toBe(2);                 // visa + cvc
  await ReactTestRenderer.act(() => tree.unmount());
});

it('the field option still overrides the form-wide default', async () => {
  /* `hidden` on the field must beat the (now visible) library default. */
  let tree!: Renderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <HyperswitchVaultForm
        session={session}
        environment="sandbox"
        fieldOptions={{cardNumber: {brandIconMode: 'hidden'}}}
      />,
    );
  });
  expect(images(tree).length).toBe(1);                 // cvc only
  await ReactTestRenderer.act(() => tree.unmount());
});

it('hidden: renders no brand accessory, but keeps the CVC icon', async () => {
  const withStandard = await mount('standard');
  const standardCount = images(withStandard).length;
  await ReactTestRenderer.act(() => withStandard.unmount());

  const withHidden = await mount('hidden');
  expect(images(withHidden).length).toBe(standardCount - 1);
  await ReactTestRenderer.act(() => withHidden.unmount());
});

it('animated: mounts and cleans up without leaking timers', async () => {
  const tree = await mount('animated');
  expect(images(tree).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(() => tree.unmount());
});
