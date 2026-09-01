# CardElement feature-parity inventory

Every behaviour client-core's `CardElement` had, and where it ended up when the library took over
new-card entry ([ADR-0004](adr/0004-library-owns-every-new-card-flow.md)).

This exists because "the new form compiles and takes a payment" is not the same as "nothing was
lost". Co-badge selection, scanning and eligibility are all easy to drop silently: they are absent
from the happy path, invisible in a smoke test, and each one costs a real merchant something.

Source of truth for the old behaviour: `src/components/dynamic/CardElement.res` at
`hyperswitch-client-core` before this change, plus the components it rendered
(`CardSchemeComponent`, `ScanCardButton`, `CustomInput`).

**Classification:** `Ported` · `Changed` · `Removed` · `N/A` · `Blocked`

---

## Card entry

| Feature | Status | Where it lives now |
|---|---|---|
| Card-number formatting (brand-specific grouping) | Ported | `CardFieldLogic.onCardNumberText` → `Validation.formatCardNumber`, the same shared-code function |
| Expiry formatting (`MM / YY`) | Ported | `CardFieldLogic.onExpiryText` → `Validation.formatCardExpiryNumber` |
| CVC formatting and length by brand | Ported | `CardFieldLogic.onCvcText` → `Validation.formatCVCNumber` |
| Cardholder name (`CardHolderName` field type) | Ported | A library field. It was never part of `CardElement`: it came from the dynamic `FULLNAME` element, which meant a value writing to `payment_method_data.card` was living in client-core. `FieldGrouper` now classifies it as `Card`, so it reaches the library |
| Billing first/last name (often LABELLED "card holder name") | N/A | Stays with client-core — it is billing data, and its write path is `payment_method_data.billing.address.*`. The library's field is omitted (`cardholderName: 'omit'`) when the merchant's config asks for these instead, so the customer sees one name input, not two |
| Maximum lengths (23 / 7 / 4) | Ported | `CardFields.Number`, `.Expiry`, `.Cvc` |
| Auto-advance number → expiry → CVC | Ported | `CardFieldLogic.numberChange.advanceFocus`, `expiryChange.advanceFocus` |
| Blur the CVC once it is complete | Ported | `CardFieldLogic.cvcChange.blurField` |
| Backspace navigation (CVC → expiry → number → blur) | Ported | `CardFieldLogic.onCvcBackspace` / `onExpiryBackspace` / `onCardNumberBackspace` |
| Clearing expiry and CVC when the brand changes | Ported | `CardStateReducer.NumberChanged` with `clearDependents` |
| `secureTextEntry` on the CVC | Ported | `CardFields.Cvc` |
| Numeric keyboards | Ported | `keyboardType="number-pad"` on all three numeric fields |

## Validation and errors

| Feature | Status | Where it lives now |
|---|---|---|
| Card-number validity (Luhn + brand pattern) | Ported | `VaultFormOptions.makeCardNumberValidator` |
| Expiry validity | Ported | `VaultFormOptions.makeExpiryValidatorWith` |
| CVC validity by brand | Ported | `VaultFormOptions.makeCvcValidatorWith`, keyed on the network in force |
| Unsupported card network | Ported | `VaultFormOptions.makeNetworkValidator`, from `enabledCardSchemes` |
| Error timing (touched / active / blurred) | Ported | `CardStateReducer.numberError` / `expiryError` / `cvcError`, reproducing the original conditions |
| Error priority: number → expiry → CVC → network → eligibility | Ported | `CardFormView`; the form-level pair is ordered last, as before |
| One shared error line in the fused layout | Ported | `CardFormView.fusedFieldError` |
| Per-field error lines in the split layout | Ported | `CardFields.ErrorSlot`, on by default via `errorDisplay` — which gates the border and text tint too |
| Message text and localisation | Ported | `localisation.validationMessages`; client-core passes the same `localeObject` strings it used before |

## Card network

| Feature | Status | Where it lives now |
|---|---|---|
| Brand detection from the PAN | Ported | `CardFieldLogic` → `Validation.getAllMatchedCardSchemes` |
| Brand artwork | Ported | `CardIcons`, via `brandIconMode` |
| Co-badge detection (>1 match, ≥16 digits) | Ported | `CardStateReducer.isCoBadged` — the 16-digit threshold is client-core's, reproduced exactly |
| Co-badge chooser UI | Changed | `CardNetworkChooser`. Client-core used an inline popover in the field; the library uses a bottom sheet. Same choice, same effect, different presentation |
| Narrowing the chooser to merchant-accepted schemes | Ported | `VaultCardController.eligibleSchemes` |
| Selected network on the wire | Ported | `payment_method_data.card.card_network`, direct flow only |
| Selected network in the VAULT flow | Ported | Sent on the payment-method-session confirm too. `PaymentMethodSessionConfirmRequest.payment_method_data` flattens the same `Card` struct as the payment confirm, and it carries `card_network` — verified in `hyperswitch`, `crates/api_models/src/payments.rs`. A vaulted card therefore records the network the customer chose |
| Networks the backend enum cannot represent | Changed | `BAJAJ` and `SODEXO` are detected by the library but absent from `common_enums::CardNetwork`. `card_network` is omitted for them rather than sent, because an unmappable value fails an enum parse and would reject a payment that works. The backend derives the brand from the PAN regardless |

## Scan card

| Feature | Status | Where it lives now |
|---|---|---|
| Optional native scanner | Ported | `ScanCardBridge`, resolving `@juspay-tech/react-native-hyperswitch-scancard` with the same `try`/`require` client-core used |
| Button shown only while the number is empty | Ported | `CardNumberAccessory.scanOffered` |
| Scan fills number and expiry, focuses the CVC | Ported | `VaultCardController.scanCard` |
| Scan result routed through the ordinary field logic | Changed | It is now, deliberately. Client-core had a separate `onScanCard` that re-implemented formatting and focus; a scanned card is now formatted and validated by exactly the code a typed one is |
| Button appearance | Changed | A text button (`Scan`) rather than client-core's icon. **Product impact: cosmetic.** The library ships no scanner artwork and adding a PNG for an optional peer was not worth the bundle |
| Bundling without the scanner installed | Ported | Proven, not assumed. A guarded `require` is resolved statically by Metro, so `scripts/verify-scancard-packaging.mjs` builds a real consumer from the packed tarball both with and without the package — both bundle, and a marker proves the scanner is pulled in only when present |

## Eligibility

| Feature | Status | Where it lives now |
|---|---|---|
| `POST /payments/{id}/eligibility` with the PAN | Ported | `VaultEligibility.check` — same endpoint, same body, same headers |
| Probe fires when the number completes | Ported | `VaultFormHost`, gated on the `eligibility` prop |
| Verdict reading (`"deny"` string or `{deny}` object) | Ported | `VaultEligibility.readVerdict` |
| Fail-open on a transport error | Ported | Reproduced deliberately; asserted by `verify-eligibility.mjs` |
| Inline "card not accepted" message | Ported | `CardStateReducer.eligibilityError` → the form-level error line |
| Enforcement before confirming | Changed | **Stronger than before.** Client-core only disabled the button; the library re-checks in `confirmPayment` and returns `card_not_eligible` |
| Fail-open on anything but an explicit `deny` | Ported | Preserved deliberately, on the evidence of client-core `4d1f420` and `94b89ee` — the latter titled *"allowing the payment for all the cases and blocking for deny"*, which changed this behaviour **to** fail-open because failing closed rejected payments merchants wanted taken |
| Pay button disabled while denied | Removed | `TabElement.isEligibilityBlocked` can no longer fire: reporting a denial back to client-core would publish a card-derived judgement across the boundary. **Product impact: the button stays pressable on a denied card; pressing it shows the same message and sends no payment request** |

## Layout, styling and platform

| Feature | Status | Where it lives now |
|---|---|---|
| `splitCardFields` (joined vs separate boxes) | Ported | `fieldArrangement: 'fused' \| 'separate'`, mapped in `VaultCardElement` |
| Expiry and CVC sharing a row | Ported | `layout: 'inline'` |
| Merchant theme (colours, radius, borders, fonts) | Ported | `appearance`, mapped from `ThemebasedStyle` |
| RTL direction | Ported | `localisation.isRtl` |
| Placeholders from `configuration.placeholder` | Ported | `fieldOptions.*.placeholder` |
| Floating labels | Ported | `labelBehavior: 'floating'` |
| `cardBrandIcon` configuration | Ported | `fieldOptions.cardNumber.brandIconMode` |
| `cvcIcon` configuration | Ported | `fieldOptions.cvc.cvcIcon` |
| Test IDs | Ported | Same string constants (`CardNumberInputTestId`, …) via `fieldOptions.*.testID` |
| `accessible` prop | Ported | Forwarded through `VaultCardElement` |
| Disabled / processing state | Ported | The library dims and disables its own fields while a submission is in flight |

## Data and events

| Feature | Status | Where it lives now |
|---|---|---|
| React Final Form registration of PAN / expiry / CVC | Removed | Client-core holds no card value; there is nothing to register |
| `payment_method_data.card.*` construction | Ported | `VaultConfirmBody.directCardSubtree` — inside the library |
| `card_network` write path | Ported | Same subtree |
| `PaymentEvents.emitCardInfo` from new-card entry | Removed | It published BIN, last four and brand. **Product impact: a merchant listening for card info during new-card entry no longer receives it.** The event itself survives for saved cards, where `SavedPaymentSheet` still emits it |
| Nickname ("save this card as…") | Ported | Still client-core's — it is not card data. Sent on the tokenization call only |
| Customer acceptance / mandate | Ported | Still client-core's, passed as non-card confirm input |
| Billing and other dynamic fields | Ported | Still client-core's; the library serializes what it is given and nothing else |
| Analytics on card fields | Removed | The library's `onAnalytics` hook exists internally but is wired to a no-op, and nothing is published |

## Out of scope

| Feature | Status | Why |
|---|---|---|
| Saved-card entry and its CVC field | N/A | `SavedPaymentSheet` collects no new card values, so ADR-0004 does not reach it |
| Saved-card `emitCardInfo` | N/A | Same |
| Wallets, pay-later, bank redirects | N/A | No card values; `classicProcessRequest` still serves them unchanged |
| iOS native compilation | Blocked | Metro bundles for iOS, but an Xcode build of a real app was not run — see the final report. Metro success is not evidence of native compilation |

---

## What was verified, and how

| Claim | Evidence |
|---|---|
| Formatting, validation and focus behave as before | `example/__tests__/defaultUi.test.tsx`, `vaultFormLifecycle.test.tsx` |
| Co-badge selection reaches the wire and nothing else | `example/__tests__/coBadgeEligibilityScan.test.tsx` |
| Scanning feeds the ordinary field path | `example/__tests__/scanCard.test.tsx` |
| Eligibility reproduces the client-core contract | `scripts/verify-eligibility.mjs` |
| The direct body carries the card and no token | `scripts/verify-noncard-input.mjs`, `example/__tests__/securityBoundary.e2e.test.tsx` |
| The routing table has no fallback row | `hyperswitch-client-core/__tests__/VaultRouting-test.js` |
| Exactly one cardholder name input, in every configuration | `example/__tests__/cardholderName.test.tsx`, `hyperswitch-client-core/__tests__/CardholderNameOwnership-test.js` |
| Client-core constructs no card data at all | `hyperswitch-client-core/scripts/verify-no-card-ownership.mjs` |
| The scanner is genuinely optional for a consumer | `scripts/verify-scancard-packaging.mjs` |
| React Native 0.79 – 0.87 all work against the packed tarball | `scripts/verify-rn-matrix.mjs` |
| Navigation behaviour is unchanged | `hyperswitch-client-core/__tests__/NextActionCharacterization-test.js`, `PaymentStatusCharacterization-test.js` |
