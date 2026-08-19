/*
 * Card-form-local test IDs — the source of truth for the three card input test IDs.
 *
 * String values are byte-identical to the ones previously read from client-core's `TestUtils`, and
 * are part of the card form's observable contract (documented in the Phase 0 behaviour contract).
 *
 * `payButtonTestId` is deliberately NOT included: it is not card-domain and stays in client-core's
 * `TestUtils`, which is not modified. Verified before moving: no detox spec and no JS/TS test
 * references these three IDs, so nothing external depends on where they are declared.
 */

let cardNumberInputTestId = "CardNumberInputTestId"
let expiryInputTestId = "ExpiryInputTestId"
let cvcInputTestId = "CVCInputTestId"
