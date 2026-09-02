# New-card vaulting — independent architecture, security and compatibility review

**Scope:** new-card flows only, across `react-native-hyperswitch-vault`,
`react-native-hyperswitch/packages/@juspay-tech/react-native-hyperswitch-payment-methods`, and
`hyperswitch-client-core`. Saved-card and headless flows are out of scope.

**Snapshot:** 2026-09-01 22:45:08 (filesystem snapshot; live tree re-checked at 23:01).

**Repository state at review time**

| Repo | Branch | HEAD | Tree |
|---|---|---|---|
| `react-native-hyperswitch-vault` | `master` | `b5d4eae` | 2 staged doc adds, 2 staged `VaultProviderCard` deletions, `scripts/verify-docs.mjs` staged+unstaged, 7 example files modified/deleted, 3 untracked |
| `hyperswitch-client-core` | `feat/card-vaulting-via-payment-methods` | `bdb6d9bc` | 34 tracked entries (see §12) |
| `react-native-hyperswitch` | `rn-elements-76-plus` | `43b674b` | 14 tracked entries (payment-methods package only) |

Backend contract spot-checks used `hyperswitch` @ `1c7af731` (branch
`add-eligible-connector-sdk-config`) and `hyperswitch-web` @ `be7ac345` (main).

---

## 1. Executive verdict

**FAIL — not ready for runtime testing or release.**

Not for architectural reasons. The security half of this migration is genuinely well built: all
eleven security invariants hold with evidence, there is exactly one new-card
`/payments/{id}/confirm` implementation, aliases are never mined for fake BIN/last4, and unknown
vaulting configuration fails closed rather than falling through to a raw-PAN confirm. The vault
library's eighteen gates read the *packed tarball*, not source, so they are proofs rather than
assertions.

The verdict is FAIL for four things that are not security:

1. A merchant using legacy `publishable key + client_secret` auth can no longer pay with a new card
   **at all**.
2. The VGS path silently drops the merchant's eligibility requirement and card-scheme allowlist, and
   has **no card validation UX whatsoever**.
3. client-core's committed `package.json` and `metro.config.js` carry local `portal:` links and
   hard-coded sibling paths, and three published dependencies were removed while still being
   imported — a real Metro bundle proves Netcetera 3DS, PayPal and scan-card are now dead in the
   shipped RN bundle.
4. The branch's own `CardPaymentSession` test suite fails 5 of 11 cases right now, so every
   vault-path assertion in the boundary component is currently unverified.

None of the four is architectural. The strategy layer, the provider abstraction, the canonical
tokenized-card contract and the single confirm transport are all correctly placed. What is missing
is the last mile of compatibility and packaging.

**Tally:** P0 = 3 · P1 = 9 · P2 = 11 · P3 = 3 · Invariants 11/11 PASS · Open decisions = 6

### ⚠️ Read this first — the tree moved during the review

Files in `hyperswitch-client-core` and the payment-methods package were being edited by another
process while I was reading them:

```
PaymentMethodsBindings.res   22:38:21
VaultCardElement.res         22:38:42
CardPaymentSession.tsx       22:42:22
```

…against a review that started around 22:30. A layout refactor (host-owned `renderFields` slots)
landed mid-read, and `ProviderCardField.tsx` plus its test were deleted while I had them open.

Everything below is pinned to a filesystem snapshot taken at **2026-09-01 22:45:08**, re-verified
against the live tree at 23:01. Treat this as accurate *as of that timestamp*.

---

## 2. Architecture actually implemented

This is what the code does, not what the intended diagram says. The two now differ in only one
place, and it is in the intended direction — as of the 22:38–22:42 edits, client-core owns
arrangement through a `renderFields` slot callback rather than delegating layout to payment-methods.

```
hyperswitch-client-core
│
├─ NavigationRouter ──────────► CardStrategyContext { rawSdkConfig, vaultDetails }
│     sdkConfig()   ──► rawSdkConfig   (account_config.profile.vaulting_action, RAW)
│     sessionToken()──► vaultDetails   (session_tokens.vault_details, RAW subtree)
│                                      ↑ two independent promises; no "loading" flag on the second
│
├─ VaultCardSubmission.use()
│     CardStrategy.readVaultingAction → ConfigPending | ProfileMissing | ActionAbsent | ActionValue
│     CardStrategy.toFacadeAction     → undefined | #skip | #tokenize | #unknown
│     └─► payment-methods.resolveCardStrategy({vaultingAction, vaultDetails})
│
├─ ParentElement ── CARD group ─► strategyView
│     Renderable → <VaultCardElement>   Blocked → <VaultUnavailableNotice>   Pending → null
│
└─ VaultCardElement
      appearance / localisation / fieldOptions / fieldStyles / eligibility / vaultEndpoint
      renderFields(slots)   ◄── client-core owns width, gap, RTL, stacked/row placement
      │
      ▼
@juspay-tech/react-native-hyperswitch-payment-methods
│
├─ hyperswitch/strategy.ts       vaulting_action is authoritative
│     skip                     → direct              (VGS vault_details IGNORED — correct)
│     tokenize + hyperswitch   → hyperswitch_vault
│     tokenize + vgs           → external_provider(vgs)
│     tokenize + anything else → blocked
│     unknown                  → blocked
│     undefined                → pending
│
├─ hyperswitch/CardPaymentSession.tsx    ONE ref: {confirmPayment, reset, focus}
│     direct | hyperswitch_vault ─► <HyperswitchVaultFormProvider> + vault field components
│     external_provider          ─► <HyperswitchForm config> + provider widget components
│     both handed to renderFields(slots) — client-core never learns which
│
├─ providers/registry.ts → vgs | skyflow | basis_theory | evervault  (lazy require, optional peers)
├─ providers/vgs/adapter.tsx        collector.submit(path ?? '/post', 'POST')
└─ providers/vgs/parseTokenizedCard.ts   route body → canonical ProviderTokenizedCard
      │                                  (holds REAL expiry + holder name in JS)
      ▼
@juspay-tech/react-native-hyperswitch-vault
│
├─ root entry (merchant surface)             ├─ ./orchestration (payment-methods only)
│   HyperswitchVaultFormProvider + 4 fields  │   confirmTokenizedCardPayment(input)
│   VaultFormCoordinator.confirmPayment      │   VaultOrchestration.res — no React
│     ├ direct → VaultConfirmBody Direct     │     └ VaultConfirmBody ExternalToken
│     └ vault  → VaultConfirm (PMS confirm)  │
│                → VaultConfirmBody Token    │
│                        │                    │
│                        ▼                    ▼
│                 VaultFinalConfirm.confirmPayment()   ◄── the ONE confirm transport
│                 POST {base}/payments/{id}/confirm
│                 Authorization: <sdkAuthorization>    ← no api-key, no client_secret
│                        │
│                        ▼
│                 navOutcome → VaultResult.vaultPaymentResult
│                 {status, error?:{code,message}, nextAction?}  sanitized, no token, no card
▼
client-core: VaultResultMapper.classify → AllPaymentHooks.useNextActionDispatcher
             3DS / DDC / redirect / session-token / polling  (unchanged legacy machinery)
```

**The one legacy confirm transport that survives.** `AllPaymentHooks.useRedirectHook`
(`AllPaymentHooks.res:472`) still builds and POSTs `/payments/{id}/confirm` for non-card methods. It
is not reachable for cards: `DynamicComponent.handlePress` and `TabElement.handlePress` route to
`cardSubmission.submit` whenever `cardFlow` is `Some`, and `cardFlow` is `Some` for every
`payment_method === CARD`. `PaymentMethod.res` additionally fail-closes the classic route with
`card_route_unavailable`. `HeadlessUtils.res:268` is a third sender but is saved-card/headless (out
of scope).

---

## 3. Flow verdicts

| Flow | Verdict | What blocks a higher grade |
|---|---|---|
| **Direct / Skip** | **PASS with a P0** | Path correct end to end. Fails outright for legacy-auth merchants (F-P0-1). No live-backend execution. |
| **Hyperswitch Vault** | **UNPROVEN** | Session shape matches hyperswitch-web but not the `VaultDetails` struct in the hyperswitch checkout available here (F-P1-7). Vault-path component tests currently fail (F-P1-6). Same legacy-auth block. |
| **VGS external vault** | **FAIL** | Eligibility silently bypassed (F-P0-3), scheme allowlist bypassed (F-P1-2), zero validation UX + sheet-closing failure on an invalid card (F-P1-3), tokenization route unproven (F-P1-8). |

### Direct / Skip — traced

1. `sdkConfig()` resolves → `rawSdkConfig` set → `readVaultingAction` → `ActionValue("skip")` →
   `#skip`.
2. `resolveCardStrategy` returns `{kind:'direct'}`. **VGS `vault_details` present is ignored** —
   `case 'skip': return {kind:'direct'}` executes *before* `narrowDetails` is ever called. Pinned by
   two tests.
3. `CardPaymentSession` renders `<HyperswitchVaultFormProvider>` with **no** `session` prop. Fields
   are the vault's own components, placed by client-core's `renderFields`.
4. PAN/expiry/CVC live in `CardStateReducer` inside the vault. Read only by
   `controller.cardDetails()`, at submit time.
5. Validation: `CardStateReducer.errorsFor` using the pinned `hyperswitch-sdk-utils` submodule
   (`Validation.cardValid`, `checkCardExpiry`, `checkCardCVC`).
6. Press → `VaultCardSubmission.confirmWith` → `handle.confirmPayment(input)` → `confirmCardPayment`
   → `vaultFormHandle.confirmPayment({...input, cardSource:{type_:'direct'}})`.
7. `VaultFormCoordinator.runConfirmPayment` gate order: presence gate → validity gate → host-data
   card-key deep scan → paymentId gate → credential gate → cardholder-name mode resolution →
   `VaultCardSource.resolve` → endpoint validation → mount/operation agreement check → eligibility
   gate → `VaultConfirmBody.build(DirectPayload)` → `VaultFinalConfirm`.
8. Body: `payment_method_data.card.{card_number, card_exp_month, card_exp_year, card_cvc}` plus
   optional `card_holder_name`, `card_network` (enum allowlist), `nick_name`.
9. Response decoded into a closed `navOutcome`. Backend prose never crosses — `finalFailureReason`
   is a variant with **no string slot**.
10. Back through `VaultResultMapper.classify` → `useNextActionDispatcher`.

Double-submit is handled inside the vault: a second `confirmPayment` while one is in flight returns
the *same* promise. Unmount bumps `generationRef`, clears the in-flight slot, drops the minted-token
cache and aborts. `reset()` is a no-op while in flight.

**Proof client-core never receives PAN/CVC/raw expiry:** the only value crossing back is
`vaultFormState` (§5, invariant 9) and `cardPaymentResult`. Neither has a slot for a card value, and
`verify-event-surface.mjs` pins that against the *packed* declarations.

### Hyperswitch Vault — traced

1. `tokenize` + `vault_details.vault_type === 'hyperswitch'` + non-blank
   `vault_data.sdk_authorization` → `{kind:'hyperswitch_vault', session:{vault_details: raw}}`. The
   raw subtree is re-wrapped; nothing else from the session response crosses.
2. `confirmCardPayment` passes `cardSource:{type_:'vault', session}`.
   `VaultFormCoordinator.readSession` re-validates `vault_type` and the credential; an unusable
   session becomes `invalid_session` before any request.
3. Call 1: `POST {vaultBase}/v1/payment-method-sessions/{id}/confirm`, authenticated with the
   **vault** credential; session id decoded from the base64 `sdk_authorization` (`resolveSessionId`
   → `payment_method_session_id=`). Minted token cached in a module-local ref keyed by
   `(sessionKey, cardVersion)`.
4. Call 2: `VaultFinalConfirm` with the **payment-intent** credential and `payment_token` (or
   `vault_card` when `confirmTokenMode` asks).
5. The token is returned by `tokenize()` only. `vaultPaymentResult` has no `token` member;
   `verify-merchant-only` asserts *"the payment result declares no token in any branch"* against the
   packed `public.d.ts`.

**No duplicate tokenization:** the cache means a failed call 2 retries call 2 only. The reasoning is
recorded against the backend — `payment_methods_session_confirm` takes no idempotency key and
overwrites `associated_payment_methods`, so re-minting would vault the card twice. **No duplicate
confirm:** `UnknownOutcome` from call 2 is never retried automatically.

**Merchant/client-core never receives the token** — the only path to one is the separate `tokenize()`
operation, which client-core never calls.

### VGS — traced

1. `tokenize` + `vault_type === 'vgs'` + non-blank `vault_id` and `environment` →
   `{kind:'external_provider', config:{vault_type:'vgs', vault_data:{vault_id, environment}}}`. A VGS
   session missing `vault_id` is `blocked`, not attempted.
2. `CardPaymentSession` renders `<HyperswitchForm>`; widgets resolve `vgsAdapter` lazily. Card values
   live in VGS's native views; only `FieldState` (validity/emptiness/focus/brand) can come back.
3. Press → `providerFormHandle.submit(providerData)` → `collector.submit(options.path ?? '/post', 'POST')`.
4. `parseVgsTokenizedCard` reads `card_number`, `card_cvc`, `expiration_date` (or
   `card_exp_month`/`card_exp_year`), `card_holder` from the route body. Missing required fields fail
   loudly and name themselves. **`lastFour` and `binNumber` are never produced** — pinned by the test
   *"metadata is NEVER derived from a numeric alias"*.
5. Canonical `ProviderTokenizedCard` → `confirmTokenizedCardPayment` →
   `VaultConfirmBody.build(ExternalTokenPayload)` → `payment_method_data.vault_card` → the same
   `VaultFinalConfirm`.

The transport is genuinely shared, aliases stay aliases, the provider name never reaches the vault,
and providers other than VGS are refused *before rendering* (strategy blocks). The
`provider_unsupported_for_payment` refusal in `confirmCard.ts` is a correct second guard, currently
unreachable from the strategy path.

---

## 4. Ownership boundary review

| Concern | Intended owner | Actual owner | Verdict |
|---|---|---|---|
| Rendering composition | client-core | client-core (`VaultCardElement.renderFields`) | ✅ Correct |
| Provider selection | payment-methods | payment-methods (`strategy.ts`); client-core only narrows `vaulting_action` + forwards the raw subtree | ✅ Correct |
| Secure fields | vault / provider | vault field components; VGS native views | ✅ Correct |
| Raw card state | vault / provider | vault `CardStateReducer`; VGS collector. **Exception:** real expiry + holder name transit payment-methods JS on the VGS path | ⚠️ Partial |
| Validation | vault / provider | vault (sdk-utils); VGS reports state but nothing renders it | ❌ Gap |
| Tokenization | vault / provider | vault `VaultConfirm`; VGS `collector.submit` | ✅ Correct |
| Provider response parsing | payment-methods | `providers/vgs/parseTokenizedCard.ts`; vault has zero provider knowledge | ✅ Correct |
| Confirm body construction | vault | `VaultConfirmBody.res` — one builder, three closed payload variants | ✅ Correct |
| Confirm transport | vault | `VaultFinalConfirm.res`, one implementation, reached by all three flows | ✅ Correct |
| Next actions | client-core | client-core `useNextActionDispatcher`; vault only sanitizes and hands over | ✅ Correct |
| Eligibility | vault (needs PAN) | vault on direct/hyperswitch; **nobody** on VGS | ❌ Gap |
| Scheme allowlist | vault / provider | vault only; not applied on VGS | ❌ Gap |

Client-core contains **no** `if provider === 'vgs'` anywhere — verified by
`verify-no-card-ownership.mjs`, which fails if any `.res` file names a provider SDK or the vault
package, and proves it is not vacuous with nine synthetic positives and five permitted negatives.
Exactly one module, `PaymentMethodsBindings.res`, may name the facade package, and that too is
asserted.

**On the rendering decision:** the current code now matches the stated product intent — providers
render their own field chrome, client-core composes. The interim `ProviderCardField.tsx` (a
re-implementation of vault chrome around VGS inputs, living in payment-methods — exactly the
"duplicate card design system" the boundary forbids) was deleted during this review. That was the
right removal; it is also what removed VGS's only error display (F-P1-3).

---

## 5. Security invariants

| # | Invariant | Result | Evidence |
|---|---|---|---|
| 1 | PAN never enters client-core | **PASS** | PAN exists only in the vault's `CardStateReducer` and in VGS native views. `verify-no-card-ownership.mjs` passes across 200+ `.res` files: no `useField("payment_method_data.card.…")`, no card `payment_method_data` construction, no vault/provider import. `CardElement.res`, `CardSchemeComponent.res`, `ScanCardButton.res`, `ScanCardModule.res` deleted from disk and the gate asserts it. |
| 2 | CVC never enters client-core | **PASS** | Same gate. The saved-card exemption list is checked to be genuinely saved-card-only, and the five new-card-tree files are asserted not to reference any exempt module. |
| 3 | Raw expiry never enters client-core | **PASS** | No expiry value crosses. `vaultFormState` publishes `status/valid/touched/focused/brand/isCoBadged/eligibility/error` and no value. (Separate P2: expiry *does* transit payment-methods on the VGS path — one layer below client-core.) |
| 4 | Aliases never become fake PAN/BIN/last4 | **PASS** | `parseVgsTokenizedCard` emits no `lastFour`/`binNumber` at all; test *"metadata is NEVER derived from a numeric alias"*. `externalCardSubtree` writes them only via `optionalEntry`, so absent stays absent rather than `""`. |
| 5 | Provider tokens do not escape unless deliberately tokenizing | **PASS** | `vaultTokenizeResult` is the only published type with a `token`. `verify-merchant-only` parses the packed `public.d.ts` and asserts a successful tokenize carries *only* `token`, and that `VaultPaymentResult` mentions no token in any branch. VGS aliases go straight into the request body and are never returned. |
| 6 | One new-card confirm transport | **PASS** | Repo-wide search: `VaultFinalConfirm.res:262` is the only new-card sender. `AllPaymentHooks.res:472` and `HeadlessUtils.res:268` exist but are non-card / saved-card. `verify-final-confirm.mjs` and `verify-orchestration.mjs` both execute the transport against a mocked fetch. |
| 7 | Unknown vaulting config cannot fail open to direct PAN confirm | **PASS** | Two ladders. `CardStrategy.toFacadeAction` maps `ProfileMissing`, `ActionAbsent`, a non-string value and any unrecognised string to `#unknown` — never `#skip`. `strategy.ts` then blocks `#unknown`. Both tested, including `null / 42 / {} / []`. |
| 8 | Unsupported providers fail before tokenization | **PASS** | Stronger than required: `narrowDetails` returns `unsupported` for any `vault_type` other than `hyperswitch`/`vgs`, so the strategy blocks before the form renders. `provider_unsupported_for_payment` in `confirmCard.ts` is a second guard. |
| 9 | Merchant callbacks contain only allowed safe state | **PASS** | Packed `VaultPublicState.gen.d.ts` read directly — every member is a status enum, a boolean, a brand name, or a localized message. `verify-event-surface.mjs` pins it member-by-member. One caveat below. |
| 10 | Packed npm artifacts expose no raw-card-shaped API | **PASS** | Vault: `verify-merchant-only` extracts every declared property from the packed `dist/types/*.d.ts` and rejects forbidden names unless exempted *by file and by exact type*. Payment-methods: I read the tarball myself (295 files, no tests, no `ProviderCardField`, no raw-card props). **Caveat:** vault `HEAD` still contains `VaultProviderCard` with `cardNumber`/`cardCvc` — F-P1-5. |
| 11 | React/provider details do not leak into client-core strategy logic | **PASS** | `PaymentMethodsBindings.cardStrategy` is an *abstract* ReScript type read only through `@get` accessors for `kind`/`code`/`message`. Client-core cannot inspect the session, provider config, or any ref. `CardPaymentSessionHandle` exposes exactly `confirmPayment`/`reset`/`focus`; `vaultFormRef` and `providerFormRef` are module-private. |

**Caveat on invariant 9.** `onProviderError` hands client-core the raw thrown value from the provider
SDK; `VaultCardElement` reads `.message` and sends it to the backend logger. For VGS that string is
`validateVaultData`'s message, which interpolates `JSON.stringify(vault_data)` — vault id and
environment, never card data. Safe today, but it is an untyped value crossing into a log sink, so it
deserves a named-code mapping rather than a passthrough.

---

## 6. Merchant compatibility matrix

| Behavior | Status | Detail |
|---|---|---|
| Field placement & joined-box look | **Preserved** | `renderFields` reproduces number-full-width + expiry/CVC row; `splitCardFields=false` expressed through per-field border-radius/width style slots — the same trick the old `CardElement` played on `CustomInput`. |
| Merchant appearance config | **Preserved** | All 15 theme values (`primaryColor` … `errorMessageSpacing`) map onto `VaultFormAppearance`. |
| Localisation | **Preserved** | All eight validation strings plus `selectCardBrand` and RTL direction forwarded. |
| Test IDs | **Preserved** | `TestUtils.cardNumberInputTestId` / `expiryInputTestId` / `cvcInputTestId` passed through `fieldOptions` on both paths. |
| Placeholders / brand icon / CVC icon | **Preserved** | `paymentMethodLayout.cardBrandIcon` and `cvcIcon` map onto both vault fields and (as a boolean) the VGS glyphs. |
| Co-badge chooser | **Intentionally changed** | Present on direct/hyperswitch (`CardNetworkChooser`, `enabledCardSchemes`, network on the wire). Absent on VGS — no PAN available. Documented capability difference — *except* that `enabledCardSchemes` is also unenforced (F-P1-2). |
| Cardholder name | **Preserved** | `cardholderNameModeOf` yields `#external` when the field is configured (so `FullNameElement` keeps rendering it, value read from `payment_method_data.card.card_holder_name` in `tabDict`), else `#omit`. `FieldGrouper` is asserted to keep `CardHolderName` in the Name group — load-bearing, since moving it to Card would delete the field rather than move it. Duplicate-name contradictions refused with `unsupported_configuration` before any request. |
| Direct payment behavior | **Preserved** | Body materially the classic one; two deliberate differences (spaces stripped from PAN, two-digit year expanded) are canonical wire forms already proven by the PMS confirm. |
| Post-confirm (3DS, DDC, redirect, session token, polling) | **Preserved** | `useRedirectHook` split into `useNextActionDispatcher` + transport; the dispatcher is the same decision tree, now shared. `VaultFinalConfirm` reproduces `handleApiRes` including *next_action before status* and *cancelled is not processing*. |
| Loading / submitting state | **Preserved** | `setLoading(ProcessingPayments)` unchanged; vault sets its fields non-editable while `isSubmitting`. |
| Disabled state on provider path | **Regressed (minor)** | `disabled` reaches the vault provider only. VGS inputs stay editable during submission. |
| Inline card validation | **Regressed (VGS)** | Full parity on direct/hyperswitch. Nothing at all on VGS — F-P1-3. |
| `PAYMENT_METHOD_INFO_CARD` (new card) | **Regressed** | Was `{bin, last4, brand, expiryMonth, expiryYear, formattedExpiry, isCardNumberComplete, isCvcComplete, isExpiryComplete, isCardNumberValid, isExpiryValid}` emitted as the customer typed. Now emitted only from `SavedPaymentSheet.res`. New-card subscribers receive nothing. §8. |
| `FORM_STATUS` | **Regressed** | Card fields no longer register with react-final-form, so `isFormValid` excludes card validity and the event reports *complete* with an empty card. F-P1-4. |
| Scan card | **Regressed** | Vault owns it correctly (`ScanCardBridge`, optional `require`, gated on `isAvailable && cardNumber == ""`). But client-core dropped the `scancard` dependency, so `isAvailable` is false in the shipped bundle — proven, F-P1-1. |
| Legacy `pk + client_secret` auth | **Regressed** | New-card payment impossible without `sdkAuthorization`. F-P0-1. |
| Netcetera 3DS / PayPal | **Regressed** | Not card-related, but caused by this branch's dependency removal. F-P1-1. |
| Accessibility | **Unknown** | `accessible` is forwarded; vault fields keep accessibility labels, keyboard type and length limits even when `unstyled`. Not exercised — needs a device pass. |

### Failure matrix

| Scenario | Direct | Hyperswitch | VGS | Correct? | Notes |
|---|---|---|---|---|---|
| Invalid card | `validation_error / invalid_card_data`, sheet open, inline errors | same | `failed / tokenization_failed`, **sheet closes**, no inline error | ❌ | F-P1-3 |
| Incomplete fields | presence + validity gate, no request | same | VGS throws `VGSError`; adapter → `submit_failed` | ❌ | Adapter never emits `validation_error` |
| Eligibility denied | `card_not_eligible` before confirm | same, before call 1 | **never checked** | ❌ | F-P0-3 |
| Eligibility network failure | fail-open → Allowed | same | n/a | ✅ | Deliberate; matches client-core PRs #470/#474, asserted by `verify-eligibility` |
| Invalid / unusable session | n/a | `invalid_session`, no request | `blocked` at strategy time | ✅ | |
| Missing `sdkAuthorization` | `invalid_session` | `invalid_session` | `invalid_session` | ❌ | Correct as a gate, wrong as a product outcome — F-P0-1 |
| Provider tokenization failure | n/a | PMS failure → safe code | `tokenization_failed` + provider message | ⚠️ | Provider text passed verbatim to the customer |
| Provider malformed response | n/a | `MalformedResponse` | `provider_parse_failed`, names missing keys, no confirm call | ✅ | Best-in-class |
| Network failure on confirm | `unknown_outcome`, never retried | same | same | ✅ | No idempotency key on the endpoint |
| 4xx | allowlist → `Unauthorized`/`Rejected`/`SessionAlreadyUsed`/`SessionExpired`, else generic | same | same | ✅ | No backend prose crosses |
| 5xx | generic `server_error` | same | same | ✅ | |
| Malformed backend body | `MalformedResponse` | same | same | ✅ | |
| Unknown payment outcome | `unknown_outcome` | same | same | ✅ | Distinct code + message |
| Double submit | same promise returned | same | same | ⚠️ | Vault dedupes; client-core `.then` runs twice — F-P2-9 |
| Unmount during request | generation bumped, abort, cache dropped | same | orchestration call has no signal wired | ⚠️ | `timeoutMs`/signal not passed on VGS path |
| `reset()` during/after request | no-op in flight; clears state + token cache after | same | **no-op — provider form never reset** | ❌ | F-P2-1 |
| Blocked configuration | Notice in place of the form; press exits with the blocked code (`vault_configuration_missing_action` when the profile stated nothing) | — | — | ✅ | Code shown on screen outside production — good integrator affordance |

---

## 7. Findings

### P0

#### F-P0-1 · Legacy `publishable key + client_secret` merchants cannot pay with a new card

**Severity:** P0
**Repo/files:** client-core `src/components/vault/VaultCardSubmission.res`; vault
`src/VaultFormCoordinator.res`, `src/VaultFinalConfirm.res`, `src/VaultConfirmBody.res`

**Evidence.** `Utils.getHeader` still branches on the credential and is still used everywhere else
in client-core:

```rescript
let hasSdkAuth = sdkAuthorization->String.length > 0
if hasSdkAuth { [("Authorization", sdkAuthorization), …] }
else          { [("api-key", apiKey), …] }
```

`PaymentUtils.generateCardConfirmBody:59` still emits `client_secret` exactly when
`sdkAuthorization` is absent. So the legacy path is alive for wallets, saved cards and retrieve.

The vault sends only one header shape and no `client_secret`:

```rescript
("Authorization", request.sdkAuthorization),
("x-app-id", …), ("x-redirect-uri", "")
```

and `VaultConfirmBody` states the assumption explicitly — *"`client_secret` is deliberately absent:
a payment-intent `sdkAuthorization` is always present in this flow"*. `runConfirmPayment` then
refuses:

```rescript
} else if args.sdkAuthorization->String.trim->String.length === 0 {
  VaultResult.invalidSession(VaultResult.unusableSessionMessage)
```

and client-core supplies `nativeProp.paymentSessionConfig.sdkAuthorization->Option.getOr("")`.

**Why it matters / runtime impact.** Every new-card payment for a legacy-auth integration fails with
*"This session can no longer be used."* — 100%, deterministically, while wallets and saved cards keep
working. That reads to the merchant as a card-specific outage with a nonsense message.

**Recommended correction.** Decide first (§8), then implement: either teach `VaultFinalConfirm` the
`api-key` + `client_secret` shape behind an explicit credential union, or — if the backend genuinely
retired it — refuse at strategy resolution with a distinct code and a message that names the missing
credential.

---

#### F-P0-2 · client-core is unpublishable and unbuildable from a clean checkout

**Severity:** P0
**Repo/files:** client-core `package.json`, `metro.config.js` — both staged

**Evidence.**

```json
"dependencies": {
  "@juspay-tech/react-native-hyperswitch-payment-methods":
    "portal:../react-native-hyperswitch/packages/@juspay-tech/react-native-hyperswitch-payment-methods",
  "@vgs/collect-react-native": "^1.2.0",
  "…": "…"
},
"resolutions": {
  "@juspay-tech/react-native-hyperswitch-vault": "portal:../react-native-hyperswitch-vault"
}
```

```js
const linkedPackages = [
  path.resolve(__dirname, '../react-native-hyperswitch/packages/…/payment-methods'),
  path.resolve(__dirname, '../react-native-hyperswitch-vault'),
];
watchFolders: [...(defaultConfig.watchFolders ?? []), ...linkedPackages],
```

**Impact.** `portal:` specifiers cannot be published. A CI checkout without the two sibling repos
gets a Metro `watchFolders` entry pointing at a directory that does not exist. Making VGS a hard
dependency also means every consumer of client-core pays for the VGS SDK whether or not their
profile uses it.

**Correction.** Publish vault and payment-methods, pin real semver ranges, move the linked-package
plumbing into a dev-only config overlay, make VGS an optional peer.

---

#### F-P0-3 · The VGS path silently ignores a required eligibility check

**Severity:** P0 (silent fail-open on a merchant-configured control)
**Repo/files:** payment-methods `src/hyperswitch/confirmCard.ts`; vault `src/VaultOrchestration.res`

**Evidence.** Client-core computes the requirement and passes it:
`eligibilityRequired: CardStrategy.eligibilityRequired(clientData)`, true when
`sdk_next_action.next_action === "eligibility_check"`.

`confirmCard.ts` builds the orchestration input field-by-field and simply does not name it:

```ts
const orchestrationInput: OrchestrationConfirmInput = {
  tokenizedCard: card, paymentId, sdkAuthorization, environment,
  // endpoint, appId, paymentMethodType, paymentMethodData,
  // customerAcceptance, browserInfo, returnUrl, paymentType, email
};   // eligibilityRequired is absent
```

And `orchestrationConfirmInput` has **no slot** for it, so it could not be honoured even if passed.
The eligibility gate lives inside `VaultFormCoordinator`, which the orchestration entry does not use.

**Impact.** A merchant whose intent requires an eligibility check gets **no** check when their
profile is on VGS, and no error. This is exactly the silent-bypass shape the rest of the
architecture works hard to prevent.

**Correction.** Eligibility needs the PAN, which VGS never yields in JS. Honest options: (a) refuse
the combination at strategy time with a typed code, or (b) obtain a BIN-free / alias-based
eligibility endpoint. What must not stand is proceeding silently. Also belongs in §8 as a
product/backend decision.

---

### P1

#### F-P1-1 · Removing three published dependencies silently kills Netcetera 3DS, PayPal and scan-card

**Repo/files:** client-core `package.json` (staged) vs `Netcetera3dsModule.res:27`,
`PaypalModule.res:26`, `PaypalButtonViewImpl.native.res:9`, vault `ScanCardBridge.res`

**Evidence.** `git show HEAD:package.json` had all three; the staged version has none. They are still
imported. `node_modules/@juspay-tech/` now contains only `payment-methods` and `vault`. I built the
real Android bundle to prove the effect:

```
$ react-native bundle --platform android --dev false \
    --entry-file index.js --bundle-output …/metro-android.bundle
EXIT=0   (4,304,156 bytes)

$ grep -o -i "juspay-tech/react-native-hyperswitch-[a-z0-9-]*" bundle | sort -u
juspay-tech/react-native-hyperswitch-payment-methods
juspay-tech/react-native-hyperswitch-vault
(netcetera-3ds, paypal, scancard: ABSENT)
```

The guarded `try { require(...) }` pattern means the bundle still *builds*; the modules resolve to
nothing and `isAvailable` is `false`. `launchScanCard` appears once (the vault's bridge) and the scan
button is gated on `ScanCardBridge.isAvailable && cardNumber == ""`.

**Impact.** Native 3DS falls back silently, the PayPal button stops rendering, and scan-card
disappears for every merchant who previously got it because client-core declared the dependency.
Nothing errors; the features just aren't there.

**Correction.** Restore the three dependencies, or promote them to optional peers with a documented
install step. If dropping scan-card by default is intentional, state it — the affordance disappears
rather than degrading.

---

#### F-P1-2 · `enabledCardSchemes` is not enforced on the VGS path

**Repo/files:** payment-methods `src/hyperswitch/CardPaymentSession.tsx`

**Evidence.** `enabledCardSchemes` is spread onto `<HyperswitchVaultFormProvider>` only. The
`external_provider` branch renders `<HyperswitchForm>` and never receives or applies it. No scheme
filter exists in the VGS adapter or the parser.

**Impact.** Network restrictions are enforced on direct and hyperswitch profiles and not on VGS ones.
The customer can complete a card the merchant does not accept and be declined downstream instead of
being told up front.

**Correction.** VGS *does* report `cardBrand` in its `FieldState`. Wire `onStateChange` back and gate
submission on the reported brand, or document the difference and refuse the combination.

---

#### F-P1-3 · VGS has no card validation UX, and an invalid card closes the payment sheet

**Repo/files:** payment-methods `src/hyperswitch/CardPaymentSession.tsx` (post-22:42 refactor),
`src/providers/vgs/adapter.tsx`, client-core `VaultResultMapper.res`

**Evidence.** Three facts compose:

1. The `renderFields` refactor dropped `onStateChange` from every provider widget and deleted
   `ProviderCardField`, which had been the only thing rendering an error line.
2. VGS's own inputs render no error text — `VGSTextInputBase.tsx` reports `validationErrors` through
   `onStateChange` and displays nothing.
3. The adapter catches VGS's thrown `VGSError` and returns:

```ts
return { status: 'error', vaultType: 'vgs',
         errors: [{ code: 'submit_failed', message: /* … */ }] };
```

— never `'validation_error'`. So `confirmCard.ts` falls to `failed('tokenization_failed', …)`, and
`VaultResultMapper.closesSheet` returns `true` for `failed`.

**Impact.** On a VGS profile, a customer types a bad card, sees nothing, presses Pay, and the payment
sheet closes with a failure. Direct and hyperswitch profiles show inline errors and keep the sheet
open.

**Correction.** Re-wire `onStateChange` into the slots, classify `VGSErrorCode.InputDataIsNotValid`
as `validation_error`, and give client-core a place to render a per-field message for provider
fields.

---

#### F-P1-4 · `FORM_STATUS` reports the form complete with an empty card

**Repo/files:** client-core `src/components/dynamic/RequiredFields.res`, `DynamicComponent.res`,
`src/hooks/FormStatusEmitter.res`

**Evidence.** The old `CardElement.res` registered card fields with react-final-form
(`useField("payment_method_data.card.card_number")` at lines 82–95), so `isFormValid` included card
validity. Those registrations are gone — the gate now *fails the build* if they return. `isFormValid`
is still fed straight into:

```rescript
let isComplete = !hasRequiredFields || isFormValid
let status = computeFormStatus(~isComplete, ~isEmpty)
```

**Impact.** A merchant driving their own Pay button off `FORM_STATUS` will enable it before the
customer has typed a card.

**Correction.** Feed the vault's `onFormStateChange` — which already reports `complete`, `valid` and
`canSubmit` — into the emitter. `VaultCardElement` already captures that snapshot into
`latestFormState` and then discards it (F-P3-1), so the wiring is half-built.

---

#### F-P1-5 · Vault `HEAD` still contains `VaultProviderCard` with raw-PAN-shaped names and provider names

**Repo/files:** vault `src/VaultProviderCard.res`, `src/VaultProviderCard.gen.tsx` — deleted in the
index, not committed

**Evidence.** Committed in `b5d4eae`. `git show HEAD:src/VaultProviderCard.gen.tsx`:

```ts
export type providerVaultType = "vgs" | "skyflow" | "basis_theory" | "evervault";
export type providerTokenizedCard = {
  readonly cardNumber: string;
  readonly cardCvc: string;
  // …
};
```

Two boundary violations in one file: raw-card-shaped property names, and provider identities inside a
library whose contract says it must never learn them. The live
`VaultConfirmBody.providerTokenizedCard` correctly uses `cardNumberAlias`/`cardCvcAlias` and carries
no provider field. The file's own comment references `verify-orchestration-surface.mjs`, which does
not exist.

The packed artifact is clean — `dist/types/` has no `VaultProviderCard.gen.d.ts` — because the
deletion is present in the working tree. The gates pass for the same reason.

**Impact.** Anyone building or publishing from `HEAD` rather than this working tree reintroduces the
dead surface. The green gate run is not evidence about `HEAD`.

**Correction.** Commit the deletion before anything else lands on this branch.

---

#### F-P1-6 · The boundary component's own tests fail: 5 of 11, all on the vault path

**Repo/files:** payment-methods `src/hyperswitch/__tests__/CardPaymentSession.test.tsx`

**Evidence.**

```
$ jest --no-cache src/hyperswitch/__tests__/CardPaymentSession.test.tsx
✕ renders the vault form with no session for direct
✕ renders the vault form with a session for hyperswitch_vault
✓ renders the provider fields — and no vault form — for external_provider
✓ renders the provider holder field only when the host asks to collect it
✓ renders nothing for blocked / pending
✕ exposes only confirmPayment/reset/focus, never the underlying handles
✕ routes confirmPayment to the vault handle with an explicit direct source
✓ routes confirmPayment to the provider submit, passing providerData through
✓ reports a typed failure instead of throwing when the strategy is blocked
✕ forwards reset and focus to the vault renderer

Element type is invalid … but got: undefined
Tests: 5 failed, 6 passed, 11 total
```

Cause: the component now renders `HyperswitchVaultFormProvider` + the four field components, while
the test's `jest.mock('../vaultForm')` still supplies only `HyperswitchVaultForm`. Collateral: with a
warm Jest cache the whole suite reports *"Test suite failed to run — Cannot find module
…/orchestration"* instead, which is how it slipped past a full `jest` run.

**Impact.** The three properties this test exists to prove — right tree per strategy, façade exposes
nothing else, `reset`/`focus` reach the vault — are all currently unverified on the vault path.

**Correction.** Update the mock to the current surface. Add `--ci` or a cache-clearing step so a
resolution failure cannot masquerade as a suite that ran.

---

#### F-P1-7 · The assumed `vault_details` shape cannot be confirmed against the available backend

**Repo/files:** payment-methods `src/hyperswitch/strategy.ts`; vault
`VaultFormCoordinator.readSession`; hyperswitch `crates/api_models/src/payments.rs`

**Evidence.** Both client packages expect:

```
vault_details: { vault_type: "hyperswitch" | "vgs",
                 vault_data: { sdk_authorization | vault_id, environment } }
```

which is **exactly** what `hyperswitch-web` (main, `be7ac345`) reads in
`src/Payments/VaultHelpers.res` — `getDictFromDict("vault_details")->getString("vault_type")`,
`vault_data->getString("sdk_authorization")`, `vault_data->getString("vault_id"/"environment")`. So
the RN shape matches the reference web SDK.

It does **not** match the `hyperswitch` checkout available here (branch
`add-eligible-connector-sdk-config`, `1c7af731`):

```rust
pub struct VaultDetails {
    pub internal_vault: Option<InternalVaultSessionDetails>,   // { sdk_authorization }
    pub external_vault_details: Option<VaultSessionDetails>,   // { "vgs": {external_vault_id, sdk_env} }
}                                                              // | { "hyperswitch_vault": {…} }
```

`grep -rni vaulting_action` across that checkout returns **nothing at all**.

**Impact.** If the deployed backend emits the struct above, `narrowDetails` reads `vault_type: ''`,
returns `{type:'none'}`, and *every* `tokenize` profile blocks. Both vault flows would be dead on
arrival, with a correct-looking fail-closed message.

**Correction.** Pin the contract: name the backend commit/release that serves `vaulting_action` and
the `{vault_type, vault_data}` session shape, and capture one real
`/payments/{id}/session_tokens` response as a fixture in the strategy tests. This is a
backend-contract item, not a code defect — I can prove the client matches hyperswitch-web and nothing
more.

---

#### F-P1-8 · The VGS tokenization route is a default `/post` with no source of truth

**Repo/files:** payment-methods `src/providers/vgs/adapter.tsx`, `src/hyperswitch/strategy.ts`;
client-core `VaultCardElement.res`

**Evidence.**

```ts
const { status, response } = await vgs.submit(
  options.path ?? '/post', options.method ?? 'POST', options.extraData);
```

`options` comes from `providerData`. `strategy.ts` builds `vault_data` from
`{vault_id, environment}` only — no `route_id`, no `path`, no `cname`. `VaultCardElement` passes no
`providerData` at all. The adapter's `Host` reads `data.route_id` and `data.cname`, which can
therefore never be set. `hyperswitch-web`'s VGS builder reads the same two fields and no route.

`/post` is the route used throughout the VGS SDK's own examples and README as an *echo* route. The
parser correspondingly expects the aliases at the body root — what an echo returns, not necessarily
what a production inbound route returns.

**Impact.** Unproven whether a production VGS profile tokenizes at all. If the merchant's route is
not `/post`, the submit 404s and surfaces as `tokenization_failed`; if the route wraps the body, the
parser fails with `provider_parse_failed`.

**Correction.** Backend/product: decide where the route comes from (session field, dashboard config,
or a fixed convention) and carry it in `vault_data`. Also worth evaluating VGS's dedicated
`tokenize()` / `createAliases()` APIs, which return an alias map directly and remove the route
question entirely.

---

#### F-P1-9 · `tokenize` before `vault_details` arrives renders a hard error, not a pending state

**Repo/files:** client-core `src/routes/NavigationRouter.res`, `src/contexts/CardStrategyContext.res`,
`src/components/vault/CardStrategy.res`

**Evidence.** `sessionToken()` and `sdkConfig()` are two independent promises. `rawSdkConfig` is set
on the config resolution; `vaultDetails` only on the session resolution. `pending` is derived from
`rawSdkConfig` alone:

```rescript
| ConfigPending => None      // → facade returns {kind:'pending'}
```

The sheet renders as soon as `clientData` exists — `ParentPaymentSheet` does not wait on session
tokens. So in the window where config has landed with `tokenize` and the session response has not,
`resolveCardStrategy` sees `vaultDetails: undefined` and returns `blocked('vault_session_unavailable')`,
and `ParentElement` renders `<VaultUnavailableNotice>`.

Worse than a flicker: if `sessionToken()` errors (`IR_16`, `IR_09`) or returns `JSON.Null`,
`setCardStrategyInputs` is never called and the card form **never appears**.

**Impact.** A visible "This payment cannot be completed right now" where the card form should be,
resolving to the form a moment later — or not at all.

**Correction.** Track session-token load state as a third value in `CardStrategyContext` and map "not
yet loaded" to `pending`, distinct from "loaded and absent".

---

### P2

**F-P2-1 · `reset()` and `disabled` do not reach the provider form.**
`const reset = useCallback(() => { vaultFormRef.current?.reset(); }, []);` — the provider branch has
no reset path, and `HyperswitchFormHandle` exposes only `submit`/`status`. `disabled` is spread onto
the vault provider only. *Impact:* after a failed VGS payment the card values stay on screen and
fields stay editable mid-submit. *Fix:* add `reset()` to `ProviderAdapter` and
`HyperswitchFormHandle`; pass `editable` through to provider widgets.

**F-P2-2 · `DynamicComponent` lacks the CARD fail-closed guard that `PaymentMethod` has.**
`PaymentMethod.res` refuses CARD on the classic route with `card_route_unavailable`;
`DynamicComponent.processRequest` has no such branch — unreachable today only because `cardFlow` is
`Some` for every card, which is a property of a different function. *Impact:* none today; a future
edit to the `cardFlow` condition would route cards down the legacy body builder silently. *Fix:*
mirror the guard and assert both in `verify-no-card-ownership.mjs`.

**F-P2-3 · Real expiry and cardholder name transit payment-methods JS on the VGS path.**
`parseTokenizedCard.ts` reads `expiration_date` / `card_exp_month` / `card_exp_year` / `card_holder`
from the route body into `ProviderTokenizedCard` as plain strings; VGS format-preserving routes
typically alias PAN and CVC and pass the expiry through. *Impact:* invariant 3 still holds (does not
reach client-core), but the stated boundary is that payment-methods owns raw values only through
provider-controlled secure components. *Fix:* document it deliberately, or alias the expiry at the
route.

**F-P2-4 · Provider error text is shown to the customer verbatim.**
`submitted.errors?.map(e => e.message).join(' ')` becomes the `message` on `tokenization_failed` and
`invalid_card_data` — e.g. `"VGS submit returned status 404."` *Impact:* undermines the vault's rule
that every customer-visible word is library-owned and localised. *Fix:* map provider codes to a
closed set with library copy; keep raw text for logs.

**F-P2-5 · payment-methods has no packaged-artifact gate.**
Scripts are `bob build`, `tsc`, `eslint`, `jest`. Nothing inspects the tarball. The vault has eighteen
such gates; the package client-core actually imports has none. I read the tarball manually (295 files,
no tests, no dead `ProviderCardField`, no raw-card props) but nothing keeps that true. *Fix:* port a
trimmed `verify-merchant-only` — assert the export map, that no declaration exposes a raw card value,
and that the vault's `/orchestration` entry is not re-exported from the payment-methods root.

**F-P2-6 · Jest config contains an unexpanded scaffold placeholder.**
`"customExportConditions": ["require", "react-native", "<%- project.sourceCondition -%>"]`. *Fix:*
replace with `react-native-hyperswitch-payment-methods-source`.

**F-P2-7 · client-core `yarn test` is red for an unrelated reason.**
Jest walks `.claude/worktrees/dazzling-chaplygin-397ffd/` and `.claude/worktrees/objective-mcnulty-31c0fb/`
and picks up stale copies. Full run: 12 failed, 3 passed. Scoped to `__tests__`: 2 failed (both
worktree copies), 3 passed, 28 tests passed. *Fix:* add `.claude` to `testPathIgnorePatterns` /
`modulePathIgnorePatterns`.

**F-P2-8 · The VGS validation-error test asserts a status the adapter can never return.**
*"a provider validation error surfaces without any confirm call"* feeds a hand-built
`{status:'validation_error'}`. The real `vgsAdapter.submit` returns `'error'`/`'not_ready'`/`'success'`
only. *Impact:* the test passes while the behavior it describes cannot occur — which is exactly why
F-P1-3 was not caught.

**F-P2-9 · Double submit runs client-core's completion handler twice.**
The vault returns the same in-flight promise, but `confirmWith` attaches a fresh `.then` each press,
so `handleSuccessFailure` / `dispatchNextAction` fire once per press. *Impact:* duplicate merchant
callbacks or a doubled 3DS redirect on a fast double-tap. No duplicate network call. *Fix:* guard on
loading state, or hold the promise in a ref.

**F-P2-10 · payment-methods README documents none of the new surface.**
No mention of `CardPaymentSession`, `resolveCardStrategy`, `confirmCardPayment`, `BLOCKED_MESSAGES`,
`renderFields`, or the republished vault form. *Impact:* the seam between the two packages has no
written contract outside source comments.

**F-P2-11 · The vault example app was gutted mid-branch.**
`MerchantCheckout`, `CustomLayoutCheckout`, `QuickStartCheckout`, `DeveloperPanel`,
`BareMinimumFields` deleted (−1,534 lines); `App.tsx` has its session fetch and `MerchantSession`
import commented out. *Impact:* the only runnable demonstration of the merchant API no longer
exercises a session, so `tokenize()` is all that can be demoed. No docs reference the deleted screens,
so no doc breakage.

---

### P3

**F-P3-1 · `latestFormState` is captured and discarded.**
`let latestFormState = React.useRef(None)` is written by `onFormStateChange` and read nowhere. It is
also the natural feed for F-P1-4 and any `cardInfo` replacement.

**F-P3-2 · Stale references.**
A comment cites `verify-orchestration-surface.mjs` (does not exist; the real script is
`verify-orchestration.mjs`). `VaultFinalConfirm` sets `timedOut := true` and never reads it.
`docs/adr/0008-saved-card-cvc-flow.md` is untracked and absent from the `CURRENT` list in
`verify-docs.mjs`.

**F-P3-3 · Vault docs do not describe the composed integration client-core actually uses.**
Docs are gated and internally consistent (`verify-docs`, `verify-flow-docs` pass) but present
`HyperswitchVaultForm` as the integration path. `CardPaymentSession` now uses
`HyperswitchVaultFormProvider` exclusively, with a source comment saying the all-in-one form "is
being retired". No ADR records that.

---

## 8. Open product / backend decisions

Kept separate from defects — none can be closed by writing code.

### ActionAbsent (profile loaded, no `vaulting_action`) — **OPEN**

Behaves exactly as specified: `ActionAbsent` → `#unknown` → `blocked`, re-coded to
`vault_configuration_missing_action` so it *is* distinguishable from a genuinely unknown value, and
distinct from `ConfigPending`. Tested on both counts, including the explicit assertion that a loaded
sheet must not sit in pending.

**What is not settled is the blast radius.** The outcome for an unstated profile is that the card form
is replaced by an error notice and a press exits the sheet. I could find no `vaulting_action` anywhere
in the hyperswitch checkout available here, so I cannot tell whether existing profiles emit it. If
they do not, this fails closed for **every current merchant**. Fail-closed is the right default;
whether to ship it before the field is universally populated is a product call.

### `PAYMENT_METHOD_INFO_CARD` / cardInfo — **OPEN**

Old contract emitted eleven members including `bin`, `last4`, `expiryMonth`, `expiryYear`,
`formattedExpiry` as the customer typed. New behavior emits **nothing** for new cards — which is at
least the safe failure mode; it is *not* a quietly reduced payload under the same name.

Exact parity would require the vault to publish BIN, last four and expiry on its state callback,
contradicting the model `verify-event-surface` enforces. Options: (a) accept the removal and version
the event; (b) emit a reduced payload under a **new** event name carrying
`brand`/`isCoBadged`/completeness, which the vault already provides; (c) widen the vault surface
deliberately, with an ADR. Do not pick (b) under the old name.

### Legacy `publishable key + client_secret` auth — **OPEN**

Is `sdkAuthorization` now mandatory for `/payments/{id}/confirm`, or is `api-key` + `client_secret`
still supported? Client-core still implements both everywhere except new-card. The answer decides
whether F-P0-1 is a vault feature gap or a documented deprecation.

### VGS route / proxy source of truth — **OPEN**

Nothing in the session, the strategy, or client-core supplies a route. The adapter defaults to
`/post`. Decide where `route_id` / path comes from — or move to VGS's `tokenize()`/`createAliases()`
and delete the question.

### VGS eligibility — **OPEN**

VGS yields no PAN or BIN in JS, so the check is impossible client-side. Today it is skipped silently.
Decide: refuse the combination, or provide an alias-capable eligibility endpoint. Either way it must
stop being silent.

### Scan-card availability — **NEWLY OPEN** (not on the original list)

The dependency removal makes it a decision: scan-card is now opt-in via a host install rather than
shipped by default. Defensible (a native package in a JS library's graph is a real cost) but it
changes what existing merchants get, and it is undocumented.

### Endpoint host separation — **RESOLVED, no action**

The vault already supports different hosts: `resolveBaseUrl` (eligibility + final confirm) and
`resolveVaultBaseUrl` (payment-method-session confirm) are separate, each validated (https-only
outside loopback, no userinfo/query/fragment, path prefixes preserved and normalised) with its own
environment default. Client-core passes the same base for both, which is a choice, not a limitation.

---

## 9. Test / gate assessment

| Gate | What it actually proves | Vacuous? | Sufficient? |
|---|---|---|---|
| `verify-no-card-ownership` (client-core) | No `.res` file registers a card field, constructs a card `payment_method_data`, calls eligibility, emits new-card `cardInfo`, imports the vault or a provider SDK, or assembles an orchestration body. Exactly one module names the facade. `FieldGrouper` keeps `CardHolderName` out of the Card group. | **No** — 9 synthetic positives + 5 permitted negatives | Strong for source. Blind to the bundle and to runtime data flow — a value crossing via a callback would not be seen. |
| `verify-merchant-only` (vault) | Packs a tarball, extracts it, and checks: export map is exactly `.` / `./orchestration` / `./package.json`; removed subpaths and deep imports do not resolve; exactly two entry bundles per format; no forbidden declared property outside a file-and-type-pinned exemption; field ref is exactly `focus`+`blur`; tokenize success carries only `token`; payment result mentions no token; the transport appears once and is not exported. | **No** | Best gate in the three repos. Property-name-and-type based, not substring based. |
| `verify-orchestration` (vault) | Executes `confirmTokenizedCardPayment` against a mocked fetch with no React present; asserts the emitted body and the sanitized result. | **No** | Good — runtime, not static. |
| `verify-event-surface` (vault) | Pins emitted state member-by-member against the *packed* declarations; widening it is a build failure. | **No** | Sufficient. |
| `verify-result-mapping` / `final-confirm` / `eligibility` / `card-source` / `noncard-input` | Every outcome maps to a navigation result with an exact member set; the confirm decodes every status and leaks nothing; the fail-open eligibility contract is asserted as a *decision*; the two card sources are closed and disjoint; host input is deep-scanned for card keys. | **No** | Sufficient. |
| `strategy.test.ts` (payment-methods) | 13 cases across the full truth table, including *skip beats a VGS session*, blank `sdk_authorization`, unsupported `vault_type`, case/whitespace, non-object details. | **No** | Sufficient for the table. Missing: a fixture built from a real backend response (F-P1-7). |
| `confirmCard.test.ts` | All three routes, cardholder-name fill, parse failure, unsupported-provider refusal *before* tokenizing, blocked and pending. | **One case** — the `validation_error` case (F-P2-8) | Otherwise strong. |
| `parseTokenizedCard.test.ts` | 10 cases including *"metadata is NEVER derived from a numeric alias"*, split-key expiry, `data.raw` fallback, non-string values, named missing fields. | **No** | Sufficient. |
| `CardPaymentSession.test.tsx` | Intended to prove tree-per-strategy, the façade, and ref forwarding. | **Failing** | **Currently proves nothing on the vault path.** F-P1-6. |
| `CardStrategy-test.js` (client-core) | The five raw states are kept apart; only a literal `skip` reaches direct; non-string values become `unknown`; the raw subtree crosses untouched; `ActionAbsent` gets its own code; refusal copy comes from the facade rather than a restated literal. | **No** | Strong. Missing: the session-not-yet-loaded race (F-P1-9). |
| payment-methods packaging gate | — | — | **Does not exist.** F-P2-5. |

**Highest-value missing tests**

- A `CardStrategyContext` test asserting `pending` — not `blocked` — while session tokens are in flight.
- A `vgsAdapter` test asserting a thrown `VGSError(InputDataIsNotValid)` becomes `validation_error`.
- A packaged-surface gate for payment-methods (three assertions would cover it).
- A confirm-body snapshot for the legacy-auth case, once §8 decides what that body should be.

**Not recommended:** broad component-render suites for client-core. The static gate plus the vault's
packed-artifact gates already cover the properties that matter, at lower cost.

---

## 10. Package / release readiness

### `@juspay-tech/react-native-hyperswitch-vault` 0.8.0 — **NOT READY**

The artifact itself is in good shape: 18 gates green; tarball contains exactly two entry bundles per
format plus declarations and assets; no `.map` files; no bundled peers; no `shared-code`; export map
is exactly root + `./orchestration` + `package.json`; `./orchestration` resolves while every deep
path is refused. React and React Native are correctly external and peer-ranged
(`react >=19 <20`, `react-native >=0.79 <0.88`).

**Blocked only on committing the `VaultProviderCard` deletion** (F-P1-5) — the green run describes the
working tree, not `HEAD`.

### `@juspay-tech/react-native-hyperswitch-payment-methods` 0.2.0 — **NOT READY**

`tsc` clean under strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`. 95 tests pass but one
suite fails (F-P1-6). Tarball well-formed — 295 files, tests excluded, `src/` shipped intentionally
for the `-source` export condition. Blockers: the failing suite, no packaging gate (F-P2-5), the jest
placeholder (F-P2-6), and a hard dependency on `@juspay-tech/react-native-hyperswitch-vault ^0.8.0`
that must be published first. Provider SDKs are correctly optional peers.

### `hyperswitch-client-core` — **BLOCKED**

`portal:` dependencies and `resolutions`; hard-coded sibling paths in a committed `metro.config.js`;
three published dependencies removed while still imported (F-P0-2, F-P1-1). ReScript compiles clean
under `-warn-error +a-4-9`; the ownership gate passes; both bundles build. It is the packaging, not
the code, that blocks.

### React / Metro / RN-Web — local-dev vs. publishable

Worth separating, because they look alike.

**Local-dev only:** the duplicate-React problem. Both linked packages carry their own
`react`/`react-native` for their own test runs; the metro config pins them to the app's copies via
`extraNodeModules` plus a `blockList` on the nested copies. Both packages declare React and React
Native as peers and neither bundles them — the vault's rollup config keeps `react`,
`react/jsx-runtime` and `react-native` external, and `verify-tarball` asserts no bundled peers.
Published from npm, the problem does not exist. Same for the one type friction acknowledged by a cast
in `CardPaymentSession`: the linked vault carries its own `@types/react`, so two structurally
identical `ReactNode` types meet at the children boundary.

**Not local-dev:** the plumbing is committed into the shipped config file. The webpack side
(`symlinks: false`, absolute aliases for `react`/`react-dom`/`react-native-web`) is more defensible
but has the same character.

### Build / generated-source consistency

Vault `dist/` (22:22) is newer than every `.res` (latest 17:30), so the published artifact matches
source. `check-generated.mjs` runs inside `build`/`prepack` and would fail on stale `.gen.tsx`. Both
repos pin `hyperswitch-sdk-utils` at `1669cc28955bf547b7fe35d6401ea47720019ff9` and **both submodules
are at exactly that commit** — a real consistency win. Client-core's `.bs.js` are gitignored and
current (`VaultCardElement.bs.js` 22:38:54 vs `.res` 22:38:42). No dead module ships declarations in
the packed vault.

---

## 11. Exact verification performed

### PASSED

| Command | Result |
|---|---|
| vault · `yarn verify` | EXIT 0 — 18 gates green (icon-coverage, mapping, tarball, consumers, treeshaking, style-bridge, event-surface, package-contents, merchant-only, docs, flow-docs, publishable, card-source, final-confirm, noncard-input, eligibility, orchestration). Tracked files unchanged. |
| payment-methods · `./node_modules/.bin/tsc` | EXIT 0, no diagnostics. |
| client-core · `rescript build -warn-error +a-4-9` | EXIT 0. |
| client-core · `node scripts/verify-no-card-ownership.mjs` | EXIT 0, including all 14 anti-vacuity checks. |
| client-core · `jest __tests__` | 28 tests pass across `CardStrategy-test`, `VaultResultMapper-test`, `App-test`. |
| client-core · `webpack --mode=production` (RN-Web) | EXIT 0, 5 warnings (3 optional provider SDKs absent, 2 bundle-size). Output written to scratchpad, not `reactNativeWeb/dist`. |
| client-core · `react-native bundle --platform android --dev false` | EXIT 0, 4,304,156 bytes to scratchpad. Evidence for F-P1-1. |
| payment-methods · `npm pack --dry-run` | 295 files; contents enumerated and reviewed. |

### FAILED

| Command | Result |
|---|---|
| payment-methods · `jest` | EXIT 1 — 14 suites pass, 95 tests pass, `CardPaymentSession.test.tsx` fails. Warm cache: *"suite failed to run"*. `--no-cache`: 5 of 11 cases fail. F-P1-6. |
| client-core · `jest` (unscoped) | EXIT 1 — 12 suites fail, all inside `.claude/worktrees/`. F-P2-7. |

### NOT RUN / BLOCKED

- `yarn typecheck` / `yarn test` in payment-methods — **BLOCKED**:
  `Internal Error: react-native-hyperswitch-libraries@workspace:. This package doesn't seem to be present in your lockfile; run "yarn install"`.
  I did not run `yarn install`; I invoked the local `tsc` and `jest` binaries directly instead, which
  is equivalent for these two scripts.
- Vault `yarn build` — **NOT RUN** deliberately. It runs `rescript`, which rewrites tracked `.gen.tsx`
  files, and another process was editing the sibling repos at the time. `yarn verify` covers the gates
  without touching generated sources.
- iOS bundle, Detox, device runs — **NOT RUN**: require simulators and native builds.
- Any live backend call — **NOT RUN**: no sandbox credentials, and the mock server points at a real
  sandbox profile. Every network claim in this report is derived from source and mocked-fetch gates,
  never from a live response.
- Vault `example/` tests — **NOT RUN**: no `test` script; not part of `verify` or `build`.

---

## 12. Working tree confirmation

**The review changed nothing in any of the three repositories.** Nothing was committed, pushed,
stashed, reset, cleaned or deleted, and no dependency was installed or updated.

Verified by capturing `git status --porcelain` before and after and comparing:

- **vault** — identical to the state at review start: 2 staged doc additions, 2 staged
  `VaultProviderCard` deletions, `scripts/verify-docs.mjs` staged + unstaged, 7 example files
  modified/deleted, 3 untracked files. `HEAD` still `b5d4eae`.
- **hyperswitch-client-core** — 34 tracked entries, unchanged by the review. `HEAD` still `bdb6d9bc`
  on `feat/card-vaulting-via-payment-methods`.
- **react-native-hyperswitch** — 14 tracked entries, unchanged by the review. `HEAD` still `43b674b`
  on `rn-elements-76-plus`.

*(This file, `NEW-CARD-VAULTING-REVIEW.md`, was added afterwards at the reviewer's request and is the
only file the review itself introduced.)*

### Artifacts written by commands run during the review

- `packages/…/payment-methods/lib/` — regenerated by `bob build`, which `npm pack --dry-run` triggers
  via `prepare`. **Gitignored** (`.gitignore:79`), so no tracked file changed. It also had to exist
  for the RN-Web and Metro bundles to resolve the portal link.
- Scratchpad only: the RN-Web output, the Android bundle, all logs, and the pinned source snapshot.
  Nothing was written to `reactNativeWeb/dist`.
- `yarn verify` packs into a temp directory and cleans up after itself; the vault's own `dist/` was
  not rebuilt.

### Changes made by something other than the review

Between 22:38 and 22:42 — during this review — another process modified
`client-core/src/components/vault/PaymentMethodsBindings.res` and `VaultCardElement.res`, modified
`payment-methods/src/hyperswitch/CardPaymentSession.tsx`, and deleted `ProviderCardField.tsx`
together with its test. That work introduced the host-owned `renderFields` layout slots. It is
reviewed here as of the 22:45:08 snapshot; anything landing after that is outside this report.

---

## 13. Recommended next steps

### Must fix before runtime testing

1. Restore the three removed dependencies in client-core, or make them documented optional peers
   (F-P1-1). Without this a device run silently tests a build with no 3DS, no PayPal and no
   scan-card.
2. Fix `CardPaymentSession.test.tsx` and make the suite fail loudly rather than "fail to run"
   (F-P1-6).
3. Commit the `VaultProviderCard` deletion so `HEAD` and the working tree agree (F-P1-5).
4. Confirm the backend session shape and capture a real `session_tokens` response as a strategy
   fixture (F-P1-7) — otherwise a device run cannot distinguish "vaulting works" from "vaulting never
   engaged".

### Must fix before publish

1. Resolve the legacy-auth question and implement whichever answer it produces (F-P0-1).
2. Close the VGS eligibility bypass — refuse or check, not skip (F-P0-3) — and the scheme-allowlist
   bypass (F-P1-2).
3. Give VGS card validation: wire `onStateChange`, classify `VGSError` as `validation_error`, stop
   closing the sheet on an invalid card (F-P1-3).
4. Replace `portal:` links and hard-coded metro paths with published versions plus a dev-only overlay
   (F-P0-2).
5. Add a packaged-surface gate to payment-methods (F-P2-5).
6. Fix `FORM_STATUS` so it reflects card completeness (F-P1-4), and the `pending`-vs-`blocked` race
   (F-P1-9).

### Product / backend decisions to book

1. `vaulting_action` absent — is fail-closed acceptable for the current merchant fleet?
2. `PAYMENT_METHOD_INFO_CARD` — accept removal, new event, or a deliberate vault-surface widening?
3. Legacy `publishable key + client_secret` — supported or retired?
4. VGS route source of truth, or a move to `tokenize()`/`createAliases()`.
5. VGS eligibility — refuse the combination, or provide an alias-capable endpoint.
6. Scan-card as an opt-in install rather than a default.

### Manual E2E still required

- Direct/Skip on iOS and Android: full payment, 3DS redirect, DDC, cancel, retry after failure.
- Hyperswitch vault: mint + confirm, then a forced call-2 failure to prove the token cache prevents
  double-vaulting.
- VGS against a real vault and route — the only way to settle F-P1-8.
- Co-badge selection reaching `card_network` on both the PMS confirm and the payment confirm.
- Accessibility and RTL on the composed layout.

### Optional cleanup

- Ignore `.claude` in client-core's jest config (F-P2-7).
- Fix the jest condition placeholder (F-P2-6); remove the unused `timedOut` ref and the
  `verify-orchestration-surface.mjs` reference (F-P3-2).
- Restore a runnable vault example (F-P2-11); document the payment-methods surface (F-P2-10) and the
  composed integration (F-P3-3).

---

*Prepared from source, generated declarations, packed tarballs, an Android Metro bundle and an RN-Web
webpack bundle, against a filesystem snapshot taken 2026-09-01 22:45:08. Claims about network
behavior are derived from code and mocked-fetch gates; no live backend call was made.*

---
---

# Addendum — remediation and sign-off (2026-09-02)

Every finding above that is an **implementation defect** has been fixed in the working trees of the
three repositories. Nothing was committed, staged, pushed or published. Every fix was re-verified with
the same gates and builds the review used, plus new tests written for each behaviour that had none.

## Sign-off

| Question | Answer |
| --- | --- |
| Architecture and ownership boundaries | **PASS** — unchanged from the review, now with the two boundary gaps (VGS validation, VGS eligibility) closed on the intended side of the boundary |
| Security invariants (11) | **PASS** — all eleven still hold; the two credential fields added are pinned by the same declaration gates as `sdkAuthorization` |
| Ready for runtime / device testing | **YES** — direct, Hyperswitch-vault and VGS paths, on a bundle that now contains Netcetera 3DS, PayPal and scan-card |
| Ready to publish | **NOT YET** — three items remain that cannot be closed from inside these repositories (below) |

## What was fixed, by finding

| Finding | Fix | Where | Proof |
| --- | --- | --- | --- |
| **F-P0-1** legacy `publishable key + client_secret` | The vault accepts the payment credential in either shape. A new internal `VaultCredential` module resolves `sdkAuthorization` (wins when non-blank) or the `publishableKey` + `clientSecret` pair; the confirm and eligibility transports send `Authorization` or `api-key` accordingly and `client_secret` is written into the body only for the legacy pair. client-core passes both shapes, exactly as `Utils.getHeader` does elsewhere. Recorded as ADR-0009. | vault `src/VaultCredential.res` (new), `VaultFinalConfirm.res`, `VaultEligibility.res`, `VaultConfirmBody.res`, `VaultFormCoordinator.res`, `VaultOrchestration.res`, `VaultFormOptions.res`, `VaultFormHost.res`; payment-methods `confirmCard.ts`; client-core `VaultCardSubmission.res`, `VaultCardElement.res`, `PaymentMethodsBindings.res` | `verify-orchestration` (legacy headers + body + precedence), `verify-final-confirm`, `verify-eligibility`, `verify-noncard-input`, `verify-merchant-only` (`clientSecret` forbidden except on the three input types), type-tests, `confirmCard.test.ts` |
| **F-P0-2** `portal:` deps / hard-coded metro paths | `metro.config.js` now filters the linked-package watch folders to those that exist, so a clean checkout does not crash Metro. **The `portal:` specifiers themselves remain** — replacing them requires publishing both packages, which was out of bounds for this pass. | client-core `metro.config.js` | Metro bundle EXIT 0 |
| **F-P0-3** VGS eligibility silently bypassed | Fail-closed at strategy resolution: `tokenize` + VGS + `eligibilityRequired` → `blocked('eligibility_unavailable_for_provider')`, so the form is never rendered without the check the merchant configured. Defence in depth in `confirmCardPayment` refuses the same combination before any tokenization. client-core passes the requirement it already computed. | payment-methods `strategy.ts`, `confirmCard.ts`; client-core `CardStrategy.res`, `VaultCardSubmission.res` | `strategy.test.ts` (3 cases), `confirmCard.test.ts`, client-core `CardStrategy-test.js` |
| **F-P1-1** Netcetera 3DS / PayPal / scan-card dead | The three dependencies are restored in client-core and installed. | client-core `package.json`, `yarn.lock` | Android Metro bundle now contains all three package ids; `launchScanCard` reachable |
| **F-P1-2** `enabledCardSchemes` unenforced on VGS | `CardPaymentSession` maps the provider-reported brand to the vault's brand union and refuses a press whose brand is outside the merchant's list, with the `unsupportedCard` message; `unknown` brands are never used to refuse. | payment-methods `CardPaymentSession.tsx` | `CardPaymentSession.test.tsx` (amex vs `['Visa','Mastercard']` refused; amex vs `['AmericanExpress']` passes) |
| **F-P1-3** no VGS validation UX; invalid card closes the sheet (**user issue 1**) | Three layers. (a) Every VGS input carries an explicit `NotEmptyRule` plus its format rule, so empty is never valid. (b) The adapter classifies a thrown `VGSError(InputDataIsNotValid)` as `validation_error`, field by field, instead of a tokenization failure. (c) `CardPaymentSession` gates the press locally on the reported field states and refuses with `invalid_card_data` before `collector.submit()` is ever called; the sheet stays open. | payment-methods `providers/vgs/adapter.tsx`, `CardPaymentSession.tsx` | `vgsAdapter.test.tsx` (rules count per field, VGSError → validation_error), `CardPaymentSession.test.tsx` (empty / invalid / wrong brand → no submit) |
| **F-P1-4** `FORM_STATUS` complete with an empty card | `CardPaymentSession` emits the vault-shaped form state on **both** paths (synthesised from provider field reports on VGS). client-core ANDs the card's `valid` into the form-status validity and counts the card as a required field. | payment-methods `CardPaymentSession.tsx`; client-core `VaultCardSubmission.res`, `DynamicComponent.res`, `TabElement.res` | `CardPaymentSession.test.tsx` (emission shape, `canSubmit`, no card value in the payload) |
| **F-P1-5** dead `VaultProviderCard` at HEAD | Still deleted in the working tree (staged deletion from before). **Needs a commit**, which was not permitted here. | vault | packed `dist/types` carries no such declaration |
| **F-P1-6** `CardPaymentSession.test.tsx` failing | Rewritten against the composed provider surface; grown from 11 to 20 cases. | payment-methods | 15/15 suites, 125 tests, run with `--no-cache` |
| **F-P1-9** `pending` vs `blocked` race | `CardStrategyContext` carries `sessionTokensLoaded`; `tokenize` resolves to `pending` until the session request has answered (with details, without, or in error). `skip` and unreadable actions do not wait. | client-core `CardStrategyContext.res`, `CardStrategy.res`, `NavigationRouter.res`, `UpdateIntentHook.res` | `CardStrategy-test.js` (5 new cases) |
| **F-P2-1** `reset()` / `disabled` on VGS | `reset()` remounts the provider form (the only way to clear a native input) and clears the reported states; `disabled` or an in-flight submit wraps the provider inputs in `pointerEvents="none"`. | payment-methods `CardPaymentSession.tsx` | `CardPaymentSession.test.tsx` (reset clears a revealed error) |
| **F-P2-2** missing CARD guard in `DynamicComponent` | Classic route split into `classicProcessRequest` + a `processRequest` that refuses CARD with `card_route_unavailable`, mirroring `PaymentMethod.res`; the ownership gate now asserts both. | client-core `DynamicComponent.res`, `scripts/verify-no-card-ownership.mjs` | gate green |
| **F-P2-4** provider text shown to customers | `confirmCard.ts` uses library-owned copy (`INVALID_CARD_MESSAGE`, `TOKENIZATION_FAILED_MESSAGE`); provider strings never reach the result. | payment-methods `confirmCard.ts` | `confirmCard.test.ts` asserts `PROVIDER-TEXT` / `404` are absent |
| **F-P2-5** no packaging gate for payment-methods | `scripts/verify-package-surface.mjs`: tarball contents, forbidden declared properties (with the same slot/record exemption logic as the vault), and that the vault `./orchestration` entry is not re-exported from the package root; with non-vacuity checks. Wired as `yarn verify:package`. | payment-methods | 23 checks green |
| **F-P2-6** jest scaffold placeholder | Replaced with the real source condition. | payment-methods `package.json` | jest green |
| **F-P2-7** client-core jest walks `.claude/worktrees` | Ignored via `testPathIgnorePatterns` / `modulePathIgnorePatterns`. | client-core `package.json` | 3/3 suites, twice |
| **F-P2-8** vacuous validation-error test | Now the real path exists (adapter returns `validation_error`); the test asserts provider text is not surfaced. | payment-methods | green |
| **F-P2-9** double submit runs client-core's continuation twice | `inFlightRef` in `VaultCardSubmission` keeps one continuation per submission. | client-core `VaultCardSubmission.res` | compiles; behaviour is a guard around the existing promise |
| **F-P2-10** payment-methods README | New section documenting `resolveCardStrategy`, `CardPaymentSession`, `renderFields`, the blocked codes and the credential shapes. | payment-methods `README.md` | — |
| **F-P3-1** discarded `latestFormState` | Now the source of the single error line, the field borders and the FORM_STATUS feed. | client-core `VaultCardElement.res` | — |
| **F-P3-2** stale refs | `timedOut` removed. | vault `VaultFinalConfirm.res` | — |
| **User issue 2** — three error texts instead of one | Every field's inline message is switched off (`errorDisplay: #none`, the vault's documented way of handing drawing to the host) and client-core draws **one** line under the card block — first problem in reading order: number, expiry, CVC, then network, then eligibility — with the offending field's border in the error colour. Identical on both providers because both emit the same state. | client-core `VaultCardElement.res` | `CardPaymentSession.test.tsx` proves `errorDisplay` reaches the vault fields; visual check on device still required |
| **Incidental**: client-core `App-test` crashed the Jest process after passing | The smoke test now renders inside `act` and unmounts, so late request resolutions do not update a dead tree. `CardStrategy-test` switched from a `virtual` mock to a real module mock, which had made it order-dependent. | client-core `__tests__/App-test.tsx`, `__tests__/CardStrategy-test.js` | 3/3 suites pass in two consecutive full runs |

## Not fixed, and why — user issue 3 (saved VGS card, IR_04)

**Root cause, from the backend in this checkout and from hyperswitch-web.** The router sends a
confirm to the *external vault proxy* operation only when the body carries
`payment_method_data.vault_card_token` (or `proxy_card`). client-core's saved-card body sends
`payment_token` + top-level `card_cvc` + `payment_method_data: {}`, which takes the ordinary confirm
path; for an externally vaulted payment method that path cannot produce the card data and fails with
`IR_04`. The same body works for a Hyperswitch-vault card because that path resolves the token
through the internal locker.

**The correct fix is the saved-card CVC vault flow, not a body tweak.** hyperswitch-web
(`SavedMethods.res`, `VGSVault.res`, `PaymentBody.res`) collects the CVC for a return-user card
*inside the VGS secure field*, tokenizes just the CVC through the VGS route, and confirms with
`payment_method_data.vault_card_token.card_cvc = <cvc alias>`. That is precisely what
`docs/adr/0008-saved-card-cvc-flow.md` (PROPOSED) and `plans/saved-card-cvc-implementation-plan.md`
describe, and saved-card flows were explicitly outside this migration's scope.

Two shortcuts were considered and rejected:

- *Always send `vault_card_token` with the plaintext CVC.* It would route **every** saved card —
  including Hyperswitch-vault and internal-locker ones, for which the proxy operation has no vault
  tokens — through the proxy operation and break them. The list response carries no per-card vault
  indicator to tell them apart (`CustomerPaymentMethod` has none in this backend).
- *Send it only when the session says the profile is on VGS.* Old cards saved before the profile
  moved to VGS would still be misrouted, and the merchant who chose VGS so that card data never
  touches Hyperswitch would now have plaintext CVCs doing exactly that. Web aliases the CVC first for
  that reason.

**Recommendation:** implement ADR-0008 as a follow-up — a VGS CVC widget on the saved-card screen,
tokenize the CVC alone, send `vault_card_token.card_cvc` — gated on the same
`tokenize + VGS` strategy this migration introduced. Until then, a return-user VGS card fails with a
backend error on this SDK; consider hiding saved cards for VGS profiles as an interim product
decision.

## Still open (cannot be closed from these repositories)

1. **`portal:` dependencies and `resolutions`** in client-core — need both packages published and
   real semver pins. Publishing was out of bounds for this pass.
2. **Backend contract for `vault_details` and `vaulting_action`** (F-P1-7) — the client matches
   hyperswitch-web; it does not match the `VaultDetails` struct in the hyperswitch checkout available
   here, and `vaulting_action` appears nowhere in that checkout. A real `session_tokens` response
   from the target environment should be captured as a fixture before device testing is read as
   proof of the vault flows.
3. **VGS route source of truth** (F-P1-8) — the strategy now carries `route_id` / `cname` through
   when a session states them, but no session does; the adapter still defaults to `/post`.
4. **Product decisions** from §8, unchanged: `vaulting_action` absent (fail-closed for the current
   fleet?), `PAYMENT_METHOD_INFO_CARD` (removal vs new event vs widening), legacy credential
   (supported or retired — the code now supports it; the ADR records that the future is undecided),
   scan-card as default, and now **VGS + eligibility** (the code fails closed; flipping to allow is a
   one-line change in `strategy.ts`, and must be a decision).
5. **`VaultProviderCard` deletion** must be committed (F-P1-5).

## Verification performed for the sign-off

| Repository | Check | Result |
| --- | --- | --- |
| vault | `yarn build` (check-submodule, icon-coverage, rescript, check-generated, public-surface, tsc types, rollup, assets, consumer types, docs, flow-docs, publishable) | **EXIT 0**, 11 stages OK |
| vault | `yarn verify` (18 gates, against a freshly packed tarball) | **EXIT 0**, 18/18 |
| payment-methods | `tsc` (strict) | **EXIT 0** |
| payment-methods | `jest --no-cache` | **15/15 suites, 125 tests** (was 95 with one suite failing) |
| payment-methods | `bob build` → `node scripts/verify-package-surface.mjs` | **EXIT 0**, 23 checks |
| client-core | `yarn install` (restored dependencies only; lockfile diff is the three packages) | **EXIT 0** |
| client-core | `rescript build -warn-error +a-4-9` | **EXIT 0** |
| client-core | `node scripts/verify-no-card-ownership.mjs` (now also asserts both CARD guards) | **EXIT 0** |
| client-core | `jest` (full, twice) | **3/3 suites, 33 tests**, both runs |
| client-core | `react-native bundle --platform android --dev false` | **EXIT 0**; bundle contains netcetera-3ds, paypal, scancard, payment-methods, vault |
| client-core | `webpack --mode=production` (RN-Web) | **EXIT 0** |
| all | live backend call | **NOT RUN** — no credentials; the saved-VGS analysis is from backend source and hyperswitch-web |

## Working trees after remediation

Nothing is staged or committed by this pass. Every change is an unstaged modification or a new
untracked file:

- **vault** — `src/VaultCredential.res` (new), `docs/adr/0009-legacy-payment-credential.md` (new),
  and unstaged edits to eight `.res` modules, three regenerated `.gen.tsx` (verified to reproduce
  exactly by `check-generated`), six gate scripts, two type-test files, three docs.
- **payment-methods** — `scripts/verify-package-surface.mjs` (new), unstaged edits to
  `CardPaymentSession.tsx`, `confirmCard.ts`, `strategy.ts`, `providers/vgs/adapter.tsx`, the
  fixture, four test files, `package.json`, `README.md`.
- **client-core** — unstaged edits to eleven `.res`/config/test files, `package.json` (three
  dependencies restored, jest ignore patterns), `metro.config.js`, `yarn.lock`.

Build outputs written: vault `dist/` (rebuilt), payment-methods `lib/` (gitignored), client-core
`.bs.js` (gitignored), and scratchpad-only bundles.
