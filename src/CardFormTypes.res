@genType.opaque
type styleObject = ReactNative.Style.t

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
  textColor: string,
  inputBackground: string,
  dividerColor: string,
  errorBorderColor: string,
  normalBorderColor: string,
  bgStyle: styleObject,
  shadowStyle: styleObject,
}

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

@genType
type eligibilityState = [#allowed | #pending | #denied]

@genType
type scanCardCapability = {
  isAvailable: bool,
  launch: (~onScanned: (~pan: string, ~expiry: string) => unit) => unit,
}

@genType
type schemeAccessory = {
  availableSchemes: array<string>,
  selectedScheme: string,
  detectedScheme: string,
  showPicker: bool,
  onSelectScheme: string => unit,
}

type cardFieldId =
  | CardNumberField
  | ExpiryField
  | CvcField

type analyticsEvent =
  | FieldFocused(cardFieldId)
  | FieldBlurred(cardFieldId)

@genType
type renderIcon = (~name: string, ~width: float, ~height: float, ~fill: string) => React.element

type cardFormControls = {
  focus: [#cardNumber | #expiry | #cvc] => unit,
  clearLocalState: unit => unit,
}

@genType
type cardFieldSpec = {
  renderType: string,
  writePath: string,
}

@genType
type cardFieldSelection = {
  cardNumberPath: string,
  cardExpiryMonthPath: string,
  cardExpiryYearPath: string,
  cardCvcPath: option<string>,
  cardNetworkPath: option<string>,
}

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

@genType
type cardFieldValues = {
  cardNumber: string,
  expiryDisplay: string,
  cvc: string,
  brand: string,
}

@genType
type cardFieldErrors = {
  cardNumber?: string,
  expiry?: string,
  cvc?: string,
  network?: string,
}

@genType
type cardFieldOk = {
  cardNumber: bool,
  expiry: bool,
  cvc: bool,
}
