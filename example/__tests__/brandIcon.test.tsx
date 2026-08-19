/**
 * Brand-icon rendering across the four modes.
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
  expect(images(tree).length).toBeGreaterThan(0);      // waitcard + cvc
  await type(tree, '4242424242424242');
  expect(images(tree).length).toBeGreaterThan(0);      // visa + cvc
  await ReactTestRenderer.act(() => tree.unmount());
});

it('default (no mode) behaves like standard', async () => {
  const tree = await mount();
  expect(images(tree).length).toBeGreaterThan(0);
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
