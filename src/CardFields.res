open ReactNative

type common = {
  theme: CardFormTypes.cardTheme,
  isProcessing: bool,
  editable: bool,
  accessible: option<bool>,
}

let inputColors = (~theme: CardFormTypes.cardTheme, ~error: option<string>, ~isValid) => {
  let ok = isValid->Option.getOr(error->Option.isNone)
  (ok, ok ? theme.textColor : theme.dangerColor)
}

module ErrorSlot = {
  @react.component
  let make = (~error: option<string>, ~renderError: option<string => React.element>) =>
    switch (error, renderError) {
    | (Some(message), Some(render)) => render(message)
    | _ => React.null
    }
}

module Number = {
  @react.component
  let make = (
    ~value: string,
    ~onChange: CardFieldLogic.numberChange => unit,
    ~currentBrand: string="",
    ~onFocus: unit => unit=() => (),
    ~onBlur: unit => unit=() => (),
    ~onBackspace: CardFieldLogic.backspaceAction => unit=_ => (),
    ~error: option<string>=?,
    ~isValid: bool=?,
    ~renderError: option<string => React.element>=?,
    ~label: string,
    ~floatingLabel: string,
    ~common: common,
    ~onAnalytics: CardFormTypes.analyticsEvent => unit=_ => (),
    ~iconRight: CardInput.iconType=CardInput.NoIcon,
    ~reference: option<React.ref<Nullable.t<TextInput.element>>>=?,
    ~borderBottomWidth: option<float>=?,
    ~borderBottomLeftRadius: option<float>=?,
    ~borderBottomRightRadius: option<float>=?,
  ) => {
    let (isValid, textColor) = inputColors(~theme=common.theme, ~error, ~isValid)
    <View>
      <CardInput
        theme=common.theme
        isProcessing=common.isProcessing
        editable=common.editable
        onAnalytics
        fieldId=CardFormTypes.CardNumberField
        name={CardTestIds.cardNumberInputTestId}
        reference
        state=value
        setState={text => onChange(CardFieldLogic.onCardNumberText(text, ~currentBrand))}
        placeholder=label
        keyboardType=#"number-pad"
        isValid
        maxLength=Some(23)
        ?borderBottomWidth
        ?borderBottomLeftRadius
        ?borderBottomRightRadius
        textColor
        iconRight
        onFocus
        onBlur
        onKeyPress={(ev: TextInput.KeyPressEvent.t) =>
          if ev.nativeEvent.key == "Backspace" {
            onBackspace(CardFieldLogic.onCardNumberBackspace(~value))
          }}
        animateLabel=floatingLabel
        accessible=?common.accessible
      />
      <ErrorSlot error={error} renderError={renderError} />
    </View>
  }
}

module Expiry = {
  @react.component
  let make = (
    ~value: string,
    ~onChange: CardFieldLogic.expiryChange => unit,
    ~onFocus: unit => unit=() => (),
    ~onBlur: unit => unit=() => (),
    ~onBackspace: CardFieldLogic.backspaceAction => unit=_ => (),
    ~error: option<string>=?,
    ~isValid: bool=?,
    ~renderError: option<string => React.element>=?,
    ~label: string,
    ~floatingLabel: string,
    ~common: common,
    ~onAnalytics: CardFormTypes.analyticsEvent => unit=_ => (),
    ~reference: option<React.ref<Nullable.t<TextInput.element>>>=?,
    ~borderTopWidth: option<float>=?,
    ~borderRightWidth: option<float>=?,
    ~borderTopLeftRadius: option<float>=?,
    ~borderTopRightRadius: option<float>=?,
    ~borderBottomRightRadius: option<float>=?,
  ) => {
    let (isValid, textColor) = inputColors(~theme=common.theme, ~error, ~isValid)
    <View>
      <CardInput
        theme=common.theme
        isProcessing=common.isProcessing
        editable=common.editable
        onAnalytics
        fieldId=CardFormTypes.ExpiryField
        name={CardTestIds.expiryInputTestId}
        reference
        state=value
        setState={text => onChange(CardFieldLogic.onExpiryText(text))}
        placeholder=label
        keyboardType=#"number-pad"
        isValid
        maxLength=Some(7)
        ?borderTopWidth
        ?borderRightWidth
        ?borderTopLeftRadius
        ?borderTopRightRadius
        ?borderBottomRightRadius
        textColor
        onFocus
        onBlur
        onKeyPress={(ev: TextInput.KeyPressEvent.t) =>
          if ev.nativeEvent.key == "Backspace" {
            onBackspace(CardFieldLogic.onExpiryBackspace(~display=value))
          }}
        animateLabel=floatingLabel
        accessible=?common.accessible
      />
      <ErrorSlot error={error} renderError={renderError} />
    </View>
  }
}

module Cvc = {
  @react.component
  let make = (
    ~value: string,
    ~onChange: CardFieldLogic.cvcChange => unit,
    ~brand: string="",
    ~onFocus: unit => unit=() => (),
    ~onBlur: unit => unit=() => (),
    ~onBackspace: CardFieldLogic.backspaceAction => unit=_ => (),
    ~error: option<string>=?,
    ~isValid: bool=?,
    ~renderError: option<string => React.element>=?,
    ~label: string,
    ~floatingLabel: string,
    ~common: common,
    ~onAnalytics: CardFormTypes.analyticsEvent => unit=_ => (),
    ~iconRight: CardInput.iconType=CardInput.NoIcon,
    ~reference: option<React.ref<Nullable.t<TextInput.element>>>=?,
    ~borderTopWidth: option<float>=?,
    ~borderLeftWidth: option<float>=?,
    ~borderTopLeftRadius: option<float>=?,
    ~borderTopRightRadius: option<float>=?,
    ~borderBottomLeftRadius: option<float>=?,
    ~borderBottomRightRadius: option<float>=?,
    ~borderBottomWidth: option<float>=?,
    ~borderRightWidth: option<float>=?,
  ) => {
    let (isValid, textColor) = inputColors(~theme=common.theme, ~error, ~isValid)
    <View>
      <CardInput
        theme=common.theme
        isProcessing=common.isProcessing
        editable=common.editable
        onAnalytics
        fieldId=CardFormTypes.CvcField
        name={CardTestIds.cvcInputTestId}
        reference
        secureTextEntry=true
        state=value
        setState={text => onChange(CardFieldLogic.onCvcText(text, ~brand))}
        placeholder=label
        keyboardType=#"number-pad"
        isValid
        maxLength=Some(4)
        ?borderTopWidth
        ?borderLeftWidth
        ?borderTopLeftRadius
        ?borderTopRightRadius
        ?borderBottomLeftRadius
        ?borderBottomRightRadius
        ?borderBottomWidth
        ?borderRightWidth
        textColor
        iconRight
        onFocus
        onBlur
        onKeyPress={(ev: TextInput.KeyPressEvent.t) =>
          if ev.nativeEvent.key == "Backspace" {
            onBackspace(CardFieldLogic.onCvcBackspace(~value))
          }}
        animateLabel=floatingLabel
        accessible=?common.accessible
      />
      <ErrorSlot error={error} renderError={renderError} />
    </View>
  }
}
