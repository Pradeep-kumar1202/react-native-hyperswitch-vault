/**
 * THE ZERO-CONFIGURATION CONTRACT.
 *
 * With no visual configuration the library renders four empty, neutral inputs and nothing else:
 * cardholder name, card number, expiry and CVC. The cardholder name is always rendered by the
 * ready-made form (optional to mount in a custom layout), and is blank like the rest by default.
 * This file is the proof, taken from the rendered React Native tree of the PUBLISHED package.
 *
 * Sensitive values are asserted as booleans inside this file only. Nothing is printed or
 * snapshotted.
 *
 * @format
 */
import React from 'react';
import {View, Text, TextInput, Pressable, StyleSheet} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVault,
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type VaultFormHandle,
  type VaultPaymentResult,
  type VaultTokenizeResult,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

declare const global: {fetch: unknown};

const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64 = (i: string) => {
  let o = '';
  for (let k = 0; k < i.length; k += 3) {
    const c =
      (i.charCodeAt(k) << 16) |
      ((k + 1 < i.length ? i.charCodeAt(k + 1) : 0) << 8) |
      (k + 2 < i.length ? i.charCodeAt(k + 2) : 0);
    o +=
      B[(c >> 18) & 63] +
      B[(c >> 12) & 63] +
      (k + 1 < i.length ? B[(c >> 6) & 63] : '=') +
      (k + 2 < i.length ? B[c & 63] : '=');
  }
  return o;
};

const session: MerchantSession = {
  session_token: [],
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: b64(
        'publishable_key=pk_snd_EXAMPLE_FAKE,payment_method_session_id=pms_default_ui,profile_id=pro_X',
      ),
    },
  },
};

let calls: {url: string; options: any; settle: (b: unknown, s?: number) => void}[] = [];

beforeEach(() => {
  calls = [];
  jest.useFakeTimers();
  (globalThis as any).fetch = jest.fn((url: string, options: any) => {
    let settle: any = () => {};
    const p = new Promise((res) => {
      settle = (b: unknown, s = 200) => res({ok: s < 300, status: s, json: async () => b});
    });
    calls.push({url, options, settle});
    return p;
  });
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

const mount = (el: React.ReactElement) => {
  let r!: Renderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
};

const inputs = (r: Renderer) => r.root.findAll((n) => n.type === TextInput);
const texts = (r: Renderer) => r.root.findAll((n) => String(n.type) === 'Text');
const visibleStrings = (r: Renderer): string[] =>
  texts(r)
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '');

const animatedElements = (r: Renderer) => {
  const hasAnimated = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(hasAnimated);
    if (!v || typeof v !== 'object') return false;
    if (/^Animated/.test(v.constructor?.name ?? '')) return true;
    return Object.values(v as Record<string, unknown>).some(hasAnimated);
  };
  return r.root.findAll((n) => n.props?.style !== undefined && hasAnimated(n.props.style));
};

const flat = (s: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

/*
 * The overlay placeholder: a non-interactive, accessibility-hidden absolute-fill View holding one
 * Text. It replaced React Native's native `placeholder` prop so that the published
 * `styles.placeholder?: StyleProp<TextStyle>` slot is actually honoured — a native placeholder
 * only ever takes a colour. The accessory container is also accessibility-hidden, so the predicate
 * additionally requires `pointerEvents="none"`, which the accessory does not set.
 */
const placeholderOverlays = (r: Renderer) =>
  r.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      n.props?.pointerEvents === 'none' &&
      n.props?.accessibilityElementsHidden === true,
  );

const placeholderStrings = (r: Renderer): string[] =>
  placeholderOverlays(r).flatMap((o) =>
    o
      .findAll((n) => String(n.type) === 'Text')
      .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
      .filter((c): c is string => typeof c === 'string' && c.trim() !== ''),
  );

/* Text elements that are NOT part of a placeholder overlay — i.e. real labels and error messages. */
const labelStrings = (r: Renderer): string[] => {
  const inOverlay = new Set(placeholderOverlays(r).flatMap((o) => o.findAll((n) => String(n.type) === 'Text')));
  return texts(r)
    .filter((t) => !inOverlay.has(t))
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '');
};

/* No field ever sets React Native's native placeholder prop any more. */
const expectNoNativePlaceholder = (r: Renderer) => {
  for (const i of inputs(r)) expect(i.props.placeholder).toBeUndefined();
};

const zeroConfigForm = () =>
  mount(<HyperswitchVault.CardForm session={session} environment="sandbox" />);

/* ── The blank default ────────────────────────────────────────────────────── */

describe('zero configuration renders four empty, neutral fields and nothing else', () => {
  it('four TextInputs, all with an empty internal value', () => {
    const r = zeroConfigForm();
    const found = inputs(r);

    expect(found).toHaveLength(4);
    /* Private assertion: the values are empty. Never printed. */
    for (const input of found) expect(input.props.value).toBe('');
    expect(found.map((i) => i.props.testID).sort()).toEqual([
      'CVCInputTestId',
      'CardNumberInputTestId',
      'CardholderNameInputTestId',
      'ExpiryInputTestId',
    ]);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('no visible placeholder strings, and no native placeholder prop', () => {
    const r = zeroConfigForm();

    for (const input of inputs(r)) expect(input.props.placeholder).toBeUndefined();
    expect(visibleStrings(r)).toEqual([]);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('no label elements and no animated-label elements', () => {
    const r = zeroConfigForm();

    expect(texts(r)).toHaveLength(0);
    expect(animatedElements(r)).toHaveLength(0);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('no brand icon, no CVC icon, no accessory container', () => {
    const r = zeroConfigForm();

    expect(r.root.findAll((n) => n.type === Pressable)).toHaveLength(0);
    expect(r.root.findAll((n) => n.props?.source !== undefined)).toHaveLength(0);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('no inline error element and no reserved error space, even after an invalid blur', () => {
    const r = zeroConfigForm();
    const number = inputs(r).find((i) => i.props.testID === 'CardNumberInputTestId')!;

    const before = JSON.stringify(r.toJSON());
    ReactTestRenderer.act(() => number.props.onChangeText('4242'));
    ReactTestRenderer.act(() => number.props.onBlur({nativeEvent: {}}));

    /* Still no Text element anywhere: the error is emitted, not rendered. */
    expect(texts(r)).toHaveLength(0);
    /* And the tree grew no container to hold one. */
    const after = JSON.stringify(r.toJSON());
    expect(after.length).toBeLessThanOrEqual(before.length + 200);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('stacked layout with separate containers', () => {
    const r = zeroConfigForm();

    /* No row: expiry and CVC are stacked, not side by side. */
    const rows = r.root
      .findAll((n) => n.type === View)
      .map((n) => flat(n.props.style).flexDirection)
      .filter((d) => d === 'row' || d === 'row-reverse');
    /* The only `row` is inside each bordered box (input + accessory), never a field row. */
    expect(rows.filter((d) => d === 'row-reverse')).toHaveLength(0);

    /* Every field keeps its own fully rounded, fully bordered box. */
    const boxes = r.root
      .findAll((n) => n.type === View)
      .map((n) => flat(n.props.style))
      .filter((s) => s.borderTopWidth !== undefined);
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.borderTopWidth).toBe(box.borderBottomWidth);
      expect(box.borderTopLeftRadius).toBeGreaterThan(0);
      expect(box.borderBottomRightRadius).toBeGreaterThan(0);
    }

    ReactTestRenderer.act(() => r.unmount());
  });

  it('accessibility survives the blank default', () => {
    const r = zeroConfigForm();
    const labels = inputs(r)
      .map((i) => i.props.accessibilityLabel)
      .sort();

    expect(labels).toEqual([
      'Card number',
      'Cardholder name',
      'Expiration date',
      'Security code',
    ]);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('the custom layout is blank by default too', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    /* Three widgets mounted, three inputs: the cardholder field is optional in a custom layout. */
    expect(inputs(r)).toHaveLength(3);
    expect(texts(r)).toHaveLength(0);
    expect(animatedElements(r)).toHaveLength(0);
    expect(r.root.findAll((n) => n.type === Pressable)).toHaveLength(0);
    expectNoNativePlaceholder(r);
    expect(placeholderOverlays(r)).toHaveLength(0);

    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── Placeholder text is never a value ────────────────────────────────────── */

describe('placeholder text is never treated as a field value', () => {
  it('a placeholder leaves the internal value empty and never reaches tokenization', async () => {
    const formRef = React.createRef<VaultFormHandle>();
    const r = mount(
      <HyperswitchVault.CardForm
        ref={formRef}
        session={session}
        environment="sandbox"
        fieldOptions={{
          cardNumber: {placeholder: '4242 4242 4242 4242'},
          expiry: {placeholder: '12/30'},
          cvc: {placeholder: '123'},
        }}
      />,
    );

    /*
      * The placeholder is a rendered overlay, NOT the native prop and NOT the value. All three
      * placeholders here are deliberately card-shaped; the internal value stays empty regardless.
      */
    expectNoNativePlaceholder(r);
    expect(placeholderStrings(r).sort()).toEqual(['12/30', '123', '4242 4242 4242 4242']);
    for (const input of inputs(r)) expect(input.props.value).toBe('');

    /* Submitting cannot tokenize: the form is empty, so no request is made at all. */
    let result!: VaultTokenizeResult;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.tokenize();
    });
    expect(result.status).not.toBe('success');
    expect(calls).toHaveLength(0);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('a deliberately card-shaped placeholder still never reaches the wire', async () => {
    const formRef = React.createRef<VaultFormHandle>();
    const r = mount(
      <HyperswitchVault.CardForm
        ref={formRef}
        session={session}
        environment="sandbox"
        fieldOptions={{cardNumber: {placeholder: '4242424242424242', label: '4242424242424242'}}}
      />,
    );

    /* Fill with a DIFFERENT valid card, submit, and check the body carries only that. */
    const by = (id: string) => inputs(r).find((i) => i.props.testID === id)!;
    ReactTestRenderer.act(() => by('CardNumberInputTestId').props.onChangeText('4111111111111111'));
    ReactTestRenderer.act(() => by('ExpiryInputTestId').props.onChangeText('12/30'));
    ReactTestRenderer.act(() => by('CVCInputTestId').props.onChangeText('123'));

    await ReactTestRenderer.act(async () => {
      const pending = formRef.current!.tokenize();
      calls[0].settle({associated_payment_methods: [{payment_method_token: {data: 'tok_x'}}]});
      await pending;
    });

    const body = String(calls[0].options.body ?? '');
    /* Booleans only — the values themselves are never printed. */
    expect(body.includes('4111111111111111')).toBe(true);
    expect(body.includes('4242424242424242')).toBe(false);

    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── Every option, independently and in combination ───────────────────────── */

const by = (r: Renderer, id: string) => inputs(r).find((i) => i.props.testID === id)!;

describe('each option turns on exactly one thing', () => {
  it('placeholder renders one overlay Text, per field, independently', () => {
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        fieldOptions={{cardNumber: {placeholder: 'Card number'}}}
      />,
    );

    expectNoNativePlaceholder(r);
    /* exactly one overlay, carrying the one placeholder that was asked for */
    expect(placeholderOverlays(r)).toHaveLength(1);
    expect(placeholderStrings(r)).toEqual(['Card number']);
    /* and it is still not a label: no Text outside the overlay */
    expect(labelStrings(r)).toHaveLength(0);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('labelBehavior="static" renders a Text label above and the placeholder inside', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField label="Card number" labelBehavior="static" placeholder="4242 …" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expect(labelStrings(r)).toEqual(['Card number']);
    expect(animatedElements(r)).toHaveLength(0);
    /* they do not overlap: the label is a Text ABOVE the box, the placeholder is INSIDE it */
    expectNoNativePlaceholder(r);
    expect(placeholderStrings(r)).toEqual(['4242 …']);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('labelBehavior="floating" animates, and suppresses the native placeholder', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField label="Card number" labelBehavior="floating" placeholder="Card number" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expect(animatedElements(r).length).toBeGreaterThan(0);
    /* no overlap: the animated text owns that space, so the native placeholder is off */
    expect(by(r, 'CardNumberInputTestId').props.placeholder).toBeUndefined();
    expect(visibleStrings(r)).toEqual(['Card number']);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('labelBehavior="floating" with no text renders nothing rather than inventing a string', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField labelBehavior="floating" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expect(animatedElements(r)).toHaveLength(0);
    expect(texts(r)).toHaveLength(0);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('the floating endpoints still come from the merchant font sizes', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField
          label="Card number"
          placeholder="Card number"
          labelBehavior="floating"
          styles={{placeholder: {fontSize: 22}, label: {fontSize: 9}}}
        />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    const ranges: number[][] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== 'object') return;
      if (/^Animated/.test(v.constructor?.name ?? '')) {
        const range = (v as {_config?: {outputRange?: unknown[]}})._config?.outputRange;
        if (Array.isArray(range) && range.every((x) => typeof x === 'number')) ranges.push(range as number[]);
        return;
      }
      Object.values(v as Record<string, unknown>).forEach(walk);
    };
    animatedElements(r).forEach((n) => walk(n.props.style));
    expect(ranges[0]).toEqual([22, 9]);

    ReactTestRenderer.act(() => r.unmount());
  });

  /*
   * This used to assert two halves: the error RENDERS only with `errorDisplay: 'inline'`, and the
   * error EVENT fires either way. ADR-0003 removed the event, so only the rendering half has a
   * subject — and that is the half `errorDisplay` actually controls.
   */
  it('errorDisplay="inline" renders the error; "none" renders nothing', () => {
    for (const [display, expected] of [['none', 0], ['inline', 1]] as const) {
      const r = mount(
        <HyperswitchVaultFormProvider session={session} environment="sandbox">
          <CardNumberField errorDisplay={display} />
          <CardExpiryField />
          <CardCVCField />
        </HyperswitchVaultFormProvider>,
      );

      const number = by(r, 'CardNumberInputTestId');
      ReactTestRenderer.act(() => number.props.onChangeText('4242'));
      ReactTestRenderer.act(() => number.props.onBlur({nativeEvent: {}}));

      expect(texts(r)).toHaveLength(expected);

      ReactTestRenderer.act(() => r.unmount());
    }
  });

  it('brandIconMode and cvcIcon are independent opt-ins, and neither is pressable', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField brandIconMode="standard" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    expect(r.root.findAll((n) => n.props?.source !== undefined).length).toBeGreaterThan(0);
    /* decorative: never a Pressable, never in the accessibility tree */
    expect(r.root.findAll((n) => n.type === Pressable)).toHaveLength(0);
    /* one accessory: RN surfaces both the composite View and its host element, so count hosts */
    const hidden = r.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true,
    );
    expect(hidden).toHaveLength(1);
    expect(hidden[0].props.importantForAccessibility).toBe('no-hide-descendants');
    expect(hidden[0].props.accessible).toBe(false);
    ReactTestRenderer.act(() => r.unmount());

    const c = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField cvcIcon="default" />
      </HyperswitchVaultFormProvider>,
    );
    expect(
      c.root.findAll((n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true),
    ).toHaveLength(1);
    expect(c.root.findAll((n) => n.type === Pressable)).toHaveLength(0);
    ReactTestRenderer.act(() => c.unmount());
  });

  it('layout="inline" puts expiry and CVC on a row; "stacked" does not', () => {
    const rowCount = (r: Renderer) =>
      r.root
        .findAll((n) => n.type === View)
        .map((n) => flat(n.props.style))
        .filter((s) => (s.flexDirection === 'row' || s.flexDirection === 'row-reverse') && s.gap !== undefined)
        .length;

    const stacked = mount(<HyperswitchVault.CardForm session={session} environment="sandbox" />);
    expect(rowCount(stacked)).toBe(0);
    ReactTestRenderer.act(() => stacked.unmount());

    const inline = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" layout="inline" />,
    );
    expect(rowCount(inline)).toBe(1);
    ReactTestRenderer.act(() => inline.unmount());
  });

  it('fieldArrangement="fused" joins the borders; "separate" does not', () => {
    const squared = (r: Renderer) =>
      r.root
        .findAll((n) => n.type === View)
        .map((n) => flat(n.props.style))
        .filter((s) => s.borderTopWidth !== undefined)
        .filter((s) => s.borderTopLeftRadius === 0 || s.borderBottomLeftRadius === 0).length;

    const separate = mount(<HyperswitchVault.CardForm session={session} environment="sandbox" />);
    expect(squared(separate)).toBe(0);
    ReactTestRenderer.act(() => separate.unmount());

    const fused = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        layout="inline"
        fieldArrangement="fused"
      />,
    );
    expect(squared(fused)).toBeGreaterThan(0);
    ReactTestRenderer.act(() => fused.unmount());
  });

  it('accessibility defaults are overridable, and testID too', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField
          accessibilityLabel="Numéro de carte"
          accessibilityHint="16 chiffres"
          testID="my-card-number"
        />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    const mine = inputs(r).find((i) => i.props.testID === 'my-card-number')!;
    expect(mine.props.accessibilityLabel).toBe('Numéro de carte');
    expect(mine.props.accessibilityHint).toBe('16 chiffres');
    /* the untouched fields keep the library defaults */
    expect(by(r, 'ExpiryInputTestId').props.accessibilityLabel).toBe('Expiration date');
    expect(by(r, 'CVCInputTestId').props.accessibilityLabel).toBe('Security code');

    ReactTestRenderer.act(() => r.unmount());
  });

  it('one field\'s options never affect another field or the provider', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField placeholder="Card number" labelBehavior="static" label="Card" brandIconMode="standard" errorDisplay="inline" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    expectNoNativePlaceholder(r);
    /* only the card number has a placeholder overlay */
    expect(placeholderStrings(r)).toEqual(['Card number']);
    expect(labelStrings(r)).toEqual(['Card']);
    /* exactly one accessory container — the card number's — and it is not a Pressable.
       The placeholder overlay is also a11y-hidden, so it is excluded by `pointerEvents`. */
    expect(
      r.root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props?.accessibilityElementsHidden === true &&
          n.props?.pointerEvents !== 'none',
      ),
    ).toHaveLength(1);
    expect(r.root.findAll((n) => n.type === Pressable)).toHaveLength(0);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('options compose with styles, registered styles and nested arrays', () => {
    const sheet = StyleSheet.create({box: {borderColor: '#2563EB'}, label: {color: '#111827'}});
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField
          placeholder="Card number"
          label="Card number"
          labelBehavior="static"
          styles={{container: [[sheet.box], null, {borderWidth: 3}], label: sheet.label}}
        />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

    const box = r.root
      .findAll((n) => n.type === View)
      .map((n) => flat(n.props.style))
      .filter((s) => s.borderColor === '#2563EB')[0];
    expect(box.borderWidth).toBe(3);
    expect(flat(texts(r)[0].props.style).color).toBe('#111827');

    ReactTestRenderer.act(() => r.unmount());
  });

  it('disabled and RTL still behave with options on', () => {
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        disabled
        layout="inline"
        localisation={{isRtl: true}}
        fieldOptions={{cardNumber: {placeholder: 'Card number', brandIconMode: 'standard'}}}
      />,
    );

    for (const input of inputs(r)) expect(input.props.editable).toBe(false);
    const reversed = r.root
      .findAll((n) => n.type === View)
      .map((n) => flat(n.props.style).flexDirection)
      .filter((d) => d === 'row-reverse');
    expect(reversed.length).toBe(1);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('reset and correction still work with inline errors on', () => {
    const formRef = React.createRef<VaultFormHandle>();
    const r = mount(
      <HyperswitchVault.CardForm
        ref={formRef}
        session={session}
        environment="sandbox"
        fieldOptions={{cardNumber: {errorDisplay: 'inline'}}}
      />,
    );

    const number = by(r, 'CardNumberInputTestId');
    ReactTestRenderer.act(() => number.props.onChangeText('4242'));
    ReactTestRenderer.act(() => number.props.onBlur({nativeEvent: {}}));
    expect(texts(r)).toHaveLength(1);

    /* correction clears it */
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4242424242424242'));
    expect(texts(r)).toHaveLength(0);

    /* and so does reset */
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4242'));
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onBlur({nativeEvent: {}}));
    expect(texts(r)).toHaveLength(1);
    ReactTestRenderer.act(() => formRef.current!.reset());
    expect(texts(r)).toHaveLength(0);
    expect(by(r, 'CardNumberInputTestId').props.value).toBe('');

    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── Brand-icon precedence: one control, no ambiguous combination ──────────── */

/*
 * `brandIconMode` is resolved in exactly one place:
 *
 *   fieldOptions.cardNumber.brandIconMode  →  appearance.brandIconMode  →  'hidden'
 *
 * The matrix below is every combination of the two public inputs (5 field values × 5 appearance
 * values, counting "absent"), so there is no pair whose outcome is undefined or order-dependent.
 */
describe('brand-icon precedence is total and unambiguous', () => {
  const MODES = ['hidden', 'standard', 'animated', 'hideGeneric'] as const;
  type Mode = (typeof MODES)[number];

  const artworkCount = (field?: Mode, appearanceMode?: Mode) => {
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        appearance={appearanceMode ? {brandIconMode: appearanceMode} : undefined}
        fieldOptions={field ? {cardNumber: {brandIconMode: field}} : undefined}
      />,
    );
    /* An accessory container exists iff the resolved mode is not `hidden`. */
    const containers = r.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true,
    ).length;
    const images = r.root.findAll((n) => n.props?.source !== undefined).length;
    ReactTestRenderer.act(() => r.unmount());
    return {containers, images};
  };

  it('every field × appearance combination resolves to exactly one outcome', () => {
    const expectedResolved = (field?: Mode, appearanceMode?: Mode): Mode =>
      field ?? appearanceMode ?? 'hidden';

    for (const field of [undefined, ...MODES]) {
      for (const appearanceMode of [undefined, ...MODES]) {
        const {containers} = artworkCount(field, appearanceMode);
        const resolved = expectedResolved(field, appearanceMode);
        /* `hidden` => no container at all; anything else => exactly one */
        expect({field, appearanceMode, containers}).toEqual({
          field,
          appearanceMode,
          containers: resolved === 'hidden' ? 0 : 1,
        });
      }
    }
  });

  it('the field value wins over the form-wide one, in both directions', () => {
    /* appearance says show, field says hide */
    expect(artworkCount('hidden', 'standard').containers).toBe(0);
    /* appearance says hide, field says show */
    expect(artworkCount('standard', 'hidden').containers).toBe(1);
  });

  it('with neither supplied the default is hidden', () => {
    expect(artworkCount(undefined, undefined)).toEqual({containers: 0, images: 0});
  });

  it('hideGeneric keeps the container but shows no artwork until a brand is detected', () => {
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        fieldOptions={{cardNumber: {brandIconMode: 'hideGeneric'}}}
      />,
    );

    /* container present (so the input width does not jump), artwork absent */
    expect(
      r.root.findAll((n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true),
    ).toHaveLength(1);
    expect(r.root.findAll((n) => n.props?.source !== undefined)).toHaveLength(0);

    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4242'));
    expect(r.root.findAll((n) => n.props?.source !== undefined).length).toBeGreaterThan(0);

    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── Icon interaction semantics ───────────────────────────────────────────── */

describe('enabled icons are decorative, not interactive', () => {
  const bothIcons = () =>
    mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField brandIconMode="standard" styles={{accessory: {width: 41}}} />
        <CardExpiryField />
        <CardCVCField cvcIcon="default" styles={{accessory: {width: 37}}} />
      </HyperswitchVaultFormProvider>,
    );

  it('render zero Pressables and expose no press handler', () => {
    const r = bothIcons();

    expect(r.root.findAll((n) => n.type === Pressable)).toHaveLength(0);
    /* nothing anywhere in the tree offers a press for these containers */
    const accessories = r.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true,
    );
    expect(accessories).toHaveLength(2);
    for (const a of accessories) {
      expect(a.props.onPress).toBeUndefined();
      expect(a.props.onStartShouldSetResponder).toBeUndefined();
    }

    ReactTestRenderer.act(() => r.unmount());
  });

  it('are not announced as buttons and cannot take accessibility focus', () => {
    const r = bothIcons();

    const accessories = r.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true,
    );
    for (const a of accessories) {
      expect(a.props.accessible).toBe(false);
      expect(a.props.accessibilityRole).toBeUndefined();
      expect(a.props.importantForAccessibility).toBe('no-hide-descendants');
    }
    /* the fields themselves keep their labels (custom layout: no cardholder field mounted) */
    expect(inputs(r).map((i) => i.props.accessibilityLabel).sort()).toEqual([
      'Card number',
      'Expiration date',
      'Security code',
    ]);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('the accessory style still reaches the container', () => {
    const r = bothIcons();

    const widths = r.root
      .findAll((n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true)
      .map((n) => flat(n.props.style).width)
      .sort();
    expect(widths).toEqual([37, 41]);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('carry no card data', () => {
    const r = bothIcons();
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4242424242424242'));

    /*
     * Walk the RENDERED output, not React's internal prop graph. A test instance's `props` object
     * carries `_owner`/fiber links that reach the whole tree, so walking it would report the
     * TextInput's own value as if the accessory held it. `toJSON()` is what actually reaches the
     * host — which is the question being asked.
     */
    const findDigits = (node: unknown): boolean => {
      if (typeof node === 'string') return node.includes('4242');
      if (Array.isArray(node)) return node.some(findDigits);
      if (!node || typeof node !== 'object') return false;
      const n = node as {props?: Record<string, unknown>; children?: unknown};
      const inProps = Object.values(n.props ?? {}).some(findDigits);
      return inProps || findDigits(n.children);
    };

    const collectAccessories = (node: any, out: any[] = []): any[] => {
      if (!node || typeof node !== 'object') return out;
      if (Array.isArray(node)) {
        node.forEach((c) => collectAccessories(c, out));
        return out;
      }
      if (node.props?.accessibilityElementsHidden === true) out.push(node);
      collectAccessories(node.children, out);
      return out;
    };

    const rendered = collectAccessories(r.toJSON());
    expect(rendered.length).toBe(2);
    for (const a of rendered) expect(findDigits(a)).toBe(false);
    /* and the walk is not vacuous */
    expect(findDigits({props: {}, children: ['xx4242xx']})).toBe(true);

    ReactTestRenderer.act(() => r.unmount());
  });

  it('disabled icons render no element and reserve no space', () => {
    const off = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    const bare = JSON.stringify(off.toJSON());
    expect(
      off.root.findAll((n) => typeof n.type === 'string' && n.props?.accessibilityElementsHidden === true),
    ).toHaveLength(0);
    expect(off.root.findAll((n) => n.props?.source !== undefined)).toHaveLength(0);
    ReactTestRenderer.act(() => off.unmount());

    const on = bothIcons();
    /* enabling them genuinely adds elements — the "off" tree is not merely styled away */
    expect(JSON.stringify(on.toJSON()).length).toBeGreaterThan(bare.length);
    ReactTestRenderer.act(() => on.unmount());
  });
});

/* ── The reported hidden-icon case, exactly as integrated ─────────────────── */

/*
 * REPORTED: `<CardNumberWidget placeholder="Card Number" />` showed a brand mark after a Visa PAN
 * was typed, with no `brandIconMode` passed.
 *
 * The library default was NOT at fault — the example screen that produced the screenshot set
 * `appearance.brandIconMode: 'animated'`, an explicit form-wide opt-in that a field with no option
 * of its own correctly inherits. These tests pin the contract down from both sides so the
 * distinction cannot silently rot: nothing asked for → hidden; something asked for → honoured.
 */
describe('the reported placeholder-only integration shows no brand icon', () => {
  const VISA = '4242424242424242';

  /* host images only: a composite Image and its host child both carry `source` */
  const artwork = (r: Renderer) =>
    r.root.findAll((n) => typeof n.type === 'string' && n.props?.source !== undefined);
  const accessories = (r: Renderer) =>
    r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props?.accessibilityElementsHidden === true &&
        n.props?.pointerEvents !== 'none',
    );

  const typeVisa = (r: Renderer) =>
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText(VISA));

  /*
   * The point of these tests is that a DETECTED brand still renders no artwork when the icon is not
   * enabled. Detection used to be asserted through the emitted brand; ADR-0003 removed that surface,
   * and its absence is itself the guarantee — there is no public way to observe the brand at all.
   *
   * A full, valid Visa number is typed, so detection has certainly run internally; what is asserted
   * is the part that remains observable and is what actually matters here — zero accessory
   * containers and zero brand images.
   */
  const assertNoIcon = (r: Renderer) => {
    expect(accessories(r)).toHaveLength(0);                              // zero accessory containers
    expect(artwork(r)).toHaveLength(0);                                  // zero brand images
  };

  it('CardNumberWidget: brand detected, zero icon, zero reserved width', () => {
    const r = mount(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox">
        <CardNumberWidget placeholder="Card Number" />
        <CardExpiryWidget />
        <CardCVCWidget />
      </HyperswitchVaultFormProvider>,
    );

    /* the input's layout before and after must be identical — no accessory took width */
    const widthBefore = flat(by(r, 'CardNumberInputTestId').props.style).width;
    typeVisa(r);
    assertNoIcon(r);
    expect(flat(by(r, 'CardNumberInputTestId').props.style).width).toBe(widthBefore);
    expect(widthBefore).toBe('100%');

    ReactTestRenderer.act(() => r.unmount());
  });

  it('CardNumberField: same, under the current export name', () => {
    const r = mount(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox">
        <CardNumberField placeholder="Card Number" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    typeVisa(r);
    assertNoIcon(r);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('the ready-made form: same, through grouped fieldOptions', () => {
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        fieldOptions={{cardNumber: {placeholder: 'Card Number'}}}
      />,
    );
    typeVisa(r);
    assertNoIcon(r);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('an appearance that omits brandIconMode still resolves to hidden', () => {
    const r = mount(
      <HyperswitchVaultFormProvider
        session={session}
        environment="sandbox"
        appearance={{primaryColor: '#0E7C86', inputHeight: 52, borderRadius: 12}}>
        <CardNumberWidget placeholder="Card Number" />
        <CardExpiryWidget />
        <CardCVCWidget />
      </HyperswitchVaultFormProvider>,
    );
    typeVisa(r);
    assertNoIcon(r);
    ReactTestRenderer.act(() => r.unmount());
  });

  /* The other half: an explicit opt-in is still honoured, at either level. */
  const modes = [
    ['standard', 1],
    ['animated', 1],
    ['hideGeneric', 1],
    ['hidden', 0],
  ] as const;

  for (const [mode, expected] of modes) {
    it(`brandIconMode="${mode}" on the field renders ${expected} image after a Visa PAN`, () => {
      const r = mount(
        <HyperswitchVaultFormProvider session={session} environment="sandbox">
          <CardNumberWidget placeholder="Card Number" brandIconMode={mode} />
          <CardExpiryWidget />
          <CardCVCWidget />
        </HyperswitchVaultFormProvider>,
      );
      typeVisa(r);
      expect({mode, images: artwork(r).length}).toEqual({mode, images: expected});
      ReactTestRenderer.act(() => r.unmount());
    });

    it(`appearance.brandIconMode="${mode}" is inherited when the field asks for nothing`, () => {
      const r = mount(
        <HyperswitchVaultFormProvider
          session={session}
          environment="sandbox"
          appearance={{brandIconMode: mode}}>
          <CardNumberWidget placeholder="Card Number" />
          <CardExpiryWidget />
          <CardCVCWidget />
        </HyperswitchVaultFormProvider>,
      );
      typeVisa(r);
      expect({mode, images: artwork(r).length}).toEqual({mode, images: expected});
      ReactTestRenderer.act(() => r.unmount());
    });
  }

  it('hideGeneric shows nothing for an UNRECOGNISED number and artwork for a Visa', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberWidget placeholder="Card Number" brandIconMode="hideGeneric" />
        <CardExpiryWidget />
        <CardCVCWidget />
      </HyperswitchVaultFormProvider>,
    );
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('9999'));
    expect(artwork(r)).toHaveLength(0);
    typeVisa(r);
    expect(artwork(r)).toHaveLength(1);
    ReactTestRenderer.act(() => r.unmount());
  });
});
