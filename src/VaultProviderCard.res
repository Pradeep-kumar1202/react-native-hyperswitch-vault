/*
 * THE CANONICAL PROVIDER-TOKENIZED CARD — the only card-shaped value this library accepts from a
 * caller, and the input to the third-party orchestration confirm.
 *
 * ── WHY THIS TYPE EXISTS AT ALL ────────────────────────────────────────────────
 *
 * `confirmPayment()` never accepts card data: the library owns the fields, so there is nothing to
 * hand it. The third-party vault flow is the one case where that is impossible — VGS, Skyflow,
 * Basis Theory and Evervault collect inside their OWN secure fields, and what comes back is a set
 * of provider aliases. Somebody has to carry those to `/payments/{id}/confirm`, and the decision
 * recorded in the playbook is that this library owns that request.
 *
 * So this is a deliberate, narrow opening, and its shape is the containment:
 *
 *   - It is a CLOSED RECORD of named strings, never `JSON.t`. A provider's raw response cannot be
 *     handed over and re-interpreted here; the caller must have already extracted named fields,
 *     which means the provider-shaped guesswork happens in the package that knows the provider.
 *   - It is reachable ONLY from `VaultOrchestration`, which is published on a separate subpath
 *     that the merchant-facing root surface does not re-export. `confirmPayment()` and the
 *     `paymentCardSource` union are untouched by it.
 *   - It requires an explicit `providerVaultType`. There is no member for `hyperswitch` or
 *     `direct`, so this path cannot be used to stand in for either of the flows the library
 *     already owns end-to-end.
 *
 * ── WHAT THIS TYPE CANNOT DO ───────────────────────────────────────────────────
 *
 * It cannot prove that what it holds is a token. A format-preserving VGS alias is byte-identical
 * in shape to a real PAN — same digits, same length, same Luhn validity — so no type, and no
 * runtime check, can distinguish "an alias" from "the card". Claiming otherwise would be worse
 * than useless: it would invite a caller to treat this as a safe place to put card data.
 *
 * The guarantee is therefore about REACH, not content: this record is not on the merchant surface,
 * cannot be constructed through the public form API, and is asserted absent from the root export
 * by `verify-orchestration-surface.mjs`.
 */

@genType
type providerVaultType = [#vgs | #skyflow | #basis_theory | #evervault]

/*
 * Every member is a provider alias or provider-reported metadata. Nothing here is read from a card
 * field, because in this flow the library never has one.
 *
 * `cardCvc` is REQUIRED, and that is the backend's rule rather than ours: `ProxyCardData.card_cvc`
 * is `Secret<String>`, not `Option<Secret<String>>` (`hyperswitch`,
 * `crates/api_models/src/payments.rs`). A provider that cannot mint a CVC alias cannot use this
 * path, and finding that out at the type is better than finding it out in a 400.
 */
@genType
type providerTokenizedCard = {
  /* The alias standing in for the PAN. */
  cardNumber: string,
  /* The alias standing in for the CVC. Distinct from `cardNumber` for every provider we support. */
  cardCvc: string,
  expiryMonth: string,
  expiryYear: string,
  /*
   * Provider-reported, never derived from a card. Both are optional on the wire, so an absent
   * value is omitted rather than guessed — see `deriveDigits`.
   */
  lastFour?: string,
  binNumber?: string,
  /* The provider's detected brand, if it reports one. Allowlisted before it reaches the wire. */
  cardNetwork?: string,
  cardHolderName?: string,
}

type rejection =
  /* A required alias was absent, blank, or whitespace only. */
  | MissingAlias
  /* The expiry could not be normalised into the month/year pair the backend requires. */
  | MalformedExpiry

/* Validated and normalised. Only this may reach the request builder. */
type resolved = {
  cardNumber: string,
  cardCvc: string,
  expiryMonth: string,
  expiryYear: string,
  lastFour: option<string>,
  binNumber: option<string>,
  cardNetwork: option<string>,
  cardHolderName: option<string>,
}

let nonBlank = (value: string): option<string> => {
  let trimmed = value->String.trim
  trimmed->String.length > 0 ? Some(trimmed) : None
}

let optionalNonBlank = (value: option<string>): option<string> =>
  value->Option.flatMap(nonBlank)

/*
 * `last_four` and `bin_number` are DERIVED FROM THE ALIAS ONLY WHEN THE ALIAS IS ALL DIGITS.
 *
 * This is a deliberate narrowing of what PR #542 did. That implementation sliced the first six and
 * last four characters off the alias unconditionally, which is right for a format-preserving VGS
 * alias — it really is a digit string of card length — and produces nonsense for a provider that
 * mints an opaque identifier, where the "BIN" would be the first six characters of a UUID.
 *
 * Both fields are `Option` on `ProxyCardData`, so omitting them is a supported request. Sending a
 * fabricated BIN is not: it is data the backend may route or report on, and it would be wrong.
 */
let deriveDigits = (alias: string): (option<string>, option<string>) => {
  let digitsOnly =
    alias->String.length > 0 &&
      alias->String.split("")->Array.every(char => char >= "0" && char <= "9")

  if !digitsOnly {
    (None, None)
  } else {
    let length = alias->String.length
    let bin = length >= 6 ? Some(alias->String.substring(~start=0, ~end=6)) : None
    let last4 = length >= 4 ? Some(alias->String.substring(~start=length - 4, ~end=length)) : None
    (bin, last4)
  }
}

/*
 * A ReScript record IS its JS object, so a plain-JavaScript caller who passed nothing at all
 * arrives here as `undefined` rather than as a record of missing fields.
 */
external asNullable: providerTokenizedCard => Nullable.t<providerTokenizedCard> = "%identity"

let resolve = (card: providerTokenizedCard): result<resolved, rejection> =>
  switch card->asNullable->Nullable.toOption {
  | None => Error(MissingAlias)
  | Some(card) =>
    switch (card.cardNumber->nonBlank, card.cardCvc->nonBlank) {
    | (Some(cardNumber), Some(cardCvc)) =>
      switch (card.expiryMonth->nonBlank, card.expiryYear->nonBlank) {
      | (Some(month), Some(year)) =>
        let normalisedMonth = month->Validation.clearSpaces
        let normalisedYear = year->VaultConfirm.requestExpiryYear

        if normalisedMonth->String.length === 0 || normalisedYear->String.length < 4 {
          Error(MalformedExpiry)
        } else {
          let (derivedBin, derivedLast4) = deriveDigits(cardNumber)
          Ok({
            cardNumber,
            cardCvc,
            expiryMonth: normalisedMonth,
            expiryYear: normalisedYear,
            /* Provider-reported wins; derivation is the fallback, and may itself decline. */
            lastFour: switch card.lastFour->optionalNonBlank {
            | Some(_) as reported => reported
            | None => derivedLast4
            },
            binNumber: switch card.binNumber->optionalNonBlank {
            | Some(_) as reported => reported
            | None => derivedBin
            },
            cardNetwork: card.cardNetwork->optionalNonBlank,
            cardHolderName: card.cardHolderName->optionalNonBlank,
          })
        }
      | _ => Error(MalformedExpiry)
      }
    | _ => Error(MissingAlias)
    }
  }

/* Both are integration errors, and neither names which alias was wrong. */
let describe = (rejection: rejection) =>
  switch rejection {
  | MissingAlias
  | MalformedExpiry => #invalid_card_data
  }
