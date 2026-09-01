/**
 * Merchant facade contract (ADR-0002 §1–§3, Phase 1).
 *
 * The canonical field names, the handle type aliases and the `HyperswitchVault` namespace are
 * naming only: they must resolve to the EXACT SAME component objects the existing names resolve to,
 * and they must render and behave identically.
 *
 * Two things this file proves that a type check cannot:
 *
 *   1. `===` identity. A wrapper component would type-check, render the same tree and pass every
 *      structural assertion, while silently breaking React.memo identity, devtools naming and any
 *      merchant `===` comparison. Identity is the only assertion that rules a wrapper out.
 *   2. Behavioural equivalence. Mounting through the namespace must produce the same rendered tree
 *      and the same working handle as mounting through the legacy names.
 *
 * Rendered from the PUBLISHED package (resolved by name through its `exports` map) with the real
 * React Native jest preset. `fetch` is stubbed as in the sibling suites: no network call is made
 * and no real credential exists anywhere in this file.
 *
 * @format
 */
import React from 'react';
import {View} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  /* existing published names */
  HyperswitchVaultForm,
  HyperswitchVaultFormProvider,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  CardholderNameWidget,
  type HyperswitchVaultFormHandle,
  type WidgetHandle,
  /* Phase 1 additions */
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardholderNameField,
  HyperswitchVault,
  type VaultFieldHandle,
  type VaultFormHandle,
  type MerchantSession,
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

/* The two non-card values `submit()` requires. Neither is a real credential. */
const PAYMENT = {paymentId: 'pay_facade_fake', sdkAuthorization: 'intent_auth_facade_fake'};

/* Flow 2 — the vault source, which is what this facade suite exercises. */
const paymentWith = (s: MerchantSession) => ({...PAYMENT, cardSource: {type_: 'vault' as const, session: s}});

const session: MerchantSession = {
  session_token: [],
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: toBase64(
        [
          'publishable_key=pk_snd_EXAMPLE_FAKE',
          'payment_method_session_id=pms_facade_fake',
          'profile_id=pro_EXAMPLE_FAKE',
        ].join(','),
      ),
    },
  },
};

beforeEach(() => {
  (global as any).fetch = jest.fn(() => new Promise(() => {}));
});

/* ── 1. Runtime identity — the assertions that rule out a wrapper ─────────── */

describe('canonical field names are the existing components', () => {
  it.each([
    ['CardNumberField', CardNumberField, 'CardNumberWidget', CardNumberWidget],
    ['CardExpiryField', CardExpiryField, 'CardExpiryWidget', CardExpiryWidget],
    ['CardCVCField', CardCVCField, 'CardCVCWidget', CardCVCWidget],
    ['CardholderNameField', CardholderNameField, 'CardholderNameWidget', CardholderNameWidget],
  ])('%s === %s', (_nextName, next, _legacyName, legacy) => {
    expect(next).toBe(legacy);
  });

  it('are real forwardRef components, not wrappers around one', () => {
    for (const component of [
      CardNumberField,
      CardExpiryField,
      CardCVCField,
      CardholderNameField,
    ]) {
      expect((component as any).$$typeof).toBe(Symbol.for('react.forward_ref'));
    }
  });
});

describe('the HyperswitchVault namespace is a facade over the same objects', () => {
  it('is a plain object, not itself a component', () => {
    expect(typeof HyperswitchVault).toBe('object');
    expect((HyperswitchVault as any).$$typeof).toBeUndefined();
  });

  it.each([
    ['CardForm', () => HyperswitchVault.CardForm, () => HyperswitchVaultForm],
    ['Form', () => HyperswitchVault.Form, () => HyperswitchVaultFormProvider],
    ['CardNumber', () => HyperswitchVault.CardNumber, () => CardNumberField],
    ['Expiry', () => HyperswitchVault.Expiry, () => CardExpiryField],
    ['CVC', () => HyperswitchVault.CVC, () => CardCVCField],
    ['CardholderName', () => HyperswitchVault.CardholderName, () => CardholderNameField],
  ])('HyperswitchVault.%s is the canonical export', (_name, member, canonical) => {
    expect(member()).toBe(canonical());
  });

  it('reaches the legacy names too, transitively', () => {
    expect(HyperswitchVault.CardNumber).toBe(CardNumberWidget);
    expect(HyperswitchVault.Expiry).toBe(CardExpiryWidget);
    expect(HyperswitchVault.CVC).toBe(CardCVCWidget);
    expect(HyperswitchVault.CardholderName).toBe(CardholderNameWidget);
  });

  it('has exactly the six documented members and no hook yet', () => {
    expect(Object.keys(HyperswitchVault).sort()).toEqual([
      'CVC',
      'CardForm',
      'CardNumber',
      'CardholderName',
      'Expiry',
      'Form',
    ]);
    expect('useForm' in HyperswitchVault).toBe(false);
  });
});

/* ── 2. Behavioural equivalence ───────────────────────────────────────────── */

/*
 * Renders and returns a NORMALISED serialisation of the tree.
 *
 * Two independent renders produce structurally identical trees whose handler props are different
 * closure instances, so `toEqual` on the raw JSON compares function identity and always fails. What
 * matters here is the rendered structure and every non-function prop, so functions collapse to a
 * stable token and the tree is compared as a string.
 */
const renderTree = (element: React.ReactElement): string => {
  let renderer!: Renderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  const tree = renderer.toJSON();
  ReactTestRenderer.act(() => renderer.unmount());
  return JSON.stringify(tree, (_key, value) =>
    typeof value === 'function' ? '[fn]' : value,
  );
};

describe('rendering through the new names is indistinguishable', () => {
  it('the ready-made form renders identically via the namespace', () => {
    const viaLegacy = renderTree(
      <HyperswitchVaultForm session={session} environment="sandbox" />,
    );
    const viaNamespace = renderTree(
      <HyperswitchVault.CardForm session={session} environment="sandbox" />,
    );
    expect(viaNamespace).toEqual(viaLegacy);
  });

  it('a custom layout renders identically via canonical names and via the namespace', () => {
    const viaLegacy = renderTree(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberWidget />
        <View>
          <CardExpiryWidget />
          <CardCVCWidget />
        </View>
      </HyperswitchVaultFormProvider>,
    );

    const viaCanonical = renderTree(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField />
        <View>
          <CardExpiryField />
          <CardCVCField />
        </View>
      </HyperswitchVaultFormProvider>,
    );

    const viaNamespace = renderTree(
      <HyperswitchVault.Form session={session} environment="sandbox">
        <HyperswitchVault.CardNumber />
        <View>
          <HyperswitchVault.Expiry />
          <HyperswitchVault.CVC />
        </View>
      </HyperswitchVault.Form>,
    );

    expect(viaCanonical).toEqual(viaLegacy);
    expect(viaNamespace).toEqual(viaLegacy);
  });

  it('mixing legacy and canonical names in one layout still yields one working form', async () => {
    const formRef = React.createRef<VaultFormHandle>();

    let renderer!: Renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HyperswitchVault.Form ref={formRef} session={session} environment="sandbox">
          {/* deliberately mixed: the registry must count these as one of each */}
          <CardNumberWidget />
          <HyperswitchVault.Expiry />
          <CardCVCField />
        </HyperswitchVault.Form>,
      );
    });

    /* All three kinds are mounted exactly once, so submit() must reach validation, not not_ready. */
    let result: Awaited<ReturnType<VaultFormHandle['confirmPayment']>> | undefined;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment(paymentWith(session));
    });

    expect(result?.status).toBe('validation_error');
    expect(global.fetch).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 3. Handles are unchanged under the new type names ────────────────────── */

describe('handles behave identically under the alias types', () => {
  it('the form handle exposes exactly tokenize / confirmPayment / reset / focus', () => {
    const formRef = React.createRef<VaultFormHandle>();
    let renderer!: Renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HyperswitchVault.CardForm ref={formRef} session={session} environment="sandbox" />,
      );
    });

    expect(Object.keys(formRef.current!).sort()).toEqual(['confirmPayment', 'focus', 'reset', 'tokenize']);
    expect(typeof formRef.current!.tokenize).toBe('function');
    expect(typeof formRef.current!.confirmPayment).toBe('function');
    expect(typeof formRef.current!.reset).toBe('function');
    expect(typeof formRef.current!.focus).toBe('function');
    /* No raw-value accessor exists under any name. */
    expect((formRef.current as any).getValue).toBeUndefined();
    expect((formRef.current as any).getCardNumber).toBeUndefined();

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a field handle taken through the namespace exposes exactly focus / blur', () => {
    const fieldRef = React.createRef<VaultFieldHandle>();
    let renderer!: Renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HyperswitchVault.Form session={session} environment="sandbox">
          <HyperswitchVault.CardNumber ref={fieldRef} />
          <HyperswitchVault.Expiry />
          <HyperswitchVault.CVC />
        </HyperswitchVault.Form>,
      );
    });

    expect(Object.keys(fieldRef.current!).sort()).toEqual(['blur', 'focus']);
    expect((fieldRef.current as any).getValue).toBeUndefined();

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a legacy WidgetHandle ref works on a canonical field, and vice versa', () => {
    const widgetRef = React.createRef<WidgetHandle>();
    const formHandleRef = React.createRef<HyperswitchVaultFormHandle>();

    let renderer!: Renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HyperswitchVault.Form ref={formHandleRef} session={session} environment="sandbox">
          <CardNumberField ref={widgetRef} />
          <CardExpiryField />
          <CardCVCField />
        </HyperswitchVault.Form>,
      );
    });

    expect(typeof widgetRef.current!.focus).toBe('function');
    expect(typeof widgetRef.current!.blur).toBe('function');
    expect(typeof formHandleRef.current!.tokenize).toBe('function');
    expect(typeof formHandleRef.current!.confirmPayment).toBe('function');

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 4. The exactly-one-field rule still applies through the new names ─────── */

describe('the mounted-field registry is unaffected by naming', () => {
  it('a duplicate expressed through two different names is still a duplicate', async () => {
    const formRef = React.createRef<VaultFormHandle>();
    let renderer!: Renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HyperswitchVault.Form ref={formRef} session={session} environment="sandbox">
          <CardNumberWidget />
          {/* same component, different name — must count as a second card-number field */}
          <CardNumberField />
          <HyperswitchVault.Expiry />
          <HyperswitchVault.CVC />
        </HyperswitchVault.Form>,
      );
    });

    let result: Awaited<ReturnType<VaultFormHandle['confirmPayment']>> | undefined;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment(paymentWith(session));
    });

    expect(result?.status).toBe('not_ready');
    expect(global.fetch).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a missing field named canonically still returns not_ready with no request', async () => {
    const formRef = React.createRef<VaultFormHandle>();
    let renderer!: Renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HyperswitchVault.Form ref={formRef} session={session} environment="sandbox">
          <CardNumberField />
          <CardExpiryField />
          {/* no CVC field */}
        </HyperswitchVault.Form>,
      );
    });

    let result: Awaited<ReturnType<VaultFormHandle['confirmPayment']>> | undefined;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment(paymentWith(session));
    });

    expect(result?.status).toBe('not_ready');
    expect(global.fetch).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
