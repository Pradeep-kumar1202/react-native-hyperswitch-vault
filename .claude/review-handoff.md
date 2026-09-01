# Review handoff

## 1. Requirement

Add event emission to the vault library so a merchant can observe, while the customer types,
whether each field holds valid or invalid data (and related field/form state). No card data may
leak through these events. VGS Collect was named as a shape reference.

The library previously had this surface and it was deliberately removed by ADR-0003
(`docs/adr/0003-remove-state-emission-and-own-final-confirmation.md`), whose removal decision this
change reverses. ADR-0003's second decision — the library owns the final payment confirmation and
the payment-method token never reaches a merchant — is unchanged.

## 2. Acceptance criteria

1. Typing, focusing, blurring, validating, brand detection, co-badge state, eligibility verdicts and
   submit lifecycle are each observable through a merchant callback.
2. No emitted payload contains a PAN, BIN, last four, value length, expiry month/year, CVC,
   payment-method token, session id or credential — enforced at the type level and by a build gate
   against the packed declarations.
3. A merchant who passes no callback observes byte-identical behaviour to before this change, and
   the library derives nothing.
4. Passing an inline arrow function as a callback causes no additional emission, no re-registration
   and no render loop.
5. A merchant callback that throws does not break card entry.
6. `yarn build` and every gate in `yarn verify` pass.

## 3. Diff (full)

### New file: src/VaultPublicState.res
```rescript
/*
 * The merchant-facing state vocabulary, and the pure derivation that produces it from the
 * controller.
 *
 * ── WHY THIS MODULE EXISTS AGAIN ───────────────────────────────────────────────────────────────
 *
 * ADR-0003 removed state emission. Its argument was not that the payload was unsafe — it says the
 * opposite, in as many words: "Both were designed to be card-safe, and both were." The argument was
 * that emission was "a standing obligation with no remaining consumer", because `submit()` already
 * answers "may I submit?" without a network call.
 *
 * ADR-0005 records the consumer that argument was missing: a merchant rendering their own chrome
 * needs per-field validity WHILE the customer types, not once at submit. `submit()` cannot answer
 * that — it is a single point-in-time verdict, and calling it to poll would mint tokens.
 *
 * What does NOT change is the boundary. Everything below is derived from state the controller
 * already holds; there is no second store, no subscription and no new retention.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────────────────────────
 *
 * No card value reaches these records. Not the PAN, not the formatted PAN, not its length, not a
 * BIN or last four, not the expiry month or year, not the CVC or its length, not the authorization,
 * the session id or a token.
 *
 * That last exclusion is where this deliberately parts company with VGS Collect, whose per-field
 * update carries `bin` and `last4`. VGS can publish those because it is a PCI-scoped vault with a
 * different threat model; this library's boundary names them as forbidden, and a merchant who holds
 * a BIN is a merchant whose logs now contain one. The SHAPE is borrowed — per-field state, an
 * aggregate, de-duplicated updates. The payload breadth is not.
 *
 * The only card-derived values published are the detected BRAND, which is a scheme name, and the
 * localised validation MESSAGE the customer can already read on screen.
 */

/* ── Brand ─────────────────────────────────────────────────────────────────────────────────── */

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

/* ── Field state ───────────────────────────────────────────────────────────────────────────── */

@genType
type vaultFieldStatus = [#empty | #incomplete | #complete]

@genType
type vaultFieldErrorCode = [
  | #required
  | #invalid_card_number
  | #invalid_expiry
  | #invalid_cvc
  | #unsupported_network
]

@genType
type vaultFieldError = {
  code: vaultFieldErrorCode,
  message: string,
}

/*
 * The eligibility verdict for the card currently typed. `#unknown` and `#pending` both mean "no
 * verdict yet" and are distinguished only so a merchant can avoid flashing chrome while a probe is
 * in flight. Only `#denied` blocks a payment, and it is NOT a validation failure: it is the
 * backend's verdict on a correctly-typed card, which is why it travels beside `error` and not
 * inside it.
 */
@genType
type vaultEligibilityStatus = [#unknown | #pending | #allowed | #denied]

/*
 * Narrowed records rather than one shape with optional members. The card number's `brand` is
 * REQUIRED and the other fields have no `brand` member at all, so a merchant cannot read one where
 * none exists. `public.ts` publishes their union under `VaultFieldState`.
 *
 * Every field carries the same four questions, which are genuinely different questions:
 *
 *   status   how far along is this field?            (#empty / #incomplete / #complete)
 *   valid    would it pass submission right now?     — the direct answer to "valid or invalid"
 *   touched  has the customer interacted with it?    — decides whether YOUR chrome should complain
 *   focused  is the cursor in it?
 *   error    what is the customer being shown NOW?   — already-filtered, never the raw verdict
 *
 * `valid` and `status === #complete` agree today. Both are published because they answer different
 * questions and a future rule (an optional field, say) could separate them; a merchant binding to
 * `valid` should not have to track that.
 */
@genType
type cardNumberState = {
  field: [#cardNumber],
  status: vaultFieldStatus,
  valid: bool,
  touched: bool,
  focused: bool,
  brand: cardBrand,
  /* Whether the customer is being offered a genuine choice of network for this PAN. */
  isCoBadged: bool,
  eligibility: vaultEligibilityStatus,
  error?: vaultFieldError,
}

@genType
type expiryState = {
  field: [#expiry],
  status: vaultFieldStatus,
  valid: bool,
  touched: bool,
  focused: bool,
  error?: vaultFieldError,
}

@genType
type cvcState = {
  field: [#cvc],
  status: vaultFieldStatus,
  valid: bool,
  touched: bool,
  focused: bool,
  error?: vaultFieldError,
}

@genType
type cardholderNameState = {
  field: [#cardholderName],
  status: vaultFieldStatus,
  valid: bool,
  touched: bool,
  focused: bool,
  error?: vaultFieldError,
}

/*
 * What the CONTROLLER hands upward. Not published: the host assembles `vaultFormFields` and
 * `vaultFormState` from it, because whether a cardholder-name field exists at all is a host-level
 * decision (`cardholderName: "collect"`) that the controller does not know.
 */
type controllerSnapshot = {
  cardNumber: cardNumberState,
  expiry: expiryState,
  cvc: cvcState,
  cardholderName: cardholderNameState,
  /*
   * A rejected co-badge pick. Form-level, not field-level: it belongs to no input the customer can
   * retype, so it has no slot on the card-number field.
   */
  networkError: option<vaultFieldError>,
  eligibility: vaultEligibilityStatus,
}

/* ── Form state ────────────────────────────────────────────────────────────────────────────── */

/*
 * `#absent` is not `#invalid`. A form mounted with no session at all is a legitimate Flow 3 form —
 * client-core mounts exactly that when the merchant profile says Skip — and reporting it as
 * `#invalid` would have merchants render a fault where there is none.
 */
@genType
type vaultSessionStatus = [#valid | #invalid | #absent]

@genType
type vaultFormFields = {
  cardNumber: cardNumberState,
  expiry: expiryState,
  cvc: cvcState,
  /* Present only when this form owns the field (`cardholderName: "collect"`). */
  cardholderName?: cardholderNameState,
}

@genType
type vaultFormState = {
  /*
   * FIELD REGISTRATION ONLY: exactly one card-number, one expiry and one CVC field is mounted.
   * Deliberately NOT named `ready` — a merchant reading `state.ready` reasonably assumes "ready to
   * submit", which is what `canSubmit` means. A member that needs a disclaimer to be read correctly
   * is misnamed.
   */
  fieldsReady: bool,
  sessionStatus: vaultSessionStatus,
  complete: bool,
  valid: bool,
  submitting: bool,
  canSubmit: bool,
  brand: cardBrand,
  isCoBadged: bool,
  eligibility: vaultEligibilityStatus,
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
 * see.
 */
let errorOf = (~value: string, ~visible: option<string>, ~invalidCode: vaultFieldErrorCode) =>
  visible->Option.map((message): vaultFieldError => {
    code: value->String.length === 0 ? #required : invalidCode,
    message,
  })

type fieldInputs = {
  value: string,
  accepted: bool,
  touched: bool,
  focused: bool,
  visibleError: option<string>,
}

let cardNumberStateOf = (
  inputs: fieldInputs,
  ~brand: string,
  ~isCoBadged: bool,
  ~eligibility: vaultEligibilityStatus,
): cardNumberState => {
  field: #cardNumber,
  status: statusOf(~value=inputs.value, ~accepted=inputs.accepted),
  valid: inputs.accepted && inputs.value->String.length > 0,
  touched: inputs.touched,
  focused: inputs.focused,
  brand: brandOf(brand),
  isCoBadged,
  eligibility,
  error: ?errorOf(
    ~value=inputs.value,
    ~visible=inputs.visibleError,
    ~invalidCode=#invalid_card_number,
  ),
}

let expiryStateOf = (inputs: fieldInputs): expiryState => {
  field: #expiry,
  status: statusOf(~value=inputs.value, ~accepted=inputs.accepted),
  valid: inputs.accepted && inputs.value->String.length > 0,
  touched: inputs.touched,
  focused: inputs.focused,
  error: ?errorOf(~value=inputs.value, ~visible=inputs.visibleError, ~invalidCode=#invalid_expiry),
}

let cvcStateOf = (inputs: fieldInputs): cvcState => {
  field: #cvc,
  status: statusOf(~value=inputs.value, ~accepted=inputs.accepted),
  valid: inputs.accepted && inputs.value->String.length > 0,
  touched: inputs.touched,
  focused: inputs.focused,
  error: ?errorOf(~value=inputs.value, ~visible=inputs.visibleError, ~invalidCode=#invalid_cvc),
}

/*
 * The cardholder name has no validator of its own in this library, so it is never `#incomplete`:
 * any non-empty value is complete. It is published for focus/typing chrome, not for a verdict the
 * library does not form.
 */
let cardholderNameStateOf = (inputs: fieldInputs): cardholderNameState => {
  field: #cardholderName,
  status: inputs.value->String.length === 0 ? #empty : #complete,
  valid: inputs.value->String.length > 0,
  touched: inputs.touched,
  focused: inputs.focused,
  error: ?errorOf(~value=inputs.value, ~visible=inputs.visibleError, ~invalidCode=#required),
}

let formStateOf = (
  ~fieldsReady: bool,
  ~sessionStatus: vaultSessionStatus,
  ~submitting: bool,
  ~brand: string,
  ~isCoBadged: bool,
  ~eligibility: vaultEligibilityStatus,
  ~networkError: option<vaultFieldError>,
  ~fields: vaultFormFields,
): vaultFormState => {
  let complete =
    fields.cardNumber.status === #complete &&
    fields.expiry.status === #complete &&
    fields.cvc.status === #complete
  /*
   * A co-badge pick that the merchant does not accept is a form-level fault, not a field one: it
   * belongs to no input the customer can retype. It suppresses `valid` without inventing an error
   * slot on the card-number field.
   */
  let valid = complete && networkError->Option.isNone
  {
    fieldsReady,
    sessionStatus,
    complete,
    valid,
    submitting,
    /*
     * The one member that answers "can I submit right now?". It consults every gate, so a merchant
     * binding a Pay button to it cannot be wrong; the individual members exist so they can explain
     * WHY it is false.
     *
     * `#absent` passes: a sessionless form is a valid direct-confirmation form. Eligibility does
     * NOT gate it — a denial is enforced by the coordinator, which answers `card_not_eligible`, and
     * folding it in here would leave a merchant unable to distinguish "still typing" from "this
     * card was refused".
     */
    canSubmit: fieldsReady && sessionStatus !== #invalid && valid && !submitting,
    brand: brandOf(brand),
    isCoBadged,
    eligibility,
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
  a.valid === b.valid &&
  a.touched === b.touched &&
  a.focused === b.focused &&
  a.brand === b.brand &&
  a.isCoBadged === b.isCoBadged &&
  a.eligibility === b.eligibility &&
  errorEq(a.error, b.error)

let expiryEq = (a: expiryState, b: expiryState) =>
  a.status === b.status &&
  a.valid === b.valid &&
  a.touched === b.touched &&
  a.focused === b.focused &&
  errorEq(a.error, b.error)

let cvcEq = (a: cvcState, b: cvcState) =>
  a.status === b.status &&
  a.valid === b.valid &&
  a.touched === b.touched &&
  a.focused === b.focused &&
  errorEq(a.error, b.error)

let cardholderNameEq = (a: cardholderNameState, b: cardholderNameState) =>
  a.status === b.status &&
  a.valid === b.valid &&
  a.touched === b.touched &&
  a.focused === b.focused &&
  errorEq(a.error, b.error)

let optionalCardholderEq = (
  a: option<cardholderNameState>,
  b: option<cardholderNameState>,
) =>
  switch (a, b) {
  | (None, None) => true
  | (Some(x), Some(y)) => cardholderNameEq(x, y)
  | _ => false
  }

let fieldsEq = (a: vaultFormFields, b: vaultFormFields) =>
  cardNumberEq(a.cardNumber, b.cardNumber) &&
  expiryEq(a.expiry, b.expiry) &&
  cvcEq(a.cvc, b.cvc) &&
  optionalCardholderEq(a.cardholderName, b.cardholderName)

let formEq = (a: vaultFormState, b: vaultFormState) =>
  a.fieldsReady === b.fieldsReady &&
  a.sessionStatus === b.sessionStatus &&
  a.complete === b.complete &&
  a.valid === b.valid &&
  a.submitting === b.submitting &&
  a.canSubmit === b.canSubmit &&
  a.brand === b.brand &&
  a.isCoBadged === b.isCoBadged &&
  a.eligibility === b.eligibility &&
  fieldsEq(a.fields, b.fields)
```

### New file: src/VaultStateEmitter.res
```rescript
/*
 * One emission rule, shared by the field callbacks and the aggregate form callback.
 *
 * The contract it implements:
 *
 *   - exactly one initial snapshot, taken AFTER registration has run. The snapshot is built inside
 *     the effect, not during render, because a field registers itself in a child effect and child
 *     effects run before the parent's — so a render-time snapshot would report a registry that is
 *     one commit stale;
 *   - an emission whenever the public snapshot actually differs, by STRUCTURAL comparison;
 *   - no emission when only the callback's function identity changed. The callback is held in a
 *     ref that is refreshed every render, so a parent that passes an inline arrow function causes
 *     no emission and no re-registration;
 *   - no emission after unmount. Emission is synchronous inside an effect BODY, and React never
 *     runs an effect body for an unmounted component. Nothing is scheduled, so there is no queued
 *     call to cancel. An earlier revision also cleared the callback ref in a teardown; that was
 *     removed because React 19 Strict Mode replays effects (mount, cleanup, mount) and the teardown
 *     left the ref null between the replay and the next render — a window in which a genuine
 *     emission would have been silently dropped. It protected against nothing that could happen and
 *     created a hazard that could;
 *   - no render loop: nothing here sets state.
 *
 * The effect deliberately has NO dependency array. It runs after every commit and the equality
 * check decides whether to emit — which is what makes "the final snapshot corresponds to the latest
 * controller state" true under rapid typing, where several state updates can be batched into one
 * commit. A dependency array would have to list every public member and would drift.
 */

/*
 * ── A THROWING MERCHANT CALLBACK ───────────────────────────────────────────────────────────────
 *
 * FAIL_OPEN for the form, PROPAGATE for the error.
 *
 * An exception thrown from `notify` is merchant code failing inside OUR effect. Left alone it
 * unwinds to the nearest error boundary and takes card entry down with it — a bug in an analytics
 * handler must not stop a customer paying. Swallowed silently it becomes undebuggable, and this
 * library writes nothing to the console by design, so there is no third channel to report it on.
 *
 * Re-raising in a macrotask does both: the current commit finishes untouched, and the original
 * error still reaches the app's global handler — a redbox in development, the merchant's own crash
 * reporter in production — with its stack intact. It is the isolation an event emitter owes its
 * listeners, and it is what makes the failure the merchant's to see rather than ours to hide.
 *
 * `lastRef` is updated BEFORE `notify` runs, so a throwing callback still advances the
 * de-duplication cursor. Otherwise every subsequent commit would re-emit the same snapshot and
 * re-raise the same error, turning one merchant bug into an unbounded stream of them.
 */
let notifySafely = (fn: 'a => unit, value: 'a) =>
  try fn(value) catch {
  | exn => setTimeout(() => raise(exn), 0)->ignore
  }

let use = (~build: unit => 'a, ~equal: ('a, 'a) => bool, ~notify: option<'a => unit>) => {
  let notifyRef = React.useRef(notify)
  notifyRef.current = notify

  let lastRef: React.ref<option<'a>> = React.useRef(None)
  let listeningRef = React.useRef(notify->Option.isSome)

  React.useEffectOnEveryRender(() => {
    let listening = notifyRef.current->Option.isSome
    /*
     * Attaching a callback starts a fresh conversation. Without this, a merchant who removes a
     * callback and later restores it would get NO initial snapshot — `lastRef` would still hold the
     * value from the previous attachment, and an unchanged form would compare equal and stay
     * silent. Clearing the cursor on the None -> Some edge guarantees every attachment opens with
     * exactly one snapshot, which is the same guarantee a first mount gets.
     */
    if listening && !listeningRef.current {
      lastRef.current = None
    }
    listeningRef.current = listening

    /*
     * Nothing is built when no merchant is listening. The snapshot derivation is pure and cheap,
     * but "cheap" is not "free", and a form with no callback must cost exactly what it cost before
     * this module existed — which is the honest answer to ADR-0003's objection that emission is a
     * standing obligation.
     */
    switch notifyRef.current {
    | None => ()
    | Some(fn) =>
      let next = build()
      let changed = switch lastRef.current {
      | Some(previous) => !equal(previous, next)
      | None => true
      }
      if changed {
        lastRef.current = Some(next)
        notifySafely(fn, next)
      }
    }
    None
  })
}
```

### Modified tracked files (generated `.gen.tsx` output excluded)
```diff
diff --git a/README.md b/README.md
index a01da9d..1ce971d 100644
--- a/README.md
+++ b/README.md
@@ -279,15 +279,40 @@ idempotency key. The library never retries anything.
 
 ---
 
-## No state events
+## State events
 
-Typing, focusing, blurring, validating and brand detection produce **zero** external callbacks.
-`onStateChange` and `onFormStateChange` were removed, along with `CardFormState`, `VaultFormState`,
-`VaultFieldState`, `canSubmit`, `fieldsReady` and `complete` — see
-[ADR-0003](docs/adr/0003-remove-state-emission-and-own-final-confirmation.md).
+The form tells you what the customer has typed **about**, never what they typed.
 
-The operations answer the same questions without a network request, which is why nothing was lost
-except a callback channel out of the component that owns the card values.
+```tsx
+<CardNumberField
+  onStateChange={s => {
+    s.valid;        // would this field pass submission right now?
+    s.status;       // 'empty' | 'incomplete' | 'complete'
+    s.touched;      // has the customer been here yet — should your chrome complain?
+    s.focused;      // is the cursor in it?
+    s.brand;        // 'visa' | 'mastercard' | … | 'unknown'   (card number only)
+    s.error?.code;  // 'required' | 'invalid_card_number' | …
+  }}
+/>
+
+<HyperswitchVault.CardForm
+  session={session}
+  environment="sandbox"
+  onFormStateChange={s => setPayEnabled(s.canSubmit)}
+/>
+```
+
+`onStateChange` is available on all four fields; `onFormStateChange` on the ready-made form and the
+provider. Both fire once on mount and again only when the snapshot actually changes, so an inline
+arrow function is safe and typing a digit that changes nothing observable emits nothing.
+
+**No card value is on any snapshot** — no PAN, no BIN, no last four, not even the length of what was
+typed, and never the payment-method token. That is the line where this parts company with VGS
+Collect, whose per-field update carries `bin` and `last4`. `verify-event-surface.mjs` pins the exact
+member set against the packed declarations, so the payload cannot be widened without failing the
+build. See [ADR-0005](docs/adr/0005-restore-card-safe-state-emission.md).
+
+Pass no callback and nothing is derived at all.
 
 ---
 
@@ -409,4 +434,5 @@ only the client-safe session response.
 | [docs/app-integration.md](docs/app-integration.md) | all three flows, the operations, and the input contracts |
 | [docs/control-surface.md](docs/control-surface.md) | what you can and cannot control or observe |
 | [docs/public-api-baseline.md](docs/public-api-baseline.md) | the complete published surface |
-| [docs/adr/0003-…md](docs/adr/0003-remove-state-emission-and-own-final-confirmation.md) | why state emission was removed and the library owns the confirmation |
+| [docs/adr/0003-…md](docs/adr/0003-remove-state-emission-and-own-final-confirmation.md) | why the library owns the confirmation (its emission removal is superseded) |
+| [docs/adr/0005-…md](docs/adr/0005-restore-card-safe-state-emission.md) | why state emission is back, and how the payload is pinned |
diff --git a/docs/adr/0003-remove-state-emission-and-own-final-confirmation.md b/docs/adr/0003-remove-state-emission-and-own-final-confirmation.md
index 1962d46..e7fcee1 100644
--- a/docs/adr/0003-remove-state-emission-and-own-final-confirmation.md
+++ b/docs/adr/0003-remove-state-emission-and-own-final-confirmation.md
@@ -2,7 +2,18 @@
 
 **Status:** Accepted · supersedes the emission surface of [ADR-0002](0002-merchant-public-api-contract.md)
 · its flow model is amended by [ADR-0004](0004-library-owns-every-new-card-flow.md)
-
+· **its removal of state emission is superseded by
+[ADR-0005](0005-restore-card-safe-state-emission.md)**
+
+> **Emission is back.** The decision below to remove `onStateChange` / `onFormStateChange` no
+> longer holds: [ADR-0005](0005-restore-card-safe-state-emission.md) restores them with the payload
+> pinned to an exact member set by a build gate. The reasoning below is retained because ADR-0005
+> answers it point by point — in particular, this record's claim that emission had "no remaining
+> consumer" is the part that turned out to be wrong.
+>
+> **The rest of this ADR stands unchanged.** The library still owns the final payment confirmation
+> and the payment-method token still never reaches a merchant.
+>
 > **Amended.** This record described three flows, the third of which was "the library is not
 > involved": with vaulting off, the host kept its own card entry and its own confirm. ADR-0004
 > removed that third arrangement. Every new-card flow now renders the library's fields; vaulting
diff --git a/docs/app-integration.md b/docs/app-integration.md
index 7a52ae2..19a0418 100644
--- a/docs/app-integration.md
+++ b/docs/app-integration.md
@@ -35,10 +35,11 @@ Both share the same session, the same operations, the same result types and the
   or custom, never both.
 - **Multiple providers may exist on one screen**, and each is independent — but every widget belongs
   to exactly one provider, and each provider needs its own session.
-- **The library emits nothing as the customer types.** There are no state callbacks: no validity, no
-  focus, no brand, no completion. That surface was removed (see
-  [ADR-0003](adr/0003-remove-state-emission-and-own-final-confirmation.md)). The only state a host
-  tracks is whether its own promise is still pending.
+- **The library reports state as the customer types, and never values.** `onStateChange` per field
+  and `onFormStateChange` for the form carry validity, completeness, focus, touched and the visible
+  message — no PAN, no BIN, no last four, no length (see
+  [ADR-0005](adr/0005-restore-card-safe-state-emission.md)). Pass no callback and the library derives
+  nothing at all, which is exactly what it cost before the callbacks existed.
 
 The backend endpoint that produces a session is **not** covered here — see
 [merchant-integration.md](merchant-integration.md#2-the-server). This document assumes you have it.
diff --git a/docs/control-surface.md b/docs/control-surface.md
index 6893509..2e1847f 100644
--- a/docs/control-surface.md
+++ b/docs/control-surface.md
@@ -26,22 +26,29 @@ supported way to do it?
 | Know whether an operation is running | yes | track your own promise |
 | Read the PAN, expiry, CVC or cardholder name | **no** | there is no accessor, in any form |
 | Set a card value | **no** | the fields are not controlled inputs |
-| Subscribe to typing, focus, validity or brand | **no** | the state-emission surface was removed |
+| Subscribe to typing, focus, validity or brand | **yes** | `onStateChange` per field, `onFormStateChange` for the form ([ADR-0005](adr/0005-restore-card-safe-state-emission.md)) |
 | Pre-disable a button from library state | **no** | call the operation; it answers without a request |
 | Call the tokenization transport yourself | **no** | it is internal and has no export |
 | Receive the intermediate token in Flow 2 | **no** | `VaultPaymentResult` has no `token` member |
 
 ---
 
-## 2. What was removed, and what replaced it
+## 2. What you may observe, and what you may not
 
-ADR-0003 removed every state-emission callback: `onStateChange` (per field and form-wide),
-`onFormStateChange`, and the types they carried (`CardFormState`, `VaultFormState`,
-`VaultFieldState`, `canSubmit`, `fieldsReady`, `complete`, brand events, focus and validation
-snapshots). None of these exists any more.
+ADR-0003 removed every state-emission callback. [ADR-0005](adr/0005-restore-card-safe-state-emission.md)
+restored them, because the claim they had no consumer was wrong: `submit()` answers "may I submit?"
+at one instant on demand, and a merchant drawing their own chrome needs the answer continuously,
+while the customer types.
 
-The replacement is not another callback. It is that **the operations already answer the question**,
-without a network request:
+What came back is **state**, never values. `onStateChange` per field and `onFormStateChange` for the
+form report validity, completeness, focus, whether the field has been touched, the message already
+on screen, and — for the card number — the detected scheme, whether the card is co-badged and its
+eligibility verdict. They carry no PAN, no BIN, no last four, not even the length of what was typed.
+`verify-event-surface.mjs` pins that member by member against the packed declarations, so widening
+the payload is a build failure rather than a review comment.
+
+Some questions are still answered by the operations rather than a callback, without a network
+request:
 
 | Old question | New answer |
 |---|---|
@@ -143,7 +150,7 @@ Every claim on this page is gated, not asserted:
 
 | Claim | Gate |
 |---|---|
-| No state-emission surface in the published types | `verify-event-surface.mjs` |
+| The emitted payload is exactly its allowlist — no card value, no wider, no narrower | `verify-event-surface.mjs` |
 | `token` appears in the tokenize result and nowhere else | `verify-result-mapping.mjs`, `verify-publishable.mjs`, `verify-merchant-only.mjs` |
 | Host input is narrow; card keys rejected at depth | `verify-noncard-input.mjs` |
 | Every outcome maps to a safe result with a fixed message | `verify-result-mapping.mjs`, `verify-final-confirm.mjs` |
diff --git a/docs/merchant-integration.md b/docs/merchant-integration.md
index 28cf6da..870ab3e 100644
--- a/docs/merchant-integration.md
+++ b/docs/merchant-integration.md
@@ -268,7 +268,63 @@ place `<CardholderNameField />` yourself or omit it — tokenization still succe
 Like every other field, it is library-owned: you can style and label it, and there is no supported
 way to read or set what the customer typed.
 
-### 3.6 The ref handle
+### 3.6 Knowing what the customer has typed
+
+The library reports **state**, never values. Pass `onStateChange` to any field, or
+`onFormStateChange` to the form, and drive your own chrome from it:
+
+```tsx
+const [canPay, setCanPay] = useState(false);
+
+<HyperswitchVaultForm
+  ref={formRef}
+  session={session}
+  environment="sandbox"
+  onFormStateChange={s => setCanPay(s.canSubmit)}
+/>
+<Button title="Pay" disabled={!canPay} onPress={pay} />
+```
+
+Per field, for a tick or a border colour:
+
+```tsx
+<CardNumberField
+  onStateChange={s => {
+    setNumberValid(s.valid);
+    setBrandIcon(s.brand);
+    setNumberError(s.touched ? s.error?.message : undefined);
+  }}
+/>
+```
+
+| Member | On | Meaning |
+| --- | --- | --- |
+| `status` | every field | `empty`, `incomplete` or `complete` |
+| `valid` | every field | would this field pass submission right now |
+| `touched` | every field | the customer has interacted with it — use this to decide whether *your* chrome should complain yet |
+| `focused` | every field | the cursor is in it |
+| `error` | every field | `{code, message}` for what is on screen now, or absent |
+| `brand` | card number | the detected scheme, or `unknown` |
+| `isCoBadged` | card number | the customer is being offered a genuine choice of network |
+| `eligibility` | card number | `unknown`, `pending`, `allowed` or `denied` |
+| `canSubmit` | form | every gate passes; bind your Pay button to this one |
+| `fieldsReady` | form | exactly one of each required field is mounted |
+| `sessionStatus` | form | `valid`, `invalid`, or `absent` when the form was mounted without a session |
+| `complete` / `valid` | form | all fields complete; and complete with an accepted network |
+| `submitting` | form | an operation is in flight |
+| `fields` | form | the four field states, `cardholderName` present only when this form owns that field |
+
+Both callbacks fire **once on mount** and again **only when the snapshot actually changes**, by
+structural comparison — so an inline arrow function is safe, and a keystroke that changes nothing
+observable emits nothing. Pass no callback and the library derives nothing at all.
+
+**No card value is on any snapshot.** Not the PAN, not a BIN, not the last four, not the length of
+what was typed, not the expiry parts, not the CVC, and never the payment-method token. If you have
+integrated VGS Collect before, this is the one place the shapes differ: VGS carries `bin` and
+`last4` and this library carries neither. `scripts/verify-event-surface.mjs` pins the exact member
+set against the published declarations, so the payload cannot grow without failing the build.
+
+### 3.7 The ref handle
 
 ```ts
 tokenize(): Promise<VaultTokenizeResult>            // Flow 1 — this guide
diff --git a/docs/public-api-baseline.md b/docs/public-api-baseline.md
index fbd669d..7ab2581 100644
--- a/docs/public-api-baseline.md
+++ b/docs/public-api-baseline.md
@@ -204,11 +204,13 @@ Session: `MerchantSession`.
 
 Named explicitly so their absence is checkable rather than assumed:
 
-- **State emission — all removed in ADR-0003, gated by `verify-event-surface.mjs`.**
-  Removed: `onStateChange`, `onFormStateChange`, `CardFormState`, `VaultFormState`.
-  Removed: `VaultFieldState`, `VaultFormFields`, `VaultFieldStatus`, `VaultFieldError`.
-  Removed: `VaultFieldErrorCode`, `VaultSessionStatus`, `CardBrand`.
-  Removed: `canSubmit`, `fieldsReady`, `complete`. None of these exists.
+- **Card values inside the emitted state.** State emission itself is published again under
+  [ADR-0005](adr/0005-restore-card-safe-state-emission.md) — `onStateChange`, `onFormStateChange`
+  and their types are part of the supported surface. What remains unpublished is any card value
+  within them: there is no `value`, `bin`, `last4`, `length`, `expiryMonth`, `expiryYear` or `token`
+  on any snapshot, and `verify-event-surface.mjs` holds the exact member allowlist that keeps it so.
+  `CardFormState` and `CardBrand` are still gone as names; the published spellings are
+  `VaultFormState` and `VaultCardBrand`.
 - **Controlled inputs.** `value`, `defaultValue`, `onChange`, `onChangeText` on any field.
 - **Value accessors.** Nothing reads the PAN, expiry, CVC or cardholder name.
 - **The transports.** `confirmPaymentMethodSession`, `confirmPayment` (internal), `cardDetails`,
diff --git a/scripts/verify-docs.mjs b/scripts/verify-docs.mjs
index 80f53a6..ab730ce 100644
--- a/scripts/verify-docs.mjs
+++ b/scripts/verify-docs.mjs
@@ -75,6 +75,7 @@ const HISTORICAL_MARKER = /Historical \/ removed design/;
 const ACCEPTED = [
   'docs/adr/0003-remove-state-emission-and-own-final-confirmation.md',
   'docs/adr/0004-library-owns-every-new-card-flow.md',
+  'docs/adr/0005-restore-card-safe-state-emission.md',
 ];
 const ACCEPTED_MARKER = /\*\*Status:\*\*\s*Accepted/;
 
diff --git a/scripts/verify-event-surface.mjs b/scripts/verify-event-surface.mjs
index bae4491..b7c8bff 100644
--- a/scripts/verify-event-surface.mjs
+++ b/scripts/verify-event-surface.mjs
@@ -1,17 +1,25 @@
 #!/usr/bin/env node
 /*
- * Published-declaration proof that the library has NO merchant state-emission surface
- * (ADR-0003).
+ * Published-declaration proof that the merchant state-emission surface carries NO card data
+ * (ADR-0005).
  *
- * This gate used to assert the opposite: that the emitted snapshots were correctly typed and
- * card-free. ADR-0003 removes emission entirely — typing, focusing, blurring, validating and brand
- * changes produce zero external callbacks — so the gate now proves ABSENCE, checked against the
- * PACKED tarball rather than the working tree.
+ * ── WHAT THIS GATE ASSERTS, AND WHY IT CHANGED SHAPE ───────────────────────────────────────────
  *
- * Absence is checked by EXACT declared-name matching with word boundaries, never a substring
- * search: `brandIconMode` is legitimate configuration and must not be mistaken for an emitted
- * `brand`. The consumer compile below carries negative controls and is verified non-vacuous, because
- * a declaration typed `any` would satisfy any assertion.
+ * It has now been all three things:
+ *
+ *   ADR-0002  the emitted snapshots are correctly typed and card-free
+ *   ADR-0003  there is no emission at all — assert ABSENCE
+ *   ADR-0005  emission is back, and the payload is pinned MEMBER BY MEMBER
+ *
+ * The ADR-0003 gate could be satisfied by deleting things. This one cannot: it fails if emission
+ * disappears AND it fails if emission grows. That matters, because ADR-0003's real objection was
+ * never that the payload was unsafe — it says the opposite in as many words — but that a live
+ * callback channel is "widened by the next contributor". An exact-member-set assertion is the
+ * answer to that objection: widening the payload is not a judgement call a future contributor makes
+ * quietly, it is a red build with this file naming the member they added.
+ *
+ * Checked against the PACKED tarball, not the working tree, because what a merchant compiles
+ * against is the published declaration.
  */
 import { execFileSync } from 'node:child_process';
 import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, symlinkSync, existsSync } from 'node:fs';
@@ -49,118 +57,116 @@ const declFiles = readdirSync(declDir).filter((f) => f.endsWith('.d.ts'));
 const decls = declFiles.map((file) => [file, readFileSync(path.join(declDir, file), 'utf8')]);
 const allDecl = decls.map(([, text]) => text).join('\n');
 
-console.log('\nPacked declarations: the state-emission surface is gone');
-
 /*
- * ── Removed modules ──────────────────────────────────────────────────────────
- * The two modules that existed only to build and emit merchant state.
+ * ── The payload, pinned ──────────────────────────────────────────────────────────────────────
+ *
+ * Every emitted object type and the EXACT set of members it may declare. Not a forbidden-name
+ * denylist: a denylist only catches the leaks somebody already thought of, and `last4` spelled
+ * `tail` walks straight through one. An allowlist inverts the burden — anything not listed here
+ * fails, so a new member is a deliberate, reviewed edit to this file.
+ *
+ * `message` is the only member permitted to be a free `string`. It is the localised validation text
+ * the customer is already reading on screen. Every other member is a boolean or a closed union, so
+ * there is no slot of an open type for a card value to travel in.
  */
-for (const gone of ['VaultPublicState.gen.d.ts', 'VaultStateEmitter.gen.d.ts']) {
-  check(!declFiles.includes(gone), `${gone} is not published (module deleted)`);
-}
+const EMITTED_SHAPES = {
+  vaultFieldError: ['code', 'message'],
+  cardNumberState: ['field', 'status', 'valid', 'touched', 'focused', 'brand', 'isCoBadged', 'eligibility', 'error'],
+  expiryState: ['field', 'status', 'valid', 'touched', 'focused', 'error'],
+  cvcState: ['field', 'status', 'valid', 'touched', 'focused', 'error'],
+  cardholderNameState: ['field', 'status', 'valid', 'touched', 'focused', 'error'],
+  vaultFormFields: ['cardNumber', 'expiry', 'cvc', 'cardholderName'],
+  vaultFormState: ['fieldsReady', 'sessionStatus', 'complete', 'valid', 'submitting', 'canSubmit', 'brand', 'isCoBadged', 'eligibility', 'fields'],
+};
+
+/* The only members allowed to be typed `string`. Anything else of an open type is a leak slot. */
+const STRING_MEMBERS_ALLOWED = new Set(['message']);
+
+const publicState = decls.find(([file]) => file === 'VaultPublicState.gen.d.ts');
+
+console.log('\nPacked declarations: the emitted payload is exactly what ADR-0005 describes');
+
+check(Boolean(publicState), 'VaultPublicState.gen.d.ts IS published (emission exists)');
 
 /*
- * ── Forbidden IDENTIFIERS, matched exactly ───────────────────────────────────
- * Any declared property, type name, or export with one of these exact names is a regression. The
- * word-boundary regex is what keeps `brandIconMode` legal while `brand` is not.
+ * Members are read off the declaration text rather than a TypeScript AST because the shape genType
+ * emits is fixed and trivially regular: one `readonly name?: type;` per line inside a braced body.
+ * A parser dependency would be a heavier thing to trust than the four lines below.
  */
-const FORBIDDEN_NAMES = [
-  'onStateChange',
-  'onFormStateChange',
-  'cardFormState',
-  'CardFormState',
-  'vaultFormState',
-  'VaultFormState',
-  'vaultFormFields',
-  'VaultFormFields',
-  'VaultFieldState',
-  'vaultFieldStatus',
-  'VaultFieldStatus',
-  'vaultFieldError',
-  'VaultFieldError',
-  'vaultFieldErrorCode',
-  'VaultFieldErrorCode',
-  'vaultSessionStatus',
-  'VaultSessionStatus',
-  'cardNumberState',
-  'expiryState',
-  'cvcState',
-  'VaultCardNumberState',
-  'VaultExpiryState',
-  'VaultCVCState',
-  'canSubmit',
-  'fieldsReady',
-  'sessionStatus',
-  'submitting',
-  'complete',
-  'cardBrand',
-  'CardBrand',
-  'cardNumberValid',
-  'expiryValid',
-  'cvcValid',
-];
+const bodyOf = (text, name) => {
+  const m = new RegExp(`export type ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(text);
+  return m ? m[1] : null;
+};
+const membersOf = (body) =>
+  [...body.matchAll(/(?:^|\n)\s*readonly\s+([A-Za-z0-9_]+)\??\s*:/g)].map((m) => m[1]);
+const memberTypes = (body) =>
+  [...body.matchAll(/(?:^|\n)\s*readonly\s+([A-Za-z0-9_]+)\??\s*:\s*([\s\S]*?)(?=;\s*(?:\n\s*readonly|\n?$))/g)]
+    .map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]);
+
+if (publicState) {
+  const [, text] = publicState;
+  for (const [typeName, allowed] of Object.entries(EMITTED_SHAPES)) {
+    const body = bodyOf(text, typeName);
+    if (!body) {
+      check(false, `${typeName} is declared in the published types`);
+      continue;
+    }
+    const found = membersOf(body);
+    const extra = found.filter((m) => !allowed.includes(m));
+    const missing = allowed.filter((m) => !found.includes(m));
+    check(
+      extra.length === 0,
+      `${typeName} declares no member beyond its allowlist${extra.length ? ` (added: ${extra.join(', ')})` : ''}`
+    );
+    check(
+      missing.length === 0,
+      `${typeName} still declares every member merchants rely on${missing.length ? ` (lost: ${missing.join(', ')})` : ''}`
+    );
 
-for (const name of FORBIDDEN_NAMES) {
-  const hits = decls
-    .filter(([, text]) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text))
-    .map(([file]) => file);
-  check(hits.length === 0, `no \`${name}\` anywhere in the published declarations${hits.length ? ` (found in ${hits.join(', ')})` : ''}`);
+    for (const [member, type] of memberTypes(body)) {
+      if (STRING_MEMBERS_ALLOWED.has(member)) continue;
+      check(
+        type !== 'string',
+        `${typeName}.${member} is not an open \`string\` (found: ${type})`
+      );
+    }
+  }
 }
 
 /*
- * ── `brand` as an emitted member, with the config allowlist ───────────────────
- * `brandIconMode` / `brandIcon` are visual configuration the merchant SETS; they are not state the
- * library emits. Only an exact `brand` property or type name is forbidden.
- */
-/*
- * All four spellings name the SAME icon-configuration union — `fieldBrandIconMode` is the import
- * alias `public.ts` gives it, which survives into the emitted declarations. Configuration the
- * merchant SETS is not state the library EMITS, which is the distinction this gate exists to keep.
- */
-/*
- * `selectCardBrandLabel` joined this list with the co-badge chooser. It is a LOCALISATION STRING —
- * the heading a merchant puts on the network picker — and it is set, never emitted. The chooser
- * itself publishes nothing: which network the customer picked changes the request the library
- * builds and is not readable through any prop, callback or result. If a `selectedBrand`,
- * `onBrandChange` or `cardBrand` ever appeared here, this gate would still fail, which is what
- * keeps the exception narrow.
+ * ── Card vocabulary, banned as a MEMBER name ─────────────────────────────────────────────────
+ *
+ * The allowlist above already makes these unreachable; this is the second lock, and it is the one
+ * that reads as intent to someone skimming the file. `cardNumber` is absent from the list on
+ * purpose: it is a legitimate member of `vaultFormFields` and a legitimate `field` discriminant.
+ * What must never appear is a member CARRYING the number, which the allowlist and the no-open-string
+ * rule between them already forbid.
  */
-const ALLOWED_BRAND_NAMES = new Set([
-  'brandIconMode',
-  'brandIcon',
-  'fieldBrandIconMode',
-  'VaultBrandIconMode',
-  'VaultFormBrandIconMode',
-  'selectCardBrandLabel',
-]);
-const brandIdentifiers = [...allDecl.matchAll(/(?<![A-Za-z0-9_])(brand[A-Za-z0-9_]*|[A-Za-z0-9_]*Brand[A-Za-z0-9_]*)(?![A-Za-z0-9_])/g)]
-  .map((m) => m[1]);
-const badBrand = [...new Set(brandIdentifiers.filter((id) => !ALLOWED_BRAND_NAMES.has(id)))];
-check(
-  badBrand.length === 0,
-  `the only brand identifiers published are the icon-config ones (offending: ${badBrand.join(', ') || 'none'})`
-);
-check(
-  allDecl.includes('brandIconMode'),
-  'the gate is not trivially satisfied: brandIconMode IS still published (config, not state)'
-);
+const BANNED_MEMBERS = [
+  'pan', 'bin', 'iin', 'last4', 'lastFour', 'first6', 'firstSix',
+  'value', 'rawValue', 'number', 'cvv', 'cvcValue', 'securityCode',
+  'expiryMonth', 'expiryYear', 'month', 'year',
+  'token', 'paymentMethodToken', 'authorization', 'sdkAuthorization', 'sessionId',
+  'length', 'valueLength', 'digits',
+];
+if (publicState) {
+  const [, text] = publicState;
+  const declared = [...text.matchAll(/readonly\s+([A-Za-z0-9_]+)\??\s*:/g)].map((m) => m[1]);
+  const banned = [...new Set(declared.filter((m) => BANNED_MEMBERS.includes(m)))];
+  check(banned.length === 0, `no card-value member name in the emitted types (found: ${banned.join(', ') || 'none'})`);
+}
 
 /*
- * ── No emitted-state callback of any shape ───────────────────────────────────
- * A renamed callback would evade the exact-name list above, so also forbid the SHAPE: a declared
- * `on*` property whose single parameter is an object type. The library has no such prop left.
+ * ── The callbacks are published ──────────────────────────────────────────────────────────────
+ * Absence is a regression now, so it is asserted directly rather than implied by the consumer
+ * compile, which could pass for the wrong reason if a prop bag went `any`.
  */
-const onProps = [...allDecl.matchAll(/(?<![A-Za-z0-9_])(on[A-Z][A-Za-z0-9_]*)\??:/g)].map((m) => m[1]);
-const ALLOWED_ON_PROPS = new Set([]);
-const unexpectedOnProps = [...new Set(onProps.filter((p) => !ALLOWED_ON_PROPS.has(p)))];
-check(
-  unexpectedOnProps.length === 0,
-  `no \`on*\` callback prop is published (found: ${unexpectedOnProps.join(', ') || 'none'})`
-);
+check(/onFormStateChange\??:/.test(allDecl), 'onFormStateChange is published on the form surface');
+check(/onStateChange\??:/.test(allDecl), 'onStateChange is published on the field surface');
 
 /* ── Consumer compile, with non-vacuous negative controls ──────────────────── */
 
-console.log('\nConsumer compile: emission props are rejected at the type level');
+console.log('\nConsumer compile: state is readable, card values are not');
 
 writeFileSync(
   path.join(workspace, 'tsconfig.json'),
@@ -176,26 +182,66 @@ import * as React from 'react';
 import {
   CardNumberField, CardExpiryField, CardCVCField, HyperswitchVault,
 } from '${PKG}';
+import type {
+  VaultFormState, VaultCardNumberState, VaultExpiryState, VaultCVCState, VaultFieldState,
+} from '${PKG}';
 
-/* POSITIVE — the fields still render with their configuration props. */
-export const a = <CardNumberField placeholder="Card number" brandIconMode="standard" />;
-export const b = <CardExpiryField placeholder="MM / YY" />;
-export const c = <CardCVCField cvcIcon="default" />;
-export const d = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" />;
+/* POSITIVE — the whole point of ADR-0005: a merchant can drive their own chrome. */
+export const a = (
+  <CardNumberField
+    placeholder="Card number"
+    brandIconMode="standard"
+    onStateChange={(s: VaultCardNumberState) => {
+      const valid: boolean = s.valid;
+      const empty: boolean = s.status === 'empty';
+      const focused: boolean = s.focused;
+      const touched: boolean = s.touched;
+      const brand: string = s.brand;
+      const reason: string | undefined = s.error?.code;
+      return [valid, empty, focused, touched, brand, reason];
+    }}
+  />
+);
+export const b = <CardExpiryField onStateChange={(s: VaultExpiryState) => s.valid} />;
+export const c = <CardCVCField onStateChange={(s: VaultCVCState) => s.error?.message} />;
+export const d = (
+  <HyperswitchVault.CardForm
+    session={{} as never}
+    environment="sandbox"
+    onFormStateChange={(s: VaultFormState) => {
+      const canSubmit: boolean = s.canSubmit;
+      const perField: boolean = s.fields.cvc.valid;
+      return canSubmit && perField;
+    }}
+  />
+);
+/* The discriminated union narrows, and \`brand\` exists on exactly one branch. */
+export function narrow(s: VaultFieldState): string {
+  switch (s.field) {
+    case 'cardNumber': return s.brand;
+    default: return s.status;
+  }
+}
 
 /* NEGATIVE — every one must be an error. On an \`any\`, all of them would pass. */
-// @ts-expect-error - per-field state emission is gone
-export const n1 = <CardNumberField onStateChange={(s: unknown) => s} />;
-// @ts-expect-error - per-field state emission is gone
-export const n2 = <CardExpiryField onStateChange={(s: unknown) => s} />;
-// @ts-expect-error - per-field state emission is gone
-export const n3 = <CardCVCField onStateChange={(s: unknown) => s} />;
-// @ts-expect-error - aggregate form state emission is gone
-export const n4 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" onFormStateChange={(s: unknown) => s} />;
-// @ts-expect-error - the ready-made form has no per-field emission either
-export const n5 = <HyperswitchVault.CardForm session={{} as never} environment="sandbox" onStateChange={(s: unknown) => s} />;
-// @ts-expect-error - the provider (custom layout) has no emission
-export const n6 = <HyperswitchVault.Form session={{} as never} environment="sandbox" onFormStateChange={(s: unknown) => s}><CardNumberField /></HyperswitchVault.Form>;
+declare const num: VaultCardNumberState;
+declare const form: VaultFormState;
+// @ts-expect-error - no PAN on an emitted snapshot
+export const n1 = num.value;
+// @ts-expect-error - no BIN on an emitted snapshot
+export const n2 = num.bin;
+// @ts-expect-error - no last four on an emitted snapshot
+export const n3 = num.last4;
+// @ts-expect-error - no value length on an emitted snapshot
+export const n4 = num.length;
+// @ts-expect-error - no CVC value on an emitted snapshot
+export const n5 = form.fields.cvc.value;
+// @ts-expect-error - no expiry values on an emitted snapshot
+export const n6 = form.fields.expiry.expiryMonth;
+// @ts-expect-error - no token on an emitted snapshot
+export const n7 = form.token;
+// @ts-expect-error - \`brand\` is card-number only; it is not on the expiry branch
+export const n8 = form.fields.expiry.brand;
 `;
 writeFileSync(path.join(workspace, 'consumer.tsx'), consumer);
 
@@ -208,13 +254,13 @@ try {
   tscFailed = true;
   tscOutput = String(error.stdout ?? '') + String(error.stderr ?? '');
 }
-check(!tscFailed, `the packed types compile a real consumer and reject every emission prop${tscFailed ? `:\n${tscOutput.split('\n').slice(0, 12).join('\n')}` : ''}`);
+check(!tscFailed, `the packed types compile a real consumer and reject every card-value read${tscFailed ? `:\n${tscOutput.split('\n').slice(0, 14).join('\n')}` : ''}`);
 
 /*
- * Non-vacuity: removing one guard must make tsc fail. If the props were silently accepted (an `any`
- * prop bag, say), the @ts-expect-error would be the only thing erroring and this would not detect it.
+ * Non-vacuity: removing one guard must make tsc fail. If the snapshot were silently `any`, the
+ * @ts-expect-error would be the only thing erroring and this would not detect it.
  */
-writeFileSync(path.join(workspace, 'consumer.tsx'), consumer.replace('// @ts-expect-error - aggregate form state emission is gone\n', ''));
+writeFileSync(path.join(workspace, 'consumer.tsx'), consumer.replace('// @ts-expect-error - no BIN on an emitted snapshot\n', ''));
 let harnessDetects = false;
 try {
   execFileSync(tsc, ['-p', 'tsconfig.json'], { cwd: workspace, stdio: 'pipe' });
@@ -231,4 +277,4 @@ if (failures.length) {
   for (const f of failures) console.error(`  - ${f}`);
   process.exit(1);
 }
-console.log('\n[verify-event-surface] OK - the library publishes no state-emission surface');
+console.log('\n[verify-event-surface] OK - emission is published and carries no card data');
diff --git a/scripts/verify-flow-docs.mjs b/scripts/verify-flow-docs.mjs
index acfb8a4..90bab7f 100644
--- a/scripts/verify-flow-docs.mjs
+++ b/scripts/verify-flow-docs.mjs
@@ -14,7 +14,7 @@
  *
  *   1. the MERCHANT flow is documented as performing the final payment confirmation;
  *   2. the CLIENT-CORE flow is documented as returning a token;
- *   3. a removed state callback reappears;
+ *   3. a card value is documented as readable from an emitted snapshot;
  *   4. Flow 3 (vault disabled) is described as a FALLBACK for a broken vault configuration.
  *
  * Checks are scoped to a "flow section" — a heading and the prose under it — so a document may
@@ -42,21 +42,27 @@ const DOCS = [
 
 /* ── 3. Removed state callbacks, anywhere, in any document ─────────────────── */
 
-const REMOVED_CALLBACKS = [
-  'onStateChange',
-  'onFormStateChange',
-  'canSubmit',
-  'fieldsReady',
-  'CardFormState',
-  'VaultFormState',
-  'VaultFieldState',
+/*
+ * ADR-0005 restored `onStateChange` / `onFormStateChange`, so naming them is no longer the defect —
+ * this list used to hold them. The defect that replaced it is narrower and worse: documentation
+ * that shows a merchant reading a CARD VALUE off an emitted snapshot. A doc example is the first
+ * thing a merchant copies, so a sample doing `s.last4` would spread a member that does not exist
+ * and, if it ever did, must not.
+ *
+ * Deliberately MEMBER ACCESS, not bare words. The docs have to be able to say "VGS carries `bin`
+ * and `last4`, this library carries neither" — naming the thing in order to disclaim it is the
+ * clearest way to write it, and a bare-word scan would forbid exactly that sentence.
+ */
+const LEAKED_READS = [
+  /\b(?:s|state|snapshot|fieldState|formState|cardNumberState)\s*\.\s*(?:bin|iin|last4|lastFour|first6|pan|value|rawValue|cvv|securityCode|expiryMonth|expiryYear|token|sdkAuthorization)\b/,
+  /onStateChange[^\n]*\.\s*(?:bin|last4|pan|value)\b/,
 ];
 
 /*
  * A doc may NAME a removed callback to say it is gone. The marker must be on the same line, which
  * is what stops "use onStateChange to enable your button" from passing.
  */
-const REMOVAL_MARKER = /\bremoved\b|\bno longer\b|\bdoes not exist\b|\bgone\b|gets no\b|gets nothing\b|gets neither\b|\bnot exposed\b|there is no\b|gets no\b/i;
+const REMOVAL_MARKER = /\bremoved\b|\bno longer\b|\bdoes not exist\b|\bgone\b|gets no\b|gets nothing\b|gets neither\b|\bnot exposed\b|there is no\b|carries no\b|carries neither\b|\bno card value\b|\bnever\b/i;
 
 /* ── 1 & 2. Flow confusion ─────────────────────────────────────────────────── */
 
@@ -128,10 +134,10 @@ for (const file of DOCS) {
   const lines = readFileSync(full, 'utf8').split('\n');
 
   /*
-   * 3. Removed callbacks.
+   * 3. Card values read off a snapshot.
    *
-   * Prose wraps, so "`onStateChange` … was\nremoved" is one sentence across two lines. The marker
-   * is looked for in a small WINDOW around the mention rather than on the line alone — the same rule
+   * Prose wraps, so "`s.last4` … does not\nexist" is one sentence across two lines. The marker is
+   * looked for in a small WINDOW around the mention rather than on the line alone — the same rule
    * `verify-docs.mjs` uses, and for the same reason: otherwise the docs would have to be written to
    * suit the scanner.
    */
@@ -140,11 +146,11 @@ for (const file of DOCS) {
   const revived = lines
     .map((text, i) => ({ text, number: i + 1, index: i }))
     .filter(({ text, index }) =>
-      REMOVED_CALLBACKS.some((name) => text.includes(name)) && !REMOVAL_MARKER.test(windowAround(index))
+      LEAKED_READS.some((pattern) => pattern.test(text)) && !REMOVAL_MARKER.test(windowAround(index))
     );
   check(
     revived.length === 0,
-    `${file} presents no removed state callback as available` +
+    `${file} documents no card value as readable from an emitted snapshot` +
       (revived.length ? ` (line ${revived[0].number}: ${revived[0].text.trim().slice(0, 70)})` : '')
   );
 
@@ -228,9 +234,9 @@ const fallbackCaught = sectionsOf(
 ).some((section) => section.lines.some(({ text }) => /fall(s|ing)?[ -]?back|fallback/i.test(text) && !/never|not a|no fallback|does not/i.test(text)));
 check(fallbackCaught, 'the gate catches Flow 3 described as a fallback');
 
-const callbackCaught = ['Use onStateChange to enable your button.']
-  .some((text) => REMOVED_CALLBACKS.some((name) => text.includes(name)) && !REMOVAL_MARKER.test(text));
-check(callbackCaught, 'the gate catches a revived state callback');
+const leakCaught = ['Show the card with s.last4 from the snapshot.']
+  .some((text) => LEAKED_READS.some((pattern) => pattern.test(text)) && !REMOVAL_MARKER.test(text));
+check(leakCaught, 'the gate catches a card value documented as readable from a snapshot');
 
 const hostOwnsCaught = sectionsOf(
   '## Flow 3 — vault disabled\n\nWith vaulting off your app keeps its own card entry.\n'.split('\n'),
@@ -257,10 +263,14 @@ check(
   'the gate still allows describing the old host-owned arrangement in order to say it is gone'
 );
 
-const allowedMention = 'onStateChange was removed in this release.';
+/*
+ * The sentence the docs actually need to be able to write. If this ever starts failing, the gate has
+ * become one that forbids disclaiming a leak, which is worse than not having it.
+ */
+const allowedMention = 'VGS carries bin and last4 on s.last4; this library carries neither.';
 check(
-  !(REMOVED_CALLBACKS.some((n) => allowedMention.includes(n)) && !REMOVAL_MARKER.test(allowedMention)),
-  'the gate still allows naming a removed callback in order to say it is gone'
+  !(LEAKED_READS.some((p) => p.test(allowedMention)) && !REMOVAL_MARKER.test(allowedMention)),
+  'the gate still allows naming a card value in order to say it is not carried'
 );
 
 if (failures.length) {
diff --git a/scripts/verify-merchant-only.mjs b/scripts/verify-merchant-only.mjs
index 1983c33..f1ca1c3 100644
--- a/scripts/verify-merchant-only.mjs
+++ b/scripts/verify-merchant-only.mjs
@@ -320,8 +320,14 @@ export const n3 = <CardNumberField value="4242424242424242" />;
 export const n4 = <CardNumberField onChange={() => {}} />;
 // @ts-expect-error - the transport is not exported
 export const n5 = HyperswitchVault.confirmPaymentMethodSession;
-// @ts-expect-error - state emission was removed
-export const n6 = <CardNumberField onStateChange={(s: unknown) => s} />;
+/*
+ * ADR-0005 restored emission, so the callback itself is legitimate now. What must still be rejected
+ * is reading a card value off the snapshot it hands you — the boundary the callback was allowed
+ * back across.
+ */
+export const n6ok = <CardNumberField onStateChange={(s) => s.valid} />;
+// @ts-expect-error - no card value on an emitted snapshot
+export const n6 = <CardNumberField onStateChange={(s) => s.last4} />;
 // @ts-expect-error - the ambiguous submit() was replaced by tokenize()/confirmPayment()
 export const n7 = (ref: React.RefObject<VaultFormHandle>) => ref.current!.submit;
 export const n8 = async (ref: React.RefObject<VaultFormHandle>) => {
diff --git a/src/CardCVCWidget.res b/src/CardCVCWidget.res
index de0352f..3cff4a8 100644
--- a/src/CardCVCWidget.res
+++ b/src/CardCVCWidget.res
@@ -16,11 +16,22 @@ let make = React.forwardRef((
     "accessibilityLabel": option<string>,
     "accessibilityHint": option<string>,
     "testID": option<string>,
+    /*
+     * Called with one snapshot on mount and again whenever THIS field's state actually changes, by
+     * structural comparison. Carries no card value — see `VaultPublicState`.
+     */
+    "onStateChange": option<VaultPublicState.cvcState => unit>,
     "cvcIcon": option<CardFieldOptions.cvcIconDisplay>,
   },
   ref,
 ) => {
   let ctx = VaultWidgetContext.useRequired("CardCVCWidget")
+
+  VaultStateEmitter.use(
+    ~build=() => ctx.publicSnapshot.cvc,
+    ~equal=VaultPublicState.cvcEq,
+    ~notify=props["onStateChange"],
+  )
   let controller = ctx.controller
 
   React.useImperativeHandle0(ref, () => {
diff --git a/src/CardExpiryWidget.res b/src/CardExpiryWidget.res
index b7b6c9e..f2b7564 100644
--- a/src/CardExpiryWidget.res
+++ b/src/CardExpiryWidget.res
@@ -17,10 +17,21 @@ let make = React.forwardRef((
     "accessibilityLabel": option<string>,
     "accessibilityHint": option<string>,
     "testID": option<string>,
+    /*
+     * Called with one snapshot on mount and again whenever THIS field's state actually changes, by
+     * structural comparison. Carries no card value — see `VaultPublicState`.
+     */
+    "onStateChange": option<VaultPublicState.expiryState => unit>,
   },
   ref,
 ) => {
   let ctx = VaultWidgetContext.useRequired("CardExpiryWidget")
+
+  VaultStateEmitter.use(
+    ~build=() => ctx.publicSnapshot.expiry,
+    ~equal=VaultPublicState.expiryEq,
+    ~notify=props["onStateChange"],
+  )
   let controller = ctx.controller
 
   React.useImperativeHandle0(ref, () => {
diff --git a/src/CardNumberWidget.res b/src/CardNumberWidget.res
index 5702a72..f37b6de 100644
--- a/src/CardNumberWidget.res
+++ b/src/CardNumberWidget.res
@@ -17,10 +17,21 @@ let make = React.forwardRef((
     "accessibilityHint": option<string>,
     "testID": option<string>,
     "brandIconMode": option<CardFieldOptions.brandIconMode>,
+    /*
+     * Called with one snapshot on mount and again whenever THIS field's state actually changes, by
+     * structural comparison. Carries no card value — see `VaultPublicState`.
+     */
+    "onStateChange": option<VaultPublicState.cardNumberState => unit>,
   },
   ref,
 ) => {
   let ctx = VaultWidgetContext.useRequired("CardNumberWidget")
+
+  VaultStateEmitter.use(
+    ~build=() => ctx.publicSnapshot.cardNumber,
+    ~equal=VaultPublicState.cardNumberEq,
+    ~notify=props["onStateChange"],
+  )
   let controller = ctx.controller
 
   React.useImperativeHandle0(ref, () => {
diff --git a/src/CardholderNameWidget.res b/src/CardholderNameWidget.res
index d545fe5..e544c6d 100644
--- a/src/CardholderNameWidget.res
+++ b/src/CardholderNameWidget.res
@@ -15,10 +15,21 @@ let make = React.forwardRef((
     "accessibilityLabel": option<string>,
     "accessibilityHint": option<string>,
     "testID": option<string>,
+    /*
+     * Called with one snapshot on mount and again whenever THIS field's state actually changes, by
+     * structural comparison. Carries no card value — see `VaultPublicState`.
+     */
+    "onStateChange": option<VaultPublicState.cardholderNameState => unit>,
   },
   ref,
 ) => {
   let ctx = VaultWidgetContext.useRequired("CardholderNameWidget")
+
+  VaultStateEmitter.use(
+    ~build=() => ctx.publicSnapshot.cardholderName,
+    ~equal=VaultPublicState.cardholderNameEq,
+    ~notify=props["onStateChange"],
+  )
   let controller = ctx.controller
 
   React.useImperativeHandle0(ref, () => {
diff --git a/src/HyperswitchVaultForm.res b/src/HyperswitchVaultForm.res
index 852a260..07ce59f 100644
--- a/src/HyperswitchVaultForm.res
+++ b/src/HyperswitchVaultForm.res
@@ -104,6 +104,12 @@ let make = React.forwardRef((
      * the field and supplies the value on the confirm input, or `#omit` when there is no name.
      */
     "cardholderName": option<cardholderNameMode>,
+    /*
+     * Called with one snapshot on mount and again whenever the snapshot actually changes, by
+     * structural comparison. Passing an inline arrow function is safe: the callback is held in a
+     * ref, so its identity changing emits nothing.
+     */
+    "onFormStateChange": option<VaultPublicState.vaultFormState => unit>,
   },
   ref,
 ) => {
@@ -118,6 +124,7 @@ let make = React.forwardRef((
     ~eligibility=props["eligibility"],
     ~vaultEndpoint=props["vaultEndpoint"],
     ~cardholderNameMode=props["cardholderName"]->Option.getOr(#collect),
+    ~onFormStateChange=props["onFormStateChange"],
   )
 
   React.useImperativeHandle0(ref, () => {
diff --git a/src/HyperswitchVaultFormProvider.res b/src/HyperswitchVaultFormProvider.res
index a99902e..a7df2d0 100644
--- a/src/HyperswitchVaultFormProvider.res
+++ b/src/HyperswitchVaultFormProvider.res
@@ -32,6 +32,12 @@ let make = React.forwardRef((
      * merchant should place no field; `#omit` sends none.
      */
     "cardholderName": option<CardFieldOptions.cardholderNameMode>,
+    /*
+     * Called with one snapshot on mount and again whenever the snapshot actually changes, by
+     * structural comparison. Passing an inline arrow function is safe: the callback is held in a
+     * ref, so its identity changing emits nothing.
+     */
+    "onFormStateChange": option<VaultPublicState.vaultFormState => unit>,
     "children": React.element,
   },
   ref,
@@ -47,6 +53,7 @@ let make = React.forwardRef((
     ~eligibility=props["eligibility"],
     ~vaultEndpoint=props["vaultEndpoint"],
     ~cardholderNameMode=props["cardholderName"]->Option.getOr(#collect),
+    ~onFormStateChange=props["onFormStateChange"],
   )
 
   React.useImperativeHandle0(ref, () => {
diff --git a/src/VaultCardController.res b/src/VaultCardController.res
index e723bc6..052dd13 100644
--- a/src/VaultCardController.res
+++ b/src/VaultCardController.res
@@ -13,6 +13,12 @@ type controller = {
   values: CardFormTypes.cardFieldValues,
   visibleErrors: CardFormTypes.cardFieldErrors,
   fieldOk: CardFormTypes.cardFieldOk,
+  /*
+   * The merchant-facing snapshot. Derived, never stored: a pure function of the reducer state this
+   * controller already holds, so there is no second source of truth to keep in sync and nothing new
+   * is retained.
+   */
+  publicSnapshot: VaultPublicState.controllerSnapshot,
   onNumberChange: CardFieldLogic.numberChange => unit,
   onExpiryChange: CardFieldLogic.expiryChange => unit,
   onCvcChange: CardFieldLogic.cvcChange => unit,
@@ -144,7 +150,61 @@ let use = (~validators: CardStateReducer.validators, ~enabledCardSchemes: array<
           enabledCardSchemes->Array.some(enabled => enabled === scheme)
         )
 
+  let eligibilityStatus: VaultPublicState.vaultEligibilityStatus = switch state.eligibility {
+  | Unknown => #unknown
+  | Pending => #pending
+  | Allowed => #allowed
+  | Denied => #denied
+  }
+
+  /*
+   * `accepted` is the RAW validator verdict and `visibleError` is the already-filtered message the
+   * UI is rendering. Publishing both keeps "is this field done?" and "is the customer being shown a
+   * problem?" as the separate questions they are, and stops a merchant's chrome disagreeing with
+   * the library's.
+   */
+  let publicSnapshot: VaultPublicState.controllerSnapshot = {
+    cardNumber: VaultPublicState.cardNumberStateOf(
+      {
+        value: state.cardNumber,
+        accepted: errors.cardNumber->Option.isNone,
+        touched: state.numberMeta.touched,
+        focused: state.numberMeta.active,
+        visibleError: CardStateReducer.numberError(state, errors),
+      },
+      ~brand=state->CardStateReducer.effectiveNetwork,
+      ~isCoBadged=state->CardStateReducer.isCoBadged && eligibleSchemes->Array.length > 1,
+      ~eligibility=eligibilityStatus,
+    ),
+    expiry: VaultPublicState.expiryStateOf({
+      value: state.expiryDisplay,
+      accepted: errors.expiry->Option.isNone,
+      touched: state.expiryMeta.touched,
+      focused: state.expiryMeta.active,
+      visibleError: CardStateReducer.expiryError(state, errors),
+    }),
+    cvc: VaultPublicState.cvcStateOf({
+      value: state.cvc,
+      accepted: errors.cvc->Option.isNone,
+      touched: state.cvcMeta.touched,
+      focused: state.cvcMeta.active,
+      visibleError: CardStateReducer.cvcError(state, errors),
+    }),
+    cardholderName: VaultPublicState.cardholderNameStateOf({
+      value: state.cardholderName,
+      accepted: true,
+      touched: state.cardholderMeta.touched,
+      focused: state.cardholderMeta.active,
+      visibleError: None,
+    }),
+    networkError: CardStateReducer.networkError(state, errors)->Option.map((
+      message,
+    ): VaultPublicState.vaultFieldError => {code: #unsupported_network, message}),
+    eligibility: eligibilityStatus,
+  }
+
   {
+    publicSnapshot,
     values: {
       cardNumber: state.cardNumber,
       expiryDisplay: state.expiryDisplay,
diff --git a/src/VaultFormHost.res b/src/VaultFormHost.res
index 777eb61..f1057f0 100644
--- a/src/VaultFormHost.res
+++ b/src/VaultFormHost.res
@@ -37,6 +37,8 @@ let useHost = (
    * one is even allowed. One prop, read in both places, so the two cannot disagree.
    */
   ~cardholderNameMode: CardFieldOptions.cardholderNameMode,
+  /* Absent means no merchant is listening, and nothing is derived. See `VaultStateEmitter`. */
+  ~onFormStateChange: option<VaultPublicState.vaultFormState => unit>,
 ): host => {
   /*
    * The component's session backs `tokenize()` ONLY. A confirmation reads its session from
@@ -174,9 +176,64 @@ let useHost = (
     ~clearLocal=controller.reset,
   )
 
+  /*
+   * `#absent` is not `#invalid`. A form mounted with no session at all is a legitimate Flow 3 form
+   * — client-core mounts exactly that when the merchant profile says Skip — so reporting it as
+   * invalid would have merchants render a fault where there is none. Only a session that WAS
+   * supplied and could not be read is `#invalid`.
+   */
+  let sessionStatus: VaultPublicState.vaultSessionStatus = switch (session, sessionState) {
+  | (None, _) => #absent
+  | (Some(_), Ready(_)) => #valid
+  | (Some(_), Unusable(_)) => #invalid
+  }
+
+  let publicSnapshot = controller.publicSnapshot
+  let isSubmitting = machinery.isSubmitting
+
+  /*
+   * `fieldsReady` is derived from the SAME registry counts `presenceGate` uses to refuse a submit,
+   * so a merchant's disabled Pay button and the library's own gate cannot disagree — there is
+   * deliberately no second definition of readiness.
+   *
+   * The snapshot is built inside the emitter's effect rather than during render: each field
+   * registers itself in a child effect, and child effects run before the parent's, so a render-time
+   * read of the registry would be one commit stale and the first snapshot would claim
+   * `fieldsReady: false` for a form that is already complete.
+   */
+  VaultStateEmitter.use(
+    ~build=() =>
+      VaultPublicState.formStateOf(
+        ~fieldsReady=requiredKinds->Array.every(kind => countOf(kind) === 1),
+        ~sessionStatus,
+        ~submitting=isSubmitting,
+        ~brand=controller.values.brand,
+        ~isCoBadged=controller.values.isCoBadged,
+        ~eligibility=publicSnapshot.eligibility,
+        ~networkError=publicSnapshot.networkError,
+        ~fields={
+          cardNumber: publicSnapshot.cardNumber,
+          expiry: publicSnapshot.expiry,
+          cvc: publicSnapshot.cvc,
+          /*
+           * Reported only when THIS form owns the field. Under `#external` the host supplies the
+           * name on the confirm input and under `#omit` there is none, so publishing a state for an
+           * input that does not exist would be describing a field the customer cannot see.
+           */
+          cardholderName: ?switch cardholderNameMode {
+          | #collect => Some(publicSnapshot.cardholderName)
+          | _ => None
+          },
+        },
+      ),
+    ~equal=VaultPublicState.formEq,
+    ~notify=onFormStateChange,
+  )
+
   {
     contextValue: {
       controller,
+      publicSnapshot,
       theme,
       labels,
       errorFontSize,
diff --git a/src/VaultWidgetContext.res b/src/VaultWidgetContext.res
index 666d6ba..1b8aaa3 100644
--- a/src/VaultWidgetContext.res
+++ b/src/VaultWidgetContext.res
@@ -12,6 +12,12 @@ type contextValue = {
   editable: bool,
   isProcessing: bool,
   onAnalytics: CardFormTypes.analyticsEvent => unit,
+  /*
+   * The merchant-facing snapshot, carried so a field widget can emit its OWN state without
+   * reaching back into the controller and re-deriving it. One derivation, read in two places, so a
+   * per-field callback and the aggregate form callback can never disagree.
+   */
+  publicSnapshot: VaultPublicState.controllerSnapshot,
 }
 
 let context: React.Context.t<option<contextValue>> = React.createContext(None)
diff --git a/src/public.ts b/src/public.ts
index c32f6dc..6a1ea2d 100644
--- a/src/public.ts
+++ b/src/public.ts
@@ -47,6 +47,12 @@ import type { safeVaultError as SafeVaultErrorInternal } from './VaultResult.gen
 import type { safeNextAction as SafeNextActionInternal } from './VaultNavigation.gen';
 import type { confirmTokenMode as VaultConfirmTokenModeInternal } from './VaultConfirmBody.gen';
 import type { MerchantSession as MerchantSessionInternal } from './merchantTypes';
+import type {
+  cardNumberState,
+  expiryState,
+  cvcState,
+  cardholderNameState,
+} from './VaultPublicState.gen';
 
 /* ── Component types ──────────────────────────────────────────────────────── */
 
@@ -200,15 +206,20 @@ type VaultFormComponent<P> = React.ForwardRefExoticComponent<
  * expiry style type.
  */
 /*
- * ── No state emission (ADR-0003) ─────────────────────────────────────────────
+ * ── State emission (ADR-0005, superseding ADR-0003) ──────────────────────────
+ *
+ * A field takes styles, options, a ref, and one callback reporting its own state. The callback
+ * carries validity, completeness, focus, whether the customer has touched it, and the message it is
+ * currently showing — and, for the card number, the detected scheme. It carries no card value:
+ * no PAN, no BIN, no last four, no length, no expiry parts, no CVC.
  *
- * A field takes styles, options and a ref — and nothing else. There is deliberately no
- * `onStateChange`: typing, focusing, blurring, validating and brand detection produce zero
- * external callbacks, so no card-derived value has a route out of the library.
- * `scripts/verify-event-surface.mjs` proves the absence against the packed declarations.
+ * The state type is a parameter rather than a union so each field publishes ITS OWN shape:
+ * `brand` exists on the card-number callback and on no other, structurally rather than by comment.
+ * `scripts/verify-event-surface.mjs` pins the payload member by member against the packed
+ * declarations, so widening it is a build failure rather than a judgement call.
  */
-type VaultStyledFieldComponent<S, O> = React.ForwardRefExoticComponent<
-  { styles?: S } & O & React.RefAttributes<widgetHandle>
+type VaultStyledFieldComponent<S, O, State> = React.ForwardRefExoticComponent<
+  { styles?: S; onStateChange?: (state: State) => void } & O & React.RefAttributes<widgetHandle>
 >;
 
 /* ── Existing published names — unchanged ─────────────────────────────────── */
@@ -227,15 +238,18 @@ export const HyperswitchVaultFormProvider =
 
 export const CardNumberWidget = RawCardNumberWidget as unknown as VaultStyledFieldComponent<
   fieldStyles,
-  cardNumberOptions
+  cardNumberOptions,
+  cardNumberState
 >;
 export const CardExpiryWidget = RawCardExpiryWidget as unknown as VaultStyledFieldComponent<
   expiryStyles,
-  expiryOptions
+  expiryOptions,
+  expiryState
 >;
 export const CardCVCWidget = RawCardCVCWidget as unknown as VaultStyledFieldComponent<
   fieldStyles,
-  cvcOptions
+  cvcOptions,
+  cvcState
 >;
 
 /*
@@ -248,7 +262,8 @@ export const CardCVCWidget = RawCardCVCWidget as unknown as VaultStyledFieldComp
  */
 export const CardholderNameWidget = RawCardholderNameWidget as unknown as VaultStyledFieldComponent<
   fieldStyles,
-  cardholderNameOptions
+  cardholderNameOptions,
+  cardholderNameState
 >;
 
 /*
@@ -394,3 +409,40 @@ export type {
 } from './VaultResult.gen';
 
 export type { MerchantSession } from './merchantTypes';
+
+/*
+ * ── Emitted state (ADR-0005) ────────────────────────────────────────────────────────────────────
+ *
+ * What the form and the individual fields report while the customer types. Every one of these is
+ * derived from library-owned state and carries no card value: no PAN, no BIN, no last four, no
+ * value length, no expiry month or year, no CVC, no token and no credential. The only card-derived
+ * members are the detected scheme name and the localised message already on screen.
+ *
+ * `scripts/verify-event-surface.mjs` gates that claim against the PACKED declarations.
+ */
+export type {
+  cardBrand as VaultCardBrand,
+  vaultFieldStatus as VaultFieldStatus,
+  vaultFieldErrorCode as VaultFieldErrorCode,
+  vaultFieldError as VaultFieldError,
+  vaultEligibilityStatus as VaultEligibilityStatus,
+  vaultSessionStatus as VaultSessionStatus,
+  cardNumberState as VaultCardNumberState,
+  expiryState as VaultExpiryState,
+  cvcState as VaultCVCState,
+  cardholderNameState as VaultCardholderNameState,
+  vaultFormFields as VaultFormFields,
+  vaultFormState as VaultFormState,
+} from './VaultPublicState.gen';
+
+/*
+ * The union a merchant writes when one handler serves several fields. Each member is narrowed by
+ * its own `field` discriminant, so `switch (state.field)` gives back the exact shape — and reading
+ * `brand` is a type error anywhere but the card-number branch.
+ */
+export type VaultFieldState =
+  | import('./VaultPublicState.gen').cardNumberState
+  | import('./VaultPublicState.gen').expiryState
+  | import('./VaultPublicState.gen').cvcState
+  | import('./VaultPublicState.gen').cardholderNameState;
+
diff --git a/type-tests/consumer.tsx b/type-tests/consumer.tsx
index 5ca064c..698f470 100644
--- a/type-tests/consumer.tsx
+++ b/type-tests/consumer.tsx
@@ -56,6 +56,13 @@ import type {
   VaultEnvironment,
   SafeVaultError,
   VaultNextAction,
+  VaultCardBrand,
+  VaultFieldErrorCode,
+  VaultEligibilityStatus,
+  VaultSessionStatus,
+  VaultCardNumberState,
+  VaultFormState,
+  VaultFieldState,
 } from '../dist/types/public';
 
 const session = {} as MerchantSession;
@@ -369,31 +376,95 @@ export const badInput7: VaultPaymentConfirmInput = {cardSource: direct, sdkAutho
 // @ts-expect-error - sdkAuthorization is required
 export const badInput8: VaultPaymentConfirmInput = {cardSource: direct, paymentId: 'p'};
 
-/* ══ 5. The removed state surface cannot be written ═══════════════════════════ */
-
-// @ts-expect-error - per-field state emission was removed
-export const noEmit1 = <CardNumberField onStateChange={(s: unknown) => s} />;
-// @ts-expect-error - per-field state emission was removed
-export const noEmit2 = <CardExpiryField onStateChange={(s: unknown) => s} />;
-// @ts-expect-error - per-field state emission was removed
-export const noEmit3 = <CardCVCField onStateChange={(s: unknown) => s} />;
-// @ts-expect-error - per-field state emission was removed
-export const noEmit4 = <CardholderNameField onStateChange={(s: unknown) => s} />;
-export const noEmit5 = (
-  // @ts-expect-error - form state emission was removed
-  <HyperswitchVaultForm session={session} environment="sandbox" onFormStateChange={(s: unknown) => s} />
+/* ══ 5. State emission reports validity, and nothing card-shaped ══════════════ */
+
+/*
+ * POSITIVE: what ADR-0005 exists to make possible. A merchant drives their own chrome from these
+ * without ever holding a card value.
+ */
+export const emit1 = (
+  <CardNumberField
+    onStateChange={(s) => {
+      const valid: boolean = s.valid;
+      const status: 'empty' | 'incomplete' | 'complete' = s.status;
+      const touched: boolean = s.touched;
+      const focused: boolean = s.focused;
+      const brand: VaultCardBrand = s.brand;
+      const coBadged: boolean = s.isCoBadged;
+      const eligibility: VaultEligibilityStatus = s.eligibility;
+      const code: VaultFieldErrorCode | undefined = s.error?.code;
+      const message: string | undefined = s.error?.message;
+      return [valid, status, touched, focused, brand, coBadged, eligibility, code, message];
+    }}
+  />
 );
-export const noEmit6 = (
-  // @ts-expect-error - the ready-made form has no per-field emission either
-  <HyperswitchVaultForm session={session} environment="sandbox" onStateChange={(s: unknown) => s} />
+export const emit2 = <CardExpiryField onStateChange={(s) => s.valid} />;
+export const emit3 = <CardCVCField onStateChange={(s) => s.error?.message} />;
+export const emit4 = <CardholderNameField onStateChange={(s) => s.status} />;
+export const emit5 = (
+  <HyperswitchVaultForm
+    session={session}
+    environment="sandbox"
+    onFormStateChange={(s) => {
+      const canSubmit: boolean = s.canSubmit;
+      const sessionStatus: VaultSessionStatus = s.sessionStatus;
+      const cvcValid: boolean = s.fields.cvc.valid;
+      const namePresent: boolean = s.fields.cardholderName !== undefined;
+      return [canSubmit, sessionStatus, cvcValid, namePresent];
+    }}
+  />
 );
-export const noEmit7 = (
-  // @ts-expect-error - the provider has no emission
-  <HyperswitchVaultFormProvider session={session} environment="sandbox" onFormStateChange={(s: unknown) => s}>
+export const emit6 = (
+  <HyperswitchVaultFormProvider
+    session={session}
+    environment="sandbox"
+    onFormStateChange={(s: VaultFormState) => s.complete}>
     <CardNumberField />
   </HyperswitchVaultFormProvider>
 );
 
+/* The union narrows on `field`, and `brand` lives on exactly one branch. */
+export function narrowField(s: VaultFieldState): string {
+  switch (s.field) {
+    case 'cardNumber':
+      return s.brand;
+    case 'expiry':
+    case 'cvc':
+    case 'cardholderName':
+      return s.status;
+  }
+}
+
+/*
+ * NEGATIVE: the emitted snapshot has no route to a card value. These are the assertions that make
+ * "events without a leak" a compiler-enforced property rather than a claim in a comment.
+ */
+declare const numberState: VaultCardNumberState;
+declare const formState: VaultFormState;
+
+// @ts-expect-error - the PAN is not on the snapshot
+export const noLeak1 = numberState.value;
+// @ts-expect-error - the BIN is not on the snapshot (this is where VGS and this library part ways)
+export const noLeak2 = numberState.bin;
+// @ts-expect-error - the last four are not on the snapshot
+export const noLeak3 = numberState.last4;
+// @ts-expect-error - not even the length of what was typed
+export const noLeak4 = numberState.length;
+// @ts-expect-error - the CVC value is not on the snapshot
+export const noLeak5 = formState.fields.cvc.value;
+// @ts-expect-error - expiry parts are not on the snapshot
+export const noLeak6 = formState.fields.expiry.expiryMonth;
+// @ts-expect-error - the payment-method token never reaches a merchant surface
+export const noLeak7 = formState.token;
+// @ts-expect-error - the vault authorization never reaches a merchant surface
+export const noLeak8 = formState.sdkAuthorization;
+// @ts-expect-error - `brand` is card-number only
+export const noLeak9 = formState.fields.expiry.brand;
+export const noLeak10 = (
+  // @ts-expect-error - the ready-made form emits form state, not per-field state
+  <HyperswitchVaultForm session={session} environment="sandbox" onStateChange={(s: unknown) => s} />
+);
+
 /* ══ 6. Card values and events cannot be controlled from outside ══════════════ */
 
 // @ts-expect-error - fields are not controlled inputs
```

### New file: docs/adr/0005-restore-card-safe-state-emission.md
(decision record; full text in the repository)

## 4. Recorded assumptions

- ASSUMPTION: `React.useEffectOnEveryRender` with no dependency array is the correct hook for
  emission, and React never runs an effect body for an unmounted component, so no explicit
  unmount guard is required.
- ASSUMPTION: re-raising a merchant callback's exception inside `setTimeout(_, 0)` reaches the
  React Native global error handler with its stack intact, and does not unwind the current commit.
- ASSUMPTION: `statusOf` treating `String.length === 0` as empty matches every validator's own
  emptiness test, so a field can never be reported `#empty` while its validator rejects it as
  malformed.
- ASSUMPTION: `cardholderName` has no validator in this library, so any non-empty value is
  `#complete` and its `visibleError` is always `None`.
- ASSUMPTION: the genType-emitted declaration shape (`readonly name?: type;` per line inside a
  braced body) is regular enough to be parsed by regex in the gate rather than by a TypeScript AST.
- ASSUMPTION: `eligibility` must not gate `canSubmit`.
- ASSUMPTION: a form mounted with no session (`#absent`) may still report `canSubmit: true`.

## 5. Pre-registered budget vs. actual

Pre-registered:
```
files: 8-12   repos: 1   new abstractions: 1
public contract changes: +onFormStateChange (form, provider), +onStateChange (4 field widgets),
                         +12 exported types
verification additions: 1 rewritten gate + 1 type-test section
```
Actual: 21 tracked files changed + 3 new files; 1 repo; 1 new abstraction (the emitted state
vocabulary); the public contract changes listed above, unchanged; 1 rewritten gate
(`verify-event-surface.mjs`), 2 gates amended (`verify-flow-docs.mjs`, `verify-merchant-only.mjs`),
1 type-test section rewritten. Six documentation files updated.

## 6. Verification results and claimed risk level

Claimed risk: HIGH (public customer-facing contract; payment-adjacent).

| Tier | Command | Result |
|---|---|---|
| compile | `rescript` | pass |
| strict typecheck | `tsc -p tsconfig.build.json` | pass |
| strict typecheck | `tsc -p tsconfig.consumer.json` | pass |
| build artifact | `yarn build` (full prepack chain) | pass |
| gate | `node scripts/verify-event-surface.mjs` | pass, incl. non-vacuity check |
| gate | `yarn verify` | all gates pass EXCEPT `verify-noncard-input` |

`verify-noncard-input` fails on `a path is rejected` (`scripts/verify-noncard-input.mjs:331` vs
`src/VaultEndpoint.res:77`). Both files are byte-identical to HEAD (`1e935cf`) and were not touched
by this change; the failure reproduces on an unmodified checkout.

No automated e2e or manual-device tier was run.
