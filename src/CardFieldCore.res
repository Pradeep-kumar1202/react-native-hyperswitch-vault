/*
 * CardFieldCore — the FORM-OWNER composition of the shared field-core (ADR-0001).
 *
 * Checkpoint 1 extracted this logic out of CardFormView verbatim; Checkpoint 2 decomposed it into
 * `CardFieldUnits` — one per-field hook per card field plus the cross-field coordination — so the
 * widget components compose the very same implementations. `use` is now nothing but that
 * composition, returning the record CardFormView renders from. There is deliberately no second
 * implementation of any binding, validator wiring, formatter, focus transition or registration:
 * every one lives in CardFieldUnits and is consumed from here AND from the widgets.
 *
 * Deliberately carries no genType annotation: nothing here crosses the package boundary.
 */

open ReactNative
open Validation

/* Everything the card form's layout needs back from the field-core. */
type t = {
  cardNumberInput: ReactFinalForm.Field.inputProps,
  cardNumberMeta: ReactFinalForm.Field.fieldState,
  cardExpiryYearInput: ReactFinalForm.Field.inputProps,
  cardExpiryYearMeta: ReactFinalForm.Field.fieldState,
  cardNetworkInput: ReactFinalForm.Field.inputProps,
  cardNetworkMeta: ReactFinalForm.Field.fieldState,
  cardCvcInput: ReactFinalForm.Field.inputProps,
  cardCvcMeta: ReactFinalForm.Field.fieldState,
  hasCvc: bool,
  expireDate: string,
  eligibleCardSchemes: array<string>,
  showCardSchemeDropDown: bool,
  cardRef: React.ref<Nullable.t<TextInput.element>>,
  expireRef: React.ref<Nullable.t<TextInput.element>>,
  cvvRef: React.ref<Nullable.t<TextInput.element>>,
  nullRef: React.ref<Nullable.t<TextInput.element>>,
  onChangeCardNumber: (string, React.ref<Nullable.t<TextInput.element>>) => unit,
  onChangeCardExpire: (string, React.ref<Nullable.t<TextInput.element>>) => unit,
  onChangeCvv: (string, React.ref<Nullable.t<TextInput.element>>) => unit,
  onScanned: (~pan: string, ~expiry: string) => unit,
  /* The fields' backspace-navigation handlers — single-sourced in CardFieldUnits. */
  numberOnKeyPress: TextInput.KeyPressEvent.t => unit,
  expiryOnKeyPress: TextInput.KeyPressEvent.t => unit,
  cvcOnKeyPress: TextInput.KeyPressEvent.t => unit,
}

let use = (
  ~selection: CardFormTypes.cardFieldSelection,
  ~cardNumberValidator: option<string> => option<string>,
  ~cardNumberFormatter: (option<string>, string) => option<string>,
  ~makeExpiryValidator: string => (option<string> => option<string>),
  ~makeCvcValidator: string => (option<string> => option<string>),
  ~cardNetworkValidator: option<option<string> => option<string>>,
  ~checkEligibility: option<string> => unit,
  ~eligibilityStatus: CardFormTypes.eligibilityState,
  ~emitCardInfo: PaymentEventData.cardInfo => unit,
  ~registerControls: option<option<CardFormTypes.cardFormControls> => unit>,
): t => {
  let coordinationState = CardFieldUnits.useCoordination(~selection, ~cardNetworkValidator)
  let coord = coordinationState.coordination

  /* Co-badge scheme state is a FORM-OWNER concern: only the fused layout's accessory reads it. */
  let (
    (eligibleCardSchemes, showCardSchemeDropDown),
    setCardSchemeVariables,
  ) = React.useState(_ => ([], false))

  let numberField = CardFieldUnits.useCardNumberField(
    ~path=selection.cardNumberPath,
    ~validator=cardNumberValidator,
    ~formatter=cardNumberFormatter,
    ~coord,
    ~onSchemesDetected=(schemes, showDropDown) =>
      setCardSchemeVariables(_ => (schemes, showDropDown)),
  )
  let expiryField = CardFieldUnits.useCardExpiryField(
    ~monthPath=selection.cardExpiryMonthPath,
    ~yearPath=selection.cardExpiryYearPath,
    ~makeExpiryValidator,
    ~coord,
  )
  let cvcField = CardFieldUnits.useCardCvcField(
    ~cvcPath=selection.cardCvcPath,
    ~makeCvcValidator,
    ~coord,
  )

  /* The record-compat blur target the view passes to onChangeCvv; the handler ignores it. */
  let nullRef = React.useRef(Nullable.null)

  /*
   * Registration is symmetric: `Some(controls)` on mount, `None` on unmount — same contract as
   * before the decomposition. Focus routes through the registry the field hooks populate;
   * clearLocalState clears each field's local display state plus the scheme state owned here.
   */
  React.useEffect0(() => {
    let controls: CardFormTypes.cardFormControls = {
      focus: field =>
        coord.focusKind(
          switch field {
          | #cardNumber => CardFieldUnits.CardNumberKind
          | #expiry => CardFieldUnits.ExpiryKind
          | #cvc => CardFieldUnits.CvcKind
          },
        ),
      clearLocalState: () => {
        coord.clearAllLocal()
        setCardSchemeVariables(_ => ([], false))
      },
    }
    registerControls->Option.forEach(register => register(Some(controls)))
    Some(() => registerControls->Option.forEach(register => register(None)))
  })

  let cardNumber = numberField.input.value->Option.getOr("")
  let cvc = cvcField.input.value->Option.getOr("")
  let brand = coord.brand

  React.useEffect(() => {
    let info = PaymentEventData.buildCardInfo(
      ~cardNumber,
      ~expiry=expiryField.expireDate,
      ~cvc,
      ~brand,
    )
    emitCardInfo(info)
    None
  }, (cardNumber, expiryField.expireDate, cvc, brand))

  React.useEffect1(() => {
    let isValid = cardValid(cardNumber, brand)
    let isMaxLength = isCardNumberEqualsMax(cardNumber, brand)
    if isValid && isMaxLength {
      checkEligibility(Some(cardNumber->clearSpaces))
    } else if !isValid && eligibilityStatus !== #allowed {
      checkEligibility(None)
    }
    None
  }, [cardNumber])

  let onScanned = (~pan, ~expiry) => {
    let cardBrand = getCardBrand(pan)
    let cardNumber = formatCardNumber(pan, cardType(cardBrand))
    let isCardValid = cardValid(cardNumber, cardBrand)
    let expireDate = formatCardExpiryNumber(expiry)
    let isExpiryValid = checkCardExpiry(expireDate)
    numberField.input.onChange(cardNumber)
    coord.setBrand(cardBrand)
    let (month, year) = expireDate->splitExpiryDates
    expiryField.monthInput.onChange(month)
    expiryField.yearInput.onChange(year)
    expiryField.setDisplay(expireDate)
    switch (isCardValid, isExpiryValid) {
    | (true, true) => coord.focusKind(CardFieldUnits.CvcKind)
    | (true, false) => coord.focusKind(CardFieldUnits.ExpiryKind)
    | _ => ()
    }
  }

  {
    cardNumberInput: numberField.input,
    cardNumberMeta: numberField.meta,
    cardExpiryYearInput: expiryField.yearInput,
    cardExpiryYearMeta: expiryField.yearMeta,
    cardNetworkInput: coordinationState.cardNetworkInput,
    cardNetworkMeta: coordinationState.cardNetworkMeta,
    cardCvcInput: cvcField.input,
    cardCvcMeta: cvcField.meta,
    hasCvc: cvcField.hasCvc,
    expireDate: expiryField.expireDate,
    eligibleCardSchemes,
    showCardSchemeDropDown,
    cardRef: numberField.fieldRef,
    expireRef: expiryField.fieldRef,
    cvvRef: cvcField.fieldRef,
    nullRef,
    onChangeCardNumber: (text, _nextRef) => numberField.setText(text),
    onChangeCardExpire: (text, _nextRef) => expiryField.setText(text),
    onChangeCvv: (text, _blurRef) => cvcField.setText(text),
    onScanned,
    numberOnKeyPress: numberField.onKeyPress,
    expiryOnKeyPress: expiryField.onKeyPress,
    cvcOnKeyPress: cvcField.onKeyPress,
  }
}
