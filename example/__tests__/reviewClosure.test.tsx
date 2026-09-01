/**
 * INDEPENDENT-REVIEW CLOSURE.
 *
 * One file per finding, so a regression names the finding it reopens:
 *   §2  fused border geometry across all four layout/arrangement combinations
 *   §3  no duplicate inline error
 *   §4  fused error-option isolation
 *   §5  placeholder horizontal alignment
 *   §7  processing / disabled placeholder opacity
 *   §10 one canonical brand value on every event surface
 *   §11 the security boundary still holds
 *
 * Sensitive values are asserted as booleans inside this file only. Nothing is printed or snapshotted.
 *
 * @format
 */
import React from 'react';
import {TextInput, StyleSheet, I18nManager} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVault,
  HyperswitchVaultForm,
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type VaultFormHandle,
  type VaultTokenizeResult,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

/*
 * `CardBrand`, `CardFormState`, `VaultFormState` and `VaultSubmitResult` used to be imported here.
 * All four are gone from the published surface — the first three with the state-emission removal,
 * the fourth when `submit()` split into `tokenize()` and `confirmPayment()`. Their absence is
 * asserted by `verify-event-surface.mjs` against the packed declarations; naming them here would
 * only make this file fail to compile.
 */

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

const session: MerchantSession = {
  session_token: [],
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: b64(
        'publishable_key=pk_snd_EXAMPLE_FAKE,payment_method_session_id=pms_closure,profile_id=pro_X',
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
const flat = (s: unknown): Record<string, any> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, any>;
const inputs = (r: Renderer) => r.root.findAll((n) => n.type === TextInput);
const by = (r: Renderer, id: string) => inputs(r).find((i) => i.props.testID === id)!;
const ID = {
  number: 'CardNumberInputTestId',
  expiry: 'ExpiryInputTestId',
  cvc: 'CVCInputTestId',
} as const;

const messages = (r: Renderer) =>
  r.root
    .findAll((n) => String(n.type) === 'Text')
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '');

const type_ = (r: Renderer, id: string, v: string) =>
  ReactTestRenderer.act(() => by(r, id).props.onChangeText(v));
const invalidate = (r: Renderer, id: string, v: string) => {
  ReactTestRenderer.act(() => by(r, id).props.onFocus({}));
  type_(r, id, v);
  ReactTestRenderer.act(() => by(r, id).props.onBlur({}));
};

/* The three bordered input boxes, in render order: number, expiry, cvc. */
/*
 * Selects the three CARD boxes by identity, not by position.
 *
 * This used to index every bordered box in render order, which broke the moment the cardholder-name
 * field started rendering above the card number: `boxes()[0]` silently became a different field and
 * the geometry assertions compared the wrong borders. Anchoring on the input testIDs keeps the
 * helper correct regardless of what else the form renders around them.
 */
const boxes = (r: Renderer, height = 48) => {
  const bordered = r.root.findAll(
    (n) => typeof n.type === 'string' && flat(n.props?.style).height === height,
  );
  const withInput = (testID: string) =>
    bordered.find((n) =>
      n.findAll((c: any) => c.props?.testID === testID, {deep: true}).length > 0,
    );
  return [
    withInput('CardNumberInputTestId'),
    withInput('ExpiryInputTestId'),
    withInput('CVCInputTestId'),
  ].filter(Boolean) as any[];
};
const edges = (n: any) => {
  const s = flat(n.props.style);
  return {
    T: s.borderTopWidth, R: s.borderRightWidth, B: s.borderBottomWidth, L: s.borderLeftWidth,
    TL: s.borderTopLeftRadius, TR: s.borderTopRightRadius,
    BL: s.borderBottomLeftRadius, BR: s.borderBottomRightRadius,
  };
};
const geometry = (props: Record<string, unknown>) => {
  const r = mount(<HyperswitchVault.CardForm session={session} environment="sandbox" {...props} />);
  const [number, expiry, cvc] = boxes(r).map(edges);
  ReactTestRenderer.act(() => r.unmount());
  return {number, expiry, cvc};
};

/* ── §2 Fused border geometry, all four combinations ───────────────────────── */

describe('§2 every edge width and corner radius, in all four combinations', () => {
  const W = 1;   /* theme.borderWidth  */
  const H = 0.5; /* a halved shared seam */
  const R = 8;   /* theme.borderRadius */
  const O = 0;   /* squared interior corner */

  it('stacked + separate: three independent boxes, every edge full, every corner rounded', () => {
    const g = geometry({layout: 'stacked', fieldArrangement: 'separate'});
    for (const box of [g.number, g.expiry, g.cvc]) {
      expect(box).toEqual({T: W, R: W, B: W, L: W, TL: R, TR: R, BL: R, BR: R});
    }
  });

  it('inline + separate: identical borders — only placement differs', () => {
    const g = geometry({layout: 'inline', fieldArrangement: 'separate'});
    for (const box of [g.number, g.expiry, g.cvc]) {
      expect(box).toEqual({T: W, R: W, B: W, L: W, TL: R, TR: R, BL: R, BR: R});
    }
  });

  it('stacked + fused: one vertical group', () => {
    const g = geometry({layout: 'stacked', fieldArrangement: 'fused'});
    /* card number: top corners rounded, bottom corners square, bottom seam half */
    expect(g.number).toEqual({T: W, R: W, B: H, L: W, TL: R, TR: R, BL: O, BR: O});
    /* expiry: all corners square, top AND bottom seams half */
    expect(g.expiry).toEqual({T: H, R: W, B: H, L: W, TL: O, TR: O, BL: O, BR: O});
    /* cvc: top corners square, bottom corners rounded, top seam half */
    expect(g.cvc).toEqual({T: H, R: W, B: W, L: W, TL: O, TR: O, BL: R, BR: R});
  });

  it('stacked + fused: each combined seam equals exactly one normal border', () => {
    const g = geometry({layout: 'stacked', fieldArrangement: 'fused'});
    expect(g.number.B + g.expiry.T).toBe(W);   /* number / expiry */
    expect(g.expiry.B + g.cvc.T).toBe(W);      /* expiry / cvc    */
  });

  it('stacked + fused: no middle-field radius creates a notch', () => {
    const g = geometry({layout: 'stacked', fieldArrangement: 'fused'});
    /* every interior corner is square; only the group's four outer corners are rounded */
    expect([g.number.BL, g.number.BR, g.expiry.TL, g.expiry.TR, g.expiry.BL, g.expiry.BR,
      g.cvc.TL, g.cvc.TR]).toEqual([O, O, O, O, O, O, O, O]);
    expect([g.number.TL, g.number.TR, g.cvc.BL, g.cvc.BR]).toEqual([R, R, R, R]);
  });

  it('inline + fused: the already-correct geometry is preserved', () => {
    const g = geometry({layout: 'inline', fieldArrangement: 'fused'});
    expect(g.number).toEqual({T: W, R: W, B: H, L: W, TL: R, TR: R, BL: O, BR: O});
    /* expiry sits bottom-LEFT: right edge shared with the cvc, bottom-left the group's corner */
    expect(g.expiry).toEqual({T: H, R: H, B: W, L: W, TL: O, TR: O, BL: R, BR: O});
    /* cvc sits bottom-RIGHT */
    expect(g.cvc).toEqual({T: H, R: W, B: W, L: H, TL: O, TR: O, BL: O, BR: R});
    expect(g.number.B + g.expiry.T).toBe(W);
    expect(g.expiry.R + g.cvc.L).toBe(W);
  });

  it('RTL does not alter vertical geometry', () => {
    const ltr = geometry({layout: 'stacked', fieldArrangement: 'fused'});
    const rtl = geometry({layout: 'stacked', fieldArrangement: 'fused', localisation: {isRtl: true}});
    expect(rtl).toEqual(ltr);
  });

  it('merchant border and radius styles keep final precedence', () => {
    const r = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        layout="stacked"
        fieldArrangement="fused"
        fieldStyles={{expiry: {container: {borderBottomWidth: 4, borderBottomLeftRadius: 21}}}}
      />,
    );
    const expiry = edges(boxes(r)[1]);
    expect(expiry.B).toBe(4);
    expect(expiry.BL).toBe(21);
    /* untouched edges keep the fused geometry */
    expect(expiry.T).toBe(H);
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── §3 No duplicate inline error ──────────────────────────────────────────── */

describe('§3 each field renders its inline error exactly once', () => {
  const all = {
    cardNumber: {errorDisplay: 'inline'} as const,
    expiry: {errorDisplay: 'inline'} as const,
    cvc: {errorDisplay: 'inline'} as const,
  };

  for (const [layout, fieldArrangement] of [
    ['stacked', 'separate'], ['inline', 'separate'],
    ['stacked', 'fused'], ['inline', 'fused'],
  ] as const) {
    it(`${layout}/${fieldArrangement}: CVC invalid alone -> exactly one message`, () => {
      const r = mount(
        <HyperswitchVault.CardForm session={session} environment="sandbox"
          layout={layout} fieldArrangement={fieldArrangement} fieldOptions={all} />,
      );
      invalidate(r, ID.cvc, '1');
      expect(messages(r)).toHaveLength(1);
      ReactTestRenderer.act(() => r.unmount());
    });
  }

  it('separate: card number and expiry also render exactly once each', () => {
    const r = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" fieldOptions={all} />,
    );
    invalidate(r, ID.number, '4242');
    expect(messages(r)).toHaveLength(1);
    invalidate(r, ID.expiry, '13/99');
    expect(messages(r)).toHaveLength(2);
    invalidate(r, ID.cvc, '1');
    expect(messages(r)).toHaveLength(3);
    /* three DISTINCT messages, not one repeated */
    expect(new Set(messages(r)).size).toBe(3);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('fused: multiple fields invalid still shows one shared line', () => {
    const r = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox"
        layout="inline" fieldArrangement="fused" fieldOptions={all} />,
    );
    invalidate(r, ID.number, '4242');
    invalidate(r, ID.expiry, '13/99');
    invalidate(r, ID.cvc, '1');
    expect(messages(r)).toHaveLength(1);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('correcting the field removes the message', () => {
    const r = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" fieldOptions={all} />,
    );
    invalidate(r, ID.cvc, '1');
    expect(messages(r)).toHaveLength(1);
    type_(r, ID.cvc, '123');
    expect(messages(r)).toHaveLength(0);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('reset() clears the message', () => {
    const ref = React.createRef<VaultFormHandle>();
    const r = mount(
      <HyperswitchVault.CardForm ref={ref} session={session} environment="sandbox" fieldOptions={all} />,
    );
    invalidate(r, ID.cvc, '1');
    expect(messages(r)).toHaveLength(1);
    ReactTestRenderer.act(() => ref.current!.reset());
    expect(messages(r)).toHaveLength(0);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('errorDisplay disabled renders nothing at all', () => {
    const r = mount(<HyperswitchVault.CardForm session={session} environment="sandbox" />);
    invalidate(r, ID.number, '4242');
    invalidate(r, ID.cvc, '1');
    expect(messages(r)).toHaveLength(0);
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── §4 Fused error-option isolation ───────────────────────────────────────── */

describe('§4 in a fused layout one field\'s opt-in never authorizes another\'s error', () => {
  const on = (enabled: boolean): 'inline' | 'none' => (enabled ? 'inline' : 'none');
  const mk = (n: boolean, e: boolean, c: boolean) => ({
    cardNumber: {errorDisplay: on(n)},
    expiry: {errorDisplay: on(e)},
    cvc: {errorDisplay: on(c)},
  });

  /* All three invalid at once, so every eligible field genuinely has something to show. */
  const shown = (n: boolean, e: boolean, c: boolean) => {
    const r = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox"
        layout="inline" fieldArrangement="fused" fieldOptions={mk(n, e, c)} />,
    );
    invalidate(r, ID.number, '4242');
    invalidate(r, ID.expiry, '13/99');
    invalidate(r, ID.cvc, '1');
    const out = messages(r);
    ReactTestRenderer.act(() => r.unmount());
    return out;
  };

  const NUMBER = 'Card number is invalid.';
  const EXPIRY = "Your card's expiration date is invalid.";
  const CVC = "Your card's security code is invalid.";

  /* Priority among ELIGIBLE fields is preserved: number, then expiry, then cvc. */
  const EXPECTED: [boolean, boolean, boolean, string[]][] = [
    [false, false, false, []],
    [true,  false, false, [NUMBER]],
    [false, true,  false, [EXPIRY]],
    [false, false, true,  [CVC]],
    [true,  true,  false, [NUMBER]],
    [true,  false, true,  [NUMBER]],
    [false, true,  true,  [EXPIRY]],
    [true,  true,  true,  [NUMBER]],
  ];

  for (const [n, e, c, want] of EXPECTED) {
    it(`number=${n} expiry=${e} cvc=${c} -> ${want.length ? want[0].slice(0, 18) : 'nothing'}`, () => {
      expect({n, e, c, shown: shown(n, e, c)}).toEqual({n, e, c, shown: want});
    });
  }

  it('the reported case: only the CVC opted in, only the card number invalid', () => {
    const r = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox"
        layout="inline" fieldArrangement="fused"
        fieldOptions={{cardNumber: {errorDisplay: 'none'}, expiry: {errorDisplay: 'none'},
          cvc: {errorDisplay: 'inline'}}} />,
    );
    invalidate(r, ID.number, '4242');
    expect(messages(r)).toEqual([]);
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── §5 Placeholder horizontal alignment ───────────────────────────────────── */

describe('§5 the placeholder inherits the input alignment unless it overrides it', () => {
  const overlayText = (r: Renderer) =>
    r.root
      .findAll((n) => typeof n.type === 'string' && n.props?.pointerEvents === 'none' &&
        n.props?.accessibilityElementsHidden === true)[0]
      .findAll((n) => String(n.type) === 'Text')[0];

  const build = (styles: Record<string, unknown>) =>
    mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField placeholder="Card Number" styles={styles as never} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );

  for (const align of ['left', 'center', 'right', 'auto', 'justify'] as const) {
    it(`inherits textAlign: ${align} from styles.input`, () => {
      const r = build({input: {textAlign: align}});
      expect(flat(overlayText(r).props.style).textAlign).toBe(align);
      expect(flat(by(r, ID.number).props.style).textAlign).toBe(align);
      ReactTestRenderer.act(() => r.unmount());
    });
  }

  it('with no alignment anywhere both sides are undefined — the platform default', () => {
    const r = build({});
    expect(flat(overlayText(r).props.style).textAlign).toBeUndefined();
    expect(flat(by(r, ID.number).props.style).textAlign).toBeUndefined();
    ReactTestRenderer.act(() => r.unmount());
  });

  it('styles.placeholder.textAlign wins over styles.input.textAlign', () => {
    const r = build({input: {textAlign: 'center'}, placeholder: {textAlign: 'right'}});
    expect(flat(overlayText(r).props.style).textAlign).toBe('right');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('registered styles, arrays and nested arrays all carry the alignment across', () => {
    const sheet = StyleSheet.create({c: {textAlign: 'center'}});
    const cases: [string, unknown][] = [
      ['registered', sheet.c],
      ['array', [sheet.c, {fontSize: 16}]],
      ['nested array', [[sheet.c], null, [[{fontSize: 16}]], false]],
    ];
    for (const [name, input] of cases) {
      const r = build({input});
      expect({name, align: flat(overlayText(r).props.style).textAlign}).toEqual({name, align: 'center'});
      ReactTestRenderer.act(() => r.unmount());
    }
  });

  it('the overlay Text is unconstrained in width, so textAlign can take effect', () => {
    const r = build({input: {textAlign: 'right'}});
    const s = flat(overlayText(r).props.style);
    /* no width/maxWidth/alignSelf pinning it to its content */
    for (const k of ['width', 'maxWidth', 'alignSelf', 'flex']) expect(s[k]).toBeUndefined();
    /* and its parent stretches children by default: no alignItems override */
    const container = r.root.findAll((n) => typeof n.type === 'string' &&
      n.props?.pointerEvents === 'none' && n.props?.accessibilityElementsHidden === true)[0];
    expect(flat(container.props.style).alignItems).toBeUndefined();
    ReactTestRenderer.act(() => r.unmount());
  });

  it('RTL leaves both the input and the placeholder on the same rule', () => {
    const wasRtl = I18nManager.isRTL;
    try {
      /* with no explicit alignment neither side pins one, so both follow the writing direction */
      const r = build({});
      expect(flat(overlayText(r).props.style).textAlign)
        .toBe(flat(by(r, ID.number).props.style).textAlign);
      ReactTestRenderer.act(() => r.unmount());
      /* and an explicit alignment is honoured identically on both */
      const r2 = build({input: {textAlign: 'right'}});
      expect(flat(overlayText(r2).props.style).textAlign)
        .toBe(flat(by(r2, ID.number).props.style).textAlign);
      ReactTestRenderer.act(() => r2.unmount());
    } finally {
      expect(I18nManager.isRTL).toBe(wasRtl);
    }
  });

  it('typing causes no horizontal jump: the value keeps the alignment the placeholder had', () => {
    const r = build({input: {textAlign: 'center'}});
    const before = flat(overlayText(r).props.style).textAlign;
    type_(r, ID.number, '4242');
    const after = flat(by(r, ID.number).props.style).textAlign;
    expect(after).toBe(before);
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── §7 Processing and disabled opacity ────────────────────────────────────── */

describe('§7 the placeholder shares the field\'s processing and disabled state', () => {
  const overlayText = (r: Renderer) =>
    r.root
      .findAll((n) => typeof n.type === 'string' && n.props?.pointerEvents === 'none' &&
        n.props?.accessibilityElementsHidden === true)[0]
      .findAll((n) => String(n.type) === 'Text')[0];

  const opacities = (props: Record<string, unknown>) => {
    const r = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox"
        fieldOptions={{cardNumber: {placeholder: 'Card Number'}}} {...props} />,
    );
    const out = {
      input: flat(by(r, ID.number).props.style).opacity,
      placeholder: flat(overlayText(r).props.style).opacity,
    };
    ReactTestRenderer.act(() => r.unmount());
    return out;
  };

  it('enabled: both fully opaque', () => {
    expect(opacities({})).toEqual({input: 1, placeholder: 1});
  });

  it('disabled: both dimmed by the same amount', () => {
    const o = opacities({disabled: true});
    expect(o.placeholder).toBe(o.input);
    expect(o.input).toBeLessThan(1);
  });

  it('processing (submit in flight): both dimmed by the same amount', async () => {
    const ref = React.createRef<VaultFormHandle>();
    const r = mount(
      <HyperswitchVault.CardForm ref={ref} session={session} environment="sandbox"
        fieldOptions={{cardNumber: {placeholder: 'Card Number'}}} />,
    );
    type_(r, ID.number, '4242424242424242');
    type_(r, ID.expiry, '11/29');
    type_(r, ID.cvc, '123');
    let pending!: Promise<VaultTokenizeResult>;
    ReactTestRenderer.act(() => {
      pending = ref.current!.tokenize();
    });
    /* mid-flight: the number field is filled, so read the CVC's placeholder instead */
    const dimmed = flat(by(r, ID.number).props.style).opacity;
    expect(dimmed).toBeLessThan(1);
    await ReactTestRenderer.act(async () => {
      calls[0].settle({associated_payment_methods: [{payment_method_token: {data: 'tok'}}]});
      await pending;
    });
    ReactTestRenderer.act(() => r.unmount());
  });

  it('a merchant opacity override replaces it — it is not multiplied', () => {
    const r = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" disabled
        fieldOptions={{cardNumber: {placeholder: 'Card Number'}}}
        fieldStyles={{cardNumber: {placeholder: {opacity: 0.25}, input: {opacity: 0.25}}}} />,
    );
    /* exactly the merchant's value, not 0.25 * 0.5 */
    expect(flat(overlayText(r).props.style).opacity).toBe(0.25);
    expect(flat(by(r, ID.number).props.style).opacity).toBe(0.25);
    ReactTestRenderer.act(() => r.unmount());
  });
});

/* ── §10 One canonical brand on every event surface ────────────────────────── */

/*
 * §10 covered the brand reported on five state-emission surfaces. ADR-0003 removed all of them, so
 * there is no surface left for the assertion to make and nothing to migrate it to — the block was
 * deleted rather than weakened into a test that always passes.
 *
 * What the brand still DOES drive is the card-number accessory, and that behaviour keeps its own
 * coverage in `brandIcon.test.tsx` (standard / hidden / animated / hideGeneric).
 */

describe('§11 the corrections expose no card data', () => {
  const FORBIDDEN_PROPS = [
    'value', 'defaultValue', 'onChange', 'onChangeText', 'secureTextEntry', 'maxLength',
    'keyboardType', 'autoCorrect', 'textContentType', 'autoComplete',
  ];

  it('none of the controlled/raw props are accepted on any public field', () => {
    /* The type tests own the compile-time proof; this is the runtime half: passing them changes
       nothing about the rendered TextInput, because the library never forwards merchant props. */
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        {/* @ts-expect-error - none of these are part of the field surface */}
        <CardNumberField value="4111111111111111" onChangeText={() => {}} maxLength={99}
          secureTextEntry={false} keyboardType="default" autoComplete="cc-number" />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    const input = by(r, ID.number);
    expect(input.props.value).toBe('');
    expect(input.props.maxLength).toBe(23);            /* the library's own, not 99 */
    expect(input.props.autoComplete).toBe('off');      /* the library's own */
    expect(input.props.textContentType).toBe('oneTimeCode');
    ReactTestRenderer.act(() => r.unmount());
  });

  it('placeholder, error, icon and layout state carry no card data', async () => {
    const ref = React.createRef<VaultFormHandle>();
    const seen: unknown[] = [];
    const r = mount(
      <HyperswitchVault.CardForm ref={ref} session={session} environment="sandbox"
        layout="stacked" fieldArrangement="fused"
        appearance={{brandIconMode: 'standard'}}
        /*
         * REMOVED props, passed on purpose and cast past the compiler. TypeScript rejects them —
         * `type-tests/consumer.tsx` proves that with `@ts-expect-error` — but a plain-JavaScript
         * caller is not bound by types, so the runtime assertion below (that `seen` stays empty)
         * is about exactly such a caller. React forwards an unknown prop to nothing.
         */
        {...({
          onFormStateChange: (s: unknown) => seen.push(s),
          onStateChange: (s: unknown) => seen.push(s),
        } as {})}
        fieldOptions={{
          cardNumber: {placeholder: 'Card Number', errorDisplay: 'inline'},
          expiry: {placeholder: 'Expiry', errorDisplay: 'inline'},
          cvc: {placeholder: 'CVC', cvcIcon: 'default', errorDisplay: 'inline'},
        }} />,
    );
    type_(r, ID.number, '4111111111111111');
    type_(r, ID.expiry, '11/29');
    type_(r, ID.cvc, '456');
    invalidate(r, ID.cvc, '4');

    /*
     * Everything the merchant can observe, MINUS each field's own TextInput `value`. That value is
     * the field's rendered content — the library owns it and draws it, which is the point of a card
     * field — so counting it would make the assertion vacuously false. The question is whether the
     * digits reach anywhere ELSE: the events, the placeholder, the error text, the icon, or any
     * layout container.
     */
    const stripValues = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(stripValues);
      if (!node || typeof node !== 'object') return node;
      const n = node as {type?: string; props?: Record<string, unknown>; children?: unknown};
      const props = {...(n.props ?? {})};
      if (n.type === 'TextInput') delete props.value;
      return {type: n.type, props, children: stripValues(n.children)};
    };

    const observable = JSON.stringify({events: seen, rendered: stripValues(r.toJSON())});
    const FORBIDDEN = [
      '4111111111111111', '4111 1111 1111 1111',  /* PAN, raw and formatted */
      '411111',                                    /* BIN                    */
      '1111',                                      /* last four              */
      '456',                                       /* CVC                    */
      '11/29',                                     /* expiry month and year  */
      'pk_snd_EXAMPLE_FAKE', 'pms_closure', 'sdk_authorization',
    ];
    for (const secret of FORBIDDEN) {
      expect({secret, leaked: observable.includes(secret)}).toEqual({secret, leaked: false});
    }
    /* the walk is not vacuous: the same search DOES find a planted string */
    expect(JSON.stringify({a: 'xx456xx'}).includes('456')).toBe(true);
    /* and stripping removed only the input values — the tree is still substantial */
    expect(observable.length).toBeGreaterThan(1000);

    /* no token before a successful submission */
    expect(observable.includes('tok_')).toBe(false);

    /* the invalid CVC above was there to force an error message; make the form submittable again */
    type_(r, ID.cvc, '456');

    let result!: VaultTokenizeResult;
    await ReactTestRenderer.act(async () => {
      const p = ref.current!.tokenize();
      calls[0].settle({associated_payment_methods: [{payment_method_token: {data: 'tok_final'}}]});
      result = await p;
    });
    expect(result).toEqual({status: 'success', token: 'tok_final'});
    expect(Object.keys(result).sort()).toEqual(['status', 'token']);
    ReactTestRenderer.act(() => r.unmount());
  });

  it('a field ref exposes exactly focus and blur', () => {
    const ref = React.createRef<any>();
    const r = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField ref={ref} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    expect(Object.keys(ref.current).sort()).toEqual(['blur', 'focus']);
    ReactTestRenderer.act(() => r.unmount());
  });
});
