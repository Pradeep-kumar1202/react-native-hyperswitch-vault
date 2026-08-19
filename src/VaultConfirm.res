/*
 * Payment-method-session confirmation (vault tokenisation).
 *
 * Ownership, per the confirmed contract:
 *   - session_tokens parsing            -> host (client-core). This module never sees that response.
 *   - payment-method-session confirm    -> THIS module.
 *   - subsequent payments confirm       -> host (client-core). Not performed here.
 *
 * Public input is deliberately narrow: the vault `sdkAuthorization` and a trusted environment.
 * The complete session_tokens response is NOT accepted.
 *
 * Security rules enforced here:
 *   - nothing in this module logs. There is no Console call, deliberately: the authorization is a
 *     bearer of client_secret / customer_id / publishable_key / profile_id, and the request body
 *     carries a PAN and CVC.
 *   - no decoded claim, no request data and no backend body is ever returned to callers.
 *
 * Behaviour deliberately NOT copied from hyperswitch-web (see
 * docs/hyperswitch-web-vault-contract.md §8): the web SDK converts every failure into a resolved
 * `null`, so an API failure is indistinguishable from success. Every path here is a typed result.
 *
 * There is no automatic retry anywhere, and no failure is reported as retryable unless an explicitly
 * approved mapping says so — see `retryableForStatus`.
 */

/* ── Public types ─────────────────────────────────────────────────────────── */

/*
 * Trusted environment. The caller must pass this explicitly — React Native has no document origin,
 * so unlike the web SDK the vault host cannot be inferred from where the code was served.
 * Maps onto client-core's `GlobalVars.envType`: PROD / SANDBOX / INTEG.
 */
@genType
type vaultEnvironment = [#production | #sandbox | #integration]

@genType
type cardDetails = {
  cardNumber: string,
  /* "MM" */
  expiryMonth: string,
  /* "YY" or "YYYY" — normalised to the 4-digit form the endpoint expects (see `requestExpiryYear`) */
  expiryYear: string,
  cvc: string,
}

/*
 * The AbortSignal handed straight to `fetch`. This module never inspects it; cancelling after
 * dispatch yields `#unknown_outcome`, because the server may already have processed the request.
 *
 * Mapped to the ambient global `AbortSignal` (see src/dom-types.ts) rather than left
 * `@genType.opaque`. As an opaque type genType emits `abstract class abortSignal`, which no real
 * value can ever be — a TypeScript merchant would have had to write
 * `signal: controller.signal as unknown as abortSignal` to call this at all, and a cast at the
 * boundary of a payments API is exactly the kind of thing that hides a genuine type error later.
 */
@genType.import(("./dom-types", "AbortSignalType"))
type abortSignal

@genType
type confirmRequest = {
  sdkAuthorization: string,
  environment: vaultEnvironment,
  card: cardDetails,
  /*
   * Optional. There is NO default: the SDK ecosystem has no approved payment-API timeout — the only
   * `timeoutMs` constant in hyperswitch-web is `PaymentConfirmTypes.defaultDdcData` (30000), which
   * belongs to the 3DS device-data-collection iframe, not to a payment API call. Inventing one here
   * would be a policy decision this module is not entitled to make.
   */
  timeoutMs?: int,
  /* Optional. Mirrors the approved cancellation pattern in `EligibilityHelpers.startEligibilityCheck`. */
  signal?: abortSignal,
}

/* Masked metadata returned by the vault. Never contains a full PAN. */
@genType
type vaultCardMetadata = {
  last4Digits: string,
  /* Absent when the vault returns `card_isin: null`. */
  binNumber?: string,
  expiryMonth: string,
  expiryYear: string,
}

@genType
type vaultConfirmResult = {
  token: string,
  card: vaultCardMetadata,
}

/*
 * Failure categories — a closed string union, so the JavaScript contract does not depend on variant
 * tag integers across two independently compiled repositories.
 *
 * `#unknown_outcome` replaces a naive "network error": a thrown fetch, a timeout or an abort can all
 * happen *after* the server received and processed the request. Since the endpoint sends no
 * idempotency key and backend idempotency is unconfirmed, such an outcome is never safe to retry.
 */
@genType
type vaultErrorCode = [
  | #invalid_authorization
  | #missing_session_id
  | #invalid_card_data
  | #unknown_outcome
  | #http_error
  | #malformed_response
  | #missing_token
]

@genType
type vaultError = {
  code: vaultErrorCode,
  /* Always a safe, fixed string. Never a backend body and never request data. */
  message: string,
  httpStatus?: int,
  /* True only where an explicitly approved mapping allows it. Defaults to false everywhere. */
  retryable: bool,
  /* True when the request may have been processed despite the failure. */
  unknownOutcome: bool,
}

/*
 * Discriminated result. `@tag("status")` makes ReScript emit `{status: "success", result}` /
 * `{status: "failure", error}` at runtime, so a success can never carry an error and a failure can
 * never carry a result — the impossible states are unrepresentable rather than merely unused.
 */
@genType @tag("status")
type confirmOutcome =
  | @as("success") Success({result: vaultConfirmResult})
  | @as("failure") Failure({error: vaultError})

/* ── Base64 ───────────────────────────────────────────────────────────────── */

let base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/*
 * Self-contained base64 decode. Implemented here rather than binding `atob` or the `base-64`
 * package: `atob` is not guaranteed on every React Native runtime, and a merchant-facing library
 * should not acquire a runtime dependency for twenty lines of arithmetic. Accepts URL-safe input,
 * ignores whitespace and padding, and returns None on any character outside the alphabet.
 */
let decodeBase64 = (input: string): option<string> => {
  let normalized =
    input
    ->String.replaceRegExp(%re("/\s/g"), "")
    ->String.replaceAll("-", "+")
    ->String.replaceAll("_", "/")
    ->String.replaceRegExp(%re("/=+$/"), "")

  let length = normalized->String.length
  let out = ref("")
  let buffer = ref(0)
  let bits = ref(0)
  let valid = ref(true)
  let index = ref(0)

  while valid.contents && index.contents < length {
    let symbol = normalized->String.charAt(index.contents)
    let position = base64Alphabet->String.indexOf(symbol)
    if position < 0 {
      valid := false
    } else {
      buffer := buffer.contents * 64 + position
      bits := bits.contents + 6
      if bits.contents >= 8 {
        bits := bits.contents - 8
        let divisor = switch bits.contents {
        | 2 => 4
        | 4 => 16
        | _ => 1
        }
        out := out.contents ++ String.fromCharCode(buffer.contents / divisor)
        buffer := mod(buffer.contents, divisor)
      }
      index := index.contents + 1
    }
  }

  valid.contents ? Some(out.contents) : None
}

/* ── Errors ───────────────────────────────────────────────────────────────── */

/* Every failure is built here, so `retryable` / `unknownOutcome` can never be set ad hoc. */
let configurationError = (code, message) =>
  Failure({error: {code, message, retryable: false, unknownOutcome: false}})

let unknownOutcomeError = message =>
  Failure({
    error: {code: #unknown_outcome, message, retryable: false, unknownOutcome: true},
  })

/*
 * Approved retryable mapping.
 *
 * Intentionally empty. Nothing in hyperswitch-web or hyperswitch-client-core approves retrying a
 * payment-method-session confirmation, the endpoint accepts no idempotency key, and backend
 * idempotency is unconfirmed. Until it is, every confirmed non-2xx is reported `retryable: false`.
 * Add entries here — never at a call site — once a status/code is approved.
 */
let retryableForStatus = (_status: int, _code: option<string>) => false

/*
 * Approved backend error codes -> safe public messages.
 *
 * Only the `error.code` field is read. The backend's own `message` is deliberately NOT echoed: it is
 * an unbounded string that may embed request context. Anything unrecognised falls back to a generic
 * message carrying nothing but the HTTP status.
 */
let publicMessageForCode = (code: string) =>
  switch code {
  | "IR_00" | "IR_01" | "IR_03" => Some("The vault session could not be authorized.")
  | "IR_05" | "IR_06" => Some("The card details were rejected by the vault.")
  | "IR_16" => Some("The vault session has already been used.")
  | "IR_24" => Some("The vault session has expired.")
  | _ => None
  }

/* ── Authorization envelope ───────────────────────────────────────────────── */

/*
 * The decoded authorization is a comma-separated `key=value` envelope, the same grammar both
 * hyperswitch-web and client-core already parse. Only `payment_method_session_id` is read; the other
 * claims (client_secret, customer_id, publishable_key, profile_id) are ignored and never surfaced.
 */
let readSessionId = (decoded: string): option<string> =>
  decoded
  ->String.split(",")
  ->Array.reduce(None, (found, pair) =>
    switch found {
    | Some(_) => found
    | None =>
      let separator = pair->String.indexOf("=")
      if separator <= 0 {
        None
      } else {
        let key = pair->String.slice(~start=0, ~end=separator)->String.trim
        let value = pair->String.sliceToEnd(~start=separator + 1)->String.trim
        key === "payment_method_session_id" && value->String.length > 0 ? Some(value) : None
      }
    }
  )

let resolveSessionId = (sdkAuthorization: string): result<string, confirmOutcome> =>
  if sdkAuthorization->String.trim->String.length === 0 {
    Error(configurationError(#invalid_authorization, "sdkAuthorization is empty."))
  } else {
    switch sdkAuthorization->decodeBase64 {
    | None =>
      Error(configurationError(#invalid_authorization, "sdkAuthorization is not valid base64."))
    | Some(decoded) =>
      switch decoded->readSessionId {
      | None =>
        Error(
          configurationError(
            #missing_session_id,
            "sdkAuthorization does not contain payment_method_session_id.",
          ),
        )
      | Some(sessionId) => Ok(sessionId)
      }
    }
  }

/* ── Expiry normalisation ─────────────────────────────────────────────────── */

/*
 * CONFIRMED from source: the payment-method-session confirm receives a FOUR-DIGIT year.
 *
 *   HyperswitchVaultCardCollector:76  let (month, year) = CardUtils.getExpiryDates(cardExpiry)
 *   CardUtils.res:303                 getExpiryDates = val => (month, `${prefix}${year}`)
 *   CardUtils.res:298                 getExpiryYearPrefix = () => currentYear->slice(0, 2)   // "20"
 *
 * and that pair goes straight into `PaymentBody.cardTokenizationBody(~month, ~year)`.
 * sdk-utils' `Validation.getExpiryDates` applies the identical century prefix.
 *
 * The card form stores a TWO-DIGIT year (Phase 0 §5.4), so this is the single place that maps
 * between the two. The century prefix is derived through sdk-utils rather than hardcoded.
 */
let twoDigitYear = (year: string) => {
  let digits = year->Validation.clearSpaces
  let length = digits->String.length
  length > 2 ? digits->String.sliceToEnd(~start=length - 2) : digits
}

let requestExpiryYear = (year: string) => {
  let digits = year->Validation.clearSpaces
  if digits->String.length >= 4 {
    digits
  } else {
    /* Reuse sdk-utils' prefix derivation; never hardcode "20". */
    let (_, expanded) = Validation.getExpiryDates(`01 / ${digits->twoDigitYear}`)
    expanded
  }
}

/* ── Card validation (sdk-utils only — nothing is reimplemented here) ─────── */

let detectBrand = (cardNumber: string) =>
  cardNumber
  ->Validation.clearSpaces
  ->Validation.getAllMatchedCardSchemes
  ->Array.get(0)
  ->Option.getOr("")

/*
 * Validates with sdk-utils exactly as the card form does: `cardValid` (brand length set + Luhn),
 * `checkCardExpiry` and `checkCardCVC` for the detected scheme. No Luhn or validation logic is
 * reimplemented. The rejected value is never returned in the error.
 */
let validateCard = (card: cardDetails): option<confirmOutcome> => {
  let cleaned = card.cardNumber->Validation.clearSpaces
  let brand = card.cardNumber->detectBrand
  let expiryForValidation = `${card.expiryMonth} / ${card.expiryYear->twoDigitYear}`

  if cleaned->String.length === 0 {
    Some(configurationError(#invalid_card_data, "Card number is required."))
  } else if !Validation.cardValid(cleaned, brand) {
    Some(configurationError(#invalid_card_data, "Card number is not valid."))
  } else if !Validation.checkCardExpiry(expiryForValidation) {
    Some(configurationError(#invalid_card_data, "Card expiry is not valid."))
  } else if !Validation.checkCardCVC(card.cvc, brand) {
    Some(configurationError(#invalid_card_data, "Card security code is not valid."))
  } else {
    None
  }
}

/* ── Endpoint ─────────────────────────────────────────────────────────────── */

/*
 * Vault host per environment, mirroring hyperswitch-web's `ApiEndpoint.hyperswitchVaultEndPoint`.
 * Selected from the caller's trusted environment rather than inherited from a document origin.
 */
let vaultBaseUrl = (environment: vaultEnvironment) =>
  switch environment {
  | #production => "https://checkout.hyperswitch.io/api"
  | #integration => "https://dev.hyperswitch.io/api"
  | #sandbox => "https://beta.hyperswitch.io/api"
  }

let confirmUrl = (~environment, ~sessionId) =>
  `${environment->vaultBaseUrl}/v1/payment-method-sessions/${sessionId}/confirm`

/* ── Request body ─────────────────────────────────────────────────────────── */

/*
 * Confirmed body shape. This is the payment-method-session confirm, which is NOT the payment
 * confirm: here the card object is `payment_method_data.card` and the discriminator is
 * `payment_method_type: "card"`. The subsequent payments confirm — owned by the host — uses
 * different field names entirely.
 */
let buildConfirmBody = (card: cardDetails) => {
  let cardObject =
    [
      ("card_number", card.cardNumber->Validation.clearSpaces->JSON.Encode.string),
      ("card_exp_month", card.expiryMonth->JSON.Encode.string),
      ("card_exp_year", card.expiryYear->requestExpiryYear->JSON.Encode.string),
      ("card_cvc", card.cvc->JSON.Encode.string),
    ]
    ->Dict.fromArray
    ->JSON.Encode.object

  [
    ("payment_method_type", "card"->JSON.Encode.string),
    ("payment_method_data", [("card", cardObject)]->Dict.fromArray->JSON.Encode.object),
  ]
  ->Dict.fromArray
  ->JSON.Encode.object
}

/* ── Response decoding ────────────────────────────────────────────────────── */

let stringAt = (dict, key) =>
  dict->Dict.get(key)->Option.flatMap(JSON.Decode.string)->Option.getOr("")

let optionalStringAt = (dict, key) =>
  dict
  ->Dict.get(key)
  ->Option.flatMap(JSON.Decode.string)
  ->Option.flatMap(value => value->String.length > 0 ? Some(value) : None)

let objectAt = (dict, key) =>
  dict->Dict.get(key)->Option.flatMap(JSON.Decode.object)->Option.getOr(Dict.make())

/*
 * Token location, confirmed: associated_payment_methods[0].payment_method_token.data
 * Card metadata: payment_method_data.card.{last4_digits, card_isin, expiry_month, expiry_year}
 */
let decodeConfirmResponse = (json: JSON.t, ~httpStatus: int): confirmOutcome =>
  switch json->JSON.Decode.object {
  | None =>
    Failure({
      error: {
        code: #malformed_response,
        message: "The vault response could not be read.",
        httpStatus,
        retryable: false,
        unknownOutcome: false,
      },
    })
  | Some(root) =>
    let token =
      root
      ->Dict.get("associated_payment_methods")
      ->Option.flatMap(JSON.Decode.array)
      ->Option.flatMap(entries => entries->Array.get(0))
      ->Option.flatMap(JSON.Decode.object)
      ->Option.mapOr("", entry => entry->objectAt("payment_method_token")->stringAt("data"))

    if token->String.length === 0 {
      Failure({
        error: {
          code: #missing_token,
          message: "The vault response did not contain a payment method token.",
          httpStatus,
          retryable: false,
          unknownOutcome: false,
        },
      })
    } else {
      let card = root->objectAt("payment_method_data")->objectAt("card")
      Success({
        result: {
          token,
          card: {
            last4Digits: card->stringAt("last4_digits"),
            binNumber: ?card->optionalStringAt("card_isin"),
            expiryMonth: card->stringAt("expiry_month"),
            expiryYear: card->stringAt("expiry_year"),
          },
        },
      })
    }
  }

/*
 * Builds a failure from a non-2xx response. Reads only `error.code` from the approved envelope and
 * maps it to a fixed public string; the backend's own message and the rest of the body are
 * discarded. `unknownOutcome` is false — the server answered, so the outcome is known.
 */
let describeHttpFailure = (parsed: option<JSON.t>, status: int): confirmOutcome => {
  let backendCode =
    parsed
    ->Option.flatMap(JSON.Decode.object)
    ->Option.flatMap(root => root->objectAt("error")->optionalStringAt("code"))

  let message =
    backendCode
    ->Option.flatMap(publicMessageForCode)
    ->Option.getOr("The vault could not confirm the payment method.")

  Failure({
    error: {
      code: #http_error,
      message,
      httpStatus: status,
      retryable: retryableForStatus(status, backendCode),
      unknownOutcome: false,
    },
  })
}

/* ── Transport ────────────────────────────────────────────────────────────── */

type fetchResponse

type fetchOptions = {
  method: string,
  headers: Dict.t<string>,
  body: string,
  signal?: abortSignal,
}

type abortController

@val external fetch: (string, fetchOptions) => promise<fetchResponse> = "fetch"
@get external responseOk: fetchResponse => bool = "ok"
@get external responseStatus: fetchResponse => int = "status"
@send external responseJson: fetchResponse => promise<JSON.t> = "json"

@new external makeAbortController: unit => abortController = "AbortController"
@get external controllerSignal: abortController => abortSignal = "signal"
@send external abort: abortController => unit = "abort"
@get external signalAborted: abortSignal => bool = "aborted"
@send external onSignalAbort: (abortSignal, string, unit => unit) => unit = "addEventListener"

type timerId
@val external setTimeout: (unit => unit, int) => timerId = "setTimeout"
@val external clearTimeout: timerId => unit = "clearTimeout"

/*
 * Confirm the payment-method session and return the vault token.
 *
 * Concurrency: this function holds no lock. Preventing overlapping confirmations is the consuming
 * component's responsibility — a module-level guard would be wrong for a library that may back more
 * than one form instance. The endpoint carries no idempotency key, so a duplicate call can tokenise
 * twice.
 *
 * Exactly one request is issued. Nothing is retried automatically.
 */
@genType
let confirmPaymentMethodSession = async (request: confirmRequest): confirmOutcome => {
  switch request.card->validateCard {
  | Some(invalid) => invalid
  | None =>
    switch request.sdkAuthorization->resolveSessionId {
    | Error(configurationFailure) => configurationFailure
    | Ok(sessionId) =>
      let url = confirmUrl(~environment=request.environment, ~sessionId)

      /*
       * One controller per call: it carries the caller's cancellation and the optional timeout.
       * A caller-supplied signal is honoured by aborting this controller when it fires, which keeps
       * a single abort path.
       */
      let controller = makeAbortController()

      /* Caller cancellation (unmount) is funnelled into the same controller. */
      request.signal->Option.forEach(callerSignal =>
        if callerSignal->signalAborted {
          controller->abort
        } else {
          callerSignal->onSignalAbort("abort", () => controller->abort)
        }
      )

      let timedOut = ref(false)
      let timer = switch request.timeoutMs {
      | Some(ms) if ms > 0 =>
        Some(
          setTimeout(() => {
            timedOut := true
            controller->abort
          }, ms),
        )
      | _ => None
      }

      let options = {
        method: "POST",
        /*
         * Exactly these headers. The web SDK additionally emits `api-key: invalid_key` as a fallback
         * artefact; that is deliberately not reproduced.
         */
        headers: [
          ("Content-Type", "application/json"),
          ("Authorization", request.sdkAuthorization),
        ]->Dict.fromArray,
        body: request.card->buildConfirmBody->JSON.stringify,
        signal: ?Some(controller->controllerSignal),
      }

      let attempted = try {
        Ok(await fetch(url, options))
      } catch {
      | _ => Error()
      }

      timer->Option.forEach(clearTimeout)

      switch attempted {
      | Error() =>
        /*
         * A thrown fetch covers network failure, timeout and abort alike. Any of them can occur
         * after the server accepted the request, so the outcome is unknown and never retryable.
         */
        unknownOutcomeError(
          timedOut.contents
            ? "The vault did not respond in time; the outcome is unknown."
            : "The vault request did not complete; the outcome is unknown.",
        )
      | Ok(response) =>
        let status = response->responseStatus
        let parsed = try {
          Some(await response->responseJson)
        } catch {
        | _ => None
        }

        if response->responseOk {
          switch parsed {
          | None =>
            Failure({
              error: {
                code: #malformed_response,
                message: "The vault response was not valid JSON.",
                httpStatus: status,
                retryable: false,
                unknownOutcome: false,
              },
            })
          | Some(json) => json->decodeConfirmResponse(~httpStatus=status)
          }
        } else {
          describeHttpFailure(parsed, status)
        }
      }
    }
  }
}
