/*
 * The merchant-facing submit result, and the ONE mapping from the transport's outcome onto it.
 *
 * This lives in its own module, separate from the component, for two reasons:
 *
 *   1. it is the security- and correctness-critical boundary — every message a merchant can ever
 *      see is a literal in this file, so "no backend body, no decoded claim, no card value ever
 *      reaches the caller" is checkable by reading one screen of code;
 *
 *   2. it imports neither React nor React Native, so the whole mapping table can be executed and
 *      asserted in a plain Node process (`scripts/verify-result-mapping.mjs`) rather than argued
 *      about in review.
 *
 * Unknown-outcome semantics (load-bearing — do not "simplify"):
 *
 *   A thrown fetch, a timeout and an abort are indistinguishable from one another AND from a
 *   request the vault already processed. The endpoint takes no idempotency key, so retrying may
 *   tokenise the card twice. Every one of them therefore maps to `status: "error"` with
 *   `code: "unknown_outcome"` — never to a "network error", which would read as safe to retry.
 *   Nothing in this library retries anything automatically.
 */

/*
 * Closed union. `network_error` is deliberately absent: no reachable condition can produce a
 * failure that is known NOT to have reached the vault, so a code implying "the request never
 * happened, try again" would be a lie. See the mapping table in README.md.
 */
@genType
type safeVaultErrorCode = [
  | #invalid_session
  | #invalid_card_data
  | #not_ready
  | #server_error
  | #unknown_outcome
]

@genType
type safeVaultError = {
  code: safeVaultErrorCode,
  /* Always one of the fixed strings below. */
  message: string,
}

/*
 * `@tag("status")` emits a real discriminated union at runtime, so a success can never carry an
 * error and a failure can never carry a token — the impossible states are unrepresentable.
 */
@genType @tag("status")
type vaultSubmitResult =
  | @as("success") Success({token: string, card: VaultConfirm.vaultCardMetadata})
  | @as("validation_error") ValidationError({error: safeVaultError})
  | @as("not_ready") NotReady({error: safeVaultError})
  | @as("error") Failed({error: safeVaultError})

/* ── Messages ─────────────────────────────────────────────────────────────── */

/* Every string a merchant can receive. None is derived from a response, a request or a card value. */
let invalidCardMessage = "Please check your card details and try again."
let notReadyMessage = "The card form is not ready yet."
let unusableSessionMessage = "This session can no longer be used."
let unknownOutcomeMessage = "We could not confirm your card. Please check before trying again."
let serverErrorMessage = "Your card could not be saved."

/* ── Constructors ─────────────────────────────────────────────────────────── */

/* The card the merchant typed did not pass validation. Safe to correct and submit again. */
let invalidCardData = () => ValidationError({
  error: {code: #invalid_card_data, message: invalidCardMessage},
})

/* Nothing was sent: the form has not registered its fields yet. Safe to call again. */
let notReady = () => NotReady({error: {code: #not_ready, message: notReadyMessage}})

/*
 * not_ready with a caller-supplied safe message — the widget presence gate uses this to name the
 * missing or duplicated widget. Callers pass only fixed strings assembled from widget names and
 * counts; never anything derived from a response, a request or a card value.
 */
let notReadyWithMessage = message => NotReady({error: {code: #not_ready, message}})

/*
 * The session cannot be used for vaulting: missing `vault_details`, an unsupported `vault_type`, a
 * missing/blank/undecodable `sdk_authorization`, or one with no `payment_method_session_id`. This
 * is a configuration failure, so it is reported as `status: "error"` rather than `not_ready` —
 * calling submit again with the same session will always fail the same way.
 */
let invalidSession = message => Failed({error: {code: #invalid_session, message}})

/* ── The mapping ──────────────────────────────────────────────────────────── */

/*
 * Every `VaultConfirm.vaultErrorCode` is handled explicitly; adding a code there is a compile error
 * here until it is mapped.
 *
 *   #invalid_card_data                        -> validation_error / invalid_card_data
 *   #invalid_authorization, #missing_session_id -> error / invalid_session
 *   #unknown_outcome                          -> error / unknown_outcome   (never retried)
 *   #http_error                               -> error / server_error      (confirmed non-2xx)
 *   #malformed_response, #missing_token       -> error / server_error      (2xx, unusable body)
 *
 * The last row is worth stating plainly: the vault answered 2xx, so the card was very likely saved
 * even though no token could be read. It is reported as `server_error` because the request outcome
 * is known — but like every other result here, it is never retried automatically.
 */
let fromConfirmOutcome = (outcome: VaultConfirm.confirmOutcome): vaultSubmitResult =>
  switch outcome {
  | VaultConfirm.Success({result}) => Success({token: result.token, card: result.card})
  | VaultConfirm.Failure({error}) =>
    switch error.code {
    | #invalid_card_data => invalidCardData()
    | #invalid_authorization
    | #missing_session_id =>
      invalidSession(unusableSessionMessage)
    | #unknown_outcome => Failed({error: {code: #unknown_outcome, message: unknownOutcomeMessage}})
    | #http_error
    | #malformed_response
    | #missing_token =>
      Failed({error: {code: #server_error, message: serverErrorMessage}})
    }
  }
