/*
 * Merchant field OPTIONS — which visual elements exist.
 *
 * This is deliberately a separate axis from `CardFieldStyles`:
 *
 *   field options → which visual elements exist
 *   field styles  → how the enabled elements look
 *   events        → safe validation state
 *   library       → sensitive values and input behaviour
 *
 * A style value must never decide whether an element exists. `styles.placeholder` says how the
 * placeholder looks; only `options.placeholder` decides whether there is one at all.
 *
 * ── WHY EVERY DEFAULT IS OFF ───────────────────────────────────────────────────────────────────
 *
 * The zero-configuration form renders three empty, neutral inputs and nothing else: no placeholder,
 * no label, no animation, no icons, no error text, no reserved space for any of them. The library's
 * job is to own the card values and tokenize them; the merchant's job is to decide what their
 * checkout looks like. Inheriting a presentation the merchant did not ask for made the second job
 * harder, not easier.
 *
 * Accessibility is the one exception, and it is not a visual element: a blank field is still
 * announced as "Card number" to a screen reader, because removing that would be a regression for
 * users who cannot see the layout the merchant built.
 */

@genType
type labelBehavior = [#none | #static | #floating]

@genType
type errorDisplay = [#none | #inline]

/*
 * ONE brand-icon concept, not two.
 *
 * An earlier revision of this reset added `brandIcon: 'none' | 'auto'` alongside the pre-existing
 * `appearance.brandIconMode`, which already had a `hidden` member. That gave two public controls
 * over the same element and two ways to spell "off" — `brandIcon: 'none'` and
 * `brandIconMode: 'hidden'` — with no defined answer when they disagreed. It is reused here
 * instead: `hidden` is the "off" it always was, and the field-level option is the same union.
 */
@genType
type brandIconMode = CardIcons.brandIconMode

@genType
type cvcIconDisplay = [#none | #default]

/*
 * `testID` is spelled the React Native way, not `testId`: a merchant reaches for the name their
 * test library already uses.
 */
@genType
type fieldOptions = {
  placeholder?: string,
  label?: string,
  labelBehavior?: labelBehavior,
  errorDisplay?: errorDisplay,
  accessibilityLabel?: string,
  accessibilityHint?: string,
  testID?: string,
}

@genType
type cardNumberOptions = {
  placeholder?: string,
  label?: string,
  labelBehavior?: labelBehavior,
  errorDisplay?: errorDisplay,
  accessibilityLabel?: string,
  accessibilityHint?: string,
  testID?: string,
  /*
   * Card number only — the expiry and CVC option types have no such member at all.
   * Absent => fall back to `appearance.brandIconMode`, and then to `hidden`.
   */
  brandIconMode?: brandIconMode,
}

@genType
type expiryOptions = fieldOptions

/* No brand artwork and no CVC glyph — a name field has neither. */
@genType
type cardholderNameOptions = fieldOptions

@genType
type cvcOptions = {
  placeholder?: string,
  label?: string,
  labelBehavior?: labelBehavior,
  errorDisplay?: errorDisplay,
  accessibilityLabel?: string,
  accessibilityHint?: string,
  testID?: string,
  /* CVC only. */
  cvcIcon?: cvcIconDisplay,
}

/* The ready-made form's grouped prop, mirroring `formFieldStyles`. */
@genType
type formFieldOptions = {
  cardNumber?: cardNumberOptions,
  expiry?: expiryOptions,
  cvc?: cvcOptions,
  cardholderName?: cardholderNameOptions,
}

/*
 * ── FORM LAYOUT ────────────────────────────────────────────────────────────────────────────────
 *
 * These two replace the previous `splitCardFields: bool`, which conflated them: `false` meant
 * "expiry and CVC share a row AND all three borders are joined", `true` meant "share a row AND
 * borders are separate". There was no way to ask for three stacked fields, which is now the
 * default. One source of truth, two independent questions.
 */

/*
 * WHO COLLECTS THE CARDHOLDER NAME, AND WHERE ITS VALUE COMES FROM.
 *
 * Three modes, because there are genuinely three arrangements and collapsing any two of them loses
 * something:
 *
 *   #collect   The library renders its own bare input and uses what was typed into it. The default,
 *              because a merchant placing one component expects a complete card form.
 *
 *   #"external"  The library renders NO name field, and the value arrives on the confirm input as
 *              `cardholderName`. This is for a host that already owns a cardholder-name field —
 *              client-core does, with its own validation, localisation and error timing — and
 *              whose field must stay the one on screen.
 *
 *   #omit      The library renders no name field and sends no name at all. For a host whose
 *              configuration simply does not ask for one.
 *
 * `#"external"` and `#omit` look identical on screen and differ entirely in what is sent, which is
 * why they are separate: a host that means "I will supply it" and one that means "there is none"
 * must not be spelled the same way, or a missing value silently becomes an omitted one.
 *
 * Neither renders a hidden field. A `display: none` input is still mounted, still focusable, and
 * still announced by a screen reader as a second name field — which is the bug this exists to
 * prevent, not a cosmetic detail.
 */
/*
 * `#"external"` is quoted because `external` is a ReScript keyword. The quoting is syntax only —
 * the runtime value is the plain string `"external"`, which is what the published TypeScript union
 * and every caller sees.
 */
@genType
type cardholderNameMode = [#collect | #"external" | #omit]

@genType
type formLayout = [#stacked | #inline]

@genType
type fieldArrangement = [#separate | #fused]

/* ── Resolution ─────────────────────────────────────────────────────────────────────────────── */

/*
 * The resolved shape the render tree consumes. Every member is decided here, once, so no component
 * downstream has to know a default — and `resolve` is the only place a default lives.
 */
type resolved = {
  placeholder: option<string>,
  label: option<string>,
  labelBehavior: labelBehavior,
  errorDisplay: errorDisplay,
  accessibilityLabel: string,
  accessibilityHint: option<string>,
  testID: string,
}

/*
 * Whitespace-only merchant text is treated as absent, and surrounding whitespace is dropped rather
 * than carried into the rendered element — `testID: " foo "` should find the same node as
 * `testID: "foo"`.
 */
let trimmed = (value: option<string>) =>
  value->Option.flatMap(text => {
    let text = text->String.trim
    text === "" ? None : Some(text)
  })

/*
 * `~defaultAccessibilityLabel` and `~defaultTestID` are library constants per field, not merchant
 * text. They are the two things that stay on even in the zero-configuration form.
 */
let resolveWith = (
  ~placeholder,
  ~label,
  ~labelBehavior,
  ~errorDisplay,
  ~accessibilityLabel,
  ~accessibilityHint,
  ~testID,
  ~defaultAccessibilityLabel: string,
  ~defaultTestID: string,
): resolved => {
  placeholder: trimmed(placeholder),
  label: trimmed(label),
  labelBehavior: labelBehavior->Option.getOr(#none),
  errorDisplay: errorDisplay->Option.getOr(#none),
  accessibilityLabel: trimmed(accessibilityLabel)->Option.getOr(defaultAccessibilityLabel),
  accessibilityHint: trimmed(accessibilityHint),
  testID: trimmed(testID)->Option.getOr(defaultTestID),
}

let resolveField = (options: option<fieldOptions>, ~defaultAccessibilityLabel, ~defaultTestID) =>
  resolveWith(
    ~placeholder=options->Option.flatMap(o => o.placeholder),
    ~label=options->Option.flatMap(o => o.label),
    ~labelBehavior=options->Option.flatMap(o => o.labelBehavior),
    ~errorDisplay=options->Option.flatMap(o => o.errorDisplay),
    ~accessibilityLabel=options->Option.flatMap(o => o.accessibilityLabel),
    ~accessibilityHint=options->Option.flatMap(o => o.accessibilityHint),
    ~testID=options->Option.flatMap(o => o.testID),
    ~defaultAccessibilityLabel,
    ~defaultTestID,
  )

let resolveCardNumber = (options: option<cardNumberOptions>) =>
  resolveWith(
    ~placeholder=options->Option.flatMap(o => o.placeholder),
    ~label=options->Option.flatMap(o => o.label),
    ~labelBehavior=options->Option.flatMap(o => o.labelBehavior),
    ~errorDisplay=options->Option.flatMap(o => o.errorDisplay),
    ~accessibilityLabel=options->Option.flatMap(o => o.accessibilityLabel),
    ~accessibilityHint=options->Option.flatMap(o => o.accessibilityHint),
    ~testID=options->Option.flatMap(o => o.testID),
    ~defaultAccessibilityLabel="Card number",
    ~defaultTestID=CardTestIds.cardNumberInputTestId,
  )

let resolveExpiry = (options: option<expiryOptions>) =>
  resolveField(
    options,
    ~defaultAccessibilityLabel="Expiration date",
    ~defaultTestID=CardTestIds.expiryInputTestId,
  )

let resolveCardholderName = (options: option<cardholderNameOptions>) =>
  resolveField(
    options,
    ~defaultAccessibilityLabel="Cardholder name",
    ~defaultTestID=CardTestIds.cardholderNameInputTestId,
  )

let resolveCvc = (options: option<cvcOptions>) =>
  resolveWith(
    ~placeholder=options->Option.flatMap(o => o.placeholder),
    ~label=options->Option.flatMap(o => o.label),
    ~labelBehavior=options->Option.flatMap(o => o.labelBehavior),
    ~errorDisplay=options->Option.flatMap(o => o.errorDisplay),
    ~accessibilityLabel=options->Option.flatMap(o => o.accessibilityLabel),
    ~accessibilityHint=options->Option.flatMap(o => o.accessibilityHint),
    ~testID=options->Option.flatMap(o => o.testID),
    ~defaultAccessibilityLabel="Security code",
    ~defaultTestID=CardTestIds.cvcInputTestId,
  )

/*
 * THE ONE RESOLUTION POINT, and the only place a brand-icon default lives:
 *
 *   field `brandIconMode`  →  form-wide `appearance.brandIconMode`  →  `#hidden`
 *
 * `formWide` is already `appearance.brandIconMode ?? #hidden` when it reaches here (resolved once
 * in `VaultFormHost`), so this is a total function of two inputs with exactly one outcome per
 * pair — there is no combination of public props that leaves the result undefined or order-
 * dependent.
 */
let resolveBrandIconMode = (
  options: option<cardNumberOptions>,
  ~formWide: brandIconMode,
): brandIconMode => options->Option.flatMap(o => o.brandIconMode)->Option.getOr(formWide)

let cvcIconOf = (options: option<cvcOptions>) =>
  options->Option.flatMap(o => o.cvcIcon)->Option.getOr(#none)

let cardNumberOf = (options: option<formFieldOptions>) =>
  options->Option.flatMap(o => o.cardNumber)

let expiryOf = (options: option<formFieldOptions>) => options->Option.flatMap(o => o.expiry)

let cvcOf = (options: option<formFieldOptions>) => options->Option.flatMap(o => o.cvc)

let cardholderNameOf = (options: option<formFieldOptions>) =>
  options->Option.flatMap(o => o.cardholderName)
