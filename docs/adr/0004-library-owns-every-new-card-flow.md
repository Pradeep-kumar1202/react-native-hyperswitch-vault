# ADR-0004 — The library owns every new-card flow, vaulted or not

**Status:** Accepted · amends the flow model of [ADR-0003](0003-remove-state-emission-and-own-final-confirmation.md)

## Context

ADR-0003 established three flows and left the third one outside the library:

| | Card fields owned by | Confirmation performed by |
|---|---|---|
| Flow 1 — standalone merchant tokenization | the library | the merchant's backend, later |
| Flow 2 — client-core, vaulting on | the library | the library |
| Flow 3 — vaulting off | **the host** | **the host** |

That third row was a deliberate choice at the time, and it was the wrong one.

**It made a merchant's PCI posture depend on a server-side flag.** `vaulting_action` is profile
configuration. With it set to `Tokenize`, no PAN existed in application code. With it set to `Skip`,
the same screen collected a PAN into a React Final Form store, formatted it, validated it, emitted a
BIN and last-four through an analytics event, and built a `payment_method_data.card` body — all in
client-core. Nothing about the customer's card had changed; a flag on a server had.

**It bought nothing.** The library was already on screen in the tokenizing case and already had card
fields, validation, brand detection, formatting and a confirm transport. Flow 3 duplicated all of it
in the host, and the duplicate was the copy that held the PAN.

**It left a fallback-shaped hole.** With a host-owned card path present and working, "vault details
are missing, use the other path" is a two-line change that looks like defensive programming. That is
precisely the silent downgrade ADR-0003's activation rule existed to prevent, and the safest way to
keep it impossible is for the other path not to exist.

## Decision

**Every new-card entry and confirmation flow goes through the library.** Client-core never renders
or owns a PAN, expiry, CVC or cardholder name, regardless of whether vaulting is enabled.

Flow 3 becomes a second card SOURCE on the existing confirm operation, not a second owner:

```ts
type VaultPaymentCardSource =
  | {type_: 'vault'; session: MerchantSession; confirmTokenMode?: 'payment_token' | 'vault_card'}
  | {type_: 'direct'};
```

| | Requests | What stands in for the card |
|---|---|---|
| Flow 1 `tokenize()` | PMS confirm | — the token IS the result |
| Flow 2 `confirmPayment({cardSource: {type_: 'vault', …}})` | PMS confirm, then payment confirm | the minted token |
| Flow 3 `confirmPayment({cardSource: {type_: 'direct'}})` | payment confirm | `payment_method_data.card`, from the library's own state |

Two operations, three flows, one internal card engine.

### Why the source is required and closed

There is no defensible default. `{type_: 'vault'}` by default would tokenize — and therefore save —
a customer's card for a merchant who never asked. `{type_: 'direct'}` by default would send a PAN to
the payment confirm for a merchant who configured tokenization. Both are decisions about the
customer's card, and neither should be reachable by omission.

The union is closed in both directions. The direct member declares no `session` and no
`confirmTokenMode`, so a mixed source cannot be written in TypeScript; at runtime one is rejected
with `unsupported_configuration` before any request. Ignoring the extra fields would have been
easier and much worse: a caller who passes a vault session alongside `direct` believes their
customer's card is being saved. It would not be.

### What moved with the fields

Three behaviours could not stay in client-core once it had no PAN, and each was decided on its own
merits rather than dropped for convenience.

**Eligibility — moved, and it fails open on purpose.** The check POSTs the card number to
`/payments/{id}/eligibility`. The library performs it now, with the number it already owns: as the
number completes, so the "card not accepted" message still appears inline, and again before it
confirms, so a denial cannot be walked past.

Anything that is not an explicit `deny` resolves to *allowed* — a transport failure, a 5xx, an
unreadable body, a missing action. This was not inherited from a `.catch` nobody examined; it is a
decision client-core made twice, in writing:

| client-core commit | What it establishes |
|---|---|
| `4d1f420` *"feat(api): eligibility check (#470)"* | introduced the check with a `.catch` that allows — a transport failure has never blocked a payment |
| `94b89ee` *"fix: allowing the payment for all the cases and blocking for deny (#474)"* | changed the RESPONSE decoding **from** fail-closed **to** fail-open, replacing `Some(_) => Denied \| None => Denied` with "denied only on `deny`" |

The second is titled a *fix* because failing closed was rejecting payments merchants wanted taken.
Eligibility is a routing preference, not an authorization control, and the backend still refuses an
ineligible card at confirm time. This is the one fail-open path in the library;
`verify-eligibility.mjs` asserts it deliberately rather than leaving it to be inferred.

One consequence is recorded rather than hidden: `TabElement` used to disable the pay button while
`eligibilityStatus` was not `Allowed`, and it no longer can, because reporting a denial back to
client-core would mean publishing a card-derived judgement across the very boundary this decision
closes. A denied card now reaches a pressable button and is refused with `card_not_eligible`.

**Co-badge network selection — moved, and it reaches every flow.** A co-badged card carries two
networks, and which one a payment routes over is the customer's choice with real consequences for
fees and issuer rules. The selection is driven entirely by which schemes the typed number matches,
so only the library can offer it. Nothing about the choice is published: it changes the CVC length
rule, the artwork and the request, and there is no callback or prop that reports it.

An earlier revision of this record listed a limitation here: the choice reached the direct confirm
but not the tokenization request, on the assumption that the payment-method-session confirm had no
field for it. **That assumption was wrong, and the limitation is gone.**
`PaymentMethodSessionConfirmRequest.payment_method_data` is a `PaymentMethodDataRequest`, which
flattens the same `Card` struct the payment confirm uses — and that struct carries
`card_network: Option<CardNetwork>` (`hyperswitch`, `crates/api_models/src/payments.rs`). The
network is now sent on every request that carries a card, so the selector is a control that changes
something in all three flows, and a vaulted card records the network the customer chose.

One detail that had to be got right: `card_network` is an ENUM, not a free string. All fourteen
schemes this library detects were compared against `common_enums::CardNetwork` by name; every one
matches except `BAJAJ` and `SODEXO`, which have no enum member. Sending an unmappable value would
fail an enum parse and reject a payment that works today, so `VaultConfirmBody.cardNetworkToWire`
allowlists the members that exist and omits anything else — the backend derives the brand from the
PAN regardless.

**Scan card — moved.** `@juspay-tech/react-native-hyperswitch-scancard` is resolved exactly as
client-core resolved it — a `require` inside a `try`, with the button absent when the package is
not installed. It is deliberately not declared as an optional peer dependency: that would put a
native package in the dependency graph of a JS-only library.

## The cardholder name, and the duplicate it caused

Shipping this correction produced a visible bug: **two "card holder name" inputs on screen** in both
client-core card flows. They came from two places that could not see each other.

1. The library's ready-made form renders its own `CardholderNameField`, writing to
   `payment_method_data.card.card_holder_name`.
2. client-core's `FieldGrouper` classified the `CardHolderName` field render type as `Name`,
   grouping it with `FirstName`/`LastName` and rendering it through `FullNameElement`.

The second is the older mistake. `CardHolderName` writes inside `payment_method_data.card` — it is
card data — so it was already a card value living in client-core before this correction began. Many
merchant configurations compound the confusion by giving the *billing* first/last name fields a
`display_name` of `card_holder_name`, so a screen could show a card field and a billing field that
looked identical.

### The first resolution, and why it was wrong

The initial fix moved `CardHolderName` into the `Card` group so the library would render it. That
removed the duplicate and broke something more valuable.

`SingleNameInput` is not just an input. It carries this field's validation rule, its localised
messages, its error timing (`touched && !active`), its theming through `CustomInput`, its
accessibility forwarding, and its React Final Form binding to the write path the merchant's
configuration chose. **Moving the field moved the value; it did not move the behaviour** — and the
library has no equivalent, because its own field is deliberately bare.

### The resolution

Ownership splits by what the datum is, and the *rendering* question is answered separately from the
*value* question.

| Field render type | Writes to | Rendered by | Value reaches the library via |
|---|---|---|---|
| `CardHolderName` | `payment_method_data.card.card_holder_name` | **client-core** `SingleNameInput` | the `cardholderName` confirm input |
| `FirstName` / `LastName` | `payment_method_data.billing.address.*` | **client-core** `CombinedNameInput` | ordinary billing serialization |

`CardHolderName` stays in the `Name` group. The library gained a three-valued mode:

| Mode | Library renders | Value source |
|---|---|---|
| `collect` | its own bare input | library internal state |
| `external` | nothing | the `cardholderName` confirm input |
| `omit` | nothing | none |

Client-core is never `collect`. `RequiredFields` — the only component that sees every field group —
picks `external` when the configuration asks for a cardholder name and `omit` when it does not, and
`PaymentMethod` reads the validated value out of the form at submit time and passes it as
`cardholderName`. Standalone merchants keep `collect`, unchanged.

`external` and `omit` are distinct even though they look identical on screen, because *"I will
supply it"* and *"there is none"* must not be spelled the same way. Neither renders a hidden field:
a `display: none` input is still mounted, still focusable, and still announced by a screen reader as
a second name field.

The mode predicate matches the field's render type **or** a write path ending in
`card_holder_name`, so the mode and the value derive from the same fact. Without that, a value
present while the mode said `omit` would be refused as a contradiction — the right rule, triggered
by the wrong thing.

### The one value that crosses

`cardholderName` is the single card value a host may pass INTO the library. It is a member of its
own, not something reachable through `paymentMethodData` — that record stays non-card and still
rejects `card`, `card_holder_name`, `cardHolderName` and every other card key at any depth. One
named, auditable exception is a very different thing from a hole in a general-purpose object.

The boundary is otherwise unchanged: PAN, expiry, CVC, BIN, last four, brand, network details and
the intermediate token never enter client-core, and the cardholder name never comes back out.

## Consequences

**Removed from client-core.** `CardElement`, `CardSchemeComponent`, `ScanCardButton`,
`ScanCardModule`, the `checkEligibility` prop chain, and `useEligibilityCheckHook`. Each was deleted
only after the compiler proved no consumer remained. Saved-card flows are untouched: they collect no
new card values, and `PaymentEvents.emitCardInfo` survives because `SavedPaymentSheet` still uses
it.

**The library gained a UI surface it did not have.** A network chooser and a scan button now render
inside the card-number field's accessory slot. `CardInput` grew an `InteractiveIcon` variant to go
with the existing decorative one: the decorative container is hidden from the accessibility tree,
and a control must not be.

**One statement in ADR-0003 is narrowed.** "The token never leaves the library" is no longer
universally true, because Flow 1 exists to return one. The accurate form: *the payment-method token
is returned only by the standalone merchant tokenization operation, and remains internal for every
client-core confirmation flow.*

**A merchant with no co-badged cards and no scanner sees no change.** `CardNumberAccessory.iconFor`
returns the same decorative element in the same container as before when neither applies, and
`NoIcon` — no wrapper, no reserved width — when brand artwork is off.

## Alternatives considered

**Keep Flow 3 in the host and forbid the fallback by convention.** Rejected: the fallback is a
two-line change away for as long as the host path exists, and conventions are not enforceable by a
gate.

**Expose an `isEligible` or `canSubmit` flag so client-core could keep disabling its button.**
Rejected: it is a card-derived judgement, and publishing it reopens the state-emission channel
ADR-0003 closed. The inline message and the `card_not_eligible` result carry the same information
without a standing callback.

**Make `cardSource` optional, defaulting to direct when no session is present.** Rejected for the
reason given above: it infers a PCI posture from the incidental presence of an argument.
