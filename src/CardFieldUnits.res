/*
 * CardFieldUnits — the per-field building blocks of the card form (ADR-0001, Checkpoint 2).
 *
 * ONE implementation of each field's react-final-form binding, formatting handler, focus
 * transition, backspace navigation, visibility predicate and registration — composed by BOTH
 * form owners:
 *
 *   - `CardFieldCore.use` (the ready-made `HyperswitchVaultForm` and the `/embedded` path via
 *     `CardFormView`) composes all three field hooks in one component;
 *   - the widget components (`CardNumberWidget` / `CardExpiryWidget` / `CardCVCWidget`) each call
 *     exactly one field hook, coordinated through `HyperswitchVaultFormProvider`'s private context.
 *
 * The `coordination` record is the only channel between fields. It carries NO card values: the
 * detected brand (a scheme name, already public in `cardFormState`), form-level clear-by-path
 * writes, and a registry of focus/blur/clear callbacks keyed by a closed widget kind. Field text
 * lives only in react-final-form and in each field's own visible display state (the expiry
 * "MM / YY" string), exactly as the ADR's raw-values boundary requires.
 *
 * The registry tracks mounted instances by unique identity, not a boolean, so it stays correct
 * under React StrictMode effect replay, remounts, and multiple providers on one screen.
 *
 * Deliberately carries no genType annotation: nothing here crosses the package boundary.
 */

open ReactNative
open Validation

/*
 * react-final-form's own form API, for cross-field value writes by field NAME. `Form.formMethods`
 * is the same record shape the render-prop `form` exposes; `change` is what a field's own
 * `input.onChange` ultimately calls, so writing through it is behaviourally identical.
 */
@module("react-final-form")
external useFormMethods: unit => ReactFinalForm.Form.formMethods = "useForm"

/* The closed widget-kind set: the standalone PMS-confirm input contract, nothing else. */
type widgetKind = CardNumberKind | ExpiryKind | CvcKind

let kindLabel = kind =>
  switch kind {
  | CardNumberKind => "CardNumberWidget"
  | ExpiryKind => "CardExpiryWidget"
  | CvcKind => "CardCVCWidget"
  }

/* What a mounted field contributes to the registry. Callbacks only — never values. */
type fieldControls = {
  focusField: unit => unit,
  blurField: unit => unit,
  clearLocal: unit => unit,
}

type registryEntry = {entryKind: widgetKind, controls: fieldControls}

type coordination = {
  /* The detected brand — the network field's current value. A scheme name, never a card value. */
  brand: string,
  setBrand: string => unit,
  /* Clears expiry month/year/CVC values and the visible expiry text (brand-change reset). */
  clearDependents: unit => unit,
  /* Registry: register returns the unregister. Instance identity is internal and unique. */
  register: (widgetKind, fieldControls) => (unit => unit),
  countOf: widgetKind => int,
  focusKind: widgetKind => unit,
  blurKind: widgetKind => unit,
  clearAllLocal: unit => unit,
}

/* Moved verbatim from CardFieldCore (Checkpoint 1), which now re-uses it from here. */
let useOptionalCardField = (fieldPath: option<string>, ~sentinel, ~validate) => {
  let present = fieldPath->Option.isSome
  let path = fieldPath->Option.getOr(sentinel)
  let {input, meta} = ReactFinalForm.useField(path, ~config={validate: ?validate})
  (present, input, meta)
}

type coordinationState = {
  coordination: coordination,
  cardNetworkInput: ReactFinalForm.Field.inputProps,
  cardNetworkMeta: ReactFinalForm.Field.fieldState,
  /* Bumped on every register/unregister, so an owner can recompute aggregate state. */
  registryVersion: int,
}

let useCoordination = (
  ~selection: CardFormTypes.cardFieldSelection,
  ~cardNetworkValidator: option<option<string> => option<string>>,
): coordinationState => {
  let form = useFormMethods()

  let (_hasNetwork, cardNetworkInput, cardNetworkMeta) = useOptionalCardField(
    selection.cardNetworkPath,
    ~sentinel="__card_network_unbound",
    ~validate={selection.cardNetworkPath->Option.isSome ? cardNetworkValidator : None},
  )

  let registryRef: React.ref<Map.t<int, registryEntry>> = React.useRef(Map.make())
  let nextIdRef = React.useRef(0)
  let (registryVersion, setRegistryVersion) = React.useState(() => 0)

  let entriesOf = kind => {
    let matches = []
    registryRef.current->Map.forEach(entry => {
      if entry.entryKind === kind {
        matches->Array.push(entry)->ignore
      }
    })
    matches
  }

  let register = (kind, controls) => {
    nextIdRef.current = nextIdRef.current + 1
    let id = nextIdRef.current
    registryRef.current->Map.set(id, {entryKind: kind, controls})
    setRegistryVersion(version => version + 1)
    () => {
      registryRef.current->Map.delete(id)->ignore
      setRegistryVersion(version => version + 1)
    }
  }

  let countOf = kind => entriesOf(kind)->Array.length
  let focusKind = kind =>
    entriesOf(kind)->Array.get(0)->Option.forEach(entry => entry.controls.focusField())
  let blurKind = kind =>
    entriesOf(kind)->Array.get(0)->Option.forEach(entry => entry.controls.blurField())
  let clearAllLocal = () =>
    registryRef.current->Map.forEach(entry => entry.controls.clearLocal())

  /*
   * The brand-change reset, exactly as the previous in-component handler performed it: clear the
   * expiry month, expiry year and CVC values (by field name — identical state effect to the
   * bindings' own onChange), then the visible expiry text, which lives with the expiry field.
   */
  let clearDependents = () => {
    form.change(selection.cardExpiryMonthPath, "")
    form.change(selection.cardExpiryYearPath, "")
    form.change(selection.cardCvcPath->Option.getOr("__card_cvc_unbound"), "")
    entriesOf(ExpiryKind)->Array.forEach(entry => entry.controls.clearLocal())
  }

  {
    coordination: {
      brand: cardNetworkInput.value->Option.getOr(""),
      setBrand: cardNetworkInput.onChange,
      clearDependents,
      register,
      countOf,
      focusKind,
      blurKind,
      clearAllLocal,
    },
    cardNetworkInput,
    cardNetworkMeta,
    registryVersion,
  }
}

/* ── Card number ──────────────────────────────────────────────────────────── */

type numberField = {
  input: ReactFinalForm.Field.inputProps,
  meta: ReactFinalForm.Field.fieldState,
  fieldRef: React.ref<Nullable.t<TextInput.element>>,
  setText: string => unit,
  onKeyPress: TextInput.KeyPressEvent.t => unit,
  /* The existing border/text-colour predicate for this field, unchanged. */
  fieldOk: bool,
  /* The existing error-visibility predicate for this field, unchanged. */
  visibleError: option<string>,
}

let useCardNumberField = (
  ~path: string,
  ~validator: option<string> => option<string>,
  ~formatter: (option<string>, string) => option<string>,
  ~coord: coordination,
  ~onSchemesDetected: (array<string>, bool) => unit,
): numberField => {
  let {input, meta} = ReactFinalForm.useField(
    path,
    ~config={validate: validator, format: formatter},
  )
  let fieldRef = React.useRef(Nullable.null)

  React.useEffect0(() => {
    let unregister = coord.register(
      CardNumberKind,
      {
        focusField: () =>
          switch fieldRef.current->Nullable.toOption {
          | None => ()
          | Some(node) => node->TextInputElement.focus
          },
        blurField: () =>
          switch fieldRef.current->Nullable.toOption {
          | None => ()
          | Some(node) => node->TextInputElement.blur
          },
        clearLocal: () => (),
      },
    )
    Some(unregister)
  })

  let setText = text => {
    let matchedCardSchemes = text->Validation.clearSpaces->Validation.getAllMatchedCardSchemes

    let isCardCoBadged = matchedCardSchemes->Array.length > 1
    let showCardSchemeDropDown = isCardCoBadged && text->Validation.clearSpaces->String.length >= 16

    let currentCardBrand = matchedCardSchemes->Array.get(0)->Option.getOr("")
    let num = formatCardNumber(text, cardType(currentCardBrand))

    onSchemesDetected(matchedCardSchemes, showCardSchemeDropDown)

    if (
      currentCardBrand !== coord.brand &&
        matchedCardSchemes->Array.find(v => v === currentCardBrand)->Option.isNone
    ) {
      coord.clearDependents()
    }
    if num !== input.value->Option.getOr("") {
      input.onChange(num)
      coord.setBrand(currentCardBrand)
    }

    let isthisValid = cardValid(num, currentCardBrand)
    let shouldShiftFocusToNextField = isCardNumberEqualsMax(num, currentCardBrand)

    if isthisValid && shouldShiftFocusToNextField {
      coord.focusKind(ExpiryKind)
    }
  }

  let onKeyPress = (ev: TextInput.KeyPressEvent.t) =>
    if ev.nativeEvent.key == "Backspace" && input.value->Option.getOr("") == "" {
      switch fieldRef.current->Nullable.toOption {
      | None => ()
      | Some(node) => node->TextInputElement.blur
      }
    }

  {
    input,
    meta,
    fieldRef,
    setText,
    onKeyPress,
    fieldOk: meta.error->Option.isNone || !meta.touched || meta.active,
    visibleError: switch (meta.error, meta.touched) {
    | (Some(error), true) => Some(error)
    | _ => None
    },
  }
}

/* ── Expiry ───────────────────────────────────────────────────────────────── */

type expiryField = {
  monthInput: ReactFinalForm.Field.inputProps,
  yearInput: ReactFinalForm.Field.inputProps,
  yearMeta: ReactFinalForm.Field.fieldState,
  /* The visible "MM / YY" text. Lives here — with the field — never in a context. */
  expireDate: string,
  setDisplay: string => unit,
  fieldRef: React.ref<Nullable.t<TextInput.element>>,
  setText: string => unit,
  onKeyPress: TextInput.KeyPressEvent.t => unit,
  fieldOk: bool,
  visibleError: option<string>,
}

let useCardExpiryField = (
  ~monthPath: string,
  ~yearPath: string,
  ~makeExpiryValidator: string => option<string> => option<string>,
  ~coord: coordination,
): expiryField => {
  let (expireDate, setExpireDate) = React.useState(() => "")

  let {input: monthInput, meta: _monthMeta} = ReactFinalForm.useField(
    monthPath,
    ~config={validate: makeExpiryValidator(expireDate)},
  )
  let {input: yearInput, meta: yearMeta} = ReactFinalForm.useField(
    yearPath,
    ~config={validate: makeExpiryValidator(expireDate)},
  )
  let fieldRef = React.useRef(Nullable.null)

  React.useEffect0(() => {
    let unregister = coord.register(
      ExpiryKind,
      {
        focusField: () =>
          switch fieldRef.current->Nullable.toOption {
          | None => ()
          | Some(node) => node->TextInputElement.focus
          },
        blurField: () =>
          switch fieldRef.current->Nullable.toOption {
          | None => ()
          | Some(node) => node->TextInputElement.blur
          },
        clearLocal: () => setExpireDate(_ => ""),
      },
    )
    Some(unregister)
  })

  let setText = text => {
    let dateExpire = formatCardExpiryNumber(text)

    let (month, year) = dateExpire->splitExpiryDates

    monthInput.onChange(month)
    yearInput.onChange(year)
    setExpireDate(_ => dateExpire)

    let isthisValid = checkCardExpiry(dateExpire)
    if isthisValid {
      coord.focusKind(CvcKind)
    }
  }

  let onKeyPress = (ev: TextInput.KeyPressEvent.t) =>
    if ev.nativeEvent.key == "Backspace" && expireDate == "" {
      coord.focusKind(CardNumberKind)
    }

  {
    monthInput,
    yearInput,
    yearMeta,
    expireDate,
    setDisplay: display => setExpireDate(_ => display),
    fieldRef,
    setText,
    onKeyPress,
    fieldOk: ((yearMeta.error->Option.isNone || !yearMeta.touched || yearMeta.active) &&
      expireDate->String.length < 7) ||
      (expireDate->String.length === 7 && checkCardExpiry(expireDate)),
    visibleError: switch (
      yearMeta.error,
      (expireDate->String.length > 0 || !yearMeta.touched) &&
        (expireDate->String.length < 7 || checkCardExpiry(expireDate)),
    ) {
    | (Some(error), false) => Some(error)
    | _ => None
    },
  }
}

/* ── CVC ──────────────────────────────────────────────────────────────────── */

type cvcField = {
  hasCvc: bool,
  input: ReactFinalForm.Field.inputProps,
  meta: ReactFinalForm.Field.fieldState,
  fieldRef: React.ref<Nullable.t<TextInput.element>>,
  setText: string => unit,
  onKeyPress: TextInput.KeyPressEvent.t => unit,
  fieldOk: bool,
  visibleError: option<string>,
}

let useCardCvcField = (
  ~cvcPath: option<string>,
  ~makeCvcValidator: string => option<string> => option<string>,
  ~coord: coordination,
): cvcField => {
  let (hasCvc, input, meta) = useOptionalCardField(
    cvcPath,
    ~sentinel="__card_cvc_unbound",
    ~validate={cvcPath->Option.isSome ? Some(makeCvcValidator(coord.brand)) : None},
  )
  let fieldRef = React.useRef(Nullable.null)
  /*
   * The blur-on-complete target. The pre-extraction view passed its `nullRef` here, so the blur
   * has always been a no-op — a documented suspected defect, preserved until decided, not fixed.
   */
  let deadRef: React.ref<Nullable.t<TextInput.element>> = React.useRef(Nullable.null)

  React.useEffect0(() => {
    let unregister = coord.register(
      CvcKind,
      {
        focusField: () =>
          switch fieldRef.current->Nullable.toOption {
          | None => ()
          | Some(node) => node->TextInputElement.focus
          },
        blurField: () =>
          switch fieldRef.current->Nullable.toOption {
          | None => ()
          | Some(node) => node->TextInputElement.blur
          },
        clearLocal: () => (),
      },
    )
    Some(unregister)
  })

  let setText = text => {
    let cvvData = formatCVCNumber(text, coord.brand)

    input.onChange(cvvData)

    let isValidCvv = checkCardCVC(cvvData, coord.brand)
    let shouldShiftFocusToNextField = checkMaxCardCvv(cvvData, coord.brand)
    if isValidCvv && shouldShiftFocusToNextField {
      switch deadRef.current->Nullable.toOption {
      | None => ()
      | Some(node) => node->TextInputElement.blur
      }
    }
  }

  let onKeyPress = (ev: TextInput.KeyPressEvent.t) =>
    if ev.nativeEvent.key == "Backspace" && input.value->Option.getOr("") == "" {
      coord.focusKind(ExpiryKind)
    }

  {
    hasCvc,
    input,
    meta,
    fieldRef,
    setText,
    onKeyPress,
    fieldOk: meta.error->Option.isNone || !meta.touched || meta.active,
    visibleError: switch (meta.error, meta.touched, meta.active) {
    | (Some(error), true, false) => Some(error)
    | _ => None
    },
  }
}
