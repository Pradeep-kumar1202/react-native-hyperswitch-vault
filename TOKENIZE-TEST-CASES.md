# Merchant `tokenize()` flow — complete test cases and edge cases

Scope: the package root of `@juspay-tech/react-native-hyperswitch-vault` as a merchant integrates it —
`session → HyperswitchVaultFormProvider + four fields → tokenize() → token`. Nothing here touches
`confirmPayment()`, eligibility or the `./host` entry.

Every expected result below is read from the code (`VaultFormCoordinator`, `VaultConfirm`,
`VaultResult`, `CardStateReducer`, `CardFieldLogic`, `VaultFormHost`, `VaultEndpoint`,
`VaultPublicState`, sdk-utils `Validation`), not from the docs. Where the docs disagree with the code
the case says so.

Mark `[x]` when a case passes. Cases tagged **(auto)** already run in `example/__tests__`; run them
with `cd example && ../node_modules/.bin/jest`. Everything else is manual or needs a new test.

```text
Issue:
Expected:
Actual:
Platform:
Reproduction:
Notes:
```

---

# Setup — what to pass, and where to change it for each section

Everything the merchant surface takes lives in three places: the **provider**, the **four fields**,
and the **ref**. In the example app those are all in `example/App.tsx`; the server address is in
`example/src/merchantServer.ts`; the backend credentials are in `example-server/.env`.

## S1. Get the baseline flow running (do this once)

1. `example-server/.env` — copy from `.env.example`, set `HYPERSWITCH_API_KEY`, `HYPERSWITCH_PROFILE_ID`,
   `HYPERSWITCH_CUSTOMER_ID`, `HYPERSWITCH_ENVIRONMENT=sandbox`. Start it: `cd example && yarn server`.
   Check `curl localhost:3001/health` → `"mode":"live"`.
2. `example/src/merchantServer.ts` — `LAN_OVERRIDE`: `null` for the emulator / iOS simulator,
   `'http://<your Wi-Fi IP>:3001'` for a physical phone. `MERCHANT_SERVER_PORT` must match `PORT`.
3. `example/App.tsx` — the provider:
   - `environment="sandbox"` — must equal the server's `HYPERSWITCH_ENVIRONMENT`.
   - `session={session}` — the object returned by `fetchMerchantSession()`, passed verbatim.
   - `ref={formRef}` — `useRef<VaultFormHandle>(null)`; this is what you call `tokenize()` on.
   - `onFormStateChange={s => setCanSubmit(s.canSubmit && s.sessionStatus === 'valid')}` — gates the button.
4. `example/App.tsx` — inside the provider, exactly one `<CardNumberField />`, `<CardExpiryField />`,
   `<CardCVCField />`; `<CardholderNameField />` optional.
5. `example/App.tsx` — the button calls `formRef.current?.tokenize()`; on `status === 'success'` the
   token is in `result.token`, otherwise the text to show is `result.error.message`.
6. Launch on the target device. Spinner → form. Type `4242 4242 4242 4242`, a future expiry, `123`,
   press **Save card** → a token is displayed.

## S2. The provider props (all on `<HyperswitchVaultFormProvider>` in `App.tsx`)

| Prop | Required | Type | Value to pass |
| --- | --- | --- | --- |
| `environment` | yes | `'sandbox' \| 'production' \| 'integration'` | the environment the session was minted in |
| `session` | for `tokenize()` | `MerchantSession` | the session-tokens response body, verbatim; `undefined` while loading, never `null` |
| `ref` | to call `tokenize()` | `VaultFormHandle` | `useRef<VaultFormHandle>(null)` |
| `onFormStateChange` | recommended | `(state: VaultFormState) => void` | your button gate |
| `children` | yes | JSX | the fields |
| `appearance` | no | `VaultFormAppearance` | colours, radius, height, font |
| `localisation` | no | `VaultFormLocalisation` | `labels`, `validationMessages`, `isRtl` |
| `enabledCardSchemes` | no | `string[]` | exact names: `Visa`, `Mastercard`, `AmericanExpress`, `DinersClub`, `Discover`, `JCB`, `CartesBancaires`, `Interac`, `Maestro`, `UnionPay`, `RuPay`, `SODEXO`, `BAJAJ` |
| `cardholderName` | no | `'collect' \| 'omit'` | default `'collect'` |
| `disabled` / `unstyled` / `accessible` | no | `boolean` | |
| `vaultEndpoint` | no | `{baseUrl: string}` | self-hosted vault only |

## S3. The field props (on each `<Card…Field>` in `App.tsx`; all optional)

| Prop | Type | Fields |
| --- | --- | --- |
| `placeholder`, `label` | `string` | all |
| `labelBehavior` | `'floating' \| 'static' \| 'none'` | all |
| `errorDisplay` | `'inline' \| 'none'` | all |
| `styles` | `VaultFieldStyles` (`root`, `container`, `input`, `placeholder`, `label`, `error`, `accessory`) | all (expiry has no `accessory`) |
| `onStateChange` | `(state) => void` | all |
| `accessibilityLabel`, `accessibilityHint`, `testID` | `string` | all |
| `unstyled` | `boolean` | all |
| `brandIconMode` | `'standard' \| 'animated' \| 'hidden' \| 'hideGeneric'` | number only |
| `cvcIcon` | `'default' \| 'none'` | CVC only |
| `ref` | `VaultFieldHandle` = `{focus(), blur()}` | all |

## S4. The ref (what the button calls)

| Method | Returns |
| --- | --- |
| `tokenize()` | `{status:'success', token}` or `{status:'validation_error' \| 'not_ready' \| 'error', error:{code, message}}` |
| `reset()` | nothing; clears values, errors, co-badge pick, cached token |
| `focus('cardNumber' \| 'expiry' \| 'cvc' \| 'cardholderName')` | nothing |

## S5. Section by section — the one knob to turn, and where

| Section | Change this | Where |
| --- | --- | --- |
| 1 Root API surface | nothing at runtime; write the negative snippets in a `.tsx` and run `tsc` | `example/` (or `type-tests/consumer.tsx` in the library) |
| 2.1 Backend session | `.env` values; watch the server log | `example-server/.env`, `example-server/merchant-server.mjs` |
| 2.2–2.4 Session shapes | replace `session={session}` with a literal object per row, e.g. `session={{}}`, `session={{vault_details:{vault_type:'vgs'}}}`, garbage `sdk_authorization` | `App.tsx` provider |
| 2.5 Late / replaced session | keep the fetch, add a "new session" button that calls `fetchMerchantSession().then(setSession)`; for the in-flight case press it while the spinner shows | `App.tsx` |
| 2.6 Environment mismatch | `environment="production"` with a sandbox `.env` | `App.tsx` provider |
| 3 Presence gate | comment out one field; duplicate one field | `App.tsx` children |
| 4 Card number | type the PANs listed in §0; for 19 digits use `4000000000000000006` | on device |
| 5 Expiry | type `00/30`, `13/30`, the current month, `12/98`, `12/99` | on device |
| 6 CVC | Amex PAN with `123` then `1234` | on device |
| 7 Card schemes | `enabledCardSchemes={['Visa']}`, then `['visa']` (wrong casing), then `[]` | `App.tsx` provider |
| 8 Co-badge | `enabledCardSchemes={['RuPay','Discover']}` and PAN `6522000000000006`; then `['RuPay']` alone | `App.tsx` provider |
| 9 Cardholder name | add / remove `<CardholderNameField />`; `cardholderName="omit"`; inspect `card_holder_name` in the request | `App.tsx` provider and children; network inspector |
| 10 Gate order | press Save with: empty form; invalid card and `session={undefined}`; valid card and no session | `App.tsx` provider + device |
| 11 Request contract | inspect the request to `/v1/payment-method-sessions/*/confirm` | network inspector |
| 12.1–12.3 Responses | `vaultEndpoint={{baseUrl:'http://10.0.2.2:5252'}}` pointing at a local stub that returns each body / status; or reuse a session twice (`IR_16`), wait for expiry (`IR_24`) | `App.tsx` provider + a stub server |
| 12.4 Transport | airplane mode after pressing Save; unmount the screen mid-request | device |
| 13 Cache and concurrency | press Save twice fast; press Save, edit one digit, press again; press `reset()` then Save | device + a "Reset" button wired to `formRef.current?.reset()` in `App.tsx` |
| 14 `reset()` | a "Reset" button as above | `App.tsx` |
| 15 Focus / refs | buttons calling `formRef.current?.focus('cvc')`; `React.createRef<VaultFieldHandle>()` on a field and call `.focus()` / `.blur()` | `App.tsx` |
| 16 State emission | `onFormStateChange={logFormState}` and `onStateChange={logFieldState}` from `example/src/eventLog.ts`; read Metro logs | `App.tsx` provider and fields |
| 17 Error display | `errorDisplay="none"` on a field and draw `state.error?.message` yourself; `appearance={{errorColor:'#...'}}` | `App.tsx` fields / provider |
| 18 Provider behaviour | `disabled`, `unstyled`, `accessible` on the provider; `unstyled` on one field | `App.tsx` provider / field |
| 19 Localisation | `localisation={{labels:{cardNumberPlaceholder:'Número'}, validationMessages:{cardNumberInvalid:'…'}, isRtl:true}}` | `App.tsx` provider |
| 20 Endpoints | `vaultEndpoint={{baseUrl:'http://localhost:5252'}}` under `sandbox`, then under `production`; URL with `?q=1` | `App.tsx` provider |
| 21 Scan card | `@juspay-tech/react-native-hyperswitch-scancard` is already in `example/package.json`; remove it to test absence | `example/package.json` |
| 22 Security | watch Metro / logcat / the inspector during a full flow | tooling |
| 23 Platform matrix | run the same `App.tsx` on each target; change `LAN_OVERRIDE` per device | `merchantServer.ts` |
| 24 End to end | take the token from the screen to your backend's confirm | your backend |

---

# 0. Preconditions and instrumentation

- [ ] `example-server` running in **live** mode (`/health` answers `{"status":"ok","mode":"live"}`)
- [ ] Server env: `HYPERSWITCH_ENVIRONMENT` matches the app's `environment` prop (sandbox ↔ `beta.hyperswitch.io`)
- [ ] App reaches the server from the target: emulator `10.0.2.2`, phone via `LAN_OVERRIDE`, iOS simulator `localhost`
- [ ] Request inspection available (Metro network tab, Flipper, or a proxy) for `/v1/payment-method-sessions/*/confirm`
- [ ] A way to mint a fresh session per attempt (relaunch, or a "new session" button)
- [ ] Test PANs: Visa `4242424242424242`, Amex `378282246310005`, Diners `36259600000004` (14), 19-digit Visa `4000000000000000006`, co-badged RuPay/Discover `6522000000000006`, Luhn-invalid `4242424242424241`
- [ ] Devices: Android emulator, Android phone, iOS simulator, iOS device; one with font scale ≥ 1.5; one in RTL

---

# 1. Root API surface (compile-time)

Run `tsc` against a file that imports from the root.

- [ ] `HyperswitchVaultFormProvider`, `CardNumberField`, `CardExpiryField`, `CardCVCField`, `CardholderNameField` import
- [ ] `VaultFormHandle` is exactly `tokenize`, `reset`, `focus`
- [ ] `handle.confirmPayment` is a type error
- [ ] `eligibility` prop on the provider is a type error
- [ ] `cardholderName="external"` is a type error; `'collect' | 'omit'` compile
- [ ] `SafeVaultErrorCode` is exactly six codes; `'forbidden_card_data'` and `'card_not_eligible'` are type errors
- [ ] `VaultFormState.eligibility` and `VaultCardNumberState.eligibility` are type errors
- [ ] `localisation.validationMessages.cardNotEligible` is a type error
- [ ] `VaultPaymentResult`, `VaultPaymentConfirmInput`, `VaultNextAction`, `VaultHost*`, `VaultEligibility*` are not exported
- [ ] `session={null}` is a type error; `undefined` compiles (known ergonomics gap, R13)
- [ ] Runtime object still has `confirmPayment` (same object as `./host`); the merchant type hides it — expected

---

# 2. Session

## 2.1 Backend session creation (server side)

- [ ] `POST /payments` with `confirm: false` → `payment_id` + `sdk_authorization`; no money moves
- [ ] `POST /payments/session_tokens` authenticated with the intent's `sdk_authorization`, not the API key
- [ ] Response carries `vault_details.vault_type = "hyperswitch"` and `vault_data.sdk_authorization`
- [ ] Response returned to the app **verbatim** (no unwrapping)
- [ ] `Cache-Control: no-store` on the endpoint
- [ ] Profile without vaulting → server fails loudly (502), never forwards a session without `vault_details`
- [ ] Hyperswitch error bodies are not forwarded to the app
- [ ] `sdk_authorization` decodes (base64) to a `key=value,…` envelope containing `payment_method_session_id`

## 2.2 Session prop shapes → `state.sessionStatus`

| `session` prop | expected `sessionStatus` |
| --- | --- |
| not passed / `undefined` | `'absent'` |
| live session body | `'valid'` |
| `{}` (no `vault_details`) | `'invalid'` |
| `vault_details` without `vault_data` | `'invalid'` |
| `sdk_authorization: ""` or `"   "` | `'invalid'` |
| `vault_type: "vgs"` (another vault) | `'invalid'` |
| `vault_type: " Hyperswitch "` | `'valid'` (trimmed, case-insensitive) |
| `vault_type` missing | `'invalid'` |
| a string / array / number as the session | `'invalid'` |
| `sdk_authorization` present but garbage (not base64, or no `payment_method_session_id`) | **`'valid'`** — decoded only at `tokenize()` time, see 2.4 |

- [ ] Each row above

## 2.3 `tokenize()` with each unusable session (no request is sent)

| session | result | message |
| --- | --- | --- |
| absent | `error / invalid_session` | *No card-vault session was supplied.* |
| no `vault_details` | `error / invalid_session` | *This session does not support saving a card.* |
| blank credential | `error / invalid_session` | *This session is missing its vault details.* |
| other `vault_type` | `error / invalid_session` | *This session uses a card vault this component does not support.* |

- [ ] Each row; assert **zero** network calls
- [ ] Fields still render, validate and format with no session; only `tokenize()` needs it

## 2.4 Undecodable credential (the one that gets past `sessionStatus`)

- [ ] `sdk_authorization = "not-base64!!"` → `sessionStatus 'valid'`, `tokenize()` → `error / invalid_session` *This session can no longer be used.*, zero requests
- [ ] base64 of an envelope **without** `payment_method_session_id` → same result, zero requests
- [ ] base64 with an empty `payment_method_session_id=` → same

## 2.5 Late-arriving and replaced sessions

- [ ] Fields mount before the session; typing works; `sessionStatus 'absent'`
- [ ] Session arrives → one `onFormStateChange` with `sessionStatus 'valid'`; nothing else changes
- [ ] `canSubmit` is **true** with an absent session once the card is complete (documented footgun); button must also gate on `sessionStatus === 'valid'`
- [ ] Replace the `session` prop after a successful `tokenize()` → next `tokenize()` mints a **new** token (cache dropped)
- [ ] Replace the `session` prop **during** an in-flight `tokenize()` → the pending promise resolves `error / unknown_outcome`; `submitting` returns to false; no stuck spinner
- [ ] Replace with an identical session object (same credential) → cache kept, no re-mint
- [ ] Set the session back to `undefined` → `sessionStatus 'absent'`, next `tokenize()` → `invalid_session`

## 2.6 Environment mismatch

- [ ] Session minted on **sandbox**, provider `environment="production"` → request goes to `checkout.hyperswitch.io`, backend refuses → `error / server_error` (see 12.3 — not `invalid_session`), zero card data in the result
- [ ] Session minted on sandbox, `environment="integration"` → same shape of failure against `dev.hyperswitch.io`

---

# 3. Field presence gate (`not_ready`)

All refusals here send **zero** requests.

- [ ] No `CardNumberField` → `not_ready`, message *Card number must be mounted inside <HyperswitchVaultFormProvider> before submit().*
- [ ] No `CardExpiryField` → `not_ready`, names the expiry
- [ ] No `CardCVCField` → `not_ready`, names the CVC
- [ ] Two missing → one message naming both, comma-separated
- [ ] Two `CardNumberField`s → `not_ready`, *Only one Card number may be mounted …; found 2.*
- [ ] `CardholderNameField` absent → **not** a gate; `tokenize()` proceeds
- [ ] `CardholderNameField` mounted twice → `not_ready`
- [ ] Fields inside nested `View`s / a `ScrollView` / a conditional render → still registered
- [ ] Unmount a field after mount → `fieldsReady` flips to false and `tokenize()` → `not_ready`
- [ ] Remount → `fieldsReady` true again
- [ ] A field rendered **outside** any provider → renders nothing harmful / no crash (record actual behaviour)
- [ ] Two providers on one screen with their own fields → independent state, independent tokens

---

# 4. Card number

## 4.1 Validation by network (sdk-utils table)

| network | accepted lengths | CVC |
| --- | --- | --- |
| Visa | 13, 14, 15, 16, 19 | 3 |
| Mastercard | 16 | 3 |
| AmericanExpress | 14, 15 | 4 |
| DinersClub | 14–19 | 3 |
| Discover | 16 | 3 |
| JCB | 16 | 3 |
| CartesBancaires | 16–19 | 3 |
| UnionPay / Interac / Maestro / RuPay | per table | 3 |
| SODEXO / BAJAJ | 16 | 3 |

- [ ] Valid Luhn at an accepted length → `status 'complete'`, `valid true`
- [ ] Luhn-invalid `4242424242424241` → `invalid`, message *Card number is invalid.*
- [ ] Accepted length but Luhn fails → invalid
- [ ] Luhn-valid at an **unaccepted** length for the brand (e.g. 15-digit Visa-prefixed) → invalid
- [ ] 13-digit Visa (`4222222222222`) → valid
- [ ] 19-digit Visa: **focus auto-advances at 16 digits** (`isCardNumberEqualsMax`: max length OR 16) — user must tap back to type digits 17–19; record whether this is acceptable
- [ ] Amex 15 → valid; Amex 14 → valid per table
- [ ] Diners 14 → valid
- [ ] Unknown prefix (`1234…`) → brand `'unknown'`, generic icon, validity by Luhn + default lengths
- [ ] Empty after typing and deleting → `status 'empty'`, message *Card Number cannot be empty* after blur
- [ ] Incomplete (`4242 42`) → `status 'incomplete'`, `valid false`, no "invalid" message until blur

## 4.2 Formatting and input

- [ ] Grouping `4242 4242 4242 4242`; Amex `3782 822463 10005`
- [ ] Paste with spaces / dashes / letters → non-digits stripped
- [ ] Max length clamp: extra digits ignored
- [ ] Keyboard is numeric on both platforms
- [ ] Brand icon updates as the prefix changes; `brandIconMode` `hidden` / `hideGeneric` / `animated`
- [ ] Autofill / OS card suggestion (iOS) fills and formats correctly
- [ ] Rotating the device keeps the typed value

---

# 5. Expiry

- [ ] Typing `1230` renders `12 / 30`; slash inserted automatically
- [ ] Month `00`, `13`, `1x` → invalid, *Your card's expiration date is invalid.*
- [ ] Past year → invalid; past month in the current year → invalid
- [ ] **Current month, current year → valid**
- [ ] Future year up to `98` (2098) → valid; `99` → **invalid** (`year < 2099` rule)
- [ ] Single-digit month `1/30` → check padding behaviour and validity
- [ ] Incomplete `12 /` → `incomplete`, no message until blur
- [ ] Empty → *Card expiry date cannot be empty* after blur or submit
- [ ] Request carries `card_exp_month` two-digit and `card_exp_year` **four-digit** (`30` → `2030`)
- [ ] Backspace on empty expiry → focus returns to the card number
- [ ] Completing a valid expiry auto-advances focus to CVC

---

# 6. CVC

- [ ] 3 digits for Visa/Mastercard → valid; 4 → invalid for those brands
- [ ] Amex: 4 digits valid; 3 invalid, *Your card's security code is invalid.*
- [ ] Type CVC `123` first, then an Amex number → CVC becomes invalid (re-validated against the new brand)
- [ ] Unknown brand → accepts the default length set
- [ ] Masked (`secureTextEntry`) on both platforms; no plaintext flash
- [ ] Non-digits rejected
- [ ] Empty → *CVC Number cannot be empty* after blur or submit
- [ ] Backspace on empty CVC → focus returns to expiry
- [ ] `cvcIcon="none"` removes the glyph; `"default"` shows it

---

# 7. Card schemes (`enabledCardSchemes`)

- [ ] `[]` / prop absent → no restriction
- [ ] `['Visa']` + Mastercard number → *Card brand is not supported.*, `state.networkError` set, `valid false`, `canSubmit false`, `tokenize()` → `validation_error`
- [ ] Network judged **only when the number is complete**: an incomplete Mastercard shows no unsupported message
- [ ] Wrong casing `['visa']` or `['American Express']` → **silently never matches**: every card of that network is unsupported (record; R3)
- [ ] Changing `enabledCardSchemes` at runtime re-evaluates the typed card
- [ ] `SODEXO` / `BAJAJ` cards tokenize but send **no** `card_network` (no backend enum member)

---

# 8. Co-badge

- [ ] `6522000000000006` with `['RuPay','Discover']` → chooser appears at 16 digits; `isCoBadged true`
- [ ] Same card with `['RuPay']` only → **no** chooser, brand RuPay, `isCoBadged false`
- [ ] Same card with `[]` (no restriction) → chooser offers both
- [ ] 15 digits typed → no chooser yet
- [ ] Pick RuPay → request body `card_network: "RuPay"`; pick Discover → `"Discover"` **(auto: coBadgeEligibilityScan "sends it on tokenize() as well")**
- [ ] Pick changes CVC length rule and the displayed brand mark
- [ ] Retype / edit the number → choice dropped, `isCoBadged` recomputed
- [ ] `reset()` drops the choice
- [ ] Chooser testIDs present (`CardNetworkTriggerTestId`, `CardNetworkHeadingTestId`, `CardNetworkOption-RuPay`)
- [ ] Chooser heading uses `localisation.labels.selectCardBrandLabel`
- [ ] Picking a network **after** a successful `tokenize()` → next `tokenize()` re-mints (pick bumps `cardVersion`)
- [ ] Which network was chosen is **not** reported in any snapshot (only `isCoBadged`)

---

# 9. Cardholder name

## 9.1 `cardholderName="collect"` (default)

- [ ] Field placed, `Ada Lovelace` → request `card_holder_name: "Ada Lovelace"`
- [ ] `  Ada  ` → trimmed to `Ada`
- [ ] Blank / whitespace-only → key **omitted** (not `""`)
- [ ] Field **not** placed → key omitted; `tokenize()` still succeeds
- [ ] Unicode / accented / very long name → sent verbatim (trimmed)
- [ ] Name is never in any snapshot; `fields.cardholderName` has `status`/`valid`/`touched` only; `valid` always true

## 9.2 `cardholderName="omit"`

- [ ] Field not placed → no `card_holder_name`
- [ ] Field **placed anyway** → it renders (merchant's choice) but the value is **not sent**

---

# 10. `tokenize()` gate order and results

Gates run in this order and each answers before any request:

1. presence → `not_ready`
2. validity (incl. network) → `validation_error`
3. session usable → `error / invalid_session`
4. `vaultEndpoint` valid → `error / unsupported_configuration`
5. request

- [ ] Empty form + valid session → `validation_error`, **all** fields show messages, zero requests **(auto: defaultUi / placeholderLayout "never reaches tokenization")**
- [ ] Invalid card **and** no session → `validation_error` (validity gate wins), zero requests
- [ ] Valid card + no session → `invalid_session`, zero requests
- [ ] Valid card + session + invalid `vaultEndpoint` → `unsupported_configuration` *This payment cannot be completed with the current configuration.*, zero requests
- [ ] Missing field + invalid card → `not_ready` (presence gate wins)
- [ ] Message text on `validation_error` is *Please check your card details and try again.*
- [ ] Result union: `token` present only on `success`; `error` present on the other three (type + runtime)
- [ ] `tokenize()` never throws for any of the above (always resolves)
- [ ] `tokenize(anything)` — arguments ignored at runtime, type error at compile time

---

# 11. Request contract (inspect the wire)

- [ ] Method `POST`, URL `{vaultBase}/v1/payment-method-sessions/{id}/confirm` where `{id}` is the `payment_method_session_id` decoded from the credential, URL-encoded
- [ ] `Authorization` header = the raw `sdk_authorization` from `vault_details`; no `api-key`; `Content-Type: application/json`
- [ ] `x-app-id` absent (Flow 1 has no host input)
- [ ] Body exactly: `payment_method_type: "card"`, `payment_method_data.card` with `card_number` (no spaces), `card_exp_month`, `card_exp_year` (4-digit), `card_cvc`, optional `card_holder_name`, optional `card_network` (co-badge pick only)
- [ ] **No** `nick_name`, `client_secret`, `payment_method`, `billing`, `customer_acceptance`, `browser_info`, `email`, `return_url`
- [ ] Exactly one request per `tokenize()` that reaches the wire

---

# 12. Response handling

## 12.1 Success

- [ ] 2xx with `associated_payment_methods[0].payment_method_token.data` → `success`, `token` equals that string
- [ ] Token is the **only** member on the success result; no `card`, no metadata
- [ ] Response `payment_method_data.card` (last4, bin) is **not** surfaced anywhere

## 12.2 Malformed 2xx → `error / server_error` *The payment could not be completed.*

- [ ] 2xx non-JSON body
- [ ] 2xx JSON without `associated_payment_methods`
- [ ] 2xx with empty `payment_method_token.data`
- [ ] 2xx JSON that is an array / string

## 12.3 HTTP errors → `error / server_error` (message is always *The payment could not be completed.*)

- [ ] 400 `IR_05` / `IR_06` (card rejected by the vault)
- [ ] 401 / 403 `IR_00` / `IR_01` / `IR_03` (credential refused)
- [ ] 400 `IR_16` (session **already used**)
- [ ] 400 `IR_24` (session **expired**)
- [ ] 404 (unknown session id)
- [ ] 429, 500, 502, 503
- [ ] The backend's `error.message` text is **never** shown or included in the result
- [ ] **Finding:** every HTTP failure maps to `server_error`, including expired/used/unauthorised sessions. `invalid_session` is only produced locally (absent/unreadable/undecodable session). The merchant reference row for `invalid_session` ("or the vault rejected the credential") is wrong and is corrected alongside this document; consider mapping `IR_16`/`IR_24`/`IR_0x` to `invalid_session` so a merchant knows to fetch a new session (see summary)

## 12.4 Transport failures → `error / unknown_outcome`

- [ ] Airplane mode / DNS failure → `unknown_outcome`, message *We could not confirm the payment. Please check before trying again.* (**finding:** wording says "payment" on a tokenize result)
- [ ] Request aborted by unmount → `unknown_outcome`
- [ ] Request aborted by session replacement → `unknown_outcome`
- [ ] No client-side timeout exists: a hanging server keeps `submitting true` indefinitely (record; R7)
- [ ] Retrying after `unknown_outcome` mints again (a token **may** already exist on the backend — known, no idempotency key)

---

# 13. Concurrency and the token cache

- [ ] Double-tap Save → **one** request; both calls resolve the **same** promise / same token
- [ ] `tokenize()` while a `tokenize()` is in flight → same promise, no second request
- [ ] Success, no edits, `tokenize()` again → **same token, zero requests** (cache hit)
- [ ] Edit the number by one digit → next `tokenize()` sends a new request
- [ ] Edit expiry only → re-mint
- [ ] Edit CVC only → re-mint
- [ ] Edit cardholder name only → re-mint (bumps `cardVersion`)
- [ ] Co-badge pick → re-mint (8.)
- [ ] `reset()` → re-mint on next call; same session → backend stores the card **twice** (backend non-idempotency; record)
- [ ] Session replaced → re-mint (2.5)
- [ ] Unmount mid-flight → promise resolves `unknown_outcome`; **no** React state update after unmount (no warning); cache dropped
- [ ] Remount with the same session → cache empty → mints again
- [ ] `submitting` true from call until settle; fields non-editable and dimmed to 50 % meanwhile
- [ ] `reset()` during in-flight → **no-op** (values kept); after settle `reset()` works
- [ ] A failed mint (`server_error`) leaves **no** cache; next call requests again **(auto: bareMinimum "a refused token mint never reports success and makes no second call")**

---

# 14. `reset()`

- [ ] Clears number, expiry, CVC, cardholder name
- [ ] Clears inline errors and `touched` flags; `submitAttempted` cleared (no red borders after reset)
- [ ] Clears the co-badge choice and `isCoBadged`
- [ ] Clears the cached token (13.)
- [ ] Emits one `onFormStateChange` back to the initial snapshot (`complete false`, `valid false`, `canSubmit false`)
- [ ] Does **not** change focus
- [ ] Does not touch the `session` (sessionStatus unchanged)
- [ ] Calling `reset()` twice is harmless

---

# 15. Focus, refs, keyboard

- [ ] `focus('cardNumber' | 'expiry' | 'cvc' | 'cardholderName')` moves the keyboard
- [ ] `focus('cardholderName')` with the field not mounted → no-op, no crash
- [ ] Field ref `focus()` / `blur()` on each of the four
- [ ] Auto-advance: number complete → expiry; expiry valid → CVC; CVC complete → stays
- [ ] Auto-advance at 16 digits for 19-digit brands (4.1)
- [ ] Backspace chain: empty CVC → expiry; empty expiry → number; empty number → blur
- [ ] Tab / next on hardware keyboard (iPad, Android with keyboard) behaves
- [ ] `focused` flips in `onStateChange` on focus/blur; only one field `focused` at a time
- [ ] Keyboard dismiss (`keyboardShouldPersistTaps`) does not lose values

---

# 16. State emission (`onFormStateChange` / `onStateChange`)

- [ ] One emission on mount with the initial snapshot
- [ ] No emission for a keystroke that changes nothing observable (e.g. a rejected non-digit)
- [ ] Inline arrow callbacks are safe (no emission storm on re-render)
- [ ] `fieldsReady` true only with exactly one of each required field
- [ ] `complete` = number, expiry, CVC complete; `valid` = complete **and** network accepted
- [ ] `canSubmit` = `fieldsReady && sessionStatus !== 'invalid' && valid && !submitting` — true with **absent** session
- [ ] `sessionStatus` transitions 2.2 / 2.5
- [ ] `submitting` true only between call and settle
- [ ] `brand` on form and number snapshots; `'unknown'` before a prefix is typed
- [ ] `isCoBadged` per 8.
- [ ] `networkError` present only while an unsupported network is in force
- [ ] `fields.cardholderName` present **only** when the field is mounted
- [ ] `error` on a field present only when a message is currently on screen (after blur or submit); `errorDisplay="none"` still populates it
- [ ] `touched` set on blur and on submit attempt; `focused` never leaks across fields
- [ ] Structural leak check on every snapshot: no `value`, `pan`, `bin`, `last4`, `expiryMonth`, `expiryYear`, `cvc`, `token`, `sdkAuthorization`, no 12+ digit runs anywhere (the example's `eventLog.ts` guard)
- [ ] Snapshot after `reset()` equals the initial snapshot

---

# 17. Error display

- [ ] Default `errorDisplay="inline"`: message + border + text in `appearance.errorColor`
- [ ] Message timing: nothing while typing an incomplete value; appears on blur; appears on all fields on a `tokenize()` that fails validation
- [ ] `errorDisplay="none"`: nothing painted, `state.error` still carries the message
- [ ] Priority when several fail: number → expiry → CVC → network (only one line in a fused layout)
- [ ] Error text has `CardFieldErrorTestId`
- [ ] Custom `validationMessages` replace the defaults; `''` placeholder / label renders nothing
- [ ] `errorTextSizeAdjust` / `errorMessageSpacing` apply
- [ ] Long messages wrap without clipping at large font scale

---

# 18. Provider behaviour props

- [ ] `disabled` → all fields non-editable, dimmed; `tokenize()` while disabled still runs the gates (record actual: it does — disabled is a UI state)
- [ ] `unstyled` on provider → bare `TextInput`s; keyboard type, masking, length limits and accessibility labels survive; `tokenize()` works
- [ ] Field-level `unstyled` overrides the provider
- [ ] `accessible` → `accessible` set on each input
- [ ] Changing `environment` at runtime → next request uses the new host; in-flight request aborted (`unknown_outcome`)
- [ ] Changing `appearance` at runtime → repaint, no state loss

---

# 19. Localisation

- [ ] Every `labels.*` key replaces its default (9 keys)
- [ ] Every `validationMessages.*` key replaces its default (7 keys)
- [ ] Precedence: field `placeholder`/`label` → `localisation.labels` → default
- [ ] `isRtl: true` flips the co-badge chooser row; field arrangement is the merchant's
- [ ] `tokenize()` `error.message` strings are **English regardless** of `localisation` (by design; R6)
- [ ] Device locale changes do not alter library text (no implicit i18n)

---

# 20. `environment` and `vaultEndpoint`

| `environment` | host |
| --- | --- |
| `production` | `https://checkout.hyperswitch.io/api` |
| `sandbox` | `https://beta.hyperswitch.io/api` |
| `integration` | `https://dev.hyperswitch.io/api` |

- [ ] Each environment posts to its host when `vaultEndpoint` is absent
- [ ] `vaultEndpoint.baseUrl = "https://vault.example.com/api/"` → trailing slash trimmed, path kept
- [ ] `http://localhost:5252` / `http://127.0.0.1:5252` / `http://10.0.2.2:5252` accepted in sandbox/integration
- [ ] Any `http://` in **production** → `unsupported_configuration`, zero requests
- [ ] `http://192.168.1.5:5252` in sandbox → rejected (non-loopback cleartext)
- [ ] URL with credentials, query, fragment, or unparseable → rejected, zero requests
- [ ] Blank `baseUrl` → rejected
- [ ] Invalid endpoint is decided at `tokenize()` time (not at mount): fields still work

---

# 21. Scan card (optional package)

- [ ] `@juspay-tech/react-native-hyperswitch-scancard` installed → scan button on the right of the empty number field
- [ ] Scan result fills number + expiry through the same path as typing (validation, formatting, brand, auto-advance)
- [ ] Button disappears once the number is non-empty; hidden under `unstyled`
- [ ] Package absent → no button, no error
- [ ] Scanned values never appear in snapshots

---

# 22. Security and privacy

- [ ] No PAN/CVC/expiry/name in `onStateChange` / `onFormStateChange` (16.)
- [ ] Library emits **no** console logs; Metro/logcat show no card data or credential during a full flow
- [ ] Token appears only in the `success` result; the example renders it on screen deliberately (not a pattern)
- [ ] Session never persisted by the library (fresh process → no session)
- [ ] `Authorization` header not echoed in any result or log
- [ ] Response body never echoed; only the token string crosses back
- [ ] Screenshot/screen-recording: CVC masked
- [ ] Memory: after `reset()` the inputs are empty (no visual residue)

---

# 23. Platform and lifecycle matrix

Run 10.–13. on each:

- [ ] Android emulator (API 34+) · Android phone · iOS simulator · iOS device
- [ ] Font scale 1.5 / 2.0: labels, errors, inputs remain readable and tappable
- [ ] RTL device locale
- [ ] App backgrounded during the request → result delivered on return
- [ ] Airplane mode toggled mid-request → `unknown_outcome`
- [ ] Throttled network (3G profile) → `submitting` stays true; no duplicate request on impatience tap
- [ ] Rotation mid-typing keeps values and focus
- [ ] Hardware back / swipe-back during in-flight → unmount path (`unknown_outcome`, no warning)
- [ ] Hot reload / fast refresh during a session keeps the provider working (dev only)

---

# 24. End to end with the backend

- [ ] The token charges: backend `POST /payments/{id}/confirm` with `payment_token` + `customer_id` succeeds
- [ ] Token belongs to the `customer_id` the session was minted for
- [ ] Saved card appears in the customer's payment methods with the co-badge network that was picked
- [ ] Second `tokenize()` on the same session after `reset()` stores a second payment method (backend overwrites `associated_payment_methods`) — document, do not blind-retry
- [ ] A second app launch with a **new** session tokenizes independently

---

# Appendix — already automated in `example/__tests__`

| Case | File |
| --- | --- |
| Refused mint never reports success, no second call | `bareMinimum.test.tsx` |
| Co-badge pick is sent on `tokenize()` | `coBadgeEligibilityScan.test.tsx` |
| Placeholder text never reaches tokenization | `defaultUi.test.tsx`, `placeholderLayout.test.tsx` |
| Runtime handle shape (four members; root type narrows to three) | `merchantFacade.test.tsx` |
| Unstyled fields keep behaviour | `unstyled.test.tsx` |
| State emission carries no card value | `stateEvents.test.tsx`, `securityBoundary.e2e.test.tsx` |
| Focus / backspace chain | `vaultFormLifecycle.test.tsx`, `customWidgets.test.tsx` (via confirm; same reducer) |

Not yet automated for `tokenize()` specifically: 2.4, 2.5 (in-flight session swap), 3 (each gate message), 10 (gate order), 11 (exact body), 12.2–12.4 (each mapping), 13 (cache matrix), 20 (endpoint rules at tokenize time). The vault's own `scripts/verify-*` gates cover the mapping and endpoint rules at unit level; the list above is what a jest suite over the root entry should add.
