# ADR-0010 — A `./host` entry for the checkout SDK; the root is the merchant's

**Status:** Accepted · **Date:** 2026-09-02 · **Supersedes:** nothing · **Amends:** ADR-0002 §1–§3 (what the root publishes), ADR-0004 (where Flows 2 and 3 are published)

## Context

The package has two consumers with two different contracts, and until this decision both were
published from the same entry.

**The merchant** is delivered one integration: their backend hands the app a session, they place the
four fields, they call `tokenize()`, they get a token. Nothing else on the surface is theirs to call.

**The checkout SDK** (hyperswitch-client-core, through `@juspay-tech/react-native-hyperswitch-payment-methods`)
renders the same provider and the same four fields, but drives them with a wider contract:
`confirmPayment()` and the closed non-card input behind it (ADR-0003, ADR-0004), the live
`eligibility` probe, the `'external'` cardholder-name mode, the payment result and its navigation
payloads, and two error codes only a confirm can produce.

Measured against the merchant's deliverable, the root carried roughly twenty-five host-only type
names, one host-only handle method, one host-only prop, one host-only prop value, two impossible
error codes in the merchant's `SafeVaultErrorCode`, an `eligibility` member that is always
`'unknown'` on two emitted snapshots, and a localisation key whose message never renders. None of it
harmed a merchant. All of it was in their autocomplete, in their exhaustive `switch` statements, and
in the reference they were handed, and every one of those members had to be documented as "not used
by `tokenize()`".

The package already separates audiences once: `./orchestration` (ADR-0007) publishes
`confirmTokenizedCardPayment` for payment-methods and the root publishes none of it, with
`scripts/verify-public-surface.mjs` holding the two disjoint.

## Decision

1. **A third entry, `./host`, for the checkout SDK.** `src/host.ts` is its type surface;
   `src/host-entry.mjs` is its runtime. It publishes `HyperswitchVaultFormProvider` and the four
   `*Field` components — and nothing else at runtime — typed with:
   - `HostFormHandle = { tokenize(); confirmPayment(input); reset(); focus(field) }`;
   - the generated provider `Props` in full: `eligibility`, and `cardholderName` with all three modes;
   - `VaultPaymentConfirmInput`, `VaultPaymentCardSource`, `VaultPaymentResult`, the next-action
     types, the non-card host-data types, `VaultEligibilityConfig`, `VaultEligibilityStatus`;
   - the generated state and localisation types in full, and the eight-code `SafeVaultErrorCode`.

2. **The root is narrowed to the merchant contract.** `VaultFormHandle` has three members.
   `HyperswitchVaultFormProviderProps` and `HyperswitchVaultFormProps` are the generated props with
   `eligibility` removed and `cardholderName: 'collect' | 'omit'`. `SafeVaultErrorCode` is the six
   codes `tokenize()` can return. `VaultCardNumberState` and `VaultFormState` omit `eligibility`;
   `VaultFormValidationMessages` omits `cardNotEligible`. Every narrowing is an `Omit<>` over the
   generated type, never a re-declaration, so the merchant surface still cannot drift from what the
   library reads.

3. **The runtime is shared, not duplicated.** `host-entry.mjs` is a single
   `export { … } from './standalone-entry.mjs'` statement. Rollup keeps that import external and
   rewrites it to `./index.js`, so `dist/{esm,cjs}/host.js` is a re-export stub over the root bundle.
   `require(PKG + '/host').CardNumberField === require(PKG).CardNumberField` holds, and there is one
   `VaultWidgetContext` in the app regardless of which entry a component was imported from.

4. **`./orchestration` takes its result types from `./host`**, not from the root, which no longer has
   them.

5. **Names.** The handle is `HostFormHandle` because its member set differs from the root's
   `VaultFormHandle`. State, localisation, error and mode types keep their root names on `./host`
   with the wider shape — `VaultFormState`, `VaultCardNumberState`, `VaultFieldState`,
   `VaultFormLocalisation`, `VaultFormValidationMessages`, `SafeVaultError`, `SafeVaultErrorCode`,
   `VaultCardholderNameMode` — because they describe the same runtime object with one more member,
   and a second spelling for each would be a second thing to learn for no distinction in kind.

## What this is not

**Not a security boundary.** The host and merchant components are the same objects; a merchant who
reaches `confirmPayment` through `any` has gained nothing they did not already have, because the
operation needs a payment-intent credential that only a merchant's own backend can mint. The split
decides what the frozen merchant contract *says*. ADR-0002's security statement is unchanged.

**Not a change to any flow.** Flows 1, 2 and 3 (ADR-0004) behave exactly as before. The transports,
gates, results and messages are untouched; only the declaration files and the entry map changed.

## Consequences

- `package.json` `exports` publishes `.`, `./host`, `./orchestration` and `./package.json`.
- payment-methods imports the provider, the fields and every confirm type from `./host`
  (`src/hyperswitch/vaultForm.ts`, `src/hyperswitch/confirmCard.ts`) and its handle type is
  `HostFormHandle`. hyperswitch-client-core is untouched — it binds payment-methods' names.
- The merchant reference (`docs/merchant-api-reference.md`) describes the root only. The host
  surface has its own reference (`docs/host-api-reference.md`) for payment-methods maintainers.
- Gates: `verify-public-surface` holds the host pair in lockstep, requires every host value to be a
  root value, requires `host-entry.mjs` to be a pure re-export, and forbids the host vocabulary in
  `public.ts`. `verify-merchant-only` and `verify-publishable` look for the payment result on
  `host.d.ts` and assert its absence — with `confirmPayment`, `eligibility`, `'external'` and the two
  confirm-only codes — from `public.d.ts`. `verify-result-mapping` pins the root's six-code union to
  what the tokenize mapping emits and reads the payment union from `host.ts`; `verify-card-source`
  reads `host.ts`. `verify-consumers` loads both entries from the packed tarball and asserts `===`
  identity for all five components. Tarball and package-contents gates require the host files.
- `type-tests/host.tsx` carries the confirm-input, card-source and navigation tests that were in
  `type-tests/consumer.tsx`; the consumer tests now assert the host contract is *absent* from the
  root.

## Alternatives considered

- **Keep one surface and document the host members as "not used by `tokenize()`".** Workable — the
  extra surface is inert — but it leaves the merchant contract twice the size it needs to be at the
  moment it is being frozen with the web team, and it leaves two impossible codes in every merchant
  `switch`.
- **A separate Rollup bundle for `./host`.** Rejected: a second copy of the form means a second React
  context, and a field imported from one entry would never register with a provider from the other.
- **A separate package.** Rejected: the two surfaces version together by construction (one runtime),
  and a second package would have to pin the first exactly.
- **Remove `confirmPayment` from the form entirely and have payment-methods compose it.** Rejected by
  ADR-0004: the library owns every new-card flow so that the PAN never crosses its boundary.
