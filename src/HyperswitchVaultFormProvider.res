/*
 * HyperswitchVaultFormProvider — the custom-layout coordinator (ADR-0001, Checkpoint 2).
 *
 * The merchant supplies the layout as children built from CardNumberWidget / CardExpiryWidget /
 * CardCVCWidget, placed anywhere under this provider — nested Views and fragments included. The
 * provider owns exactly one react-final-form <Form>, the same session parsing, validators and
 * submission machinery as the ready-made HyperswitchVaultForm (VaultFormCoordinator — ONE
 * implementation), and the same ref handle: submit() / reset() / focus(field).
 *
 * What it adds over the ready-made form is the mounted-widget registry. Exactly one instance of
 * every required widget (the closed PMS-confirm input contract: number, expiry, CVC) must be
 * mounted before submit() reads a value or builds a transport call. Missing or duplicated widgets
 * produce a `not_ready` result whose safe message names the widget — zero network requests, and
 * nothing is written to any console. submit() never throws; the only throw in this surface is
 * rendering a widget outside its provider.
 *
 * The aggregate onStateChange incorporates the registry: a field's public validity is forced false
 * unless exactly one instance of its widget is mounted, so a react-final-form value retained after
 * a widget unmounts can never present as valid — and `complete` requires exactly one of each plus
 * all three validities. Mount and unmount recompute and emit immediately.
 *
 * There is deliberately NO splitCardFields here (layout belongs to the merchant), no co-badge
 * state, no scan-card, and no per-widget style or event props in this phase.
 */

open Validation

@genType
type widgetHandle = {
  focus: unit => unit,
  blur: unit => unit,
}

/* Fixed, safe, actionable presence messages — assembled from widget names and counts only. */
let missingMessage = missing => {
  let names = missing->Array.map(CardFieldUnits.kindLabel)->Array.join(", ")
  `${names} must be mounted inside <HyperswitchVaultFormProvider> before submit().`
}
let duplicateMessage = (kind, count) =>
  `Only one ${CardFieldUnits.kindLabel(
      kind,
    )} may be mounted per <HyperswitchVaultFormProvider>; found ${count->Int.toString}.`

let requiredKinds = [
  CardFieldUnits.CardNumberKind,
  CardFieldUnits.ExpiryKind,
  CardFieldUnits.CvcKind,
]

/*
 * The body carries every hook that needs the react-final-form context, so the Form render callback
 * itself runs no hooks. Rendered only when the (constant) selection resolves — same gating as the
 * ready-made form.
 */
module Body = {
  @react.component
  let make = (
    ~formProps: ReactFinalForm.Form.formProps,
    ~selection: CardFormTypes.cardFieldSelection,
    ~machinery: VaultFormCoordinator.machinery,
    ~validateCardNumber,
    ~makeExpiryValidator,
    ~makeCvcValidator,
    ~theme: CardFormTypes.cardTheme,
    ~labels: CardFormTypes.cardLabels,
    ~errorFontSize: float,
    ~errorSpacing: float,
    ~brandIconMode: CardIcons.brandIconMode,
    ~accessible: option<bool>,
    ~editable: bool,
    ~isProcessing: bool,
    ~onStateChange: option<HyperswitchVaultForm.cardFormState => unit>,
    ~coordRef: React.ref<option<CardFieldUnits.coordination>>,
    ~children: React.element,
  ) => {
    let coordinationState = CardFieldUnits.useCoordination(
      ~selection,
      ~cardNetworkValidator=None,
    )
    let coord = coordinationState.coordination
    /* Read by the imperative handle and the presence gate; always the current render's registry. */
    coordRef.current = Some(coord)

    /*
     * Safe per-field validity. Computed transiently from the form values with the SAME function
     * the ready-made form's aggregate uses (PaymentEventData.buildCardInfo) — only the three
     * booleans are retained; no card value is stored outside react-final-form.
     */
    let (validity, setValidity) = React.useState(() => (false, false, false))

    ReactFinalForm.useFormStateHandler(
      ~onFormChange=values => {
        machinery.valuesRef.current = values
        let cardNumber = VaultFormCoordinator.readCardField(values, "card_number")
        let month = VaultFormCoordinator.readCardField(values, "card_exp_month")
        let year = VaultFormCoordinator.readCardField(values, "card_exp_year")
        let cvc = VaultFormCoordinator.readCardField(values, "card_cvc")
        /* The visible-display reconstruction is boolean-equivalent: checkCardExpiry accepts only
           a complete "MM / YY", where the reconstruction is exact. */
        let expiry = month == "" && year == "" ? "" : `${month} / ${year}`
        let info = PaymentEventData.buildCardInfo(~cardNumber, ~expiry, ~cvc, ~brand=coord.brand)
        let next = (info.isCardNumberValid, info.isExpiryValid, info.isCvcComplete)
        setValidity(previous => previous == next ? previous : next)
      },
      ~onValidationChange=valid => machinery.isValidRef.current = valid,
      ~formProps,
    )

    React.useEffect0(() => {
      machinery.formMethodsRef.current = Some(formProps.form)
      Some(() => machinery.formMethodsRef.current = None)
    })

    let (numberValid, expiryValid, cvcValid) = validity
    let numberCount = coord.countOf(CardFieldUnits.CardNumberKind)
    let expiryCount = coord.countOf(CardFieldUnits.ExpiryKind)
    let cvcCount = coord.countOf(CardFieldUnits.CvcKind)
    let brand = coord.brand

    /*
     * The aggregate contract (ADR-0001): a field's public validity requires exactly one mounted
     * instance of its widget; `complete` requires that for all three plus all three validities.
     * Registry changes bump registryVersion, so mount/unmount/duplicate changes emit immediately,
     * and a retained react-final-form value can never make an unmounted field valid publicly.
     */
    React.useEffect(() => {
      let cardNumberValidPublic = numberCount == 1 && numberValid
      let expiryValidPublic = expiryCount == 1 && expiryValid
      let cvcValidPublic = cvcCount == 1 && cvcValid
      let complete = cardNumberValidPublic && expiryValidPublic && cvcValidPublic
      onStateChange->Option.forEach(notify =>
        notify({
          complete,
          cardNumberValid: cardNumberValidPublic,
          expiryValid: expiryValidPublic,
          cvcValid: cvcValidPublic,
          brand,
        })
      )
      None
    }, (numberValid, expiryValid, cvcValid, coordinationState.registryVersion, brand))

    let contextValue: VaultWidgetContext.contextValue = {
      coordination: coord,
      selection,
      theme,
      labels,
      validateCardNumber,
      cardNumberFormatter: Validation.formatValue(Validation.CardNumber),
      makeExpiryValidator,
      makeCvcValidator,
      errorFontSize,
      errorSpacing,
      brandIconMode,
      accessible,
      editable,
      isProcessing,
      onAnalytics: _ => (),
    }

    <VaultWidgetContext.ContextProvider value={Some(contextValue)}>
      {children}
    </VaultWidgetContext.ContextProvider>
  }
}

@genType
let make = React.forwardRef((
  props: {
    "session": HyperswitchVaultForm.vaultSession,
    "environment": HyperswitchVaultForm.vaultEnvironment,
    "appearance": option<HyperswitchVaultForm.appearance>,
    "localisation": option<HyperswitchVaultForm.localisation>,
    "disabled": option<bool>,
    "accessible": option<bool>,
    "onStateChange": option<HyperswitchVaultForm.cardFormState => unit>,
    "children": React.element,
  },
  ref,
) => {
  let session = props["session"]->HyperswitchVaultForm.sessionToJson
  let environment = props["environment"]
  let appearance = props["appearance"]
  let disabled = props["disabled"]->Option.getOr(false)
  let localisation = props["localisation"]
  let accessible = props["accessible"]
  let onStateChange = props["onStateChange"]

  let sessionState = React.useMemo1(
    () => session->VaultFormCoordinator.readSession,
    [session],
  )
  let theme = React.useMemo1(() => appearance->HyperswitchVaultForm.buildTheme, [appearance])
  let labels = React.useMemo1(() => localisation->HyperswitchVaultForm.resolveLabels, [
    localisation,
  ])
  let messages = React.useMemo1(() => localisation->HyperswitchVaultForm.resolveMessages, [
    localisation,
  ])
  let errorFontSize =
    (12. +.
    appearance
    ->Option.flatMap(a => a.HyperswitchVaultForm.errorTextSizeAdjust)
    ->Option.getOr(0.)) *. theme.fontScale
  let errorSpacing =
    appearance->Option.flatMap(a => a.HyperswitchVaultForm.errorMessageSpacing)->Option.getOr(4.)
  let brandIconMode =
    appearance->Option.flatMap(a => a.HyperswitchVaultForm.brandIconMode)->Option.getOr(#standard)

  /* Fresh closures per render — unchanged: that is what makes react-final-form re-validate. */
  let validateCardNumber = HyperswitchVaultForm.makeCardNumberValidator(messages)
  let validateExpiry = HyperswitchVaultForm.makeExpiryValidatorWith(messages)
  let validateCvc = HyperswitchVaultForm.makeCvcValidatorWith(messages)

  let selection = React.useMemo0(() =>
    VaultFormCoordinator.fieldSpecs->CardFormTypes.selectCardFields
  )

  let coordRef: React.ref<option<CardFieldUnits.coordination>> = React.useRef(None)

  /*
   * The presence gate: exactly one mounted instance of every required widget, checked BEFORE any
   * value is read or any transport call is built. Missing and duplicated widgets are both
   * `not_ready` — safe to fix and call again — with zero network requests and nothing logged.
   */
  let presenceGate = () =>
    switch coordRef.current {
    | None => Some(VaultResult.notReadyWithMessage(missingMessage(requiredKinds)))
    | Some(coord) =>
      let missing = requiredKinds->Array.filter(kind => coord.countOf(kind) == 0)
      if missing->Array.length > 0 {
        Some(VaultResult.notReadyWithMessage(missingMessage(missing)))
      } else {
        switch requiredKinds->Array.find(kind => coord.countOf(kind) > 1) {
        | Some(kind) =>
          Some(VaultResult.notReadyWithMessage(duplicateMessage(kind, coord.countOf(kind))))
        | None => None
        }
      }
    }

  let machinery = VaultFormCoordinator.useMachinery(
    ~sessionState,
    ~environment,
    ~selection,
    ~presenceGate,
    ~clearLocal=() => coordRef.current->Option.forEach(coord => coord.clearAllLocal()),
  )

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultForm.submit: machinery.submit,
    reset: machinery.reset,
    focus: field =>
      coordRef.current->Option.forEach(coord =>
        coord.focusKind(
          switch field {
          | #cardNumber => CardFieldUnits.CardNumberKind
          | #expiry => CardFieldUnits.ExpiryKind
          | #cvc => CardFieldUnits.CvcKind
          },
        )
      ),
  })

  <ReactFinalForm.Form
    onSubmit={_ => ()}
    render={formProps =>
      switch selection {
      | None => React.null
      | Some(selection) =>
        <Body
          formProps
          selection
          machinery
          validateCardNumber
          makeExpiryValidator=validateExpiry
          makeCvcValidator=validateCvc
          theme
          labels
          errorFontSize
          errorSpacing
          brandIconMode
          accessible
          editable={!machinery.isSubmitting && !disabled}
          isProcessing={machinery.isSubmitting || disabled}
          onStateChange
          coordRef>
          {props["children"]}
        </Body>
      }}
  />
})
