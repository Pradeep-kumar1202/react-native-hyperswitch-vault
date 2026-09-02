# New-card vaulting on React Native — architecture, flows, behaviours, merchant surface, and workarounds

**Status:** describes the working trees as of 2026-09-02 (after the remediation pass recorded in
`NEW-CARD-VAULTING-REVIEW.md`). Saved/repeat-card flows and headless are out of scope except where
noted.

**Repositories**

| Package | Role in one line |
| --- | --- |
| `hyperswitch-client-core` (the RN checkout) | Composes the checkout, decides *where* the card fields sit, owns everything after the confirm. Never sees a card value. |
| `@juspay-tech/react-native-hyperswitch-payment-methods` (the facade) | Decides *which* secure implementation renders the fields, integrates external providers (VGS), parses provider responses into one canonical shape, and routes every confirm into the vault. |
| `@juspay-tech/react-native-hyperswitch-vault` (the vault) | Owns the card values, validation, Hyperswitch tokenization, the request bodies, the **single** `/payments/{id}/confirm` transport, and the sanitized result. Knows no provider by name. |

---

## 1. Ownership boundaries

The rule that everything else follows from: **a card value (PAN, CVC, raw expiry) exists in exactly
one place per flow — inside the vault's own state on the direct and Hyperswitch flows, inside the
provider's native view on an external-provider flow — and nothing above the facade can read it.**

| Concern | Owner | How it is enforced |
| --- | --- | --- |
| Checkout composition, placement of the four card inputs, widths, gaps, RTL, joined-box look, the single error line | client-core (`VaultCardElement.renderFields`) | The facade hands opaque `ReactNode` slots; client-core arranges them |
| Which secure implementation renders (Hyperswitch vault vs VGS) | facade (`strategy.ts`) | client-core passes only a narrowed `vaulting_action` and the raw `vault_details` subtree |
| Secure inputs and their internal chrome (floating label, brand mark, CVC glyph, co-badge chooser, scan-card) | vault fields / VGS native views | Providers render what they naturally provide; nothing rebuilds their chrome |
| Raw card state, validation needing raw values, formatting | vault (`CardStateReducer`, sdk-utils `Validation`) / VGS collector | client-core has no `useField` on a card path — gated |
| Hyperswitch tokenization (payment-method-session confirm) | vault (`VaultConfirm`) | Internal module, no genType, not exported |
| Provider-response parsing → canonical `ProviderTokenizedCard` | facade (`providers/vgs/parseTokenizedCard.ts`) | The vault has no provider knowledge; aliases are never sliced |
| Confirm body (direct card, vault token, external aliases) | vault (`VaultConfirmBody`) | One builder, three closed payload variants |
| Payment credential handling (`Authorization` vs `api-key` + `client_secret`) | vault (`VaultCredential`) | Both shapes resolved once, before any request |
| `/payments/{id}/confirm` transport | vault (`VaultFinalConfirm`) — **the one implementation** | client-core's legacy transport is unreachable for cards and both classic entry points fail-close CARD (gated) |
| Result sanitization, safe next-action | vault (`VaultResult`, `VaultNavigation`) | Closed reason variant; no backend prose slot |
| 3DS / DDC / redirect / polling / merchant callbacks | client-core (`useNextActionDispatcher`) | Unchanged legacy machinery |

Client-core contains no `if provider === 'vgs'`. `scripts/verify-no-card-ownership.mjs` fails the build
if any `.res` file names a provider SDK, imports the vault directly, registers a card form field,
builds a card `payment_method_data`, calls eligibility, emits new-card `cardInfo`, or assembles an
orchestration body — and proves it is not vacuous with synthetic positives and negatives.

---

## 2. Architecture as built

```
hyperswitch-client-core
│
├─ NavigationRouter / UpdateIntentHook
│     sdkConfig()      ─► CardStrategyContext.rawSdkConfig        (raw JSON, never pre-parsed)
│     sessionToken()   ─► CardStrategyContext.vaultDetails        (raw vault_details subtree)
│                      ─► CardStrategyContext.sessionTokensLoaded (true on ANY answer, incl. error)
│
├─ VaultCardSubmission.use()            ── one hook per card method instance
│     CardStrategy.readVaultingAction   → ConfigPending | ProfileMissing | ActionAbsent | ActionValue(s)
│     CardStrategy.toFacadeAction       → undefined | 'skip' | 'tokenize' | 'unknown'
│     CardStrategy.resolve              → holds 'tokenize' as PENDING until sessionTokensLoaded
│     └─► facade.resolveCardStrategy({vaultingAction, vaultDetails, eligibilityRequired})
│     submit()                          → sessionRef.confirmPayment(hostInput) (one in flight)
│     cardFormValid                     → feeds FORM_STATUS
│
├─ ParentElement  ── CARD group
│     Renderable → <VaultCardElement>   Blocked → <VaultUnavailableNotice code>   Pending → null
│
└─ VaultCardElement
      appearance ← theme · localisation ← locale · fieldOptions (errorDisplay: none) · fieldStyles
      renderFields(slots): number full width, expiry|CVC row (RTL-aware), ONE <ErrorText>
      onFormStateChange → single error line, error borders, FORM_STATUS
      │
      ▼
@juspay-tech/react-native-hyperswitch-payment-methods
│
├─ hyperswitch/strategy.ts
│     undefined → pending · skip → direct · tokenize+hyperswitch → hyperswitch_vault
│     tokenize+vgs → external_provider · tokenize+vgs+eligibilityRequired → blocked
│     tokenize+other/none → blocked · unknown → blocked
│
├─ hyperswitch/CardPaymentSession.tsx   ── ONE handle {confirmPayment, reset, focus}
│     direct | hyperswitch_vault → <HyperswitchVaultFormProvider> + vault field components
│     external_provider          → <HyperswitchForm> + provider widgets
│                                   + local gate (empty/invalid/wrong network → refuse)
│                                   + synthesized VaultFormState (same shape as the vault's)
│     both                       → renderFields(slots) or built-in stack fallback
│
├─ hyperswitch/confirmCard.ts           ── routes; owns NO transport
│     direct/hyperswitch_vault → vaultHandle.confirmPayment({...input, cardSource})
│     external_provider        → providerHandle.submit() → parseVgsTokenizedCard()
│                                → vault/orchestration.confirmTokenizedCardPayment()
│
├─ providers/registry.ts → vgs (+ skyflow, basis_theory, evervault adapters, no payment path)
├─ providers/vgs/adapter.tsx            collector.submit(path ?? '/post') · explicit validation rules
└─ providers/vgs/parseTokenizedCard.ts  aliases verbatim; expiry parsed; NO bin/last4 derivation
      │
      ▼
@juspay-tech/react-native-hyperswitch-vault
│
├─ root entry (merchants + facade)              ├─ ./orchestration (facade only)
│   HyperswitchVaultForm (ready-made)           │   confirmTokenizedCardPayment(input)
│   HyperswitchVaultFormProvider + 4 fields     │   VaultOrchestration.res — no React
│   VaultFormCoordinator                        │
│     Flow 1 tokenize()  → PMS confirm → token  │
│     Flow 2 vault       → PMS confirm → final  │
│     Flow 3 direct      → final               │
│                          │                    │
│                          ▼                    ▼
│              VaultCredential.resolve  ── sdkAuthorization | publishableKey+clientSecret
│              VaultConfirmBody.build   ── card | payment_token | vault_card(token) | vault_card(aliases)
│              VaultFinalConfirm        ── POST {base}/payments/{id}/confirm  (THE transport)
│              VaultResult.fromNavOutcome ── {status, error?, nextAction?}
▼
client-core: VaultResultMapper.classify → useNextActionDispatcher → 3DS/DDC/redirect/poll → merchant
```

---

## 3. Strategy resolution

### 3.1 Inputs

| Input | Source | Read as |
| --- | --- | --- |
| `vaulting_action` | `sdk_config.account_config.profile.vaulting_action` | Raw JSON, trimmed + lower-cased; **never** through the shared closed enum (which historically mapped unknown → `Skip`) |
| `vault_details` | `/payments/{id}/session_tokens` → `vault_details` | Raw subtree, forwarded untouched |
| `sessionTokensLoaded` | set when the session request answers — success, empty or error | Distinguishes "not yet" from "absent" |
| `eligibilityRequired` | `client.sdk_next_action.next_action === "eligibility_check"` | Passed to the facade |

### 3.2 The raw-config ladder (client-core, `CardStrategy.res`)

| Raw state | Meaning | Facade action |
| --- | --- | --- |
| `ConfigPending` | sdk-config not arrived | `undefined` → **pending** |
| `ProfileMissing` | config without `account_config.profile` | `'unknown'` → blocked |
| `ActionAbsent` | profile present, no `vaulting_action` | `'unknown'` → blocked, re-coded `vault_configuration_missing_action` |
| `ActionValue("skip")` | | `'skip'` |
| `ActionValue("tokenize")` | | `'tokenize'` (held as `undefined`/pending until `sessionTokensLoaded`) |
| `ActionValue(anything else)` / non-string | | `'unknown'` → blocked |

**Nothing unreadable ever becomes `skip`.** `skip` is the only value that reaches a raw-PAN confirm.

### 3.3 The truth table (facade, `strategy.ts`)

| `vaultingAction` | `vault_details` | `eligibilityRequired` | Strategy |
| --- | --- | --- | --- |
| `undefined` | any | any | `{kind:'pending'}` |
| `'skip'` | any — **VGS included** | any | `{kind:'direct'}` |
| `'tokenize'` | `{vault_type:'hyperswitch', vault_data:{sdk_authorization}}` | any | `{kind:'hyperswitch_vault', session:{vault_details}}` |
| `'tokenize'` | `{vault_type:'vgs', vault_data:{vault_id, environment, route_id?, cname?}}` | `false` | `{kind:'external_provider', config:{vault_type:'vgs', vault_data}}` |
| `'tokenize'` | VGS | `true` | `{kind:'blocked', code:'eligibility_unavailable_for_provider'}` |
| `'tokenize'` | VGS missing `vault_id`/`environment` | | `blocked('vault_configuration_unavailable')` |
| `'tokenize'` | hyperswitch with blank `sdk_authorization`, unknown type, or none | | `blocked('vault_session_unavailable')` |
| `'unknown'` | any | any | `blocked('vault_configuration_unavailable')` |

`vault_type` is trimmed and case-insensitive. Only `hyperswitch` and `vgs` have a payment path; the
Skyflow / Basis Theory / Evervault adapters exist for field collection but resolve to `blocked` here,
so they can never tokenize a card that cannot be confirmed.

---

## 4. Supported flows

### Flow A — Direct (`vaulting_action = skip`)

1. `strategy = direct`. `CardPaymentSession` mounts `<HyperswitchVaultFormProvider>` **without** a
   `session` prop; client-core places the vault's four field components via `renderFields`.
2. Card values live in the vault's `CardStateReducer`; validation is sdk-utils
   (`cardValid`, `checkCardExpiry`, `checkCardCVC`, network allowlist, live eligibility probe).
3. Pay → `VaultCardSubmission.submit` → `sessionRef.confirmPayment(hostInput)` →
   `confirmCardPayment` → `vaultHandle.confirmPayment({...input, cardSource:{type_:'direct'}})`.
4. Vault gate order: presence (all required fields mounted once) → validity → host-data card-key
   deep scan → `paymentId` → credential (`VaultCredential.resolve`) → cardholder-name mode →
   `cardSource` shape → endpoint validation → mount/operation agreement (a form mounted WITH a usable
   vault session refuses a direct confirm) → eligibility gate (if required, using the PAN the vault
   holds) → body → transport.
5. Body: `payment_method: "card"`, `payment_method_type`,
   `payment_method_data.card.{card_number, card_exp_month, card_exp_year, card_cvc, card_holder_name?, card_network?, nick_name?}`,
   plus host billing, `customer_acceptance`, `browser_info`, `return_url`, `payment_type`, `email`,
   and `client_secret` **only** for the legacy credential.
6. Headers: `Content-Type`, `Authorization: <sdkAuthorization>` **or** `api-key: <publishableKey>`,
   `x-app-id`, `x-redirect-uri: ""`.
7. Response → closed `navOutcome` → `VaultPaymentResult` → client-core `VaultResultMapper` →
   `useNextActionDispatcher` (3DS invoke, DDC, redirect, session token, bank transfer, polling).

### Flow B — Hyperswitch Vault (`tokenize` + hyperswitch session)

Same as A until step 4, then:

4. `cardSource:{type_:'vault', session}`. `readSession` re-validates `vault_type` and the credential.
5. **Call 1** — `POST {vaultBase}/v1/payment-method-sessions/{id}/confirm`, authenticated with the
   **vault** credential (`vault_data.sdk_authorization`, base64; the session id is decoded out of it).
   Body carries the card, `card_holder_name?`, `card_network?`, `nick_name?`. Returns a token plus
   provider-reported metadata (`last4_digits`, `card_isin`, expiry).
6. The token is cached in a module-local ref keyed by `(session credential, cardVersion)`. A failed
   call 2 retries **call 2 only** — the PMS confirm is not idempotent on the backend (it re-stores
   the card and overwrites `associated_payment_methods`), so re-minting would vault the card twice.
   The cache is dropped on any card edit, session change, `reset()`, or unmount.
7. **Call 2** — the same `VaultFinalConfirm` with the **payment** credential and either
   `payment_token` top-level (default) or `payment_method_data.vault_card` (`confirmTokenMode:
   'vault_card'`).
8. The token never crosses to the facade or client-core. Only `tokenize()` (Flow 1, merchant-only,
   never called by client-core) returns one.

### Flow C — VGS external provider (`tokenize` + VGS session)

1. `strategy = external_provider`. `CardPaymentSession` mounts `<HyperswitchForm config>` and the
   provider widgets (`CardNumberWidget` etc. → `vgsAdapter.Field` → `VGSCardInput` /
   `VGSTextInput(expDate)` / `VGSCVCInput`), placed by client-core's `renderFields`.
2. Every VGS input carries explicit validation rules (`NotEmptyRule` + the format rule). The inputs
   report `FieldState {isValid, isEmpty, isFocused, isDirty, validationErrors, brand}` — no value.
3. `CardPaymentSession` synthesizes a `VaultFormState` from those reports (same shape the vault
   emits) and emits it on `onFormStateChange`.
4. Pay → local gate: not ready → `not_ready`; any required field empty/invalid, or brand outside
   `enabledCardSchemes` → `validation_error / invalid_card_data`, **no** provider call.
5. `providerHandle.submit(providerData)` → `collector.submit(path ?? '/post', 'POST')`. A thrown
   `VGSError(InputDataIsNotValid)` becomes `validation_error` (field-mapped); other failures become
   `error` → `tokenization_failed` with library copy.
6. `parseVgsTokenizedCard`: `card_number`, `card_cvc` aliases verbatim; expiry from
   `expiration_date` (`MM/YY`, `MMYY`, `MM/YYYY`, `MMYYYY`) or `card_exp_month`/`card_exp_year`;
   optional `card_holder`. Missing required keys fail loudly, naming them. **`lastFour` / `binNumber`
   are never derived from an alias.**
7. `confirmTokenizedCardPayment(orchestrationInput)` — field-by-field, never a spread. Body:
   `payment_method_data.vault_card.{card_number: alias, card_cvc: alias, card_exp_month (2-digit), card_exp_year (4-digit), card_holder_name?, card_network?(enum allowlist), last_four?, bin_number?, nick_name?}`.
   Same transport, same credential resolution, same sanitized result.

---

## 5. Behaviours

### 5.1 Validation and error display
- **Vault fields** validate with sdk-utils on every keystroke; visible errors follow the vault's
  touched/focus rules.
- **VGS fields** validate with explicit rules; visible errors are derived in `CardPaymentSession`
  with the same timing rule (shown once the customer leaves the field, or on a Pay press).
- **client-core draws ONE error line** under the card block (`errorDisplay: 'none'` on every field,
  which is the vault's documented "host draws it" mode). Order: number → expiry → CVC → unsupported
  network (once the number field is settled) → eligibility denied. The offending field's border takes
  the theme's danger colour through the per-field `container` style slot.
- Every customer-visible word is library-owned and localised. Provider SDK text is never surfaced.

### 5.2 Pay button and FORM_STATUS
- Pay is always enabled (as before); a press with an invalid card produces inline errors and keeps the
  sheet open on **every** provider.
- `FORM_STATUS` is `complete` only when the non-card form is valid **and** the card form reports
  `valid`; a card checkout always counts as having required fields.

### 5.3 Submission lifecycle
- **Double submit**: the vault returns the same in-flight promise for a repeat `confirmPayment`;
  client-core additionally keeps one continuation per submission (`inFlightRef`).
- **Unmount during request**: the vault bumps a generation counter, aborts, and drops the token cache.
- **`reset()`**: vault path clears state and the token cache (no-op while in flight); VGS path
  remounts the provider form (the only way to clear a native input) and clears reported states.
- **Disabled / submitting**: vault fields become non-editable; VGS inputs are wrapped in
  `pointerEvents="none"`.
- **Unknown outcome** (thrown fetch, timeout, abort on the final confirm): `unknown_outcome`, never
  retried automatically — the endpoint has no idempotency key.

### 5.4 Cardholder name
| Mode | Who renders the field | Where the value comes from |
| --- | --- | --- |
| `collect` | the vault / provider | the library's own field |
| `external` | client-core (`FullNameElement`, when `CardHolderName` is a configured field) | `hostInput.cardholderName` from `payment_method_data.card.card_holder_name` in the form dict |
| `omit` | nobody | none sent |

client-core uses `external` when the field is configured, else `omit`; it never uses `collect`.
Supplying a name in `collect`/`omit` mode is `unsupported_configuration` before any request.
`FieldGrouper` is gated to keep `CardHolderName` in the Name group so it keeps rendering.

### 5.5 Eligibility
| Flow | Behaviour |
| --- | --- |
| Direct / Hyperswitch | Live probe as the number completes (`eligibility` prop) and a re-check before confirm when `eligibilityRequired`. Uses the PAN the vault holds. Transport failure resolves **allowed** (reproduces client-core PRs #470/#474 deliberately; asserted by `verify-eligibility`). An explicit `deny` → `card_not_eligible`. |
| VGS | Not possible (no PAN in JS). `tokenize + VGS + eligibilityRequired` is **blocked** at strategy time and refused again in `confirmCardPayment`. Flipping to "allow without check" is a one-line product decision in `strategy.ts`. |

### 5.6 Co-badge, brand, scan-card
- Direct/Hyperswitch: detection via sdk-utils, `enabledCardSchemes` narrowing, chooser when >1 scheme,
  `card_network` sent only when the customer had a real choice (enum-allowlisted).
- VGS: the provider reports one brand; `isCoBadged` is always `false`; `enabledCardSchemes` is enforced
  on the reported brand (`unknown` never refuses). No network on the wire.
- Scan-card: the vault resolves `@juspay-tech/react-native-hyperswitch-scancard` optionally; the button
  appears only when the package is installed and the number is empty. client-core declares the
  dependency, so it ships. Not available on VGS.

### 5.7 Credentials and endpoints
- Payment credential: `sdkAuthorization` (→ `Authorization`) wins when non-blank; else
  `publishableKey` (→ `api-key`) + `clientSecret` (→ body `client_secret`), both required. Neither
  complete → `invalid_session` with zero requests. client-core passes both, like `Utils.getHeader`.
- Vault credential (Flow B call 1) is always `vault_details.vault_data.sdk_authorization`.
- Two bases: `endpoint` (eligibility + final confirm) and `vaultEndpoint` (PMS confirm), each
  validated (https, or http on loopback outside production; no userinfo/query/fragment; path prefix
  kept). Defaults per environment: production `https://checkout.hyperswitch.io/api`, sandbox
  `https://beta.hyperswitch.io/api`, integration `https://dev.hyperswitch.io/api`. client-core passes
  its resolved base for both.

### 5.8 Post-confirm
The vault lifts only allowlisted navigation fields (`three_ds_data`, `ddc_data`, `session_token`,
`redirect_to_url`) and consults `next_action.type` **before** `status`, exactly as client-core's
`handleApiRes` did. `cancelled` is not treated as processing at the confirm site. client-core keeps
all continuation (Netcetera 3DS, DDC iframe, browser redirect, wallet session tokens, polling).

---

## 6. Merchant-exposed surface

### 6.1 RN SDK merchants (through `hyperswitch-client-core`)

**Configuration that affects the card form** (all pre-existing names; behaviour preserved unless noted)

| Prop | Effect now |
| --- | --- |
| `hyperswitchConfig.publishableKey` | Legacy credential (`api-key`) when `sdkAuthorization` is absent |
| `hyperswitchConfig.environment` / `customEndpoints` | Selects vault environment defaults; the resolved base is passed as both `endpoint` and `vaultEndpoint` |
| `paymentSessionConfig.sdkAuthorization` | Payment-intent credential (preferred) |
| `paymentSessionConfig.clientSecret` | Legacy credential half (body `client_secret`) |
| `configuration.splitCardFields` | `false` (default): one joined box via per-field border slots; `true`: three separate boxes with theme `gap` |
| `configuration.paymentMethodLayout.cardBrandIcon` | `standard` \| `animated` \| `hidden` \| `hideGeneric` → vault `brandIconMode`; VGS honours only `hidden` |
| `configuration.paymentMethodLayout.cvcIcon` | `shown` \| `hidden` → vault `cvcIcon`; VGS honours `hidden` |
| `configuration.placeholder.{cardNumber, expiryDate, cvv}` | Placeholders on both providers |
| Theme (`primaryColor`, component colours, `borderRadius`, `borderWidth`, `inputHeight`, `gap`, `fontScale`, error text/spacing) | Mapped 1:1 onto vault `appearance`; VGS gets container/text style equivalents |
| Locale strings (`cardNumberLabel`, `validThruText`, `cvcTextLabel`, empty/invalid texts, `unsupportedCardErrorText`, `cardNotEligibleText`, `selectCardBrand`, RTL) | Mapped onto vault `localisation`; used for VGS messages too |
| `configuration.displaySavedPaymentMethodsCheckbox`, `alwaysSendCustomerAcceptance`, `hideCardNicknameField` | Drive `customer_acceptance` and `nick_name` exactly as before |
| Required-field config including `CardHolderName` | Decides the cardholder-name mode (`external` vs `omit`) |
| `netceteraSDKApiKey` | Native 3DS after confirm (unchanged) |

**Events** (`subscribedEvents`)

| Event | New-card behaviour |
| --- | --- |
| `FORM_STATUS` | `complete` only when the form **and** the card are valid |
| `PAYMENT_METHOD_STATUS`, `PAYMENT_METHOD_INFO_BILLING_ADDRESS`, `CVC_STATUS`, `SURCHARGE` | Unchanged |
| `PAYMENT_METHOD_INFO_CARD` | **No longer emitted for new cards** (still emitted for saved cards). Its old payload carried `bin`, `last4`, `expiryMonth`, `expiryYear`, `formattedExpiry`, which the card-safe model cannot supply. Product decision pending — see §8. |

**Result callbacks**: unchanged shapes (`succeeded`, `processing`, `requires_customer_action` →
handled internally, `failed` with `code`/`message`). New codes a merchant may see: `card_route_unavailable`,
`vault_session_unavailable`, `vault_configuration_unavailable`, `vault_configuration_missing_action`,
`eligibility_unavailable_for_provider`, `provider_unavailable`, `unsupported_configuration`,
`vault_unknown_status`, plus every vault code in §7.

### 6.2 Host integrators (through `@juspay-tech/react-native-hyperswitch-payment-methods`)

Exports (`src/index.tsx`): `HyperswitchPaymentMethods`, `registerAdapter`, `HyperswitchForm`,
`useHyperswitchForm`, provider widgets (`CardNumberWidget`, `CardExpiryWidget`, `CardCVCWidget`,
`CardHolderWidget`), core types, provider vault-data types, **`resolveCardStrategy`**,
**`BLOCKED_MESSAGES`**, **`confirmCardPayment`** (+ `INVALID_CARD_MESSAGE`,
`TOKENIZATION_FAILED_MESSAGE`), **`CardPaymentSession`**, and the vault's canonical names republished
from `./hyperswitch/vaultForm` (components: `HyperswitchVaultForm`, `HyperswitchVaultFormProvider`,
`HyperswitchVault`, `CardNumberField`, `CardExpiryField`, `CardCVCField`, `CardholderNameField`; and
the public types). The vault's `*Widget` aliases are deliberately not republished (name clash).

**`<CardPaymentSession>` props**

| Prop | Type | Notes |
| --- | --- | --- |
| `strategy` | `CardStrategy` | required |
| `environment` | `'production' \| 'sandbox' \| 'integration'` | required |
| `appearance`, `localisation`, `fieldOptions`, `fieldStyles`, `enabledCardSchemes`, `cardholderName`, `accessible`, `disabled`, `unstyled`, `eligibility`, `vaultEndpoint` | vault types | forwarded to the vault; translated for VGS where a supported hook exists |
| `onFormStateChange` | `(VaultFormState) => void` | **one shape on both paths**; never a card value |
| `renderFields` | `(slots: {cardNumber, expiry, cvc, cardholderName}) => ReactNode` | host owns arrangement; omit for the built-in stack (which also draws VGS error lines) |
| `providerData` | `unknown` | forwarded to the provider `submit` (VGS: `{path?, method?, extraData?}`) |
| `onProviderReady`, `onProviderError` | callbacks | provider initialisation; the error is a developer message |

**Handle**: `{ confirmPayment(input: HostConfirmInput): Promise<CardPaymentResult>; reset(): void; focus(field): void }`
where `HostConfirmInput = VaultPaymentConfirmInput` minus `cardSource`.

**`CardPaymentResult`**: `{ status, error?: {code, message}, nextAction? }` with every vault code plus
`not_ready`, `invalid_card_data`, `provider_unsupported_for_payment`, `provider_parse_failed`,
`tokenization_failed`, `vault_session_unavailable`, `vault_configuration_unavailable`,
`eligibility_unavailable_for_provider`.

### 6.3 Direct vault merchants (through `@juspay-tech/react-native-hyperswitch-vault`)

**Components**: `HyperswitchVaultForm` (ready-made), `HyperswitchVaultFormProvider` + `CardNumberField`,
`CardExpiryField`, `CardCVCField`, `CardholderNameField` (composed; `*Widget` aliases exist), and the
`HyperswitchVault` namespace.

**`HyperswitchVaultForm` props**: `environment` (required), `session?`, `appearance?`, `localisation?`,
`layout?: 'stacked' | 'inline'`, `fieldArrangement?: 'separate' | 'fused'`, `fieldOptions?`,
`fieldStyles?`, `enabledCardSchemes?`, `cardholderName?: 'collect' | 'external' | 'omit'`,
`accessible?`, `disabled?`, `unstyled?`, `eligibility?`, `vaultEndpoint?`, `onFormStateChange?`.
`HyperswitchVaultFormProvider` takes the same minus `layout`, `fieldArrangement`, `fieldOptions`,
`fieldStyles` (those are per-field on the composed fields) plus `children`.

**`appearance`**: `primaryColor`, `textColor`, `errorColor`, `placeholderColor`, `backgroundColor`,
`borderColor`, `borderRadius`, `borderWidth`, `fontFamily`, `inputHeight`, `gap`, `fontScale`,
`placeholderTextSizeAdjust`, `errorTextSizeAdjust`, `errorMessageSpacing`, `brandIconMode`.

**`localisation`**: `labels {cardNumberPlaceholder, cardNumberFloatingLabel, expiryPlaceholder,
expiryFloatingLabel, cvcPlaceholder, cvcFloatingLabel, cardholderNamePlaceholder,
cardholderNameFloatingLabel, selectCardBrandLabel}`, `validationMessages {cardNumberRequired,
cardNumberInvalid, expiryRequired, expiryInvalid, cvcRequired, cvcInvalid, unsupportedCard,
cardNotEligible}`, `isRtl`.

**Per-field options** (flattened as props on a composed field; grouped under `fieldOptions` on the form):
`placeholder`, `label`, `labelBehavior: 'none' | 'static' | 'floating'`, `errorDisplay: 'none' | 'inline'`,
`accessibilityLabel`, `accessibilityHint`, `testID`, `unstyled`; card number adds `brandIconMode`; CVC
adds `cvcIcon: 'none' | 'default'`.

**Per-field style slots** (`styles` on a field; `fieldStyles` on the form): `root`, `container`, `input`,
`placeholder`, `label`, `error`, `accessory` (expiry has no `accessory`). `container` is applied
after the field's own border block — this is how joined boxes are drawn.

**Handle** (`VaultFormHandle`): `tokenize(): Promise<VaultTokenizeResult>` (the ONLY route to a
token), `confirmPayment(input): Promise<VaultPaymentResult>`, `reset()`, `focus(field)`. Field ref
(`VaultFieldHandle`): `focus()`, `blur()`.

**`confirmPayment` input** (`VaultPaymentConfirmInput`): `cardSource` (required, closed union:
`{type_:'vault', session, confirmTokenMode?}` \| `{type_:'direct'}`), `paymentId` (required),
`sdkAuthorization?`, `publishableKey?`, `clientSecret?`, `cardholderName?` (external mode only),
`paymentMethodType?: 'credit' | 'debit'`, `paymentMethodData?: {billing?, nickName?}` (deep-scanned
for card keys → `forbidden_card_data`), `customerAcceptance?`, `browserInfo?`, `returnUrl?`,
`paymentType?: 'new_mandate' | 'setup_mandate'`, `email?`, `eligibilityRequired?`, `appId?`,
`endpoint?: {baseUrl}`, `vaultEndpoint?: {baseUrl}`.

**State emission** (`onFormStateChange` / per-field `onStateChange`): `fieldsReady`, `sessionStatus:
'valid' | 'invalid' | 'absent'`, `complete`, `valid`, `submitting`, `canSubmit`, `brand` (closed
union), `isCoBadged`, `eligibility: 'unknown' | 'pending' | 'allowed' | 'denied'`, `networkError?`,
`fields.{cardNumber, expiry, cvc, cardholderName?}` each with `field`, `status: 'empty' | 'incomplete'
| 'complete'`, `valid`, `touched`, `focused`, `error?: {code, message}`; card number adds `brand`,
`isCoBadged`, `eligibility`. **No value, length, BIN, last four, expiry part, CVC, token or
credential** — pinned by `verify-event-surface` against the packed declarations.

---

## 7. Result and error contracts

**`VaultPaymentResult`** (also the facade's `CardPaymentResult` shape):
`succeeded` · `processing` · `requires_customer_action {nextAction}` · `failed {error}` ·
`validation_error {error}` · `not_ready {error}`. `validation_error` and `not_ready` mean **nothing
was sent**.

**`VaultTokenizeResult`**: `success {token}` · `validation_error` · `not_ready` · `error`.

**Vault error codes** (`SafeVaultErrorCode`): `invalid_session`, `invalid_card_data`, `not_ready`,
`forbidden_card_data`, `unsupported_configuration`, `card_not_eligible`, `server_error`,
`unknown_outcome`. Backend HTTP codes are allowlisted into closed reasons (`IR_00/01/03` →
unauthorized, `IR_05/06` → rejected, `IR_16` → session used, `IR_24` → expired, else generic); no
backend prose has a slot to cross.

**Next action** (`VaultNextAction`): `type_: 'three_ds_invoke' | 'third_party_sdk_session_token' |
'display_bank_transfer_information' | 'invoke_ddc' | 'redirect_to_url'`, `redirectUrl?`,
`threeDs? {authenticationUrl, authorizeUrl, messageVersion, directoryServerId, pollId, delayInSecs,
frequency}`, `ddc? {iframeUrl, timeoutMs}`, `sessionToken? {walletName, openBankingSessionToken}`.

---

## 8. Failure matrix (post-fix)

| Scenario | Direct | Hyperswitch | VGS |
| --- | --- | --- | --- |
| Invalid / incomplete card | `validation_error`, inline error, sheet open, no request | same | same (local gate before `submit()`) |
| Brand outside `enabledCardSchemes` | network validator → `validation_error` | same | reported brand checked → `validation_error` |
| Eligibility required | probe + gate; `deny` → `card_not_eligible` | same | **blocked** before render (`eligibility_unavailable_for_provider`) |
| Eligibility transport failure | allowed (deliberate) | same | n/a |
| Session not yet loaded | n/a (direct needs none) | **pending**, renders nothing | pending |
| Session absent / unusable | n/a | `blocked('vault_session_unavailable')` | `blocked(...)` / `vault_configuration_unavailable` |
| No credential in either shape | `invalid_session`, no request | same | same |
| Provider tokenization failure | n/a | PMS error → safe code | `tokenization_failed`, library copy |
| Provider malformed response | n/a | `server_error` | `provider_parse_failed`, names missing keys, no confirm |
| Network failure on confirm | `unknown_outcome`, never retried | same | same |
| 4xx / 5xx / malformed body | closed reasons → `server_error` | same | same |
| Double submit | one request, one continuation | same | same |
| Unmount mid-request | abort + cache drop | same | orchestration call completes; result ignored |
| `reset()` | clears state (+ token cache) | same | remounts provider form |
| Blocked configuration | notice in place of the form; press exits with the code (shown on screen outside production) | | |

---

## 9. Security invariants and the gates that hold them

| Invariant | Enforced by |
| --- | --- |
| No PAN / CVC / raw expiry in client-core | `verify-no-card-ownership.mjs` (source scan + anti-vacuity); architecture |
| Aliases never become BIN/last4 | `parseTokenizedCard` never emits them; test *"metadata is NEVER derived from a numeric alias"* |
| Token never leaves the vault except via `tokenize()` | `verify-merchant-only` on the packed `public.d.ts` |
| One `/payments/{id}/confirm` for new cards | `verify-final-confirm`, `verify-orchestration` (runtime, mocked fetch); both classic client-core entry points fail-close CARD (gated) |
| Unknown vaulting config never fails open to direct | two ladders, both tested |
| Unsupported providers fail before tokenization | strategy blocks; `confirmCard` refuses |
| Merchant callbacks carry only safe state | `verify-event-surface` (packed declarations) |
| Packed artifacts expose no raw-card API | vault `verify-merchant-only`/`verify-publishable`; facade `verify-package-surface` |
| Credentials never in state or logs | `clientSecret`/`sdkAuthorization` forbidden on every declaration except the three input types, pinned to `string` |
| Provider text never shown to customers | library-owned copy; tests assert provider strings are absent |

---

## 10. Workarounds and known gaps — where, why, and what would remove them

| # | Area | Workaround in place | Why it exists | Removal path |
| --- | --- | --- | --- | --- |
| 1 | **Local package linking** (client-core `package.json`, `metro.config.js`, `reactNativeWeb/webpack.config.js`) | `portal:` links to the sibling repos; Metro `watchFolders` filtered to directories that exist; `extraNodeModules` + `blockList` pin `react`/`react-native` to the app's copies; webpack `symlinks: false` + absolute aliases | Neither package is published yet; the linked repos carry their own React for their tests | Publish vault then facade; pin semver; delete the linking block |
| 2 | **VGS tokenization route** (`providers/vgs/adapter.tsx`) | Defaults to `/post`; `route_id`/`cname` are carried through only when the session states them (today it never does) | No backend/dashboard source of truth for the route; hyperswitch-web uses the same default | Backend to carry the route in `vault_details`, or move to VGS `createAliases()` |
| 3 | **VGS + eligibility** (`strategy.ts`) | Fails closed (`eligibility_unavailable_for_provider`) | The check needs a PAN the provider never yields | Product decision, or an alias-capable eligibility endpoint |
| 4 | **VGS `reset()`** (`CardPaymentSession.tsx`) | Remounts `<HyperswitchForm key>` | The VGS field ref exposes only `focus`/`blur` | Provider SDK `clear()` |
| 5 | **VGS `disabled`** | `pointerEvents="none"` wrapper | VGS inputs have no `editable` prop | Provider SDK `editable` |
| 6 | **VGS error text / borders** | Facade emits per-field messages on `onFormStateChange`; client-core draws them; the facade's stack fallback draws a `<Text>` under each VGS slot | VGS inputs render no error text; the interim `ProviderCardField` chrome was removed as a duplicate design system | None needed — this is the intended composition model |
| 7 | **VGS expiry and holder name in JS** (`parseTokenizedCard.ts`) | The route echoes the real expiry (and holder) as plain strings | VGS format-preserving routes alias PAN/CVC only | Alias the expiry at the route and treat it as an alias throughout, if required |
| 8 | **Single error line** (client-core `VaultCardElement.res`) | `errorDisplay: 'none'` on every field + one `<ErrorText>`; error borders via `fieldStyles.container` | The vault couples the error message and the error border under one switch; `none` is its documented "host draws" mode | None needed |
| 9 | **Joined-box look** | Per-field `container` border overrides (bottom/top/side widths halved, corners zeroed) | Provider fields own their own boxes | None needed |
| 10 | **Legacy `publishable key + client_secret`** (vault `VaultCredential`, ADR-0009) | Both credential shapes accepted; `sdkAuthorization` wins | Every pre-`sdkAuthorization` integration still uses it | Backend decision to retire the shape |
| 11 | **Type friction on the linked vault** (`CardPaymentSession.tsx`) | One `as never` cast on `children` | Two `@types/react` copies meet under the portal link | Disappears on npm consumption |
| 12 | **Saved VGS card CVC** (client-core saved-card flow) | **No workaround** — a return-user VGS card confirms with the ordinary body and the backend answers `IR_04` | The proxy operation requires `payment_method_data.vault_card_token.card_cvc` with an **aliased** CVC collected in a VGS field (what hyperswitch-web does); the saved-PM list carries no per-card vault indicator, so sending `vault_card_token` blindly would break internal-locker cards | Implement ADR-0008 (VGS CVC widget on the saved screen); interim product option: hide saved cards on VGS profiles |
| 13 | **Backend `vault_details` shape** | Client expects `{vault_type, vault_data}` (matches hyperswitch-web) | The hyperswitch checkout available locally has `{internal_vault, external_vault_details}` and no `vaulting_action` | Pin the backend release; capture a real `session_tokens` fixture |
| 14 | **`vaulting_action` absent** | Fails closed with its own code `vault_configuration_missing_action` | Fail-open to direct is the historical hole | Product decision on rollout for profiles that don't emit it |
| 15 | **`PAYMENT_METHOD_INFO_CARD` for new cards** | Not emitted | The old payload carried BIN/last4/expiry, which the card-safe model forbids | Version the event, or emit a reduced payload under a **new** name from `VaultFormState` |
| 16 | **Generated-code shapes** (vault) | `VaultPaymentResult`, `paymentCardSource` are records, not `@tag` variants; `public.ts` republishes them as hand-written unions; `verify-result-mapping`/`verify-card-source` pin the two together | ReScript compiles payload-less variant constructors to bare strings | None needed |
| 17 | **Test hygiene** (client-core) | `App-test` renders inside `act` and unmounts; `CardStrategy-test` uses a real module mock, not `virtual`; jest ignores `.claude/worktrees` | Late request resolutions after teardown; virtual mocks stop applying once the real module is resolved in the same worker | None needed |
| 18 | **Facade jest** | `customExportConditions` source condition fixed from a scaffold placeholder | create-react-native-library template left `<%- project.sourceCondition -%>` | None needed |

---

## 11. Verification map

| Gate / suite | Repo | Proves |
| --- | --- | --- |
| `yarn build` (check-submodule, icon-coverage, rescript, check-generated, public-surface, tsc types, rollup, assets, consumer types, docs, flow-docs, publishable) | vault | generated files reproduce exactly; runtime and declared surfaces agree; docs describe the current surface |
| `yarn verify` (18 gates on a freshly packed tarball) | vault | contents, export map, declarations, event surface, result mapping, card-source closure, final-confirm and orchestration behaviour against mocked fetch, credential shapes, eligibility contract |
| `type-tests/consumer.tsx`, `type-tests/orchestration.tsx` | vault | what compiles and what must not |
| `tsc` strict, `jest` (15 suites / 125 tests), `bob build`, `verify:package` | facade | strategy truth table incl. eligibility and route pass-through; confirm routing; provider text suppression; legacy credential forwarding; VGS rules and `VGSError` classification; `CardPaymentSession` tree per strategy, façade handle, local gate, network gate, state emission, reset; packed surface |
| `rescript -warn-error +a-4-9`, `verify-no-card-ownership`, `jest` (3 suites / 33 tests), Metro Android bundle, RN-Web bundle | client-core | compiles; no card ownership; raw-config ladder incl. pending-while-loading; result mapping; the shipped bundle contains netcetera-3ds, paypal, scancard, facade, vault |

Not covered by automation: live backend calls, device behaviour, accessibility, RTL rendering, the
VGS route against a real vault.

---

## 12. Release order and checklist

1. Commit the vault working tree (including the `VaultProviderCard` deletion and ADR-0009); `yarn build && yarn verify`; publish `@juspay-tech/react-native-hyperswitch-vault`.
2. Pin the facade's dependency to the published vault; `tsc && jest && bob build && yarn verify:package`; publish `@juspay-tech/react-native-hyperswitch-payment-methods`.
3. In client-core replace the `portal:` entries and `resolutions` with the published versions; delete the linking block from `metro.config.js` and the absolute aliases from `webpack.config.js`; `yarn install`; `rescript`, gate, `jest`, `bundle:android`, `bundle:ios`, `build:web`.
4. Capture one real `/payments/{id}/session_tokens` response from the target environment and add it as a strategy-test fixture before reading device results as proof of the vault flows.
5. Device E2E: direct (with and without `sdkAuthorization`), Hyperswitch vault (mint + confirm, forced call-2 failure), VGS against a real vault and route, 3DS/DDC/redirect, co-badge, scan-card, RTL, accessibility.
6. Book the product decisions: `vaulting_action` absent, `PAYMENT_METHOD_INFO_CARD`, legacy credential future, VGS + eligibility, scan-card as default, saved VGS card (ADR-0008).


---

## Addendum — ADR-0010: the `./host` entry (2026-09-02)

The vault package now has one entry per audience:

| Entry | Audience | Runtime | Types |
| --- | --- | --- | --- |
| `.` | merchants | provider, four fields, ready-made form, namespace, aliases | `VaultFormHandle` = `tokenize` / `reset` / `focus`; no `eligibility` prop; `cardholderName: 'collect' \| 'omit'`; six-code `SafeVaultErrorCode`; state without `eligibility` |
| `./host` | payment-methods (for client-core) | the **same** provider and four fields, re-exported | `HostFormHandle` adds `confirmPayment`; full generated props; eight codes; state with `eligibility`; every confirm-input / navigation type |
| `./orchestration` | payment-methods | `confirmTokenizedCardPayment` | result types re-published from `./host` |

`dist/esm/host.js` is one re-export line over `index.js`; `===` identity is asserted against the
packed tarball, so there is one React context whichever entry a component came from. Nothing in any
flow changed — only where the types are published. payment-methods imports the form and every confirm
type from `./host` (`src/hyperswitch/vaultForm.ts`, `src/hyperswitch/confirmCard.ts`); client-core is
untouched. The merchant reference (`docs/merchant-api-reference.md`) now describes the root only; the
host surface has `docs/host-api-reference.md`.
