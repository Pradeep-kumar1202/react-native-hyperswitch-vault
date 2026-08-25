# Phase 2A — merchant styling boundary spike

> **Historical / removed design.** This document is a decision and investigation record, not
> current merchant guidance. It describes surfaces that no longer exist.


> **Merchant-only scope reset (2026-08-25).** This package is now exclusively a merchant-facing card
> tokenization library. The `/embedded` controlled fields, the public `/vault` transport subpath and
> every client-core integration surface were removed. Passages below that describe them are
> historical: they record how the package used to be built, not what it publishes now. The current
> surface is the package root only.



**Date**: 2026-08-25
**Status**: spike complete, closure pass applied, recommendation made
**Release state**: the style API exists only in the uncommitted working build and has not been released to merchants
**Scope**: `CardNumberField` only

> **The style API exists only in the uncommitted working build and has not been released to
> merchants.** It is present in the locally packed experimental artifact — that is how it was
> proven — so "nothing is published" would be misleading. `styles` exists on the card-number field
> only, is absent from the README and the Quick Start, and is not part of any released surface.
> ADR-0002 §9 required a spike before the styling API could ship; this is that spike. Expiry, CVC,
> the ready-made form and `/embedded` are untouched.

---

## The question

ADR-0002 §9 settles the *contract* — the merchant boundary must expose React Native
`StyleProp<ViewStyle>` / `StyleProp<TextStyle>` and must never expose ReScript's opaque
`Style.t` — but deliberately leaves the *mechanism* open, with one warning:

> **A cast is not a proof.** Declaring the slot as `StyleProp<ViewStyle>` in a facade and casting it
> across the boundary would type-check while the prop silently fails to reach the underlying view.

So every claim below is backed by either the rendered React Native tree or the packed tarball.

---

## Approaches evaluated

Three were built and measured, not argued.

| | **A — genType-imported RN types** | **B — TypeScript forwarding facade** | **C — raw ReScript `Style.t`** |
|---|---|---|---|
| TypeScript public type | `StyleProp<ViewStyle>` / `StyleProp<TextStyle>`, imported from `react-native` | same, hand-written in the facade | `Style_t` from `rescript-react-native/ReactNative.gen` |
| ReScript representation | abstract type via `@genType.import`, reinterpreted with `%identity` at point of use | none — ReScript never learns about the prop | `ReactNative.Style.t` directly |
| Runtime forwarding | **all 7 slots reach their element** | **1 of 7** (`root` only); B2 variant delivers **0** | would work, but the type does not compile for a consumer |
| Ref forwarding | preserved | preserved | n/a |
| Component identity | **preserved** — `CardNumberField === CardNumberWidget` | **broken** — a wrapper is a new object | n/a |
| Generated-type compatibility | clean; `check:generated` passes | n/a (no generated change) | **fails**: `error TS2307: Cannot find module 'rescript-react-native/ReactNative.gen'` |
| Tree-shaking impact | none measured (`verify:treeshaking` still passes) | adds a module and a component | n/a |
| Bundle impact | +292 B esm / +323 B cjs root entry | wrapper + extra host View per field | n/a |
| Maintenance complexity | one prop per slot threaded through the existing chain | two parallel surfaces to keep in sync, and it still cannot reach the elements | low, but unusable |
| Failure risks | a future slot must be threaded explicitly (compile error if forgotten) | silent no-op: the prop compiles and does nothing | ships a broken `.d.ts` |

### How each crosses TypeScript → ReScript → React Native

**A.** `src/styleTypes.ts` names the two type applications (`StyleProp<ViewStyle>` cannot be
referenced by `@genType.import`, which takes a module + exported name). `CardFieldStylesSpike.res`
imports them as abstract types and declares the record; genType emits a real
`import type {VaultViewStyleProp} from './styleTypes'`. Inside ReScript the values are opaque —
readable by nothing, constructible by nothing. `Style.array([libraryStyle, merchantStyle])` appends
the merchant's value last, which is both the precedence the contract states and a shape RN flattens
natively.

The bridge contains **one localized zero-runtime coercion** from the genType-imported React Native
`StyleProp` representation to the internal style representation. Its safety depends on React Native
accepting the same runtime values, and is protected by packed-consumer type tests and runtime tests
covering objects, registered style IDs, arrays, nested arrays, `null`, `undefined` and `false`. See
[The coercion, stated honestly](#the-coercion-stated-honestly) below.

**B.** A `React.forwardRef` wrapper in `public.ts` can only pass props to the ReScript component.
ReScript's compiled component reads a fixed set of fields off its props object and ignores the rest,
so an unrecognised prop is dropped silently — measured in `probeB.test.tsx`. The wrapper can style
only the elements it renders itself, i.e. an outer `View`. Six of the seven slots are structurally
unreachable.

### Approach B — the measurements, preserved

`example/__tests__/probeB.test.tsx` built both variants of the TypeScript facade and measured them
against the same acceptance conditions Approach A had to meet. It has been **deleted** now that the
decision is recorded; these are its five results, which is the evidence it existed to produce:

| Measurement | Result |
|---|---|
| `CardNumberFieldB1 !== RawWidget` and `CardNumberFieldB2 !== RawWidget` | **identity broken** — a `forwardRef` wrapper is a new object, so the Phase 1 `===` guarantee fails |
| B1 (wrapper renders a styling `View`) with `{root, container, input}` | `root` lands (`backgroundColor: '#123456'` found on a `View`); **`container` reaches 0 elements** (`borderWidth: 99` never appears) and the `TextInput` never receives `fontSize: 99` |
| B2 (wrapper passes the prop down) with `{container, input}` | **nothing arrives at all** — the ReScript component reads a fixed set of fields off its props object and drops the rest silently |
| host `View` count, B1 vs bare | strictly greater — the wrapper adds an extra host element per field |
| ref forwarding through B1 | preserved (`focus`/`blur` both functions) — the one contract a wrapper does keep |

The decisive one is B2: an unrecognised prop compiles and does nothing. That is the exact failure
mode ADR-0002 §9 warned about, reproduced.

**C.** genType maps a bare `ReactNative.Style.t` to `Style_t` imported from
`rescript-react-native/ReactNative.gen`. That path does not exist in `node_modules` and
`rescript-react-native` is a devDependency excluded from the tarball, so the published declaration
references a module no consumer has.

---

## The coercion, stated honestly

`%identity` emits no JavaScript. It is nonetheless a **localized unsafe coercion**: a type
reinterpretation the compiler does not check. Calling the bridge "cast-free" would be wrong, and
this section replaces that claim.

### Where it lives

One place, and a build gate keeps it there.

```rescript
/* src/CardFieldStylesSpike.res — the only coercion site in the library */
module Unsafe = {
  /* WRITE: relabel a merchant StyleProp as the internal style representation */
  external viewStyleToStyle: viewStyleProp => ReactNative.Style.t = "%identity"
  external textStyleToStyle: textStyleProp => ReactNative.Style.t = "%identity"
  /* READ: only ever applied to a value StyleSheet.flatten has already reduced to a plain object */
  external flatStyleToDict: ReactNative.Style.t => Dict.t<JSON.t> = "%identity"
  external dictToTextStyleProp: Dict.t<JSON.t> => textStyleProp = "%identity"
}

let withView = (base: ReactNative.Style.t, override: option<viewStyleProp>) =>
  switch override {
  | None => base
  | Some(style) => ReactNative.Style.array([base, style->Unsafe.viewStyleToStyle])
  }

let withText = (base: ReactNative.Style.t, override: option<textStyleProp>) => /* ... */
```

Field components never see `Unsafe`. They call `withView` / `withText`, which are total functions
over `option`, so "no merchant style" is a value the type system forces them to handle rather than a
case they can forget.

### The gate

`scripts/verify-style-bridge.mjs` now opens with a source assertion over every `.res` file in
`src/`, and fails the build if any of these stop holding:

| Assertion | Why it matters |
|---|---|
| merchant-style `%identity` appears only in `CardFieldStylesSpike.res` | the safety argument has exactly one location to be true about |
| no module outside the bridge names `Unsafe.` or the raw coercion functions | a field component cannot take a shortcut around the helpers |
| the bridge declares exactly four coercions | a fifth cannot appear unreviewed |
| all four sit inside `module Unsafe` | the containment is counted, not assumed |
| the read coercion is reachable only via `splitAnimatedText`, behind `StyleSheet.flatten` | reading a key off an unflattened StyleProp would be unsound |
| the bridge routes its own write coercions through `withView` / `withText` | the merge (and therefore the precedence) cannot be bypassed internally |

### The invariant that makes it valid

1. **TypeScript controls which values can enter.** The published slot type *is* React Native's
   `StyleProp<ViewStyle>` / `StyleProp<TextStyle>`, so the only values a merchant can pass are
   values React Native itself accepts in a style prop.
2. **No runtime transformation is required** in the write direction. Both sides of the relabelling
   are the same JavaScript value; there is nothing to convert, only a type to rename. The read
   direction is different and is guarded differently: it runs only on the output of
   `StyleSheet.flatten`, which is a plain string-keyed object by construction, and every value read
   from it goes through a checked decoder rather than being assumed to have a type.
3. **React Native flattens the result.** `Style.array([base, merchant])` is a nested `StyleProp`,
   which every RN style prop accepts and flattens natively.
4. **The merchant style is appended after the library style**, which is what gives it precedence on
   conflicting keys.

Its safety therefore rests on React Native accepting the same runtime values on both sides. That is
not self-evident, so it is protected by tests rather than asserted: the packed-consumer type tests
(with non-vacuous negative controls) constrain what can enter, and the runtime tests exercise
objects, registered style IDs, arrays, nested arrays, `null`, `undefined` and `false` through the
rendered tree.

---

## Where field styles live: an ordinary prop, not shared state

Per-field styling is presentation data belonging to one rendered field. It is **not** in controller
state, form state, provider context, submission state or the registry. The path is:

```text
CardNumberWidget.styles          (props record, genType boundary)
  → BoundCardFields.Number       (~styles, plus ~errorStyle extracted for the error slot)
    → CardFields.Number          (~styles; applies `root`, forwards the rest)
      → CardInput                (~styles; applies container / input / placeholder / label / accessory)
```

`VaultCardController.res` contains **zero** references to the bridge — the controller does not know
styling exists.

### Why `VaultWidgetContext.res` changed

Its whole diff is nine lines, and none of it touches the context:

```diff
 module ErrorText = {
   @react.component
-  let make = (~message: string, ~theme: CardFormTypes.cardTheme, ~errorFontSize, ~errorSpacing) =>
+  let make = (
+    ~message: string,
+    ~theme: CardFormTypes.cardTheme,
+    ~errorFontSize,
+    ~errorSpacing,
+    /* PHASE 2A SPIKE — merchant `styles.error`. None => byte-identical prior behaviour. */
+    ~errorStyle: option<CardFieldStylesSpike.textStyleProp>=?,
+  ) =>
     <Text
       style={Style.s({
         color: theme.dangerColor,
         fontFamily: theme.fontFamily,
         fontSize: errorFontSize,
         marginTop: errorSpacing->Style.dp,
-      })}>
+      })->CardFieldStylesSpike.withText(errorStyle)}>
       {React.string(message)}
     </Text>
 }
```

`ErrorText` is a **presentational component that happens to live in this file** because the error
message is rendered from the shared registration helper. The change adds one optional *prop* to that
component. The `contextValue` record is untouched:

```rescript
type contextValue = {
  controller, theme, labels, errorFontSize, errorSpacing,
  brandIconMode, accessible, editable, isProcessing, onAnalytics,
}   /* no style field, before or after */
```

So nothing is stored or broadcast. `errorStyle` is read out of the merchant's `styles` record at the
field (`BoundCardFields.Number`) and handed down as an argument, on the same path as every other
field style. Theme and localisation continue to come from context, unchanged.

### Proven, not asserted

Four tests in `example/__tests__/cardNumberStylesSpike.test.tsx` mount two providers in one tree:

- two fields with different sentinels keep them entirely separate (each container has its own
  border width/colour and not the other's; both input font sizes are present exactly once);
- an unstyled field beside a styled one is **byte-identical to the two-unstyled baseline** — the
  proof that nothing is broadcast provider-wide;
- driving only one field into a validation error produces exactly one styled error message
  (`['#AA0002']`, never `#BB0002`);
- two differently-styled card-number fields inside **one** provider still return `not_ready` with no
  network request — duplicate-field protection is unweakened.

---

## Cost to hyperswitch-client-core

`/embedded` and `/vault` do not grow, but the shared Rollup chunk they import does
(esm 42,943 → 45,358 B), and `CardInput` calls the merge helpers unconditionally. So the honest
question is not whether the facade grew but whether the consumer's bundler drops the code. It does
not. Measured, not argued:

Both variants were packed and installed into `hyperswitch-client-core`'s `node_modules` — no source,
`package.json` or `yarn.lock` change; both hashes verified unchanged afterwards, and the original
install was restored.

| | pre-spike | + style bridge | + typography defence | delta |
|---|---|---|---|---|
| `re:check` (ReScript clean + strict build) | exit 0 | exit 0 | exit 0 | — |
| `verify-vault-flows.mjs` | 21/21 | 21/21 | 21/21 | — |
| `build:web` (webpack production) | exit 0 | exit 0 | exit 0 | — |
| main `index.bundle.js` | 5,217,352 B | 5,220,057 B | 5,220,991 B | **+3,639 B** |
| all emitted JS | 7,454,803 B | 7,457,508 B | 7,458,442 B | **+3,639 B** |
| all emitted JS, gzip −9 | 2,007,772 B | 2,008,076 B | 2,007,871 B | **+99 B** |
| lazy chunks (127 files) | — | — | — | **byte-identical** |

The gzipped figure went *down* when the typography defence was added, because the extra code
compresses well and the Rollup chunk graph rebalanced (see below). **+99 bytes gzipped** is the
whole cost of the styling feature to client-core.

A structural diff of the two 5.2 MB bundles isolates the entire delta to nine regions, seven of them
webpack module-id / chunk-hash churn. The two real ones are:

- **the bridge, retained in full** — `withView`, `withText`, `rootOf`, `containerOf`, `inputOf`,
  `placeholderOf`, `labelOf`, `errorOf`, `accessoryOf` all appear in the emitted bundle;
- **the threading in `CardInput` and `CardFields$Number`** — `styles: styles`, the `rootOf(styles)`
  wrapper style, and the `accessoryOf` branch.

**The optional style-merging code does NOT disappear after tree-shaking, and it cannot.** `CardInput`
calls `containerOf(styles)` and `withView(...)` unconditionally; the value is `undefined` for
client-core, but the call sites are reachable, so no bundler may remove them. Tree-shaking removes
*unreferenced* code, not *inert* code.

Client-core imports only `/embedded` and `/vault` — never the root entry — and its card UI still
renders through the same `/embedded` API: `verify-vault-flows` confirms `CardElement` composes
`CardNumberField`, `CardExpiryField` and `CardCvcField` directly, still performs its five
react-final-form registrations, and still carries both `__card_cvc_unbound` and
`__card_network_unbound` sentinels.

### A Rollup chunk rearrangement, noted

Adding the `StyleSheet.flatten` binding gave `CardFieldStylesSpike` its first import, which moved a
module-group boundary. Rollup responded by folding the 13,604 B chunk that `/vault` and the root
entry shared into `vault.js` itself:

| | before | after |
|---|---|---|
| `dist/esm/vault.js` | 138 B (re-export facade) + a 13,604 B shared chunk | 12,862 B, self-contained |
| root entry total load | 119,265 B | 120,271 B |
| `dist/esm/embedded.js` | 10,430 B | 10,430 B, **identical once chunk hashes are normalised** |

Checked rather than assumed: the transport appears **exactly once** across the whole `dist/esm`
output before and after, so nothing is duplicated; `/embedded` still contains **zero** vault
transport; `/vault` still exports only `confirmPaymentMethodSession`; and the root entry now imports
the transport from `./vault.js` instead of a shared chunk. A `/vault`-only consumer is 880 B
*smaller* than before.

### The tradeoff

The cost is real but small: **+99 bytes gzipped on a 2 MB bundle**, and zero behaviour change. Against that, keeping the bridge root-entry-only would mean either a second `CardInput` /
`CardFields` implementation for `/embedded` — duplicating the formatting, validation, brand
detection and field markup that `verify-vault-flows` exists to protect — or a build-time variant of
the same modules, which doubles what has to be tested for every future field change.

**Recommendation: accept the cost.** Do not split the field implementations for 305 bytes. Revisit
only if the styling API later needs code that is genuinely heavy (a theme resolver, a style
normaliser, per-state recomputation), at which point the thing to make root-entry-specific is *that*
code, not the field components.

---

## Placeholder and label typography

`placeholder` and `label` style the same `Animated.Text`, whose **`fontSize` is the element's only
animated key** — an interpolation from `(fontSize + placeholderTextSizeAdjust) * fontScale` (resting)
to `fontSize + placeholderTextSizeAdjust - 5` (floating). Merchant style is appended last, so a
static merchant `fontSize` shadows it.

### What that does (measured, RN 0.79.7)

`AnimatedStyle.from()` flattens the style prop and collects the `AnimatedNode`s it finds. Shadow the
only animated key with a static number and `nodes.length === 0`, so it returns `null` and
`AnimatedProps` hands the **raw, unflattened** style array to the host component:

| merchant style | host `<Text>` style prop |
|---|---|
| none | `{color, fontFamily, fontSize: 16, fontWeight}` — resolved |
| `{color, letterSpacing}` | resolved, animation intact |
| `{fontSize: 41}` | `[[{…, fontSize: <AnimatedInterpolation>}], {fontSize: 41}]` — **an AnimatedInterpolation reaches the host** |

So it is not merely "merchant typography wins": it silently kills the size half of the animation and
leaks an unresolved Animated node into the host style tree.

### A type cannot fix this. Measured, not assumed.

Both candidate types were compiled against real React Native types. Each row is one route by which
`fontSize` can reach the slot.

| route | `StyleProp<Omit<TextStyle,'fontSize'>>` | `StyleProp<Omit<TextStyle,'fontSize'> & {readonly fontSize?: never}>` |
|---|---|---|
| inline object literal `{fontSize: 41}` | **rejected** | **rejected** |
| variable annotated `TextStyle` **with** `fontSize` | *compiles* | **rejected** |
| `StyleSheet.create({…}).x` containing `fontSize` | *compiles* | **rejected** |
| array containing a wider `TextStyle` | *compiles* | **rejected** |
| nested array containing one | *compiles* | **rejected** |
| `as unknown as` assertion | *compiles* | *compiles* |
| JavaScript consumer (no types at all) | *compiles* | *compiles* |
| **variable annotated `TextStyle` WITHOUT `fontSize`** | compiles ✓ | **rejected — false positive** |
| registered style without `fontSize` | compiles ✓ | compiles ✓ |
| inline literal without `fontSize` | compiles ✓ | compiles ✓ |

Two findings decide the design:

1. **Plain `Omit` blocks only the inline literal.** It relies on the excess-property check, which
   applies to object literals and nothing else. Every other route is a plain assignability check
   against a type whose `fontSize` key simply does not exist, and TypeScript allows extra properties
   there. This confirms the concern exactly.
2. **The strict variant blocks all the *typed* routes but breaks a legitimate one.** Because
   `TextStyle['fontSize']` is `number | undefined`, a merchant's `const s: TextStyle = {color: 'red'}`
   — no `fontSize` anywhere — is rejected, since `number | undefined` is not assignable to
   `undefined`. That is a false positive on the most ordinary way to write a shared style.

And neither type stops a type assertion or a JavaScript consumer. **The protection has to be at
runtime**, and once it is, narrowing the type buys nothing but false positives.

### Decision — Choice B, with a runtime defence

`fontSize` **stays inside the style objects**, and the library extracts it as the animation endpoint
for that state, forwarding the rest of the style with `fontSize` removed.

```ts
styles={{
  placeholder: {fontSize: 18, color: '#64748B'},  // resting endpoint + colour
  label:       {fontSize: 12, color: '#0F172A'},  // floating endpoint + colour
}}
```

| | **Choice A — semantic per-field endpoints** | **Choice B — extracted from the style** |
|---|---|---|
| Merchant familiarity | low: font size is a style property everywhere else in React Native; splitting it out is a library-specific idiom to learn | **high: exactly what a merchant already writes** |
| Complete per-field control | yes | yes — the values live on the field's own `styles` |
| Runtime safety | **still needs the same runtime strip** for assertions and JS consumers, so it pays B's cost *and* adds an API | complete: the value is consumed, so it can never shadow |
| Registered-style support | registered styles containing `fontSize` are rejected at compile time; the merchant must split the sheet | `StyleSheet.flatten` resolves registered IDs, arrays, nested arrays and falsy entries before the read |
| Implementation complexity | narrowed type **+** two extra props **+** the runtime strip | one extract-and-strip helper in the bridge; **no type change at all** |
| Rendering cost | one flatten per animated slot, memoised | identical |
| Preserves the default animation | yes | yes — and a merchant who sets one endpoint still gets an animation to the other |

Choice A was rejected because it is strictly more surface for strictly less benefit: it cannot avoid
the runtime work, it introduces the `TextStyle`-variable false positive, and it makes `placeholder`
and `label` the only slots that do not take a plain React Native text style.

The honest cost of Choice B: `fontSize` in these two slots is *not* an ordinary style property — it
is an animation endpoint. That is a real piece of behaviour a merchant must be told about, and it
must be documented at the slot rather than in a changelog. Everything else in the slot behaves
exactly like a normal style.

### The runtime implementation

```rescript
/* src/CardFieldStylesSpike.res */
@module("react-native") @scope("StyleSheet")
external flattenStyleProp: ReactNative.Style.t => Nullable.t<ReactNative.Style.t> = "flatten"

type animatedTextSlot = {fontSize: option<float>, rest: option<textStyleProp>}

let splitAnimatedText = (slot: option<textStyleProp>): animatedTextSlot => /* … */
```

- **React Native's own flattener** does the hard part: registered IDs, arrays, nested arrays,
  `null`, `undefined` and `false` all collapse to one plain object (or to nothing).
- The read is decoded, not assumed: `JSON.Decode.float` means a non-numeric `fontSize` from an
  untyped consumer is **stripped but not used as an endpoint** — it cannot be interpolated, and
  leaving it in would break the animation.
- `fontSize` is removed from what is forwarded, so there is nothing left to shadow the interpolation.
- `CardInput` memoises the split on the raw slot value, so a stable merchant style object does not
  re-flatten on every render.
- The merchant's number is taken literally — it is **not** multiplied by `theme.fontScale`, because
  an explicit size means that size.

This adds a **read-direction** coercion to the bridge (`flatStyleToDict`, plus `dictToTextStyleProp`
to rebuild). Both live inside the same `Unsafe` submodule, the read one is reachable only *after*
`StyleSheet.flatten` has produced a plain object, and the containment gate was updated from two
coercions to four with an added assertion that all four sit inside `Unsafe`.

### Evidence

Ten tests in `example/__tests__/cardNumberStylesSpike.test.tsx` read the interpolation's **configured
output range**, which proves what the animation will do across its whole range rather than sampling
one frame:

| proof | result |
|---|---|
| no merchant style → default animation unchanged | `outputRange === [16, 11]` |
| resting endpoint from `placeholder.fontSize` | `[41, 11]` |
| floating endpoint from `label.fontSize` | `[16, 7]` |
| both, and the interpolation is still live | `[22, 9]`, AnimatedInterpolation present on the input style, absent on the host |
| the rest of the same style still lands | `color` + `letterSpacing` applied, `[33, 11]` |
| registered style / array / nested array with `null`, `undefined`, `false` | `[28, 8]`, `[35, 11]`, `[28, 11]` |
| `null` / `undefined` / `{}` / `false` / `[]` slot | clean no-op, `[16, 11]` |
| **JavaScript consumer** (`as unknown as`, bypassing TypeScript entirely) | `[41, 5]`, **no AnimatedNode on the host** |
| non-numeric `fontSize: '41px'` | stripped, never an endpoint, defaults survive |
| exhaustive walk of the Animated.Text input style | **zero** plain-number `fontSize` anywhere |

---

## Runtime proof

`example/__tests__/cardNumberStylesSpike.test.tsx`, run against the published package under the real
React Native jest preset. Every slot is given a unique sentinel the library's defaults could never
produce, and the assertion reads the flattened style off the intended element.

| Slot | Element it must reach | Proven with |
|---|---|---|
| `root` | outermost wrapper `View` (contains input **and** error) | background + padding, and it contains the bordered container |
| `container` | the bordered box `View` | border width, colour, radius, height |
| `input` | the `TextInput` | font size, colour, family, padding-left, text-align |
| `placeholder` | the label `Animated.Text`, while empty and unfocused | colour + letter-spacing, and absent once focused |
| `label` | the same element, once focused or filled | colour + font-weight, and absent while resting |
| `error` | the validation message `Text` | colour + font size, after typing an invalid PAN and blurring |
| `accessory` | the brand-icon `Pressable` | background + width |

Also proven at runtime:

- **precedence** — a merchant value overrides the library default on a conflicting key, while keys
  the merchant did not set keep their library value;
- **no-op when absent** — omitting `styles`, passing `undefined`, and passing `{}` each render a
  tree byte-identical to the pre-spike tree;
- **every `StyleProp` form** — plain object, `StyleSheet.create` id, array, nested array with
  `null`/`undefined`/`false`.

---

## Published-declaration proof

`scripts/verify-style-bridge.mjs` packs the library, extracts the tarball into a fixture holding
only react + react-native + typescript, and compiles a consumer under the stock React Native
tsconfig. It asserts:

- the packed `styleTypes.d.ts` names `StyleProp<ViewStyle>` / `StyleProp<TextStyle>` and imports
  from `react-native`;
- the styling declarations contain **no** `abstract class` (genType's opaque handle), **no** `any`,
  **no** `unknown`, **no** broad index signature, and no reference to `rescript-react-native`;
- a real merchant style compiles, and eight wrong values are rejected;
- the harness is not vacuous — deleting one `@ts-expect-error` makes `tsc` fail.

That last check matters: without it, a slot typed `any` would pass every other assertion.

---

## Safety boundary

Unchanged by the spike, and re-asserted with the styles prop applied:

- the field still rejects `value`, `defaultValue`, `onChange`, `onChangeText`, `secureTextEntry`,
  `maxLength`, `keyboardType`, `autoCorrect`, `textContentType`, `autoComplete`;
- there is no `...rest` spread onto `TextInput` — a runtime test spreads those exact props at the
  field and confirms the `TextInput` still shows `value=""`, `maxLength=23`, `secureTextEntry=false`,
  `keyboardType="number-pad"`, `autoComplete="off"`, `textContentType="oneTimeCode"`,
  `autoCorrect=false`;
- the ref still exposes exactly `focus()` / `blur()`, both still reach the input, and there is no
  value accessor;
- styles are write-only presentation: no slot is readable back, and nothing in the path touches a
  card value.

---

## Recommendation

**Adopt Approach A.** It is the only one that delivers all seven slots, and the only one that
publishes a declaration a merchant can compile. B fails the identity rule Phase 1 established and
cannot reach six of seven elements; C cannot be published at all.

The cost is that each slot must be threaded explicitly through the render chain. That is a feature
rather than a tax: a slot that is declared but not wired produces an unused-variable compile error
in ReScript, whereas B's failure mode is a prop that compiles and silently does nothing.

---

## Before this ships

1. **A device pass on Android and iOS is required.** Everything here is `react-test-renderer` plus
   Metro bundling; no pixel has been rendered. `docs/manual-device-checklist.md` must gain a styling
   section covering at minimum: the floating-label animation with merchant endpoints (including
   an inverted pair where the floating size is larger than the resting one), RTL, a `container`
   height that fights `appearance.inputHeight`, and a merchant font family missing on one platform.
2. Decide whether form-level appearance should supply *defaults* for the two endpoints that a
   field's own `placeholder` / `label` then overrides. Choice B gives per-field control; it does not
   yet give a form-wide default.
3. Extend to expiry and CVC, and decide the ready-made form's story (per-field styles under a fused
   layout).
4. Decide `helperText` — the slot is in the contract but no helper-text element exists to style, so
   it is deliberately absent here.
5. Decide whether `placeholder` / `label` should remain one element. Option C removes the typography
   collision but not the underlying question.
6. Re-run `verify:treeshaking` and the client-core measurement once the other fields are wired; the
   +99 B gzipped figure is for one styled field.

---

## Closure-pass changes

| Item | Outcome |
|---|---|
| `%identity` described accurately | "no cast anywhere in the publishing path" removed; replaced with the localized-coercion wording and the invariant, above |
| coercion contained | moved into `module Unsafe` inside the bridge; gated by five source assertions in `verify-style-bridge.mjs` |
| `VaultWidgetContext` audited | changed only for the presentational `ErrorText` sub-module; `contextValue` untouched; four cross-provider isolation tests added |
| client-core measured | +2,705 B raw / +305 B gzipped; bridge confirmed retained after tree-shaking; cost accepted rather than optimised away |
| placeholder/label decided | **Choice B, implemented** — `fontSize` stays in the style and is extracted as the animation endpoint at runtime; both candidate types were compiled and rejected on measured evidence |
| probe cleaned up | `probeB.test.tsx` deleted, its five measurements preserved above |
| publication wording | "nothing published" replaced with the release-state sentence |
