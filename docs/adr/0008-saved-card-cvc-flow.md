# ADR-0008 — Saved-card CVC, collected by the library and returned as a token

**Status:** Proposed · **BLOCKED** pending backend confirmation of the client-SDK authorization
format for `update-saved-payment-method` (see *The blocker*)

> Not `Accepted`. Everything below is decided except the authorization contract, which we do not own
> and which determines whether the transport can be written at all. Phase 0 of
> [the implementation plan](../../plans/saved-card-cvc-implementation-plan.md) exists to close it.

## Context

A customer paying with a card the merchant has already saved is often asked for the CVC again. The
merchant lists their saved methods, sees which need one, and needs somewhere safe for the customer
to type it — the same requirement the new-card flows already answer, minus every other field.

Nothing here serves that today. `CardCVCField` exists but only inside a form whose presence gate
demands a card number and an expiry, whose submit gate validates all four fields, and whose request
builder assembles a whole card.

## Decision

**A dedicated, minimal component that reuses the existing CVC implementation, collects the CVC,
updates the saved payment method, and returns the resulting token.**

### The merchant owns the listing decision

The merchant calls `GET /v1/payment-method-sessions/{id}/list-payment-methods` themselves and reads
`requires_cvv` off each `customer_payment_methods[]` entry.

- `requires_cvv: false` — use the listed token directly. Do not mount this component.
- `requires_cvv: true` — mount it with the token.

**The library does not accept `requires_cvv` as a prop or a submit argument.** By the time this
component is on screen the decision has been made, and a second copy of it would be a second place
for the two to disagree.

### The public surface

```tsx
<HyperswitchVaultSavedCardForm
  ref={savedCardRef}
  session={session}                   // required
  environment="sandbox"               // required
  paymentMethodToken={token}          // required

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

Bare minimum is the first four props. `environment` is required and **cannot be inferred from the
session**: the host comes from `VaultEndpoint.resolveVaultBaseUrl(~environment)` and the session
carries none. `vaultEndpoint` is accepted so a self-hosted deployment does not find this the one
operation it cannot redirect.

The component renders the CVC field itself and takes no children, so a merchant cannot mount zero
CVC fields, or two.

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
CVC-only controller, builds `common` from `appearance`, and resolves `options` through the existing
`CardFieldOptions.resolveCvc`.

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
(`"AmericanExpress"`, no space), so `"American Express"` or `"amex"` must be mapped rather than
passed through.

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

{ "payment_method_token": "<the merchant's token>",
  "payment_method_data": { "card": { "card_cvc": "<internal>" } } }
```

`sessionId` resolves exactly as the existing confirm resolves it, from the session's
`vault_details.vault_data.sdk_authorization`.

`card_holder_name` is **omitted**. The published schema marks it optional, nothing here collects
one, and reusing a name from elsewhere would put a value on the wire that no customer entered.

### The response

The token is read from **one** path:

```
associated_payment_methods[0].payment_method_token.data
```

**There is no `associated_token_id` fallback.** It is a different tokenization concept, and silently
returning a different kind of identifier is worse than a clean failure. A response without the
associated payment-method token produces a closed `missing_token` error.

**The merchant uses the token this call returns**, not the one they passed in. Whether the backend
returns the same value or a fresh one is then immaterial to the integration — the contract is
"use what came back", which is correct under either behaviour and needs no confirmation to build.

`updateSavedPaymentMethod()` resolves to the existing `VaultTokenizeResult` — `success` with the
token, or `validation_error` / `not_ready` / `error` with a closed code. No new result type.

### Lifecycle

| Event | Behaviour |
|---|---|
| `paymentMethodToken` changes | clear the CVC, abort in-flight work, discard any cached result |
| `session` changes | the same, and re-resolve the session id |
| `environment` or `vaultEndpoint` changes | abort in-flight work and re-resolve the base URL. The CVC is **retained**: it describes the card, not the host, and a mid-form host change is pathological rather than a new card |
| `cardNetwork` changes | re-run validation and re-emit state. The length rule changes, so `valid` can flip in either direction without a keystroke |
| `reset()` | clear the CVC, abort in-flight work |
| unmount | abort in-flight work; nothing is set afterwards |
| second call while one is running | returns the **same** promise — never a second request |

### Scope

**Not included:** the final payment confirmation, and any change to `hyperswitch-client-core` —
which already has its own saved-card path and its own `requires_cvv` handling. This flow ends when
the token is returned.

**Compatibility.** It does **not** add saved-card branches to the existing new-card coordinators,
hosts or transports. It does deliberately share the CVC field implementation, the validation rules,
the state emitter, the result vocabulary and the endpoint utilities — so it is not isolated, it is
additive. The distinction matters: a change to `CardFields.Cvc` or `Validation` affects both, and
should be reviewed as affecting both.

## The blocker

The route and method are established: `PUT` reaches resource lookup on
`/v1/payment-method-sessions/{id}/update-saved-payment-method` while other verbs are refused, and a
path that does not exist is refused for every verb.

**What is not established is the authorization this endpoint accepts.** The library sends the raw
`sdkAuthorization` and no profile header, and that demonstrably works for the session confirm. The
published reference for this endpoint instead describes
`Authorization: publishable-key=…,client-secret=…` together with `X-Profile-Id`.

The decoded `sdkAuthorization` does contain `profile_id`, `publishable_key` and `client_secret`, so
synthesising the documented header is *technically possible from what the library already holds*.
**That is exactly why it must not be done on inference.** It would invent an authorization contract
the SDK was never granted, from a payload whose internal shape is not ours to depend on.

Backend ownership confirms the supported client-SDK format, or nothing is sent. **This is the only
blocking unknown.** The request body is specified by the published contract and is verified by the
smoke check in Phase 5; the identity of the returned token is answered by the decision above.

## Verification, in two layers that prove different things

**Layer 1 — deterministic contract checks (required).** Pin *our* side: the method, the URL, the
header set, the request body shape, and the response token-extraction path. Offline, in
`yarn verify`, on every change.

**Layer 2 — opt-in authenticated sandbox smoke check.** Prove the *server* accepts it, with real
credentials and a live session.

> **Layer 1 prevents drift. Layer 2 detects error.** A green Layer 1 says the SDK still sends what
> we decided it should send. It says nothing about whether the server agrees — our code can be
> perfectly self-consistent and still wrong, which is how the payment-method-session confirm route
> shipped without ever being called.

Layer 2 is **not** a required PR or CI gate: credentials, sandbox availability and session expiry
would fail builds for reasons unrelated to the change under review. It runs manually before a
release, or as a controlled scheduled job, with a named owner.

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
