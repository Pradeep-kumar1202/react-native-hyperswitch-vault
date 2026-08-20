
open ReactNative

@genType
type vaultEnvironment = VaultConfirm.vaultEnvironment

@genType.import(("./merchantTypes", "MerchantSession"))
type vaultSession

external sessionToJson: vaultSession => JSON.t = "%identity"

@genType
type brandIconMode = CardIcons.brandIconMode

@genType
type appearance = {
  primaryColor?: string,
  textColor?: string,
  errorColor?: string,
  placeholderColor?: string,
  backgroundColor?: string,
  borderColor?: string,
  borderRadius?: float,
  borderWidth?: float,
  fontFamily?: string,
  inputHeight?: float,

  gap?: float,

  fontScale?: float,

  placeholderTextSizeAdjust?: float,

  errorTextSizeAdjust?: float,

  errorMessageSpacing?: float,

  brandIconMode?: brandIconMode,
}

@genType
type localisationLabels = {
  cardNumberPlaceholder?: string,
  cardNumberFloatingLabel?: string,
  expiryPlaceholder?: string,
  expiryFloatingLabel?: string,
  cvcPlaceholder?: string,
  cvcFloatingLabel?: string,
}

@genType
type localisationMessages = {
  cardNumberRequired?: string,
  cardNumberInvalid?: string,
  expiryRequired?: string,
  expiryInvalid?: string,
  cvcRequired?: string,
  cvcInvalid?: string,
}

@genType
type localisation = {
  labels?: localisationLabels,
  validationMessages?: localisationMessages,
  isRtl?: bool,
}

@genType
type cardFormState = {
  complete: bool,
  cardNumberValid: bool,
  expiryValid: bool,
  cvcValid: bool,
  brand: string,
}

@genType
type vaultCardMetadata = VaultConfirm.vaultCardMetadata

@genType
type safeVaultErrorCode = VaultResult.safeVaultErrorCode

@genType
type safeVaultError = VaultResult.safeVaultError

@genType
type vaultSubmitResult = VaultResult.vaultSubmitResult

@genType
type vaultFormHandle = {
  submit: unit => promise<vaultSubmitResult>,
  reset: unit => unit,
  focus: [#cardNumber | #expiry | #cvc] => unit,
}

let emptyStyle = Style.s({})

let buildTheme = (appearance: option<appearance>): CardFormTypes.cardTheme => {
  let pick = (selector, fallback) => appearance->Option.flatMap(selector)->Option.getOr(fallback)

  let text = pick(a => a.textColor, "#1A1A1A")
  {
    borderWidth: pick(a => a.borderWidth, 1.),
    borderRadius: pick(a => a.borderRadius, 8.),
    gap: pick(a => a.gap, 12.),
    inputHeight: pick(a => a.inputHeight, 48.),
    fontFamily: pick(a => a.fontFamily, "System"),
    fontScale: pick(a => a.fontScale, 1.),
    placeholderTextSizeAdjust: pick(a => a.placeholderTextSizeAdjust, 0.),
    placeholderColor: pick(a => a.placeholderColor, "#6B7280"),
    primaryColor: pick(a => a.primaryColor, "#0570DE"),
    dangerColor: pick(a => a.errorColor, "#DF1B41"),
    textColor: text,
    inputBackground: pick(a => a.backgroundColor, "#FFFFFF"),
    dividerColor: pick(a => a.borderColor, "#E6E6E6"),
    errorBorderColor: pick(a => a.errorColor, "#DF1B41"),
    normalBorderColor: pick(a => a.borderColor, "#E6E6E6"),
    bgStyle: emptyStyle,
    shadowStyle: emptyStyle,
  }
}

let defaultLabels: CardFormTypes.cardLabels = {
  cardNumberPlaceholder: "Card number",
  cardNumberFloatingLabel: "Card number",
  expiryPlaceholder: "MM / YY",
  expiryFloatingLabel: "Expiry",
  cvcPlaceholder: "CVC",
  cvcFloatingLabel: "CVC",

  notEligibleText: "",
  isRtl: false,
}

type resolvedMessages = {
  cardNumberRequired: string,
  cardNumberInvalid: string,
  expiryRequired: string,
  expiryInvalid: string,
  cvcRequired: string,
  cvcInvalid: string,
}

let resolveLabels = (localisation: option<localisation>): CardFormTypes.cardLabels => {
  let labels = localisation->Option.flatMap(l => l.labels)
  let pick = (selector, fallback) => labels->Option.flatMap(selector)->Option.getOr(fallback)
  {
    cardNumberPlaceholder: pick(l => l.cardNumberPlaceholder, defaultLabels.cardNumberPlaceholder),
    cardNumberFloatingLabel: pick(
      l => l.cardNumberFloatingLabel,
      defaultLabels.cardNumberFloatingLabel,
    ),
    expiryPlaceholder: pick(l => l.expiryPlaceholder, defaultLabels.expiryPlaceholder),
    expiryFloatingLabel: pick(l => l.expiryFloatingLabel, defaultLabels.expiryFloatingLabel),
    cvcPlaceholder: pick(l => l.cvcPlaceholder, defaultLabels.cvcPlaceholder),
    cvcFloatingLabel: pick(l => l.cvcFloatingLabel, defaultLabels.cvcFloatingLabel),
    notEligibleText: defaultLabels.notEligibleText,
    isRtl: localisation->Option.flatMap(l => l.isRtl)->Option.getOr(defaultLabels.isRtl),
  }
}

let resolveMessages = (localisation: option<localisation>): resolvedMessages => {
  let locale = LocaleDataType.defaultLocale
  let messages = localisation->Option.flatMap(l => l.validationMessages)
  let pick = (selector, fallback) => messages->Option.flatMap(selector)->Option.getOr(fallback)
  {
    cardNumberRequired: pick(m => m.cardNumberRequired, locale.cardNumberEmptyText),
    cardNumberInvalid: pick(m => m.cardNumberInvalid, locale.inValidCardErrorText),
    expiryRequired: pick(m => m.expiryRequired, locale.cardExpiryDateEmptyText),
    expiryInvalid: pick(m => m.expiryInvalid, locale.inValidExpiryErrorText),
    cvcRequired: pick(m => m.cvcRequired, locale.cvcNumberEmptyText),
    cvcInvalid: pick(m => m.cvcInvalid, locale.inValidCVCErrorText),
  }
}

  let makeCardNumberValidator = (messages: resolvedMessages) => (value: option<string>) => {
    let value = value->Option.getOr("")
    if value->String.length === 0 {
      Some(messages.cardNumberRequired)
    } else {
      let cardBrand = value->Validation.getCardBrand
      let formattedNumber = Validation.formatCardNumber(value, cardBrand->Validation.cardType)
      Validation.cardValid(formattedNumber, cardBrand) ? None : Some(messages.cardNumberInvalid)
    }
  }

  let makeExpiryValidatorWith = (messages: resolvedMessages) => (expiry: string) => (_: option<string>) =>
    if expiry->String.length === 0 {
      Some(messages.expiryRequired)
    } else if Validation.checkCardExpiry(expiry) {
      None
    } else {
      Some(messages.expiryInvalid)
    }

  let makeCvcValidatorWith = (messages: resolvedMessages) => (cardBrand: string) => (value: option<string>) => {
    let value = value->Option.getOr("")
    if value->String.length === 0 {
      Some(messages.cvcRequired)
    } else if Validation.checkCardCVC(value, cardBrand) {
      None
    } else {
      Some(messages.cvcInvalid)
    }
  }
