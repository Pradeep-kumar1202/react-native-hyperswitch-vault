
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
  focusField: [#cardNumber | #expiry | #cvc | #cardholderName] => unit,
}

let useHost = (
  ~session: option<JSON.t>,
  ~environment: VaultFormOptions.vaultEnvironment,
  ~appearance: option<VaultFormOptions.appearance>,
  ~localisation: option<VaultFormOptions.localisation>,
  ~disabled: bool,
  ~accessible: option<bool>,
  ~enabledCardSchemes: array<string>,
  ~eligibility: option<VaultFormOptions.eligibilityConfig>,
  /* Where `tokenize()` posts the payment-method-session confirm. Absent means the environment host. */
  ~vaultEndpoint: option<VaultEndpoint.vaultEndpointConfig>,
  /*
   * Which arrangement the cardholder name is in. The VIEW uses it to decide whether to render a
   * field; the COORDINATOR uses it to decide whose value goes on the wire and whether a supplied
   * one is even allowed. One prop, read in both places, so the two cannot disagree.
   */
  ~cardholderNameMode: CardFieldOptions.cardholderNameMode,
): host => {
  /*
   * The component's session backs `tokenize()` ONLY. A confirmation reads its session from
   * `cardSource`, so a form mounted with no session at all is a valid Flow 3 form — which is
   * exactly how client-core mounts it when the merchant profile says Skip.
   */
  let sessionState = React.useMemo1(
    () =>
      switch session {
      | Some(session) => session->VaultFormCoordinator.readSession
      | None => VaultFormCoordinator.Unusable("No card-vault session was supplied.")
      },
    [session],
  )
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
    appearance
    ->Option.flatMap(a => a.VaultFormOptions.brandIconMode)
    /*
     * `#hidden`, not `#standard`. The zero-configuration form renders no artwork; a merchant who
     * wants one asks for it, either form-wide here or per field.
     */
    ->Option.getOr(#hidden)

  let validators: CardStateReducer.validators = {
    cardNumber: VaultFormOptions.makeCardNumberValidator(messages),
    expiry: VaultFormOptions.makeExpiryValidatorWith(messages),
    cvc: VaultFormOptions.makeCvcValidatorWith(messages),
    network: VaultFormOptions.makeNetworkValidator(~enabledCardSchemes, messages),
    notEligible: Some(messages.cardNotEligible),
  }

  let controller = VaultCardController.use(~validators, ~enabledCardSchemes)

  let countOf = controller.countOf

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

  /*
   * ── THE LIVE ELIGIBILITY PROBE ───────────────────────────────────────────────
   *
   * Fires as the number completes, so the "card not accepted" message appears while the customer is
   * still looking at the field — the behaviour the classic form had, reproduced here because only
   * the library holds a PAN to ask about now.
   *
   * A verdict is recorded only if the number has not changed since the request went out. Without
   * that check, typing on while a request is in flight would attach the previous card's answer to
   * the current one — and an answer of `deny` would then block a card the backend never refused.
   */
  let probeGenerationRef = React.useRef(0)
  let probeMountedRef = React.useRef(true)
  React.useEffect0(() => {
    probeMountedRef.current = true
    Some(
      () => {
        probeMountedRef.current = false
        probeGenerationRef.current = probeGenerationRef.current + 1
      },
    )
  })

  let probeKey = `${controller.values.cardNumber}|${controller.values.brand}`
  React.useEffect2(() => {
    switch eligibility {
    | None => ()
    | Some(config) =>
      switch controller.eligibilityProbe() {
      | #idle => ()
      /* Not enough of a number to ask about: clear any denial left from a previous one. */
      | #reset => controller.recordEligibility(VaultEligibility.Allowed)
      | #check(digits) =>
        switch config.endpoint->VaultEndpoint.resolveBaseUrl(~environment) {
        /* A base URL we would refuse to send a credential to is not probed either. */
        | Error() => ()
        | Ok(baseUrl) =>
          probeGenerationRef.current = probeGenerationRef.current + 1
          let generation = probeGenerationRef.current
          controller.markEligibilityPending()
          VaultEligibility.check({
            baseUrl,
            paymentId: config.paymentId,
            sdkAuthorization: config.sdkAuthorization,
            appId: config.appId,
            cardNumber: digits,
          })
          ->Promise.then(verdict => {
            if probeMountedRef.current && probeGenerationRef.current === generation {
              controller.recordEligibility(verdict)
            }
            Promise.resolve()
          })
          ->ignore
        }
      }
    }
    None
  }, (probeKey, eligibility))

  let machinery = VaultFormCoordinator.useMachinery(
    ~sessionState,
    ~environment,
    ~isValid=controller.isValidNow,
    ~cardDetails=controller.cardDetails,
    ~cardholderName=controller.cardholderName,
    ~cardholderNameMode,
    ~vaultEndpoint,
    ~cardNetwork=controller.cardNetwork,
    ~cardVersion=controller.cardVersion,
    ~eligibilityVerdict=controller.eligibilityVerdict,
    ~recordEligibility=controller.recordEligibility,
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
