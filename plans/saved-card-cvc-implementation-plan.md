# Saved-card CVC flow — implementation plan

Companion to [ADR-0008](../docs/adr/0008-saved-card-cvc-flow.md), which holds the decisions. This
holds the work.

**Phase 0 is blocking, and it has exactly one question in it.** The transport cannot be written
against an unknown header set, and everything else depends on the transport.

---

## Phase 0 — close the authorization contract (BLOCKING, no code)

**One question for whoever owns the payment-method-session API:**

> Does `PUT …/update-saved-payment-method` accept the raw `sdkAuthorization` the SDK already sends
> — as `POST …/confirm` demonstrably does — or does it require
> `Authorization: publishable-key=…,client-secret=…` **plus** `X-Profile-Id`?

**Do not synthesise the documented form by decoding `sdkAuthorization`**, even though it contains
all three parts. That invents an auth contract the SDK was not granted, from a payload whose
internal shape is not ours to depend on.

**Exit criteria:** answered in writing, ADR-0008 moved from `Proposed` to `Accepted`, its blocker
section replaced with the confirmed contract, and `PROPOSED` → `ACCEPTED` in `verify-docs.mjs`.

### Two things that are NOT blockers

| | Why not, and where it is handled instead |
|---|---|
| **Is the request body accepted as written?** | It is specified by the published contract. Build to it; Layer 2's smoke check confirms it against the real server. Treating a documented schema as unknown would block indefinitely on something a single test answers. |
| **Is the returned token the same value or a new one?** | Answered by decision, not by the backend: **always return the token the response carries, and document that merchants use that one.** Correct under either backend behaviour, so it needs no confirmation to build. |

---

## Phase 1 — transport, alone

The one piece that talks to the server. No UI, no state, no React.

**New:** `src/VaultSavedCard.res`

```rescript
type updateRequest = {
  vaultBaseUrl: string,
  sdkAuthorization: string,          /* the session's, for resolveSessionId + the header */
  paymentMethodToken: string,
  cvc: string,                       /* never logged, never returned */
  appId: option<string>,
  timeoutMs: option<int>,
  signal: option<abortSignal>,
}

let updateSavedPaymentMethod: updateRequest => promise<VaultResult.vaultTokenizeResult>
```

**Reuse verbatim, do not re-derive:**

| From | What |
|---|---|
| `VaultConfirm.resolveSessionId` | base64 → `payment_method_session_id`, with its two closed failures |
| `VaultConfirm` abort/timeout block (`:414-436`) | `AbortController`, caller-signal chaining, timeout → `unknown_outcome` |
| `VaultConfirm.appIdHeader` | the `x-app-id` spelling |
| `VaultEndpoint.resolveVaultBaseUrl` | host resolution incl. `vaultEndpoint` |
| `VaultResult.*` | the whole closed error vocabulary |

**Rules.** `PUT`, not `POST`. Body omits `card_holder_name`. Success reads
`associated_payment_methods[0].payment_method_token.data` and nothing else — absent ⇒ closed
`missing_token`. Non-2xx ⇒ closed code; **the backend message is never surfaced**. Timeout or
network failure ⇒ `unknown_outcome`, **never auto-retried**.

**Verification:** `yarn re:build`, plus the Layer-1 checks from Phase 5 written against this module
before it has a caller.

---

## Phase 2 — controller and coordinator

**New:** `src/SavedCardController.res` — a CVC-only reducer.

State is `{cvc, touched, focused, submitAttempted}` plus a `cvcVersion` counter incremented on every
CVC change, mirroring `cardVersion`'s role as the invalidation signal.

Deliberately absent: PAN, expiry, cardholder name, co-badge, eligibility, scan.

Exposes `publicSnapshot: unit => VaultPublicState.cvcState` — a **thunk**, so no snapshot is built
when nobody is listening. It calls the existing `VaultPublicState.cvcStateOf`; it does not build the
record by hand.

**New:** `src/SavedCardCoordinator.res`

```rescript
type machinery = {
  updateSavedPaymentMethod: unit => promise<VaultResult.vaultTokenizeResult>,
  reset: unit => unit,
  isSubmitting: bool,
}
```

**Gate**, in order: CVC non-empty ⇒ else `validation_error`; `Validation.checkCardCVC(cvc, brand)`
⇒ else `validation_error`; `paymentMethodToken` non-empty ⇒ else `not_ready`; session resolves ⇒
else `invalid_session`. There is **no presence gate** — the component owns the field, so it cannot
be missing or duplicated.

**In-flight**, copying `VaultFormCoordinator.res:228-264`: an `inFlightRef` holding the promise; a
second call returns the same promise; `abortInFlight()` on invalidation.

Everything read at call time goes through a ref, never a closure — the imperative handle is created
once, so a captured value would be the mount-time one for the component's life.

---

## Phase 3 — the component

**New:** `src/HyperswitchVaultSavedCardForm.res`

Props exactly as ADR-0008 specifies. It renders the CVC field itself and accepts **no children**.

### The reuse mechanism — decided

**Render `CardFields.Cvc`, not `CardCVCField`.**

`CardCVCWidget.res:33` calls `VaultWidgetContext.useRequired`, and that context carries a full
`VaultCardController.controller`. Reusing the widget would mean instantiating the entire card
reducer for one field, or fabricating a controller to satisfy a context the field does not need.

`CardFields.Cvc` takes no context. Its whole input is explicit props — `value`, `onChange`, `brand`,
`onFocus`, `onBlur`, `onBackspace`, `error`, `isValid`, `renderError`, `options`, `common`,
`onAnalytics`, `iconRight`, `reference`, the eight border props and `styles`.

The component therefore supplies:

| Prop | Source |
|---|---|
| `value` / `onChange` / `onFocus` / `onBlur` | `SavedCardController` |
| `brand` | the normalised `cardNetwork` hint, or `""` |
| `error` / `isValid` | the controller's visible error and field-ok |
| `options` | `CardFieldOptions.resolveCvc(cvcOptions, ~formWideUnstyled, ~labels)` |
| `common` | `{theme, isProcessing, editable, accessible}` built from `appearance` |
| `styles` | the merchant's `cvcStyles` |
| border props | the theme, as `BoundCardFields.Cvc` does |

`CardCVCField`, `VaultWidgetContext`, `BoundCardFields` and the existing hosts are then genuinely
untouched, and the rendered field is the same code the new-card form renders.

### Two details that will otherwise bite

- **Suppress the backspace navigation.** `CardFieldLogic.onCvcBackspace` returns `#focusExpiry` on
  an empty backspace. There is no expiry field here. Harmless today (the ref is null) but wrong; the
  saved-card controller ignores it rather than forwarding it.
- **Normalise `cardNetwork` before validating.** `Validation.getobjFromCardPattern` matches issuer
  strings exactly. Map `"American Express"` / `"amex"` / `"AMEX"` → `"AmericanExpress"`, `"Visa"` →
  `"Visa"`, anything unrecognised → `""` (the 3-or-4 default). One function, one test table.

**Modified:** `src/public.ts` (the component, its props type and `VaultSavedCardHandle`; **no new
emitted-state type**) and `src/standalone-entry.mjs` (the runtime binding —
`verify-public-surface.mjs` fails if the two diverge). `type-tests/consumer.tsx` gains positive
usage plus `@ts-expect-error` negatives asserting the CVC value is unreachable and that no
`canSubmit` / `SavedCardFormState` exists.

---

## Phase 4 — lifecycle and failure behaviour

### Input changes

| Input changes | Behaviour |
|---|---|
| `paymentMethodToken` | clear CVC, abort in-flight, discard cached result |
| `session` | the same, and re-resolve the session id |
| `environment` / `vaultEndpoint` | abort in-flight, re-resolve the base URL. **CVC retained** — it describes the card, not the host |
| `cardNetwork` | re-run validation and re-emit state; `valid` can flip with no keystroke |
| `appearance` / `cvcOptions` / `cvcStyles` | presentation only; no state change, no abort |

### Results

| Situation | Result |
|---|---|
| CVC empty | `validation_error` |
| CVC fails the length rule for the network in force | `validation_error` |
| `paymentMethodToken` empty or absent | `not_ready` |
| session missing or unreadable | `error` / `invalid_session` |
| second call while one is running | the first call's promise |
| token or session replaced mid-flight | abort, clear CVC, next call starts clean |
| `reset()` / unmount | abort, clear CVC, no state set afterwards |
| HTTP timeout or network failure | `error` / `unknown_outcome`, never auto-retried |
| 2xx without the associated payment-method token | `error` / `missing_token` |
| 4xx / 5xx | closed code; backend message never surfaced |

---

## Phase 5 — verification, in two layers

### Layer 1 — deterministic, required, offline

**New:** `scripts/verify-saved-card.mjs`, added to `yarn verify`. Pins **our** side:

1. method is **`PUT`**
2. URL is exactly
   **`{base}/v1/payment-method-sessions/{encodedId}/update-saved-payment-method`**, with the id
   percent-encoded — asserted against that literal path, and asserted **not** to be `/confirm`
3. the exact header set
4. body is exactly `{payment_method_token, payment_method_data:{card:{card_cvc}}}` — asserted to
   contain **no** `card_holder_name` and no other card member
5. token read only from `associated_payment_methods[0].payment_method_token.data`; a response
   carrying `associated_token_id` alone ⇒ `missing_token`

**New behavioural tests** (`example/__tests__/savedCardCvc.test.tsx`), `fetch` mocked:

- one CVC input renders; no PAN, expiry or name input exists
- `onStateChange` fires with `VaultCVCState`; **a recursive walk asserts no snapshot contains the
  typed CVC, any prefix of it, or its length**, with a non-vacuity control
- no callback ⇒ zero snapshots built
- double submit ⇒ one `fetch` call, one shared promise
- token change, session change and `reset()` clear the CVC and abort
- `environment` change aborts but retains the CVC
- `cardNetwork` change re-emits without a keystroke
- network table: `undefined` / `"Visa"` / `"American Express"` / `"amex"` / `"NotARealNetwork"` →
  the length accepted, **including the documented case that `valid` is true at three digits with no
  recognised hint**

**Existing gates that must stay green untouched:** `verify-event-surface` (no new `on*` name, no new
emitted type), `verify-merchant-only`, `verify-publishable`, `verify-public-surface`.

### Layer 2 — opt-in, authenticated, NOT a CI gate

**New:** `scripts/smoke-saved-card.mjs`, run as `yarn smoke:saved-card`. Requires credentials from
the environment, mints a real session, performs one real `PUT`, asserts a token comes back. **This
is also what confirms the request body**, which is why the body is not a Phase 0 blocker.

**Explicitly not in `yarn verify` and not a PR gate.** Credentials, sandbox availability and session
expiry would fail builds for reasons unrelated to the change under review. Instead: a named owner, a
row in `docs/manual-device-checklist.md`, run before release or as a controlled scheduled job.

> **The two layers prove different things and must not be conflated.** Layer 1 prevents drift — the
> SDK still sends what we decided. Layer 2 detects error — the server accepts it. A green Layer 1 on
> a wrong URL is exactly as green as a green Layer 1 on a right one.

---

## Phase 6 — documentation

`docs/merchant-integration.md` gains the flow: the merchant's `list-payment-methods` call, the
`requires_cvv` branch, mounting the component, using the **returned** token, and the network-hint
consequence for `state.valid`. `docs/control-surface.md` gains its row. `README.md` gains the
ADR-0008 index line. ADR-0008 moves to `Accepted` with the Phase 0 answer folded in, and moves from
`PROPOSED` to `ACCEPTED` in `verify-docs.mjs`.

---

## Files at a glance

**New:** `src/VaultSavedCard.res` · `src/SavedCardController.res` · `src/SavedCardCoordinator.res` ·
`src/HyperswitchVaultSavedCardForm.res` · `scripts/verify-saved-card.mjs` ·
`scripts/smoke-saved-card.mjs` · `example/__tests__/savedCardCvc.test.tsx`

**Modified:** `src/public.ts` · `src/standalone-entry.mjs` · `type-tests/consumer.tsx` ·
`package.json` (two scripts) · docs above

**Untouched:** `VaultCardController` · `VaultFormCoordinator` · `VaultConfirm` · `VaultFormHost` ·
`CardInput` · `BoundCardFields` · **`CardCVCField` / `CardCVCWidget`** · `VaultWidgetContext` ·
all of `hyperswitch-client-core`

**Shared, therefore reviewed as affecting both flows:** `CardFields.Cvc` · `Validation` ·
`VaultStateEmitter` · `VaultPublicState` · `VaultResult` · `VaultEndpoint` · `CardFieldOptions`

**Generated, committed after every `.res` change:** `src/*.bs.js`, `src/*.gen.tsx` —
`scripts/check-generated.mjs` fails otherwise.

## Commands

```
yarn re:build                     # compile
yarn build                        # full chain incl. check-generated, public-surface, docs
yarn verify                       # all gates, incl. the new verify-saved-card
cd example && yarn test           # behavioural suite
yarn smoke:saved-card             # Layer 2 — manual, credentials required, NOT a gate
```

> `yarn verify` is currently red at `verify-noncard-input` for a pre-existing reason unrelated to
> this work — `scripts/verify-noncard-input.mjs:331` contradicts `src/VaultEndpoint.res:77` over
> whether a path prefix is allowed on a merchant-supplied base. It needs its own decision and should
> not be mistaken for fallout from this flow.

## Document classification

ADR-0008 is `Proposed`, which `scripts/verify-docs.mjs` did not previously recognise — every `.md`
under `docs/` had to be `CURRENT`, `ACCEPTED` or `HISTORICAL`.

**Resolved by adding a `PROPOSED` classification**, with these restrictions:

- recognised by an exact `**Status:** Proposed` marker near the top
- **restricted to `docs/adr/`** — a proposal outside the decision-record directory would be a
  merchant-facing document describing something that does not exist
- still classified, so it cannot escape the scan
- **not** treated as `CURRENT`: it does not describe merchant-usable functionality
- must not also carry the `Accepted` or `Historical` marker
- `CURRENT`, `ACCEPTED` and `HISTORICAL` behaviour is unchanged

The gate carries non-vacuity checks proving ADR-0008 is classified `PROPOSED`, that a proposed
document outside `docs/adr/` is refused, and that an unclassified document still fails.

This plan lives in `plans/`, which the scan does not walk.
