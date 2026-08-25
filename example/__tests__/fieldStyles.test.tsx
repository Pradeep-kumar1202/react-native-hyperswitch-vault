/**
 * Runtime proof of the merchant styling boundary, for all three fields.
 *
 * A TypeScript cast can make `styles?: VaultFieldStyles` compile while the value never reaches a
 * native element; ADR-0002 §9 calls that out explicitly ("a cast is not a proof"). So every
 * assertion below inspects the RENDERED React Native tree from the PUBLISHED package and requires
 * the merchant's value to be present on the intended element.
 *
 * Each slot is given a deliberately absurd, unique value that the library's own defaults could
 * never produce, so a passing assertion cannot be a coincidence.
 *
 * Rendered through `@juspay-tech/react-native-hyperswitch-vault` (resolved by name via the exports
 * map) under the real React Native jest preset.
 *
 * @format
 */
import React from 'react';
import {View, TextInput, Text, Pressable, StyleSheet} from 'react-native';
import ReactTestRenderer, {type ReactTestRenderer as Renderer} from 'react-test-renderer';
import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardNumberWidget,
  CardExpiryField,
  CardCVCField,
  HyperswitchVault,
  type VaultFieldHandle,
  type VaultFormHandle,
  type VaultFieldStyles,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

declare const global: {fetch: unknown};

/* ── Fixture ─────────────────────────────────────────────────────────────── */

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

const session: MerchantSession = {
  session_token: [],
  vault_details: {
    vault_type: 'hyperswitch',
    vault_data: {
      sdk_authorization: toBase64(
        [
          'publishable_key=pk_snd_EXAMPLE_FAKE',
          'payment_method_session_id=pms_styles_test',
          'profile_id=pro_EXAMPLE_FAKE',
        ].join(','),
      ),
    },
  },
};

const CARD_NUMBER_TEST_ID = 'CardNumberInputTestId';

/*
 * Sentinel values. Every one is unique and unlike any library default, so finding it on an element
 * proves it came from the merchant prop and nowhere else.
 */
const SENTINEL = {
  rootBackground: '#0B1F3A',
  rootPadding: 17,
  containerBorderWidth: 6,
  containerBorderColor: '#FF00AA',
  containerRadius: 21,
  containerHeight: 71,
  inputFontSize: 27,
  inputColor: '#00E5FF',
  inputFontFamily: 'SpikeMono',
  inputPaddingLeft: 19,
  inputTextAlign: 'right' as const,
  placeholderColor: '#7C3AED',
  placeholderLetterSpacing: 3,
  labelColor: '#16A34A',
  labelFontWeight: '900' as const,
  errorColor: '#B91C1C',
  errorFontSize: 23,
  accessoryBackground: '#FACC15',
  accessoryWidth: 88,
};

const merchantStyles: VaultFieldStyles = {
  root: {backgroundColor: SENTINEL.rootBackground, padding: SENTINEL.rootPadding},
  container: {
    borderWidth: SENTINEL.containerBorderWidth,
    borderColor: SENTINEL.containerBorderColor,
    borderRadius: SENTINEL.containerRadius,
    height: SENTINEL.containerHeight,
  },
  input: {
    fontSize: SENTINEL.inputFontSize,
    color: SENTINEL.inputColor,
    fontFamily: SENTINEL.inputFontFamily,
    paddingLeft: SENTINEL.inputPaddingLeft,
    textAlign: SENTINEL.inputTextAlign,
  },
  placeholder: {
    color: SENTINEL.placeholderColor,
    letterSpacing: SENTINEL.placeholderLetterSpacing,
  },
  label: {color: SENTINEL.labelColor, fontWeight: SENTINEL.labelFontWeight},
  error: {color: SENTINEL.errorColor, fontSize: SENTINEL.errorFontSize},
  accessory: {backgroundColor: SENTINEL.accessoryBackground, width: SENTINEL.accessoryWidth},
};

/*
 * This suite mounts a lot of renderers to cover every field, slot and StyleProp form. Each mount
 * starts the floating label's 200 ms timing animation, and React Native does not cancel it on
 * unmount, so with real timers the leftover callbacks fire after Jest tears the environment down.
 * Faking timers avoids that; no assertion here samples an animation frame — the typography tests
 * read the interpolation's CONFIG, which is stronger anyway.
 */
beforeEach(() => {
  jest.useFakeTimers();
  (global as any).fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const mount = (element: React.ReactElement) => {
  let renderer!: Renderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
};

/*
 * Typed against the provider's OWN children type. The example and the library resolve
 * `React.ReactNode` through different @types/react copies, so a local `React.ReactNode` annotation
 * is not assignable; taking the type from the component itself is both exact and copy-agnostic.
 */
type ProviderChildren = React.ComponentProps<typeof HyperswitchVaultFormProvider>['children'];

const withProvider = (children: ProviderChildren) => (
  <HyperswitchVaultFormProvider session={session} environment="sandbox">
    {children}
    <CardExpiryField />
    <CardCVCField />
  </HyperswitchVaultFormProvider>
);

/*
 * React Native flattens style arrays natively; the test renderer keeps them as arrays. Resolving
 * with StyleSheet.flatten is what a device would see, so assertions are made against the FLATTENED
 * result — which also proves ordering (merchant last, therefore winning).
 */
const flat = (style: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

const cardNumberInput = (renderer: Renderer) =>
  renderer.root.findAll(
    (n) => n.type === TextInput && n.props.testID === CARD_NUMBER_TEST_ID,
  )[0];

/* The bordered box is the nearest ancestor View of the card-number TextInput that has a border. */
const cardNumberContainer = (renderer: Renderer) =>
  renderer.root
    .findAll((n) => n.type === View)
    .filter((n) => {
      const s = flat(n.props.style);
      return (
        s.borderTopWidth !== undefined &&
        n.findAll((c) => c.type === TextInput && c.props.testID === CARD_NUMBER_TEST_ID).length > 0
      );
    })[0];

const cardNumberRoot = (renderer: Renderer) =>
  renderer.root
    .findAll((n) => n.type === View)
    .filter(
      (n) =>
        n.findAll((c) => c.type === TextInput && c.props.testID === CARD_NUMBER_TEST_ID).length > 0,
    );

/* ── 1. Every slot reaches its element ────────────────────────────────────── */

describe('each style slot reaches its intended React Native element', () => {
  it('container — border width, colour, radius and height land on the bordered box', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));
    const style = flat(cardNumberContainer(renderer).props.style);

    expect(style.borderWidth ?? style.borderTopWidth).toBe(SENTINEL.containerBorderWidth);
    expect(style.borderColor).toBe(SENTINEL.containerBorderColor);
    expect(style.borderRadius ?? style.borderTopLeftRadius).toBe(SENTINEL.containerRadius);
    expect(style.height).toBe(SENTINEL.containerHeight);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('input — font size, colour, family, padding and alignment land on the TextInput', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));
    const style = flat(cardNumberInput(renderer).props.style);

    expect(style.fontSize).toBe(SENTINEL.inputFontSize);
    expect(style.color).toBe(SENTINEL.inputColor);
    expect(style.fontFamily).toBe(SENTINEL.inputFontFamily);
    expect(style.paddingLeft).toBe(SENTINEL.inputPaddingLeft);
    expect(style.textAlign).toBe(SENTINEL.inputTextAlign);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('root — background and padding land on the outermost wrapper', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));
    const matches = cardNumberRoot(renderer).filter(
      (n) => flat(n.props.style).backgroundColor === SENTINEL.rootBackground,
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(flat(matches[0].props.style).padding).toBe(SENTINEL.rootPadding);

    /* And it really is the OUTERMOST wrapper: it contains the bordered container. */
    expect(
      matches[0].findAll((c) => c.type === View && flat(c.props.style).borderTopWidth !== undefined)
        .length,
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('placeholder — styles the label element while the field is empty and unfocused', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));

    const texts = renderer.root.findAll(
      (n) => flat(n.props.style).color === SENTINEL.placeholderColor,
    );

    expect(texts.length).toBeGreaterThan(0);
    expect(flat(texts[0].props.style).letterSpacing).toBe(SENTINEL.placeholderLetterSpacing);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('label — replaces the placeholder slot once the field is focused', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));

    /* Resting: placeholder slot is applied, label slot is not. */
    const restingLabel = renderer.root
      .findAll((n) => flat(n.props.style).color === SENTINEL.labelColor);
    expect(restingLabel.length).toBe(0);

    ReactTestRenderer.act(() => {
      cardNumberInput(renderer).props.onFocus({nativeEvent: {}});
    });

    /* Focused: label slot is applied, placeholder slot is not. */
    const focusedLabel = renderer.root
      .findAll((n) => flat(n.props.style).color === SENTINEL.labelColor);
    expect(focusedLabel.length).toBeGreaterThan(0);
    expect(flat(focusedLabel[0].props.style).fontWeight).toBe(SENTINEL.labelFontWeight);

    const focusedPlaceholder = renderer.root
      .findAll((n) => flat(n.props.style).color === SENTINEL.placeholderColor);
    expect(focusedPlaceholder.length).toBe(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('accessory — background and width land on the brand-icon container', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));

    const pressables = renderer.root
      .findAll((n) => n.type === Pressable)
      .filter((n) => {
        const resolved = typeof n.props.style === 'function' ? n.props.style({pressed: false}) : n.props.style;
        return flat(resolved).backgroundColor === SENTINEL.accessoryBackground;
      });

    expect(pressables.length).toBeGreaterThan(0);
    const resolved =
      typeof pressables[0].props.style === 'function'
        ? pressables[0].props.style({pressed: false})
        : pressables[0].props.style;
    expect(flat(resolved).width).toBe(SENTINEL.accessoryWidth);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('error — styles the validation message once it becomes visible', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));
    const input = cardNumberInput(renderer);

    /* Type an invalid number, then blur so the library's visibility predicate shows the error. */
    ReactTestRenderer.act(() => {
      input.props.onFocus({nativeEvent: {}});
      input.props.onChangeText('4242');
    });
    ReactTestRenderer.act(() => {
      cardNumberInput(renderer).props.onBlur({nativeEvent: {}});
    });

    const errorTexts = renderer.root
      .findAll((n) => n.type === Text)
      .filter((n) => flat(n.props.style).color === SENTINEL.errorColor);

    expect(errorTexts.length).toBeGreaterThan(0);
    expect(flat(errorTexts[0].props.style).fontSize).toBe(SENTINEL.errorFontSize);
    /* It really is the error message element. */
    expect(typeof errorTexts[0].props.children).toBe('string');

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 2. Precedence and no-op behaviour ────────────────────────────────────── */

describe('precedence and absence', () => {
  it('merchant style wins over the library default on a conflicting key', () => {
    const renderer = mount(
      withProvider(<CardNumberField styles={{input: {color: SENTINEL.inputColor}}} />),
    );
    /* The library sets color to the theme text colour (#1A1A1A); the merchant must override it. */
    expect(flat(cardNumberInput(renderer).props.style).color).toBe(SENTINEL.inputColor);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('library defaults survive keys the merchant did not set', () => {
    const renderer = mount(
      withProvider(<CardNumberField styles={{input: {color: SENTINEL.inputColor}}} />),
    );
    const style = flat(cardNumberInput(renderer).props.style);
    /* fontStyle/opacity/width come from the library and must still be there. */
    expect(style.fontStyle).toBe('normal');
    expect(style.opacity).toBe(1);
    expect(style.width).toBe('100%');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('omitting `styles` renders byte-identically to the unstyled tree', () => {
    const serialise = (el: React.ReactElement) => {
      const r = mount(el);
      const json = JSON.stringify(r.toJSON(), (_k, v) => (typeof v === 'function' ? '[fn]' : v));
      ReactTestRenderer.act(() => r.unmount());
      return json;
    };

    const withoutProp = serialise(withProvider(<CardNumberField />));
    const withUndefined = serialise(withProvider(<CardNumberField styles={undefined} />));
    const withEmpty = serialise(withProvider(<CardNumberField styles={{}} />));

    expect(withUndefined).toEqual(withoutProp);
    expect(withEmpty).toEqual(withoutProp);
  });

  it('accepts every StyleProp form React Native accepts', () => {
    const sheet = StyleSheet.create({box: {borderWidth: 9}});
    for (const container of [
      {borderWidth: 9} as const,
      sheet.box,
      [sheet.box, {borderColor: SENTINEL.containerBorderColor}],
      [[sheet.box], null, undefined, false as const],
    ]) {
      const renderer = mount(withProvider(<CardNumberField styles={{container}} />));
      expect(flat(cardNumberContainer(renderer).props.style).borderWidth).toBe(9);
      ReactTestRenderer.act(() => renderer.unmount());
    }
  });
});

/* ── 3. Identity, refs and the safety boundary are untouched by styling ───── */

describe('Phase 1 contracts still hold', () => {
  it('component identity is preserved', () => {
    expect(CardNumberField).toBe(CardNumberWidget);
    expect(HyperswitchVault.CardNumber).toBe(CardNumberField);
    expect((CardNumberField as any).$$typeof).toBe(Symbol.for('react.forward_ref'));
  });

  it('the ref still exposes exactly focus and blur, and both reach the input', () => {
    const ref = React.createRef<VaultFieldHandle>();
    const renderer = mount(withProvider(<CardNumberField ref={ref} styles={merchantStyles} />));

    expect(Object.keys(ref.current!).sort()).toEqual(['blur', 'focus']);
    expect((ref.current as any).getValue).toBeUndefined();

    const focusMock = (TextInput as any).prototype.focus as jest.Mock;
    const blurMock = (TextInput as any).prototype.blur as jest.Mock;
    focusMock.mockClear();
    blurMock.mockClear();

    ReactTestRenderer.act(() => ref.current!.focus());
    expect(focusMock).toHaveBeenCalled();

    ReactTestRenderer.act(() => ref.current!.blur());
    expect(blurMock).toHaveBeenCalled();

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the styles prop does not become a TextInput passthrough', () => {
    const renderer = mount(
      withProvider(
        <CardNumberField
          styles={merchantStyles}
          /* A merchant trying to smuggle control props in must not reach TextInput. */
          {...({value: '4111111111111111', maxLength: 19, secureTextEntry: true} as Record<
            string,
            unknown
          >)}
        />,
      ),
    );

    const input = cardNumberInput(renderer);
    expect(input.props.value).toBe('');
    expect(input.props.maxLength).toBe(23);
    expect(input.props.secureTextEntry).toBe(false);
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(input.props.autoCorrect).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('library-owned behaviour is unchanged while styled', () => {
    const renderer = mount(withProvider(<CardNumberField styles={merchantStyles} />));
    const input = cardNumberInput(renderer);

    /* Formatting still groups, and the test ID is untouched. */
    ReactTestRenderer.act(() => input.props.onChangeText('4242424242424242'));
    expect(cardNumberInput(renderer).props.value).toBe('4242 4242 4242 4242');
    expect(cardNumberInput(renderer).props.testID).toBe(CARD_NUMBER_TEST_ID);

    /* Brand detection still drives the icon: the visa asset replaces the placeholder card. */
    const images = renderer.root.findAll(
      (n) => typeof n.props?.source?.testUri === 'string',
    );
    expect(images.some((n) => String(n.props.source.testUri).includes('visa'))).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 5. Field styles are per-instance, not provider-wide state ─────────────── */

/*
 * Per-field styling is presentation data belonging to ONE rendered field. If it
 * were ever stored in the controller, the form state, the provider context, the submission state or
 * the registry, a second field would inherit it. These tests mount two independent providers in one
 * tree and require each field to see only its own value — which is what makes the "ordinary
 * component prop" data path observable rather than merely asserted in a comment.
 */

const ALPHA: VaultFieldStyles = {
  container: {borderWidth: 5, borderColor: '#AA0001'},
  input: {fontSize: 31},
  error: {color: '#AA0002'},
};
const BETA: VaultFieldStyles = {
  container: {borderWidth: 9, borderColor: '#BB0001'},
  input: {fontSize: 13},
  error: {color: '#BB0002'},
};

const twoProviders = (left: ProviderChildren, right: ProviderChildren) => (
  <View>
    <HyperswitchVaultFormProvider session={session} environment="sandbox">
      {left}
      <CardExpiryField />
      <CardCVCField />
    </HyperswitchVaultFormProvider>
    <HyperswitchVaultFormProvider session={session} environment="sandbox">
      {right}
      <CardExpiryField />
      <CardCVCField />
    </HyperswitchVaultFormProvider>
  </View>
);

const allCardNumberInputs = (renderer: Renderer) =>
  renderer.root.findAll((n) => n.type === TextInput && n.props.testID === CARD_NUMBER_TEST_ID);

const allCardNumberContainers = (renderer: Renderer) =>
  renderer.root
    .findAll((n) => n.type === View)
    .filter((n) => {
      const s = flat(n.props.style);
      return (
        s.borderTopWidth !== undefined &&
        n.findAll((c) => c.type === TextInput && c.props.testID === CARD_NUMBER_TEST_ID).length > 0
      );
    });

describe('styles do not leak between providers', () => {
  it('two providers with different sentinels keep them entirely separate', () => {
    const renderer = mount(
      twoProviders(<CardNumberField styles={ALPHA} />, <CardNumberField styles={BETA} />),
    );

    const containers = allCardNumberContainers(renderer).map((n) => flat(n.props.style));
    const inputs = allCardNumberInputs(renderer).map((n) => flat(n.props.style));
    expect(containers).toHaveLength(2);
    expect(inputs).toHaveLength(2);

    const alpha = containers.find((s) => s.borderColor === '#AA0001');
    const beta = containers.find((s) => s.borderColor === '#BB0001');
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();

    /* Each container carries its own width and NOT the other's. */
    expect(alpha!.borderWidth ?? alpha!.borderTopWidth).toBe(5);
    expect(beta!.borderWidth ?? beta!.borderTopWidth).toBe(9);

    /* Each input carries its own font size, and both sizes exist exactly once. */
    const sizes = inputs.map((s) => s.fontSize).sort();
    expect(sizes).toEqual([13, 31]);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('an unstyled field beside a styled one is untouched — no provider-wide broadcast', () => {
    /* Baseline: both unstyled. */
    const baseline = mount(twoProviders(<CardNumberField />, <CardNumberField />));
    const baselineRight = JSON.stringify(
      allCardNumberContainers(baseline).map((n) => flat(n.props.style)),
    );
    ReactTestRenderer.act(() => baseline.unmount());

    /* Now style only the LEFT one. The right one must be identical to baseline. */
    const renderer = mount(twoProviders(<CardNumberField styles={ALPHA} />, <CardNumberField />));
    const containers = allCardNumberContainers(renderer).map((n) => flat(n.props.style));
    expect(containers).toHaveLength(2);

    const styled = containers.filter((s) => s.borderColor === '#AA0001');
    const unstyled = containers.filter((s) => s.borderColor !== '#AA0001');
    expect(styled).toHaveLength(1);
    expect(unstyled).toHaveLength(1);

    /* The untouched field matches one of the two baseline containers exactly. */
    expect(baselineRight).toContain(JSON.stringify(unstyled[0]));

    /* And none of the merchant's sentinels appear anywhere on it. */
    expect(unstyled[0].borderWidth ?? unstyled[0].borderTopWidth).not.toBe(5);
    expect(unstyled[0].borderColor).not.toBe('#AA0001');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the error slot is per-field too: one field errors with its own colour, the other is clean', () => {
    const renderer = mount(
      twoProviders(<CardNumberField styles={ALPHA} />, <CardNumberField styles={BETA} />),
    );

    /* Drive ONLY the alpha field into a validation error. */
    const alphaInput = allCardNumberInputs(renderer).filter(
      (n) => flat(n.props.style).fontSize === 31,
    )[0];
    ReactTestRenderer.act(() => alphaInput.props.onChangeText('4242'));
    ReactTestRenderer.act(() => alphaInput.props.onBlur());

    const errorColours = renderer.root
      .findAll((n) => n.type === Text)
      .map((n) => flat(n.props.style).color)
      .filter((c) => c === '#AA0002' || c === '#BB0002');

    expect(errorColours).toEqual(['#AA0002']);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('duplicate-field protection inside ONE provider is unweakened by styles', async () => {
    const formRef = React.createRef<VaultFormHandle>();
    let renderer!: Renderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
          {/* two card-number fields, differently styled — still a duplicate */}
          <CardNumberField styles={ALPHA} />
          <CardNumberField styles={BETA} />
          <CardExpiryField />
          <CardCVCField />
        </HyperswitchVaultFormProvider>,
      );
    });

    let result: Awaited<ReturnType<VaultFormHandle['submit']>> | undefined;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.submit();
    });

    expect(result?.status).toBe('not_ready');
    expect(global.fetch).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ── 6. Animated-label typography: the corrected contract ─────────────────── */

/*
 * `placeholder` and `label` style the same `Animated.Text`, whose ONLY
 * animated key is `fontSize`. A static value there shadows the interpolation, which collapses
 * AnimatedStyle and leaks an unresolved AnimatedNode to the host element.
 *
 * TypeScript cannot prevent that — a `TextStyle`-annotated variable, a registered style, an array,
 * a type assertion and every JavaScript consumer all get through (measured). So
 * the library takes the value at RUNTIME instead: `fontSize` is extracted from the merchant's
 * placeholder/label style and used as the ANIMATION ENDPOINT for that state, and the rest of the
 * style is forwarded with `fontSize` removed.
 *
 * These tests prove there is no route by which a static merchant fontSize reaches the element.
 */

const animatedLabelHostStyle = (renderer: Renderer) =>
  renderer.root.findAll((n) => String(n.type) === 'Text')[0]?.props.style;

const containsAnimatedNode = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsAnimatedNode);
  if (value && typeof value === 'object') {
    const name = value.constructor?.name ?? '';
    if (/^Animated/.test(name)) return true;
    return Object.values(value as Record<string, unknown>).some(containsAnimatedNode);
  }
  return false;
};

/*
 * Every style prop in the tree that still holds an Animated node. There are two: the wrapper
 * Animated.View (height, interpolated between percentage STRINGS) and the Animated.Text (fontSize,
 * interpolated between NUMBERS). Both are collected; the numeric one is the label typography.
 */
const animatedInputStyles = (renderer: Renderer) =>
  renderer.root
    .findAll((n) => n.props?.style !== undefined && containsAnimatedNode(n.props.style))
    .map((n) => n.props.style);

const animatedLabelInputStyle = (renderer: Renderer) => animatedInputStyles(renderer);

/*
 * Read the interpolation's CONFIGURED endpoints. Stronger than sampling a rendered frame: it proves
 * what the animation will do across its whole range, in both states, without driving it.
 *
 * The walk must stop AT an Animated node rather than descend into it — the Animated graph holds
 * parent/child back-references and recursing would not terminate.
 */
const interpolationOutputRange = (renderer: Renderer): number[] | undefined => {
  const found: number[][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (/^Animated/.test(v.constructor?.name ?? '')) {
      const range = (v as {_config?: {outputRange?: unknown[]}})._config?.outputRange;
      if (Array.isArray(range) && range.every((x) => typeof x === 'number')) {
        found.push(range as number[]);
      }
      return;
    }
    Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(animatedLabelInputStyle(renderer));
  return found[0];
};

describe('the animated label keeps its interpolation', () => {
  it('with no merchant style the default animation is unchanged', () => {
    const renderer = mount(withProvider(<CardNumberField />));

    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);
    expect(flat(animatedLabelHostStyle(renderer)).fontSize).toBe(16);
    /* library defaults: resting (16 + 0) * 1, floating 16 + 0 - 5 */
    expect(interpolationOutputRange(renderer)).toEqual([16, 11]);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the resting endpoint comes from placeholder.fontSize', () => {
    const renderer = mount(withProvider(<CardNumberField styles={{placeholder: {fontSize: 41}}} />));

    expect(interpolationOutputRange(renderer)).toEqual([41, 11]);
    /* the merchant value is the animation floor, not a static shadow */
    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the floating endpoint comes from label.fontSize', () => {
    const renderer = mount(withProvider(<CardNumberField styles={{label: {fontSize: 7}}} />));

    /* The endpoint lives in the interpolation config, so it is provable without driving the
     * animation — and reading the config is a stronger assertion than sampling one frame. */
    expect(interpolationOutputRange(renderer)).toEqual([16, 7]);
    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('both endpoints together, and the interpolation is still live', () => {
    const renderer = mount(
      withProvider(<CardNumberField styles={{placeholder: {fontSize: 22}, label: {fontSize: 9}}} />),
    );

    expect(interpolationOutputRange(renderer)).toEqual([22, 9]);
    /* an AnimatedInterpolation still owns fontSize on the Animated.Text's input style */
    expect(containsAnimatedNode(animatedLabelInputStyle(renderer))).toBe(true);
    /* and it is still resolved before reaching the host */
    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the non-fontSize half of the same style is still delivered', () => {
    const renderer = mount(
      withProvider(
        <CardNumberField styles={{placeholder: {fontSize: 33, color: '#7C3AED', letterSpacing: 3}}} />,
      ),
    );

    const style = flat(animatedLabelHostStyle(renderer));
    expect(style.color).toBe('#7C3AED');
    expect(style.letterSpacing).toBe(3);
    expect(interpolationOutputRange(renderer)).toEqual([33, 11]);
    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('registered styles, arrays and nested arrays all work', () => {
    const sheet = StyleSheet.create({
      resting: {fontSize: 28, color: '#111111'},
      floating: {fontSize: 8, color: '#222222'},
    });

    /* registered */
    const a = mount(withProvider(<CardNumberField styles={{placeholder: sheet.resting, label: sheet.floating}} />));
    expect(interpolationOutputRange(a)).toEqual([28, 8]);
    expect(flat(animatedLabelHostStyle(a)).color).toBe('#111111');
    expect(containsAnimatedNode(animatedLabelHostStyle(a))).toBe(false);
    ReactTestRenderer.act(() => a.unmount());

    /* array — the LAST fontSize wins the flatten, as React Native itself would resolve it */
    const b = mount(
      withProvider(<CardNumberField styles={{placeholder: [sheet.resting, {fontSize: 35}]}} />),
    );
    expect(interpolationOutputRange(b)).toEqual([35, 11]);
    expect(containsAnimatedNode(animatedLabelHostStyle(b))).toBe(false);
    ReactTestRenderer.act(() => b.unmount());

    /* nested array with null / undefined / false entries */
    const c = mount(
      withProvider(
        <CardNumberField
          styles={{
            placeholder: [[sheet.resting], [null, {letterSpacing: 4}], undefined, false as const],
          }}
        />,
      ),
    );
    expect(interpolationOutputRange(c)).toEqual([28, 11]);
    expect(flat(animatedLabelHostStyle(c)).letterSpacing).toBe(4);
    expect(containsAnimatedNode(animatedLabelHostStyle(c))).toBe(false);
    ReactTestRenderer.act(() => c.unmount());
  });

  it('a null / undefined / empty slot is a clean no-op', () => {
    for (const slot of [null, undefined, {}, false as const, []]) {
      const renderer = mount(
        withProvider(<CardNumberField styles={{placeholder: slot as VaultFieldStyles['placeholder']}} />),
      );
      expect(interpolationOutputRange(renderer)).toEqual([16, 11]);
      expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);
      ReactTestRenderer.act(() => renderer.unmount());
    }
  });

  it('A JAVASCRIPT CONSUMER cannot shadow the animated value', () => {
    /*
     * The point of the runtime defence. This is what an untyped JS merchant writes; TypeScript is
     * bypassed entirely with a cast so the test really does exercise the runtime path.
     */
    const jsStyles = {
      placeholder: {fontSize: 41, color: '#AA1111'},
      label: {fontSize: 5},
    } as unknown as VaultFieldStyles;

    const renderer = mount(withProvider(<CardNumberField styles={jsStyles} />));

    /* no AnimatedNode leaks to the host — i.e. AnimatedStyle did NOT collapse */
    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);
    /* the values became endpoints instead of shadows */
    expect(interpolationOutputRange(renderer)).toEqual([41, 5]);
    /* the rest of the style still applies */
    expect(flat(animatedLabelHostStyle(renderer)).color).toBe('#AA1111');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a non-numeric fontSize is stripped and never becomes an endpoint', () => {
    const junk = {placeholder: {fontSize: '41px'}} as unknown as VaultFieldStyles;
    const renderer = mount(withProvider(<CardNumberField styles={junk} />));

    /* library defaults survive; the junk value cannot reach the element */
    expect(interpolationOutputRange(renderer)).toEqual([16, 11]);
    expect(flat(animatedLabelHostStyle(renderer)).fontSize).toBe(16);
    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('no static fontSize survives anywhere in the animated label style tree', () => {
    const renderer = mount(
      withProvider(<CardNumberField styles={{placeholder: {fontSize: 41}, label: {fontSize: 5}}} />),
    );

    /* Walk the RAW style prop given to Animated.Text: no plain-number fontSize may appear. */
    const staticSizes: unknown[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === 'object') {
        const rec = v as Record<string, unknown>;
        if ('fontSize' in rec && typeof rec.fontSize === 'number') staticSizes.push(rec.fontSize);
        if (!/^Animated/.test(v.constructor?.name ?? '')) Object.values(rec).forEach(walk);
      }
    };
    walk(animatedLabelInputStyle(renderer));
    expect(staticSizes).toEqual([]);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ══ Phase 2B — expiry, CVC and the ready-made form ══════════════════════════════════════════ */

const EXPIRY_TEST_ID = 'ExpiryInputTestId';
const CVC_TEST_ID = 'CVCInputTestId';

const inputBy = (renderer: Renderer, testID: string) =>
  renderer.root.findAll((n) => n.type === TextInput && n.props.testID === testID)[0];

/* The bordered box is the nearest ancestor View of that field's TextInput that has a border. */
const containerBy = (renderer: Renderer, testID: string) =>
  renderer.root
    .findAll((n) => n.type === View)
    .filter((n) => {
      const s = flat(n.props.style);
      return (
        s.borderTopWidth !== undefined &&
        n.findAll((c) => c.type === TextInput && c.props.testID === testID).length > 0
      );
    })[0];

/* Every View that contains this field's input, outermost first. */
const ancestorsOf = (renderer: Renderer, testID: string) =>
  renderer.root
    .findAll((n) => n.type === View)
    .filter((n) => n.findAll((c) => c.type === TextInput && c.props.testID === testID).length > 0);

/* The animated label element for a field: the Text nearest to that field's input. */
const labelTextOf = (renderer: Renderer, testID: string) => {
  const container = containerBy(renderer, testID);
  return container.findAll((n) => String(n.type) === 'Text')[0];
};

const SLOTS = {
  root: {backgroundColor: '#111827', padding: 13},
  container: {borderWidth: 4, borderColor: '#EA580C', borderRadius: 15},
  input: {fontSize: 25, color: '#0EA5E9', fontFamily: 'FieldMono'},
  placeholder: {color: '#9333EA', letterSpacing: 2},
  label: {color: '#15803D', fontWeight: '800' as const},
  error: {color: '#DC2626', fontSize: 19},
  accessory: {backgroundColor: '#F59E0B', width: 77},
};

describe('expiry field: every slot it declares reaches a real element', () => {
  const expiryStyles = {
    root: SLOTS.root,
    container: SLOTS.container,
    input: SLOTS.input,
    placeholder: SLOTS.placeholder,
    label: SLOTS.label,
    error: SLOTS.error,
  };

  const withExpiry = () => (
    <HyperswitchVaultFormProvider session={session} environment="sandbox">
      <CardNumberField />
      <CardExpiryField styles={expiryStyles} />
      <CardCVCField />
    </HyperswitchVaultFormProvider>
  );

  it('container, input and root', () => {
    const renderer = mount(withExpiry());

    const container = flat(containerBy(renderer, EXPIRY_TEST_ID).props.style);
    expect(container.borderWidth ?? container.borderTopWidth).toBe(4);
    expect(container.borderColor).toBe('#EA580C');

    const input = flat(inputBy(renderer, EXPIRY_TEST_ID).props.style);
    expect(input.fontSize).toBe(25);
    expect(input.color).toBe('#0EA5E9');
    expect(input.fontFamily).toBe('FieldMono');

    const roots = ancestorsOf(renderer, EXPIRY_TEST_ID).map((n) => flat(n.props.style));
    expect(roots.some((s) => s.backgroundColor === '#111827' && s.padding === 13)).toBe(true);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('placeholder while resting, label once focused', () => {
    const renderer = mount(withExpiry());

    expect(flat(labelTextOf(renderer, EXPIRY_TEST_ID).props.style).color).toBe('#9333EA');
    expect(flat(labelTextOf(renderer, EXPIRY_TEST_ID).props.style).letterSpacing).toBe(2);

    ReactTestRenderer.act(() =>
      inputBy(renderer, EXPIRY_TEST_ID).props.onFocus({nativeEvent: {}}),
    );
    expect(flat(labelTextOf(renderer, EXPIRY_TEST_ID).props.style).color).toBe('#15803D');
    expect(flat(labelTextOf(renderer, EXPIRY_TEST_ID).props.style).fontWeight).toBe('800');

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('error, once an invalid expiry is entered and blurred', () => {
    const renderer = mount(withExpiry());
    const input = inputBy(renderer, EXPIRY_TEST_ID);

    ReactTestRenderer.act(() => input.props.onChangeText('13/99'));
    ReactTestRenderer.act(() => input.props.onBlur({nativeEvent: {}}));

    const errors = renderer.root
      .findAll((n) => String(n.type) === 'Text')
      .map((n) => flat(n.props.style))
      .filter((s) => s.color === '#DC2626');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].fontSize).toBe(19);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders NO accessory element at all — which is why the slot does not exist', () => {
    const renderer = mount(withExpiry());
    const container = containerBy(renderer, EXPIRY_TEST_ID);

    /* The card number and CVC both render a Pressable accessory inside their box; expiry does not. */
    expect(container.findAll((n) => n.type === Pressable).length).toBe(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('CVC field: every slot reaches a real element, accessory included', () => {
  const withCvc = () => (
    <HyperswitchVaultFormProvider session={session} environment="sandbox">
      <CardNumberField />
      <CardExpiryField />
      <CardCVCField styles={SLOTS} />
    </HyperswitchVaultFormProvider>
  );

  it('container, input, root and accessory', () => {
    const renderer = mount(withCvc());

    const container = flat(containerBy(renderer, CVC_TEST_ID).props.style);
    expect(container.borderWidth ?? container.borderTopWidth).toBe(4);
    expect(container.borderColor).toBe('#EA580C');

    expect(flat(inputBy(renderer, CVC_TEST_ID).props.style).fontSize).toBe(25);

    const roots = ancestorsOf(renderer, CVC_TEST_ID).map((n) => flat(n.props.style));
    expect(roots.some((s) => s.backgroundColor === '#111827')).toBe(true);

    /*
     * The CVC accessory is the icon Pressable inside the CVC's own bordered box. CardPressable
     * hands React Native a style FUNCTION (`_ => style`), so it has to be resolved before reading.
     */
    const accessory = containerBy(renderer, CVC_TEST_ID)
      .findAll((n) => n.type === Pressable)
      .map((n) => flat(typeof n.props.style === 'function' ? n.props.style({pressed: false}) : n.props.style))
      .filter((s) => s.backgroundColor === '#F59E0B');
    expect(accessory).toHaveLength(1);
    expect(accessory[0].width).toBe(77);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('placeholder, label and error', () => {
    const renderer = mount(withCvc());

    expect(flat(labelTextOf(renderer, CVC_TEST_ID).props.style).color).toBe('#9333EA');
    ReactTestRenderer.act(() => inputBy(renderer, CVC_TEST_ID).props.onFocus({nativeEvent: {}}));
    expect(flat(labelTextOf(renderer, CVC_TEST_ID).props.style).color).toBe('#15803D');

    const input = inputBy(renderer, CVC_TEST_ID);
    ReactTestRenderer.act(() => input.props.onChangeText('1'));
    ReactTestRenderer.act(() => input.props.onBlur({nativeEvent: {}}));
    const errors = renderer.root
      .findAll((n) => String(n.type) === 'Text')
      .map((n) => flat(n.props.style))
      .filter((s) => s.color === '#DC2626');
    expect(errors.length).toBeGreaterThan(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the CVC icon still renders, and the secure/library-owned props are untouched', () => {
    const renderer = mount(withCvc());
    const input = inputBy(renderer, CVC_TEST_ID);

    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.maxLength).toBe(4);
    expect(input.props.keyboardType).toBe('number-pad');

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

/* ══ The ready-made form: one grouped prop, no switch to the provider API ════════════════════ */

const FORM_STYLES = {
  cardNumber: {container: {borderColor: '#2563EB', borderWidth: 3}, input: {fontSize: 18}},
  expiry: {container: {borderColor: '#059669'}, input: {fontSize: 14}},
  cvc: {container: {borderColor: '#DB2777'}, input: {fontSize: 12}, accessory: {width: 55}},
} as const;

const serialise = (renderer: Renderer) => JSON.stringify(renderer.toJSON());

describe('ready-made form: fieldStyles routes each record to its own field', () => {
  for (const split of [false, true]) {
    const layout = split ? 'split' : 'fused';

    it(`${layout} layout — each field gets its own container colour and font size`, () => {
      const renderer = mount(
        <HyperswitchVault.CardForm
          session={session}
          environment="sandbox"
          splitCardFields={split}
          fieldStyles={FORM_STYLES}
        />,
      );

      expect(flat(containerBy(renderer, CARD_NUMBER_TEST_ID).props.style).borderColor).toBe('#2563EB');
      expect(flat(containerBy(renderer, EXPIRY_TEST_ID).props.style).borderColor).toBe('#059669');
      expect(flat(containerBy(renderer, CVC_TEST_ID).props.style).borderColor).toBe('#DB2777');

      expect(flat(inputBy(renderer, CARD_NUMBER_TEST_ID).props.style).fontSize).toBe(18);
      expect(flat(inputBy(renderer, EXPIRY_TEST_ID).props.style).fontSize).toBe(14);
      expect(flat(inputBy(renderer, CVC_TEST_ID).props.style).fontSize).toBe(12);

      ReactTestRenderer.act(() => renderer.unmount());
    });

    it(`${layout} layout — omitting fieldStyles renders byte-identically to before`, () => {
      const bare = mount(
        <HyperswitchVault.CardForm session={session} environment="sandbox" splitCardFields={split} />,
      );
      const bareTree = serialise(bare);
      ReactTestRenderer.act(() => bare.unmount());

      for (const value of [undefined, {}, {cardNumber: {}, expiry: {}, cvc: {}}]) {
        const renderer = mount(
          <HyperswitchVault.CardForm
            session={session}
            environment="sandbox"
            splitCardFields={split}
            fieldStyles={value}
          />,
        );
        expect(serialise(renderer)).toBe(bareTree);
        ReactTestRenderer.act(() => renderer.unmount());
      }
    });
  }

  it('the fused layout keeps its joined borders and squared inner corners by default', () => {
    const renderer = mount(<HyperswitchVault.CardForm session={session} environment="sandbox" />);

    const number = flat(containerBy(renderer, CARD_NUMBER_TEST_ID).props.style);
    const expiry = flat(containerBy(renderer, EXPIRY_TEST_ID).props.style);
    const cvc = flat(containerBy(renderer, CVC_TEST_ID).props.style);

    /* The library owns the join: halved shared edges and squared inner corners. */
    expect(number.borderBottomWidth).toBeLessThan(number.borderTopWidth as number);
    expect(number.borderBottomLeftRadius).toBe(0);
    expect(number.borderBottomRightRadius).toBe(0);
    expect(expiry.borderTopLeftRadius).toBe(0);
    expect(expiry.borderTopRightRadius).toBe(0);
    expect(cvc.borderTopLeftRadius).toBe(0);
    expect(cvc.borderTopRightRadius).toBe(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('the split layout keeps full borders and rounded corners on every field', () => {
    const renderer = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" splitCardFields />,
    );

    for (const id of [CARD_NUMBER_TEST_ID, EXPIRY_TEST_ID, CVC_TEST_ID]) {
      const s = flat(containerBy(renderer, id).props.style);
      expect(s.borderTopWidth).toBe(s.borderBottomWidth);
      expect(s.borderTopLeftRadius).toBeGreaterThan(0);
      expect(s.borderBottomRightRadius).toBeGreaterThan(0);
    }

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a merchant may deliberately override the fused join — the library layer loses', () => {
    const renderer = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        fieldStyles={{cardNumber: {container: {borderBottomLeftRadius: 24, borderBottomWidth: 9}}}}
      />,
    );

    const number = flat(containerBy(renderer, CARD_NUMBER_TEST_ID).props.style);
    expect(number.borderBottomLeftRadius).toBe(24);
    expect(number.borderBottomWidth).toBe(9);
    /* and the fields the merchant did not touch keep the library's join */
    expect(flat(containerBy(renderer, EXPIRY_TEST_ID).props.style).borderTopLeftRadius).toBe(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('RTL still reverses the expiry/CVC row, and styling does not disturb it', () => {
    const rowDirection = (renderer: Renderer) =>
      renderer.root
        .findAll((n) => n.type === View)
        .map((n) => flat(n.props.style))
        .filter((s) => s.flexDirection === 'row' || s.flexDirection === 'row-reverse')
        .map((s) => s.flexDirection);

    const ltr = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" fieldStyles={FORM_STYLES} />,
    );
    expect(rowDirection(ltr)).toContain('row');
    expect(rowDirection(ltr)).not.toContain('row-reverse');
    ReactTestRenderer.act(() => ltr.unmount());

    const rtl = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        localisation={{isRtl: true}}
        fieldStyles={FORM_STYLES}
      />,
    );
    expect(rowDirection(rtl)).toContain('row-reverse');
    /* and the merchant styles still landed */
    expect(flat(containerBy(rtl, EXPIRY_TEST_ID).props.style).borderColor).toBe('#059669');
    ReactTestRenderer.act(() => rtl.unmount());
  });

  it('gaps and container heights survive per-field styling', () => {
    const renderer = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        splitCardFields
        fieldStyles={{expiry: {container: {height: 64}}}}
      />,
    );

    /* the merchant height wins on the expiry box only */
    expect(flat(containerBy(renderer, EXPIRY_TEST_ID).props.style).height).toBe(64);
    expect(flat(containerBy(renderer, CVC_TEST_ID).props.style).height).not.toBe(64);
    /* the row gap the form owns is untouched */
    const gaps = renderer.root
      .findAll((n) => n.type === View)
      .map((n) => flat(n.props.style).gap)
      .filter((g) => g !== undefined);
    expect(gaps.length).toBeGreaterThan(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('ready-made form: error placement and error-style selection', () => {
  const errorStyles = {
    cardNumber: {error: {color: '#AA0001'}},
    expiry: {error: {color: '#BB0002'}},
    cvc: {error: {color: '#CC0003'}},
  };

  const errorColours = (renderer: Renderer) =>
    renderer.root
      .findAll((n) => String(n.type) === 'Text')
      .map((n) => flat(n.props.style).color)
      .filter((c) => c === '#AA0001' || c === '#BB0002' || c === '#CC0003');

  const invalidate = (renderer: Renderer, testID: string, text: string) => {
    const input = inputBy(renderer, testID);
    ReactTestRenderer.act(() => input.props.onChangeText(text));
    ReactTestRenderer.act(() => input.props.onBlur({nativeEvent: {}}));
  };

  it('fused layout — the ONE shared error line uses the owning field\'s error slot', () => {
    const renderer = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" fieldStyles={errorStyles} />,
    );

    invalidate(renderer, EXPIRY_TEST_ID, '13/99');
    /* exactly one error line, styled by the field that owns the message */
    expect(errorColours(renderer)).toEqual(['#BB0002']);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('fused layout — the card number outranks the others when several are invalid', () => {
    const renderer = mount(
      <HyperswitchVault.CardForm session={session} environment="sandbox" fieldStyles={errorStyles} />,
    );

    invalidate(renderer, CARD_NUMBER_TEST_ID, '4242');
    invalidate(renderer, EXPIRY_TEST_ID, '13/99');
    expect(errorColours(renderer)).toEqual(['#AA0001']);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('split layout — each field renders its own message with its own error slot', () => {
    const renderer = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        splitCardFields
        fieldStyles={errorStyles}
      />,
    );

    invalidate(renderer, CARD_NUMBER_TEST_ID, '4242');
    invalidate(renderer, EXPIRY_TEST_ID, '13/99');

    const colours = errorColours(renderer);
    expect(colours).toContain('#AA0001');
    expect(colours).toContain('#BB0002');
    expect(colours).not.toContain('#CC0003');

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('disabled and editable states are unaffected by styling', () => {
  it('disabled still reaches every TextInput while styled', () => {
    const renderer = mount(
      <HyperswitchVault.CardForm
        session={session}
        environment="sandbox"
        disabled
        fieldStyles={FORM_STYLES}
      />,
    );

    for (const id of [CARD_NUMBER_TEST_ID, EXPIRY_TEST_ID, CVC_TEST_ID]) {
      expect(inputBy(renderer, id).props.editable).toBe(false);
    }
    /* and the merchant style is still applied on a disabled field */
    expect(flat(containerBy(renderer, CVC_TEST_ID).props.style).borderColor).toBe('#DB2777');

    ReactTestRenderer.act(() => renderer.unmount());
  });
});

describe('legacy alias names have the identical styling capability', () => {
  it('the aliases are the same objects, so styles behave identically', () => {
    expect(CardNumberWidget).toBe(CardNumberField);
    expect(HyperswitchVault.CardNumber).toBe(CardNumberField);
    expect(HyperswitchVault.Expiry).toBe(CardExpiryField);
    expect(HyperswitchVault.CVC).toBe(CardCVCField);

    const viaAlias = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberWidget styles={{container: {borderColor: '#123456'}}} />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    expect(flat(containerBy(viaAlias, CARD_NUMBER_TEST_ID).props.style).borderColor).toBe('#123456');
    ReactTestRenderer.act(() => viaAlias.unmount());
  });
});

/* ══ Untyped JavaScript font sizes, and refs on every field ═════════════════════════════════ */

describe('invalid font-size values from untyped JavaScript are ignored', () => {
  const endpointsFor = (styles: unknown) => {
    const renderer = mount(withProvider(<CardNumberField styles={styles as VaultFieldStyles} />));
    const range = interpolationOutputRange(renderer);
    ReactTestRenderer.act(() => renderer.unmount());
    return range;
  };

  /*
   * Only a FINITE, STRICTLY POSITIVE number can become an animation endpoint. Everything else is
   * stripped from the forwarded style — so it can never shadow the interpolation — but is not used
   * as an endpoint either, and the library default stands.
   *
   * Zero is rejected deliberately: as an endpoint it would shrink the label to nothing at one end of
   * the float, which is a mistake far more often than an intention.
   */
  it.each([
    ['a string', '41px'],
    ['NaN', Number.NaN],
    ['positive Infinity', Number.POSITIVE_INFINITY],
    ['negative Infinity', Number.NEGATIVE_INFINITY],
    ['a negative number', -18],
    ['zero', 0],
    ['null', null],
    ['a boolean', true],
    ['an object', {value: 18}],
  ])('%s is ignored and the library defaults stand', (_label, value) => {
    expect(endpointsFor({placeholder: {fontSize: value}})).toEqual([16, 11]);
  });

  it('an invalid value never reaches the element either', () => {
    const renderer = mount(
      withProvider(
        <CardNumberField
          styles={{placeholder: {fontSize: -18, color: '#123456'}} as unknown as VaultFieldStyles}
        />,
      ),
    );

    const style = flat(animatedLabelHostStyle(renderer));
    /* the sibling property still lands... */
    expect(style.color).toBe('#123456');
    /* ...and the resolved font size is the library's, not the merchant's junk */
    expect(style.fontSize).toBe(16);
    expect(containsAnimatedNode(animatedLabelHostStyle(renderer))).toBe(false);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('a valid value alongside an invalid one on the other slot still works', () => {
    expect(endpointsFor({placeholder: {fontSize: 22}, label: {fontSize: 0}})).toEqual([22, 11]);
    expect(endpointsFor({placeholder: {fontSize: -1}, label: {fontSize: 9}})).toEqual([16, 9]);
  });
});

describe('refs and isolation hold for all three fields while styled', () => {
  it('every field ref exposes exactly focus and blur', () => {
    const numberRef = React.createRef<VaultFieldHandle>();
    const expiryRef = React.createRef<VaultFieldHandle>();
    const cvcRef = React.createRef<VaultFieldHandle>();

    const renderer = mount(
      <HyperswitchVaultFormProvider session={session} environment="sandbox">
        <CardNumberField ref={numberRef} styles={{container: {borderWidth: 2}}} />
        <CardExpiryField ref={expiryRef} styles={{container: {borderWidth: 2}}} />
        <CardCVCField ref={cvcRef} styles={{container: {borderWidth: 2}}} />
      </HyperswitchVaultFormProvider>,
    );

    for (const ref of [numberRef, expiryRef, cvcRef]) {
      expect(Object.keys(ref.current!).sort()).toEqual(['blur', 'focus']);
      expect(typeof ref.current!.focus).toBe('function');
      expect(typeof ref.current!.blur).toBe('function');
      /* no accessor of any kind for the field's value */
      expect((ref.current as Record<string, unknown>).value).toBeUndefined();
      expect((ref.current as Record<string, unknown>).getValue).toBeUndefined();
    }

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('expiry and CVC styles do not leak across providers either', () => {
    const renderer = mount(
      <View>
        <HyperswitchVaultFormProvider session={session} environment="sandbox">
          <CardNumberField />
          <CardExpiryField styles={{container: {borderColor: '#AA1111'}}} />
          <CardCVCField styles={{container: {borderColor: '#AA2222'}}} />
        </HyperswitchVaultFormProvider>
        <HyperswitchVaultFormProvider session={session} environment="sandbox">
          <CardNumberField />
          <CardExpiryField styles={{container: {borderColor: '#BB1111'}}} />
          <CardCVCField styles={{container: {borderColor: '#BB2222'}}} />
        </HyperswitchVaultFormProvider>
      </View>,
    );

    const colours = (testID: string) =>
      renderer.root
        .findAll((n) => n.type === View)
        .filter((n) => {
          const s = flat(n.props.style);
          return (
            s.borderTopWidth !== undefined &&
            n.findAll((c) => c.type === TextInput && c.props.testID === testID).length > 0
          );
        })
        .map((n) => flat(n.props.style).borderColor)
        .sort();

    expect(colours(EXPIRY_TEST_ID)).toEqual(['#AA1111', '#BB1111']);
    expect(colours(CVC_TEST_ID)).toEqual(['#AA2222', '#BB2222']);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
