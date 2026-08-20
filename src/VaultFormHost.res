
let missingMessage = missing => {
  let names = missing->Array.map(VaultCardController.kindLabel)->Array.join(", ")
  `${names} must be mounted inside <HyperswitchVaultFormProvider> before submit().`
}
let duplicateMessage = (kind, count) =>
  `Only one ${VaultCardController.kindLabel(
      kind,
    )} may be mounted per <HyperswitchVaultFormProvider>; found ${count->Int.toString}.`

let requiredKinds = [
  VaultCardController.CardNumberKind,
  VaultCardController.ExpiryKind,
  VaultCardController.CvcKind,
]

type host = {
  contextValue: VaultWidgetContext.contextValue,
  machinery: VaultFormCoordinator.machinery,
  focusField: [#cardNumber | #expiry | #cvc] => unit,
}

let useHost = (
  ~session: JSON.t,
  ~environment: VaultFormOptions.vaultEnvironment,
  ~appearance: option<VaultFormOptions.appearance>,
  ~localisation: option<VaultFormOptions.localisation>,
  ~disabled: bool,
  ~accessible: option<bool>,
  ~onStateChange: option<VaultFormOptions.cardFormState => unit>,
): host => {
  let sessionState = React.useMemo1(() => session->VaultFormCoordinator.readSession, [session])
  let theme = React.useMemo1(() => appearance->VaultFormOptions.buildTheme, [appearance])
  let labels = React.useMemo1(() => localisation->VaultFormOptions.resolveLabels, [localisation])
  let messages = React.useMemo1(
    () => localisation->VaultFormOptions.resolveMessages,
    [localisation],
  )
  let errorFontSize =
    (12. +.
    appearance
    ->Option.flatMap(a => a.VaultFormOptions.errorTextSizeAdjust)
    ->Option.getOr(0.)) *. theme.fontScale
  let errorSpacing =
    appearance->Option.flatMap(a => a.VaultFormOptions.errorMessageSpacing)->Option.getOr(4.)
  let brandIconMode =
    appearance->Option.flatMap(a => a.VaultFormOptions.brandIconMode)->Option.getOr(#standard)

  let validators: CardStateReducer.validators = {
    cardNumber: VaultFormOptions.makeCardNumberValidator(messages),
    expiry: VaultFormOptions.makeExpiryValidatorWith(messages),
    cvc: VaultFormOptions.makeCvcValidatorWith(messages),
    network: None,
  }

  let controller = VaultCardController.use(~validators)

  let values = controller.values
  let countOf = controller.countOf
  let registryVersion = controller.registryVersion
  React.useEffect(() => {
    let info = PaymentEventData.buildCardInfo(
      ~cardNumber=values.cardNumber,
      ~expiry=values.expiryDisplay,
      ~cvc=values.cvc,
      ~brand=values.brand,
    )
    let numberValid = countOf(VaultCardController.CardNumberKind) == 1 && info.isCardNumberValid
    let expiryValid = countOf(VaultCardController.ExpiryKind) == 1 && info.isExpiryValid
    let cvcValid = countOf(VaultCardController.CvcKind) == 1 && info.isCvcComplete
    onStateChange->Option.forEach(notify =>
      notify({
        complete: numberValid && expiryValid && cvcValid,
        cardNumberValid: numberValid,
        expiryValid,
        cvcValid,
        brand: info.brand->Option.getOr(""),
      })
    )
    None
  }, (values.cardNumber, values.expiryDisplay, values.cvc, values.brand, registryVersion))

  let presenceGate = () => {
    let missing = requiredKinds->Array.filter(kind => countOf(kind) == 0)
    if missing->Array.length > 0 {
      Some(VaultResult.notReadyWithMessage(missingMessage(missing)))
    } else {
      switch requiredKinds->Array.find(kind => countOf(kind) > 1) {
      | Some(kind) => Some(VaultResult.notReadyWithMessage(duplicateMessage(kind, countOf(kind))))
      | None => None
      }
    }
  }

  let machinery = VaultFormCoordinator.useMachinery(
    ~sessionState,
    ~environment,
    ~ready=() => true,
    ~isValid=controller.isValidNow,
    ~cardDetails=controller.cardDetails,
    ~markSubmitAttempted=controller.markSubmitAttempted,
    ~presenceGate,
    ~clearLocal=controller.reset,
  )

  {
    contextValue: {
      controller,
      theme,
      labels,
      errorFontSize,
      errorSpacing,
      brandIconMode,
      accessible,
      editable: !machinery.isSubmitting && !disabled,
      isProcessing: machinery.isSubmitting || disabled,
      onAnalytics: _ => (),
    },
    machinery,
    focusField: controller.focusField,
  }
}
