# ADR-0005 — Restore state emission, with the payload pinned

**Status:** Accepted · supersedes the emission-removal decision of
[ADR-0003](0003-remove-state-emission-and-own-final-confirmation.md)

> **Scope of the supersession.** ADR-0003 made two decisions. The second — that the library owns the
> final payment confirmation and the payment-method token never reaches a merchant — **still
> stands and is not touched here.** Only the first, the removal of state emission, is reversed.

## Context

ADR-0003 removed `onStateChange` and `onFormStateChange`. Its reasoning is worth quoting exactly,
because it decides how much of it survives:

> Both were designed to be card-safe, and both were. Neither carried a PAN, an expiry or a CVC, and
> the gates proved it. The problem is not what they carried; it is what they *are*.

So the removal was never a response to a leak. It rested on two claims:

1. **No remaining consumer.** "Its purpose was to let a merchant disable a Pay button until the form
   was complete… `submit()` already answers the same question safely."
2. **Unbounded drift.** A live callback channel is "a channel that must be re-audited on every
   change, and whose payload every future contributor is tempted to widen by *just one more useful
   field*."

Claim 1 turned out to be wrong, and the way it is wrong is specific. `submit()` answers "may I
submit?" **at one instant, on demand**. A merchant rendering their own chrome needs the answer
**continuously, while the customer types** — to show a tick beside a completed field, to colour a
border, to move focus, to enable a button without the customer pressing a dead one first. `submit()`
cannot serve that: it is a single point-in-time verdict, and calling it repeatedly to poll would
mint payment-method tokens as a side effect of rendering.

Claim 2 was, and remains, correct. It is the real constraint, and it is what the decision below is
shaped around.

## Decision

**Restore per-field and form-level state emission. Pin the payload to an exact member set enforced
by a build gate.**

```
  <CardNumberField onStateChange={s => …} />        VaultCardNumberState
  <CardExpiryField onStateChange={s => …} />        VaultExpiryState
  <CardCVCField onStateChange={s => …} />           VaultCVCState
  <CardholderNameField onStateChange={s => …} />    VaultCardholderNameState
  <HyperswitchVault.CardForm onFormStateChange={s => …} />   VaultFormState
  <HyperswitchVault.Form     onFormStateChange={s => …} />   VaultFormState
```

Every field reports the same five things, which are five genuinely different questions:

| Member | The question it answers |
|---|---|
| `status` | how far along is this field — `empty`, `incomplete`, `complete`? |
| `valid` | would it pass submission right now? |
| `touched` | has the customer interacted with it, so should *your* chrome complain yet? |
| `focused` | is the cursor in it? |
| `error` | what is the customer being shown **now** — a closed `code` and the localised `message` |

The card number adds `brand`, `isCoBadged` and `eligibility`. The form adds `fieldsReady`,
`sessionStatus`, `complete`, `valid`, `submitting`, `canSubmit` and the four field states.

## Where this parts company with VGS

The shape is borrowed from VGS Collect deliberately: per-field state, an aggregate, updates
de-duplicated by value rather than fired per keystroke. The payload breadth is not.

VGS Collect's per-field update carries `bin` and `last4`. This library publishes neither, and
`VaultPublicState` says so in the file. VGS can expose them because it is a PCI-scoped vault whose
customers are already in scope for handling them; a merchant integrating *this* library is not, and
a merchant who holds a BIN is a merchant whose logs, crash reports and analytics pipeline now
contain one. Copying that member would hand back a fraction of the very thing the library exists to
keep.

Nothing card-derived is published except the detected **scheme name** and the **message the customer
is already reading on screen**.

## How claim 2 is answered

ADR-0003's objection — that the payload gets widened one useful field at a time — is not answered by
being careful. It is answered by making widening fail the build.

`scripts/verify-event-surface.mjs` now holds an **exact member allowlist** for every emitted type,
checked against the PACKED declarations. It fails if emission disappears *and* it fails if emission
grows. A contributor adding `last4` does not make a judgement call in review; they get a red build
naming the member they added. A denylist would not do: `last4` spelled `tail` walks straight through
one. Two further locks sit behind it — no member outside `message` may be typed as an open `string`,
so there is no slot of an open type for a value to travel in; and a consumer compile asserts that
reading `.value`, `.bin`, `.last4`, `.length`, `.expiryMonth` or `.token` off a snapshot is a type
error, with a non-vacuity check proving the harness would notice if the type went `any`.

## Consequences

- **A form with no callback costs exactly what it cost before.** The emitter derives nothing when
  `notify` is `None` — the honest answer to "emission is a standing obligation". An integration that
  ignores this ADR is byte-identical to one built before it.
- **Inline arrow callbacks are safe.** The callback is held in a ref refreshed every render, so its
  identity changing emits nothing and re-registers nothing.
- **A throwing merchant callback cannot break card entry.** `FAIL_OPEN` for the form,
  `PROPAGATE-NON-FATAL` for the error: it is handed to `ErrorUtils.reportError`, which calls React
  Native's global handler with `isFatal = false` — a LogBox entry in development, a non-fatal report
  to the app's own crash reporter in production, and the session continues. The library writes
  nothing to the console by design, so silently swallowing it would leave no channel at all.

  The first revision re-raised inside `setTimeout(_, 0)` instead, and that was wrong in a way worth
  recording: a throwing timer callback is collected by `JSTimers.callTimers`, rethrown into
  `MessageQueue.__guard`, and reported through `ErrorUtils.reportFatalError` — `isFatal = true`,
  which `ExceptionsManager` routes to `NativeExceptionsManager.reportException`, the native fatal
  path. A merchant writing `s.error.message` on a field whose `error` is absent would have ended the
  customer's session. In development both spellings look like the same harmless LogBox entry, which
  is exactly why it survived a round of review; only reading the React Native internals separates
  them.
- **`canSubmit` matches the submit gate on everything it covers.** `fieldsReady` is derived from
  the same registry counts `presenceGate` uses, and `valid` is exactly `CardStateReducer.isValid` —
  there is deliberately no second definition of either. The one place it is deliberately laxer is
  the session: `#absent` passes, because a sessionless form is a valid Flow 3 form. A merchant
  calling `tokenize()`, which does require a session, must read `sessionStatus` too. An earlier
  draft of this bullet said "cannot disagree" without qualification, which is the same unearned
  absolute that produced the `canSubmit` defect this ADR's history records.
- **`sessionStatus` has three states, not two.** ADR-0004 made a sessionless form legitimate — it is
  how client-core mounts Flow 3 — so `#absent` is distinct from `#invalid`. Reporting a Flow 3 form
  as invalid would have merchants render a fault where there is none.
- **A rejected network suppresses `canSubmit`, and says so.** The gate reads the RAW validator
  verdict, not the touched-filtered message the customer is being shown. Wiring it to the filtered
  one — the first revision did — made a complete, well-formed card of an unaccepted network report
  `canSubmit: true` right up until the merchant's own Pay button produced `invalid_card_data`. The
  form now also publishes `networkError`, so a disabled button can be explained rather than merely
  observed.
- **Eligibility is reported but does not gate `canSubmit`.** A denial is the backend's verdict on a
  correctly-typed card. Folding it into `canSubmit` would leave a merchant unable to tell "still
  typing" from "this card was refused"; the coordinator enforces it and answers `card_not_eligible`.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Leave ADR-0003 in place; merchants poll `submit()` | Each poll mints a payment-method token. Polling a payment operation to drive a border colour is not a workaround, it is a defect. |
| Emit a single `canSubmit` boolean | ADR-0003 rejected this and was right to, for the opposite reason it gave: it is too narrow. A merchant showing a per-field tick learns nothing from one aggregate boolean, and would be pushed back to polling. |
| Copy VGS wholesale, `bin` and `last4` included | Puts card-derived identifiers into merchant logs and crash reports. The threat models are not the same. |
| Emit, but document the payload rather than gate it | Exactly the failure ADR-0003 predicted. A comment is not a boundary; the next contributor widens it in good faith. |
| One `onChange` carrying every field | Forces a merchant wiring one field to receive state for all of them, and makes the card number's `brand` structurally readable on the CVC. |

## Enforcement

| Property | Gate |
|---|---|
| The emitted payload is exactly this member set — no wider, no narrower | `scripts/verify-event-surface.mjs` (exact allowlist, checked against the packed tarball) |
| No emitted member outside `message` is an open `string` | `scripts/verify-event-surface.mjs` |
| Reading a card value off a snapshot is a compile error | `scripts/verify-event-surface.mjs` consumer compile + `type-tests/consumer.tsx` §5, both with non-vacuity checks |
| No token or card data in any result | `scripts/verify-result-mapping.mjs` (unchanged — ADR-0003's second decision stands) |

## The boundary, restated

> PAN, expiry and CVC never cross the library's supported public API. They remain in library-owned
> state and are transmitted only by the library's internal tokenization transport. The merchant
> receives a navigation decision from a confirmation, and **card-free state describing what the
> customer has typed** — never the values, never a fragment of them, and never the token.

That is an API and data-flow guarantee — **not** native-process isolation, **not** memory
zeroization, **not** a claim of PCI DSS compliance, **not** a claim that your PCI scope is reduced,
and **not** protection from malicious code executing inside your own application process.
