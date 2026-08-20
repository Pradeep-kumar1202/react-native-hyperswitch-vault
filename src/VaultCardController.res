open ReactNative

type widgetKind = CardNumberKind | ExpiryKind | CvcKind

let kindLabel = kind =>
  switch kind {
  | CardNumberKind => "CardNumberWidget"
  | ExpiryKind => "CardExpiryWidget"
  | CvcKind => "CardCVCWidget"
  }

type controller = {
  values: CardFormTypes.cardFieldValues,
  visibleErrors: CardFormTypes.cardFieldErrors,
  fieldOk: CardFormTypes.cardFieldOk,
  onNumberChange: CardFieldLogic.numberChange => unit,
  onExpiryChange: CardFieldLogic.expiryChange => unit,
  onCvcChange: CardFieldLogic.cvcChange => unit,
  onFocus: CardStateReducer.field => unit,
  onBlur: CardStateReducer.field => unit,
  onBackspace: (CardStateReducer.field, CardFieldLogic.backspaceAction) => unit,
  onScanned: (~pan: string, ~expiry: string) => unit,
  onSchemeSelected: string => unit,
  isValid: bool,
  isValidNow: unit => bool,
  cardDetails: unit => VaultConfirm.cardDetails,
  markSubmitAttempted: unit => unit,
  reset: unit => unit,
  focusField: [#cardNumber | #expiry | #cvc] => unit,
  register: widgetKind => unit => unit,
  countOf: widgetKind => int,
  registryVersion: int,
  cardRef: React.ref<Nullable.t<TextInput.element>>,
  expiryRef: React.ref<Nullable.t<TextInput.element>>,
  cvcRef: React.ref<Nullable.t<TextInput.element>>,
  safeState: CardFormTypes.cardFieldValues => unit,
}

let focusRef = (ref: React.ref<Nullable.t<TextInput.element>>) =>
  switch ref.current->Nullable.toOption {
  | None => ()
  | Some(node) => node->TextInputElement.focus
  }

let blurRef = (ref: React.ref<Nullable.t<TextInput.element>>) =>
  switch ref.current->Nullable.toOption {
  | None => ()
  | Some(node) => node->TextInputElement.blur
  }

let use = (
  ~validators: CardStateReducer.validators,
  ~emitCardInfo: PaymentEventData.cardInfo => unit=_ => (),
) => {
  let (state, dispatch) = React.useReducer(CardStateReducer.reduce, CardStateReducer.initial)

  let cardRef = React.useRef(Nullable.null)
  let expiryRef = React.useRef(Nullable.null)
  let cvcRef = React.useRef(Nullable.null)

  let registryRef: React.ref<Map.t<int, widgetKind>> = React.useRef(Map.make())
  let nextIdRef = React.useRef(0)
  let (registryVersion, setRegistryVersion) = React.useState(() => 0)

  let register = kind => {
    nextIdRef.current = nextIdRef.current + 1
    let id = nextIdRef.current
    registryRef.current->Map.set(id, kind)
    setRegistryVersion(version => version + 1)
    () => {
      registryRef.current->Map.delete(id)->ignore
      setRegistryVersion(version => version + 1)
    }
  }

  let countOf = kind => {
    let count = ref(0)
    registryRef.current->Map.forEach(entry =>
      if entry === kind {
        count := count.contents + 1
      }
    )
    count.contents
  }

  let errors = state->CardStateReducer.errorsFor(~validators)

  let latestRef = React.useRef((state, errors))
  latestRef.current = (state, errors)

  let onNumberChange = (change: CardFieldLogic.numberChange) => {
    dispatch(NumberChanged(change))
    if change.advanceFocus {
      focusRef(expiryRef)
    }
  }

  let onExpiryChange = (change: CardFieldLogic.expiryChange) => {
    dispatch(ExpiryChanged(change))
    if change.advanceFocus {
      focusRef(cvcRef)
    }
  }

  let onCvcChange = (change: CardFieldLogic.cvcChange) => {
    dispatch(CvcChanged(change))
  }

  let onBackspace = (_field, action: CardFieldLogic.backspaceAction) =>
    switch action {
    | #blurSelf => blurRef(cardRef)
    | #focusCardNumber => focusRef(cardRef)
    | #focusExpiry => focusRef(expiryRef)
    | #none => ()
    }

  let onScanned = (~pan, ~expiry) => {
    let result = CardFieldLogic.onScanned(~pan, ~expiry)
    dispatch(ScanApplied(result))
    switch result.focus {
    | #cvc => focusRef(cvcRef)
    | #expiry => focusRef(expiryRef)
    | #none => ()
    }
  }

  React.useEffect(() => {
    emitCardInfo(
      PaymentEventData.buildCardInfo(
        ~cardNumber=state.cardNumber,
        ~expiry=state.expiryDisplay,
        ~cvc=state.cvc,
        ~brand=state.brand,
      ),
    )
    None
  }, (state.cardNumber, state.expiryDisplay, state.cvc, state.brand))

  {
    values: {
      cardNumber: state.cardNumber,
      expiryDisplay: state.expiryDisplay,
      cvc: state.cvc,
      brand: state.brand,
    },
    visibleErrors: {
      cardNumber: ?CardStateReducer.numberError(state, errors),
      expiry: ?CardStateReducer.expiryError(state, errors),
      cvc: ?CardStateReducer.cvcError(state, errors),
      network: ?CardStateReducer.networkError(state, errors),
    },
    fieldOk: {
      cardNumber: CardStateReducer.numberFieldOk(state, errors),
      expiry: CardStateReducer.expiryFieldOk(state, errors),
      cvc: CardStateReducer.cvcFieldOk(state, errors),
    },
    onNumberChange,
    onExpiryChange,
    onCvcChange,
    onFocus: field => dispatch(Focused(field)),
    onBlur: field => dispatch(Blurred(field)),
    onBackspace,
    onScanned,
    onSchemeSelected: scheme => dispatch(SchemeSelected(scheme)),
    isValid: CardStateReducer.isValid(errors),
    isValidNow: () => {
      let (_, latestErrors) = latestRef.current
      CardStateReducer.isValid(latestErrors)
    },
    cardDetails: () => {
      let (latest, _) = latestRef.current
      {
        VaultConfirm.cardNumber: latest.cardNumber,
        expiryMonth: latest.expiryMonth,
        expiryYear: latest.expiryYear,
        cvc: latest.cvc,
      }
    },
    markSubmitAttempted: () => dispatch(SubmitAttempted),
    reset: () => dispatch(Reset),
    focusField: field =>
      switch field {
      | #cardNumber => focusRef(cardRef)
      | #expiry => focusRef(expiryRef)
      | #cvc => focusRef(cvcRef)
      },
    register,
    countOf,
    registryVersion,
    cardRef,
    expiryRef,
    cvcRef,
    safeState: _ => (),
  }
}
