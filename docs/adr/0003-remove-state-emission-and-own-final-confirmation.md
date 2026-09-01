# ADR-0003 — Remove state emission; the library owns the final confirmation

**Status:** Accepted · supersedes the emission surface of [ADR-0002](0002-merchant-public-api-contract.md)
· its flow model is amended by [ADR-0004](0004-library-owns-every-new-card-flow.md)
· **its removal of state emission is superseded by
[ADR-0005](0005-restore-card-safe-state-emission.md)**

> **Emission is back.** The decision below to remove `onStateChange` / `onFormStateChange` no
> longer holds: [ADR-0005](0005-restore-card-safe-state-emission.md) restores them with the payload
> pinned to an exact member set by a build gate. The reasoning below is retained because ADR-0005
> answers it point by point — in particular, this record's claim that emission had "no remaining
> consumer" is the part that turned out to be wrong.
>
> **The rest of this ADR stands unchanged.** The library still owns the final payment confirmation
> and the payment-method token still never reaches a merchant.
>
> **Amended.** This record described three flows, the third of which was "the library is not
> involved": with vaulting off, the host kept its own card entry and its own confirm. ADR-0004
> removed that third arrangement. Every new-card flow now renders the library's fields; vaulting
> being off changes the REQUEST, not the owner. Everything else here — the removal of state
> emission, the two credentials, the token-caching policy, the navigation union — still stands.
>
> The global claim "the token never leaves the library" is likewise narrowed. Read it as: **the
> payment-method token is returned only by the standalone merchant tokenization operation, and
> remains internal for every client-core confirmation flow.**

## Context

ADR-0002 gave the library two merchant-facing surfaces:

1. **State emission** — `onStateChange` per field and `onFormStateChange` for the form, carrying
   validity, focus, completion and the detected brand.
2. **A token result** — `submit()` resolved to `{status: 'success', token}`, and the merchant sent
   that token to their own backend, which confirmed the payment.

Both were designed to be card-safe, and both were. Neither carried a PAN, an expiry or a CVC, and
the gates proved it. The problem is not what they carried; it is what they *are*.

**The token is a payment credential.** Handing it back means every host becomes a place it can be
logged, persisted to AsyncStorage, put in a Redux store, sent to Sentry, or forwarded to the wrong
backend. The library spent considerable effort ensuring card values never cross its boundary, then
crossed that same boundary with the credential those card values were exchanged for. The merchant
gained nothing from holding it: the only thing they could do with it was make the confirm call.

**Emission is a standing obligation with no remaining consumer.** Its purpose was to let a merchant
disable a Pay button until the form was complete. That is a real convenience, but it costs a
permanently-live callback channel out of the component that owns the card fields — a channel that
must be re-audited on every change, and whose payload every future contributor is tempted to widen
by "just one more useful field". Meanwhile `submit()` already answers the same question safely: it
returns `validation_error` or `not_ready` **without making a network request**.

## Decision

**Remove the state-emission surface entirely, and move the final payment confirmation inside the
library.**

`submit(args)` now performs both calls and resolves to a navigation decision:

```
  gates (no network)
    → call 1  POST /v1/payment-method-sessions/{id}/confirm   [vault credential, from the session]
    → call 2  POST /payments/{id}/confirm                     [payment-intent credential, from args]
    → { status: 'succeeded' | 'processing' | 'requires_customer_action' | 'failed'
              | 'validation_error' | 'not_ready', … }
```

Consequences, stated plainly:

- Typing, focusing, blurring, validating and brand detection produce **zero** external callbacks.
- The intermediate payment-method token never leaves the library.
- A merchant can no longer pre-disable their Pay button from library state. They enable it, and a
  premature press returns `validation_error` / `not_ready` having sent nothing.
- The library now needs non-card confirmation inputs it did not need before (`paymentId`,
  `sdkAuthorization`, billing, browser info…). Those are narrow, closed types, and card keys in
  them are rejected outright.

## The two credentials

They are different secrets with different scopes and are never substituted for one another.

| | Credential | Source | Used by |
|---|---|---|---|
| Call 1 | vault `sdk_authorization` | inside the session's `vault_details` | the library only |
| Call 2 | payment-intent `sdkAuthorization` | passed by the host in `submit(args)` | the library only |

The host supplies the second because it owns the payment intent; it never sees the first. Neither is
logged, returned, or re-emitted.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Keep emission, remove only the token | Leaves the standing callback channel and its re-audit cost, for a convenience `submit()` already provides safely. |
| Keep the token, add the final confirm as an *option* | Two supported flows means two security postures, and the weaker one becomes the default by copy-paste. |
| Emit a narrowed `canSubmit` boolean only | Still a live channel out of the card-owning component, still widened by the next contributor, and still redundant with `submit()`. |
| Return the token but "recommend" not storing it | A recommendation is not a boundary. The type surface would still admit the mistake. |

## Consequences we accept

- **Retry semantics get harder, and we chose the conservative reading.** If call 1 succeeds and call
  2 fails, the obvious behaviour is to discard everything and let the next `submit()` re-run both.
  That silently assumes the payment-method-session confirm is idempotent, which is **not
  established** — the endpoint takes no idempotency key. So the library caches the minted token
  internally and a retry re-runs only call 2. The cache is discarded when any card value changes,
  when the session changes, on `reset()`, and on unmount. If the backend later confirms that the
  PMS confirm is idempotent, re-minting becomes available; nothing breaks by having been careful.
  **This is an open question for backend confirmation.**
- **`unknown_outcome` is never retried automatically**, on either call.
- **The result is a record, not a ReScript `@tag` variant.** The variant spelling compiles a
  payload-less constructor to a bare string, which made `result.status` `undefined` for `succeeded`
  — the most common outcome. `public.ts` republishes the same runtime objects as a hand-written
  TypeScript discriminated union so merchants keep narrowing, and `verify-result-mapping` asserts
  the exact member set per status so the two cannot drift.
- **The final-confirm boundary carries a closed reason, not a message.** An earlier revision passed
  a string that this library had already made safe. Safe by convention is not safe by construction:
  carrying a reason means there is no slot for backend prose to travel in, and `VaultResult` owns
  every word a customer sees.

## Enforcement

| Property | Gate |
|---|---|
| No emission surface in the published types | `scripts/verify-event-surface.mjs` (exact-name matching, with an allowlist so `brandIconMode` survives) |
| Every outcome maps to a navigation result; no token or card data in any result | `scripts/verify-result-mapping.mjs` |
| Status → outcome reproduces client-core's confirm-response handling | `scripts/verify-final-confirm.mjs`, against the characterization test in `hyperswitch-client-core/__tests__/PaymentStatusCharacterization-test.js` |
| Host input is narrow, card keys rejected at depth, camelCase explicitly encoded | `scripts/verify-noncard-input.mjs` |
| The package still exposes only `.` and `./package.json` | `verify-package-contents`, `verify-publishable`, `verify-merchant-only` |

## The boundary, restated

> PAN, expiry and CVC never cross the library's supported public API. They remain in library-owned
> state and are transmitted only by the library's internal tokenization transport. The merchant
> receives safe UI state and the resulting token.

Under this ADR the last clause is narrower still: the merchant receives a **navigation decision**,
and not the token either.

That is an API and data-flow guarantee — **not** native-process isolation, **not** memory
zeroization, **not** a claim of PCI DSS compliance, **not** a claim that your PCI scope is reduced,
and **not** protection from malicious code executing inside your own application process.
