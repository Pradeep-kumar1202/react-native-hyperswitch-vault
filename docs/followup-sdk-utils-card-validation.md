# Follow-up: a card-only validation entry point in hyperswitch-sdk-utils

**Status:** proposed, not implemented. This library currently works around the problem; the
workaround is described below so it can be removed once sdk-utils has the entry point.

**Affects:** `hyperswitch-sdk-utils` (`shared-code/`), consumed by hyperswitch-client-core,
hyperswitch-sdk-android, hyperswitch-sdk-ios and this library.

## The problem

`Validation.createFieldValidator` is the single public way to obtain a field validator. It routes
through `validateField`, one switch over roughly two dozen rules:

```
validateField(rule, value, localeObject) ->
    CardNumber      -> cardValid          (Luhn + per-scheme length sets)
    CardExpiry      -> checkCardExpiry
    CardCVC         -> checkCardCVC
    PostalCode      -> PostalCodes        <- 244 country regexes
    Cpf             -> CpfValidation      <- Brazilian tax ID
    Cnpj            -> CnpjValidation     <- Brazilian tax ID
    ... 18 more
```

Because it is one function, a caller that wants only the three card rules still references all of
them. In a bundler with tree-shaking that costs roughly **55 KiB** of unrelated code; in Metro,
which does not tree-shake across modules, a React Native consumer pays for it unconditionally.

This is not hypothetical for this repository: the first build of the standalone
`HyperswitchVaultForm` used `createFieldValidator`, and `yarn verify:tarball` failed on
`defaultPostalCode` / `isValidCPF` / `isValidCNPJ` appearing in a card-only merchant bundle.

## The current workaround, and what is wrong with it

`src/HyperswitchVaultForm.res` defines three local validators that call
`Validation.cardValid`, `Validation.checkCardExpiry` and `Validation.checkCardCVC` directly, with
the same messages from `LocaleDataType.defaultLocale`.

No validation logic is duplicated — Luhn, the per-scheme length sets, the expiry window and the CVC
length rules all still live in sdk-utils and are called, not copied. **The message mapping is
duplicated**, and that is the part worth fixing: today the pairing of "which rule failed" with
"which locale string to show" exists in two places, so a wording or ordering change in sdk-utils
does not reach this library.

The embedded path (`EmbeddedCardElement` inside hyperswitch-client-core) is unaffected: the host
passes validators built with `createFieldValidator`, exactly as before extraction.

## Proposal

Add a card-only entry point beside the existing one, in `Validation.res` or a new
`CardValidation.res`:

```rescript
type cardRule = CardNumber | CardExpiry | CardCVC

/*
 * Same rules, same messages, same order as `createFieldValidator` — but reachable without
 * referencing PostalCodes, CpfValidation or CnpjValidation.
 */
let createCardFieldValidator: (
  ~rule: cardRule,
  ~localeObject: LocaleDataType.locale,
  ~context: cardValidationContext,   /* the visible expiry string, the detected brand */
) => (option<string> => option<string>)
```

Requirements for it to actually solve the problem:

1. it must not reference `validateField`, directly or transitively — otherwise the bundler keeps the
   whole switch and nothing is saved;
2. `createFieldValidator`'s card branches should then delegate to it, so there is one implementation
   and one message mapping rather than two;
3. empty-value messages (`cardNumberEmptyText`, `cardExpiryDateEmptyText`, `cvcNumberEmptyText`) and
   invalid-value messages (`inValidCardErrorText`, `inValidExpiryErrorText`, `inValidCVCErrorText`)
   must stay byte-identical, since they are user-visible in all four SDKs.

## How to retire the workaround

1. land the entry point in sdk-utils;
2. bump `hyperswitch.sdkUtilsCommit` in this repository's `package.json` and move the submodule;
3. replace the three local validators in `src/HyperswitchVaultForm.res` with calls to it;
4. `yarn verify:tarball` must still report zero `defaultPostalCode` / `isValidCPF` / `isValidCNPJ`
   — that assertion stays regardless, and is what proves the entry point works;
5. `example/__tests__/vaultFormLifecycle.test.tsx` covers the user-visible outcome (an invalid card
   produces `validation_error` and an inline message), so a regression in the messages shows up
   there.

## Related

- `docs/card-element-behavior-contract.md` §6 — the validation ownership map, including the fact
  that `CardValidations.res` / `CardPattern.res` are a drifted duplicate reachable only through
  `CpfValidation`, and that `calculateLuhn` has exactly one live call site.
