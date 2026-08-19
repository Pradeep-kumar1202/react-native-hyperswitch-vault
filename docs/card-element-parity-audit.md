# CardElement ⇄ HyperswitchVaultForm parity audit

> **Audit only. No source was changed.** Claims are anchored to current source in
> `hyperswitch-client-core` and this library. Tags: **[code]** read from current source,
> **[run]** measured by a command against this tree, **[assumption]** stated inference.
>
> *Revision 2 — corrects the icon recommendation, the brand-animation classification, the
> scan-card data-flow claim, the co-badge recommendation, the feature count and the
> three-versus-four fields wording.*

---

## 1. Executive summary

Both forms render the **same source**: `src/CardFormView.res` and `src/CardInput.res`. Precisely:

- **shared source** — field UI logic, card-number formatting, brand detection, focus and backspace
  transitions, floating labels, error-priority chain, expiry handling, CVC masking and test IDs;
- **shared algorithms** — both reuse the same pinned `hyperswitch-sdk-utils` functions (`cardValid`,
  `checkCardExpiry`, `checkCardCVC`, `formatCardNumber`, `getAllMatchedCardSchemes`);
- **different validator construction and messages** — client-core builds validators with
  `Validation.createFieldValidator`; standalone uses card-only validators that call the same
  sdk-utils functions but assemble their own messages from `LocaleDataType.defaultLocale` **[code]**;
- **intentionally different compiled artifacts** — the root and `/embedded` entries are produced by
  two separate Rollup configurations, so their emitted JavaScript is not the same file and is not
  meant to be **[code]**.

They are therefore **not byte-identical**, and this document does not claim they are.

Every merchant-visible difference comes from one place: **what the host passes into `CardFormView`.**

| Prop | `CardElement.res` (client-core) | `HyperswitchVaultForm.res` (standalone) |
|---|---|---|
| `renderIcon` | `<Icon name … />` | **`React.null`** |
| `renderSchemeAccessory` | `<CardSchemeComponent …>` | not passed |
| `scanCard` | passed | not passed |
| `labels` | locale + merchant overrides | **hardcoded English** |
| `layout.showCvcIcon` | from config | hardcoded `false` |
| `accessible` | forwarded | not forwarded |
| `eligibilityStatus` | live | `#allowed` |
| `onAnalytics` | `LoggerHook` FOCUS/BLUR | no-op |
| `editable` | not passed (default `true`) | `!isSubmitting && !disabled` |

**32 numbered features, shown as 34 rows because two are split into logic and presentation:**

| Class | Count | Meaning |
|---|---|---|
| A — shared source, same behaviour | 14 (plus brand *detection* in #7) | nothing to do |
| B — supported, standalone not wiring it | 5 | wiring only |
| C — portable, requires design | 2 | localisation, brand transition |
| D — needs built-in assets or new surface | 2 (plus icons in #7) | brand and unknown-card icons |
| E — native, parked | 3 | scan-card |
| F — intentionally client-core-only | 5 | eligibility, dynamic fields, logger, scan telemetry |
| G — preserved defect divergence | 1 | processing-time editability |
| parked pending contract | 1 | co-badge selection |

The largest visible gap is **card-brand icons**, and the earlier revision's answer — "expose a
`renderIcon` prop" — was wrong as a parity answer: an optional merchant callback gives **no default
parity**, because a merchant who passes nothing still sees nothing. This revision recommends
**built-in, dependency-free PNG icons** rendered through React Native `Image`. Measured cost:
**≈ 22.4 KiB for ten assets at three densities [run]** — no `react-native-svg`, no native setup, no
merchant prop. Note that only **8 of the 13 detectable schemes** have artwork today, so an explicit
`waitcard` fallback is mandatory rather than optional (§4.2).

Recommended now: **Phase A1** — text, accessibility and appearance items that need no assets and no
approvals (**≈ 3 files, < 1 KiB**). **Phase A2** — the built-in icon set — follows once artwork and
trademark sign-off land (**≈ 22.4 KiB measured [run]**). Scan-card stays **parked**; co-badge
selection stays **parked pending a proven backend effect**.

---

## 2. Definition of parity

Parity = matching **merchant-visible** behaviour where applicable. It does **not** mean importing
client-core contexts, forking `CardElement`, or reproducing client-core product concepts
(eligibility, superposition dynamic fields).

Constraints honoured: one `CardFormView`; no `CardElement` fork; no host contexts in the library;
**no change to embedded behaviour**; defects D1–D15 preserved; validation stays in sdk-utils; no
PAN/expiry/CVC through merchant callbacks; scan-card never mandatory; the existing four-step minimal
integration preserved.

### 2.1 Field-count wording

Both forms render **three visible inputs** — card number, expiry, CVC. Behind them:

| | react-final-form fields |
|---|---|
| standalone `fieldSpecs` | **4** — `CardNumber`, `CardExpiryMonth`, `CardExpiryYear`, `Cvc` **[code]** |
| client-core | config-driven; may additionally include `CardNetwork`, giving 5 |

Expiry is one visible input over two form fields plus a local `expireDate` string. Where this
document says "three fields" it means visible inputs; "four fields" means the standalone form's
react-final-form field set.

---

## 3. Complete feature matrix

### 3.1 Classification summary — 35 rows

| # | Feature | Class | Embedded | Standalone | Effort |
|---|---|---|---|---|---|
| 1 | Stacked & split layouts | A | `layout.splitCardFields` | same, via `splitCardFields` prop | — |
| 2 | Card-number formatting | A | `Validation.formatCardNumber` | same source | — |
| 3 | Scheme/brand detection | A | `getAllMatchedCardSchemes` | same source | — |
| 4 | Brand icon selection | **D** | `CardSchemeComponent` + `Icon` | **nothing renders** | M |
| 5 | Brand icon transition | **C** *(was F)* | `Standard` = none; `Animated` = fade+scale sequence | none (matches `Standard`) | S — folded into icons |
| 6 | Unknown-card icon (`waitcard`) | **D** | `fallbackIcon="waitcard"` | absent | S (with 4) |
| 7 | Visa / MC / AmEx / Discover / JCB / Diners | A detection, **D** icons | detected and drawn | detected, not drawn | M |
| 8 | Cartes Bancaires / co-badge selection | **parked** | Tooltip dropdown | absent | — |
| 9 | Auto-focus card → expiry → CVC | A | `CardFormView` | same source | — |
| 10 | Backspace focus transitions | A | `CardFormView` | same source | — |
| 11 | Floating labels | A | `CardInput` | same source | — |
| 12 | Focus / blur borders | A | `CardInput` | same source | — |
| 13 | Error priority chain | A | `CardFormView` | same source | — |
| 13b | Error presentation | **B** | `<ErrorText/>` | inline `<Text>` | S |
| 14 | Card-number active-state asymmetry | A | `CardFormView` | same source | — |
| 15 | Expiry formatting + local state | A | `CardFormView` | same source | — |
| 16 | Dynamic CVC length by scheme | A | `checkCardCVC` | same source | — |
| 17 | CVC masking | A | `secureTextEntry` | same source | — |
| 17b | CVC hint icon | **B** | `showCvcIcon` from config | hardcoded `false` + null `renderIcon` | S (with 4) |
| 18 | Loading / disabled | B | `LoadingContext` → opacity | `isSubmitting \|\| disabled` | — |
| 19 | Processing-time editability | **G** | editable (defect D10) | non-interactive | **accepted difference** |
| 20 | Scan icon + divider | E | `CardScanTrigger` | absent | parked |
| 21 | Scan availability detection | E | `ScanCardModule` | absent | parked |
| 22 | Native scan launch | E | native module | absent | parked |
| 23 | Scanned-result → fields | A | `CardFormView.onScanned` | already implemented | — |
| 24 | Scan failure / cancellation | F | host alert | absent | — |
| 25 | Scan analytics | F | host logger | absent | — |
| 26 | Theme / appearance | **B** | full `cardTheme` | 10 of 17 tokens | S |
| 27a | Label customisation | **C** | locale + merchant overrides | hardcoded English | S–M |
| 27b | Validation-message customisation | **C** | locale record | `LocaleDataType.defaultLocale`, fixed | M |
| 28 | Accessibility props | **B** | `accessible` forwarded | not forwarded | S |
| 29 | Test IDs | A | `CardTestIds` | same source | — |
| 30 | Eligibility | F | live check | `#allowed` | — |
| 31 | Field configuration / dynamic fields | F | superposition config | fixed field set | — |
| 32 | Analytics & logging | **F** *(was B/F)* | `LoggerHook` | no-op | **not recommended** |

The 14 class-A rows (plus brand *detection* in #7) share the same source file and symbol, produce the
same behaviour, and have no visible difference, no responsible dependency, no action, no effort, no
bundle effect and no risk.

### 3.2 Detailed rows

**#4 / #6 / #7 — Brand icons and unknown-card icon · class D**

| | |
|---|---|
| client-core | `CardSchemeComponent.res:make` → `src/icons/Icon.res:make` |
| library | `CardFormView.res:CardAccessory`; standalone passes neither `renderSchemeAccessory` nor a real `renderIcon` |
| embedded | brand icon inside the card-number field; `waitcard` when no brand; `fallbackIcon` on load failure |
| standalone | nothing drawn **[code]** |
| dependency responsible | `Icon.res` renders via `ReactNativeSvg.SvgUri` — **`react-native-svg` is a native module** (`android/`, `apple/`, `codegenConfig`) — and resolves remote icons from `assetUrl`, a client-core context **[code]** |
| recommended action | **ship built-in PNG assets rendered through React Native `Image`** (§4). No `react-native-svg`, no native setup, no merchant prop. Advanced icon override offered separately |
| complexity | **M** |
| bundle-size effect | **≈ 22.4 KiB** for ten assets at three densities **[run]**; see §4.3 |
| behavioural risk | low — additive; embedded untouched |

**#5 — Brand icon transition · class C, portable-requiring-design (reclassified)**

The previous revision called this permanently client-core-only. That was wrong: the *configuration
source* is host-specific, the *animation* is not.

| | |
|---|---|
| client-core | `CardSchemeComponent.res` — `AnimatedValue` fade, `interpolate` scale `0.8 → 1.0`, a 2 s delay sequence, animated chevron width **[code]** |
| host-specific part | only the `cardBrandIcon: Hidden \| Animated \| Standard \| HideGeneric` enum from `LayoutTypes.res` **[code]** |
| portable part | everything else. The library already has `CardAnimatedValue.useAnimatedValue`, behaviourally identical to client-core's `AnimatedValue`, and `Animated.timing` / `sequence` / `delay` / `interpolate` / `stop` are plain React Native primitives reachable through `rescript-react-native` **[code]** |

**What client-core's *normal* behaviour actually is.** In `Standard` mode the component shows the
detected brand, falls back to `waitcard`, and runs **no fade sequence** — the delay/fade cycle runs
only when the mode is `Animated`, where it cycles a placeholder while no brand is detected **[code]**.

**Proposal — match `Standard` exactly, and add nothing.**

The standalone default is client-core's `Standard` behaviour, precisely:

| Condition | Behaviour |
|---|---|
| scheme detected and artwork packaged | show that icon |
| scheme detected, artwork missing | show `waitcard` (§4.2 fallback) |
| no scheme detected | show `waitcard` |
| any transition | **none — no fade, no scale, no sequence** |

**No new default cross-fade is introduced.** The earlier revision proposed one; that would have been
a behaviour the client-core default does not have. If `Animated` mode is ever added it must
**reproduce the existing sequence exactly**: 2 s delay → fade out → swap the placeholder → fade in,
with the scale interpolation `0.8 → 1.0` driven by the same fade value **[code]**.

**Terminology correction:** the current source contains **no rotation**. The only transform is
`transform: [scale(...)]` at `CardSchemeComponent.res:201`, driven by an interpolation of the fade
value **[code]**. Calling this "rotation" — as the original feature list did — does not match the
code, and this document does not.

Because the default is static, this row costs **no animation work at all** in Phase A2; it is
satisfied by the icon renderer plus the fallback rule. Complexity therefore drops from M to **S**,
folded into the icon work. Any future `Animated` mode is separate and out of scope.

**#13b — Error presentation · class B**

client-core `ErrorText.res` vs standalone's inline `<Text style={{color: dangerColor, marginTop: 4}}>`
**[code]**. Error *logic and priority* are shared source. **Match client-core's default presentation
internally** rather than asking merchants for a `renderError`. **S**, 1 file, ~0 KiB, low risk.

**#17b — CVC hint icon · class B** — `showCvcIcon` is hardcoded `false` and `renderIcon` returns null,
so flipping the flag alone draws nothing **[code]**. Ships with #4. **S**.

**#18 / #19 — Loading, disabled, processing-time editability · class B / G**

Embedded preserves defect **D10** (editable while processing, 0.5 opacity only). Standalone
deliberately diverges. **Accepted difference — do not align either way** without separate approval.

**#26 — Theme / appearance · class B** — `appearance` exposes 10 tokens; `cardTheme` has 17. Fixed:
`gap` (12), `fontScale` (1), `placeholderTextSizeAdjust` (0), `bgStyle`, `shadowStyle` **[code]**.
Add the missing ones as optional. **S**, 1 file.

**#27 — Labels vs complete localisation · class C — two separate pieces**

These are not the same job, and the earlier revision conflated them.

| Piece | What it covers | Where it lives now | Effort |
|---|---|---|---|
| **(a) Label customisation** | the six placeholder/floating-label strings plus `isRtl` | `cardLabels` is already a `CardFormView` prop; standalone passes a hardcoded record **[code]** | **S–M** |
| **(b) Validation-message customisation** | `cardNumberEmptyText`, `inValidCardErrorText`, `cardExpiryDateEmptyText`, `inValidExpiryErrorText`, `cvcNumberEmptyText`, `inValidCVCErrorText` | read from `LocaleDataType.defaultLocale` inside `HyperswitchVaultForm.res` **[code]** | **M** |

> **(a) alone is not localisation.** A merchant who translates the labels but still sees
> *"Please enter valid card number"* in English has a half-translated form. **Do not claim
> localisation until (b) ships.**

Two routes for (b), to be chosen at implementation time:

1. **A typed `CardValidationMessages` contract** — an optional record of the six strings, defaulting
   to today's values. Self-contained, no sdk-utils change, ships with Phase A1. Cost: the standalone
   form keeps its own message mapping, which is the debt already recorded in
   `docs/followup-sdk-utils-card-validation.md`.
2. **Complete the sdk-utils card-only validator entry point** — `createCardFieldValidator` taking a
   locale record, so message mapping has one long-term home shared with client-core. Larger, spans
   repositories and needs a submodule bump, but removes the duplication.

**Recommendation: ship (1) in Phase A1 to unblock non-English merchants, and treat (2) as the
follow-up that retires the duplicated mapping.** Both are compatible: (1)'s record is the same shape
(2) would eventually be fed.

**#28 — Accessibility · class B** — `CardFormView` accepts `~accessible`; client-core forwards it;
standalone does not **[code]**. **S**, 1 file.

**#32 — Analytics · class F (reclassified)** — the embedded mapping exists to feed client-core's
`LoggerHook` taxonomy. There is **no concrete standalone merchant requirement**, so adding a public
`onAnalytics` would be public API growth for its own sake. **Not recommended.**

---

## 4. Default icon implementation (dependency-free)

### 4.1 Why not a merchant callback

An optional `renderIcon` gives **zero default parity**: a merchant who passes nothing still sees an
empty field. Parity means it works out of the box.

### 4.2 Detectable schemes and artwork coverage

`Validation.getAllMatchedCardSchemes` returns `item.issuer` from the `cardPatterns` table. That table
declares **13 issuers**, and those exact strings — with that exact casing — are everything the
detector can ever return **[code]**:

| # | Scheme returned by the detector | Artwork in `shared-code/assets/v2/icons` | Phase A2 |
|---|---|---|---|
| 1 | `Visa` | `visa.svg` | ship |
| 2 | `Mastercard` | `mastercard.svg` | ship |
| 3 | `AmericanExpress` | `americanexpress.svg` | ship |
| 4 | `DinersClub` | `dinersclub.svg` | ship |
| 5 | `Discover` | `discover.svg` | ship |
| 6 | `JCB` | `jcb.svg` | ship |
| 7 | `CartesBancaires` | `cartesbancaires.svg` | ship |
| 8 | `Interac` | `interac.svg` | ship |
| 9 | `RuPay` | **missing** | **fallback** |
| 10 | `UnionPay` | **missing** | **fallback** |
| 11 | `Maestro` | **missing** | **fallback** |
| 12 | `BAJAJ` | **missing** | **fallback** |
| 13 | `SODEXO` | **missing** | **fallback** |
| — | no pattern matched (empty string) | `waitcard.svg` | ship |

**Eight of thirteen detectable schemes have artwork. Five do not.** Shipping only the common seven
or eight and calling it parity would be wrong: a RuPay, UnionPay, Maestro, BAJAJ or SODEXO card is
detected correctly and would render nothing.

**Explicit fallback rule (required, not optional):**

> Resolve the icon by lower-cased scheme name. If no packaged asset exists for a detected scheme,
> render **`waitcard`** — the same placeholder used when no scheme is detected. The field is never
> empty for any input.

This mirrors client-core, which passes `fallbackIcon="waitcard"` to `Icon` for exactly this reason
**[code]**. Note that client-core lower-cases the name before lookup **[code]**; a standalone
implementation must do the same, since the detector returns mixed casing such as `AmericanExpress`
and `CartesBancaires`.

Closing the five gaps requires **new artwork**, which is a design and trademark task, not an
engineering one. Until then the fallback keeps behaviour correct and honest.

**Trademark note.** Card-network marks are trademarks with per-network usage guidelines. Reusing the
organisation's existing approved artwork is the lowest-risk path, but **licensing sign-off is a
prerequisite, not an engineering decision.**

### 4.3 Measured size

Rasterised from the real SVGs at three densities for a 30 pt icon — 8 brand marks, `waitcard` and
`cvv` (10 assets) **[run]**:

| Density | Files | Total |
|---|---|---|
| @1x (30 px) | 10 | 3,884 B |
| @2x (60 px) | 10 | 7,117 B |
| @3x (90 px) | 10 | 11,977 B |
| **All three** | **30** | **22,978 B (22.4 KiB)** |

`cvv` is not in `shared-code`; it was extracted from client-core's inline `Icon.res` definition
(1,723 B of SVG) for this measurement **[run]**. **`camera` is excluded** — it belongs to scan-card,
which is parked.

Five schemes still need new artwork (§4.2); adding them would grow the set proportionally,
roughly **+14 KiB [assumption]** at the same average per-asset cost.

> Measurement caveat: produced with `qlmanage` rasterisation as a **size proxy**. Production art
> should be exported by a designer; expect the same order of magnitude, not identical bytes.

WebP would be smaller again, but PNG is the safer default across both platforms.

### 4.4 Packaging considerations

| Item | Note |
|---|---|
| Delivery | real asset files + `require('./assets/visa.png')`, so **Metro selects @1x/@2x/@3x automatically** |
| Rollup | asset `require`s must be left for Metro rather than resolved by Rollup — the current config bundles everything, so this needs handling. Part of the M estimate |
| `files` allowlist | `package.json` must gain the asset directory |
| `verify-tarball.mjs` | must assert the assets are **present** (and stay within a size budget) |
| Alternative | base64 data URIs avoid the asset pipeline entirely but add ~33 % inflation and lose automatic density selection — **not recommended** |

### 4.5 Advanced override

An optional icon-override API may be offered **in addition** (Phase B), never as the parity
mechanism.

---

## 5. Scan-card — corrected data-flow claim

**Correction.** The previous revision stated that no card data crosses merchant code under
capability injection. **That was wrong.** The generated public type is **[code]**:

```ts
export type scanCardCapability = {
  readonly isAvailable: boolean;
  readonly launch: (onScanned: ((pan: string, expiry: string) => void)) => void;
};
```

The merchant-supplied `launch` **receives `onScanned` and must call it with the scanned PAN and
expiry**. Merchant code therefore **obtains, constructs and can observe the PAN and expiry**. Under
constraint 7 ("do not expose PAN, expiry or CVC through merchant callbacks"), *arbitrary merchant
capability injection is not acceptable* as a public standalone API.

**Scan-card remains parked for this phase.** For future work, three distinct shapes:

| Shape | Who sees the PAN | Verdict |
|---|---|---|
| **Arbitrary merchant capability injection** | merchant code | **rejected** — violates constraint 7 |
| **First-party optional adapter** encapsulating the native result — the adapter reads the native module and feeds values in; the merchant enables it but never handles values | library/adapter only | the only acceptable future route |
| **Mandatory native dependency in the root package** | n/a | **rejected** — breaks one-install and no-native-setup |

Evidence for a future first-party adapter **[code]**: `@juspay-tech/react-native-hyperswitch-scancard`
ships `android/` and a `.podspec`, declares **`react-native-webview` as an additional peer** (two
native modules, not one), and has **no `codegenConfig`** — an old-architecture module, while the
example runs Fabric **[run]**, so New Architecture compatibility **requires verification**.

The library-side UI is already built and portable: `CardScanTrigger.res` imports nothing native, and
`CardFormView.onScanned` already populates all three inputs and moves focus **[code]**.

---

## 6. Co-badge — parked, with the reason traced

**Traced [code]:** `VaultConfirm.buildConfirmBody` sends exactly four card fields —
`card_number`, `card_exp_month`, `card_exp_year`, `card_cvc` — plus
`payment_method_type: "card"`. **There is no `card_network` field in the PMS-confirm request.**
The standalone `fieldSpecs` has no `CardNetwork` entry either, so there is no form field to hold a
selection.

The standalone flow ends at PMS confirm and returns a token plus masked metadata. **No confirmed
effect of a selected network on the request, the returned token, or any subsequent standalone
merchant flow has been established.**

**Recommendation: do not build a selector.** A **detected-brand icon** ships with §4 and needs no
selection. Revisit only if a backend contract proves the network affects the request or the token.
Never import the client-core `Tooltip` or `ViewportContext`.

---

## 7. Visual differences a designer would notice

1. **No brand icon** — largest gap; addressed by §4.
2. **No CVC hint icon.**
3. **No scan-card camera button or divider** (parked).
4. **No co-badge chevron** (parked).
5. **Error text typography/padding** differs slightly.
6. **No brand-icon transition** (§3.2 #5).
7. **Fixed 12 pt gap, no shadow**, where client-core takes both from its theme.

Borders, radii, heights, floating-label motion, focus ring, masked CVC and both layouts come from the
same source and match.

---

## 8. Behavioural differences

| Behaviour | Embedded | Standalone | Class |
|---|---|---|---|
| Inputs during processing | editable (D10) | non-interactive | **G** — accepted |
| Eligibility gating | can block Pay silently (D7) | never blocks | F |
| Analytics on focus/blur | logged via `LoggerHook` | none | F |
| Labels | localised | English | C |
| Co-badge scheme choice | user-selectable | first detected wins | parked |
| Field set | config-driven | fixed | F |
| Validator construction | `createFieldValidator` | card-only validators, same sdk-utils algorithms | by design |

---

## 9. Host-only classification

| Feature | Why |
|---|---|
| `LoggerHook` transport and event taxonomy | client-core logging pipeline |
| Eligibility + `notEligibleText` | client-core product concept; carries defect D7 |
| Superposition dynamic fields | decides field existence |
| Scan alerts and SCAN_CARD telemetry | host owns messaging and telemetry |
| Nickname, save-card checkbox, saved-card CVC | not part of the card form |
| `Tooltip` + `ViewportContext` | excluded in Phase 1 |
| The four-mode `cardBrandIcon` enum | host configuration — though the *animation* itself is portable (§3.2 #5) |

---

## 10. Bundle-size expectations

Baseline **[run]**: root entry `dist/esm/index.js` = **168,268 bytes**; tarball **25 files,
109.1 KiB compressed / 539.1 KiB unpacked**.

| Change | Delta to the merchant's bundle |
|---|---|
| Labels / RTL prop | ~0 KiB |
| Accessibility passthrough | ~0 KiB |
| Appearance completeness | < 0.5 KiB |
| Matching error presentation | ~0 KiB |
| Brand transition (Animated primitives) | ~0 KiB |
| **Built-in PNG icons — 8 brands + waitcard + cvv, × 3 densities** | **≈ 22.4 KiB [run]** |
| + artwork for the 5 uncovered schemes | ≈ +14 KiB **[assumption]** |
| Advanced icon override API | ~0 KiB |

**Phase A1 < 1 KiB; Phase A2 ≈ 22.4 KiB**, both with no new dependency and no native-code changes.
Actual tarball and Metro bundle impact must be re-measured from a tarball install once real assets
exist.

---

## 11. Implementation phases

### Phase A1 — no assets, no approvals needed

Ships immediately; nothing here waits on artwork or trademark sign-off.

| Item | Files | Effort |
|---|---|---|
| Matching default error presentation (align with `ErrorText`) | `HyperswitchVaultForm.res` | S |
| Accessibility passthrough (`accessible`) | `HyperswitchVaultForm.res` | S |
| Appearance completeness (`gap`, `fontScale`, `placeholderTextSizeAdjust`, shadow) | `HyperswitchVaultForm.res` | S |
| Label customisation (six strings + `isRtl`) | `HyperswitchVaultForm.res`, `type-tests/`, docs | S–M |
| Validation-message customisation (`CardValidationMessages`) | `HyperswitchVaultForm.res`, `type-tests/`, docs | M |

**Files: ≈ 3** source files (one ReScript module plus two type-test/doc files), plus regenerated
genType output. `CardFormView` and `CardInput` are **not modified**, so the embedded path cannot
regress.

**Bundle impact: < 1 KiB.** **No native-code changes**, and no new asset verification, so the
existing automated suite covers it: `re:build`, `check:generated`, `tsc -p tsconfig.consumer.json`,
`verify:tarball`, `verify:mapping`, `verify:consumers`, and the example jest suite.

**Overall effort: M** (dominated by the two public-API additions and their generated types).

### Phase A2 — after artwork and trademark approval

Blocked on two prerequisites: **artwork for the five uncovered schemes** (or an accepted
`waitcard` fallback for them) and **trademark/licensing sign-off**.

| Item | Files | Effort |
|---|---|---|
| Exhaustive supported brand assets (8 available; 5 fall back) | `assets/` | M |
| `waitcard` and `cvv` assets | `assets/` | S |
| Built-in `Image` renderer + lower-cased lookup + fallback rule | `HyperswitchVaultForm.res` | M |
| client-core `Standard` icon behaviour (static, no animation) | with the above | S |
| Enable `showCvcIcon` | `HyperswitchVaultForm.res` | S |
| Rollup asset handling (leave asset requires for Metro) | `rollup.config.mjs` | M |
| Package allowlist + tarball asset assertions | `package.json`, `verify-tarball.mjs` | M |

**Files: ≈ 4 source/config files plus 30 asset files** (10 assets × 3 densities).

**Bundle impact: ≈ 22.4 KiB measured [run]**, growing by roughly **+14 KiB [assumption]** if the five
missing schemes gain artwork.

**Native work: no native-code changes** — no Objective-C, Swift, Java, Kotlin, podspec or Gradle
module is added. **But packaged assets still require Android and iOS verification against a
tarball-installed package**, because asset resolution is a platform concern, not a JavaScript one:

| Verification | Why it cannot be skipped |
|---|---|
| Install from the packed tarball, not the workspace symlink | the symlinked workspace can resolve assets the published tarball does not contain |
| Density selection on both platforms | Metro picks @1x/@2x/@3x per device scale; a missing density silently degrades |
| Rendered dimensions | a wrong `viewBox`-to-pixel export shows a correctly-sized box with the wrong artwork inside |
| Missing-asset behaviour | the §4.2 fallback must render `waitcard` for RuPay, UnionPay, Maestro, BAJAJ and SODEXO — verify with a real BIN for each |
| Tarball contents | `verify-tarball.mjs` must assert every expected asset is present and within budget |

**Overall effort: M–L** — L if the five missing marks are commissioned as part of it.

### Phase B — advanced optional customisation

- optional icon-renderer override (an advanced API, never the parity mechanism);
- any context-free scheme functionality, **only after its backend contract is proven** (§6).

### Phase C — optional first-party scan-card integration

Only on product demand, and only as a **first-party adapter that encapsulates the native result** so
no card value crosses merchant code (§5).

### Accepted differences (not defects, not scheduled)

| Difference | Status |
|---|---|
| Processing-time editability (standalone non-interactive, embedded editable per D10) | accepted; do not align either way |
| client-core eligibility | host-only |
| client-core superposition dynamic fields | host-only |
| `LoggerHook` analytics | host-only; no standalone requirement |
| Co-badge selection | **parked pending a proven backend contract** |
| Scan-card | **parked**; future work only as a first-party adapter |
| Artwork for RuPay, UnionPay, Maestro, BAJAJ, SODEXO | falls back to `waitcard` until commissioned |

## 12. Direct recommendation

**Implement now — Phase A1.** Matching error presentation, accessibility, appearance completeness,
label customisation and validation-message customisation. **≈ 3 files, < 1 KiB, no assets, no
approvals, no native-code changes.** `CardFormView` and `CardInput` untouched. Start with the two
text items — labels plus validation messages are the only gap that outright blocks non-English
merchants, and shipping labels alone would leave a half-translated form.

**Then — Phase A2, once artwork and trademark sign-off land.** Built-in brand, unknown-card and CVC
icons with a lower-cased lookup and an explicit `waitcard` fallback for the five detectable schemes
that have no artwork; client-core `Standard` behaviour exactly, meaning **no animation**; Rollup
asset handling; package and tarball assertions. **≈ 4 files plus 30 asset files, ≈ 22.4 KiB
measured.** No native-code changes, but Android and iOS verification against a **tarball-installed**
package is mandatory for density selection, dimensions and the missing-asset fallback.

**Keep client-core-only.** `LoggerHook` transport; eligibility; superposition dynamic fields; scan
alerts and SCAN_CARD telemetry; `Tooltip` and `ViewportContext`; the four-mode `cardBrandIcon` enum.

**Do not add.** `onAnalytics` (no standalone requirement); `renderError` (match the default
internally); a co-badge selector (no `card_network` field exists in the PMS-confirm request, so a
selection has no proven effect); a default cross-fade (client-core's `Standard` has none).

**Scan-card: parked.** Not as merchant-injected capability — the generated type proves merchant code
would handle the PAN. If ever built, build it as a first-party adapter.

**Do not touch.** Defect **D10** in either direction, and **D1–D15** generally.

**Risk summary.**

| Risk | Phase | Note |
|---|---|---|
| Trademark/licensing for redistributing card marks | A2 | **blocking prerequisite**, not an engineering call |
| Five detectable schemes with no artwork | A2 | mitigated by the mandatory `waitcard` fallback; still a visible gap versus client-core |
| Asset resolution through Rollup and Metro | A2 | must be verified from a tarball install, not the workspace symlink |
| Duplicated validation-message mapping | A1 | accepted short-term; retired by the sdk-utils card-only validator entry point |
| Public API growth | A1 | contained: two additions, both optional, both defaulting to current behaviour |
