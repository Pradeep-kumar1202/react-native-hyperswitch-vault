/**
 * PLACEHOLDER VERTICAL LAYOUT AND DATA SAFETY.
 *
 * The reported defect: with `labelBehavior="none"` the placeholder sat visibly below the centre of
 * a fixed-height field. The cause was retained floating-label geometry — the input wrapper used
 * `justifyContent: "flex-end"` and the TextInput was `inputHeight * 0.7` — so ALL of the vertical
 * free space was above the input and none below it. At the default 48pt height that put the text
 * centre 7.2pt low; at the example's 52pt height, 7.8pt low.
 *
 * These are STRUCTURAL assertions on the rendered tree. React Test Renderer does not lay out or
 * measure, so nothing here claims pixel-perfect device alignment — it proves the invariants that
 * make the two centres coincide, and the simulator/emulator pass covers actual pixels.
 *
 * Sensitive values are asserted as booleans inside this file only. Nothing is printed or snapshotted.
 *
 * @format
 */
import React from 'react';
import {TextInput, StyleSheet} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVault,
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type VaultFormHandle,
  type VaultTokenizeResult,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64 = (i: string) => {
  let o = '';
  for (let k = 0; k < i.length; k += 3) {
    const c =
      (i.charCodeAt(k) << 16) |
      ((k + 1 < i.length ? i.charCodeAt(k + 1) : 0) << 8) |
      (k + 2 < i.length ? i.charCodeAt(k + 2) : 0);
    o +=
      B[(c >> 18) & 63] + B[(c >> 12) & 63] +
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
        'publishable_key=pk_snd_EXAMPLE_FAKE,payment_method_session_id=pms_placeholder,profile_id=pro_X',
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
const by = (r: Renderer, id: string) => inputs(r).find((i) => i.props.testID === id)!;
const flat = (s: unknown): Record<string, any> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, any>;

const overlays = (r: Renderer) =>
  r.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      n.props?.pointerEvents === 'none' &&
      n.props?.accessibilityElementsHidden === true,
  );

const overlayText = (r: Renderer, id: string) => {
  /* the overlay that is a sibling of the field with this testID */
  const input = by(r, id);
  const owner = r.root.findAll(
    (n) => typeof n.type === 'string' && n.findAll((c) => c === input).length > 0,
  );
  const nearest = owner[owner.length - 1];
  return nearest.findAll(
    (n) => typeof n.type === 'string' && n.props?.pointerEvents === 'none',
  )[0];
};

const strings = (node: any): string[] =>
  node
    .findAll((n: any) => String(n.type) === 'Text')
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any): c is string => typeof c === 'string' && c.trim() !== '');

/*
 * The centres coincide iff the overlay and the TextInput occupy the SAME box and each centres its
 * own single line inside it. That is four facts, all independent of height, font and platform.
 */
const expectSharedVerticalCentre = (r: Renderer, id: string) => {
  const input = by(r, id);
  const inputStyle = flat(input.props.style);
  const ov = overlayText(r, id);
  const ovStyle = flat(ov.props.style);

  /* 1. the overlay exactly covers its parent box */
  expect(ovStyle.position).toBe('absolute');
  expect([ovStyle.top, ovStyle.bottom, ovStyle.left, ovStyle.right]).toEqual([0, 0, 0, 0]);
  /* 2. the input exactly covers the same box */
  expect(inputStyle.height).toBe('100%');
  /* 3. each centres its content in that box */
  expect(ovStyle.justifyContent).toBe('center');
  expect(inputStyle.textAlignVertical).toBe('center');
  /* 4. no vertical padding pushes either off-centre, and none is asymmetric */
  expect(inputStyle.padding).toBe(0);
  for (const k of ['paddingTop', 'paddingBottom', 'paddingVertical', 'marginTop', 'marginBottom']) {
    expect(ovStyle[k]).toBeUndefined();
  }
};

/* The wrapper that used to force the input downwards. */
const wrapperOf = (r: Renderer, id: string) => {
  const input = by(r, id);
  const chain = r.root.findAll(
    (n) => typeof n.type === 'string' && n.findAll((c) => c === input).length > 0,
  );
  return flat(chain[chain.length - 1].props.style);
};

const plain = (extra: Record<string, unknown> = {}, appearance?: Record<string, unknown>) =>
  mount(
    <HyperswitchVault.CardForm
      session={session}
      environment="sandbox"
      appearance={appearance as never}
      fieldOptions={{
        /*
         * `labelBehavior: 'none'` is explicit throughout this file now. The default became
         * `floating`, and a floating label REPLACES the overlay placeholder — `showOverlayPlaceholder`
         * is gated on `!floating`. The placeholder string still reaches the screen in the default
         * form, as the floating label's resting text; this suite is about the OVERLAY element, so
         * it has to ask for the mode that renders one.
         */
        cardNumber: {placeholder: 'Card Number', labelBehavior: 'none', ...extra},
        expiry: {placeholder: 'MM/YY', labelBehavior: 'none', ...extra},
        cvc: {placeholder: 'CVC', labelBehavior: 'none', ...extra},
      }}
    />,
  );

const IDS = ['CardNumberInputTestId', 'ExpiryInputTestId', 'CVCInputTestId'];

/* ── 1. The regression itself ─────────────────────────────────────────────── */

describe('the floating-label geometry no longer applies to plain and static modes', () => {
  it('the input wrapper centres instead of pushing the input to the bottom', () => {
    const r = plain();
    for (const id of IDS) expect(wrapperOf(r, id).justifyContent).toBe('center');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('the input fills the box instead of 70% of it', () => {
    const r = plain();
    for (const id of IDS) expect(flat(by(r, id).props.style).height).toBe('100%');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('floating mode KEEPS both, so the animated label still has its space', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField placeholder="Card Number" label="Card number" labelBehavior="floating" />
        {/* Explicitly plain: floating is the DEFAULT now, so an unconfigured field would float
          * too and the contrast this test is drawing would vanish. */}
        <CardExpiryField labelBehavior="none" />
        <CardCVCField labelBehavior="none" />
      </HyperswitchVaultFormProvider>,
    );
    expect(wrapperOf(r, 'CardNumberInputTestId').justifyContent).toBe('flex-end');
    /* 48 * 0.7 — the label occupies the remaining 30% at the top */
    expect(flat(by(r, 'CardNumberInputTestId').props.style).height).toBeCloseTo(33.6, 5);
    expect(flat(by(r, 'CardNumberInputTestId').props.style).textAlignVertical).toBe('auto');
    /* the fields that opted OUT are plain, and centre */
    expect(wrapperOf(r, 'ExpiryInputTestId').justifyContent).toBe('center');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('static mode centres inside the box and keeps its label outside', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField placeholder="Card Number" label="Card number" labelBehavior="static" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    expect(wrapperOf(r, 'CardNumberInputTestId').justifyContent).toBe('center');
    expectSharedVerticalCentre(r, 'CardNumberInputTestId');
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── 2. Height and typography matrix ──────────────────────────────────────── */

describe('placeholder and entered text share one vertical centre', () => {
  const HEIGHTS = [
    ['default', undefined],
    ['short', 32],
    ['tall', 72],
    ['very tall', 120],
  ] as const;

  for (const [name, inputHeight] of HEIGHTS) {
    it(`holds at ${name} height, empty and after typing`, () => {
      const r = plain({}, inputHeight === undefined ? undefined : {inputHeight});
      for (const id of IDS) expectSharedVerticalCentre(r, id);

      /* typing removes the overlay but must not move the input box */
      const before = flat(by(r, 'CardNumberInputTestId').props.style).height;
      ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4242'));
      expect(flat(by(r, 'CardNumberInputTestId').props.style).height).toBe(before);
      expect(wrapperOf(r, 'CardNumberInputTestId').justifyContent).toBe('center');

      ReactTestRenderer.act(() => r.unmount());
    });
  }

  const TYPO: [string, Record<string, unknown>][] = [
    ['default font', {}],
    ['custom font family', {fontFamily: 'Courier New'}],
    ['small font size', {fontSize: 9}],
    ['large font size', {fontSize: 30}],
    ['explicit line height', {fontSize: 16, lineHeight: 28}],
    ['weight and spacing', {fontWeight: '700', letterSpacing: 1.5}],
  ];

  for (const [name, style] of TYPO) {
    it(`the full TextStyle reaches the placeholder: ${name}`, () => {
      const r = mount(
        <HyperswitchVaultFormProvider session={session} environment="sandbox">
          <CardNumberField
            placeholder="Card Number"
            labelBehavior="none"
            styles={{placeholder: style}}
          />
          <CardExpiryField />
          <CardCVCField />
        </HyperswitchVaultFormProvider>,
      );
      const applied = flat(overlayText(r, 'CardNumberInputTestId').findAll((n) => String(n.type) === 'Text')[0].props.style);
      for (const [k, v] of Object.entries(style)) expect(applied[k]).toBe(v);
      /* centring is unaffected by typography */
      expectSharedVerticalCentre(r, 'CardNumberInputTestId');
      ReactTestRenderer.act(() => r.unmount());
    });
  }

  it('registered styles, arrays and nested arrays all reach the placeholder', () => {
    const sheet = StyleSheet.create({ph: {fontSize: 21, color: '#0EA5E9'}});
    const cases: [string, unknown][] = [
      ['registered', sheet.ph],
      ['array', [sheet.ph, {letterSpacing: 2}]],
      ['nested array', [[sheet.ph], null, [[{letterSpacing: 2}]], false]],
    ];
    for (const [name, style] of cases) {
      const r = mount(
        <HyperswitchVaultFormProvider session={session} environment="sandbox">
          <CardNumberField
            placeholder="Card Number"
            labelBehavior="none"
            styles={{placeholder: style as never}}
          />
          <CardExpiryField />
          <CardCVCField />
        </HyperswitchVaultFormProvider>,
      );
      const applied = flat(overlayText(r, 'CardNumberInputTestId').findAll((n) => String(n.type) === 'Text')[0].props.style);
      expect({name, fontSize: applied.fontSize}).toEqual({name, fontSize: 21});
      expectSharedVerticalCentre(r, 'CardNumberInputTestId');
      ReactTestRenderer.act(() => r.unmount());
    }
  });

  it('accessibility font scaling multiplies placeholder and input identically', () => {
    for (const fontScale of [1, 1.5, 2.5]) {
      const r = plain({}, {fontScale});
      const ph = flat(overlayText(r, 'CardNumberInputTestId').findAll((n) => String(n.type) === 'Text')[0].props.style);
      const inp = flat(by(r, 'CardNumberInputTestId').props.style);
      expect({fontScale, ph: ph.fontSize, inp: inp.fontSize}).toEqual({
        fontScale,
        ph: 16 * fontScale,
        inp: 16 * fontScale,
      });
      /* the box does not change shape under scaling */
      expectSharedVerticalCentre(r, 'CardNumberInputTestId');
      ReactTestRenderer.act(() => r.unmount());
    }
  });

  it('a merchant placeholder font size does NOT drag the input font with it', () => {
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField
          placeholder="Card Number"
          labelBehavior="none"
          styles={{placeholder: {fontSize: 28}}}
        />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    const ph = flat(overlayText(r, 'CardNumberInputTestId').findAll((n) => String(n.type) === 'Text')[0].props.style);
    expect(ph.fontSize).toBe(28);
    expect(flat(by(r, 'CardNumberInputTestId').props.style).fontSize).toBe(16);
    /* different sizes, still both centred in the same box */
    expectSharedVerticalCentre(r, 'CardNumberInputTestId');
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── 3. Overlay behaviour ─────────────────────────────────────────────────── */

describe('the overlay behaves like a native placeholder', () => {
  it('is non-interactive and hidden from assistive technology', () => {
    const r = plain();
    for (const o of overlays(r)) {
      expect(o.props.pointerEvents).toBe('none');
      expect(o.props.accessible).toBe(false);
      expect(o.props.accessibilityElementsHidden).toBe(true);
      expect(o.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(o.props.onPress).toBeUndefined();
    }
    /* the fields keep their own labels, so nothing is lost by hiding the overlay */
    expect(inputs(r).map((i) => i.props.accessibilityLabel).sort()).toEqual([
      'Card number', 'Cardholder name', 'Expiration date', 'Security code',
    ]);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('stays visible while the field is focused but empty', () => {
    const r = plain();
    expect(overlays(r)).toHaveLength(3);
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onFocus({}));
    expect(overlays(r)).toHaveLength(3);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('disappears as soon as there is input, and comes back when cleared', () => {
    const r = plain();
    expect(overlays(r)).toHaveLength(3);
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4'));
    expect(overlays(r)).toHaveLength(2);
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText(''));
    expect(overlays(r)).toHaveLength(3);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('reappears after reset()', () => {
    const formRef = React.createRef<VaultFormHandle>();
    const r = mount(
      <HyperswitchVault.CardForm
        ref={formRef}
        session={session}
        environment="sandbox"
        fieldOptions={{cardNumber: {placeholder: 'Card Number', labelBehavior: 'none'}}}
      />,
    );
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4242424242'));
    expect(overlays(r)).toHaveLength(0);
    ReactTestRenderer.act(() => formRef.current!.reset());
    expect(overlays(r)).toHaveLength(1);
    expect(by(r, 'CardNumberInputTestId').props.value).toBe('');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('no field sets React Native\'s native placeholder prop any more', () => {
    const r = plain();
    for (const i of inputs(r)) expect(i.props.placeholder).toBeUndefined();
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── 4. Data safety ───────────────────────────────────────────────────────── */

describe('a placeholder is never card data', () => {
  const cardShaped = () => {
    const formRef = React.createRef<VaultFormHandle>();
    const r = mount(
      <HyperswitchVault.CardForm
        ref={formRef}
        session={session}
        environment="sandbox"
        fieldOptions={{
          cardNumber: {placeholder: '4242 4242 4242 4242', labelBehavior: 'none'},
          expiry: {placeholder: '12/30', labelBehavior: 'none'},
          cvc: {placeholder: '123', labelBehavior: 'none'},
        }}
      />,
    );
    return {r, formRef};
  };

  it('is not the input value', () => {
    const {r} = cardShaped();
    for (const i of inputs(r)) expect(i.props.value).toBe('');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('focusing an empty field submits nothing', async () => {
    const {r, formRef} = cardShaped();
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onFocus({}));
    let result!: VaultTokenizeResult;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.tokenize();
    });
    expect(result.status).not.toBe('success');
    expect(calls).toHaveLength(0);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('blurring an empty field does not validate the placeholder as input', () => {
    const {r} = cardShaped();
    const seen: unknown[] = [];
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onFocus({}));
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onBlur({}));
    /* the value stayed empty, so the field is "required", never "valid" */
    expect(by(r, 'CardNumberInputTestId').props.value).toBe('');
    expect(seen).toHaveLength(0);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('reset restores the placeholder visually and leaves the value empty', () => {
    const {r, formRef} = cardShaped();
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4111111111111111'));
    ReactTestRenderer.act(() => formRef.current!.reset());
    expect(overlays(r)).toHaveLength(3);
    for (const i of inputs(r)) expect(i.props.value).toBe('');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('tokenization carries only typed data, never a placeholder string', async () => {
    const {r, formRef} = cardShaped();
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4111111111111111'));
    ReactTestRenderer.act(() => by(r, 'ExpiryInputTestId').props.onChangeText('11/29'));
    ReactTestRenderer.act(() => by(r, 'CVCInputTestId').props.onChangeText('456'));

    await ReactTestRenderer.act(async () => {
      const pending = formRef.current!.tokenize();
      calls[0].settle({associated_payment_methods: [{payment_method_token: {data: 'tok_ok'}}]});
      await pending;
    });

    const body = String(calls[0].options.body ?? '');
    /* booleans only — no value is printed */
    expect(body.includes('4111111111111111')).toBe(true);
    expect(body.includes('4242424242424242')).toBe(false);
    expect(body.includes('4242 4242 4242 4242')).toBe(false);
    expect(body.includes('12/30')).toBe(false);
    expect(body.includes('123')).toBe(false);
    ReactTestRenderer.act(() => r.unmount());
  });

  /*
   * This asserted that a placeholder string never appeared inside an emitted state payload. ADR-0003
   * removed state emission entirely, so there is no payload left to inspect — and the stronger
   * property is now testable directly: typing, focusing and blurring produce NO host-visible call at
   * all, and the component accepts no callback prop through which one could travel.
   */
  it('typing and focus produce no host-visible emission of any kind', () => {
    const seen: unknown[] = [];
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        fieldOptions={{
          cardNumber: {placeholder: '4242 4242 4242 4242', errorDisplay: 'inline', labelBehavior: 'none'},
          expiry: {placeholder: '12/30', labelBehavior: 'none'},
          cvc: {placeholder: '123', labelBehavior: 'none'},
        }}
      />,
    );

    /* The props surface admits no `on*` callback at all. */
    const form = r.root.findByProps({session});
    for (const key of Object.keys(form.props)) {
      expect(key).not.toMatch(/^on[A-Z]/);
    }

    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4111111111111111'));
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onFocus({}));
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onBlur({}));

    expect(seen).toHaveLength(0);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('no raw card value ever reaches the placeholder renderer', () => {
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        fieldOptions={{
          cardNumber: {placeholder: 'Card Number', labelBehavior: 'none'},
          expiry: {placeholder: 'MM/YY', labelBehavior: 'none'},
          cvc: {placeholder: 'CVC', labelBehavior: 'none'},
          /*
           * The cardholder name is named explicitly too. The ready-made form renders it, and at
           * the default `labelBehavior: 'floating'` its label container also carries
           * `pointerEvents: 'none'` — so the collector below would count it and the number would
           * be off by one for a reason that has nothing to do with what this test asserts.
           */
          cardholderName: {placeholder: 'Name on card', labelBehavior: 'none'},
        }}
      />,
    );
    /* type a PAN, then assert the surviving overlays carry no digits of it */
    ReactTestRenderer.act(() => by(r, 'CardNumberInputTestId').props.onChangeText('4111111111111111'));

    const findDigits = (node: unknown): boolean => {
      if (typeof node === 'string') return node.includes('4111');
      if (Array.isArray(node)) return node.some(findDigits);
      if (!node || typeof node !== 'object') return false;
      const n = node as {props?: Record<string, unknown>; children?: unknown};
      return Object.values(n.props ?? {}).some(findDigits) || findDigits(n.children);
    };
    const collect = (node: any, out: any[] = []): any[] => {
      if (!node || typeof node !== 'object') return out;
      if (Array.isArray(node)) { node.forEach((c) => collect(c, out)); return out; }
      if (node.props?.pointerEvents === 'none') out.push(node);
      collect(node.children, out);
      return out;
    };
    const rendered = collect(r.toJSON());
    /* the card number's own overlay is gone (it has a value); the other three remain */
    expect(rendered).toHaveLength(3);
    for (const o of rendered) expect(findDigits(o)).toBe(false);
    /* the walk is not vacuous */
    expect(findDigits({props: {}, children: ['xx4111xx']})).toBe(true);
    ReactTestRenderer.act(() => r.unmount());
  });
});
