type styleObject = ReactNative.Style.t

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

type cardFieldId =
  | CardNumberField
  | ExpiryField
  | CvcField

type analyticsEvent =
  | FieldFocused(cardFieldId)
  | FieldBlurred(cardFieldId)

type cardFieldValues = {
  cardNumber: string,
  expiryDisplay: string,
  cvc: string,
  brand: string,
}

type cardFieldErrors = {
  cardNumber?: string,
  expiry?: string,
  cvc?: string,
  network?: string,
}

type cardFieldOk = {
  cardNumber: bool,
  expiry: bool,
  cvc: bool,
}
