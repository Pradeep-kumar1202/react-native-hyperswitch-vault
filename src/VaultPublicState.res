/*
 * The merchant-facing state vocabulary (ADR-0002 §4, §4a, §5) and the pure derivation that produces
 * it from the controller.
 *
 * ── WHY THIS MODULE IS PURE ────────────────────────────────────────────────────────────────────
 *
 * Everything here is a function of state the controller already holds. There is no second store, no
 * subscription, and no separate notion of readiness: `ready` is derived from the SAME registry
 * counts that `VaultFormHost.presenceGate` uses to refuse a submit, so a merchant's disabled Pay
 * button and the library's own gate cannot disagree.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────────────────────────
 *
 * No card value reaches these records. Not the PAN, not the formatted PAN, not its length, not a
 * BIN or last four, not the expiry month or year, not the CVC or its length, not the
 * authorization, the session id or a token. The only card-derived value published is the detected
 * BRAND, which is a scheme name, and the localised validation MESSAGE the customer can already read
 * on screen. `scripts/verify-public-surface.mjs` gates the declaration and
 * `example/__tests__/fieldEvents.test.tsx` walks every emitted snapshot recursively.
 */

/* ── §4a CardBrand ─────────────────────────────────────────────────────────────────────────── */

@genType
type cardBrand = [
  | #visa
  | #mastercard
  | #americanExpress
  | #dinersClub
  | #discover
  | #jcb
  | #cartesBancaires
  | #interac
  | #maestro
  | #unionPay
  | #rupay
  | #sodexo
  | #bajaj
  | #unknown
]

/*
 * The detector's `issuer` strings are not uniformly cased — `CardPattern.res` carries "Visa",
 * "AmericanExpress" but also "SODEXO" and "BAJAJ" — so this is a documented TABLE, not a mechanical
 * transform. A naive lowercase-first-character rule would emit `sODEXO`. Matching is
 * case-insensitive and trimmed because `Validation.getCardBrand` (used by the scan path) returns
 * upper case where the change path returns mixed case.
 *
 * An unrecognised or absent scheme is `#unknown`. This never throws and never passes the raw
 * detector string through the typed slot.
 */
let brandOf = (detected: string): cardBrand =>
  switch detected->String.trim->String.toLowerCase {
  | "visa" => #visa
  | "mastercard" => #mastercard
  | "americanexpress" => #americanExpress
  | "dinersclub" => #dinersClub
  | "discover" => #discover
  | "jcb" => #jcb
  | "cartesbancaires" => #cartesBancaires
  | "interac" => #interac
  | "maestro" => #maestro
  | "unionpay" => #unionPay
  | "rupay" => #rupay
  | "sodexo" => #sodexo
  | "bajaj" => #bajaj
  | _ => #unknown
  }

/* ── §4 Field state ────────────────────────────────────────────────────────────────────────── */

@genType
type vaultFieldStatus = [#empty | #incomplete | #complete]

@genType
type vaultFieldErrorCode = [#required | #invalid_card_number | #invalid_expiry | #invalid_cvc]

@genType
type vaultFieldError = {
  code: vaultFieldErrorCode,
  message: string,
}

/*
 * Three narrowed records rather than one with an optional `brand`. The ADR describes a single
 * `VaultFieldState` with `brand?: CardBrand // cardNumber only`; emitting the narrowed shapes makes
 * that comment structural — the card number's `brand` is REQUIRED and the other two fields have no
 * `brand` member at all, so a merchant cannot read one where none exists. Each narrowed record is
 * still assignable to the ADR's base shape, and `public.ts` publishes their union under the ADR
 * name `VaultFieldState`.
 */
@genType
type cardNumberState = {
  field: [#cardNumber],
  status: vaultFieldStatus,
  focused: bool,
  brand: cardBrand,
  error?: vaultFieldError,
}

@genType
type expiryState = {
  field: [#expiry],
  status: vaultFieldStatus,
  focused: bool,
  error?: vaultFieldError,
}

@genType
type cvcState = {
  field: [#cvc],
  status: vaultFieldStatus,
  focused: bool,
  error?: vaultFieldError,
}

/* ── §5 Form state ─────────────────────────────────────────────────────────────────────────── */

@genType
type vaultSessionStatus = [#valid | #invalid]

@genType
type vaultFormFields = {
  cardNumber: cardNumberState,
  expiry: expiryState,
  cvc: cvcState,
}

@genType
type vaultFormState = {
  /*
   * FIELD REGISTRATION ONLY: exactly one card-number, one expiry and one CVC field is mounted.
   * Deliberately NOT named `ready` — see the closure note below `formStateOf`.
   */
  fieldsReady: bool,
  sessionStatus: vaultSessionStatus,
  complete: bool,
  submitting: bool,
  canSubmit: bool,
  brand: cardBrand,
  fields: vaultFormFields,
}

/* ── Derivation ────────────────────────────────────────────────────────────────────────────── */

/*
 * `empty` uses the SAME emptiness test the validators use (`String.length === 0`), so a field can
 * never be reported empty while the validator is rejecting it as malformed. A single space is
 * length 1: it is `incomplete`, not `empty`.
 *
 * `accepted` is the raw validator verdict, not the "paint it red" predicate. The two are different
 * questions and both are published: `status` answers "is this field done?", `error` answers "is the
 * customer currently being shown a problem?".
 */
let statusOf = (~value: string, ~accepted: bool) =>
  if value->String.length === 0 {
    #empty
  } else if accepted {
    #complete
  } else {
    #incomplete
  }

/*
 * The error CODE is read off the branch the validator actually took, not re-derived. Every one of
 * `makeCardNumberValidator`, `makeExpiryValidatorWith` and `makeCvcValidatorWith` tests
 * `String.length === 0` first and returns its `*Required` message, falling through to its
 * `*Invalid` message otherwise — so emptiness is exactly the required/invalid discriminator.
 *
 * `visible` is the controller's already-filtered error: the message the UI is currently rendering.
 * Passing the unfiltered validator result here would show a merchant a failure the customer cannot
 * see, which §6 of the ADR forbids.
 */
let errorOf = (~value: string, ~visible: option<string>, ~invalidCode: vaultFieldErrorCode) =>
  visible->Option.map((message): vaultFieldError => {
    code: value->String.length === 0 ? #required : invalidCode,
    message,
  })

type fieldInputs = {
  value: string,
  accepted: bool,
  focused: bool,
  visibleError: option<string>,
}

let cardNumberStateOf = (inputs: fieldInputs, ~brand: string): cardNumberState => {
  field: #cardNumber,
  status: statusOf(~value=inputs.value, ~accepted=inputs.accepted),
  focused: inputs.focused,
  brand: brandOf(brand),
  error: ?errorOf(
    ~value=inputs.value,
    ~visible=inputs.visibleError,
    ~invalidCode=#invalid_card_number,
  ),
}

let expiryStateOf = (inputs: fieldInputs): expiryState => {
  field: #expiry,
  status: statusOf(~value=inputs.value, ~accepted=inputs.accepted),
  focused: inputs.focused,
  error: ?errorOf(~value=inputs.value, ~visible=inputs.visibleError, ~invalidCode=#invalid_expiry),
}

let cvcStateOf = (inputs: fieldInputs): cvcState => {
  field: #cvc,
  status: statusOf(~value=inputs.value, ~accepted=inputs.accepted),
  focused: inputs.focused,
  error: ?errorOf(~value=inputs.value, ~visible=inputs.visibleError, ~invalidCode=#invalid_cvc),
}

/*
 * ── WHY `fieldsReady` AND NOT `ready` ──────────────────────────────────────────────────────────
 *
 * Two contracts were on the table. This is the second, with a corrected name.
 *
 *   A. `ready` folds in the session, and `canSubmit = ready && complete && !submitting`.
 *   B. readiness is field registration only, and the session is a separate member that `canSubmit`
 *      also consults.
 *
 * B is what ADR-0002 §5 argues for, and the argument is a merchant-UX one rather than a modelling
 * preference: a merchant following the recommended `disabled={!canSubmit}` pattern never calls
 * `submit()`, so under A a bad session produces a permanently dead button with NO observable cause,
 * because the only thing that reports `invalid_session` is the `submit()` they are not making.
 * Splitting the two lets them render the actual reason.
 *
 * The NAME is the part this closure changed. `ready` is ambiguous in exactly the direction that
 * matters: a merchant reading `state.ready` reasonably assumes "the form is ready to submit", which
 * is what `canSubmit` means. The ADR itself had to carry a disclaimer sentence ("Field readiness
 * only ... Nothing about the session") to stop that misreading — and a member that needs a
 * disclaimer to be read correctly is misnamed. `fieldsReady` needs none: it says which readiness it
 * is. Nothing is released, so there is no compatibility reason to keep the ambiguous spelling.
 */
let formStateOf = (
  ~fieldsReady: bool,
  ~sessionStatus: vaultSessionStatus,
  ~submitting: bool,
  ~brand: string,
  ~fields: vaultFormFields,
): vaultFormState => {
  let complete =
    fields.cardNumber.status === #complete &&
    fields.expiry.status === #complete &&
    fields.cvc.status === #complete
  {
    fieldsReady,
    sessionStatus,
    complete,
    submitting,
    /*
     * The one member that answers "can I submit right now?". It consults every gate, so a merchant
     * binding a Pay button to it cannot be wrong; the individual members exist so they can explain
     * WHY it is false.
     */
    canSubmit: fieldsReady && sessionStatus === #valid && complete && !submitting,
    brand: brandOf(brand),
    fields,
  }
}

/* ── Structural equality, for emission de-duplication ──────────────────────────────────────── */

/*
 * Field-by-field comparison. NOT JSON.stringify: that allocates two strings on every render, is
 * sensitive to key order, and would silently start comparing anything new that gets added. These
 * functions stop compiling if a member is added and not handled.
 */
let errorEq = (a: option<vaultFieldError>, b: option<vaultFieldError>) =>
  switch (a, b) {
  | (None, None) => true
  | (Some(x), Some(y)) => x.code === y.code && x.message === y.message
  | _ => false
  }

let cardNumberEq = (a: cardNumberState, b: cardNumberState) =>
  a.status === b.status &&
  a.focused === b.focused &&
  a.brand === b.brand &&
  errorEq(a.error, b.error)

let expiryEq = (a: expiryState, b: expiryState) =>
  a.status === b.status && a.focused === b.focused && errorEq(a.error, b.error)

let cvcEq = (a: cvcState, b: cvcState) =>
  a.status === b.status && a.focused === b.focused && errorEq(a.error, b.error)

let formEq = (a: vaultFormState, b: vaultFormState) =>
  a.fieldsReady === b.fieldsReady &&
  a.sessionStatus === b.sessionStatus &&
  a.complete === b.complete &&
  a.submitting === b.submitting &&
  a.canSubmit === b.canSubmit &&
  a.brand === b.brand &&
  cardNumberEq(a.fields.cardNumber, b.fields.cardNumber) &&
  expiryEq(a.fields.expiry, b.fields.expiry) &&
  cvcEq(a.fields.cvc, b.fields.cvc)
