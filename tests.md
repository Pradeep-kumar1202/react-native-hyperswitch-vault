# New-Card Vaulting — Manual Test Checklist

> Mark `[x]` when a test passes. If it fails, leave it unchecked and fill the **Issue** block below that section.

## Status legend

- `[ ]` Not tested
- `[x]` Passed
- `N/A` Not applicable
- `BLOCKED` Cannot test yet

Use this failure template:

```text
Issue:
Expected:
Actual:
Platform:
Reproduction:
Notes:
```

---

# 0. Test Environment

- [ ] Android build available
- [ ] iOS build available
- [ ] RN-Web build available
- [ ] Sandbox/integration backend reachable
- [ ] Correct merchant/profile selected
- [ ] `vaulting_action` can be verified/changed
- [ ] `vault_details` can be verified
- [ ] VGS route/config available
- [ ] Network requests can be inspected
- [ ] Console/SDK logs can be inspected

```text
client-core branch/commit:
payment-methods branch/commit:
vault branch/commit:

Android device/emulator:
iOS device/simulator:
RN-Web browser:

Backend environment:
Merchant/profile:
Notes:
```

---

# 1. Strategy Resolution

## 1.1 Direct

- [ ] `vaulting_action = "skip"` → Direct
- [ ] `skip` + VGS `vault_details` → still Direct
- [ ] `skip` + Hyperswitch `vault_details` → still Direct

Issue:

```text
```

## 1.2 Hyperswitch Vault

- [ ] `tokenize` + valid Hyperswitch session → Hyperswitch Vault
- [ ] Missing required Hyperswitch credential → blocked/typed error
- [ ] Malformed Hyperswitch session → blocked/typed error

Issue:

```text
```

## 1.3 VGS

- [ ] `tokenize` + valid VGS session → VGS
- [ ] Missing `vault_id` → blocked
- [ ] Malformed VGS session → blocked

Issue:

```text
```

## 1.4 Fail-closed behavior

- [ ] `tokenize` + no usable session → blocked
- [ ] Unknown `vaulting_action` → blocked
- [ ] Config still loading → pending, not blocked
- [ ] `vaulting_action` absent → current ActionAbsent behavior

Issue:

```text
```

---

# 2. VGS Flow

## 2.1 Rendering

- [ ] VGS card-number field renders
- [ ] VGS expiry field renders
- [ ] VGS CVC field renders
- [ ] Hyperswitch Vault fields do not render
- [ ] Card number uses full width
- [ ] Expiry + CVC row is correct
- [ ] Padding is correct
- [ ] Gap is correct
- [ ] Alignment is correct
- [ ] Split layout looks correct
- [ ] Fused/joined layout looks correct, if applicable
- [ ] RTL arrangement looks correct
- [ ] VGS brand icon behaves correctly
- [ ] VGS CVC icon behaves correctly
- [ ] Disabled/submitting state behaves correctly

Issue:

```text
```

## 2.2 Valid card — happy path

- [ ] Valid PAN accepted
- [ ] Valid expiry accepted
- [ ] Valid CVC accepted
- [ ] Brand detected if VGS provides it
- [ ] Form becomes submit-ready only when appropriate
- [ ] Pay once → VGS tokenization exactly once
- [ ] VGS response parses successfully
- [ ] PAN alias remains an alias
- [ ] CVC alias remains an alias
- [ ] Canonical `ProviderTokenizedCard` created
- [ ] Vault orchestration called
- [ ] `/payments/{id}/confirm` called exactly once
- [ ] Request uses `payment_method_data.vault_card`
- [ ] Payment succeeds
- [ ] Safe result reaches client-core
- [ ] Success callback fires exactly once

Issue:

```text
```

## 2.3 Validation

### PAN

- [ ] Empty PAN does not submit
- [ ] Incomplete PAN does not submit
- [ ] Invalid PAN shows validation behavior
- [ ] Invalid PAN keeps sheet open

### Expiry

- [ ] Empty expiry does not submit
- [ ] Incomplete expiry does not submit
- [ ] Malformed expiry shows validation behavior
- [ ] Expired card shows validation behavior
- [ ] Invalid expiry keeps sheet open

### CVC

- [ ] Empty CVC does not submit
- [ ] Incomplete CVC does not submit
- [ ] Invalid CVC shows validation behavior
- [ ] Invalid CVC keeps sheet open

### Overall

- [ ] No payment confirm after local validation failure
- [ ] Validation failure is not mapped to generic payment failure
- [ ] Customer-visible error is understandable
- [ ] Raw VGS provider text is not shown directly

Issue:

```text
```

## 2.4 Tokenization failures

- [ ] Invalid VGS config fails safely
- [ ] Invalid `vault_id` fails safely
- [ ] Provider/network failure fails safely
- [ ] Provider timeout fails safely
- [ ] Malformed VGS response fails safely
- [ ] Missing PAN alias fails before confirm
- [ ] Missing CVC alias fails before confirm
- [ ] Missing expiry fails before confirm
- [ ] Unexpected expiry format fails safely
- [ ] No confirm after provider tokenization failure
- [ ] Error is typed/normalized
- [ ] Sheet behavior after provider failure is correct

Issue:

```text
```

## 2.5 Alias safety

- [ ] No BIN derived from alias
- [ ] No last4 derived from alias
- [ ] Alias never treated as PAN
- [ ] Aliases never reach client-core state/events
- [ ] Aliases never appear in customer-visible logs
- [ ] Payment result contains no aliases

Issue:

```text
```

## 2.6 Enabled card schemes

Configure a restricted set such as Visa + Mastercard.

- [ ] Allowed Visa can submit
- [ ] Allowed Mastercard can submit
- [ ] Disallowed scheme follows final contract
- [ ] Disallowed scheme is not silently accepted

Issue:

```text
```

## 2.7 Eligibility

- [ ] Eligibility-required VGS flow does NOT silently bypass eligibility
- [ ] Supported eligibility path works, if implemented
- [ ] Unsupported combination returns intended typed block/error
- [ ] No PAN/BIN leakage just to perform eligibility

Issue:

```text
```

## 2.8 VGS route

- [ ] Real production-like VGS route/path is used
- [ ] Not accidentally depending on `/post` echo behavior
- [ ] Route response matches parser
- [ ] Wrong route fails safely
- [ ] Missing route config follows final contract

Issue:

```text
```

## 2.9 Double submit

- [ ] Single tap → one tokenization
- [ ] Double tap → one tokenization
- [ ] Double tap → one confirm
- [ ] Double tap → one completion callback
- [ ] Double tap → one 3DS/redirect launch
- [ ] Triple tap still does not duplicate payment behavior

Issue:

```text
```

## 2.10 Reset / retry

- [ ] Reset clears PAN field
- [ ] Reset clears expiry
- [ ] Reset clears CVC
- [ ] Reset clears validation state
- [ ] Reset disables submit again
- [ ] Retry after validation failure works
- [ ] Retry after provider failure works
- [ ] Retry after payment failure works

Issue:

```text
```

## 2.11 Post-confirm

- [ ] Immediate success
- [ ] Failure
- [ ] Processing
- [ ] 3DS
- [ ] Redirect
- [ ] DDC
- [ ] Poll/retrieve
- [ ] Cancellation
- [ ] Unknown outcome

Issue:

```text
```

---

# 3. Hyperswitch Vault Flow

## 3.1 Rendering

- [ ] Hyperswitch card-number field renders
- [ ] Expiry field renders
- [ ] CVC field renders
- [ ] VGS fields do not render
- [ ] Card-number layout correct
- [ ] Expiry/CVC layout correct
- [ ] Split layout correct
- [ ] Fused layout correct
- [ ] RTL correct
- [ ] Floating labels work
- [ ] Brand icon works
- [ ] CVC icon works
- [ ] Inline validation works
- [ ] Co-badge remains available
- [ ] Scan-card remains available where supported

Issue:

```text
```

## 3.2 Valid card — happy path

- [ ] Valid PAN accepted
- [ ] Valid expiry accepted
- [ ] Valid CVC accepted
- [ ] Form becomes submit-ready
- [ ] PMS tokenization happens
- [ ] Token never reaches client-core
- [ ] Final confirm happens
- [ ] `/payments/{id}/confirm` exactly once
- [ ] Safe result returns
- [ ] Payment completes correctly

Issue:

```text
```

## 3.3 Token cache / call-2 retry

Force tokenization success and final confirm failure.

- [ ] Tokenization succeeds
- [ ] Final confirm fails
- [ ] Retry payment
- [ ] Tokenization is NOT unnecessarily repeated
- [ ] Cached token reused
- [ ] Only final confirm retried
- [ ] Card is not vaulted twice

Issue:

```text
```

## 3.4 Validation

- [ ] Empty PAN
- [ ] Incomplete PAN
- [ ] Invalid PAN
- [ ] Unsupported card
- [ ] Empty expiry
- [ ] Incomplete expiry
- [ ] Invalid expiry
- [ ] Expired card
- [ ] Empty CVC
- [ ] Incomplete CVC
- [ ] Invalid CVC
- [ ] Inline errors appear
- [ ] No tokenization on local validation failure
- [ ] No payment confirm on local validation failure
- [ ] Sheet stays open
- [ ] Correct-and-retry works

Issue:

```text
```

## 3.5 Eligibility

- [ ] Allowed
- [ ] Denied
- [ ] Pending state
- [ ] Denied blocks tokenization
- [ ] Denied blocks final confirm
- [ ] Eligibility network failure follows intended contract
- [ ] Card changed during eligibility does not use stale result

Issue:

```text
```

## 3.6 Card schemes

- [ ] Visa
- [ ] Mastercard
- [ ] Amex
- [ ] Other supported card
- [ ] Unsupported card network
- [ ] `enabledCardSchemes` restriction honored
- [ ] Disallowed scheme cannot submit

Issue:

```text
```

## 3.7 Co-badge

- [ ] Chooser appears for co-badged card
- [ ] Correct network options shown
- [ ] Select network A
- [ ] Selected network state correct
- [ ] Select network B
- [ ] Selection changes correctly
- [ ] Correct `card_network` reaches request
- [ ] RTL chooser behavior correct

Issue:

```text
```

## 3.8 Scan card

- [ ] Scan affordance appears on supported device
- [ ] Not shown on unsupported device
- [ ] Open scanner
- [ ] Successful scan fills secure field
- [ ] Cancel scan works
- [ ] Scan failure handled
- [ ] Manual typing interacts correctly with scan affordance
- [ ] PAN never surfaces to client-core

Issue:

```text
```

## 3.9 Cardholder name

### collect

- [ ] Library name field renders
- [ ] Entered name reaches confirm

### external

- [ ] Library name field does not render
- [ ] Host/client-core name field remains
- [ ] Host name reaches confirm
- [ ] No duplicate name field

### omit

- [ ] No name field
- [ ] No name sent

### Invalid combinations

- [ ] Contradictory ownership is refused

Issue:

```text
```

## 3.10 Session failures

- [ ] Missing `sdkAuthorization`
- [ ] Blank `sdkAuthorization`
- [ ] Malformed session
- [ ] Expired session
- [ ] Already-used session
- [ ] Invalid environment
- [ ] Invalid endpoint
- [ ] Each returns intended typed error
- [ ] No unintended payment confirm

Issue:

```text
```

## 3.11 Network failures

### PMS/tokenization

- [ ] Network failure
- [ ] Timeout
- [ ] 4xx
- [ ] 5xx
- [ ] Malformed response

### Final confirm

- [ ] Network failure
- [ ] Timeout / unknown outcome
- [ ] 4xx
- [ ] 5xx
- [ ] Malformed response

Issue:

```text
```

## 3.12 Reset / focus

- [ ] `focus('cardNumber')`
- [ ] `focus('expiry')`
- [ ] `focus('cvc')`
- [ ] `focus('cardholderName')` when available
- [ ] `reset()` clears fields
- [ ] `reset()` clears errors
- [ ] `reset()` clears selected network
- [ ] `reset()` clears cached token
- [ ] State returns to initial

Issue:

```text
```

## 3.13 Double submit

- [ ] Double tap → one tokenization
- [ ] Double tap → one final confirm
- [ ] Completion handler fires once
- [ ] 3DS/redirect launches once

Issue:

```text
```

## 3.14 Post-confirm

- [ ] Immediate success
- [ ] 3DS
- [ ] DDC
- [ ] Redirect
- [ ] Processing
- [ ] Retrieve/poll
- [ ] Failure
- [ ] Cancellation
- [ ] Unknown outcome

Issue:

```text
```

---

# 4. Direct New-Card Payment

## 4.1 Strategy

- [ ] `vaulting_action = skip` selects Direct
- [ ] `skip` + Hyperswitch session still Direct
- [ ] `skip` + VGS session still Direct
- [ ] No PMS tokenization
- [ ] No VGS tokenization

Issue:

```text
```

## 4.2 Rendering

- [ ] Hyperswitch secure fields render
- [ ] VGS fields do not render
- [ ] Layout correct
- [ ] Split layout correct
- [ ] Fused layout correct
- [ ] RTL correct
- [ ] Merchant appearance correct
- [ ] Merchant localisation correct

Issue:

```text
```

## 4.3 Valid payment

- [ ] Valid PAN
- [ ] Valid expiry
- [ ] Valid CVC
- [ ] Pay enabled only when appropriate
- [ ] No tokenization request
- [ ] `/payments/{id}/confirm` exactly once
- [ ] Request uses `payment_method_data.card`
- [ ] PAN normalized correctly
- [ ] Expiry normalized correctly
- [ ] CVC sent correctly
- [ ] Cardholder name sent correctly if applicable
- [ ] Selected card network sent correctly if applicable
- [ ] Payment succeeds

Issue:

```text
```

## 4.4 Validation

- [ ] Empty PAN
- [ ] Incomplete PAN
- [ ] Invalid PAN
- [ ] Empty expiry
- [ ] Incomplete expiry
- [ ] Invalid expiry
- [ ] Expired card
- [ ] Empty CVC
- [ ] Incomplete CVC
- [ ] Invalid CVC
- [ ] No confirm on validation failure
- [ ] Sheet stays open
- [ ] Correct-and-retry works

Issue:

```text
```

## 4.5 Eligibility

- [ ] Allowed → payment continues
- [ ] Denied → confirm blocked
- [ ] Network failure follows intended contract
- [ ] Card changed in-flight does not use stale result

Issue:

```text
```

## 4.6 Card schemes / co-badge

- [ ] Allowed scheme
- [ ] Disallowed scheme
- [ ] Co-badge chooser appears
- [ ] Select network A
- [ ] Select network B
- [ ] Correct `card_network` reaches confirm

Issue:

```text
```

## 4.7 Cardholder name

- [ ] collect
- [ ] external
- [ ] omit
- [ ] Invalid ownership combination

Issue:

```text
```

## 4.8 Legacy auth

If legacy `publishable-key + client_secret` remains supported:

- [ ] Direct new-card payment without `sdkAuthorization`
- [ ] `api-key` header correct
- [ ] `client_secret` sent where required
- [ ] Payment succeeds

If intentionally retired:

- [ ] Failure is explicit and correctly named
- [ ] Failure is not misleadingly generic `invalid_session`

Issue:

```text
```

## 4.9 Confirm failures

- [ ] Offline
- [ ] Timeout
- [ ] 400
- [ ] Unauthorized
- [ ] Payment rejected
- [ ] Expired session
- [ ] 500
- [ ] Malformed response
- [ ] Unknown outcome
- [ ] Retry after failure

Issue:

```text
```

## 4.10 Double submit

- [ ] One confirm request
- [ ] One completion callback
- [ ] One next-action launch

Issue:

```text
```

## 4.11 Post-confirm

- [ ] Immediate success
- [ ] 3DS
- [ ] Redirect
- [ ] DDC
- [ ] Processing
- [ ] Poll/retrieve
- [ ] Cancellation
- [ ] Failure
- [ ] Unknown outcome

Issue:

```text
```

---

# 5. Standalone Vault Library — `tokenize()` Only

Merchant root:

```text
@juspay-tech/react-native-hyperswitch-vault
```

No payment confirm should occur.

## 5.1 Root API surface

- [ ] Root import works
- [ ] Provider/form API works
- [ ] Individual field imports work
- [ ] `tokenize()` available
- [ ] `reset()` available
- [ ] `focus()` available
- [ ] `confirmPayment()` NOT available on merchant root
- [ ] Eligibility API NOT exposed on merchant root
- [ ] Confirm input types NOT exposed
- [ ] Payment result types NOT exposed
- [ ] Next-action types NOT exposed
- [ ] Merchant does not need `/host`

Issue:

```text
```

## 5.2 Minimal integration

- [ ] Render minimal merchant form
- [ ] Pass session
- [ ] Pass environment
- [ ] Enter valid card
- [ ] Call `tokenize()`
- [ ] Tokenization succeeds
- [ ] Token returned
- [ ] No `/payments/{id}/confirm`
- [ ] No payment next action

Issue:

```text
```

## 5.3 Token result

- [ ] Success contains intended token
- [ ] No PAN in result
- [ ] No CVC in result
- [ ] No raw expiry in result
- [ ] No payment confirm result
- [ ] Error union contains only merchant-relevant tokenize codes

Issue:

```text
```

## 5.4 Session lifecycle

- [ ] Session initially `undefined`
- [ ] Fields can mount before session arrives
- [ ] Valid session arrives later
- [ ] Tokenization becomes available
- [ ] Invalid session handled
- [ ] Expired session handled
- [ ] Replacement session handled
- [ ] Session change invalidates cached token correctly
- [ ] `session={null}` works if supported

Issue:

```text
```

## 5.5 `canTokenize`

Only if implemented.

- [ ] Empty fields → false
- [ ] Incomplete card → false
- [ ] Invalid card → false
- [ ] Valid card + valid session → true
- [ ] Submitting → false
- [ ] Invalid session → false

Issue:

```text
```

## 5.6 Validation

- [ ] Empty PAN
- [ ] Incomplete PAN
- [ ] Invalid PAN
- [ ] Empty expiry
- [ ] Incomplete expiry
- [ ] Invalid expiry
- [ ] Expired card
- [ ] Empty CVC
- [ ] Incomplete CVC
- [ ] Invalid CVC
- [ ] Unsupported card
- [ ] No network request when local validation should block
- [ ] Correct tokenize validation error returned

Issue:

```text
```

## 5.7 Successful tokenization

- [ ] Exactly one tokenization request
- [ ] Token returned
- [ ] No payment confirm
- [ ] No next action
- [ ] Token result contains no unnecessary card data
- [ ] Repeated `tokenize()` follows intended cache/remint contract

Issue:

```text
```

## 5.8 Tokenization failures

- [ ] Network failure
- [ ] Timeout
- [ ] 4xx
- [ ] 5xx
- [ ] Malformed response
- [ ] Invalid/expired session
- [ ] Correct merchant error returned
- [ ] Fields remain usable
- [ ] Retry works after transient failure

Issue:

```text
```

## 5.9 Reset

- [ ] Clears card number
- [ ] Clears expiry
- [ ] Clears CVC
- [ ] Clears cardholder name if collected
- [ ] Clears errors
- [ ] Clears selected network
- [ ] Clears cached token
- [ ] State returns to initial

Issue:

```text
```

## 5.10 Focus / refs

- [ ] `focus('cardNumber')`
- [ ] `focus('expiry')`
- [ ] `focus('cvc')`
- [ ] `focus('cardholderName')` if available
- [ ] Field ref `focus()`
- [ ] Field ref `blur()`

Issue:

```text
```

## 5.11 Cardholder name — merchant root

### collect

- [ ] Name field renders
- [ ] Name accepted
- [ ] Name used where intended

### omit

- [ ] No name field
- [ ] No name sent

### Root contract

- [ ] `'external'` NOT exposed on merchant root

Issue:

```text
```

## 5.12 Appearance

- [ ] `primaryColor`
- [ ] `textColor`
- [ ] `errorColor`
- [ ] `placeholderColor`
- [ ] `backgroundColor`
- [ ] `borderColor`
- [ ] `borderRadius`
- [ ] `borderWidth`
- [ ] `fontFamily`
- [ ] `inputHeight`
- [ ] `gap`
- [ ] `fontScale`
- [ ] Placeholder size adjustment
- [ ] Error text size adjustment
- [ ] Error message spacing
- [ ] Brand icon mode

Issue:

```text
```

## 5.13 Per-field options

- [ ] Placeholder
- [ ] Floating label
- [ ] Static label if supported
- [ ] Hidden label
- [ ] Inline errors
- [ ] Errors hidden
- [ ] Accessibility label
- [ ] Accessibility hint
- [ ] Custom testID
- [ ] Brand icon mode
- [ ] CVC icon

Issue:

```text
```

## 5.14 Localisation

- [ ] Card-number label
- [ ] Expiry label
- [ ] CVC label
- [ ] Cardholder-name label
- [ ] Required messages
- [ ] Invalid messages
- [ ] Unsupported-card message
- [ ] RTL
- [ ] No unexpected fixed-English customer-facing error where localisation is expected

Issue:

```text
```

## 5.15 Composed layout

- [ ] Arbitrary field ordering works
- [ ] Card number full width
- [ ] Expiry + CVC row
- [ ] Merchant element can sit between fields
- [ ] Cardholder-name field can be omitted where allowed
- [ ] Validation still works
- [ ] Tokenization still works

Issue:

```text
```

## 5.16 `onStateChange`

- [ ] empty
- [ ] incomplete
- [ ] complete
- [ ] valid
- [ ] invalid
- [ ] touched
- [ ] focused
- [ ] blurred
- [ ] error
- [ ] brand
- [ ] co-badge state where applicable
- [ ] No PAN in callback
- [ ] No CVC in callback
- [ ] No raw expiry in callback
- [ ] No token in callback

Issue:

```text
```

## 5.17 `onFormStateChange`

- [ ] `fieldsReady`
- [ ] `sessionStatus`
- [ ] `complete`
- [ ] `valid`
- [ ] `submitting`
- [ ] `canSubmit` / `canTokenize` according to final API
- [ ] `brand`
- [ ] `isCoBadged`
- [ ] `fields`
- [ ] No PAN
- [ ] No CVC
- [ ] No raw expiry
- [ ] No token

Issue:

```text
```

---

# 6. Cross-Platform Checks

## Android

- [ ] Rendering
- [ ] Keyboard
- [ ] Focus
- [ ] Validation
- [ ] Submit
- [ ] Reset
- [ ] 3DS/redirect
- [ ] Back button
- [ ] Background/foreground

Issue:

```text
```

## iOS

- [ ] Rendering
- [ ] Keyboard
- [ ] Focus
- [ ] Validation
- [ ] Submit
- [ ] Reset
- [ ] 3DS/redirect
- [ ] Background/foreground

Issue:

```text
```

## RN-Web

- [ ] Rendering
- [ ] Focus
- [ ] Validation
- [ ] Submit
- [ ] Reset
- [ ] Redirect/3DS
- [ ] Browser refresh/navigation behavior

Issue:

```text
```

---

# 7. Security Regression Checklist

- [ ] PAN never reaches client-core
- [ ] CVC never reaches client-core
- [ ] Raw expiry never reaches client-core
- [ ] VGS aliases never become fake BIN
- [ ] VGS aliases never become fake last4
- [ ] Payment token does not escape payment flows
- [ ] Only explicit standalone `tokenize()` returns a token
- [ ] Exactly one new-card `/payments/{id}/confirm` transport
- [ ] Unknown vaulting config never fails open to Direct
- [ ] Unsupported provider fails before tokenization
- [ ] Merchant callbacks contain only safe state
- [ ] Merchant root has no host-only payment API
- [ ] `/host` carries host confirm API
- [ ] `/orchestration` remains separate
- [ ] No PAN/CVC/raw expiry in logs
- [ ] No provider aliases in client-core logs/events

Issue:

```text
```

---

# 8. Merchant Compatibility Checklist

- [ ] Existing card layout preserved
- [ ] Split/fused layout preserved
- [ ] Merchant appearance preserved
- [ ] Merchant localisation preserved
- [ ] Test IDs preserved
- [ ] Accessibility preserved
- [ ] Cardholder-name behavior preserved
- [ ] Disabled/loading behavior preserved
- [ ] Co-badge preserved where supported
- [ ] Scan-card preserved where supported
- [ ] `FORM_STATUS` correct
- [ ] `PAYMENT_METHOD_INFO_CARD` follows final decision
- [ ] Success callback once
- [ ] Failure callback once
- [ ] Post-confirm behavior preserved

Issue:

```text
```

---

# 9. Open Product / Backend Decisions

## ActionAbsent

- [ ] Final behavior decided
- [ ] Behavior tested

```text
Decision:
```

## `PAYMENT_METHOD_INFO_CARD`

- [ ] Final behavior decided
- [ ] Behavior tested

```text
Decision:
```

## Legacy `publishable-key + client_secret`

- [ ] Supported/retired decision made
- [ ] Correct behavior tested

```text
Decision:
```

## VGS Route

- [ ] Route source decided
- [ ] Real route tested

```text
Decision:
```

## VGS Eligibility

- [ ] Final behavior decided
- [ ] Behavior tested

```text
Decision:
```

## Scan-card dependency model

- [ ] Default vs optional install decided
- [ ] Correct behavior tested

```text
Decision:
```

---

# 10. Final Flow Sign-Off

## VGS

- [ ] Functional
- [ ] UI
- [ ] Validation
- [ ] Failure cases
- [ ] Security
- [ ] Post-confirm
- [ ] Android
- [ ] iOS
- [ ] RN-Web
- [ ] Real backend E2E

```text
Final status: PASS / FAIL / BLOCKED
Issues:
```

## Hyperswitch Vault

- [ ] Functional
- [ ] UI
- [ ] Validation
- [ ] Eligibility
- [ ] Co-badge
- [ ] Scan-card
- [ ] Failure cases
- [ ] Security
- [ ] Post-confirm
- [ ] Android
- [ ] iOS
- [ ] RN-Web
- [ ] Real backend E2E

```text
Final status: PASS / FAIL / BLOCKED
Issues:
```

## Direct Payment

- [ ] Functional
- [ ] UI
- [ ] Validation
- [ ] Eligibility
- [ ] Failure cases
- [ ] Security
- [ ] Post-confirm
- [ ] Android
- [ ] iOS
- [ ] RN-Web
- [ ] Real backend E2E

```text
Final status: PASS / FAIL / BLOCKED
Issues:
```

## Standalone `tokenize()`

- [ ] Merchant root API
- [ ] Session lifecycle
- [ ] Validation
- [ ] Tokenization
- [ ] Failure cases
- [ ] Reset/focus
- [ ] Appearance
- [ ] Localisation
- [ ] Security
- [ ] Android
- [ ] iOS
- [ ] RN-Web
- [ ] Real backend E2E

```text
Final status: PASS / FAIL / BLOCKED
Issues:
```

---

# 11. Issues Found

## ISSUE-001

```text
Flow:
Platform:
Severity:
Test case:
Expected:
Actual:
Reproduction steps:
Logs/request IDs:
Screenshot/video:
Suspected owner:
Status:
Notes:
```

## ISSUE-002

```text
Flow:
Platform:
Severity:
Test case:
Expected:
Actual:
Reproduction steps:
Logs/request IDs:
Screenshot/video:
Suspected owner:
Status:
Notes:
```

---

# 12. Final Release Readiness

- [ ] VGS required cases pass
- [ ] Hyperswitch Vault required cases pass
- [ ] Direct required cases pass
- [ ] Standalone tokenize required cases pass
- [ ] Security regression checklist passes
- [ ] Product decisions resolved
- [ ] No P0 issues open
- [ ] No P1 issues open
- [ ] Published versions replace local portal/symlink plumbing
- [ ] Clean install succeeds
- [ ] Android clean build succeeds
- [ ] iOS clean build succeeds
- [ ] RN-Web production build succeeds
- [ ] Final package/tarball verification succeeds

```text
Final verdict: READY / NOT READY / BLOCKED

Remaining blockers:
1.
2.
3.
```
