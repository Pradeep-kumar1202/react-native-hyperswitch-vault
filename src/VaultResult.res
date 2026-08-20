
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

  message: string,
}

@genType @tag("status")
type vaultSubmitResult =

  | @as("success") Success({token: string})
  | @as("validation_error") ValidationError({error: safeVaultError})
  | @as("not_ready") NotReady({error: safeVaultError})
  | @as("error") Failed({error: safeVaultError})

let invalidCardMessage = "Please check your card details and try again."
let notReadyMessage = "The card form is not ready yet."
let unusableSessionMessage = "This session can no longer be used."
let unknownOutcomeMessage = "We could not confirm your card. Please check before trying again."
let serverErrorMessage = "Your card could not be saved."

let invalidCardData = () => ValidationError({
  error: {code: #invalid_card_data, message: invalidCardMessage},
})

let notReady = () => NotReady({error: {code: #not_ready, message: notReadyMessage}})

let notReadyWithMessage = message => NotReady({error: {code: #not_ready, message}})

let invalidSession = message => Failed({error: {code: #invalid_session, message}})

let fromConfirmOutcome = (outcome: VaultConfirm.confirmOutcome): vaultSubmitResult =>
  switch outcome {
  | VaultConfirm.Success({result}) => Success({token: result.token})
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
