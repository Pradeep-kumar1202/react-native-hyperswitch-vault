# ADR-0009 — The payment credential in either shape Hyperswitch accepts

**Status:** Accepted · corrects a gap left by [ADR-0003](0003-remove-state-emission-and-own-final-confirmation.md)
(the library owns final confirmation) and [ADR-0004](0004-library-owns-every-new-card-flow.md)
(the library owns every new-card flow) · applies equally to the orchestration entry of
[ADR-0007](0007-orchestration-entry-for-externally-tokenized-cards.md)

**Date:** 2026-09-02 · **Deciders:** Pradeep Kumar

## Context

Hyperswitch accepts two ways of authenticating an SDK payment call — the eligibility probe and the
final `/payments/{id}/confirm`:

| Shape | Header | Body | Where hyperswitch-client-core still uses it |
| --- | --- | --- | --- |
| payment-intent credential | `Authorization: <sdkAuthorization>` | — | every call, when the credential is present |
| legacy publishable key | `api-key: <publishableKey>` | `client_secret: <clientSecret>` | every call, when it is absent (`Utils.getHeader`, `generateCardConfirmBody`) |

When ADR-0003 and ADR-0004 moved the new-card confirm into this library, the confirm input took
`sdkAuthorization: string` as its only credential and refused a blank one with `invalid_session`.
That was accurate for the vault flow, whose session always ships with a credential, and wrong for
everything else: a merchant integrating with a publishable key and a client secret — every
integration that predates `sdkAuthorization`, and one client-core still supports for wallets,
saved cards and retrieve — lost new-card payments entirely, deterministically, with a message about
a session they never had.

## Decision

The confirm input, the orchestration input and the live-eligibility configuration accept the
payment credential in **either** shape:

```ts
sdkAuthorization?: string;   // the payment-intent credential — wins whenever non-blank
publishableKey?: string;     // legacy: sent as the `api-key` header
clientSecret?: string;       // legacy: written into the body as `client_secret`
```

Resolution happens in one internal module, `VaultCredential`, before any request opens:

1. a non-blank `sdkAuthorization` is the credential, and the legacy pair is ignored — the same
   precedence as client-core's `Utils.getHeader`;
2. otherwise both `publishableKey` and `clientSecret` must be non-blank;
3. neither shape complete is `invalid_session`, exactly as a blank `sdkAuthorization` was before.

The transports (`VaultFinalConfirm`, `VaultEligibility`) take the resolved value and cannot be
handed a half-credential: the variant has no such member. `VaultConfirmBody.build` writes
`client_secret` only for the legacy shape and omits the key — never blanks it — for the
payment-intent shape, which is when client-core's own body builder omits it too.

## What does not change

- The **vault** credential is untouched. Call 1 of the vault flow still authenticates with the
  `sdk_authorization` carried inside `vault_details`, and nothing about this decision names it
  separately or lets a host supply it.
- No credential is logged, returned, emitted on a state callback, or declared anywhere a merchant
  reads state from. `scripts/verify-merchant-only.mjs` now forbids `clientSecret` on every shipped
  declaration except the three input types, each pinned to the exact `string` type — the same
  treatment `sdkAuthorization` already had.
- The result union, the error codes and every message are unchanged.

## Consequences

- A legacy-auth merchant's new-card payment works again, with the request client-core would have
  sent itself.
- The type can no longer prove a credential is present — an input with neither shape compiles and
  is refused at run time. That trade was made knowingly: a union type would have forced every
  existing caller to restructure an argument that was previously a plain string.
- `scripts/verify-orchestration.mjs`, `verify-final-confirm.mjs`, `verify-eligibility.mjs` and
  `verify-noncard-input.mjs` assert both shapes, the precedence rule, and that the client secret
  never appears in a header.

## Open question, deliberately not decided here

Whether the backend intends to retire the legacy shape is a product and backend question. This
record restores parity with what client-core sends today; it does not assert the shape's future.
