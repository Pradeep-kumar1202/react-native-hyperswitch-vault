/*
 * EmbeddedCardElement — the public embedded entry (`<package>/embedded`).
 *
 * A thin wrapper over `CardFormView`, intended for the Hyperswitch client-core host. It:
 *   - binds into the HOST's existing react-final-form context via `useField`;
 *   - never creates a `ReactFinalForm.Form`;
 *   - performs no network request;
 *   - returns no card value through any callback;
 *   - receives theme, labels, loading, eligibility and capabilities as props.
 *
 * Boundary policy: this module is where unstable ReScript runtime representations are kept OUT of
 * the JavaScript contract. Plain variants compile to integers and variants with payloads compile to
 * `{TAG, _0}`; the host compiles its own copy of these sources in a separate repository, so neither
 * shape is safe to depend on across the package boundary. Everything crossing it is a string, a
 * number, a boolean, a plain record or a function. The mapping back to the internal representation
 * happens here and changes no behaviour.
 */

/*
 * Analytics payload. Both fields are closed string unions, so it is structurally impossible for a
 * PAN, expiry or CVC to travel through this channel — the type admits nothing else.
 */
@genType
type analyticsPayload = {
  eventType: [#focus | #blur],
  field: [#cardNumber | #expiry | #cvc],
}

@genType
type cardFieldSpec = CardFormTypes.cardFieldSpec

@genType
type cardFieldSelection = CardFormTypes.cardFieldSelection

@genType
type cardTheme = CardFormTypes.cardTheme

@genType
type cardLabels = CardFormTypes.cardLabels

@genType
type cardLayout = CardFormTypes.cardLayout

@genType
type eligibilityState = CardFormTypes.eligibilityState

@genType
type schemeAccessory = CardFormTypes.schemeAccessory

@genType
type scanCardCapability = CardFormTypes.scanCardCapability

/*
 * The masked card-info payload, built by sdk-utils `PaymentEventData.buildCardInfo` and handed
 * straight back to the host's event emitter.
 *
 * Deliberately OPAQUE to genType. Annotating the sdk-utils type itself would make genType write a
 * .gen.tsx into the pinned submodule, dirtying it and tripping the submodule guard. The host
 * already owns this type (it compiles the same sdk-utils commit), so it needs no structural
 * description here — only a stable, plain-object value to pass through. Contents are unchanged:
 * BIN6, last4, brand, expiry and completeness booleans, never the full PAN and never the CVC.
 */
@genType.opaque
type maskedCardInfo = PaymentEventData.cardInfo

/*
 * Resolve the configured fields into the card form's field names.
 *
 * Exported so the host can decide whether the card form renders BEFORE running any of its own
 * hooks. This is the only implementation of the mandatory-triple rule; the host must not
 * reimplement it. Returns `undefined` when card number, expiry month or expiry year is missing.
 */
@genType
let selectCardFields = CardFormTypes.selectCardFields

@genType @react.component
let make = (
  ~selection: cardFieldSelection,
  ~cardNumberValidator: option<string> => option<string>,
  ~cardNumberFormatter: (option<string>, string) => option<string>,
  ~makeExpiryValidator: string => (option<string> => option<string>),
  ~makeCvcValidator: string => (option<string> => option<string>),
  ~cardNetworkValidator: option<option<string> => option<string>>=?,
  ~accessible: option<bool>=?,
  ~checkEligibility: option<string> => unit,
  ~theme: cardTheme,
  ~labels: cardLabels,
  ~layout: cardLayout,
  ~eligibilityStatus: eligibilityState,
  ~isProcessing: bool,
  ~onAnalytics: analyticsPayload => unit,
  ~emitCardInfo: maskedCardInfo => unit,
  ~renderIcon: CardFormTypes.renderIcon,
  ~renderError: string => React.element,
  ~renderSchemeAccessory: option<schemeAccessory => React.element>=?,
  ~scanCard: option<scanCardCapability>=?,
) => {
  /* Internal variant -> stable string payload. Behaviour is unchanged. */
  let onAnalyticsInternal = (event: CardFormTypes.analyticsEvent) => {
    let field = fieldId =>
      switch fieldId {
      | CardFormTypes.CardNumberField => #cardNumber
      | CardFormTypes.ExpiryField => #expiry
      | CardFormTypes.CvcField => #cvc
      }
    switch event {
    | FieldFocused(id) => onAnalytics({eventType: #focus, field: field(id)})
    | FieldBlurred(id) => onAnalytics({eventType: #blur, field: field(id)})
    }
  }

  <CardFormView
    selection
    cardNumberValidator
    cardNumberFormatter
    makeExpiryValidator
    makeCvcValidator
    ?cardNetworkValidator
    ?accessible
    checkEligibility
    theme
    labels
    layout
    eligibilityStatus
    isProcessing
    onAnalytics=onAnalyticsInternal
    emitCardInfo
    renderIcon
    renderError
    ?renderSchemeAccessory
    ?scanCard
  />
}
