
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

@genType.opaque
type maskedCardInfo = PaymentEventData.cardInfo

@genType
let selectCardFields = CardFormTypes.selectCardFields

let toPayload = (event: CardFormTypes.analyticsEvent): analyticsPayload => {
  let field = fieldId =>
    switch fieldId {
    | CardFormTypes.CardNumberField => #cardNumber
    | CardFormTypes.ExpiryField => #expiry
    | CardFormTypes.CvcField => #cvc
    }
  switch event {
  | FieldFocused(id) => {eventType: #focus, field: field(id)}
  | FieldBlurred(id) => {eventType: #blur, field: field(id)}
  }
}

module CardNumberField = {
  @genType @react.component
  let make = (
    ~value: string,
    ~onChange: CardFieldLogic.numberChange => unit,

    ~currentBrand: string="",
    ~onFocus: unit => unit=() => (),
    ~onBlur: unit => unit=() => (),
    ~onBackspace: CardFieldLogic.backspaceAction => unit=_ => (),
    ~error: string=?,

    ~isValid: bool=?,
    ~renderError: (string => React.element)=?,
    ~label: string,
    ~floatingLabel: string,
    ~theme: cardTheme,
    ~isProcessing: bool=false,
    ~editable: bool=true,
    ~accessible: bool=?,
    ~onAnalytics: analyticsPayload => unit=_ => (),
    ~iconRight: React.element=?,
    ~registerFocus: (unit => unit) => unit=_ => (),
    ~registerBlur: (unit => unit) => unit=_ => (),
    ~borderBottomWidth: float=?,
    ~borderBottomLeftRadius: float=?,
    ~borderBottomRightRadius: float=?,
  ) => {
    let reference = React.useRef(Nullable.null)
    React.useEffect0(() => {
      registerFocus(() => VaultCardController.focusRef(reference))
      registerBlur(() => VaultCardController.blurRef(reference))
      None
    })
    <CardFields.Number
      value
      onChange
      currentBrand
      onFocus
      onBlur
      onBackspace
      ?error
      ?isValid
      ?renderError
      label
      floatingLabel
      common={theme, isProcessing, editable, accessible}
      onAnalytics={event => onAnalytics(event->toPayload)}
      reference
      iconRight=?{iconRight->Option.map(element => CardInput.CustomIcon(element))}
      ?borderBottomWidth
      ?borderBottomLeftRadius
      ?borderBottomRightRadius
    />
  }
}

module CardExpiryField = {
  @genType @react.component
  let make = (
    ~value: string,
    ~onChange: CardFieldLogic.expiryChange => unit,
    ~onFocus: unit => unit=() => (),
    ~onBlur: unit => unit=() => (),
    ~onBackspace: CardFieldLogic.backspaceAction => unit=_ => (),
    ~error: string=?,

    ~isValid: bool=?,
    ~renderError: (string => React.element)=?,
    ~label: string,
    ~floatingLabel: string,
    ~theme: cardTheme,
    ~isProcessing: bool=false,
    ~editable: bool=true,
    ~accessible: bool=?,
    ~onAnalytics: analyticsPayload => unit=_ => (),
    ~registerFocus: (unit => unit) => unit=_ => (),
    ~registerBlur: (unit => unit) => unit=_ => (),
    ~borderTopWidth: float=?,
    ~borderRightWidth: float=?,
    ~borderTopLeftRadius: float=?,
    ~borderTopRightRadius: float=?,
    ~borderBottomRightRadius: float=?,
  ) => {
    let reference = React.useRef(Nullable.null)
    React.useEffect0(() => {
      registerFocus(() => VaultCardController.focusRef(reference))
      registerBlur(() => VaultCardController.blurRef(reference))
      None
    })
    <CardFields.Expiry
      value
      onChange
      onFocus
      onBlur
      onBackspace
      ?error
      ?isValid
      ?renderError
      label
      floatingLabel
      common={theme, isProcessing, editable, accessible}
      onAnalytics={event => onAnalytics(event->toPayload)}
      reference
      ?borderTopWidth
      ?borderRightWidth
      ?borderTopLeftRadius
      ?borderTopRightRadius
      ?borderBottomRightRadius
    />
  }
}

module CardCvcField = {
  @genType @react.component
  let make = (
    ~value: string,
    ~onChange: CardFieldLogic.cvcChange => unit,

    ~brand: string="",
    ~onFocus: unit => unit=() => (),
    ~onBlur: unit => unit=() => (),
    ~onBackspace: CardFieldLogic.backspaceAction => unit=_ => (),
    ~error: string=?,

    ~isValid: bool=?,
    ~renderError: (string => React.element)=?,
    ~label: string,
    ~floatingLabel: string,
    ~theme: cardTheme,
    ~isProcessing: bool=false,
    ~editable: bool=true,
    ~accessible: bool=?,
    ~onAnalytics: analyticsPayload => unit=_ => (),
    ~iconRight: React.element=?,
    ~registerFocus: (unit => unit) => unit=_ => (),
    ~registerBlur: (unit => unit) => unit=_ => (),
    ~borderTopWidth: float=?,
    ~borderLeftWidth: float=?,
    ~borderTopLeftRadius: float=?,
    ~borderTopRightRadius: float=?,
    ~borderBottomLeftRadius: float=?,
    ~borderBottomRightRadius: float=?,
    ~borderBottomWidth: float=?,
    ~borderRightWidth: float=?,
  ) => {
    let reference = React.useRef(Nullable.null)
    React.useEffect0(() => {
      registerFocus(() => VaultCardController.focusRef(reference))
      registerBlur(() => VaultCardController.blurRef(reference))
      None
    })
    <CardFields.Cvc
      value
      onChange
      brand
      onFocus
      onBlur
      onBackspace
      ?error
      ?isValid
      ?renderError
      label
      floatingLabel
      common={theme, isProcessing, editable, accessible}
      onAnalytics={event => onAnalytics(event->toPayload)}
      reference
      iconRight=?{iconRight->Option.map(element => CardInput.CustomIcon(element))}
      ?borderTopWidth
      ?borderLeftWidth
      ?borderTopLeftRadius
      ?borderTopRightRadius
      ?borderBottomLeftRadius
      ?borderBottomRightRadius
      ?borderBottomWidth
      ?borderRightWidth
    />
  }
}
