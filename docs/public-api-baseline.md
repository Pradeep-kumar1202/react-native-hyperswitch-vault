# Public API baseline — current reality

**Date**: 2026-08-24 (Phase 0 baseline) · 2026-08-25 (updated for Phase 1)
**Commit inspected**: `911f17f` (`master`)
**Scope**: what the package exports **today**. Nothing here is a proposal.

The accepted target contract is **[ADR-0002](adr/0002-merchant-public-api-contract.md)**; its
implementation-status table says which parts are built. This document records only what is actually
shipped, so the two must never be read as one.

> **Phase 1 update (2026-08-25).** The merchant facade from ADR-0002 §1–§3 is now implemented: the
> canonical field names `CardNumberField` / `CardExpiryField` / `CardCVCField`, the handle type
> aliases `VaultFieldHandle` / `VaultFormHandle`, and the `HyperswitchVault` convenience namespace.
> They are **aliases of the existing components**, not new implementations — §2.1 records the
> identity guarantee and how it is verified. No existing export, prop, handle, result or behaviour
> changed, and `/embedded` and `/vault` are byte-identical to the Phase 0 baseline.
>
> **Phase 2B update (2026-08-25).** ADR-0002 §9 layer 2 is now implemented: a `styles` prop on all
> three fields and a grouped `fieldStyles` prop on the ready-made form, adding **5 type exports**
> (§2.2). No value export was added or removed, and no existing prop, handle, result or behaviour
> changed. Two documented deviations from §9's text: `helperText` is not published (no helper-text
> element is rendered) and `VaultExpiryStyles` omits `accessory` (the expiry field renders no icon).
> `/embedded` gains nothing — its declaration contains no `styles` at all, gated by
> `verify-consumers.mjs` — and `/vault` is proven React-free by execution in
> `verify-vault-isolation.mjs`.
>
> **Phase 3 update (2026-08-25).** ADR-0002 §4, §4a and §5 are now implemented: an `onStateChange`
> callback on each of the three fields and an additive `onFormStateChange` on both form components,
> adding **11 type exports** (§2.2). The pre-existing `onStateChange` on the form components keeps
> its `CardFormState` payload unchanged — this is additive, not a rename. No value export changed.
> The published event types carry no card value at any depth, gated statically by
> `verify-event-surface.mjs` against the packed tarball and at runtime by a recursive walk over
> every emitted snapshot in `example/__tests__/fieldEvents.test.tsx`. `/embedded` gains nothing.

**Evidence markers**

| Marker | Meaning |
|---|---|
| **[src]** | read from a ReScript / TypeScript source file in this repository |
| **[gen]** | read from committed genType output (`src/*.gen.tsx`) |
| **[dist]** | read from the built declarations (`dist/types/*.d.ts`) — the surface a merchant's `tsc` resolves |
| **[pkg]** | read from `package.json` |
| **[run]** | produced by a command executed against this tree |

`dist/` is gitignored build output. It was present and in sync with `src/*.gen.tsx` at inspection
time; every `[dist]` claim below was cross-checked against its `[gen]` source.

---

## 1. Entry points and the export map

Three entries, no root re-export between them **[pkg]**:

| Subpath | `types` | ESM / React Native | CJS |
|---|---|---|---|
| `.` | `dist/types/public.d.ts` | `dist/esm/index.js` | `dist/cjs/index.js` |
| `./embedded` | `dist/types/embedded.d.ts` | `dist/esm/embedded.js` | `dist/cjs/embedded.js` |
| `./vault` | `dist/types/vault.d.ts` | `dist/esm/vault.js` | `dist/cjs/vault.js` |
| `./package.json` | — | — | — |

`main` / `module` / `react-native` / `types` also point at the root entry **[pkg]**. Both formats
use the `.js` extension deliberately (a consumer webpack config routes unknown extensions through
`asset/resource`, which silently empties a `.mjs`/`.cjs` entry) — `rollup.config.mjs` **[src]**.

**The root entry does not re-export `/embedded` or `/vault`.** `src/public.ts` **[src]** imports
only `HyperswitchVaultForm.gen`, `HyperswitchVaultFormProvider.gen`, the three widget `.gen` files
and `merchantTypes`.

Since Phase 1 this boundary is **asserted, not merely conventional**: `scripts/verify-consumers.mjs`
pins the exact export list of each entry against the packed tarball, and checks in both directions —
that `/embedded` and `/vault` expose none of the merchant facade, and that the root exposes exactly
its nine documented values and nothing else **[run]**.

---

## 2. Root export surface (`.`) — the merchant API

Source of truth: `src/public.ts` **[src]** → `dist/types/public.d.ts` **[dist]**.

### 2.1 Value exports (9)

Five distinct component objects, reachable under nine names.

| Export | Source `.res` | Generated declaration | Published type | For ordinary merchants? |
|---|---|---|---|---|
| `HyperswitchVaultForm` | `src/HyperswitchVaultForm.res` | `src/HyperswitchVaultForm.gen.tsx` | `ForwardRefExoticComponent<Props & RefAttributes<vaultFormHandle>>` | **Yes** — ready-made form |
| `HyperswitchVaultFormProvider` | `src/HyperswitchVaultFormProvider.res` | `src/HyperswitchVaultFormProvider.gen.tsx` | `ForwardRefExoticComponent<ProviderProps & RefAttributes<vaultFormHandle>>` | **Yes** — custom layout |
| `CardNumberWidget` | `src/CardNumberWidget.res` | `src/CardNumberWidget.gen.tsx` | `ForwardRefExoticComponent<RefAttributes<widgetHandle>>` | **Yes** — custom layout |
| `CardExpiryWidget` | `src/CardExpiryWidget.res` | `src/CardExpiryWidget.gen.tsx` | `ForwardRefExoticComponent<RefAttributes<widgetHandle>>` | **Yes** — custom layout |
| `CardCVCWidget` | `src/CardCVCWidget.res` | `src/CardCVCWidget.gen.tsx` | `ForwardRefExoticComponent<RefAttributes<widgetHandle>>` | **Yes** — custom layout |
| `CardNumberField` | *(alias)* | — | same type as `CardNumberWidget` | **Yes** — canonical name |
| `CardExpiryField` | *(alias)* | — | same type as `CardExpiryWidget` | **Yes** — canonical name |
| `CardCVCField` | *(alias)* | — | same type as `CardCVCWidget` | **Yes** — canonical name |
| `HyperswitchVault` | *(namespace object)* | — | `{ CardForm, Form, CardNumber, Expiry, CVC }`, all readonly | **Yes** — convenience facade |

#### The identity guarantee **[run]**

The aliases and the namespace members are **the same objects**, not wrappers:

```
CardNumberField === CardNumberWidget
CardExpiryField === CardExpiryWidget
CardCVCField    === CardCVCWidget

HyperswitchVault.CardForm   === HyperswitchVaultForm
HyperswitchVault.Form       === HyperswitchVaultFormProvider
HyperswitchVault.CardNumber === CardNumberField
HyperswitchVault.Expiry     === CardExpiryField
HyperswitchVault.CVC        === CardCVCField
```

This matters because a wrapper component would satisfy every structural and type-level check while
breaking `===` comparisons, `React.memo` identity and devtools naming. Identity is asserted twice:
in `scripts/verify-consumers.mjs` against the **packed tarball** loaded through Node, and in
`example/__tests__/merchantFacade.test.tsx` under the real React Native jest preset **[run]**.

`src/standalone-entry.mjs` binds all nine names from the same five imports, and Rollup emits them as
bindings to the same `make$N` locals **[src]**. `scripts/verify-public-surface.mjs` fails the build
if the entry ever contains a `forwardRef(...)`, a `createElement(...)`, a function component or JSX
**[src]**.

#### Where the runtime and the types come from

The root entry has two halves compiled by different tools, and they must agree:

| Half | Source | Tool | Output |
|---|---|---|---|
| runtime values | `src/standalone-entry.mjs` | Rollup | `dist/{esm,cjs}/index.js` |
| types | `src/public.ts` | tsc (`emitDeclarationOnly`) | `dist/types/public.d.ts` |

Nothing in `public.ts` executes, so `HyperswitchVault` is `export declare const` there and a real
object only in the runtime entry. A name present in one half and missing from the other would
type-check and be `undefined` on a device, or ship untyped — neither shows up in any other check, so
`scripts/verify-public-surface.mjs` compares the two exported value sets and the namespace members
on every build **[src]**.

The `ForwardRefExoticComponent` composition is hand-written in `src/public.ts` **[src]**: genType
types a `forwardRef` component as `React.ComponentType<Props>` and drops the ref, so `public.ts`
re-attaches it from the **generated** `Props` and `vaultFormHandle` — it never re-declares them.

Two consequences worth recording, both current behaviour:

- Each widget's generated `Props` is `{ readonly children?: React.ReactNode }` **[gen]**, but the
  published root type is `RefAttributes<widgetHandle>` only **[dist]**. The `children` prop exists in
  the ReScript component signature and is ignored by the implementation (`_props`) **[src]**; it is
  not part of the published merchant type.
- `widgetHandle` is declared in `HyperswitchVaultFormProvider.res` **[src]** even though it is the
  *widgets'* handle. That is a source-organisation detail, not a published-surface detail.

### 2.2 Type exports (33)

| Published name | Generated origin | Shape |
|---|---|---|
| `HyperswitchVaultFormProps` | `HyperswitchVaultForm.gen` `Props` | see 2.3 |
| `HyperswitchVaultFormProviderProps` | `HyperswitchVaultFormProvider.gen` `Props` | see 2.4 |
| `HyperswitchVaultFormHandle` | `VaultFormOptions.gen` `vaultFormHandle` | see 2.5 |
| `WidgetHandle` | `HyperswitchVaultFormProvider.gen` `widgetHandle` | `{ focus(): void; blur(): void }` |
| `VaultFormAppearance` | `VaultFormOptions.gen` `appearance` | 16 optional tokens, see 2.7 |
| `VaultFormBrandIconMode` | `CardIcons.gen` `brandIconMode` | `"standard" \| "animated" \| "hidden" \| "hideGeneric"` |
| `VaultBrandIconMode` | `CardFieldOptions.gen` `brandIconMode` | the same union under the field-option name |
| `VaultFormLocalisation` | `VaultFormOptions.gen` `localisation` | `{ labels?; validationMessages?; isRtl? }` |
| `VaultFormLabels` | `VaultFormOptions.gen` `localisationLabels` | 6 optional strings |
| `VaultFormValidationMessages` | `VaultFormOptions.gen` `localisationMessages` | 6 optional strings |
| `CardFormState` | `VaultFormOptions.gen` `cardFormState` | see 2.6 |
| `VaultSubmitResult` | `VaultResult.gen` `vaultSubmitResult` | see 2.8 |
| `SafeVaultError` | `VaultResult.gen` `safeVaultError` | `{ code; message }` |
| `SafeVaultErrorCode` | `VaultResult.gen` `safeVaultErrorCode` | 5-member closed union |
| `VaultEnvironment` | `VaultConfirm.gen` `vaultEnvironment` | `"production" \| "sandbox" \| "integration"` |
| `MerchantSession` | `src/merchantTypes.ts` (hand-written) | `{ vault_details?: { vault_type?; vault_data?: { sdk_authorization? } }; [k: string]: unknown }` |
| `VaultFieldHandle` | alias of `WidgetHandle` | identical — `{ focus(): void; blur(): void }` |
| `VaultFormHandle` | alias of `HyperswitchVaultFormHandle` | identical — `{ submit(); reset(); focus(field) }` |
| `VaultFieldStyles` | `CardFieldStyles.gen` `fieldStyles` | 7 optional slots — `root`, `container`, `input`, `placeholder`, `label`, `error`, `accessory` |
| `VaultCardNumberStyles` | alias of `VaultFieldStyles` | identical — the card number renders a brand accessory |
| `VaultCVCStyles` | alias of `VaultFieldStyles` | identical — the CVC renders a hint accessory |
| `VaultExpiryStyles` | `CardFieldStyles.gen` `expiryStyles` | the same 6 slots **minus `accessory`** — the expiry field renders no icon |
| `VaultFormFieldStyles` | `CardFieldStyles.gen` `formFieldStyles` | `{ cardNumber?: VaultCardNumberStyles; expiry?: VaultExpiryStyles; cvc?: VaultCVCStyles }` |
| `CardBrand` | `VaultPublicState.gen` `cardBrand` | 14-member closed union — all 13 detector schemes plus `'unknown'`, lower-camel |
| `VaultField` | union of the three `field` literals | `'cardNumber' \| 'expiry' \| 'cvc'` |
| `VaultFieldStatus` | `VaultPublicState.gen` `vaultFieldStatus` | `'empty' \| 'incomplete' \| 'complete'` |
| `VaultFieldErrorCode` | `VaultPublicState.gen` `vaultFieldErrorCode` | `'required' \| 'invalid_card_number' \| 'invalid_expiry' \| 'invalid_cvc'` |
| `VaultFieldError` | `VaultPublicState.gen` `vaultFieldError` | `{ code: VaultFieldErrorCode; message: string }` |
| `VaultCardNumberState` | `VaultPublicState.gen` `cardNumberState` | `{ field: 'cardNumber'; status; focused; brand: CardBrand; error? }` |
| `VaultExpiryState` | `VaultPublicState.gen` `expiryState` | the same minus `brand` |
| `VaultCVCState` | `VaultPublicState.gen` `cvcState` | the same minus `brand` |
| `VaultFieldState` | union of the three above | discriminates on `field` |
| `VaultSessionStatus` | `VaultPublicState.gen` `vaultSessionStatus` | `'valid' \| 'invalid'` |
| `VaultFormFields` | `VaultPublicState.gen` `vaultFormFields` | `{ cardNumber; expiry; cvc }`, each narrowed |
| `VaultFormState` | `VaultPublicState.gen` `vaultFormState` | `{ fieldsReady; sessionStatus; complete; submitting; canSubmit; brand; fields }` |

`VaultFieldHandle` and `VaultFormHandle` are declared as `type X = Y`, never re-declared member by
member, so the two spellings cannot drift. `type-tests/consumer.tsx` asserts assignability in **both**
directions, which a one-way assignment would not prove **[src]**.

`VaultFormOptions.gen.tsx` also declares `vaultCardMetadata` **[gen]**, but `public.ts` does **not**
re-export it. Masked card metadata is not reachable from the root entry.

Every style slot resolves to React Native's own `StyleProp<ViewStyle>` / `StyleProp<TextStyle>` —
never ReScript's opaque `Style.t`, never `any`, `unknown` or an index signature. That is asserted
against the **packed tarball** (not `dist/`) by `scripts/verify-style-bridge.mjs`, with negative
controls that are proven non-vacuous **[run]**.

### 2.3 `HyperswitchVaultForm` props **[gen]**

```ts
type Props = {
  readonly session: vaultSession;            // required — MerchantSession, passed through untouched
  readonly environment: vaultEnvironment;    // required
  readonly appearance?: appearance;
  readonly localisation?: localisation;
  readonly disabled?: boolean;
  readonly layout?: formLayout;              // "stacked" (default) | "inline"
  readonly fieldArrangement?: fieldArrangement;  // "separate" (default) | "fused"
  readonly fieldOptions?: formFieldOptions;  // which visual elements each field renders
  readonly fieldStyles?: formFieldStyles;
  readonly accessible?: boolean;
  readonly onStateChange?: (_1: cardFormState) => void;
};
```

Only two fields of `session` are read — `vault_details.vault_type` and
`vault_details.vault_data.sdk_authorization` (`VaultFormCoordinator.readSession` **[src]**).

### 2.4 `HyperswitchVaultFormProvider` props **[gen]**

Identical to 2.3 **minus** `layout`, `fieldArrangement`, `fieldOptions` and `fieldStyles`
(the merchant owns the layout and passes options and styles to each field directly), **plus**
required `children: React.ReactNode`.

### 2.5 Ref handle — both components **[gen]**

```ts
type vaultFormHandle = {
  readonly submit: () => Promise<vaultSubmitResult>;
  readonly reset: () => void;
  readonly focus: (_1: "cvc" | "cardNumber" | "expiry") => void;
};
```

Wired in `HyperswitchVaultForm.res` and `HyperswitchVaultFormProvider.res` via
`React.useImperativeHandle0` **[src]** — the same three members from the same host, so the two
components genuinely share one handle type.

### 2.6 State callback — the only merchant event today **[gen]**

```ts
type cardFormState = {
  readonly complete: boolean;
  readonly cardNumberValid: boolean;
  readonly expiryValid: boolean;
  readonly cvcValid: boolean;
  readonly brand: CardBrand;   // canonical union, "unknown" when none
};
```

Computed in `VaultFormHost.useHost` **[src]**. Each per-field flag is
`countOf(kind) == 1 && <sdk-utils validity>`, so a missing or duplicated widget forces that field
false and therefore `complete` false. There is **no per-field event and no field-level callback** at
any level today.

### 2.7 `appearance` — 16 optional tokens **[gen]**

`primaryColor`, `textColor`, `errorColor`, `placeholderColor`, `backgroundColor`, `borderColor`,
`borderRadius`, `borderWidth`, `fontFamily`, `inputHeight`, `gap`, `fontScale`,
`placeholderTextSizeAdjust`, `errorTextSizeAdjust`, `errorMessageSpacing`, `brandIconMode`.

Resolved to a `cardTheme` by `VaultFormOptions.buildTheme` **[src]**. `bgStyle` and `shadowStyle`
are set to an empty `Style.s({})` there and are **not** merchant-settable; the ReScript
`Style.t` type is `@genType.opaque` in `CardFormTypes.res` **[src]** and never crosses the merchant
TypeScript boundary. There are **no per-field style slots and no `StyleProp` anywhere** in the root
surface.

### 2.8 Result union — token only **[gen] [dist]**

```ts
type vaultSubmitResult =
  | { status: "success";          readonly token: string }
  | { status: "validation_error"; readonly error: safeVaultError }
  | { status: "not_ready";        readonly error: safeVaultError }
  | { status: "error";            readonly error: safeVaultError };

type safeVaultErrorCode =
  | "invalid_session" | "invalid_card_data" | "not_ready" | "server_error" | "unknown_outcome";
```

**A standalone success carries the token and nothing else.** No brand, BIN, last four, expiry, card
object or raw transport response. `VaultResult.fromConfirmOutcome` **[src]** destructures
`result.token` from the transport outcome and discards `result.card`.

This is locked by negative controls in `type-tests/consumer.tsx` **[src]** — `result.card`,
`result.cardNumber`, `result.last4Digits`, `result.expiryMonth` are all `@ts-expect-error`, so the
metadata could not be re-added without the build failing.

`error.message` is always one of five fixed library strings from `VaultResult.res` **[src]**. No
backend message, HTTP status or decoded authorization reaches it.

### 2.9 Transport-code mapping, as executed **[run]** (`node scripts/verify-result-mapping.mjs`)

```
#invalid_card_data      -> validation_error  / invalid_card_data
#invalid_authorization  -> error             / invalid_session
#missing_session_id     -> error             / invalid_session
#unknown_outcome        -> error             / unknown_outcome
#http_error             -> error             / server_error
#malformed_response     -> error             / server_error
#missing_token          -> error             / server_error
(session unusable)      -> error             / invalid_session
(form not registered)   -> not_ready         / not_ready
(local validation)      -> validation_error  / invalid_card_data
```

There is no `network_error`, no `retryable`, no `requestId` and no `session_expired` in the public
union. `retryableForStatus` in `VaultConfirm.res` **[src]** returns `false` unconditionally, and no
code path retries.

---

## 3. `/embedded` — first-party / client-core controlled fields

Source of truth: `src/embedded.ts` **[src]** → `dist/types/embedded.d.ts` **[dist]**.

**Value exports (4)**: `CardNumberField`, `CardExpiryField`, `CardCvcField`, `selectCardFields` —
all from `src/VaultEmbedded.res` **[src]**.

**Type exports (19)**: `analyticsPayload`, `cardFieldSpec`, `cardFieldSelection`, `cardTheme`,
`cardLabels`, `cardLayout`, `eligibilityState`, `schemeAccessory`, `scanCardCapability`,
`maskedCardInfo` (from `VaultEmbedded.gen`); `cardFieldValues`, `cardFieldErrors`, `cardFieldOk`
(from `CardFormTypes.gen`); `numberChange`, `expiryChange`, `cvcChange`, `backspaceAction`,
`scanFocus`, `eligibilityProbe` (from `CardFieldLogic.gen`).

These are **fully controlled** components: the host passes `value`, `onChange`, `error`, `isValid`,
`renderError`, `label`, `floatingLabel`, `theme` and the focus/blur/backspace callbacks in, and the
component holds none of it. They also take `registerFocus` / `registerBlur` callbacks so the host
can drive focus. `maskedCardInfo` is `@genType.opaque` **[src]** — client-core's own event data,
not a readable TypeScript shape.

**Not for ordinary merchants.** Nothing in the code prevents a merchant importing `/embedded`; the
boundary is documentation-only today.

### Ownership boundary with `hyperswitch-client-core`

Verified in `/Users/pradeep.kumar/Documents/hyperswitch-client-core` (branch `main`, HEAD
`1eea95c`, with uncommitted vault work in the tree):

- `package.json` declares `final-form@^5.0.0` and `react-final-form@^7.0.0` as **its own**
  dependencies, and depends on this library by tarball path **[src]**.
- `src/components/dynamic/CardElement.res` performs **exactly five** `ReactFinalForm.useField`
  registrations — card number, expiry month, expiry year, card network, CVC (lines 149–171)
  **[src]**.
- `src/utility/libraries/HyperswitchVault.res` binds `CardNumberField` / `CardExpiryField` /
  `CardCvcField` / `selectCardFields` from `.../embedded` and `confirmPaymentMethodSession` from
  `.../vault` **[src]**.

So client-core owns the form library, the registrations and the orchestration; this library owns
the field presentation and the transport. That boundary is unchanged by anything in ADR-0002.

---

## 4. `/vault` — low-level transport

Source of truth: `src/vault.ts` **[src]** → `dist/types/vault.d.ts` **[dist]**.

**Value export (1)**: `confirmPaymentMethodSession(request): Promise<confirmOutcome>`.

**Type exports (8)**: `vaultEnvironment`, `cardDetails`, `confirmRequest`, `vaultCardMetadata`,
`vaultConfirmResult`, `vaultErrorCode`, `vaultError`, `confirmOutcome`.

This entry is free of React and React Native (`src/vault-entry.mjs` re-exports one function
**[src]**), and it is the **only** place masked card metadata is reachable:

```ts
type vaultCardMetadata = {
  readonly last4Digits: string;
  readonly binNumber?: string;
  readonly expiryMonth: string;
  readonly expiryYear: string;
};
type vaultConfirmResult = { readonly token: string; readonly card: vaultCardMetadata };
```

`cardDetails` here carries the raw PAN/expiry/CVC by construction — this entry is for a caller that
already holds card values, i.e. first-party or advanced use. **Not for ordinary merchants, and not
for the merchant Quick Start.**

Endpoint is fixed by environment (`VaultConfirm.vaultBaseUrl` **[src]**):
`checkout.hyperswitch.io` / `beta.hyperswitch.io` / `dev.hyperswitch.io`, path
`/v1/payment-method-sessions/{sessionId}/confirm`, method `POST`, headers `Content-Type` +
`Authorization`. None of that is configurable from any entry.

---

## 5. Dependencies and bundle boundaries **[pkg]**

| | |
|---|---|
| Runtime `dependencies` | **none** — the key is absent from `package.json` |
| `peerDependencies` | `react` `>=19.0.0 <20.0.0`, `react-native` `>=0.79.0 <0.80.0` |
| `peerDependenciesMeta` | absent |
| `engines` | `node >=18.18.0` |
| Verified against (devDeps) | `react` 19.0.0, `react-native` 0.79.7, `typescript` ^5.6.0, `rescript` 11.1.4 |
| Package manager | Yarn 3.6.4 |
| `sideEffects` | `false` |

### React Final Form is absent from published output

| Location | Result |
|---|---|
| `dist/**` | `grep -rl "final-form" dist` → **no match** **[run]** |
| `dist/esm/index.js` imports | `react`, `react/jsx-runtime`, `react-native`, internal shared chunks, `../assets/*.png` only **[run]** |
| `dist/cjs/index.js` requires | same set **[run]** |
| `package.json` | no `dependencies`, no RFF peer, no RFF peer meta **[pkg]** |
| `src/**` | no import of `react-final-form` or `final-form` **[run]** |
| `rollup.config.mjs` | one configuration, comment states no entry depends on a form library **[src]** |

The only remaining hits in this repository are:

- `lib/**` — the **gitignored ReScript build cache** (`lib/bs`) plus a stale pre-refactor bundle.
  `lib/` is not in the `files` allowlist and is not published.
- `scripts/verify-consumers.mjs` — which asserts the **absence** of RFF from the packed tarball and
  that the host repository still owns its own copy **[src]**.
- Historical review documents under `docs/`, now annotated as superseded.

Standalone state is held in `CardStateReducer.res` via `React.useReducer` **[src]**.

---

## 6. Current merchant data flow

### Ready-made

```
merchant session prop
  → HyperswitchVaultForm.res            (props, imperative handle)
  → VaultFormHost.useHost               (theme/labels/messages, validators, state callback, presence gate)
      ├─ VaultCardController.use        (reducer state, refs, widget registry, focus/backspace)
      └─ VaultFormCoordinator.useMachinery (session parse, single-flight submit, abort, lifecycle)
  → VaultWidgetContext.ContextProvider
  → CardFormView.res                    (ready-made layout ONLY)
  → BoundCardFields.{Number,Expiry,Cvc} (controller → field binding)
  → CardFields.{Number,Expiry,Cvc} → CardInput.res  (controlled RN presentation)
  → handle.submit()
  → VaultConfirm.confirmPaymentMethodSession  (PMS-confirm)
  → VaultResult.fromConfirmOutcome
  → { status: "success", token }
```

### Custom

```
merchant session prop
  → HyperswitchVaultFormProvider.res    (same props minus the form-layout ones, plus children)
  → VaultFormHost.useHost               (THE SAME host and controller as above)
  → VaultWidgetContext.ContextProvider
  → merchant-owned children
  → CardNumberWidget / CardExpiryWidget / CardCVCWidget
  → BoundCardFields.{Number,Expiry,Cvc} (same binding, same registration)
  → CardFields → CardInput              (same presentation)
  → handle.submit()  → same coordinator → same transport → same result
```

`CardFormView` is on the ready-made path **only**. The layer actually shared by every path —
standalone ready-made, standalone custom and `/embedded` — is **`CardFieldLogic` + `CardFields` +
`CardInput`**, with `CardStateReducer` shared by the two standalone paths.

### client-core (boundary only, not redesigned here)

```
client-core's own ReactFinalForm.Form
  → CardElement.res: five useField registrations (number, exp month, exp year, network, cvc)
  → /embedded CardNumberField / CardExpiryField / CardCvcField   (fully controlled)
  → client-core payment / vault orchestration
  → /vault confirmPaymentMethodSession  (when the vault path is taken)
```

---

## 7. Behaviour observed in source — recorded, not changed

Phase 0 changes no behaviour. These are the merchant-observable facts a compatibility contract has
to cover, each traced to source.

| Behaviour | Evidence |
|---|---|
| Card-number formatting, Luhn, scheme length, brand detection, expiry parse/validate, CVC length | `CardFieldLogic.res` delegating to `hyperswitch-sdk-utils` `Validation` **[src]** |
| CVC uses `secureTextEntry` | `CardFields.res` `Cvc` **[src]** |
| `maxLength` fixed at 23 / 7 / 4 | `CardFields.res` **[src]** |
| Keyboard fixed to `number-pad`, `autoCapitalize=none`, `autoCorrect=false`, `multiline=false`, `clearTextOnFocus=false` | `CardInput.res` **[src]** |
| Autofill fixed: `autoComplete=off`, `textContentType=oneTimeCode`, `autoFocus=false` | `CardInput.res` **[src]** — library-controlled, not merchant-settable |
| `testID` fixed per field | `CardTestIds.res` via `CardFields.res` `name` **[src]** |
| Auto-advance number → expiry → CVC | `VaultCardController.onNumberChange` / `onExpiryChange` **[src]** |
| Backspace on empty: CVC → expiry, expiry → number, number → blur | `CardFieldLogic.on*Backspace` + `VaultCardController.onBackspace` **[src]** |
| Error visibility gated on `touched` (and, for CVC, not `active`); expiry has its own predicate | `CardStateReducer.{numberError,expiryError,cvcError}` **[src]** |
| Changing to an unmatched brand clears expiry and CVC | `CardStateReducer` `NumberChanged` with `clearDependents` **[src]** |
| Floating label animates over 200 ms, `useNativeDriver: false` | `CardInput.res` **[src]** |
| Brand icon and CVC icon render only when asked for — `brandIconMode` defaults to `hidden`, `cvcIcon` to `none` | `CardFieldOptions.res`, `CardIcons.res`, `BoundCardFields.res` **[src]** |
| `brandIconMode` resolves field → `appearance` → `hidden` at one call site | `CardFieldOptions.resolveBrandIconMode` **[src]** |
| Both accessories are non-interactive and hidden from the accessibility tree | `CardInput.res` `CustomIcon` branch **[src]** |
| Single-flight `submit()` returns the same promise instance | `VaultFormCoordinator.submit` `inFlightRef` **[src]** |
| `reset()` during an in-flight request is a no-op that does **not** cancel | `VaultFormCoordinator.reset` **[src]** |
| Session/environment replacement aborts the superseded in-flight request | `VaultFormCoordinator` `requestKey` effect **[src]** |
| Unmount aborts and detaches | `VaultFormCoordinator` `useEffect0` cleanup **[src]** |
| Fields are non-interactive while submitting or `disabled` | `VaultFormHost` `editable` / `isProcessing` **[src]** |
| Missing/duplicate widget ⇒ `not_ready`, zero network | `VaultFormHost.presenceGate` before `ready()`/`isValid()` in `VaultFormCoordinator.runSubmit` **[src]** |
| Widget outside its provider throws a named error | `VaultWidgetContext.useRequired` **[src]** |
| The package contains no `console` call | no logging in any `src/*.res` **[src]** |

Two current-behaviour notes recorded deliberately **without** changing them, per Phase 0 scope:

1. The presence gate also runs for the ready-made `HyperswitchVaultForm`, whose fields register in a
   mount effect. A `submit()` issued before that effect flushes therefore returns `not_ready`.
2. `VaultCardController.safeState` is a no-op sink and `emitCardInfo` defaults to a no-op on the
   standalone path.

---

## 8. What a merchant can observe today — complete list

`complete`, `cardNumberValid`, `expiryValid`, `cvcValid`, `brand` (from `onStateChange`);
`status` + `token` **or** `status` + `error.code` + `error.message` (from `submit()`); a thrown
error only when a widget is rendered outside its provider.

Nothing else. No PAN, no formatted PAN, no expiry, no CVC, no `sdk_authorization`, no
payment-method-session id, no request body, no backend response, no backend error message, no HTTP
status, no logs and no analytics events reach merchant code from the root entry.

### Where the card values actually live — stated precisely

**Scope of everything in this subsection: the standalone root-entry flow only** — that is
`HyperswitchVaultForm`, and `HyperswitchVaultFormProvider` with the card-number, expiry and CVC
field components. It does **not** describe `/embedded` (where the host owns the values and passes
them in) or `/vault` (see below).

Raw card values are processed inside **library-managed React Native state running in the merchant
application process**. Concretely, PAN, expiry and CVC live in `CardStateReducer` state
(`React.useReducer` inside `VaultCardController.use`) and in `TextInput` `value` props inside
`CardInput.res` **[src]** — all of that is React code executing in the merchant's own JavaScript
bundle. There is no native module and no separate process; `package.json` and the README both
record "no native module, no Pod install, no Codegen" **[pkg]**.

The guarantee is therefore about the **API**, not about isolation:

> In the standalone root-entry flow, the supported merchant API does not expose those values through
> merchant callbacks, handles, public form state, submission results or library logs, and the
> standalone flow does not send them to the merchant backend. This is an API/data-flow guarantee,
> not native-process isolation, physical memory zeroization, automatic PCI compliance or a
> PCI-scope determination.

Two things must **not** be said, because the implementation does not support them: that card values
"never enter merchant application code" (they run in the merchant's process, they are simply not
handed to merchant-authored code by any supported API), and that anything is zeroized from memory
(nothing erases React state or native input buffers).

**`/vault` is outside all of this, by design.** `confirmPaymentMethodSession` takes a `cardDetails`
record containing the PAN, expiry and CVC **[gen]**. Any caller of that entry is handling raw card
data directly and none of the guarantees above apply to it. See §4.

---

## 9. Verification performed for this baseline **[run]**

| Command | Result |
|---|---|
| `yarn check:consumer-types` (`tsc -p tsconfig.consumer.json`) | exit 0 — published `dist/types` still satisfy `type-tests/`, negative controls included |
| `node scripts/verify-result-mapping.mjs` | exit 0 — 7 transport codes + 3 local outcomes, table in §2.9 |
| `grep -rl "final-form" dist` | no match |
| `git status --short` | clean before documentation edits |

Not run, deliberately: `yarn build`, `yarn verify` and `yarn re:build` regenerate `src/*.gen.tsx`,
`src/*.bs.js` and `dist/`, which is outside a documentation-only phase.
