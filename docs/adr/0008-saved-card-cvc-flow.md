# ADR-0008 — Saved-card CVC, collected by the library and returned as a token

**Status:** Accepted · **Date:** 2026-09-02 (proposed 2026-09-01) · **Deciders:** Pradeep Kumar ·
relates to [ADR-0004](0004-library-owns-every-new-card-flow.md) (the library owns every card flow)
and [ADR-0005](0005-restore-card-safe-state-emission.md) (card-safe state emission)

> Accepted once the one blocking unknown — the authorization a client SDK may use on
> `update-saved-payment-method` — was read off the backend's own route handler rather than inferred.
> The confirmed contract is in *The authorization contract, confirmed*; what it obliges a merchant to
> do in production is in *Production requirements*.
> [The implementation plan](../../plans/saved-card-cvc-implementation-plan.md) holds the work.

## Context

A customer paying with a card the merchant has already saved is often asked for the CVC again. The
merchant lists their saved methods, sees which need one, and needs somewhere safe for the customer
to type it — the same requirement the new-card flows already answer, minus every other field.

Nothing served that before this record. `CardCVCField` existed but only inside a form whose presence
gate demands a card number and an expiry, whose submit gate validates all four fields, and whose
request builder assembles a whole card.

## Decision

**A dedicated, minimal component that reuses the existing CVC implementation, collects the CVC,
updates the saved payment method, and returns the resulting token.**

### The merchant owns the listing decision

The merchant calls `GET /v1/payment-method-sessions/{id}/list-payment-methods` themselves — with the
**same** payment-method session they will mount the component with — and reads `requires_cvv` off
each `customer_payment_methods[]` entry.

- `requires_cvv: false` — use the listed token directly. Do not mount this component.
- `requires_cvv: true` — mount it with that entry's token.

**The library does not accept `requires_cvv` as a prop or a submit argument.** By the time this
component is on screen the decision has been made, and a second copy of it would be a second place
for the two to disagree.

### The public surface

```tsx
<HyperswitchVaultSavedCardForm
  ref={savedCardRef}
  session={session}                   // required — the session list-payment-methods was called with
  environment="sandbox"               // required
  paymentMethodToken={token}          // required — one entry's token from that listing

  cardNetwork={network}               // optional — a hint, see below
  vaultEndpoint={endpoint}            // optional — self-hosted host
  appearance={appearance}             // optional
  cvcOptions={cvcOptions}             // optional
  cvcStyles={cvcStyles}               // optional
  containerStyle={style}              // optional — the outer box only
  onStateChange={s => setPayEnabled(s.valid)}   // optional, VaultCVCState
/>
```

```ts
type VaultSavedCardHandle = {
  updateSavedPaymentMethod(): Promise<VaultTokenizeResult>;
  reset(): void;
  focus(): void;
  blur(): void;
};
```

`focus()` and `blur()` take no argument: there is one field. The handle is complete — `reset()` is
part of it, not an implied capability.

Bare minimum is the first three props. `environment` is required and **cannot be inferred from the
session**: the host comes from `VaultEndpoint.resolveVaultBaseUrl(~environment)` and the session
carries none. `vaultEndpoint` is accepted so a self-hosted deployment does not find this the one
operation it cannot redirect.

The component renders the CVC field itself and takes no children, so a merchant cannot mount zero
CVC fields, or two. It is published on the package root only: it is the merchant's operation, and
the checkout SDK has its own saved-card path.

### How the CVC field is reused

**It reuses `CardFields.Cvc`, the implementation — not `CardCVCField`, the widget.**

This distinction is load-bearing and an earlier draft got it wrong. `CardCVCWidget` calls
`VaultWidgetContext.useRequired`, and that context carries a full `VaultCardController.controller`
— PAN, expiry, co-badge, eligibility, scan and all. Reusing the widget would mean either
instantiating the whole card reducer for one field, or building a fake controller to satisfy a
context the field does not otherwise need. Both are worse than the alternative.

`CardFields.Cvc` needs no context at all. Every input is an explicit prop: `value`, `onChange`,
`brand`, `onFocus`, `onBlur`, `onBackspace`, `error`, `isValid`, `renderError`, `options`, `common`,
`reference`, the border props and `styles`. The saved-card component supplies them from its own
CVC-only controller (`SavedCardController`), builds `common` from `appearance`, and resolves
`options` through the existing `CardFieldOptions.resolveCvc`.

So the *rendered field* is the same code the new-card form renders, pixel for pixel, and
`CardCVCField`, `VaultWidgetContext` and the existing hosts are genuinely untouched.

### Emitted state: reuse, do not invent

`onStateChange` is the **existing** callback name carrying the **existing** `VaultCVCState`.

An earlier draft removed emission altogether, arguing that ADR-0005's justification — a merchant
drawing chrome across four fields needs continuous validity — did not apply to a single field the
library renders itself. **That was wrong.** The merchant still owns the external Pay or Continue
button, and wanting it disabled until the CVC is well-formed is exactly ADR-0005's case. The
consumer exists.

What need not exist is a new type:

- **No `SavedCardFormState`, no `canSubmit`, no new callback name.** `VaultCVCState` already answers
  the question, and `verify-event-surface.mjs` already pins its exact member set and already lists
  `onStateChange` in its callback allowlist. This flow adds **no** gate exception; a new name would
  fail the build, correctly.
- **`cardNetwork` can never be emitted back**, because `VaultCVCState` structurally has no `brand`
  member — only the card-number state does. The guarantee comes from which type is reused, not from
  anyone remembering a rule.
- **A merchant who passes no callback pays nothing.** `VaultStateEmitter` returns before building a
  snapshot when no listener is attached.

The CVC value and its length remain unreachable through every member.

### The network hint

`cardNetwork` is optional and selects the CVC length rule only. Official values are normalised
first — `list-payment-methods` returns `"Visa"`, and the validator matches issuer strings exactly
(`"AmericanExpress"`, no space), so `"American Express"` or `"amex"` are mapped rather than passed
through (`SavedCardController.normaliseNetwork`).

- **Recognised** — that network's exact rule. `AmericanExpress` is four digits.
- **Absent or unrecognised** — `defaultCardPattern` accepts **three or four** digits.

Defaulting strictly to three would reject every valid Amex CVC, a worse failure than accepting one
digit too few and letting the API decide.

> **Consequence a merchant must know.** `state.valid` inherits this. With no recognised hint it
> becomes `true` at three digits, including on an Amex card — so a merchant gating a button on
> `state.valid` should pass `card_network` from `list-payment-methods`. Without it the button
> enables one digit early and the API rejects the submit. The hint is not cosmetic.

### The request

```
PUT {vaultBaseUrl}/v1/payment-method-sessions/{encodedSessionId}/update-saved-payment-method
Content-Type: application/json
Authorization: <the session's raw sdkAuthorization>
x-app-id: <as on every backend call>
x-redirect-uri:

{ "payment_method_token": "<the merchant's token>",
  "payment_method_data": { "card": { "card_cvc": "<internal>" } } }
```

`sessionId` resolves exactly as the existing confirm resolves it, from the session's
`vault_details.vault_data.sdk_authorization`.

**Nothing else is sent.** `card_holder_name` and `nick_name` are omitted: nothing here collects
them, and reusing a value from elsewhere would put a value on the wire that no customer entered.
No PAN, no expiry, no network, no unknown field — the backend struct is `deny_unknown_fields`, so
any of those would be refused anyway, but they are absent by construction rather than by rejection.

**The token is never sent blank.** An absent `payment_method_token` with a CVC is, on the backend, a
request to mint a *new* token — a different operation. The component refuses a blank or
whitespace-only token before anything opens (`not_ready`), and the transport refuses it again.

### The response

The token is read from **one** path:

```
associated_payment_methods[0].payment_method_token.data
```

**There is no `associated_token_id` fallback.** It is a different tokenization concept, and silently
returning a different kind of identifier is worse than a clean failure. A response without the
associated payment-method token produces a closed `missing_token` failure, surfaced as
`error / server_error`.

Index 0 is correct because the backend moves the updated token to the front of
`associated_payment_methods` before answering (`reorder_token_to_front`).

**The merchant uses the token this call returns**, not the one they passed in. Whether the backend
returns the same value or a fresh one is then immaterial to the integration — the contract is
"use what came back", which is correct under either behaviour.

`updateSavedPaymentMethod()` resolves to the existing `VaultTokenizeResult` — `success` with the
token, or `validation_error` / `not_ready` / `error` with a closed code. No new result type.

### Lifecycle

| Event | Behaviour |
|---|---|
| `paymentMethodToken` changes | clear the CVC, abort in-flight work |
| `session` changes | the same, and re-resolve the session id |
| `environment` or `vaultEndpoint` changes | abort in-flight work and re-resolve the base URL. The CVC is **retained**: it describes the card, not the host, and a mid-form host change is pathological rather than a new card |
| `cardNetwork` changes | re-run validation and re-emit state. The length rule changes, so `valid` can flip in either direction without a keystroke |
| `reset()` | clear the CVC, abort in-flight work |
| unmount | abort in-flight work; nothing is set afterwards |
| second call while one is running | returns the **same** promise — never a second request |
| a call after a settled one | a fresh request. The update is idempotent — it refreshes the CVC held under the same token and restarts its 15-minute window — so there is no cached result and nothing to discard |

### Scope

**Not included:** the final payment confirmation, and any change to `hyperswitch-client-core` —
which already has its own saved-card path and its own `requires_cvv` handling. This flow ends when
the token is returned. What consumes that token is recorded as a separate P0 follow-up under
*Consequences*.

**Compatibility.** It does **not** add saved-card branches to the existing new-card coordinators,
hosts or transports. It does deliberately share the CVC field implementation, the validation rules,
the state emitter, the result vocabulary, the response decoder and the endpoint utilities — so it is
not isolated, it is additive. The distinction matters: a change to `CardFields.Cvc`, `Validation` or
`VaultConfirm.decodeConfirmResponse` affects both, and should be reviewed as affecting both.

## The authorization contract, confirmed

This record was blocked on one question: does `PUT …/update-saved-payment-method` accept the raw
`sdkAuthorization` the SDK already sends — as `POST …/confirm` demonstrably does — or does it require
`Authorization: publishable-key=…,client-secret=…` together with `X-Profile-Id`, as the published
API reference describes? Synthesising the documented header from the decoded envelope was
*technically possible* and was ruled out: it would invent an authorization contract the SDK was
never granted, from a payload whose internal shape is not ours to depend on.

The answer was read from the backend source rather than inferred.

**The handler uses the same authentication combinator as the session confirm.**
`crates/router/src/routes/payment_methods.rs`, `payment_method_session_update_saved_payment_method`:

```rust
auth::sdk_or_client_auth(
    &auth::SdkAuthorizationAuth { /* … */ resource_id: ResourceId::PaymentMethodSession(id) },
    &auth::V2ClientAuth(ResourceId::PaymentMethodSession(id)),
    req.headers(),
)
```

`sdk_or_client_auth` (`crates/router/src/services/authentication.rs`) tries the SDK path **first**:
if the `Authorization` header base64-decodes as the SDK envelope
(`profile_id=…,publishable_key=…,client_secret=…,payment_method_session_id=…`), `SdkAuthorizationAuth`
validates the envelope's `client_secret`, resolves the merchant from its `publishable_key`, and binds
the request to the session id in the path. Only a header that does **not** decode falls back to
`V2ClientAuth` — the documented `publishable-key=…,client-secret=…` + `X-Profile-Id` form, which
exists for callers that hold no envelope. The SDK holds one.

Verified on 2026-09-02 against the local checkout (branch `add-eligible-connector-sdk-config`,
2026-06-11) **and** against upstream `main`, which carry the identical combinator. hyperswitch-web
sends exactly `Authorization: <sdkAuthorization>` — and no other credential header — to this route
in production (`src/Utilities/PaymentHelpersV2.res`, `updatePaymentMethod`).

**Therefore the transport:**

- sends the raw `sdkAuthorization` from `vault_details.vault_data.sdk_authorization`, exactly as the
  confirm does, with the confirm's header set — `Content-Type`, `Authorization`, `x-app-id`,
  `x-redirect-uri`;
- **does not** decode the envelope to synthesise `publishable-key=…,client-secret=…`;
- **does not** send `X-Profile-Id`. The SDK path never reads it; only the fallback does.

`scripts/verify-saved-card.mjs` pins all three.

**What else the handler settles** (`crates/router/src/core/payment_methods.rs`,
`payment_methods_session_update_payment_method`):

| Fact | Consequence here |
|---|---|
| `payment_method_token` is optional on the wire; absent with a CVC, the backend **mints a new token** | a blank token is refused before sending, at two layers |
| a supplied token must already be in the session's `associated_payment_methods`, which `list-payment-methods` populates as a side effect of listing; otherwise 404 | the merchant lists with the **same** session first; a 404 surfaces as `error / server_error` |
| the updated token is moved to the **front** of `associated_payment_methods` before the response | reading index 0 is correct, not lucky |
| the CVC is stored as a `TemporaryCardToken` for `DEFAULT_INTENT_FULFILLMENT_TIME` = **15 minutes** | the merchant's final confirmation must happen inside that window |
| `PaymentMethodUpdate` is `deny_unknown_fields` | the body carries exactly what the contract names |

## Production requirements

These follow from the confirmed contract and are documented for merchants in
`docs/merchant-integration.md` and `docs/merchant-api-reference.md`. They are not advice.

1. **Call `list-payment-methods` with the same payment-method session before mounting the
   component.** Listing is what associates the customer's saved cards with that session; a token
   from any other listing, or from an earlier session, is refused by the backend.
2. **`paymentMethodToken` must be one of the tokens that listing returned.** Not a stored token from
   a previous checkout, not a value from your own database.
3. **Never pass an absent or empty `paymentMethodToken`.** The library refuses it (`not_ready`)
   precisely because, on the wire, omitting it mints a brand-new token.
4. **The CVC lives under the token for 15 minutes.** Perform the final payment confirmation within
   that window. A repeat `updateSavedPaymentMethod()` restarts it.
5. **Use the token `updateSavedPaymentMethod()` returns**, whether or not it equals the one you
   passed in.
6. **Pass `cardNetwork`** from the listing's `card_network`, or `state.valid` enables your button
   one digit early on an Amex card.

## Verification, in two layers that prove different things

**Layer 1 — deterministic contract checks (required).** `scripts/verify-saved-card.mjs`, in
`yarn verify`, on every change. Pins *our* side: `PUT`, the exact URL with the id percent-encoded
(and not the confirm route), the exact header set with the raw credential and no profile header,
the exact body with nothing beyond the token and the CVC, the one token path (a response carrying
only `associated_token_id` is a closed failure; the shared decoder reports `missing_token`), every
refusal costing zero requests, every failure a closed code with no backend prose, and no CVC or
credential in any outcome. `example/__tests__/savedCardCvc.test.tsx` covers the component around
it: one input, the emitted state walked for leaks, the double-submit promise, and every lifecycle
row above.

**Layer 2 — opt-in authenticated sandbox smoke check.** `scripts/smoke-saved-card.mjs`
(`yarn smoke:saved-card`) mints a real session, lists the customer's cards with it, and performs one
real `PUT` through the library's own compiled transport. It proves the *server* accepts what we send.

> **Layer 1 prevents drift. Layer 2 detects error.** A green Layer 1 says the SDK still sends what
> we decided it should send. It says nothing about whether the server agrees — our code can be
> perfectly self-consistent and still wrong, which is how the payment-method-session confirm route
> once shipped without ever being called.

Layer 2 is **not** a PR or CI gate: credentials, sandbox availability and session expiry would fail
builds for reasons unrelated to the change under review. It runs manually before a release, or as a
controlled scheduled job, with a named owner — `docs/manual-device-checklist.md` §12.

## Consequences

- The merchant root gains one value export, `HyperswitchVaultSavedCardForm`, and two types,
  `VaultSavedCardHandle` and `HyperswitchVaultSavedCardFormProps`. `verify-consumers.mjs` pins the
  root export list, so the addition is a deliberate edit there. Nothing is added to `./host` or
  `./orchestration`, and nothing is added to the `HyperswitchVault` namespace.
- No new emitted type, callback name, result type or error code exists; every gate that pins those
  is unchanged and green.
- **P0 follow-up, recorded separately:** the token this flow returns is consumed on the final
  `/payments/{id}/confirm` as `payment_method_data.vault_card_token.card_cvc` with the top-level
  `payment_token`. hyperswitch-client-core's saved-card path sends the raw `card_cvc` and has no
  such branch, so on this platform the returned token has no consumer yet. That gap must not be
  closed by sending the raw CVC through client-core; a library-owned saved-card final-confirm
  operation, consistent with the existing card boundary, is to be evaluated. See
  [`docs/followup-saved-card-final-confirm.md`](../followup-saved-card-final-confirm.md).
- This component takes no `localisation` and no `disabled`. Its labels come from `cvcOptions`; its
  validation messages are the library's defaults; it is non-editable only while its own request is
  in flight. Either can be added later without changing anything decided here.

## Alternatives considered

| Alternative | Why not |
|---|---|
| A saved-card *mode* on the existing provider | Branches the presence gate, the reducer, the submit gate, the card payload, the request builder and the route — six conditionals on the payment path, and the second spelling of one concept this codebase has already been burned by. |
| Reuse `CardCVCField` and adapt `VaultWidgetContext` | Requires a full `VaultCardController.controller` for one field, or a fake one built to satisfy a context the field does not need. `CardFields.Cvc` takes explicit props and needs neither. |
| Provider + merchant-composed `<CardCVCField/>` | Lets a merchant mount none, or two. The presence gate would then police a mistake the component's own shape can prevent. |
| A new `SavedCardFormState` with `canSubmit` | A new emitted type needing a new gate exception, to answer a question `VaultCVCState.valid` already answers. |
| No emission at all | Rejected on review: the merchant still owns the Pay button, so ADR-0005's consumer does exist here. |
| Accept `requires_cvv` and branch internally | The merchant has already decided; a second copy is a second thing to disagree. |
| Fall back to `associated_token_id` | A different tokenization concept. Silently returning the wrong kind of identifier is worse than a closed error. |
| Synthesise `publishable-key=…,client-secret=…` + `X-Profile-Id` from the decoded envelope | Invents a contract the SDK was never granted from a payload whose shape is not ours; and unnecessary, since the handler takes the SDK envelope first. |
| Cache a successful result, as the new-card flow caches its minted token | That cache exists because the session confirm vaults the card again on retry. The update is idempotent, and re-calling it usefully restarts the CVC window. |
