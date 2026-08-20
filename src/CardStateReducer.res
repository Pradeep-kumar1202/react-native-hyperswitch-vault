@genType
type field = [#cardNumber | #expiry | #cvc | #network]

type fieldMeta = {touched: bool, active: bool}

let untouched = {touched: false, active: false}

type state = {
  cardNumber: string,
  expiryDisplay: string,
  expiryMonth: string,
  expiryYear: string,
  cvc: string,
  brand: string,
  matchedSchemes: array<string>,
  showSchemePicker: bool,
  numberMeta: fieldMeta,
  expiryMeta: fieldMeta,
  cvcMeta: fieldMeta,
  networkMeta: fieldMeta,
  submitAttempted: bool,
}

let initial = {
  cardNumber: "",
  expiryDisplay: "",
  expiryMonth: "",
  expiryYear: "",
  cvc: "",
  brand: "",
  matchedSchemes: [],
  showSchemePicker: false,
  numberMeta: untouched,
  expiryMeta: untouched,
  cvcMeta: untouched,
  networkMeta: untouched,
  submitAttempted: false,
}

type action =
  | NumberChanged(CardFieldLogic.numberChange)
  | ExpiryChanged(CardFieldLogic.expiryChange)
  | CvcChanged(CardFieldLogic.cvcChange)
  | SchemeSelected(string)
  | ScanApplied(CardFieldLogic.scanResult)
  | Focused(field)
  | Blurred(field)
  | SubmitAttempted
  | Reset

let withMeta = (state, field, update) =>
  switch field {
  | #cardNumber => {...state, numberMeta: update(state.numberMeta)}
  | #expiry => {...state, expiryMeta: update(state.expiryMeta)}
  | #cvc => {...state, cvcMeta: update(state.cvcMeta)}
  | #network => {...state, networkMeta: update(state.networkMeta)}
  }

let reduce = (state: state, action: action): state =>
  switch action {
  | NumberChanged(change) =>
    let cleared = change.clearDependents
    {
      ...state,
      cardNumber: change.formatted,
      brand: change.brand,
      matchedSchemes: change.matchedSchemes,
      showSchemePicker: change.showSchemePicker,
      expiryDisplay: cleared ? "" : state.expiryDisplay,
      expiryMonth: cleared ? "" : state.expiryMonth,
      expiryYear: cleared ? "" : state.expiryYear,
      cvc: cleared ? "" : state.cvc,
    }
  | ExpiryChanged(change) => {
      ...state,
      expiryDisplay: change.display,
      expiryMonth: change.month,
      expiryYear: change.year,
    }
  | CvcChanged(change) => {...state, cvc: change.formatted}
  | SchemeSelected(scheme) => {...state, brand: scheme}
  | ScanApplied(result) => {
      ...state,
      cardNumber: result.cardNumber,
      brand: result.brand,
      expiryDisplay: result.expiryDisplay,
      expiryMonth: result.expiryMonth,
      expiryYear: result.expiryYear,
    }
  | Focused(field) => state->withMeta(field, meta => {...meta, active: true})
  | Blurred(field) => state->withMeta(field, meta => {touched: true, active: false})
  | SubmitAttempted => {
      ...state,
      submitAttempted: true,
      numberMeta: {...state.numberMeta, touched: true},
      expiryMeta: {...state.expiryMeta, touched: true},
      cvcMeta: {...state.cvcMeta, touched: true},
      networkMeta: {...state.networkMeta, touched: true},
    }
  | Reset => initial
  }

type validators = {
  cardNumber: option<string> => option<string>,
  expiry: string => option<string> => option<string>,
  cvc: string => option<string> => option<string>,
  network: option<option<string> => option<string>>,
}

type errors = {
  cardNumber: option<string>,
  expiry: option<string>,
  cvc: option<string>,
  network: option<string>,
}

let errorsFor = (state: state, ~validators: validators): errors => {
  cardNumber: validators.cardNumber(Some(state.cardNumber)),
  expiry: validators.expiry(state.expiryDisplay)(Some(state.expiryYear)),
  cvc: validators.cvc(state.brand)(Some(state.cvc)),
  network: validators.network->Option.flatMap(validate => validate(Some(state.brand))),
}

let isValid = (errors: errors) =>
  errors.cardNumber->Option.isNone &&
  errors.expiry->Option.isNone &&
  errors.cvc->Option.isNone &&
  errors.network->Option.isNone

let numberError = (state, errors: errors) =>
  switch (errors.cardNumber, state.numberMeta.touched) {
  | (Some(message), true) => Some(message)
  | _ => None
  }

let expiryError = (state, errors: errors) =>
  switch (
    errors.expiry,
    (state.expiryDisplay->String.length > 0 || !state.expiryMeta.touched) &&
      (state.expiryDisplay->String.length < 7 || Validation.checkCardExpiry(state.expiryDisplay)),
  ) {
  | (Some(message), false) => Some(message)
  | _ => None
  }

let cvcError = (state, errors: errors) =>
  switch (errors.cvc, state.cvcMeta.touched, state.cvcMeta.active) {
  | (Some(message), true, false) => Some(message)
  | _ => None
  }

let networkError = (state, errors: errors) =>
  switch (errors.network, state.networkMeta.touched) {
  | (Some(message), true) => Some(message)
  | _ => None
  }

let numberFieldOk = (state, errors: errors) =>
  errors.cardNumber->Option.isNone || !state.numberMeta.touched || state.numberMeta.active

let expiryFieldOk = (state, errors: errors) =>
  ((errors.expiry->Option.isNone || !state.expiryMeta.touched || state.expiryMeta.active) &&
    state.expiryDisplay->String.length < 7) ||
    (state.expiryDisplay->String.length === 7 && Validation.checkCardExpiry(state.expiryDisplay))

let cvcFieldOk = (state, errors: errors) =>
  errors.cvc->Option.isNone || !state.cvcMeta.touched || state.cvcMeta.active
