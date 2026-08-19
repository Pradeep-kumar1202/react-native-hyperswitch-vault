/*
 * Portable prop contract for the card form.
 *
 * Nothing in this package may read a host React context, a host hook (ThemebasedStyle / GetLocale /
 * LoadingContext / LoggerHook / AlertHook), a native module, navigation, or an API hook. Everything
 * a card field needs arrives through these types, resolved by a host adapter.
 *
 * Validation and formatting stay in sdk-utils (`Validation`), and the card event
 * payload stays in sdk-utils (`PaymentEventData`). Neither is copied here.
 */

/*
 * A React Native style object. Opaque across the package boundary: `ReactNative.Style.t` is an
 * abstract type with no structural description, and the card form only ever forwards these values
 * into `style` props without inspecting them.
 */
@genType.opaque
type styleObject = ReactNative.Style.t

/* Resolved design tokens. The host flattens its theme record into this. */
@genType
type cardTheme = {
  borderWidth: float,
  borderRadius: float,
  gap: float,
  inputHeight: float,
  fontFamily: string,
  fontScale: float,
  placeholderTextSizeAdjust: float,
  placeholderColor: string,
  primaryColor: string,
  dangerColor: string,
  /* component.color — the normal input text colour */
  textColor: string,
  /* component.background */
  inputBackground: string,
  /* component.borderColor — the scan-button divider */
  dividerColor: string,
  /* errorTextInputColor — border colour when invalid */
  errorBorderColor: string,
  /* normalTextInputBoderColor — border colour when valid and unfocused */
  normalBorderColor: string,
  /* pre-resolved style objects, so the portable layer needs no style hooks */
  bgStyle: styleObject,
  shadowStyle: styleObject,
}

/*
 * Resolved strings. The host has already applied the merchant placeholder
 * override, so the portable layer never decides between a config value and a
 * locale value. `placeholder` is the resting text; `floatingLabel` is the text
 * shown once the field is focused or non-empty (these differ whenever the
 * merchant sets a custom placeholder).
 */
@genType
type cardLabels = {
  cardNumberPlaceholder: string,
  cardNumberFloatingLabel: string,
  expiryPlaceholder: string,
  expiryFloatingLabel: string,
  cvcPlaceholder: string,
  cvcFloatingLabel: string,
  notEligibleText: string,
  isRtl: bool,
}

@genType
type cardLayout = {
  splitCardFields: bool,
  showCvcIcon: bool,
}

/*
 * Host-agnostic mirror of the eligibility state.
 *
 * A polymorphic variant, so it compiles to the plain strings "allowed" / "pending" / "denied"
 * rather than to integers. The host lives in a different repository and compiles its own copy of
 * the ReScript sources, so a plain variant would make the JavaScript contract depend on matching
 * integer tags across two builds.
 */
@genType
type eligibilityState = [#allowed | #pending | #denied]

/*
 * Scan-card injected as an optional capability. The portable layer owns the
 * trigger UI and calls `launch`; the host owns the native module, the analytics
 * and the failure alert.
 */
@genType
type scanCardCapability = {
  isAvailable: bool,
  launch: (~onScanned: (~pan: string, ~expiry: string) => unit) => unit,
}

/*
 * Semantic co-badge information handed to the host's scheme renderer. The host
 * supplies the chrome (icon, chevron, popover) because that chrome depends on
 * ViewportContext and on the asset-URL context.
 */
@genType
type schemeAccessory = {
  availableSchemes: array<string>,
  selectedScheme: string,
  detectedScheme: string,
  showPicker: bool,
  onSelectScheme: string => unit,
}

/*
 * Identifies which card field an event came from.
 *
 * Constructors carry the `Field` suffix deliberately: bare `CardNumber` / `Cvc` would collide with
 * the `Validation.validationRule` and `SuperpositionTypes.fieldType` constructors of the same name,
 * both of which are in scope inside `CardFormView`.
 */
type cardFieldId =
  | CardNumberField
  | ExpiryField
  | CvcField

/*
 * Telemetry the card inputs produce.
 *
 * The payload is a field IDENTIFIER, never a string and never a field value, so it is
 * structurally impossible for a PAN, expiry or CVC to travel through this channel — the type
 * admits nothing else. The host maps the identifier back to the placeholder/label string it
 * logs, keeping the logged value identical to previous behaviour.
 */
type analyticsEvent =
  | FieldFocused(cardFieldId)
  | FieldBlurred(cardFieldId)

@genType
type renderIcon = (
  ~name: string,
  ~width: float,
  ~height: float,
  ~fill: string,
) => React.element

/*
 * Imperative hooks a form OWNER needs and cannot get from react-final-form.
 *
 * Deliberately not `@genType`: this never crosses the package boundary. It exists only so
 * `HyperswitchVaultForm`, which owns the `<Form>`, can implement `focus()` and a complete `reset()`
 * without reaching into `CardFormView`'s refs. The embedded host passes no `registerControls` and
 * is unaffected.
 *
 * `clearLocalState` matters because two pieces of card state live in React state rather than in
 * react-final-form — the visible "MM / YY" string and the detected co-badge scheme list — so
 * `form.reset()` alone would leave the expiry text on screen after a reset.
 */
type cardFormControls = {
  focus: [#cardNumber | #expiry | #cvc] => unit,
  clearLocalState: unit => unit,
}

/*
 * One configured field, reduced to the only two things the card form needs.
 *
 * `renderType` carries the superposition config's own `field_render_type` string — "CardNumber",
 * "Cvc", "CardExpiryMonth", "CardExpiryYear", "CardNetwork" — rather than the
 * `SuperpositionTypes.fieldType` variant. That variant compiles to integers, and the host compiles
 * its own copy of sdk-utils in a different repository, so crossing the package boundary as an
 * integer tag would couple two independent builds to a representation neither controls. The
 * strings come from the backend configuration itself, which makes them the most stable vocabulary
 * available.
 *
 * `writePath` is the field's `confirm_request_write_path`, which is also the react-final-form
 * field name.
 */
@genType
type cardFieldSpec = {
  renderType: string,
  writePath: string,
}

/* The card fields resolved out of the configuration, as react-final-form field names. */
@genType
type cardFieldSelection = {
  cardNumberPath: string,
  cardExpiryMonthPath: string,
  cardExpiryYearPath: string,
  cardCvcPath: option<string>,
  cardNetworkPath: option<string>,
}

/*
 * Card number, expiry month and expiry year are a mandatory triple: if any is absent from the
 * configuration the card form renders nothing.
 *
 * Kept as a plain function with no hooks, and exported from the package, so the host can gate
 * *before* calling any of its own hooks — exactly as the pre-extraction implementation did. This is
 * the single implementation of the selection rule; the host must not reimplement it.
 */
let selectCardFields = (fields: array<cardFieldSpec>) => {
  let pathOf = renderType =>
    fields
    ->Array.find((f: cardFieldSpec) => f.renderType === renderType)
    ->Option.map((f: cardFieldSpec) => f.writePath)

  switch (pathOf("CardNumber"), pathOf("CardExpiryMonth"), pathOf("CardExpiryYear")) {
  | (Some(cardNumberPath), Some(cardExpiryMonthPath), Some(cardExpiryYearPath)) =>
    Some({
      cardNumberPath,
      cardExpiryMonthPath,
      cardExpiryYearPath,
      cardCvcPath: pathOf("Cvc"),
      cardNetworkPath: pathOf("CardNetwork"),
    })
  | _ => None
  }
}
