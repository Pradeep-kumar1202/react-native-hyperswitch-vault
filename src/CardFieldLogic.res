open Validation

@genType
type numberChange = {
  formatted: string,
  brand: string,
  matchedSchemes: array<string>,
  showSchemePicker: bool,
  clearDependents: bool,
  advanceFocus: bool,
}

let onCardNumberText = (text: string, ~currentBrand: string): numberChange => {
  let matchedSchemes = text->clearSpaces->getAllMatchedCardSchemes
  let isCardCoBadged = matchedSchemes->Array.length > 1
  let showSchemePicker = isCardCoBadged && text->clearSpaces->String.length >= 16
  let brand = matchedSchemes->Array.get(0)->Option.getOr("")
  let formatted = formatCardNumber(text, cardType(brand))
  let clearDependents =
    brand !== currentBrand && matchedSchemes->Array.find(v => v === brand)->Option.isNone
  {
    formatted,
    brand,
    matchedSchemes,
    showSchemePicker,
    clearDependents,
    advanceFocus: cardValid(formatted, brand) && isCardNumberEqualsMax(formatted, brand),
  }
}

@genType
type expiryChange = {
  display: string,
  month: string,
  year: string,
  advanceFocus: bool,
}

let onExpiryText = (text: string): expiryChange => {
  let display = formatCardExpiryNumber(text)
  let (month, year) = display->splitExpiryDates
  {display, month, year, advanceFocus: checkCardExpiry(display)}
}

@genType
type cvcChange = {
  formatted: string,
  blurField: bool,
}

let onCvcText = (text: string, ~brand: string): cvcChange => {
  let formatted = formatCVCNumber(text, brand)
  {
    formatted,
    blurField: checkCardCVC(formatted, brand) && checkMaxCardCvv(formatted, brand),
  }
}

@genType
type scanFocus = [#cvc | #expiry | #none]

@genType
type scanResult = {
  cardNumber: string,
  brand: string,
  expiryDisplay: string,
  expiryMonth: string,
  expiryYear: string,
  focus: scanFocus,
}

let onScanned = (~pan: string, ~expiry: string): scanResult => {
  let brand = getCardBrand(pan)
  let cardNumber = formatCardNumber(pan, cardType(brand))
  let expiryDisplay = formatCardExpiryNumber(expiry)
  let (expiryMonth, expiryYear) = expiryDisplay->splitExpiryDates
  {
    cardNumber,
    brand,
    expiryDisplay,
    expiryMonth,
    expiryYear,
    focus: switch (cardValid(cardNumber, brand), checkCardExpiry(expiryDisplay)) {
    | (true, true) => #cvc
    | (true, false) => #expiry
    | _ => #none
    },
  }
}

@genType
type backspaceAction = [#blurSelf | #focusCardNumber | #focusExpiry | #none]

let onCardNumberBackspace = (~value: string) => value === "" ? #blurSelf : #none
let onExpiryBackspace = (~display: string) => display === "" ? #focusCardNumber : #none
let onCvcBackspace = (~value: string) => value === "" ? #focusExpiry : #none

@genType
type eligibilityProbe = [#check(string) | #reset | #idle]

let eligibilityFor = (~cardNumber: string, ~brand: string, ~alreadyAllowed: bool) => {
  let isValid = cardValid(cardNumber, brand)
  if isValid && isCardNumberEqualsMax(cardNumber, brand) {
    #check(cardNumber->clearSpaces)
  } else if !isValid && !alreadyAllowed {
    #reset
  } else {
    #idle
  }
}
