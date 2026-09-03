# Follow-up (P0): a saved-card final confirmation that consumes the CVC token

**Status:** open, not implemented. Recorded 2026-09-02 alongside
[ADR-0008](adr/0008-saved-card-cvc-flow.md), which deliberately stops at returning the token.

**Priority:** P0. Until this is closed, the token ADR-0008 returns has no consumer in the Hyperswitch
checkout SDK on this platform, and a return-user card on a merchant profile that vaults externally
cannot be paid with from hyperswitch-client-core at all
(`NEW-CARD-VAULTING-REVIEW.md`, *user issue 3*).

**Affects:** hyperswitch-client-core (its saved-card confirm path). Possibly this library, if the
operation is placed here — which is the option to evaluate first.

**Owner:** unassigned. Assign before the next release that advertises saved-card payments.

## The gap

The backend consumes a saved-card CVC token on the final `POST /payments/{id}/confirm` as

```json
{ "payment_token": "<the saved card's token>",
  "payment_method_data": { "vault_card_token": { "card_cvc": "<the token ADR-0008 returned>" } } }
```

`crates/router/src/routes/payments.rs` routes that shape — `PaymentMethodData::VaultCardTokenData`
with a top-level `payment_token` — to the external-vault proxy operation
(`payment_confirm_external_vault_proxy.rs`), which resolves the saved card's vault tokens and
forwards the CVC value with them. hyperswitch-web sends exactly this body for a return-user card
(`PaymentBody.externalSavedCardVaultCvcBody`).

hyperswitch-client-core's saved-card path (`SavedPaymentSheet.res`, `PaymentHook.res`,
`PaymentUtils.res`) still sends the plain `card_cvc` beside `payment_token` with an empty
`payment_method_data`, which takes the ordinary confirm path. It has no `vault_card_token` branch.
For a card vaulted externally that path cannot produce card data and fails with `IR_04`.

## What must NOT be done

- **Do not close this by sending the raw CVC through client-core** under `vault_card_token.card_cvc`
  or anywhere else. The whole point of the CVC token is that the CVC value stops at the vault; a
  merchant who chose an external vault so that card data never touches Hyperswitch would otherwise
  have plaintext CVCs doing exactly that.
- **Do not send `vault_card_token` for every saved card.** Hyperswitch-vault and internal-locker
  cards have no vault tokens for the proxy operation to resolve, and the list response carries no
  per-card indicator to tell them apart. Both shortcuts were considered and rejected in the review.

## What to evaluate

A library-owned saved-card final-confirm operation, consistent with the boundary
[ADR-0003](adr/0003-remove-state-emission-and-own-final-confirmation.md) and
[ADR-0004](adr/0004-library-owns-every-new-card-flow.md) established: there is one
`/payments/{id}/confirm` implementation, in this library, and no card value crosses the library's
supported public API.

Candidate shape, to be decided by its own ADR rather than here:

- an operation on the `./host` entry (the checkout SDK's entry, never the merchant root) that takes
  the saved card's `payment_token`, the CVC token from `updateSavedPaymentMethod()`, and the same
  non-card confirm input the existing flows take; builds the `vault_card_token` body; and resolves to
  the existing `VaultPaymentResult` — navigation, never a token;
- the existing transport (`VaultFinalConfirm`), the existing credential resolution
  (`VaultCredential`, either shape), and the existing gates, unchanged;
- a decision on how client-core learns that a saved card needs the token route rather than the
  plain route — the profile's vaulting strategy is the obvious input, and its known weakness (cards
  saved before the profile moved to an external vault) must be stated, not hidden.

## Acceptance criteria

- A return-user card on an externally vaulting profile can be paid with from client-core on
  Android, iOS and web, using the token ADR-0008 returns.
- No path in client-core or in this library places a CVC value on `/payments/{id}/confirm` for a
  saved card.
- The new operation is gated like the existing ones: wire exactness, refusals before send, and a
  sanitized result, with non-vacuity checks.
- ADR-0008's scope statement is updated to point at the accepted record.

## Until then

A return-user card on an externally vaulting profile fails with a backend error on this SDK.
Consider hiding saved cards for such profiles as an interim product decision. Merchants integrating
this library directly are unaffected: their backend performs the final confirmation with the
returned token, and the shape above is documented for them in `docs/merchant-integration.md`.
