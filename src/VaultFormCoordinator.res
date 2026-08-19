/*
 * VaultFormCoordinator — the ONE private form coordinator (ADR-0001).
 *
 * Session parsing, the standalone field specs, and the whole submission machinery — the in-flight
 * shared promise, the tagged abort slot, the generation counter, the session/environment
 * supersession effect, and the guarded reset — extracted VERBATIM from HyperswitchVaultForm so
 * that the ready-made form and HyperswitchVaultFormProvider run the SAME lifecycle. Neither
 * component re-implements any of it.
 *
 * The only addition over the pre-extraction code is `presenceGate`: a caller-supplied check that
 * runs at the top of the Ready branch, BEFORE any form value is read and BEFORE any transport call
 * is built. The ready-made form passes a gate that always passes; the provider passes the
 * mounted-widget registry check. `clearLocal` parameterises what reset() clears beyond
 * react-final-form state (the form's registered controls, or the provider's registered widgets).
 *
 * Deliberately carries no genType annotation: nothing here crosses the package boundary.
 */

/* ── Session parsing ──────────────────────────────────────────────────────── */

/*
 * Reads only `vault_details.vault_type` and `vault_details.vault_data.sdk_authorization` from the
 * merchant's session response, ignoring every other field so an unrelated payload change cannot
 * break the form.
 */
type sessionState =
  | Ready(string)
  /* Carries only the safe message; the code is always `invalid_session`. */
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



/* Standalone owns the form, so it also owns the field names. */
let fieldSpecs: array<CardFormTypes.cardFieldSpec> = [
  {renderType: "CardNumber", writePath: "payment_method_data.card.card_number"},
  {renderType: "CardExpiryMonth", writePath: "payment_method_data.card.card_exp_month"},
  {renderType: "CardExpiryYear", writePath: "payment_method_data.card.card_exp_year"},
  {renderType: "Cvc", writePath: "payment_method_data.card.card_cvc"},
]

/* Reads a nested value written by a dotted react-final-form field name. */
let readCardField = (values: Dict.t<JSON.t>, key) =>
  values
  ->Dict.get("payment_method_data")
  ->Option.flatMap(JSON.Decode.object)
  ->Option.flatMap(paymentMethodData => paymentMethodData->Dict.get("card"))
  ->Option.flatMap(JSON.Decode.object)
  ->Option.flatMap(card => card->Dict.get(key))
  ->Option.flatMap(JSON.Decode.string)
  ->Option.getOr("")

/* Stable dependency key for the effect that invalidates a replaced session. */
let environmentKey = (environment: VaultConfirm.vaultEnvironment) =>
  switch environment {
  | #production => "production"
  | #sandbox => "sandbox"
  | #integration => "integration"
  }

/* ── Submission machinery ─────────────────────────────────────────────────── */

type machinery = {
  submit: unit => promise<VaultResult.vaultSubmitResult>,
  reset: unit => unit,
  isSubmitting: bool,
  valuesRef: React.ref<Dict.t<JSON.t>>,
  isValidRef: React.ref<bool>,
  formMethodsRef: React.ref<option<ReactFinalForm.Form.formMethods>>,
}

let useMachinery = (
  ~sessionState: sessionState,
  ~environment: VaultConfirm.vaultEnvironment,
  ~selection: option<CardFormTypes.cardFieldSelection>,
  ~presenceGate: unit => option<VaultResult.vaultSubmitResult>,
  ~clearLocal: unit => unit,
): machinery => {
  /* The handle is created once; it reads the latest session/environment through this ref. */
  let latestRef = React.useRef((sessionState, environment))
  latestRef.current = (sessionState, environment)

  let (isSubmitting, setIsSubmitting) = React.useState(_ => false)

  /* Latest form snapshot, kept in refs so `submit()` never depends on a stale closure. */
  let valuesRef: React.ref<Dict.t<JSON.t>> = React.useRef(Dict.make())
  let isValidRef = React.useRef(false)
  let formMethodsRef: React.ref<option<ReactFinalForm.Form.formMethods>> = React.useRef(None)


  /* One in-flight submission; a repeated press gets the same promise back, not an error. */
  let inFlightRef: React.ref<option<promise<VaultResult.vaultSubmitResult>>> = React.useRef(None)
  /*
   * The in-flight request's cancellation handle, tagged with the session+environment it was issued
   * under. The tag is what makes invalidation precise: a replacement cancels a request only when
   * that request belongs to a session that has been superseded, never one just issued under the new
   * session.
   */
  let abortRef: React.ref<option<(string, VaultConfirm.abortController)>> = React.useRef(None)
  let isMountedRef = React.useRef(true)
  /*
   * Bumped whenever the in-flight submission stops being the current one — a superseded session, or
   * unmount. A settling submission only writes back state when its own generation is still current,
   * so a superseded request can never clear a newer one's in-flight entry.
   */
  let generationRef = React.useRef(0)

  let abortInFlight = () => {
    abortRef.current->Option.forEach(((_, controller)) => controller->VaultConfirm.abort)
    abortRef.current = None
  }

  React.useEffect0(() => {
    /* Re-arm on remount: React StrictMode mounts, unmounts and mounts again in development. */
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

  /*
   * Session / environment replacement.
   *
   * The request itself is always built from `latestRef` at call time, so a new `submit()` can never
   * carry an old authorization. This effect covers the other half: a confirmation that is ALREADY in
   * flight under the PREVIOUS session is aborted and detached, so its authorization stops being used
   * immediately and the next `submit()` starts a fresh request. The aborted call resolves as
   * `unknown_outcome` — the vault may already have processed it.
   *
   * The `requestKey` comparison matters. Doing this unconditionally would also cancel a request
   * issued after the swap but before this effect ran (React renders before it flushes effects), so
   * a merchant who replaced the session and submitted in the same tick would have their new,
   * perfectly valid request cancelled.
   */
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
    /*
     * A session that cannot vault is a configuration failure, not a transient one: submitting again
     * with the same session always fails the same way. Hence `error`, not `not_ready`.
     */
    | Unusable(message) => VaultResult.invalidSession(message)
    | Ready(sdkAuthorization) =>
      /* The widget presence gate runs BEFORE any value is read or any transport call is built. */
      switch presenceGate() {
      | Some(blocked) => blocked
      | None =>
      switch (selection, formMethodsRef.current) {
      /* Nothing was sent: the fields have not registered yet. Calling again later is safe. */
      | (None, _) | (_, None) => VaultResult.notReady()
      | (Some(_), Some(formMethods)) =>
        if !isValidRef.current {
          /* Marks every field touched so the inline messages appear, then reports the failure. */
          formMethods.submit()
          VaultResult.invalidCardData()
        } else {
          let values = valuesRef.current
          let controller = VaultConfirm.makeAbortController()
          /* Tagged with the session+environment this request is issued under. */
          abortRef.current = Some((`${sdkAuthorization}|${environment->environmentKey}`, controller))

          let outcome = await VaultConfirm.confirmPaymentMethodSession({
            sdkAuthorization,
            environment,
            card: {
              cardNumber: values->readCardField("card_number"),
              expiryMonth: values->readCardField("card_exp_month"),
              expiryYear: values->readCardField("card_exp_year"),
              cvc: values->readCardField("card_cvc"),
            },
            signal: controller->VaultConfirm.controllerSignal,
          })

          /*
           * Only clear the slot if it still holds THIS controller. A superseded request settles
           * after its abort, and by then a replacement submission may already have registered its
           * own controller — clearing that one would leave the live request with nothing to cancel
           * it on unmount.
           */
          switch abortRef.current {
          | Some((_, current)) if current === controller => abortRef.current = None
          | _ => ()
          }
          outcome->VaultResult.fromConfirmOutcome
        }
      }
      }
    }
  }

  let submit = () =>
    switch inFlightRef.current {
    /* Repeated presses share the first promise rather than starting a second request. */
    | Some(pending) => pending
    | None =>
      let generation = generationRef.current
      setIsSubmitting(_ => true)
      let pending =
        runSubmit()->Promise.then(result => {
          /* Only the current submission writes state back; a superseded one just resolves. */
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

  /*
   * reset() — refusal while in flight, exactly as before the extraction: it neither clears nor
   * cancels (cancelling manufactures an unknown outcome; clearing without cancelling leaves state
   * that can be misread as belonging to a newer card). Once settled it clears react-final-form
   * plus whatever local display state the caller registered.
   */
  let reset = () =>
    switch inFlightRef.current {
    | Some(_) => ()
    | None =>
      formMethodsRef.current->Option.forEach(methods => methods.reset())
      clearLocal()
    }

  {
    submit,
    reset,
    isSubmitting,
    valuesRef,
    isValidRef,
    formMethodsRef,
  }
}
