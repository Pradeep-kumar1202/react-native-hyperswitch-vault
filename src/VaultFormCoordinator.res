
type sessionState =
  | Ready(string)

  | Unusable(string)

let readSession = (session: JSON.t): sessionState => {
  let vaultDetails =
    session
    ->JSON.Decode.object
    ->Option.flatMap(root => root->Dict.get("vault_details"))
    ->Option.flatMap(JSON.Decode.object)

  switch vaultDetails {
  | None => Unusable("This session does not support saving a card.")
  | Some(details) =>
    let vaultType =
      details
      ->Dict.get("vault_type")
      ->Option.flatMap(JSON.Decode.string)
      ->Option.getOr("")
      ->String.trim
      ->String.toLowerCase

    let authorization =
      details
      ->Dict.get("vault_data")
      ->Option.flatMap(JSON.Decode.object)
      ->Option.flatMap(vaultData => vaultData->Dict.get("sdk_authorization"))
      ->Option.flatMap(JSON.Decode.string)
      ->Option.getOr("")

    switch vaultType {
    | "hyperswitch" =>
      authorization->String.trim->String.length > 0
        ? Ready(authorization)
        : Unusable("This session is missing its vault details.")
    | _ => Unusable("This session uses a card vault this component does not support.")
    }
  }
}

let fieldSpecs: array<CardFormTypes.cardFieldSpec> = [
  {renderType: "CardNumber", writePath: "payment_method_data.card.card_number"},
  {renderType: "CardExpiryMonth", writePath: "payment_method_data.card.card_exp_month"},
  {renderType: "CardExpiryYear", writePath: "payment_method_data.card.card_exp_year"},
  {renderType: "Cvc", writePath: "payment_method_data.card.card_cvc"},
]

let readCardField = (values: Dict.t<JSON.t>, key) =>
  values
  ->Dict.get("payment_method_data")
  ->Option.flatMap(JSON.Decode.object)
  ->Option.flatMap(paymentMethodData => paymentMethodData->Dict.get("card"))
  ->Option.flatMap(JSON.Decode.object)
  ->Option.flatMap(card => card->Dict.get(key))
  ->Option.flatMap(JSON.Decode.string)
  ->Option.getOr("")

let environmentKey = (environment: VaultConfirm.vaultEnvironment) =>
  switch environment {
  | #production => "production"
  | #sandbox => "sandbox"
  | #integration => "integration"
  }

type machinery = {
  submit: unit => promise<VaultResult.vaultSubmitResult>,
  reset: unit => unit,
  isSubmitting: bool,
}

let useMachinery = (
  ~sessionState: sessionState,
  ~environment: VaultConfirm.vaultEnvironment,

  ~ready: unit => bool,

  ~isValid: unit => bool,

  ~cardDetails: unit => VaultConfirm.cardDetails,

  ~markSubmitAttempted: unit => unit,
  ~presenceGate: unit => option<VaultResult.vaultSubmitResult>,
  ~clearLocal: unit => unit,
): machinery => {
  let latestRef = React.useRef((sessionState, environment))
  latestRef.current = (sessionState, environment)

  let (isSubmitting, setIsSubmitting) = React.useState(_ => false)

  let inFlightRef: React.ref<option<promise<VaultResult.vaultSubmitResult>>> = React.useRef(None)

  let abortRef: React.ref<option<(string, VaultConfirm.abortController)>> = React.useRef(None)
  let isMountedRef = React.useRef(true)

  let generationRef = React.useRef(0)

  let abortInFlight = () => {
    abortRef.current->Option.forEach(((_, controller)) => controller->VaultConfirm.abort)
    abortRef.current = None
  }

  React.useEffect0(() => {
    isMountedRef.current = true
    Some(
      () => {
        isMountedRef.current = false
        generationRef.current = generationRef.current + 1
        inFlightRef.current = None
        abortInFlight()
      },
    )
  })

  let sessionKey = switch sessionState {
  | Ready(authorization) => authorization
  | Unusable(_) => ""
  }
  let requestKey = `${sessionKey}|${environment->environmentKey}`
  React.useEffect1(() => {
    switch abortRef.current {
    | Some((key, _)) if key !== requestKey =>
      generationRef.current = generationRef.current + 1
      inFlightRef.current = None
      abortInFlight()
      if isMountedRef.current {
        setIsSubmitting(_ => false)
      }
    | _ => ()
    }
    None
  }, [requestKey])

  let runSubmit = async () => {
    let (sessionState, environment) = latestRef.current
    switch sessionState {
    | Unusable(message) => VaultResult.invalidSession(message)
    | Ready(sdkAuthorization) =>

      switch presenceGate() {
      | Some(blocked) => blocked
      | None =>
      if !ready() {
        VaultResult.notReady()
      } else if !isValid() {
        markSubmitAttempted()
        VaultResult.invalidCardData()
      } else {
        let card = cardDetails()
        let controller = VaultConfirm.makeAbortController()

          abortRef.current = Some((`${sdkAuthorization}|${environment->environmentKey}`, controller))

          let outcome = await VaultConfirm.confirmPaymentMethodSession({
            sdkAuthorization,
            environment,
            card,
            signal: controller->VaultConfirm.controllerSignal,
          })

          switch abortRef.current {
          | Some((_, current)) if current === controller => abortRef.current = None
          | _ => ()
          }
          outcome->VaultResult.fromConfirmOutcome
      }
      }
    }
  }

  let submit = () =>
    switch inFlightRef.current {
    | Some(pending) => pending
    | None =>
      let generation = generationRef.current
      setIsSubmitting(_ => true)
      let pending =
        runSubmit()->Promise.then(result => {
          if generationRef.current === generation {
            inFlightRef.current = None
            if isMountedRef.current {
              setIsSubmitting(_ => false)
            }
          }
          Promise.resolve(result)
        })
      inFlightRef.current = Some(pending)
      pending
    }

  let reset = () =>
    switch inFlightRef.current {
    | Some(_) => ()
    | None =>
      clearLocal()
    }

  {submit, reset, isSubmitting}
}
