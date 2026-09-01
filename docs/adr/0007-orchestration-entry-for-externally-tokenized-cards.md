# ADR-0007 — An orchestration entry for externally tokenized cards

**Status:** Accepted · relates to [ADR-0003](0003-remove-state-emission-and-own-final-confirmation.md)
(the library owns final confirmation) and [ADR-0004](0004-library-owns-every-new-card-flow.md)
(the library owns every new-card flow) · part of the cross-repo card-vaulting plan
(client-core → payment-methods → this library)

**Date:** 2026-09-01 · **Deciders:** Pradeep Kumar

## Context

The Hyperswitch backend confirms externally vaulted cards through
`payment_method_data.vault_data_card` (wire alias: `vault_card`) — the `ProxyCardData` shape:
`card_number` and `card_cvc` carry the external vault's ALIASES, expiry is real, and
`bin_number`/`last_four` are optional caller-supplied metadata. The backend resolves WHICH vault
proxies the request from the merchant profile's `external_vault_connector_details`; nothing on the
confirm request names a provider. VGS is the only external vault with end-to-end backend support
today (session details + proxy metadata); the contract itself is provider-neutral.

`@juspay-tech/react-native-hyperswitch-payment-methods` owns the provider SDKs and their secure
fields. For that flow this library renders nothing — the provider does — but ADR-0003's decision
that there is ONE `/payments/{id}/confirm` implementation, in this library, still stands. Something
has to accept a tokenized card and run that confirm.

## Decision

1. **A canonical provider-tokenized card**, `VaultConfirmBody.providerTokenizedCard`:
   `cardNumberAlias`, `cardCvcAlias`, `expiryMonth`, `expiryYear` required (the backend struct has
   no optional CVC); `cardHolderName`, `cardNetwork`, `lastFour`, `binNumber`, `nickName` optional.
   Provider knowledge stays in payment-methods: this library never sees a provider response, and no
   provider-name field exists because the backend does not want one.
2. **`lastFour`/`binNumber` are provider-reported or absent — never derived.** A
   format-preserving alias's digits are not the card's digits; slicing them would put fabricated
   metadata on a payment request. Absent values are OMITTED from the wire, not sent as `""` (the
   minted-token `vault_card` mode was corrected to match).
3. **A third `cardPayload` branch, `ExternalTokenPayload`**, in `VaultConfirmBody` — the closed
   variant still makes "a token AND a PAN" and "neither" unrepresentable, and `card_network` goes
   through the same backend-enum allowlist as the direct flow.
4. **A React-free entry, `VaultOrchestration.confirmTokenizedCardPayment`**, published ONLY as the
   `./orchestration` subpath. It reuses the form flows' gates (blank-field refusals, the host-data
   card-key deep scan, endpoint validation) and transport (`VaultFinalConfirm` →
   `VaultResult.fromNavOutcome`), so both entries refuse the same things and resolve to the same
   sanitized `vaultPaymentResult` — navigation, never a token, never backend prose.
5. **The two surfaces stay disjoint, by gate.** The merchant root exports none of this;
   `verify-public-surface.mjs` holds each entry's runtime/types pair in lockstep and fails on any
   shared name; `verify-merchant-only.mjs` proves the subpath resolves, the root does not re-export
   the function, and the orchestration bundle ships no React, no components and no PMS transport
   (this flow has no call 1). `verify-orchestration.mjs` executes the compiled entry against a
   mocked fetch and pins wire exactness, the refusals, and sanitization.
6. **Separate Rollup configuration, self-contained bundles.** A shared-chunk build would move the
   transports out of `dist/esm/index.js`, and `verify-merchant-only.mjs` proves runtime containment
   by reading that file alone. The duplicated body/transport modules cost ~30 KB, paid only by an
   app that actually imports the subpath.

## Security note

The library cannot cryptographically prove a string is an alias rather than a PAN. The boundary is
reachability: the entry exists only on a subpath whose documented audience is payment-methods, the
merchant root and namespace never mention it, and the type surface makes raw-card spellings
unrepresentable. This is the same posture the backend takes — `ProxyCardData.card_number` is an
unvalidated `Secret<String>` there too.

## Out of scope, deliberately

Provider parsing (VGS response → canonical card) belongs to payment-methods. Eligibility for
externally tokenized cards is not offered: the PAN never enters JavaScript in this flow, the
`/payments/{id}/eligibility` route is not proxied through the vault, and no provider reports a BIN
— so the check is impossible client-side today and is documented as a backend requirement instead
of being faked here.
