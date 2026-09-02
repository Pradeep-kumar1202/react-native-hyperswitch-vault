# Review of `docs/merchant-api-reference.md` and the merchant-facing API

**Reviewed against:** the packed declarations in `dist/types/` (built 2026-09-02), the ReScript
sources they are generated from, and `src/standalone-entry.mjs`. Scope: everything a merchant can
pass, call, read, or observe. The merchant deliverable is the composed layout with
session in → `tokenize()` → token out.

**Status:** the reference has since been rewritten around that deliverable with every item in §1–§3
applied; both docs gates (`verify-docs`, `verify-flow-docs`) pass. §1–§3 are kept as the record of
what changed and why.

**Verdict on the document:** it is well-structured and almost entirely accurate, but it has **six
factual errors**, **four stale sections** left by the credential change, and **seven behaviours that
are real and undocumented**. Two of the factual errors would send a merchant down the wrong branch
(`forbidden_card_data` vs `unsupported_configuration`; `not_ready` vs `invalid_session`).

**Verdict on the API itself:** sound, closed, and card-safe — but there are naming choices that leak
the implementation language (`type_`) and one contract that was stated as localisable and is not
(`error.message`). See §6.

---

## 1. Factual errors in the document (fix before sharing)

| # | Where (§ / approx. line) | Document says | Code does | Fix |
| --- | --- | --- | --- | --- |
| E1 | `cardholderName` → *Invalid combinations* (~1336) | Passing `cardholderName` in `collect`/`omit` mode is refused with **`forbidden_card_data`** | `VaultFormCoordinator.resolveCardholderName` → `Error()` → **`unsupported_configuration`** | Change the code name. `forbidden_card_data` is reserved for card keys inside `paymentMethodData` |
| E2 | *Result types → `VaultTokenizeResult`* table (~604) | `not_ready` = "No session, or a required field is not mounted" | No session → `status: 'error'`, `code: 'invalid_session'` (`runTokenize`: `Unusable(message) => tokenizeFailedWith(#invalid_session, …)`). `not_ready` is only for fields/in-flight | Move "no session" to the `error` row. The *Session present vs absent* section already says `invalid_session` — the two sections contradict each other |
| E3 | *Error codes* prose (~682) | "`message` is always safe to display. It is drawn from the library's own strings — **which you can translate through `localisation`**" | Only the 8 field-validation messages and 2 labels are localisable. The 13 `SafeVaultError` messages in `VaultResult.res` (`"This session can no longer be used."`, `"The payment could not be completed."`, …) are fixed English with **no** localisation hook | Either add `localisation.errorMessages` (recommended, R7 below) or correct the sentence to "library-owned English strings; map on `code` to localise" |
| E4 | *Error codes* table, `unknown_outcome` (~677) | "Timeout or dropped connection" | The merchant confirm path sets **no timeout** (`timeoutMs` exists only on the internal orchestration input). `unknown_outcome` = thrown fetch / abort / unmount | Drop "timeout" or add a `timeoutMs` input |
| E5 | *`session` and `MerchantSession`* (~380) | "The library reads only `vault_details.vault_data.sdk_authorization`" | It also reads and **requires** `vault_details.vault_type === 'hyperswitch'` (`readSession`); any other `vault_type` → `invalid_session` "uses a card vault this component does not support" | Document `vault_type`. A merchant on a VGS profile who passes their session here gets a confusing refusal |
| E6 | *Option A / Option B* examples (~40, ~100) | `paymentId: session.payment_id as string`, `sdkAuthorization: session.sdk_authorization as string` | `MerchantSession` is the **session-tokens** response; the payment-intent credential is a **different** secret from the vault's `vault_details.vault_data.sdk_authorization` (the transport comments say so explicitly). The example teaches merchants to pass the wrong credential, and the `as string` casts hide that the type does not have these members | Fetch `{session, paymentId, sdkAuthorization}` from the backend as three named values and drop the casts |

## 2. Stale after the credential change (ADR-0009)

| # | Where | Now says | Should say |
| --- | --- | --- | --- |
| S1 | *Eligibility* type block (~1262) | `readonly sdkAuthorization: string;` | `sdkAuthorization?`, `publishableKey?`, `clientSecret?` — the *Input types* table (line 197) was updated, this block was not |
| S2 | *Required inputs by task → direct flow* | `sdkAuthorization` — yes | "one credential shape: `sdkAuthorization`, or `publishableKey` + `clientSecret`" |
| S3 | *Required inputs by task → vault flow* | same | same |
| S4 | *Additionally required by configuration* | "`paymentId` and `sdkAuthorization` inside `VaultEligibilityConfig`" | "`paymentId` and one credential shape" |

## 3. Real behaviour that the document does not mention

| # | Behaviour | Where in code | Why a merchant needs it |
| --- | --- | --- | --- |
| U1 | **A form mounted with a usable `session` refuses `cardSource: {type_:'direct'}`** with `unsupported_configuration` | `runConfirmPayment` → *"THE MOUNT AND THE OPERATION MUST AGREE"* | A merchant who reuses one mounted form for both flows will hit this and the doc gives no hint |
| U2 | `cardSource.session` is what the **vault confirm** uses; the `session` **prop** is what `tokenize()` uses (and drives `sessionStatus`) | `VaultCardSource.res` comment; `readSession` on both | Two sessions can be in play; the doc never says which wins where |
| U3 | `reset()` is a **no-op while an operation is in flight** | `useMachinery.reset` | The doc says it "clears everything" |
| U4 | `tokenize()` during an in-flight `confirmPayment()` (and vice-versa) returns `not_ready` with *"Another card operation is already in progress."* | `tokenize`/`confirmPayment` slot logic | Only same-operation repeats return the same promise; the cross case is a refusal |
| U5 | `eligibilityRequired: true` on the confirm input runs the check **even without the `eligibility` prop**, and the probe's fail-open policy applies to the gate too | `eligibilityGate` | The *Eligibility* section only describes the live probe |
| U6 | Eligibility probe is silently skipped when `VaultEligibilityConfig` has no complete credential | `VaultFormHost` | A misconfigured probe looks like "eligibility never fires" |
| U7 | `canSubmit` is `false` while `sessionStatus === 'invalid'` (a session was passed but unreadable) even for a direct confirm | `formStateOf`: `sessionStatus !== #invalid` | Explains a dead Pay button when a bad session prop is present |

## 4. Verified as correct (no action)

Every count in the *Public API surface* tables (16 tokens, 7 slots, 8 options, 14 brands, 5 field
codes, 8 error codes, 9 labels, 8 messages, 5 next-action kinds, 6 statuses); every default in the
*Defaults reference* (checked against `buildTheme`, `defaultLabels`, sdk-utils `defaultLocale`,
`CardFieldOptions` defaults, `CardFormView` defaults); the co-badge threshold (16 digits); the
test-ID list; the accessibility defaults; `complete`/`valid`/`canSubmit` semantics; `errorDisplay`
governing message + border + colour; the fused layout's single error line; the `*Widget` identity
claim; "no runtime constants or utilities on the surface".

---

## 5. The complete merchant-exposed surface

Everything below is importable from `@juspay-tech/react-native-hyperswitch-vault` (root). Names in
**bold** are the ones a merchant is expected to touch; the rest are types for narrowing.

### 5.1 Runtime exports

| Export | Kind | Notes |
| --- | --- | --- |
| **`HyperswitchVaultForm`** | component | ready-made 3–4 field form |
| **`HyperswitchVaultFormProvider`** | component | state/security owner for a composed layout; requires `children` |
| **`CardNumberField`**, **`CardExpiryField`**, **`CardCVCField`**, **`CardholderNameField`** | components | composed fields; `*Widget` aliases are the same objects |
| `HyperswitchVault` | namespace object | `CardForm`, `Form`, `CardNumber`, `Expiry`, `CVC`, `CardholderName` |

### 5.2 `HyperswitchVaultForm` props (Provider = same minus the four marked †, plus `children`)

| Prop | Type | Required | Default | How to pass |
| --- | --- | --- | --- | --- |
| **`environment`** | `'production' \| 'sandbox' \| 'integration'` | yes | — | literal |
| **`session`** | `MerchantSession` = `{vault_details?: {vault_type?: string; vault_data?: {sdk_authorization?: string}}; [k: string]: unknown}` | for `tokenize()` and vault confirms | absent | the `/session_tokens` body verbatim; `vault_type` must be `'hyperswitch'` |
| **`appearance`** | `VaultFormAppearance` (16 optional tokens, §5.6) | no | library theme | object |
| **`localisation`** | `{labels?, validationMessages?, isRtl?}` | no | English, LTR | object |
| `layout` † | `'stacked' \| 'inline'` | no | `'stacked'` | literal |
| `fieldArrangement` † | `'separate' \| 'fused'` | no | `'separate'` | literal |
| `fieldOptions` † | `{cardNumber?, expiry?, cvc?, cardholderName?}` of §5.7 | no | `{}` | grouped object |
| `fieldStyles` † | `{cardNumber?, expiry?, cvc?, cardholderName?}` of §5.8 | no | `{}` | grouped object |
| **`cardholderName`** | `'collect' \| 'external' \| 'omit'` | no | `'collect'` | literal |
| **`enabledCardSchemes`** | `string[]` — exact sdk-utils names (`Visa`, `Mastercard`, `AmericanExpress`, `DinersClub`, `Discover`, `JCB`, `CartesBancaires`, `Interac`, `Maestro`, `UnionPay`, `RuPay`, `SODEXO`, `BAJAJ`) | no | `[]` = no restriction | array |
| `eligibility` | `{paymentId; sdkAuthorization?; publishableKey?; clientSecret?; appId?; endpoint?}` | no | absent | object |
| `vaultEndpoint` | `{baseUrl: string}` | no | environment host | https, or http on loopback outside production |
| `disabled` | `boolean` | no | `false` | |
| `accessible` | `boolean` | no | platform default | |
| `unstyled` | `boolean` | no | `false` | |
| **`onFormStateChange`** | `(state: VaultFormState) => void` | no | absent | callback; fires on mount and on structural change |
| `ref` | `VaultFormHandle` | — | — | `useRef<VaultFormHandle>(null)` |

### 5.3 Composed field props (each of the four fields)

`styles?: VaultFieldStyles` (expiry: `VaultExpiryStyles`), the flattened options of §5.7,
`onStateChange?: (state) => void` with the field's own state type, `ref: VaultFieldHandle`
(`{focus(); blur()}`).

### 5.4 `VaultFormHandle`

| Method | Signature | Returns |
| --- | --- | --- |
| **`confirmPayment`** | `(input: VaultPaymentConfirmInput) => Promise<VaultPaymentResult>` | payment outcome; **never** a token |
| **`tokenize`** | `() => Promise<VaultTokenizeResult>` | the **only** route to a token; needs the `session` prop |
| `reset` | `() => void` | no-op while in flight |
| `focus` | `(field: 'cardNumber' \| 'expiry' \| 'cvc' \| 'cardholderName') => void` | |

### 5.5 `VaultPaymentConfirmInput`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| **`cardSource`** | `{type_: 'vault'; session: MerchantSession; confirmTokenMode?: 'payment_token' \| 'vault_card'} \| {type_: 'direct'}` | yes | direct carrying `session`/`confirmTokenMode` → `unsupported_configuration`; vault without `session` → `invalid_session` |
| **`paymentId`** | `string` | yes | |
| **`sdkAuthorization`** | `string` | one credential shape | wins when non-blank |
| `publishableKey` + `clientSecret` | `string` + `string` | the other shape | `api-key` header + body `client_secret` |
| `cardholderName` | `string` | only in `external` mode | otherwise `unsupported_configuration` |
| `paymentMethodType` | `'credit' \| 'debit'` | no | default `credit` on the wire |
| `paymentMethodData` | `{billing?: {address?: {firstName?, lastName?, line1?, line2?, line3?, city?, state?, country?, zip?}, email?, phone?: {number?, countryCode?}}, nickName?}` | no | deep-scanned; any card key → `forbidden_card_data` |
| `customerAcceptance` | `{acceptanceType: 'online' \| 'offline'; acceptedAt: string; online: {userAgent?}}` | mandates | |
| `browserInfo` | `{userAgent?, acceptHeader?, language?, colorDepth?, screenHeight?, screenWidth?, timeZone?, javaEnabled?, javaScriptEnabled?, deviceModel?, osType?, osVersion?}` | no | |
| `returnUrl` | `string` | redirects | |
| `paymentType` | `'new_mandate' \| 'setup_mandate'` | mandates | |
| `email` | `string` | no | |
| `eligibilityRequired` | `boolean` | no | runs the gate before confirm |
| `appId` | `string` | no | `x-app-id` |
| `endpoint` | `{baseUrl}` | no | payment host |
| `vaultEndpoint` | `{baseUrl}` | no | tokenization host (vault flow) |

### 5.6 `VaultFormAppearance` (all optional)

`primaryColor #0570DE` · `textColor #1A1A1A` · `errorColor #DF1B41` · `placeholderColor #6B7280` ·
`backgroundColor #FFFFFF` · `borderColor #E6E6E6` · `borderRadius 8` · `borderWidth 1` ·
`fontFamily System` · `inputHeight 48` · `gap 12` · `fontScale 1` · `placeholderTextSizeAdjust 0` ·
`errorTextSizeAdjust 0` · `errorMessageSpacing 4` · `brandIconMode 'standard'`.

### 5.7 Field options

Shared: `placeholder?`, `label?`, `labelBehavior?: 'none' | 'static' | 'floating'` (default floating),
`errorDisplay?: 'none' | 'inline'` (default inline), `accessibilityLabel?`, `accessibilityHint?`,
`testID?`, `unstyled?`. Card number adds `brandIconMode?: 'standard' | 'animated' | 'hidden' |
'hideGeneric'`; CVC adds `cvcIcon?: 'none' | 'default'`.

### 5.8 Style slots

`root`, `container`, `input`, `placeholder`, `label`, `error`, `accessory` — real RN `StyleProp`
values; expiry has no `accessory`.

### 5.9 Localisation

`labels`: `cardNumberPlaceholder "Card number"`, `cardNumberFloatingLabel "Card number"`,
`expiryPlaceholder "MM / YY"`, `expiryFloatingLabel "Expiry"`, `cvcPlaceholder "CVC"`,
`cvcFloatingLabel "CVC"`, `cardholderNamePlaceholder "Name on card"`,
`cardholderNameFloatingLabel "Name on card"`, `selectCardBrandLabel "Select a card brand"`.
`validationMessages`: `cardNumberRequired "Card Number cannot be empty"`, `cardNumberInvalid "Card
number is invalid."`, `expiryRequired "Card expiry date cannot be empty"`, `expiryInvalid "Your
card's expiration date is invalid."`, `cvcRequired "CVC Number cannot be empty"`, `cvcInvalid "Your
card's security code is invalid."`, `unsupportedCard "Card brand is not supported."`,
`cardNotEligible "This card is not accepted for this payment."`. `isRtl: false`.

### 5.10 What comes back

**`VaultPaymentResult`**: `succeeded` · `processing` · `requires_customer_action {nextAction}` ·
`failed {error}` · `validation_error {error}` · `not_ready {error}`.
**`VaultTokenizeResult`**: `success {token}` · `validation_error` · `not_ready` · `error`.
**`SafeVaultError`** `{code, message}`, codes: `invalid_session`, `invalid_card_data`, `not_ready`,
`forbidden_card_data`, `unsupported_configuration`, `card_not_eligible`, `server_error`,
`unknown_outcome`. Messages: 13 fixed English strings (E3).
**`VaultNextAction`**: `type_` ∈ `three_ds_invoke | third_party_sdk_session_token |
display_bank_transfer_information | invoke_ddc | redirect_to_url`, `redirectUrl?`, `threeDs?`,
`ddc?`, `sessionToken?`.
**`VaultFormState`**: `fieldsReady`, `sessionStatus: 'valid' | 'invalid' | 'absent'`, `complete`,
`valid`, `submitting`, `canSubmit`, `brand` (14-member union), `isCoBadged`, `eligibility: 'unknown'
| 'pending' | 'allowed' | 'denied'`, `networkError?`, `fields.{cardNumber, expiry, cvc,
cardholderName?}` each `{field, status: 'empty' | 'incomplete' | 'complete', valid, touched,
focused, error?: {code, message}}` (+ `brand`, `isCoBadged`, `eligibility` on the number).

### 5.11 Test IDs

`CardNumberInputTestId`, `ExpiryInputTestId`, `CVCInputTestId`, `CardholderNameInputTestId`
(overridable via `testID`); `CardFieldErrorTestId`, `CardNetworkTriggerTestId`,
`CardNetworkHeadingTestId`, `CardNetworkBackdropTestId`, `CardNetworkOption-<Scheme>`,
`ScanCardButtonTestId` (fixed).

### 5.12 What the RN checkout SDK merchant (client-core) sees — for completeness

Nothing vault-specific. Vaulting is decided by the profile's `vaulting_action` and the session's
`vault_details`; the merchant's existing config (`splitCardFields`, `paymentMethodLayout.cardBrandIcon`
/ `cvcIcon`, `placeholder.*`, theme, locale, `displaySavedPaymentMethodsCheckbox`,
`alwaysSendCustomerAcceptance`, `hideCardNicknameField`, `customEndpoints`, credentials) keeps its
meaning. Events: `FORM_STATUS` now includes card validity; **`PAYMENT_METHOD_INFO_CARD` is no longer
emitted for new cards**. See `NEW-CARD-VAULTING-ARCHITECTURE.md` §6.1.

---

## 6. API-shape recommendations (before the surface is frozen)

Ordered by how much a merchant would notice.

| # | Recommendation | Why | Cost |
| --- | --- | --- | --- |
| **R1** | Rename the discriminants `type_` → **`type`** on `VaultPaymentCardSource` and `VaultNextAction` using ReScript's `@as("type")` on the record field (or `kind`, matching the facade's `CardStrategy.kind`) | `type_` is a ReScript reserved-word workaround leaking into a merchant TypeScript API; Hyperswitch's own API spells it `next_action.type` | Small: two `@as` attributes, regenerate, update `verify-card-source`/`verify-result-mapping`, docs, examples. Pre-1.0 is the moment |
| **R2** | Rename the prop `cardholderName` (a **mode**) → **`cardholderNameMode`**; keep `cardholderName` on the confirm input for the **value** | The same word means two different things on the prop and on the input; the doc has to explain it in a table | Small; alias the old prop for one release |
| **R3** | Make `enabledCardSchemes` a closed union `VaultCardScheme[]` instead of `string[]` | The 13 names exist as a closed set; today `"American Express"` compiles and silently never matches | Small; export the union |
| **R4** | Rename `MerchantSession` → **`VaultSession`** and document the `vault_type: 'hyperswitch'` requirement (E5) | "MerchantSession" says nothing about what it is; it is the session-tokens body | Small; alias the old name |
| **R5** | Decide the credential shape for 1.0: keep the flat `sdkAuthorization? / publishableKey? / clientSecret?` (current, backward-compatible) **or** a union `credential: {sdkAuthorization} \| {publishableKey, clientSecret}` | The flat shape cannot prove at compile time that a credential is present; the union can, but breaks every caller | Team decision; either is defensible if the precedence rule is documented (it is) |
| **R6** | Give `SafeVaultError` messages a localisation hook: `localisation.errorMessages?: Partial<Record<SafeVaultErrorCode, string>>` | E3 — the doc promised translatability the API does not have | Medium: thread the map through `VaultResult` constructors |
| **R7** | Add `timeoutMs?` to the merchant confirm input, or remove "timeout" from the docs (E4) | The orchestration entry has it; the merchant entry does not | Small |
| **R8** | Consider `VaultPaymentResult` splitting SDK states from payment states: `{status: 'succeeded' \| 'processing' \| 'requires_customer_action' \| 'failed'}` vs a separate refusal shape for `validation_error` / `not_ready` | Mixing intent statuses with SDK gate outcomes in one `status` union is the one thing merchants reading Hyperswitch's own status vocabulary will trip on | Larger; optional — the current union is workable and documented |
| **R9** | Examples: fetch `{session, paymentId, sdkAuthorization}` as three named values; remove every `as string` cast (E6) | Casts in a reference doc teach merchants to bypass the type | Docs only |

---

## 6b. What the root exposes that only client-core needs — and the alternative

> **Implemented on 2026-09-02 as ADR-0010.** The `./host` entry exists, the root is narrowed as
> described under "The alternative", payment-methods imports from `./host`, and the gates listed in
> the ADR hold. The table below is kept as the record of what moved. R10 (six-code tokenize error
> union) is implemented by the same change; R11–R16 remain open.

The merchant's deliverable is `session → fields → tokenize() → token`. Measured against that, the
package root carries a second, larger API that exists for one consumer: the payment-methods facade
under client-core. None of it is harmful to a merchant, and none of it changes what `tokenize()`
does — but all of it lands in the merchant's autocomplete, in `SafeVaultErrorCode`, and in this
reference.

### What is host-only today

| Surface | Members | Used by | Meaning for a `tokenize()` merchant |
| --- | --- | --- | --- |
| Handle method | `confirmPayment(input)` | payment-methods | none — a second operation that can charge |
| Confirm input types | `VaultPaymentConfirmInput`, `VaultPaymentCardSource`, `VaultCardSourceType`, `VaultConfirmTokenMode`, `VaultPaymentMethodType`, `VaultPaymentType`, `VaultAcceptanceType`, `VaultHostBrowserInfo`, `VaultHostCustomerAcceptance`, `VaultHostOnlineAcceptance`, `VaultHostPaymentMethodData`, `VaultHostBilling`, `VaultHostBillingAddress`, `VaultHostPhone` | payment-methods | none |
| Confirm result types | `VaultPaymentResult`, `VaultPaymentStatus`, `VaultNextAction`, `VaultNextActionType`, `VaultThreeDsData`, `VaultDdcData`, `VaultSessionTokenData` | payment-methods | none |
| Provider prop | `eligibility: VaultEligibilityConfig` | payment-methods | ignored by `tokenize()` |
| Provider prop value | `cardholderName: 'external'` | payment-methods | identical to `'omit'` for `tokenize()` |
| Error codes | `forbidden_card_data`, `card_not_eligible` in `SafeVaultErrorCode` | `confirmPayment()` only | can never be returned, but every exhaustive `switch` must handle them |
| State members | `eligibility` on `VaultFormState` and `VaultCardNumberState`; `VaultEligibilityStatus` | payment-methods | always `'unknown'` |
| Localisation key | `validationMessages.cardNotEligible` | `confirmPayment()` only | never shown |
| Legacy aliases | `CardNumberWidget`, `CardExpiryWidget`, `CardCVCWidget`, `CardholderNameWidget`, `WidgetHandle`, `HyperswitchVaultFormHandle`, `HyperswitchVaultFormProps`, `VaultCardNumberStyles`, `VaultCVCStyles`, `VaultFormBrandIconMode`, the `HyperswitchVault` namespace | payment-methods re-exports the `*Widget` names and `WidgetHandle`; nobody else | second spelling of the same thing |
| Ready-made form | `HyperswitchVaultForm` + `layout`, `fieldArrangement`, `fieldOptions`, `fieldStyles`, `VaultFormLayout`, `VaultFieldArrangement`, `VaultFormFieldOptions`, `VaultFormFieldStyles` | re-exported by payment-methods, rendered by nobody | optional convenience |

Roughly **25 of the ~60 exported type names** and one of the four handle methods are host-only.

### Keeping it as it is — acceptable

The extra surface is inert for `tokenize()`, every host-only member is documented as such, and the
`verify-merchant-only` / `verify-event-surface` gates already prove none of it can leak a card
value. If the team prefers a single surface, the minimum to do before freezing is: narrow the
tokenize error union (R10 below), drop the alias duplicates (R11), and apply R1–R4.

### The alternative — a type-only host entry, the way `./orchestration` already works

The package already splits by audience once: `./orchestration` is a second entry whose types the
root never publishes, and `verify-public-surface` keeps the two disjoint. The same mechanism moves
everything in the table above off the root with **no runtime change**:

```text
@juspay-tech/react-native-hyperswitch-vault          merchant root
  HyperswitchVaultFormProvider, the four *Field components
  VaultFormHandle = { tokenize(); reset(); focus(field) }
  props: environment, session, appearance, localisation, cardholderName: 'collect' | 'omit',
         enabledCardSchemes, vaultEndpoint, disabled, accessible, unstyled, onFormStateChange
  VaultTokenizeResult with a 6-code error union; state without `eligibility`

@juspay-tech/react-native-hyperswitch-vault/host     payment-methods only
  the SAME component objects, typed with
  HostFormHandle = { tokenize(); confirmPayment(input); reset(); focus(field) }
  props + eligibility, cardholderName: 'external'
  every confirm input / result / next-action type, the 8-code error union
```

- **Runtime:** `src/host-entry.mjs` re-exports the same `.bs.js` components the root does, exactly
  as `CardNumberField === CardNumberWidget` holds today. Nothing in ReScript changes.
- **Types:** `src/host.ts` is the current `public.ts`; the root `public.ts` shrinks to the merchant
  half with a narrowed handle and error union.
- **Gates:** `verify-public-surface` gains a third pair and the rule "root types ∩ host-only types
  = ∅"; `verify-merchant-only` then checks a smaller file.
- **Consumers:** payment-methods changes its import path in `vaultForm.ts`, `confirmCard.ts` and
  `index.tsx`; client-core is untouched.
- **What it is not:** a security boundary. A merchant can still reach `confirmPayment` through
  `any` at runtime, which is fine — it holds no power a merchant lacks, since it needs a payment
  credential the merchant already owns. The split is about what the frozen merchant contract
  *says*, and it halves it.

Estimated cost: a day, including gates and the payment-methods import change.

### Additional recommendations (ease of integration)

| # | Recommendation | Why | Cost |
| --- | --- | --- | --- |
| **R10** | Publish `VaultTokenizeErrorCode = 'invalid_card_data' \| 'not_ready' \| 'invalid_session' \| 'unsupported_configuration' \| 'server_error' \| 'unknown_outcome'` and type `VaultTokenizeResult.error.code` with it | An exhaustive `switch` on a tokenize result today must handle two codes that cannot occur | Small, types only |
| **R11** | Remove the `*Widget` aliases, `WidgetHandle`, `HyperswitchVaultFormHandle`, `HyperswitchVaultFormProps`, `VaultCardNumberStyles`, `VaultCVCStyles`, `VaultFormBrandIconMode` and the `HyperswitchVault` namespace before 1.0 | There is no external merchant yet, so "unchanged, not deprecated" protects nobody and doubles autocomplete | Small; one facade edit in payment-methods `index.tsx` |
| **R12** | Add `canTokenize: boolean` to `VaultFormState` (`canSubmit && sessionStatus === 'valid'`) | The reference has to warn that `canSubmit` is true with an absent session; a named boolean removes the footgun | Tiny |
| **R13** | Accept `session?: MerchantSession \| null` | `useState<MerchantSession \| null>(null)` is the idiom; today it forces `session ?? undefined` or an early return | Tiny (type + one `Nullable` read) |
| **R14** | Add `sessionError?: SafeVaultError` next to `sessionStatus: 'invalid'` | An invalid session is reported with no reason until `tokenize()` is called; during integration the reason ("missing vault_details", "other vault_type") is what the developer needs | Small |
| **R15** | `useHyperswitchVaultForm()` returning `{ref, state, tokenize, reset}` | Removes the `useRef` + `useState` + callback boilerplate from every integration; the ADRs already reserve the name | Medium |
| R16 | Decide the fate of `HyperswitchVaultForm` | Rendered by no consumer today; keep it as a five-line quick start or drop it pre-1.0, but do not document it as a primary path | Decision |

## 7. Web parity

Withdrawn. The web vaulting work is in progress, so a comparison against the current `main` was not
a fair basis and has been removed. Revisit once both surfaces are settled.

---

## 8. Suggested edits to `merchant-api-reference.md` (concrete)

1. §*Invalid combinations*: `forbidden_card_data` → `unsupported_configuration` (E1).
2. §*`VaultTokenizeResult`* table: move "no session" to `error` / `invalid_session` (E2).
3. §*Error codes*: replace the translatability sentence with the actual contract, and list the 13
   messages so merchants can map them (E3); drop "Timeout" (E4).
4. §*`session` and `MerchantSession`*: add the `vault_type: 'hyperswitch'` requirement and what a
   VGS session does here (E5).
5. §*Option A/B* and §*Complete examples* 3 and 6: three named values from the backend, no casts (E6).
6. §*Eligibility*: update the type block (S1); mention `eligibilityRequired` on the confirm input and
   that the fail-open policy applies to the gate (U5); note the probe is skipped without a credential (U6).
7. §*Required inputs by task*: "one credential shape" in three places (S2–S4).
8. New subsection under §*`confirmPayment(input)`*: "Which session is used" — `cardSource.session` for
   the vault confirm, the `session` prop for `tokenize()`; a form mounted with a usable session
   refuses a direct confirm (U1, U2).
9. §*`reset()`*: "no-op while an operation is in flight" (U3). §*`tokenize()`*: the cross-operation
   `not_ready` (U4).
10. §*`onFormStateChange`* → `canSubmit`: add "`false` while `sessionStatus === 'invalid'`" (U7).

---

## 9. Bottom line

- The merchant deliverable is **session in → `tokenize()` → token out** on the composed layout.
  `docs/merchant-api-reference.md` has been rewritten around exactly that, with the errors above
  corrected and the undocumented behaviours added; both docs gates pass.
- The API-shape items in §6 (`type_` → `type`, `cardholderNameMode`, a closed scheme union,
  localisable error messages) are the ones worth settling before the surface is frozen.
