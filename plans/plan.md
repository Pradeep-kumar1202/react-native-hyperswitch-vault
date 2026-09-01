# Vault ↔ Client-Core Boundary Implementation Plan

> **For agentic workers:** implement task-by-task with TDD. Steps use `- [ ]`.
> Executed inline in this session (autonomous; no per-task human gate). No commits
> (task rule: do not commit/stage/push/publish/stage/unstage/stash/clean).

**Goal:** Make the vault library own the entire card boundary — cardholder name, PAN,
expiry, CVC, formatting, validation, brand, focus/readiness, card errors, the card
`payment_method_data`, **both** confirmation calls, and the sanitized navigation result —
and remove every public state-emission surface, then integrate it into client-core in a
vault mode that never sees a card value.

**Architecture:** The vault library (ReScript → genType → tsc → rollup) exposes one
imperative async `submit(submitArgs)` that runs the payment-method-session confirm with
the **vault** credential, then the final `/payments/{id}/confirm` with the
**payment-intent** credential, entirely inside the library, and returns a closed
navigation union. The intermediate payment token never leaves the library. Client-core
renders the library form in vault mode (activated only when the session AND the profile
agree), passes only non-card confirmation inputs, awaits the union, and drives navigation
directly.

**Tech Stack:** ReScript 11, @rescript/react, rescript-react-native, genType,
TypeScript 5, Rollup, Jest + react-test-renderer, Node verification scripts.

**Spec:** `docs/adr/0003-remove-state-emission-and-own-final-confirmation.md` and the task
prompt (authoritative), as corrected by the 2026-08-27 review (folded into the tasks below),
and then **amended by the architecture correction recorded in
`docs/adr/0004-library-owns-every-new-card-flow.md`** — see below.

---

## AMENDMENT — every new-card flow is library-owned (ADR-0004)

The plan above was written when Flow 3 meant *this library is not involved*: with vaulting
off, client-core kept its own `CardElement` and built its own confirm body. That is no
longer the design, and every statement below describing a "vault mode" that client-core
enters conditionally should be read with this amendment in force.

**What changed.**

| | Before | Now |
|---|---|---|
| Operations | `submit(args)` | `tokenize()` and `confirmPayment(input)` |
| Flow 3 card fields | client-core's `CardElement` | the library's, like every other flow |
| Flow 3 confirmation | client-core built `payment_method_data.card` | the library builds it |
| Which flow runs | implied by what was mounted | `cardSource`, required and closed |
| Eligibility | client-core, with the PAN it held | the library, with the PAN it owns |
| Co-badge and scan card | client-core | the library |

**The three flows, as built.**

```
Flow 1  tokenize()
  gates → POST /v1/payment-method-sessions/{id}/confirm  [vault credential] → a TOKEN

Flow 2  confirmPayment({cardSource: {type_: 'vault', session}})
  gates → POST /v1/payment-method-sessions/{id}/confirm  [vault credential]
        → POST /payments/{id}/confirm                    [payment-intent credential]
        → a navigation union

Flow 3  confirmPayment({cardSource: {type_: 'direct'}})
  gates → POST /payments/{id}/confirm                    [payment-intent credential]
        → a navigation union
```

**Constraints amended.**

- "The intermediate payment token never leaves the library" becomes: **the token is
  returned only by `tokenize()`, and stays internal for every confirmation flow.**
- "Client-core renders the library form in vault mode" becomes: **client-core renders the
  library form for every new-card flow.** There is no mode in which it renders its own.
- The card `payment_method_data` is library-built in Flow 3 too, from real card values —
  the one place a PAN reaches a payment confirm, reached only via `cardSource: direct`.
- Eligibility is no longer a fail-closed `unsupported_configuration`; the library performs
  the check. It is the single deliberate fail-open path, and `verify-eligibility.mjs`
  asserts that.
- `#card_not_eligible` is added to the closed public error union.

**Constraints unchanged.** Everything else in this document still holds: the removed state
surface stays removed, host input stays non-card and narrowly typed, no backend message is
forwarded, an unknown outcome is never auto-retried, and the package surface stays `.` plus
`./package.json`.

**New verification.** `verify-card-source.mjs` (the closed source union),
`verify-eligibility.mjs` (the reproduced contract and the fail-open policy), rule 5 of
`verify-flow-docs.mjs` (Flow 3 may not be documented as host-owned card entry), and
`docs/cardelement-parity-inventory.md` (what each old `CardElement` behaviour became).

## Global Constraints

- Do **not** commit, push, publish, stage, unstage, stash or clean. Stop after the report.
- Card values (cardholder name, PAN, expiry, CVC), formatted PAN, brand, BIN, last4, input
  length, validation/focus state, field errors, submitting state, the intermediate token,
  either credential, raw request, raw response, `payment_method_data`, and session ids must
  **never** cross the public boundary.
- Public package surface stays exactly `.` and `./package.json`. No `/embedded`, `/vault`,
  deep imports, controlled inputs, or public transport functions.
- Typing, focusing, blurring, validating and brand changes produce **zero** external
  callbacks.
- The result is a closed union; `submit()` never throws for a documented outcome.
- `submit()` before the fields are ready returns `not_ready` / `validation_error` with
  **no** network request. Because readiness is no longer emitted, the host may call early.
- Host confirmation inputs are **non-card only** and **narrowly typed**; a forbidden card
  key at any depth → fixed safe error, never silently accepted or stripped. The library
  builds the card subtree and attaches it **last** by explicit key assignment (never a
  generic deep merge).
- Never forward a backend error message; map to a fixed library-owned string, unknown →
  generic `#server_error`.
- Never auto-retry an unknown final-confirm outcome (no idempotency key).
- Keep vault `yarn build`, `yarn verify`, and the `example` Jest suite green after every
  phase. Keep client-core `yarn re:build` green after Phase 5.
- React and React-Native stay peer deps, never bundled.

## Canonical public types (used consistently across tasks)

```
// Result — closed navigation union, no token/card/raw data anywhere
type safeVaultErrorCode = [
  | #invalid_session | #invalid_card_data | #not_ready
  | #forbidden_card_data | #unsupported_configuration
  | #server_error | #unknown_outcome ]
type safeVaultError = { code: safeVaultErrorCode, message: string }  // message is library-owned
type nextActionType = [                     // exact closed set from AllPaymentHooks.res:467
  | #three_ds_invoke | #third_party_sdk_session_token
  | #display_bank_transfer_information | #invoke_ddc | #redirect_to_url ]
type safeThreeDs = { authenticationUrl: string, authorizeUrl: string, messageVersion: string,
  directoryServerId: string, pollId: string, delayInSecs: int, frequency: int }
type safeDdc = { iframeUrl: string, timeoutMs: int }
type safeSessionToken = { walletName: string, openBankingSessionToken: string }
type safeNextAction = { type_: nextActionType, redirectUrl?: string,
  threeDs?: safeThreeDs, ddc?: safeDdc, sessionToken?: safeSessionToken }
@tag("status") type vaultSubmitResult =
  | @as("succeeded") Succeeded
  | @as("processing") Processing
  | @as("requires_customer_action") RequiresCustomerAction({ nextAction: safeNextAction })
  | @as("failed") Failed({ error: safeVaultError })
  | @as("validation_error") ValidationError({ error: safeVaultError })
  | @as("not_ready") NotReady({ error: safeVaultError })

// Submit inputs — all NON-CARD, all narrow (derived from generateCardConfirmBody + web bodies)
type confirmTokenMode = [ #payment_token | #vault_card ]         // default #payment_token
type hostBrowserInfo = { userAgent?: string, acceptHeader?: string, language?: string,
  colorDepth?: int, screenHeight?: int, screenWidth?: int, timeZone?: int,
  javaEnabled?: bool, javaScriptEnabled?: bool,
  deviceModel?: string, osType?: string, osVersion?: string }   // scalars only, no card data
type hostCustomerAcceptance = { acceptanceType: string, acceptedAt: string,
  online: { userAgent?: string } }
type hostBillingAddress = { firstName?, lastName?, line1?, line2?, line3?, city?,
  state?, country?, zip? }                                       // all string, narrow
type hostBilling = { address?: hostBillingAddress, email?: string,
  phone?: { number?: string, countryCode?: string } }
type HostPaymentMethodData = { billing?: hostBilling, nickName?: string }  // narrow; NOT an open map
type vaultEndpointConfig = { baseUrl: string }                  // validated (Task 1.5)
type submitArgs = {
  paymentId: string,
  sdkAuthorization: string,                 // payment-intent credential (call 2 only)
  confirmTokenMode?: confirmTokenMode,       // default #payment_token
  paymentMethodType?: string,                // e.g. "credit"/"debit"; default "credit"
  paymentMethodData?: HostPaymentMethodData, // non-card only
  customerAcceptance?: hostCustomerAcceptance,
  browserInfo?: hostBrowserInfo,             // host supplies; library has no device info
  returnUrl?: string,
  paymentType?: string,                      // mandate: "new_mandate" | "setup_mandate"
  email?: string,
  eligibilityRequired?: bool,                // true → fail closed, no network (Task 1.5)
  endpoint?: vaultEndpointConfig,
}
```

`client_secret` is deliberately absent: a payment-intent `sdkAuthorization` is always
present in vault mode, and `generateCardConfirmBody` sends `client_secret` only when it is
absent.

---

## Phase 0 — Remove the public state-emission surface (P0)

### Task 0.1: Delete public state types and emitter; keep internal reducer

**Files:**
- Delete: `src/VaultPublicState.res` (+ `.gen.tsx`), `src/VaultStateEmitter.res`
- Modify: `src/VaultCardController.res` (drop `publicFields` + the `emitCardInfo`
  param/effect; keep `values`, `visibleErrors`, `fieldOk`, refs, `register`/`countOf`),
  `src/VaultFormHost.res` (drop `onStateChange`/`onFormStateChange`/emitter wiring; keep
  `presenceGate`, `machinery`, `contextValue`), `src/HyperswitchVaultForm.res`,
  `src/HyperswitchVaultFormProvider.res`, `src/CardNumberWidget.res`,
  `src/CardExpiryWidget.res`, `src/CardCVCWidget.res` (drop the per-field `onStateChange`
  prop + `VaultStateEmitter.use`), `src/VaultFormOptions.res` (delete `cardFormState`)

**Interfaces:**
- Produces: `VaultCardController.controller` without `publicFields`; `VaultFormHost.useHost`
  with no `notify` path. Internal reducer/context unchanged, unobservable from outside.

- [ ] **Step 1 — failing gate.** In `scripts/verify-event-surface.mjs` assert the packed
  `.d.ts` set declares **none** of the exact identifiers `onStateChange`,
  `onFormStateChange`, `cardFormState`, `vaultFormState`, `VaultFieldState`, `canSubmit`,
  `fieldsReady`, and no `complete`/`brand` **as an emitted member** (exact-name match; see
  Task 3.1 for the allowlist that keeps `brandIconMode`).
- [ ] **Step 2** — `node scripts/verify-event-surface.mjs` → FAIL (surface still present).
- [ ] **Step 3** — delete the two modules; strip the props/uses listed above.
- [ ] **Step 4** — `yarn re:build` → 0; `node scripts/check-generated.mjs` regenerates
  `.gen.tsx` (commit-free; just on disk).
- [ ] **Step 5** — the gate → PASS.

### Task 0.2: Purge the public state types from `public.ts`, docs, type-tests, examples

**Files:**
- Modify: `src/public.ts` (remove `CardBrand`, `VaultField`, `VaultFieldStatus`,
  `VaultFieldErrorCode`, `VaultFieldError`, `Vault{CardNumber,Expiry,CVC}State`,
  `VaultFieldState`, `VaultSessionStatus`, `VaultFormFields`, `VaultFormState`,
  `CardFormState`)
- Modify: `README.md`, `docs/app-integration.md`, `docs/control-surface.md`,
  `docs/public-api-baseline.md`, `type-tests/consumer.tsx`
- Modify examples: `example/src/*.tsx` (drop `onStateChange`/button-enable-by-state usage),
  `example/__tests__/*` (remove state-surface suites; the recursive walker in
  `fieldEvents.test.tsx` is repurposed by Phase 4, then that file is deleted)

- [ ] `tsc -p tsconfig.build.json` and `tsc -p tsconfig.consumer.json` → 0.
- [ ] Rewrite the state-callback prose in the four docs; `node scripts/verify-docs.mjs` →
  PASS.
- [ ] `example` Jest green (state-surface assertions removed/replaced).

**Phase verification:** `yarn build` 0, `yarn verify` 0, `example` Jest green.

---

## Phase 1 — Library owns final confirmation + safe navigation result (P0)

### Task 1.1: `VaultFinalConfirm.res` — the payment-intent confirm transport (internal)

**Files:**
- Create: `src/VaultFinalConfirm.res` (NO `@genType` — internal only)
- Test: `scripts/verify-final-confirm.mjs` (Node; bundles the compiled module via Rollup
  like `verify-result-mapping.mjs`, mocks `fetch`)

**Interfaces:**
```
type navOutcome =
  | Succeeded | Processing
  | RequiresAction({ type_: nextActionType, redirectUrl: option<string>,
      threeDs: option<safeThreeDs>, ddc: option<safeDdc>, sessionToken: option<safeSessionToken> })
  | Failed({ code: [#server_error], message: string })   // fixed message; backend text never forwarded
  | UnknownOutcome({ message: string })
type finalConfirmRequest = { baseUrl: string, paymentId: string, sdkAuthorization: string,
  body: JSON.t /* fully-built confirm body */, timeoutMs?: int, signal?: VaultConfirm.abortSignal }
let confirmPayment: finalConfirmRequest => promise<navOutcome>
```
- URL = `${baseUrl}/payments/${encodeURIComponent(paymentId)}/confirm`.
- Header `Authorization: <sdkAuthorization>` (raw, no scheme), matching `Utils.getHeader`
  when sdkAuthorization is present. Timeout/abort mirror `VaultConfirm`
  (`makeAbortController`, `setTimeout`, thrown/timeout/abort → `UnknownOutcome`).
- Response parse mirrors `PaymentConfirmTypes.itemToObjMapper` but keeps only the
  allowlisted navigation fields (`AllPaymentHooks.res:334-352`, `:467-472`). Status →
  outcome: `succeeded`→Succeeded; `requires_capture|processing|requires_confirmation|
  requires_merchant_action`→Processing; `requires_customer_action`→RequiresAction with the
  closed `nextActionType`; non-2xx→`Failed` with a **fixed** message keyed off a small
  allowlist of backend codes (mirror `VaultConfirm.publicMessageForCode`), unknown code →
  generic; unreadable/malformed 2xx→`Failed`. Card metadata present in any response body is
  never read into the outcome.

- [ ] Node test: assert each status→outcome; RequiresAction carries only navigation fields;
  non-2xx→Failed with a library-owned message (assert the backend's message string does NOT
  appear); thrown/timeout/abort→UnknownOutcome; malformed→Failed; a response body carrying
  `payment_method_data.card.card_number` never surfaces it.
- [ ] Run → FAIL (module missing). Implement. Run → PASS.

### Task 1.2: `VaultResult.res` — replace the token result with the navigation union

**Files:** Modify `src/VaultResult.res` (+ regen `.gen.tsx`); rewrite
`scripts/verify-result-mapping.mjs`.

**Interfaces:** the canonical `vaultSubmitResult` / `safeVaultError*` / `safeNextAction`
above. Mappers:
```
let notReadyWithMessage: string => vaultSubmitResult          // #not_ready
let invalidCardData: unit => vaultSubmitResult                // #invalid_card_data
let invalidSession: string => vaultSubmitResult               // #invalid_session (fixed msg)
let forbiddenCardData: unit => vaultSubmitResult              // #forbidden_card_data (fixed msg)
let unsupportedConfiguration: unit => vaultSubmitResult       // #unsupported_configuration
let fromPmsFailure: VaultConfirm.vaultError => vaultSubmitResult   // token-mint failure → mapped code
let fromNavOutcome: VaultFinalConfirm.navOutcome => vaultSubmitResult
```
- `fromNavOutcome`: Succeeded→Succeeded; Processing→Processing; RequiresAction→
  RequiresCustomerAction; Failed→Failed(#server_error, fixed); UnknownOutcome→Failed(
  #unknown_outcome, fixed).
- `fromPmsFailure`: `#invalid_authorization|#missing_session_id`→#invalid_session;
  `#invalid_card_data`→ValidationError(#invalid_card_data); `#unknown_outcome`→
  #unknown_outcome; `#http_error|#malformed_response|#missing_token`→#server_error.
- **No `token`, no card metadata, anywhere in the union or its `.d.ts`.**

- [ ] Rewrite the mapping gate: enumerate every `VaultConfirm.vaultErrorCode` and every
  `VaultFinalConfirm.navOutcome` (parsed from source, so a new one fails the gate); assert
  each maps to an allowed `(status, code)`; every message is one of the module's fixed
  strings; results carry only allowlisted members; `token`/`payment_method_token`/card
  metadata appear nowhere.
- [ ] Run → FAIL. Implement. Run → PASS.

### Task 1.3: Non-card input — narrow type + runtime deep-scan rejector

**Files:** Create `src/VaultPaymentMethodData.res` and `src/nonCardTypes.ts`
(genType-imported narrow types). Test `scripts/verify-noncard-input.mjs` +
`example/__tests__/nonCardInput.test.tsx`.

**Interfaces:**
```
// public narrow shapes live in nonCardTypes.ts (HostPaymentMethodData, hostBilling, ...)
let validateHostData: JSON.t => result<JSON.t, unit>   // Error(()) => forbidden card key present
let buildFinalPaymentMethodData: (~hostData: option<JSON.t>, ~cardSubtree: JSON.t) => JSON.t
```
- `validateHostData` recursively rejects (at any object depth, any array element) the exact
  keys: `card`, `card_number`, `cardNumber`, `card_cvc`, `cvc`, `card_exp_month`,
  `card_exp_year`, `expiry`, `expiryMonth`, `expiryYear`, `card_holder_name`,
  `cardHolderName`, `bin`, `bin_number`, `binNumber`, `last4`, `last_four`, `last4_digits`,
  `card_isin`, `card_network`, `brand`, `payment_token`, `vault_card`, `card_token`.
- `buildFinalPaymentMethodData` starts from the validated host object (billing, etc.) and
  attaches the library `cardSubtree` (`vault_card` for `#vault_card`; nothing here for
  `#payment_token`, which sits top-level) **last** by explicit assignment — never a deep
  merge.
- Fixed error surfaced by the caller: `#forbidden_card_data` →
  `"Card data must not be supplied by the host; the library owns the card fields."`

- [ ] Tests: accepts `{billing:{address:{...}}}`, `{nickName}`; rejects each forbidden key
  including nested (`{billing:{card_number}}`, `{payment_method_data:{card:{}}}`, arrays)
  with `Error`; no partial acceptance. `buildFinalPaymentMethodData` attaches `vault_card`
  last and a host `vault_card` attempt is already rejected upstream.
- [ ] Run → FAIL. Implement. Run → PASS.

### Task 1.4: Rewire `submit` to sequence both confirms under the two credentials

**Files:** Modify `src/VaultFormCoordinator.res` (`useMachinery` → `submit: submitArgs =>
promise<vaultSubmitResult>`), `src/VaultFormHost.res`, `src/VaultFormOptions.res`
(`vaultFormHandle.submit` signature + the new arg/type exports), `HyperswitchVaultForm.res`,
`HyperswitchVaultFormProvider.res`, `src/VaultConfirm.res` (card body gains optional
`card_holder_name` and `nick_name`; keep returning the metadata it already parses). Tests:
rewrite `example/__tests__/vaultFormLifecycle.test.tsx` and `customWidgets.test.tsx` around
the union + the two calls.

**Flow (single source of truth for the sequence):**
1. **Gates, no network.** `eligibilityRequired == true` → `Failed(#unsupported_configuration)`.
   Presence gate (registry) fails → `NotReady`. Local validity fails → `markSubmitAttempted`
   + `ValidationError(#invalid_card_data)`. `validateHostData(paymentMethodData)` is `Error`
   → `Failed(#forbidden_card_data)`. Session unusable → `Failed(#invalid_session)`. Missing
   `sdkAuthorization` → `Failed(#invalid_session)`. Endpoint invalid → `Failed(#invalid_session)`
   (Task 1.5).
2. **Call 1 — PMS confirm (vault credential from `session`).** Card object =
   `{card_number, card_exp_month, card_exp_year, card_cvc, card_holder_name?, nick_name?}`
   (`nick_name` lifted from `paymentMethodData.nickName`; cardholder from the field). On
   failure → `fromPmsFailure`. On success capture the token + metadata **in a local**, never
   stored on the component.
3. **Build the final body (A1 order).** Base = validated host non-card object (billing →
   `payment_method_data.billing`); then, by `confirmTokenMode`:
   - `#payment_token`: top-level `payment_token: <token>`; `payment_method_data` carries only
     host non-card data (billing) if any.
   - `#vault_card`: `payment_method_data.vault_card = {card_cvc:<token>, card_number:<token>,
     card_exp_month, card_exp_year, last_four, bin_number}` attached **last**.
   Add `payment_method: "card"`, `payment_method_type` (arg or `"credit"`),
   `browser_info` (from `browserInfo`), and optionally `customer_acceptance`, `payment_type`,
   `return_url`, `email`. No `client_secret`.
4. **Call 2 — final confirm (payment-intent credential `sdkAuthorization`, base URL from
   `endpoint` or default).** Map `navOutcome` via `fromNavOutcome`.
5. **State machine (A9).** The token exists only inside this async call; never returned,
   cached, or persisted. Definite `Failed` → discard, a fresh `submit()` re-runs both.
   `UnknownOutcome` → `Failed(#unknown_outcome)`, never auto-retry. Double `submit()` returns
   the same in-flight promise (one sequence). `reset()`/session-replacement/unmount aborts and
   discards the in-flight token (preserve the existing `useMachinery` abort/generation logic).

- [ ] Tests: success (token-mode) → one PMS call + one final call, result `Succeeded`, token
  absent from the result; `#vault_card` mode builds the `vault_card` body; missing
  `sdkAuthorization` → `Failed invalid_session`, **no** network; forbidden host card data →
  `Failed forbidden_card_data`, **no** network; `eligibilityRequired` → `unsupported_configuration`,
  **no** network; PMS ok + final non-2xx → `Failed server_error`, fixed message; PMS ok + final
  thrown → `Failed unknown_outcome`, **no** retry; double submit → one sequence; reset/unmount/
  session-replace mid-flight per `vaultFormLifecycle`.
- [ ] Run → FAIL. Implement. Run → PASS. `yarn build`/`yarn verify` green.

### Task 1.5: Endpoint validation + eligibility guard

**Files:** `src/VaultEndpoint.res` (validation) consumed by the coordinator; guard already
wired in Task 1.4 step 1.

**Interfaces:** `let validateEndpoint: option<vaultEndpointConfig> => result<option<string>, unit>`
- Accepts absent (→ default base URL). If present: scheme must be `https` (or
  `http://localhost` / `http://10.0.2.2` only when environment ∈ {sandbox, integration});
  reject any userinfo/credentials in the authority; reject a non-empty path or query;
  return the validated origin. The final URL always `encodeURIComponent`s `paymentId`.

- [ ] Tests: `https://api.example.com` ok; `http://evil.com` rejected in production;
  `http://localhost:5252` ok in sandbox, rejected in production; `https://u:p@h` rejected;
  `https://h/path` rejected; invalid → `Failed(#invalid_session)` with no network; a valid
  custom base URL is used for the final confirm **only** (PMS host stays env-selected).

**Phase verification:** `yarn build` 0, `yarn verify` 0, `example` Jest green.

---

## Phase 2 — Library-owned cardholder-name field (P1)

### Task 2.1: `CardholderNameField` + reducer field (requiredness decision: A8)

**Decision (A8):** optional by default; rendered **full-width above the card-number field**
in the ready-made form (always, per spec); as a standalone field it is **optional to mount**
— it is NOT one of the three required fields, so the presence gate does not demand it. Empty
→ omitted from the call-1 card object. No session/profile signal marks it required, so the
library does not enforce requiredness; a backend requiring it fails the confirm, surfaced as
a safe `Failed`. Backend acceptance proven: `Card.card_holder_name` (payments.rs:2540).

**Files:** Create `src/CardholderNameWidget.res` (+ `.gen.tsx`); export `CardholderNameField`
in `public.ts` and `standalone-entry.mjs` (and `HyperswitchVault.CardholderName`). Modify
`src/CardStateReducer.res` (add `cardHolderName` + meta + a validator slot),
`src/CardFieldLogic.res` (`onCardholderNameText`: trim outer whitespace only; allow Unicode,
spaces, apostrophes, hyphens, single word; no uppercasing, no normalization),
`src/VaultCardController.res` (expose the value to `cardDetails`), `src/CardFields.res`
(a plain text field module — no brand/cvc accessory), `src/CardFormView.res` (render
full-width above the number field, **not** fused into the number/expiry/CVC group),
`src/CardFieldOptions.res` (cardholder options: label/placeholder/labelBehavior/errorDisplay/
a11y; no brandIconMode/cvcIcon), `src/VaultConfirm.res` (`card_holder_name` in the card body
when non-empty). Test `example/__tests__/cardholderName.test.tsx`.

**Interfaces:** `CardholderNameField` accepts only options/styles/accessibility props —
**no** `value`/`defaultValue`/`onChange`/`onChangeText`/native events/length/name fragments.
Internal accessibility label present; blank-by-default (no placeholder/label/icon/error
unless configured); `VaultFieldHandle` = `{focus, blur}` only.

- [ ] Tests: full-width above PAN in the ready-made form; not fused; Unicode + apostrophe +
  hyphen + single word accepted; outer whitespace trimmed, inner preserved, not uppercased;
  value in no callback (there are none) and never returned; included in the PMS card body when
  typed, omitted when empty; a widget outside a provider throws; the field is optional to mount
  in a custom layout (submit still `Succeeds` without it).
- [ ] Run → FAIL. Implement. Run → PASS.

**Phase verification:** `yarn build` 0, `yarn verify` 0, Jest green.

---

## Phase 3 — Gates, package boundary, docs, ADR (P0/P2)

### Task 3.1: Tighten the verification gates (exact-name matching: A12)

**Files:** `scripts/verify-event-surface.mjs`, `verify-publishable.mjs`,
`verify-package-contents.mjs`, `verify-consumers.mjs`, `verify-merchant-only.mjs`,
`verify-result-mapping.mjs`, `verify-treeshaking.mjs`, `type-tests/consumer.tsx`.

- [ ] The event-surface gate matches **exact** declared property/export names with word
  boundaries, and an explicit allowlist for legitimate config (`brandIconMode`, `brandIcon`,
  `cvcIcon`) so a substring search for `brand` cannot false-reject them. It forbids exactly:
  `onStateChange`, `onFormStateChange`, `canSubmit`, `fieldsReady`, `complete` as an emitted
  member, and any `token`/`payment_method_token` member on a success result.
- [ ] `verify-publishable`/`verify-package-contents` additionally forbid a public transport
  function, a public `paymentMethodData` type that admits any card key, and a token result.
- [ ] `verify-consumers` `EXPECTED_ROOT_VALUES` gains `CardholderNameField`;
  `HyperswitchVault` gains `CardholderName`; the tree-shaking control set updated.
- [ ] Negative type-tests in `type-tests/consumer.tsx`: passing `{card_number}` /
  `{card:{}}` in `submit(...).paymentMethodData` is a **compile error**; a success result has
  no `.token`.
- [ ] `yarn verify` → PASS.

### Task 3.2: Docs, control-surface, public-api-baseline, ADR

**Files:** `README.md`, `docs/app-integration.md`, `docs/merchant-integration.md`,
`docs/control-surface.md`, `docs/public-api-baseline.md`,
`docs/adr/0003-remove-state-emission-and-own-final-confirmation.md` (present).

- [ ] Rewrite the app-facing docs around `submit(submitArgs)`, the navigation union, the
  non-card input contract, `confirmTokenMode` (PCI vs non-PCI, both bodies),
  `CardholderNameField`, the fail-closed eligibility rule, and the two-credential ownership.
  Remove all state-callback prose. `node scripts/verify-docs.mjs` → PASS.

---

## Phase 4 — Security proof + non-vacuity (P0) — two separate boundaries (A10)

### Task 4.1: End-to-end leak-detector test

**Files:** `example/__tests__/securityBoundary.e2e.test.tsx` (delete `fieldEvents.test.tsx`
after salvaging its recursive walker).

- [ ] Type a test cardholder name, PAN, expiry, CVC into the library fields; supply billing
  via `paymentMethodData`; mock `fetch` capturing both requests; call `submit(submitArgs)`.
- [ ] **Transport assertions (positive — these requests are SUPPOSED to hold the secrets):**
  the PMS-confirm request body carries the library card data + cardholder; the final-confirm
  request carries billing + the token-derived body (`payment_token` or `vault_card`). The
  leak detector does **not** scan these internal requests.
- [ ] **Public-boundary walker (negative):** recursively scan ONLY the returned
  `vaultSubmitResult`, the public form/field refs, the props surface, any thrown error, and
  host-visible state — assert none of {cardholder name, PAN, formatted PAN, expiry, CVC, BIN,
  last4, input length, brand, validation state, focus state, field errors, authorization, raw
  request, raw response, intermediate token} appears at any depth.
- [ ] Typing/focus/blur/validation fire **zero** host callbacks — assert the callback props
  are rejected at the type level (Task 3.1) and no emission is observed.
- [ ] The result has exactly the approved members for its branch.
- [ ] **Non-vacuity:** inject a synthetic PAN and a synthetic token into a **fake public
  result** and assert the walker flags them — never into the internal request.
- [ ] **Documented caveat** (in the test and `docs/merchant-integration.md`): host code can
  monkey-patch global `fetch` in the same JS process; the guarantee covers the supported
  public API, not malicious in-process instrumentation.
- [ ] Run → PASS.

---

## Phase 5 — Client-core integration (P1)

### Task 5.1: Parse `vault_details`; dual-signal activation; render the library; map the union

**Files (client-core):**
- Create: `src/components/vault/VaultCardForm.res` (ReScript bindings to
  `@juspay-tech/react-native-hyperswitch-vault` + the submit-result → callbacks mapping),
  `src/components/vault/VaultResultMapper.res`
- Modify: `src/types/AllApiDataTypes/SessionsType.res` (parse `vault_details.{vault_type,
  vault_data.sdk_authorization}`), `src/components/dynamic/CardElement.res` call-site (in
  vault mode render the library form, **no** RFF card fields, **no** `emitCardInfo`, **no**
  eligibility, **no** `payment_method_data.card`), `src/pages/payment/PaymentMethod.res`
  (fail closed when tokenize + eligibility), `DynamicComponent.res` (await the union; track
  only own pending), `metro.config.js`/`package.json` (link the packed tarball).

- [ ] **Activation (A5):** vault mode ⇔ `session.vault_details.vault_type == "hyperswitch"`
  **AND** `SdkConfigTypes.getVaultingAction(sdkConfigData) == Tokenize`. Either alone keeps
  the existing normal card flow untouched.
- [ ] **Eligibility fail-closed (A4):** when vault-active **and**
  `sdk_next_action.next_action == "eligibility_check"`, render a fixed error (not the form)
  and make **zero** payment requests.
- [ ] **Inputs:** pass `{paymentId, sdkAuthorization:<intent cred>, confirmTokenMode:<host
  config>, paymentMethodType, paymentMethodData:<billing/nickName only>, customerAcceptance?,
  browserInfo:<from nativeProp.sdkParams>, returnUrl?, paymentType?, email?}` to the library
  `submit`. No card value is ever passed.
- [ ] **Mapping (A13):** `VaultResultMapper` consumes the closed `vaultSubmitResult` and calls
  `responseCallback`/`errorCallback`/`browserRedirectionHandler` **directly**
  (Succeeded→PaymentSuccess; Processing→ProcessingPayments; RequiresCustomerAction→the
  matching next-action handler using the allowlisted fields; Failed/ValidationError/NotReady/
  unsupported_configuration→errorCallback with the safe message). It does **not** fabricate a
  fake backend JSON for `itemToObjMapper`.
- [ ] `yarn re:build` → 0. Add a Jest test proving vault mode renders the library form, passes
  no card value, maps each union branch to the right callback, and that a non-vault session
  still renders the RFF `CardElement` unchanged.

**Phase verification:** client-core `re:build` 0; targeted Jest green; non-vault card flow
untouched.

---

## Phase 6 — React-Native compatibility matrix (P2)

### Task 6.1: Pack once; test the tarball across the RN matrix (JS + native)

**Files:** `scripts/verify-rn-matrix.mjs` (new), `package.json` `peerDependencies`.

- [ ] `yarn pack` once. For each RN in {**0.79.7** (library min), **0.81.6**, **0.82.x**,
  **0.86.x** (client-core), **current-stable**}: assemble a throwaway app, install the
  tarball, run consumer `tsc`, Jest (react-test-renderer render of the form) and a Metro
  bundle (Android + iOS entry). Enable the New Architecture where the RN version supports it,
  and cover the relevant Legacy Architecture config.
- [ ] **Native Android Gradle build (A15):** attempt `assembleDebug` (or `assembleRelease`)
  for at least library-min RN, RN 0.86, and current-stable — Metro success alone does not
  prove native compatibility. Record exact exit statuses and any environment limits reached
  (Android SDK/NDK availability on this Linux host).
- [ ] **iOS native builds:** require macOS/Xcode, unavailable on this Linux host — reported as
  such, not silently skipped.
- [ ] Widen `peerDependencies.react-native` **only** to the range that actually passes; keep an
  upper bound below the next untested minor. Record every unsupported combination clearly.

---

## Self-review (checklist)

- **Spec coverage:** state-surface removal (Phase 0); final-confirm-in-library + safe
  navigation result + non-card input rejection + PCI/non-PCI bodies + endpoint validation +
  eligibility fail-closed + partial-success state machine (Phase 1, A1–A11); cardholder name
  with requiredness decision (Phase 2, A8); gates/package-boundary/docs/ADR with exact-name
  matching (Phase 3, A12); security proof split into transport vs public-boundary + non-vacuity
  + fetch caveat (Phase 4, A10); client-core dual-signal activation + direct union mapping +
  audited submodule note (Phase 5, A4/A5/A13/A14); RN matrix with native Android builds and
  iOS-unavailable (Phase 6, A15). Failure cases from the spec are exercised across 1.4/1.5/4.1.
- **Placeholder scan:** none — each task names exact files, the test intent, and concrete
  interfaces.
- **Type consistency:** `vaultSubmitResult`/`safeVaultError*`/`safeNextAction`/`nextActionType`
  defined once in "Canonical public types" and used by 1.1/1.2/1.4/4.1/5.1; `submitArgs`,
  `confirmTokenMode`, `HostPaymentMethodData`, `hostBrowserInfo`, `hostCustomerAcceptance`
  defined once and consumed by 1.3/1.4/5.1; `validateHostData`/`buildFinalPaymentMethodData`
  (1.3) consumed by 1.4; `validateEndpoint` (1.5) consumed by 1.4.

## Audited dependency change (A14)

Client-core's `shared-code` gitlink was advanced in the **working tree** from `07110ad` →
`1669cc2` — the commit BOTH repos pin (`react-native-hyperswitch-vault` `package.json`
`hyperswitch.sdkUtilsCommit`) — because client-core `main` calls
`SdkConfigParser.getPaymentExperienceFromPaymentMethods`, absent from `07110ad`. Working-tree
checkout only; no gitlink commit. Recorded in the final report as an audited build-environment
sync, not a code change to either repo under review.
