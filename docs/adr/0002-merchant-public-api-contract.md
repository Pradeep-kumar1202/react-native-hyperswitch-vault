# ADR-0002: Merchant Public API Contract

**Date**: 2026-08-24 (proposed) · 2026-08-25 (accepted)
**Status**: accepted
**Deciders**: Pradeep Kumar
**Reversibility**: **Type 2 (two-way) only until implementation and publication.** After any name,
prop, callback, style slot or type in this contract is published it becomes Type 1 (one-way) — see
"Consequences". The namespace and the compatibility aliases are not exceptions.
**Confidence**: high on the current baseline, medium on the target shape

> **This ADR is an accepted contract, not a description of what is built.** Acceptance means the
> target shape is agreed; it does not mean it exists. Implementation is staged, and each stage
> carries its own verification.
>
> **Implementation status**
>
> | Section | Status |
> |---|---|
> | §1 canonical named exports (`CardNumberField` / `CardExpiryField` / `CardCVCField`) | **implemented — Phase 1** |
> | §2 convenience namespace (`HyperswitchVault.*`, minus `useForm`) | **implemented — Phase 1** |
> | §3 backward-compatible aliases (`VaultFieldHandle`, `VaultFormHandle`) | **implemented — Phase 1** |
> | §1 `useHyperswitchVaultForm`, §2 `HyperswitchVault.useForm` | not implemented |
> | §4 `VaultFieldState`, §4a `CardBrand`, §5 `VaultFormState`, §5a `onFormStateChange` | **implemented — Phase 3**, on the three fields, the ready-made form and the provider. Three recorded refinements: (a) §4's single record with `brand?: CardBrand // cardNumber only` is published as the UNION of three narrowed records, so the comment is structural — the card number's `brand` is required and the other two have no `brand` member; (b) §5's `fields` are therefore the narrowed types too; (c) §5's `ready` is published as **`fieldsReady`**, same semantics, unambiguous name (Phase 3 closure). `expired_card` remains unpublished as §4 requires |
> | §9 per-field style slots and the style bridge | **implemented — Phase 2B** on all three fields and the ready-made form. Two deviations from the text of this section, both evidence-backed and recorded in [docs/phase-2a-style-bridge-spike.md](../phase-2a-style-bridge-spike.md): `helperText` is NOT published (no helper-text element is rendered), and the expiry field's type omits `accessory` (it renders no icon). `placeholder.fontSize` / `label.fontSize` are interpreted as the float-animation endpoints and removed before forwarding |
> | §10 `VaultInputConfiguration`, §11 render slots and advanced features | not implemented |
>
> What exists today is recorded separately and with evidence in
> **[docs/public-api-baseline.md](../public-api-baseline.md)**. Where this document says "today" in
> a Context or evidence passage, it is quoting that baseline as of the Phase 0 inspection.

---

## Context

The package serves two consumers with different rights.

1. **Standalone React Native merchants** who want to collect a new card and receive a token. This is
   the higher product priority.
2. **`hyperswitch-client-core`**, which consumes controlled card fields from `/embedded`, owns its
   own React Final Form instance and its five card-related field registrations, and owns payment
   orchestration. Verified in that repository: `package.json` declares `final-form@^5.0.0` and
   `react-final-form@^7.0.0` as its own dependencies, and `src/components/dynamic/CardElement.res`
   makes exactly five `ReactFinalForm.useField` calls (number, expiry month, expiry year, network,
   CVC). **Client-core behaviour must not regress.**

### What is already true (verified, see the baseline)

- The root entry exports five components and fifteen types. `HyperswitchVaultFormProvider`,
  `CardNumberWidget`, `CardExpiryWidget` and `CardCVCWidget` are **implemented and published** — the
  custom-layout mode described in ADR-0001 shipped.
- Standalone success is **token-only**: `{ status: "success"; token: string }`. Masked card metadata
  exists on `/vault` (`vaultCardMetadata`) and is deliberately not re-exported from the root.
  `type-tests/consumer.tsx` holds `@ts-expect-error` negative controls against `result.card`,
  `result.cardNumber`, `result.last4Digits` and `result.expiryMonth`.
- The library owns formatting, Luhn, scheme lengths, brand detection, expiry parsing and validation,
  CVC validation and length, and CVC secure entry — all compiled from the pinned
  `hyperswitch-sdk-utils` submodule. Merchants can override label and message **strings** only.
- The transport is fixed: environment-selected host, `POST
  /v1/payment-method-sessions/{id}/confirm`, fixed headers, fixed body. No merchant knob touches it.
- `retryableForStatus` returns `false` unconditionally; nothing retries.
- React Final Form is **absent from published output** — no runtime `dependencies`, no RFF peer, no
  RFF import in `dist/**` or `src/**`, one Rollup configuration for all three entries. Standalone
  state lives in `CardStateReducer.res`.
- The root entry does not re-export `/embedded` or `/vault`. That is currently a convention with no
  test asserting it.

### What is missing, and why it blocks the product

| Gap | Consequence for a merchant |
|---|---|
| The merchant surface is five flat names with a `*Widget` suffix | The naming reads like an internal registry rather than a field API; there is no discoverable entry point |
| `onStateChange` is form-level only; there is no field-level state | A merchant cannot show a per-field checkmark, a per-field error in their own component, or drive focus from field status |
| The widgets take no style props at all | Any design that is not "one border, one radius, one font" needs a library change |
| `appearance` is 16 flat tokens covering the whole form | There is no way to style only the CVC field, and no typed slot for a label, helper text or accessory |
| No safe pass-through for `testID` / accessibility on individual fields | Test automation and screen-reader labelling cannot be tuned per field |
| Widget handles exist but there is no hook | Anything that needs form state outside the ref has to lift `onStateChange` manually |
| Session usability is not observable before `submit()` | A merchant who disables their button on form state sees a permanently dead button with no reason when the session is unusable — the only thing that reports `invalid_session` is the call they are not making (§5) |

The aim is **VGS-level field composability with a smaller, harder-to-misuse surface**, because our
use case is fixed (Hyperswitch card vaulting) where VGS's is generic (arbitrary sensitive fields to
arbitrary routes).

---

## Decision (proposed)

Adopt the contract below as the target merchant public API. Phase 0 commits only to the contract
document; each section names what would have to be built.

### 1. Canonical named exports

Named exports remain the supported, tree-shakable surface.

```ts
export { HyperswitchVaultForm };          // ready-made complete card form
export { HyperswitchVaultFormProvider };  // controller for merchant-owned layout
export { CardNumberField };               // independent field
export { CardExpiryField };               // independent field
export { CardCVCField };                  // independent field
export { useHyperswitchVaultForm };       // safe form state hook — FUTURE WORK, not implemented
```

**Naming evaluation.**

- `HyperswitchVaultForm` and `HyperswitchVaultFormProvider` are kept verbatim. They are published,
  documented and consumed; renaming them buys nothing and costs every existing integration.
- `CardNumberField` / `CardExpiryField` / `CardCVCField` replace the `*Widget` names as the
  canonical spelling. "Field" is the term every comparable SDK uses (VGS `VGSTextInput.CardNumber`,
  and this package's own `/embedded` already uses `CardNumberField`). "Widget" is an internal term
  from the registry implementation. **The `*Widget` names are not removed** — see §3.
- One inconsistency is deliberately not carried forward: `/embedded` spells it `CardCvcField` while
  the root spells it `CardCVCWidget`. The proposed root name is `CardCVCField`, matching the
  existing root capitalisation, so no currently-published root name changes case.
- `useHyperswitchVaultForm` is **future work**. It does not exist today and must not be documented
  as if it does. Its proposed contract is in §6.

### 2. Convenience namespace

```ts
import { HyperswitchVault } from '@juspay-tech/react-native-hyperswitch-vault';

HyperswitchVault.CardForm    // === HyperswitchVaultForm
HyperswitchVault.Form        // === HyperswitchVaultFormProvider
HyperswitchVault.CardNumber  // === CardNumberField
HyperswitchVault.Expiry      // === CardExpiryField
HyperswitchVault.CVC         // === CardCVCField
HyperswitchVault.useForm     // === useHyperswitchVaultForm (future)
```

Target merchant code:

```tsx
<HyperswitchVault.CardForm ref={formRef} session={session} environment="sandbox" />
```

```tsx
<HyperswitchVault.Form ref={formRef} session={session} environment="sandbox">
  <HyperswitchVault.CardNumber />

  <View>
    <HyperswitchVault.Expiry />
    <HyperswitchVault.CVC />
  </View>
</HyperswitchVault.Form>
```

The namespace is a **convenience facade over the same component identities** — `Object.assign` over
the canonical exports, one object, no separate implementation. It is not the only supported form:
named imports stay first-class, and the docs should show named imports in the Quick Start because
they tree-shake and they read better in a diff.

`Form` (not `Provider`) is the namespaced spelling because inside a namespace the qualifier is
already carried by `HyperswitchVault.`, and `HyperswitchVault.Form` wrapping
`HyperswitchVault.CardNumber` reads correctly. `CardForm` is the ready-made one because it renders a
whole card form; `Form` is the one you fill yourself.

**Not built in Phase 0.** Do not create the namespace object as part of this phase.

### 3. Backward compatibility

Every currently published name keeps working, with identical props, identical handles and identical
behaviour. Nothing is removed and nothing is deprecated in Phase 0.

| Existing public name (today) | Future canonical equivalent | Relationship |
|---|---|---|
| `HyperswitchVaultForm` | `HyperswitchVaultForm` / `HyperswitchVault.CardForm` | unchanged name; namespace alias added |
| `HyperswitchVaultFormProvider` | `HyperswitchVaultFormProvider` / `HyperswitchVault.Form` | unchanged name; namespace alias added |
| `CardNumberWidget` | `CardNumberField` / `HyperswitchVault.CardNumber` | alias — same component identity |
| `CardExpiryWidget` | `CardExpiryField` / `HyperswitchVault.Expiry` | alias — same component identity |
| `CardCVCWidget` | `CardCVCField` / `HyperswitchVault.CVC` | alias — same component identity |
| `WidgetHandle` | `VaultFieldHandle` | alias — structurally identical (`focus()` / `blur()`) |
| `CardFormState` | `VaultFormState` | **not** an alias — see §5. Different shape and different `brand` type; both are exported, on different props |
| `onStateChange` (form components) | `onFormStateChange` | **not** a rename — see §5a. `onStateChange` keeps its `CardFormState` payload permanently; `onFormStateChange` is a new, additive prop carrying `VaultFormState` |
| — (fields take no props today) | `onStateChange` on the **field** components | new, additive; carries `VaultFieldState`. No collision — see §5a |
| `HyperswitchVaultFormHandle` | `VaultFormHandle` | alias — structurally identical today |
| `VaultSubmitResult`, `SafeVaultError`, `SafeVaultErrorCode` | unchanged | unchanged |

`CardNumberWidget === CardNumberField` must hold as **reference equality**, not merely structural
compatibility, so `===` checks, `React.memo` identity and devtools naming stay stable.

**`CardFormState` and its `onStateChange` prop are retained through the current major.** They may be
deprecated and removed only through an explicitly planned future major release, with release notes
and a migration note pointing at `onFormStateChange` + `canSubmit`. This ADR does **not** promise
they exist indefinitely, and it does not schedule their removal either — that is a decision for
whoever plans that major.

**Aliases are not a reversibility escape hatch.** Once `CardNumberField` is published it is a
published name with the same removal cost as `CardNumberWidget`; see § Consequences.

### 4. Merchant field state

The smallest state that supports a real merchant UI, and nothing more.

```ts
type VaultFieldStatus = 'empty' | 'incomplete' | 'complete';

type VaultField = 'cardNumber' | 'expiry' | 'cvc';

type VaultFieldErrorCode =
  | 'required'
  | 'invalid_card_number'
  | 'invalid_expiry'
  | 'invalid_cvc';

type VaultFieldState = {
  field: VaultField;
  status: VaultFieldStatus;
  focused: boolean;
  brand?: CardBrand;                                  // cardNumber only
  error?: { code: VaultFieldErrorCode; message: string };
};
```

#### Status is a three-way, not a four-way

| Status | Means, exactly |
|---|---|
| `empty` | No characters are currently entered. |
| `incomplete` | The field is non-empty and the current library validator does **not** accept it. |
| `complete` | The current library validator accepts the field. |

**There is deliberately no `invalid` member.** An earlier revision of this ADR proposed one, split
from `incomplete` by "enough input to decide validity". That boundary cannot be honoured by the
current validation layer: `makeCardNumberValidator`, `makeExpiryValidatorWith` and
`makeCvcValidatorWith` in `VaultFormOptions.res` each return `option<string>` — a single
accept/reject, with no third "not yet decidable" outcome to read. Variable-length PAN schemes make
inventing one actively unsafe: at 13 digits a Visa is acceptable and a Mastercard is not, so any
"enough input to decide" heuristic would have to re-derive scheme length rules the library already
owns, in a second place, and would report a different answer from the validator that actually gates
`submit()`.

A merchant that wants an invalid visual state derives it from **`error !== undefined`**. That is the
same condition the library itself uses to paint the field, so the merchant's chrome and the
library's chrome cannot disagree. No redundant `invalid` boolean is added.

#### `status` and `error` are orthogonal

`error` is present only when the library would **display** an error for that field — it follows the
existing visibility predicates in `CardStateReducer.res` (`touched`, and for CVC also not `active`),
so a merchant reading `error` sees exactly what the customer sees. `message` is the resolved,
localised string; `code` is a closed union so a merchant can substitute their own copy.

The two are independent, and that is the point:

| Situation | `status` | `error` |
|---|---|---|
| Untouched, empty | `empty` | absent |
| Half-typed, still focused | `incomplete` | absent (not yet displayed) |
| Half-typed, blurred | `incomplete` | present |
| Accepted by the validator | `complete` | absent |

#### `VaultFieldErrorCode` — four members, initial contract

`expired_card` is **not** in the initial contract. Current source exposes no stable
expired-versus-malformed distinction on the public path: `makeExpiryValidatorWith` returns one
message (`expiryInvalid`) for every non-accepted expiry, and `Validation.checkCardExpiry` is a
single boolean. Publishing `expired_card` would mean promising a distinction the validator cannot
currently make.

More specific additive codes — `expired_card` among them — may be introduced later **only** when
backed by a stable distinction in the validation result itself, not by re-deriving one at the
boundary. Adding a member to this union is an additive change and still requires release notes and
consumer tests (§ Consequences).

#### Field brand

`brand` is present on `cardNumber` only, and is the detected scheme, typed as `CardBrand` (§4a).

**Deliberately excluded**, absent a demonstrated merchant use case: `dirty`, `touched`, input
length, last four, BIN, formatted value, cursor position, raw value. Each is either a card-value
leak or a re-derivable detail; `touched`/`dirty` in particular are form-library concepts that only
matter to whoever owns validation timing, and the library owns that.

### 4a. `CardBrand`

**Detection coverage and artwork coverage are separate contracts.** A scheme the detector returns
must be reported as that scheme even when it renders the generic `waitcard` placeholder. Typing
`CardBrand` as "the schemes we ship artwork for" would silently downgrade five real schemes to
`unknown` and would couple a data contract to an asset decision.

#### Evidence — what the detector actually returns

The merchant-visible brand on the standalone path comes from
`CardFieldLogic.onCardNumberText` → `Validation.getAllMatchedCardSchemes` →
`matchedSchemes->Array.get(0)->Option.getOr("")`. `getAllMatchedCardSchemes` returns
`cardPatterns[].issuer` verbatim, and `cardPatterns` in
`shared-code/sdk-utils/validation/Validation.res` (pinned submodule, commit
`1669cc28955bf547b7fe35d6401ea47720019ff9`) declares exactly **13** issuers.
`node scripts/verify-icon-coverage.mjs` enumerates the same 13 and reports 8 with artwork and 5
intentional `waitcard` fallbacks:

| # | Detector string (`issuer`) | Artwork today | Proposed public `CardBrand` member |
|---|---|---|---|
| 1 | `Visa` | `visa` | `'visa'` |
| 2 | `Mastercard` | `mastercard` | `'mastercard'` |
| 3 | `AmericanExpress` | `americanexpress` | `'americanExpress'` |
| 4 | `DinersClub` | `dinersclub` | `'dinersClub'` |
| 5 | `Discover` | `discover` | `'discover'` |
| 6 | `JCB` | `jcb` | `'jcb'` |
| 7 | `CartesBancaires` | `cartesbancaires` | `'cartesBancaires'` |
| 8 | `Interac` | `interac` | `'interac'` |
| 9 | `Maestro` | **waitcard** | `'maestro'` |
| 10 | `UnionPay` | **waitcard** | `'unionPay'` |
| 11 | `RuPay` | **waitcard** | `'rupay'` |
| 12 | `SODEXO` | **waitcard** | `'sodexo'` |
| 13 | `BAJAJ` | **waitcard** | `'bajaj'` |
| — | `""` (no pattern matched) | waitcard | `'unknown'` |

#### The proposed union

```ts
type CardBrand =
  | 'visa'
  | 'mastercard'
  | 'americanExpress'
  | 'dinersClub'
  | 'discover'
  | 'jcb'
  | 'cartesBancaires'
  | 'interac'
  | 'maestro'
  | 'unionPay'
  | 'rupay'
  | 'sodexo'
  | 'bajaj'
  | 'unknown';
```

Fourteen members: all 13 detector schemes plus `'unknown'`. Members 9–13 have no dedicated artwork
today and are reported anyway.

**Spelling.** Lower-camel, matching this package's existing public string-union convention —
`brandIconMode` is `'standard' | 'animated' | 'hidden' | 'hideGeneric'`, and
`type-tests/consumer.tsx` already asserts that convention (`"Standard" is not one of the four
modes; the union is lower-camel`). The mapping is a **documented table, not a mechanical
transform**: `SODEXO` and `BAJAJ` are upper-case in sdk-utils' data, so a naive
lowercase-first-character rule would emit `sODEXO` / `bAJAJ`. The table above is the contract.

**Normalization must be case-insensitive.** `Validation.getCardBrand` — a different function, used
by `makeCardNumberValidator` and by `CardFieldLogic.onScanned` — returns upper-case `"RUPAY"` and
`"MASTERCARD"` for its BIN-range branches. Those values are **not reachable through the standalone
merchant surface today** (`CardScanTrigger.res` is referenced by no entry, and no component on the
standalone path calls `controller.onScanned`), but any future wiring of the scan path would feed
them into the same `brand` slot. The mapping must therefore key on a case-folded detector string,
not on an exact match.

#### Compatibility rule for a future detector scheme

1. **The coverage gate must force an explicit decision.** `scripts/verify-icon-coverage.mjs`
   already fails the build when sdk-utils gains an issuer that `CardIcons.res` does not classify.
   Phase 2 must extend that gate (or add a sibling gate) so a new issuer also fails until it is
   given an explicit **brand-mapping** decision — either a new public member or an explicit
   "maps to `unknown` for now". Artwork classification alone must not be enough to pass.
2. **Until a new public member is released, an unrecognised detector value maps to `'unknown'`.**
   The runtime never throws and never leaks the raw string through the typed `CardBrand` slot.
3. **Adding a documented brand member is an additive API change** — and still requires release
   notes and consumer type-tests, because a merchant's exhaustive `switch` over `CardBrand` will
   stop compiling. Additive is not silent.
4. **Removing or respelling a member is a major release** (§ Consequences).

#### The legacy `brand` is unaffected

Today's `CardFormState.brand` is a bare `string` carrying the detector value verbatim (`"Visa"`,
`"SODEXO"`, `""`). It **keeps that exact behaviour**, unchanged, on the existing `onStateChange`
prop. The normalized `CardBrand` union appears only on the new `VaultFieldState.brand` and
`VaultFormState.brand`, reached through the new `onFormStateChange` prop (§5a). No currently
published value changes spelling.

### 5. Merchant form state

```ts
type VaultSessionStatus = 'valid' | 'invalid';

type VaultFormState = {
  fieldsReady: boolean;
  sessionStatus: VaultSessionStatus;
  complete: boolean;
  submitting: boolean;
  canSubmit: boolean;
  brand: CardBrand;

  fields: {
    cardNumber: VaultFieldState;
    expiry: VaultFieldState;
    cvc: VaultFieldState;
  };
};
```

| Property | Precise meaning |
|---|---|
| `fieldsReady` | **Field registration only**: exactly one card-number field, one expiry field and one CVC field is currently mounted. Nothing about the session. Renamed from `ready` in the Phase 3 closure — see below. |
| `sessionStatus` | Whether the supplied `session` is currently usable for the standalone Hyperswitch vault flow. `'valid'` ⇔ `VaultFormCoordinator.readSession` yields `Ready(auth)`; `'invalid'` ⇔ it yields `Unusable(_)`. |
| `complete` | All three fields have `status === 'complete'`. |
| `submitting` | A confirmation is in flight. Mirrors the coordinator's `isSubmitting`, which is also what makes the inputs non-interactive. |
| `canSubmit` | `fieldsReady && sessionStatus === 'valid' && complete && !submitting`. The one member that answers "can I submit right now?"; the others exist to explain why it is false. |
| `brand` | The detected scheme for the form, typed as `CardBrand` (§4a). `CardBrand` already contains `'unknown'`, which is the value when nothing is detected — so the field is `CardBrand`, not `CardBrand \| 'unknown'`. |
| `fields` | The three `VaultFieldState` records from §4. |

#### Why the member is `fieldsReady`, not `ready`

**Amended in the Phase 3 closure.** The semantics below are unchanged and were re-confirmed; only
the name changed, before any release.

`ready` is ambiguous in exactly the direction that matters. A merchant reading `state.ready`
reasonably takes it to mean "the form is ready to submit" — which is what `canSubmit` means. The
evidence that the name was wrong is in this document: the table above needed a disclaimer sentence
("Nothing about the session") to stop the misreading. A member that needs a disclaimer to be read
correctly is misnamed, and `fieldsReady` needs none.

The alternative considered was folding the session back into `ready` so that
`canSubmit = ready && complete && !submitting`. That is rejected for the reason below, which is
about merchant UX rather than modelling taste. Nothing is released, so no compatibility argument
weighed against the rename.

#### Why session validity is split out of field readiness

An earlier revision of this ADR folded both conditions into `ready`. That is a merchant UX defect,
not a simplification. A merchant following the recommended disabled-button pattern
(`disabled={!canSubmit}`) never calls `submit()`, so with a bad session they would see a
permanently dead button and **no observable reason for it** — the only thing that reports
`invalid_session` is the `submit()` result they are not making.

Splitting the two makes the cause readable without calling `submit()`:

```tsx
if (state.sessionStatus === 'invalid') return <SessionProblem onRetry={refetchSession} />;
return <PayButton disabled={!state.canSubmit} />;
```

`submit()` remains authoritative. It must still return `invalid_session` when called with an
unusable session, exactly as it does today, regardless of what state reported beforehand.

#### There is no `initializing`

Session parsing is **synchronous and two-valued**. `VaultFormCoordinator.readSession` is a pure
function over `JSON.t` returning `Ready(string) | Unusable(string)`, called inside a
`React.useMemo1` in `VaultFormHost.useHost`. There is no promise, no fetch, no effect and no
third state anywhere on that path. `VaultSessionStatus` therefore has exactly two members, mapping
one-to-one onto the existing variant. No asynchronous initialization state may be invented; if a
future change introduces one, it must be proved from source before a member is added.

#### Relationship to `CardFormState`

`VaultFormState` carries strictly more information than today's `CardFormState`, in a different
shape: `cardNumberValid` / `expiryValid` / `cvcValid` become
`fields.<name>.status === 'complete'`, and `brand: string` becomes the `CardBrand` union (§4a).
That is a structural break, which is why it is delivered on a **new, differently named callback**
rather than by changing the existing one — see §5a.

One semantic difference is deliberate and must be documented rather than smoothed over. Today's
`CardFormState.complete` folds field-mounting into itself: a missing or duplicated widget forces
`complete = false` (`VaultFormHost.useHost` computes each per-field flag as
`countOf(kind) == 1 && <validity>`). In `VaultFormState` that concern lives in `fieldsReady`, so
`complete` reports only field validity. The conjunction a merchant actually wants is `canSubmit`,
which restores it. Anyone porting a `complete`-driven button to `VaultFormState` must move to
`canSubmit`, not to `complete`.

### 5a. Callback naming — legacy versus new

Three distinct props. They are named separately on purpose; none of them is a redefinition of
another.

| Prop | Where it lives | Payload | Status |
|---|---|---|---|
| `onStateChange?: (state: CardFormState) => void` | `HyperswitchVaultForm`, `HyperswitchVaultFormProvider` | `CardFormState` — `{ complete, cardNumberValid, expiryValid, cvcValid, brand: string }` | **Published today. Unchanged. Its payload, its emission timing and its `brand` spelling must stay byte-identical.** |
| `onFormStateChange?: (state: VaultFormState) => void` | `HyperswitchVaultForm`, `HyperswitchVaultFormProvider` | `VaultFormState` (§5) | **New, additive, not implemented.** |
| `onStateChange?: (state: VaultFieldState) => void` | the individual field components (`CardNumberField`, `CardExpiryField`, `CardCVCField`) | `VaultFieldState` (§4) | **New, additive, not implemented.** |

The third reuses the name `onStateChange` without collision because it sits on a **different
component**: the field components accept no props at all today (`type-tests/consumer.tsx` asserts
`// @ts-expect-error - widgets take no onStateChange in this phase`), so there is no existing
field-level `onStateChange` whose meaning could change. On the form components, where an
`onStateChange` already exists and already means `CardFormState`, the new payload gets the new name
`onFormStateChange`.

**The rule, stated once so it is not restated vaguely elsewhere:** `onStateChange` on a *form*
component means `CardFormState` and always will; `onFormStateChange` on a form component means
`VaultFormState`; `onStateChange` on a *field* component means `VaultFieldState`. A merchant may
pass both form-level callbacks at once, and both must fire.

### 6. Form handle and the hook

```ts
type VaultFormHandle = {
  submit(): Promise<VaultSubmitResult>;
  reset(): void;
  focus(field: VaultField): void;
};
```

Identical to today's `vaultFormHandle`. No form-level `blur()` in the initial contract: there is no
established merchant use case, "blur the form" is ambiguous when the merchant owns the layout, and
`VaultFieldHandle.blur()` already covers the concrete case. It can be added later additively.

No `getValue()`, `getCardNumber()`, `getState()` returning values, or any accessor that could return
card data — `type-tests/consumer.tsx` already holds negative controls for `getValue` and
`getCardNumber` and those must survive.

**`useHyperswitchVaultForm()` — future work, not implemented.** Proposed contract when built:
returns `VaultFormState` (§5) plus the same `VaultFormHandle` members, must be callable only inside
a provider (throwing the same actionable message widgets throw today), and must expose nothing that
the ref handle and `onFormStateChange` do not already expose. It is a different delivery mechanism
for the same state, never a wider one. It is listed here so the naming is decided, not because it
exists.

### 7. Field handle

```ts
type VaultFieldHandle = {
  focus(): void;
  blur(): void;
};
```

Structurally identical to today's `WidgetHandle`. **No `getValue()` or equivalent may exist**, at
any point, under any name. This is the load-bearing constraint of the whole design: if a field
handle can return its value, every other guarantee in §10 becomes advisory.

### 8. Result contract

#### Current, implemented, exact

```ts
type VaultSubmitResult =
  | { status: 'success';          token: string }
  | { status: 'validation_error'; error: SafeVaultError }
  | { status: 'not_ready';        error: SafeVaultError }
  | { status: 'error';            error: SafeVaultError };

type SafeVaultError = { code: SafeVaultErrorCode; message: string };

type SafeVaultErrorCode =
  | 'invalid_session'
  | 'invalid_card_data'
  | 'not_ready'
  | 'server_error'
  | 'unknown_outcome';
```

Four statuses, five codes. **Success carries the token and nothing else.** This is unchanged by this
ADR and is not a proposal — it is the shipped union, asserted by `verify:mapping` and by the
consumer type tests.

`unknown_outcome` remains the mapping for a thrown fetch, a timeout, or an abort landing after the
request started, because the vault may already have processed the card and the endpoint accepts no
idempotency key.

#### The no-throw contract, stated precisely

The contract is **not** the unqualified claim that `submit()` never throws. It is:

> All documented operational outcomes — validation failure, missing or duplicate fields, invalid
> session, HTTP failure, malformed response and unknown request outcome — resolve through
> `VaultSubmitResult`. Raw backend failures are not thrown to merchant code. Unexpected programming
> defects are not represented as stable business outcomes.

The distinction matters for two reasons. First, a merchant reading "never throws" may omit an error
boundary entirely; the guarantee they actually have is that no *operational* condition — the ones
enumerated in §2.9 of the baseline — reaches them as an exception. Second, promising that no
exception can ever escape would make any future defect a contract violation rather than a bug, and
would pressure the implementation to swallow programming errors into a business status, which is
strictly worse for diagnosis.

The one **intended** throw in the surface is unchanged and is not a `submit()` outcome: rendering a
field component outside its provider throws immediately with an actionable message
(`VaultWidgetContext.useRequired`). That is a wiring mistake surfaced at render, not an operational
result.

**Phase 0 changes no runtime behaviour here.** This is a wording correction to the contract, not a
change to `VaultFormCoordinator` or `VaultConfirm`.

#### Hypothetical future statuses — none accepted

Recorded so they are not mistaken for plans:

| Candidate | Status | Why not now |
|---|---|---|
| `network_error` | **rejected** | Would read as "the request never happened"; unprovable for a request that may have started |
| `retryable: boolean` on the public error | **rejected without a verified backend contract** | The transport's internal `retryableForStatus` is hard-coded `false`; publishing a field that is always `false` invites a retry loop |
| `retry()` / `reconcile()` on the handle | **rejected without a verified backend contract** | Needs an idempotency key or a lookup endpoint that has not been verified |
| `requestId` | **rejected without a verified backend contract** | No correlation id has been confirmed to exist on the PMS-confirm response |
| `session_expired` | **rejected without a verified backend contract** | Backend code `IR_24` is mapped to a message today, but no stable code-to-status contract has been verified; a merchant branching on it would branch on an unverified string |

Any of these becomes proposable the moment the backend contract is verified in writing. Until then
they stay out of the type.

### 9. Appearance model

Two layers, in this precedence order:

```
library defaults
    → form appearance          (semantic, form-wide)
    → field-specific styles    (per-field slots)
    → state-based field styles (FUTURE — not current functionality)
```

Later wins. Each layer is additive over the previous one; a merchant who sets `appearance` and
nothing else gets exactly today's behaviour.

**Layer 1 — semantic form appearance.** Today's `VaultFormAppearance` (16 optional tokens) is the
starting point and is kept. It stays semantic — `primaryColor`, `errorColor`, `borderRadius` — not a
style sheet. Semantic tokens are what make a two-line theme look coherent instead of half-styled,
and what let the library keep its focus/error state logic.

**Layer 2 — strongly typed per-field style slots.**

```ts
type VaultFieldStyles = {
  root?: StyleProp<ViewStyle>;        // outermost wrapper, including the error slot
  container?: StyleProp<ViewStyle>;   // the bordered input box
  input?: StyleProp<TextStyle>;       // the TextInput itself
  placeholder?: StyleProp<TextStyle>; // resting placeholder text
  label?: StyleProp<TextStyle>;       // floating label
  error?: StyleProp<TextStyle>;       // error message text
  helperText?: StyleProp<TextStyle>;  // helper text (requires the helper-text slot to exist)
  accessory?: StyleProp<ViewStyle>;   // brand icon / CVC icon container
};
```

#### The style bridge is an open implementation question, not a decided one

The **public contract** is settled: the merchant TypeScript boundary must expose React Native
`StyleProp<ViewStyle>` / `StyleProp<TextStyle>`, and must not expose opaque ReScript `Style.t`
(`styleObject` is `@genType.opaque` in `CardFormTypes.res` today and must stay that way).

The **implementation** is not settled, and Phase 0 does not settle it.

> Phase 2 must perform a focused implementation spike to prove the forwarding strategy, ref
> preservation, component identity, generated declarations and runtime behaviour before the styling
> API is shipped.

Candidate approaches, recorded without selecting one:

1. **ReScript props whose generated boundary is explicitly mapped to React Native style types** —
   the style prop is declared in ReScript and genType's emission for it is mapped to `StyleProp`.
2. **A typed TypeScript forwarding facade over the generated ReScript components** — the slots are
   declared in the hand-written `public.ts` layer and passed through, in the same place the
   `forwardRef` composition already lives.
3. **Another approach proven by a packed-consumer test** — anything that satisfies the acceptance
   conditions below.

Acceptance conditions the spike must demonstrate, all of them:

- a merchant-supplied style **actually reaches the rendered field and changes it at runtime** —
  not merely type-checks;
- `ref` forwarding still works and `VaultFieldHandle` is still attached;
- component identity is preserved, so the §3 reference-equality alias rule still holds;
- the published `dist/types` declarations show `StyleProp<…>` and no opaque handle, under
  `tsconfig.consumer.json` (the stock React Native compiler settings), verified against a **packed**
  tarball rather than against `src`;
- `check:generated` still passes, i.e. the committed genType output matches its ReScript source.

**A cast is not a proof.** Declaring the slot as `StyleProp<ViewStyle>` in a facade and casting it
across the boundary would type-check while the prop silently fails to reach the underlying view;
that is precisely the failure this spike exists to rule out. Until it is run, no ADR text may state
how the conversion is performed.

**Colours that carry meaning stay in layer 1.** A merchant who wants a different focused-border
colour sets `appearance.primaryColor`; they do not hand-write a focused variant into
`styles.container`, because the library owns when "focused" is true.

**Layer 3 — state-based styles are future advanced work, not current functionality.** The intended
shape is a callback form (`container?: StyleProp<ViewStyle> | ((state: VaultFieldState) => StyleProp<ViewStyle>)`),
which is why the slot type is defined first and the callback added later without changing the slot
names.

### 10. Safe native configuration

A closed allowlist, per field:

```ts
type VaultInputConfiguration = {
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selectionColor?: string;
  cursorColor?: string;
  autoFocus?: boolean;
  allowFontScaling?: boolean;
};
```

Everything on this list is presentation or automation metadata that cannot influence what value is
collected, formatted, validated or submitted.

**Explicitly forbidden pass-through** — these must never be accepted, not even as `unknown`, and the
type must reject them:

```
value            defaultValue     onChange         onChangeText
secureTextEntry  maxLength        keyboardType     autoCorrect
textContentType  autoComplete
```

Rationale per group:

- `value` / `defaultValue` / `onChange` / `onChangeText` — accepting any of these makes the field
  uncontrolled by the library and hands the merchant the card value. This is the whole point of the
  package.
- `secureTextEntry` / `maxLength` / `keyboardType` — these are validation and entry rules, owned by
  the library. `secureTextEntry` on the CVC and the 23/7/4 `maxLength` values are contract, not
  styling.
- `autoCorrect` — a card number must never be autocorrected.
- `textContentType` / `autoComplete` — **autofill behaviour remains library-controlled until it is
  verified on supported platforms.** Today `CardInput.res` fixes `autoComplete = off` and
  `textContentType = oneTimeCode`. Whether that is the right pairing for card autofill on current
  iOS and Android is an open question (§16), and it must be answered by device verification, not by
  a merchant prop.

Spreading arbitrary props onto the underlying `TextInput` is not supported and must not become
supported by accident — a `...rest` spread in any field component would silently defeat the
allowlist.

### 11. Render slots and advanced features — future additive only

None of these are Phase 0 implementation. They are recorded so they have decided names and cannot
arrive as ad-hoc props:

| Capability | Note |
|---|---|
| State-based style callbacks | §9 layer 3 |
| `renderBrandIcon(state)` | Must receive only `VaultFieldState`, never a value |
| `renderCvcIcon(state)` | Same constraint |
| `renderError(error)` | Already exists internally as `renderError` on the field components; a public version must take `{ code, message }`, never the field value |
| Label modes | e.g. floating (today's behaviour) vs static vs none |
| Safe form hook | `useHyperswitchVaultForm` (§6) |
| Animation configuration | The floating label is fixed at 200 ms, `useNativeDriver: false` today |
| Configurable error-display timing | Today: on blur, per the predicates in `CardStateReducer.res` |

Every one of these is **additive**: it adds an optional prop and changes no default. That is the
condition for shipping them without a major release — and, per § Consequences, additive still means
release notes and consumer tests, and still means the prop cannot later be removed without a major.

### 11a. Future implementation requirements

Binding conditions on whoever builds any part of this contract. None of them is satisfied today.

| # | Requirement |
|---|---|
| 1 | **Callback naming (§5a) is not negotiable at implementation time.** `onStateChange` on a form component keeps its `CardFormState` payload; the `VaultFormState` payload ships as the new `onFormStateChange` prop; the field components get their own `onStateChange` carrying `VaultFieldState`. Do not "upgrade" the existing prop, do not overload it by payload shape, and do not add a version flag. |
| 2 | Both form-level callbacks must be independently passable and both must fire, with `CardFormState` emission byte-identical to today's — payload, timing and raw `brand` spelling. A consumer type-test must assert that `onStateChange` still accepts a `CardFormState` handler and **rejects** a `VaultFormState` handler. |
| 3 | `VaultFieldStatus` must be derived from the same validator that gates `submit()` (§4). No second validity path. |
| 4 | `error` on `VaultFieldState` must be driven by the existing visibility predicates in `CardStateReducer.res` (§4), so merchant chrome and library chrome cannot disagree. |
| 5 | `sessionStatus` must be derived from `VaultFormCoordinator.readSession`'s existing two-valued result (§5). No new async state. |
| 6 | `CardBrand` mapping must be case-folded and table-driven (§4a), and the coverage gate must be extended to force a brand-mapping decision for any new sdk-utils issuer. |
| 7 | The style bridge must pass the Phase 2 spike's acceptance conditions (§9) — proven against a packed tarball, not a cast — before any styling API ships. |
| 8 | No `...rest` spread onto the underlying `TextInput`, in any field component, ever (§10). |

### 12. Behaviour compatibility

**Merchant-observable behaviour is part of the compatibility contract even when TypeScript keeps
compiling.** A change that leaves every type identical but makes the form behave differently is a
breaking change and is treated as one.

The covered surface:

| Area | What is frozen |
|---|---|
| Formatting | PAN grouping per scheme, expiry `MM / YY` rendering, CVC digit-only |
| Focus order | Semantic `number → expiry → CVC` regardless of visual placement |
| Auto-advance | Advance on a complete-and-at-max PAN, and on a complete expiry |
| Backspace navigation | Empty CVC → expiry, empty expiry → number, empty number → blur |
| Error visibility timing | On blur (per-field predicates), not while typing; CVC suppressed while active |
| Default appearance | The current default token values and the default fused/split layouts |
| Brand detection | sdk-utils scheme matching, including the clear-dependents behaviour on a brand change |
| Icon behaviour | Automatic brand mark and CVC hint; the four `brandIconMode` values |
| Reset behaviour | `reset()` clears values, validation state and displayed errors; during an in-flight request it is a no-op that does **not** cancel |
| Submission lifecycle | Single-flight (same promise instance), abort on unmount and on session/environment replacement, non-interactive fields while submitting |
| Result mapping | The table asserted by `scripts/verify-result-mapping.mjs` |
| Legacy state emission | What `onStateChange` emits as `CardFormState` — payload, timing and the raw `brand` string spelling (§5a) |

Any of these changing requires the same review a type change requires, plus a note in the release.
`scripts/verify-result-mapping.mjs` and `example/__tests__/vaultFormLifecycle.test.tsx` are the
existing executable guards; the formatting/focus/error-timing rows currently have no executable
guard and should get one before the field API expands.

**Derived-state compatibility.** Because `VaultFieldStatus` has no `invalid` member (§4), a
merchant's invalid chrome is derived from `error !== undefined`. The error **visibility predicates**
in `CardStateReducer.res` are therefore part of this frozen surface twice over: they already govern
what the customer sees, and under the new contract they also govern what the merchant observes.
Changing when an error becomes visible is a breaking change to the field-state contract, not only
to the library's own rendering.

---

## 13. Package boundary

Three entries, three audiences. This is already how the code is arranged; the ADR makes it a rule.

### Root (`.`)

**Ordinary merchant APIs only.** The ready-made form, the provider, the three fields, the hook when
it exists, and the types those need. Nothing on this entry may accept or return a card value.

### `/embedded`

**First-party / `hyperswitch-client-core` controlled card fields and their supporting types.** The
host owns the values, the form library, the registrations and the orchestration. This entry exists
because client-core needs presentation parity with the standalone form without giving up ownership
of its own React Final Form.

### `/vault`

**Low-level transport for advanced or first-party use.** `confirmPaymentMethodSession` takes raw
`cardDetails` by construction, so it is only appropriate for a caller that already holds card
values.

### Rules

- **Do not re-export `/embedded` or `/vault` from the root.** Currently true by construction in
  `src/public.ts`; it should become an asserted invariant, because a single convenience re-export
  would put a raw-PAN-accepting function one import away from the merchant Quick Start.
- **Do not present `/vault` in the merchant Quick Start.** It may appear in an "Advanced exports"
  section with its audience stated.
- A merchant importing `/embedded` or `/vault` is not blocked by the module system. The boundary is
  documentation plus review, and this ADR is where it is written down.

---

## 14. Scope exclusions

Explicitly **out of scope** for the new-card merchant API work. Each is a decision, not an oversight:

| Excluded | Why |
|---|---|
| Scan card | Needs a host-provided native capability; would cost the "no native module, no Pod install, no Codegen" property |
| Co-badge / network selection | Needs a viewport-aware popover and host chrome; currently injected by client-core through `/embedded` |
| Saved-card update | This surface collects a **new** card |
| Cardholder-name field | Not part of the PMS-confirm contract; a merchant collects it as their own ordinary input |
| Generic sensitive-data fields | The VGS-style "any field, any route" model — see §15 |
| Custom validators | The library owns card rules; a merchant-supplied validator is how a form starts accepting bad cards |
| Arbitrary vault routes | Fixed PMS-confirm path |
| Arbitrary transport endpoints, methods, headers, bodies, retry strategies | Fixed |
| Raw card getters | Any of them defeats the entire boundary |
| A PCI-compliance guarantee | See §16 |

---

## 15. Comparison with VGS Collect React Native

Read from source in `verygoodsecurity/vgs-collect-react-native` at `9521975` (v1.1.7), not from its
README: `src/index.tsx`, `src/components/VGSTextInputBase.tsx`, `src/components/VGSTextInput.tsx`,
`src/components/VGSCardInput.tsx`, `src/components/VGSCVCInput.tsx`,
`src/components/VGSTextInputState.ts`, `src/components/VGSInputType.ts`,
`src/collector/VGSCollect.ts`, `src/utils/logger/VGSCollectLogger.ts`,
`src/utils/validators/*`.

VGS is a **reference for merchant experience only**. No VGS implementation code is copied.

| # | Capability | VGS, as implemented | Our position | Classification |
|---|---|---|---|---|
| 1 | Field composability | Fields are independent components placed anywhere; there is no wrapper component at all — a `VGSCollect` instance is passed to each field as the `collector` prop | We already have independent fields under a provider; the target adds field-level state and styles | **Adopt** (the composability), **Improve** (a provider gives a typed React boundary and a mounted-set guarantee an instance prop cannot) |
| 2 | Compound namespace | `VGSTextInput.CardNumber` / `.CVC` / `.ExpDate` / `.CardHolder`, built with `Object.assign` on the base component | `HyperswitchVault.CardForm` / `.Form` / `.CardNumber` / `.Expiry` / `.CVC` (§2) | **Adopt** |
| 3 | Field registration | `collector.registerField(name, getSubmitValue, getValidationErrors, …)` in a mount effect; unregister on unmount; the field hands the collector a **getter that returns its raw value** | React context registration; the coordinator holds state and the field holds none; no value-returning getter is ever handed anywhere | **Improve** |
| 4 | Duplicate fields | `this.fields[fieldName] = …` — a second field with the same `fieldName` **silently replaces** the first, and its unmount deletes the entry for both | Exactly one of each required field, enforced before any value is read; a duplicate returns `not_ready` naming the field, with zero network requests | **Improve** |
| 5 | Styles | `containerStyle` + `textStyle` (typed `object`), plus `iconStyle`, `iconWidth/Height/Padding`, `iconPosition`, `containerHeight` per card/CVC field | Semantic form appearance + typed per-field slots (§9), `StyleProp<ViewStyle>` / `StyleProp<TextStyle>` rather than `object` | **Improve** |
| 6 | Per-field state | `onStateChange(state)` with `isValid`, `isEmpty`, `isDirty`, `isFocused`, `inputLength`, `validationErrors[]`, `fieldName`, and for cards `cardBrand`, **`cardBin`**, **`last4`** | `VaultFieldState` (§4): `status`, `focused`, `brand`, optional `{code, message}` | **Adopt** the per-field callback; **deliberately do not copy** `cardBin` and `last4` |
| 7 | Focus / blur | `VGSTextInputRef` with `focus()` / `blur()` via `useImperativeHandle` | `VaultFieldHandle` — identical two members, already shipped as `WidgetHandle` | **Adopt** |
| 8 | Validation customization | `validationRules?: ValidationRule[]` **replaces** the type's defaults entirely; rules are public classes (`LuhnCheckRule`, `LengthRule`, `PatternRule`, …) exported from the package root | Rules are library-owned; merchants customize label and message strings only | **Deliberately do not copy** |
| 9 | Field names | `fieldName: string`, merchant-chosen, mapped by a VGS Route; `submit()` also takes a `customRequestStructure` template with `{{ fieldName }}` placeholders | Closed field set (`cardNumber` / `expiry` / `cvc`) mapped to the fixed PMS-confirm body | **Deliberately do not copy** |
| 10 | Submission configuration | `submit(path, method, extraData, customRequestStructure)` plus `setCustomHeaders`, `setRouteId`, `setCname`; also `tokenize()`, `createAliases()`, `createCard(token)` | One `submit()`, fixed endpoint, method, headers and body | **Deliberately do not copy** |
| 11 | Result handling | `submit()` **throws** `VGSError` for invalid input or URL config, and rethrows network errors; a successful call resolves `{ status, response }` where `response` is the raw `fetch` `Response` | Every documented operational outcome resolves through a closed four-status union with five closed error codes and library-fixed messages; raw backend failures are not thrown to merchant code (§8) | **Improve** |
| 12 | Ambiguous outcomes | No distinct "the request may have been processed" outcome; a thrown fetch is rethrown to the caller | `unknown_outcome`, distinct from a server decision, with no automatic retry | **Improve** |
| 13 | Sensitive metadata in state | `cardBin` and `last4` are placed in the state object handed to `onStateChange`, i.e. into merchant state | No card-derived value in any state, callback, result or handle | **Deliberately do not copy** |
| 14 | Logging | `VGSCollectLogger.logRequest(url, headers, payload)` prints the request payload; for `submit()` that payload is the collected field data. `enable()` is a no-op when `NODE_ENV === 'production'`, so this is a development-mode capability | The package contains no `console` call at all | **Deliberately do not copy** |
| 15 | Generic sensitive fields | `VGSInputType` covers `text`, `ssn`, `date`, `cardHolderName` alongside card types; masks and rules are per-type and overridable | Card vaulting only (§14) | **Not applicable** |
| 16 | Tokenization/storage config | `VGSTokenizationConfiguration` with storage (`PERSISTENT` / `VOLATILE`) and alias formats, per field | Hyperswitch decides storage; there is nothing for a merchant to choose | **Not applicable** |
| 17 | CNAME / route / tenant config | `setCname()` with hostname validation, `setRouteId()`, tenant + environment in the constructor | Environment selects a fixed Hyperswitch host | **Not applicable** |
| 18 | Card Management API | `createCard(token, extraData)` against a separate CMP API | Different product surface | **Not applicable** |
| 19 | Brand-driven CVC adaptation | `collector.updateCvcFieldForBrand(brand)` pushes a new mask and new length rules into every registered `cvc` field | Same outcome, but the CVC rules follow the detected brand inside the shared logic — no cross-field mutation API is exposed | **Adopt** the behaviour, **improve** the mechanism |
| 20 | Autofill control | `autoComplete` and `importantForAutofill` are merchant props | Library-controlled until verified on device (§10) | **Improve**, provisionally — see the open question in §16 |

**Conclusion.** Not "Hyperswitch is better than VGS" — the two solve different problems, and VGS's
generality is a requirement of its product, not a defect. The narrow claim is:

> Hyperswitch should be equally customizable for card UI, while being simpler and harder to misuse
> for the fixed Hyperswitch card-vaulting flow.

Rows 1, 2, 6 and 7 are the customizability gap we should close. Rows 4, 8, 9, 10, 11, 13 and 14 are
where a fixed flow lets us remove a decision the merchant would otherwise have to get right.

---

## Alternatives considered

### A — Namespace only, drop the flat named exports

- For: one obvious way to import; smallest documentation surface.
- Against: a namespace object is a single import that defeats tree-shaking for merchants who use one
  field; it also breaks every existing integration.
- Why rejected: the flat names are already published and already correct.

### B — Named exports only, no namespace

- For: nothing new to build; nothing new to keep in sync.
- Against: the compound form is what the target snippets in the product brief use, and it is the
  shape VGS, and most field-kit SDKs, converge on. `HyperswitchVault.CardNumber` also removes the
  ambiguity of a bare `CardNumberField` import in a file that has three other card libraries in it.
- Why rejected: the ergonomic win is real and the cost is one `Object.assign`.

### C — Rename `*Widget` to `*Field` with a deprecation cycle

- For: one name per concept, sooner.
- Against: Phase 0 explicitly does not deprecate anything, and a deprecation warning in a React
  Native library reaches Metro and the device console — which this package deliberately never writes
  to.
- Why rejected: aliases cost nothing and a rename can be revisited at a major release.

### D — Adopt VGS's replaceable `validationRules` for parity

- For: maximum flexibility; direct feature parity on row 8.
- Against: it is the single largest misuse surface in the comparison. A merchant who replaces
  `PaymentCardRule` with a length check ships a form that accepts invalid cards and only finds out
  at the vault.
- Why rejected: contradicts the stated goal of being harder to misuse, and validation parity across
  Hyperswitch surfaces is a product guarantee.

### Do nothing — keep the current five names and no field state

- For: zero risk, zero cost.
- Why rejected: the gaps table in Context is the merchant-facing product priority.

---

## Consequences

### What becomes easier

- A merchant can style one field without a library change, and can drive their own per-field UI.
- The naming stops leaking implementation vocabulary (`Widget`, registry).
- New capabilities in §11 have decided names and a decided precedence, so they arrive additively.

### What becomes harder

- Two type families for form state (`CardFormState` and `VaultFormState`), and two form-level
  callbacks (`onStateChange` and `onFormStateChange`), for the whole of the current major.
- Two spellings for each field (`*Widget` and `*Field`) in documentation and in search results.
- Per-field style slots increase the visual-regression surface: `container` and `input` in
  particular can defeat the library's focus and error styling if a merchant sets a hard border
  colour. That is acceptable — it is their design — but it needs documenting rather than guarding.
- Every surface added here becomes something that cannot be withdrawn cheaply. See below.

### The publication rule

Before implementation and publication, this whole proposal is reversible: nothing has been shipped,
so any part of it can be redesigned or abandoned at no cost to a consumer.

**After any name, prop, callback, style slot or type in this contract is published:**

| Change | Cost |
|---|---|
| Removing it | **major release** |
| Changing its meaning | **major release** |
| Changing default merchant-visible behaviour (§12) | compatibility review, and **may require a major release** |
| Adding a member to a published closed union (`CardBrand`, `VaultFieldErrorCode`, `VaultFieldStatus`) | additive, but breaks exhaustive `switch` statements — release notes and consumer tests required |
| Adding a new optional prop | additive — release notes required |

**Optional does not mean removable.** An optional prop that a merchant has adopted is load-bearing
in their code; its optionality only means they were not forced to adopt it. Removing an optional
prop, an optional callback or an unused-looking style slot is a breaking change like any other.

**The namespace and the aliases are not special exceptions.** Once `HyperswitchVault` is exported,
`HyperswitchVault.CardNumber` is a published API path; once `CardNumberField` is exported, it is a
published name. Both carry exactly the same removal cost as `CardNumberWidget`. The earlier framing
of them as cheap-to-drop conveniences was wrong and is withdrawn.

### What we are locked into

Once published:

- The five canonical names, the six namespace members and the alias set in §3.
- The `onStateChange` / `onFormStateChange` / field-level `onStateChange` split in §5a — in
  particular, `onStateChange` on a form component means `CardFormState` for the life of this major.
- The member sets of `VaultFieldStatus`, `VaultFieldErrorCode`, `CardBrand` and
  `VaultSessionStatus`, and the detector-to-member mapping table in §4a.
- The slot names in §9, because layer 3 extends them rather than replacing them.
- The allowlist shape in §10 — adding to it is additive, removing from it is breaking.
- Every merchant-observable behaviour listed in §12.

### What we are locked out of

Before publication: nothing.

After publication: withdrawing any of the above within the current major. Specifically, we could not
consolidate `onStateChange` and `onFormStateChange` into one prop, could not drop the namespace to
simplify the surface, could not respell a `CardBrand` member, and could not narrow the style slots —
each of those is a major release.

Two things stay genuinely open because they are not published by this ADR: the style-bridge
implementation (§9, decided by the Phase 2 spike) and `useHyperswitchVaultForm`, which can remain
unbuilt indefinitely at no cost.

---

## Top failure modes

| # | Mode | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|------------|-------|
| 1 | A per-field style slot or a `...rest` spread reaches the underlying `TextInput` and lets a merchant set `value` / `onChangeText` | M | Very high — defeats the whole boundary | Closed allowlist (§10); no spread in any field component; a type-test negative control per forbidden prop | implementer |
| 2 | `VaultFieldState` grows a card-derived member (last4, BIN, formatted value) under merchant pressure, mirroring VGS row 13 | M | High | §4 excludes them by name; add type-test negative controls the way the result union already has them | reviewer |
| 3 | `onFormStateChange` is implemented by changing what the existing `onStateChange` emits, instead of as a separate prop | M | High | §5a names all three props explicitly; `CardFormState` payload, emission timing and raw `brand` spelling must stay byte-identical; a consumer type-test must assert `onStateChange` still takes `CardFormState` and rejects `VaultFormState` | implementer |
| 4 | The style bridge is "proved" by a cast: the slot type-checks but the style never reaches the rendered view | **H** | High | §9 forbids deciding the mechanism in Phase 0; the Phase 2 spike must demonstrate runtime effect, ref preservation, component identity and published declarations against a **packed** tarball before the styling API ships | implementer |
| 5 | ReScript `Style.t` leaks into a merchant-facing prop through a generated type | M | M | `@genType.opaque` stays on `styleObject`; consumer type-tests assert `StyleProp` in `dist/types` | implementer |
| 6 | The namespace object and the named exports drift to different component identities | L | M | One `Object.assign` over the canonical exports; a type-test asserting `HyperswitchVault.CardNumber === CardNumberField` | implementer |
| 7 | A convenience re-export puts `/vault` (raw `cardDetails`) on the root entry | L | Very high | §13 rule plus an asserted invariant in the packaging verification | implementer |
| 8 | Behaviour drifts (error timing, auto-advance, formatting) while types keep compiling | M | High | §12 declares it breaking; formatting/focus/error-timing need executable guards before the field API expands | implementer |
| 9 | `canSubmit` is read as authoritative and a merchant stops handling `not_ready` / `invalid_session` | M | M | Document it as a convenience; `submit()` keeps returning the full union in every state, and `sessionStatus` (§5) gives the disabled-button pattern an observable reason | documentation |
| 10 | A sdk-utils bump adds a detector scheme and it silently reports as `unknown` | M | M | §4a requires the coverage gate to be extended so a new issuer fails the build until it is given an explicit brand-mapping decision; artwork classification alone must not satisfy it | implementer |
| 11 | Scan support is wired into the standalone path later, and `getCardBrand`'s upper-case `"RUPAY"` / `"MASTERCARD"` fail to match the §4a mapping table | L | M | The mapping must key on a case-folded detector string from the outset, with a test covering both casings | implementer |
| 12 | An `invalid` field status is reintroduced, re-deriving scheme-length rules outside the validator | M | High | §4 records why it was removed; any such proposal must first produce a three-way outcome **from the validator itself**, not from a heuristic at the boundary | reviewer |

---

## Migration path off this decision

**Before implementation, the exit is free.** Nothing in this ADR is shipped. If the target proves
wrong now, it is redesigned or abandoned and no consumer is affected. That is the window in which
this document should be argued with.

**After publication, there is no cheap exit.** The earlier claim that the namespace, the aliases and
the optional props could simply be dropped to restore today's design was wrong. Each of them would
be a removal from a published surface, which is a major release — the same cost as removing anything
else. Publishing is the one-way step, and it is one-way for *every* item, not only for names.

What that leaves as a realistic migration path off the decision, after publication:

- **Stop extending it.** The §11 future capabilities can be declined indefinitely; declining to add
  is free.
- **Deprecate, do not remove.** A surface that proves wrong can be documented as deprecated,
  excluded from examples and left working, with removal deferred to a planned major.
- **Plan the major.** Removing the namespace, consolidating the two form-level callbacks, or
  retiring `CardFormState` / `onStateChange` all belong in one explicitly planned major release with
  release notes, a migration guide and updated consumer type-tests — not in a patch.

The practical consequence: **§3, §4, §4a, §5, §5a and §10 must be settled before any of them is
built**, because that is the last point at which they are free to change. The style bridge (§9) is
deliberately excluded from that list — its *contract* is settled, and only its implementation waits
on the Phase 2 spike.

---

## 16. Open questions requiring product or architecture input

1. **The `CardBrand` public spelling.** The member set is settled by evidence (§4a: all 13 detector
   schemes plus `unknown`); the *spelling* is a judgement call. Recommendation: the lower-camel
   table in §4a, matching the existing `brandIconMode` convention. The two upper-case sdk-utils
   values (`SODEXO`, `BAJAJ`) map to `'sodexo'` and `'bajaj'` by table, not by rule — confirm that
   is preferred over preserving the raw data spelling.
2. **Autofill.** `autoComplete = off` with `textContentType = oneTimeCode` is what ships today. Is
   that the intended card-autofill behaviour on current iOS and Android? Recommendation: keep it
   library-controlled and answer it with the manual device checklist before considering any
   merchant-facing prop.
3. **When `CardFormState` and its `onStateChange` prop are retired.** They are retained for the
   whole of the current major (§3). Recommendation: do not schedule removal now; revisit when a
   major is actually planned, and only with a migration guide pointing at `onFormStateChange` and
   `canSubmit`. This ADR deliberately does not promise they exist indefinitely.
4. **Whether `/embedded` and `/vault` should be import-blocked rather than documented.** Not
   currently possible without a runtime guard the package has no appetite for. Recommendation:
   documentation plus a packaging invariant that the root never re-exports them.
5. **Extending the coverage gate to force brand-mapping decisions** (§4a rule 1). This is a build
   change, not an API change, but it needs an owner. Recommendation: fold it into the Phase 2 work
   that introduces `CardBrand`, so the union and its gate land together.

Resolved during the Phase 0 correction pass, and no longer open: whether field readiness should fold in
session validity (it must not — §5 now separates `sessionStatus`), and whether `VaultFieldStatus`
should carry an `invalid` member (it must not — §4).

### On PCI and data-flow wording

The documentation must state the boundary narrowly and accurately. The governing wording, to be used
consistently wherever this boundary is described:

> **Scope: the standalone root-entry flow only** — `HyperswitchVaultForm`, and
> `HyperswitchVaultFormProvider` with the card-number / expiry / CVC field components.
>
> Raw card values are processed inside library-managed React Native state running in the merchant
> application process. In that flow the supported merchant API does not expose those values through
> merchant callbacks, handles, public form state, submission results or library logs, and the
> standalone flow does not send them to the merchant backend. This is an API/data-flow guarantee,
> not native-process isolation, physical memory zeroization, automatic PCI compliance or a
> PCI-scope determination.
>
> The guarantee is scoped to that flow and does not extend to `/vault`, to `/embedded`, or to a
> merchant who reaches past the supported API.

Three claims are specifically forbidden because they are stronger than the implementation supports:

| Forbidden claim | Why it is wrong |
|---|---|
| "card values never enter merchant application code" / "pass from native inputs to the vault" | The fields are React Native components. PAN, expiry and CVC live in `CardStateReducer` state and in `TextInput` props **inside the merchant's own JS bundle and process**. The guarantee is that the *supported API* does not hand them to merchant code — not that they are absent from it. |
| any claim of memory zeroization | Values live in React state and native input buffers. Nothing erases them. |
| "this reduces your PCI scope" | A scope determination is the merchant's assessor's to make, on the whole integration. |

**Unchanged and not weakened:** `/vault` accepts raw card details by design. `confirmPaymentMethodSession`
takes a `cardDetails` record containing the PAN, expiry and CVC, so any caller of that entry is
handling raw card data directly and is outside every guarantee above. That warning stands exactly as
recorded in §13 and in the baseline, and the corrected wording above does not soften it.
