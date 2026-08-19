# hyperswitch-web Vault Contract — Investigation

> Phase 5 deliverable, updated after the session_tokens contract was confirmed.
>
> The investigation below was documentation-only; hyperswitch-web and hyperswitch-client-core were
> not modified and are not modified by the follow-up either. The confirmed contract in §1a has since
> been implemented in this library as `confirmPaymentMethodSession` (transport only).
>
> Every finding is tagged **Observed** (read directly from the live code path), **Inferred**
> (deduced from connected code, not executed) or **Unclear** (cannot be settled from the repos).

---

## 1. Investigation scope and repository commit

| Repository | Commit / state |
|---|---|
| hyperswitch-web | `main` @ `be7ac3457e91b71f3b4bb46f392c4f86bad879e7`, package version `0.132.0` |
| hyperswitch-client-core | `main` @ `1eea95c` + Phase 4 working tree |
| this library | `react-native-hyperswitch-vault`, sdk-utils pinned at `1669cc2` |

**Observed.** hyperswitch-web has **no `AGENTS.md`** anywhere. Its working tree was slightly dirty
at inspection time (`AD SDK_PROPS.md`, `M shared-code`); neither touches the vault path.

**Observed — search results.** Of the terms in the brief, several return **zero** hits in
hyperswitch-web's ReScript sources: `getVaultingAction`, `confirmPaymentMethod`,
`associated_token_id`, `psp_tokenization`, `storage_type`. `payment_method_session` appears in only
3 places. The vault implementation is therefore much smaller and differently named than the brief
assumed, and `getVaultingAction` belongs to client-core's sdk-utils, not to the web SDK.

---

## 1a. Confirmed contract (supersedes the Unclear markers below)

The following were **Unclear** during the investigation and are now **Confirmed**. Where a later
section still carries an Unclear tag on one of these points, this table wins.

| Item | Status | Value |
|---|---|---|
| Vault configuration source | **Confirmed** | the `session_tokens` response |
| Provider field | **Confirmed** | `vault_details.vault_type` |
| Vault authorization | **Confirmed** | `vault_details.vault_data.sdk_authorization` |
| `session_tokens` parsing owner | **Confirmed** | **client-core** (the host). The library never receives the response. |
| Payment-method-session confirmation owner | **Confirmed** | **the card library** (`confirmPaymentMethodSession`) |
| Subsequent payments confirm owner | **Confirmed** | **client-core** (the host) |

Confirmed response shape (structurally valid **fake** example — no real credential is stored in
this repository or in any fixture):

```json
{
  "vault_details": {
    "vault_type": "hyperswitch",
    "vault_data": { "sdk_authorization": "<REDACTED — fake fixture only>" }
  }
}
```

**Consequence for §12.** The client-core mismatch recorded below is now a *known work item*, not an
open question: client-core will read `vault_details` from `session_tokens`, extract
`vault_data.sdk_authorization`, and hand only that string (plus a trusted environment) to the
library. Client-core's `Utils.getSdkAuthorizationData` still does not extract
`payment_method_session_id`, but that no longer matters — **the library decodes the session id
itself**, so the host never needs to.

**Implemented in this phase:** `confirmPaymentMethodSession` (`src/VaultConfirm.res`), exposed at
`<package>/vault`. Still not implemented: session_tokens parsing inside the library, payment-confirm
integration, `CardFormElement`, and the standalone merchant wrapper.

---

## 2. Public Web SDK vaulting entry point

**Observed.** There is no merchant-facing "vault" API. Vaulting is **switched on by the server**, not
by the merchant's SDK call:

1. The `sessions` API response carries `vault_details.vault_type` — `"hyperswitch"`, `"vgs"`, or
   absent (`VaultHelpers.getVaultName`, `getVaultModeFromName`).
2. `VaultHelpers.getVaultCredentialsFromSessions` turns that into a `vaultCredentials` variant
   (`HyperswitchVault` | `VGS` | `NoVault`), stored in a Jotai atom inside the inner iframe.
3. `CardsSDK` dispatches on the variant to mount `HyperswitchVaultCardCollector` (or the VGS
   equivalent) instead of the ordinary card component.

So the merchant calls the normal payment-element API; the presence of `vault_details` in the
sessions response silently changes which collector renders and which network call the submit makes.

**Observed — two distinct vault providers.** `hyperswitch` (tokenize against Hyperswitch's own
payment-method-session API) and `vgs` (Very Good Security, alias-per-field). Only the Hyperswitch
provider is relevant to this library; the VGS branch is documented only where it clarifies the
shared shape.

---

## 3. `sdkAuthorization` lifecycle

**Observed — it is NOT opaque.** It is a base64 blob that the SDK decodes client-side.

- Source: `vault_details.vault_data.sdk_authorization` in the sessions response
  (`VaultHelpers.buildHyperswitchVaultConfig`).
- Decoded by `Utils.getSdkAuthorizationData`: `Window.atob` → `String.split(",")` → a list of
  `key=value` pairs, from which it reads `publishable_key`, `client_secret`, `customer_id`,
  `profile_id`, **`payment_method_session_id`** and `payment_id`.
- The comment in `VaultHelpers` is explicit: *"payment_method_session_id is embedded (base64) inside
  sdk_authorization, not sent as a separate field — decode it out."*
- It is then used verbatim as the `Authorization` header value (no `Bearer` prefix).

**Observed.** This vault-level `sdkAuthorization` is explicitly *distinct* from the merchant-level
one — see the comment on `hyperswitchVaultType.sdkAuthorization`.

**Inferred.** Because the session id is only obtainable by decoding, any consumer that receives the
token but not a separate session id must perform the same base64 decode. There is no API that
returns the session id independently.

---

## 4. Payment-method-session confirmation sequence

**Observed.** The live sequence for a new card:

```
ParentCardComponent (outer iframe)   forwards `sessions` atom to inner iframe
  PaymentMethodsSDK (inner iframe)   getVaultCredentialsFromSessions -> vaultCredentials atom
    HyperswitchVaultCardCollector    renders CardFields; owns validation + the network call
      submitCallback (on parent's submit message)
        if complete && isOuterValid  -> handleSaveCard()
        else                         -> reportCardFieldErrors()   (no request)
      handleSaveCard
        1. messageParentWindow({fullscreen: true, param: "paymentloader"})
        2. PaymentHelpersV2.savePaymentMethod(...)      <-- the confirm request
        3. messageParentWindow({cardTokenEvent: true, vaultResponse: <json>})
        (catch) messageParentWindow({cardTokenFail: true})
  ParentCardComponent  message handler
        decodeVaultTokenData(vaultResponse) -> token
        if token != ""  -> confirmBody(vaultBody, ~confirmParams)   <-- the PAYMENT confirm
        else            -> Console.error(...)   [no user-visible error]
```

**Observed — validation happens before the request**, entirely client-side, in the collector
(`complete` = `isAllValid(isCardValid, isCardSupported, isCVCValid, isExpiryValid, …)`).

**Observed — there is a second, different vault call** for saved cards: `CardCVCElement` →
`PaymentHelpersV2.updatePaymentMethod` (see §5.2).

---

## 5. Exact request contract

### 5.1 New-card tokenization — `savePaymentMethod`

**Observed** (`src/Utilities/PaymentHelpersV2.res:484`):

| Item | Value |
|---|---|
| Method | `POST` |
| URL | `${endpoint}/v1/payment-method-sessions/${pmSessionId}/confirm` |
| API version in path | **`v1`** — note this is a v1 path segment even though the feature belongs to the v2 API family |
| Base URL | `ApiEndpoint.getApiEndPoint()` — called with **no** `publishableKey` and **not** `getVaultEndPoint` (see the trap below) |
| Session id placement | path segment |
| Auth header | `Authorization: <sdkAuthorization>` — raw, no scheme prefix |
| Extra header | `ApiEndpoint.addCustomPodHeader(~customPodUri="")` → adds `x-feature` only when non-empty; here always empty, so nothing added |
| Profile header | **none** |
| Idempotency header | **none** |
| Abort signal | not passed (`fetchApi` supports `~signal`, this call omits it) |
| Timeout | **none** |

**Observed — headers actually sent.** `fetchApi` → `Utils.getHeaders` merges
`[...defaultHeaders, ...authorizationHeaders, ...authHeader, ...customPodHeader, ...headers]`:

- `Content-Type: application/json`
- `X-Client-Version`, `X-Payment-Confirm-Source: sdk`, `X-Browser-Name`, `X-Browser-Version`,
  `X-Client-Platform: web`
- `Authorization: <sdkAuthorization>` (from the explicit headers, last wins)
- **`api-key: invalid_key`** — because `savePaymentMethod` passes its auth through the `headers`
  dict but not through `fetchApi`'s `~sdkAuthorization` parameter, `getHeaders` takes the `None`
  branch and emits the literal fallback `"invalid_key"`. **Unclear** whether the backend ignores it
  when `Authorization` is present; it is a different header key, so both are transmitted.

**Observed — body** (`PaymentBody.cardTokenizationBody`):

```json
{
  "payment_method_type": "card",
  "payment_method_data": {
    "card": {
      "card_number": "<PAN, spaces stripped>",
      "card_exp_month": "<MM>",
      "card_exp_year": "<YY>",
      "card_cvc": "<CVC>"
    }
  }
}
```

- **PAN normalization: yes.** `cardNumber->CardValidations.clearSpaces` — spaces removed.
  (Contrast: hyperswitch-client-core submits the PAN *with* spaces — Phase 0 defect D8.)
- Expiry comes from `CardUtils.getExpiryDates(cardExpiry)` → `(month, year)`. **Unclear** whether
  the year is 2- or 4-digit; `getExpiryDates` was not located in this repo's `src/Utilities`.
- `card_cvc` is **always sent**, not optional, on this path.
- **No** card network / co-badge field.
- **No** billing fields.
- **No** `storage_type`, no `psp_tokenization`, no nickname.

### 5.2 Saved-card CVC — `updatePaymentMethod`

**Observed** (`PaymentHelpersV2.res:332`):

| Item | Value |
|---|---|
| Method | **`PUT`** |
| URL | `${endpoint}/v1/payment-method-sessions/${pmSessionId}/update-saved-payment-method` |
| Auth | `Authorization: <sdkAuthorization>` |
| Custom pod | `addCustomPodHeader(~customPodUri)` — here a real value may be passed |
| Body | `{"payment_method_data": {"card": {"card_cvc": "<CVC>"}}}` (`PaymentManagementBody.vaultUpdateCVVBody`) |

### 5.3 Base-URL trap

**Observed.** `ApiEndpoint` defines a dedicated vault selector:

```rescript
let getVaultEndPoint = (~publishableKey="") =>
  GlobalVars.isPciCompliant || GlobalVars.isLocal
    ? getApiEndPoint(~publishableKey)      // may be a self-hosted ENV_BACKEND_URL
    : hyperswitchVaultEndPoint(~publishableKey)  // checkout / dev / beta .hyperswitch.io
```

with the stated intent that *"a non-PCI merchant routes to Hyperswitch's hosted backend so raw card
data never reaches a self-hosted backend."*

**Observed — but `savePaymentMethod` does not use it.** It calls the plain
`ApiEndpoint.getApiEndPoint()`. Only `ParentCardComponent:440` uses `getVaultEndPoint`.

**Inferred — why this still holds on web.** The tokenization call runs *inside the nested vault
iframe*, and for a non-PCI merchant that iframe is served from Hyperswitch's own origin
(`hyperswitchVaultSdkUrl`), so the iframe's own build constants make `getApiEndPoint()` resolve to
the Hyperswitch host anyway. The PCI isolation is a property of **which origin serves the iframe**,
not of the endpoint expression.

**This is the single most important thing that does not transfer to React Native** — see §10.

---

## 6. Exact response contract

**Observed** (`VaultHelpers.decodeVaultTokenData`) — the SDK reads exactly five values:

| Field | Source path in the response |
|---|---|
| `token` | `associated_payment_methods[0].payment_method_token.data` |
| `last4Digits` | `payment_method_data.card.last4_digits` |
| `binNumber` | `payment_method_data.card.card_isin` (may be null) |
| `expiryMonth` | `payment_method_data.card.expiry_month` |
| `expiryYear` | `payment_method_data.card.expiry_year` |

**Observed — the short-lived token field is `associated_payment_methods[0].payment_method_token.data`.**
It is *not* a top-level `payment_method_token`, and it is *not* `associated_token_id` (that name
does not exist anywhere in the repo).

**Observed.** `payment_method_id` is never read by the vault path. No token exchange is performed.
No expiry/TTL handling exists for the token. The same decoder is reused for the saved-card CVC
response, so that endpoint is assumed to return the same envelope (**Inferred**).

**Observed — nothing is returned publicly.** The raw response never reaches the merchant. It is
posted from the inner iframe to the parent as `{cardTokenEvent: true, vaultResponse: <json>}` and
consumed internally; the merchant only ever sees the eventual *payment* result.

**Unclear.** The full success schema (other members of `associated_payment_methods`, status fields,
`payment_method_id`) cannot be established from the SDK because the SDK reads only those five
values. Requires backend/API-reference confirmation.

---

## 7. Token-to-payment-confirm flow

This is the contract question the brief flags as most important, and the two "confirms" are **not**
the same request.

**Observed.** hyperswitch-web performs the payment confirmation **itself**, in
`ParentCardComponent` immediately after decoding the token:

```rescript
if token !== "" {
  let vaultBody = GlobalVars.isPciCompliant
    ? PaymentBody.vaultCardBody(~token)
    : PaymentBody.vaultExternalCardBody(~token, ~last4Digits, ~binNumber, ~expiryMonth, ~expiryYear)
  confirmBody(vaultBody, ~confirmParams=confirm.confirmParams)
}
```

### 7.1 PCI-compliant merchants — `vaultCardBody`

```json
{ "payment_method": "card", "payment_method_type": "debit", "payment_token": "<token>" }
```

- Token field: **`payment_token`**.
- `payment_method_data` is **omitted entirely**.

### 7.2 Non-PCI merchants — `vaultExternalCardBody`

```json
{ "payment_method": "card", "payment_method_type": "debit",
  "payment_method_data": { "vault_card": {
      "card_cvc":       "<token>",
      "card_number":    "<token>",
      "card_exp_month": "<expiryMonth>",
      "card_exp_year":  "<expiryYear>",
      "last_four":      "<last4>",
      "bin_number":     "<bin>" } } }
```

- **The same token is placed in both `card_number` and `card_cvc`.** The source comment confirms
  this is deliberate: *"the Hyperswitch vault (single token reused for every field)"*.
- No `payment_token` field on this path.

### 7.3 Field-name contrast — the trap

| | payment-method-session confirm | payment confirm |
|---|---|---|
| `payment_method` | *absent* | `"card"` |
| `payment_method_type` | `"card"` | **`"debit"`** |
| card object key | `payment_method_data.card` | `payment_method_data.vault_card` (non-PCI) |
| token | n/a | `payment_token` (PCI) |

**Observed.** `payment_method_type` is hardcoded to `"debit"` in all three vault confirm bodies
(`vaultCardBody`, `vaultExternalCardBody`, `vgsVaultCardBody`) regardless of the actual card. This
looks unintended but is the live behaviour. **Unclear** whether the backend uses this value.

**Observed.** Guest vs customer sessions are not distinguished on this path, and there is no
pay-and-vault vs vault-only branch in the SDK — the vault call is always followed by a payment
confirm. **Inferred:** a vault-only flow would have to be driven by the server via
`vault_details`/session configuration, since the SDK has no such switch.

**Observed — failure of the second request** is handled by the ordinary payment-confirm error path
(`confirmBody`), not by anything vault-specific.

---

## 8. Error and retry behaviour

**Observed — the failure design is the weakest part of this path, and must not be copied verbatim.**

`savePaymentMethod` and `updatePaymentMethod` both do:

```rescript
->then(resp => if !(resp->Fetch.Response.ok) {
     resp->Fetch.Response.json->then(_ => JSON.Encode.null->resolve)   // error body discarded
   } else { Fetch.Response.json(resp) })
->catch(err => { Console.error2("Error ", err->formatException); JSON.Encode.null->resolve })
```

Consequences:

| Failure | Observed behaviour |
|---|---|
| Local validation failure | No request. `reportCardFieldErrors()` sets per-field messages. |
| Non-2xx (expired session, invalid auth, backend validation) | Promise **resolves with `null`**. The error body is parsed and thrown away — no code, no message. |
| Network failure | `catch` → `Console.error` → **resolves with `null`**. |
| Timeout | No timeout is configured; the request hangs indefinitely. |
| Aborted request | No `AbortSignal` is passed; abort is not supported. |
| Malformed response | Decodes to `token = ""` — same as failure. |
| Token missing from a 2xx response | `token = ""`. |
| Retries | **None.** No retry logic on any vault call. |

**Observed — the critical consequence.** Because failures *resolve* rather than reject, the
collector's `try/catch` never fires, so `cardTokenFail` is effectively unreachable for API failures.
The success branch runs with `vaultResponse = null`, `decodeVaultTokenData` yields `token = ""`, and
`ParentCardComponent` takes:

```rescript
} else { Console.error("ParentCardComponent: payment token not found in vaultResponse") }
```

— a console line only. **No merchant callback, no error UI, and the full-screen `paymentloader`
raised at the start of `handleSaveCard` is never dismissed.** The realistic failure mode of the
new-card vault path is a **silent hang**, not an error. Marked **Observed** from the code; not
executed.

**Observed — the saved-card CVC path is better.** `CardCVCElement` checks the empty token and calls
`postFailedSubmitResponse(~errortype="server_error", ~message="Something went wrong")`, and also has
a real `catch` doing the same. Only the new-card path has the silent-hang shape.

**Observed — public error shape** where it is reached: `postFailedSubmitResponse(~errortype, ~message)`,
e.g. `("server_error", "Something went wrong")` — a generic message, never the backend's.

**Do not treat any of these as retryable.** Nothing in the implementation retries, and no
idempotency key exists, so a retry of an unknown outcome could double-tokenize. **Unclear** whether
the backend makes `/confirm` idempotent — requires backend confirmation.

---

## 9. Loading and duplicate-submit behaviour

**Observed.**

- Loading is raised by the collector itself before the request:
  `messageParentWindow({fullscreen: true, param: "paymentloader"})`. It is never explicitly lowered
  on the empty-token path (§8).
- There is **no in-flight/`isSubmitting` guard** around `handleSaveCard`. The only gates are
  `confirm.doSubmit`, `complete` and `isOuterValid`.
- The de-duplication that does exist is at the parent: after `cardTokenEvent`, `vgsTokenEvent`,
  `cardTokenFail` or `submitSuccessful`, `ParentCardComponent` removes the message listener
  (`EventListenerManager.removeSmartEventListener`), so a second response is ignored.
- **Inferred.** Repeated submit messages arriving before the first response would each call
  `handleSaveCard` and issue another POST; in practice the full-screen loader overlay blocks further
  user interaction. That is a UI-level guard, not a state machine.

---

## 10. Web-specific implementation that must NOT be copied

**Observed.** All of the following are browser architecture with no React Native equivalent:

- **Nested iframe design.** Outer `ParentCardComponent` + inner `PaymentMethodsSDK` +
  `HyperswitchVaultCardCollector`. The whole vault-agnostic/vault-aware split exists to keep card
  fields inside a separate origin.
- **`postMessage` protocol** — `sessions`, `cardTokenEvent`, `vaultResponse`, `cardTokenFail`,
  `vgsTokenEvent`, `savedCardCvcTokenEvent`, `submitSuccessful`, `fullscreen`/`paymentloader`.
- **`EventListenerManager` / `window` message listeners** as the response and de-dup channel.
- **Origin-derived PCI isolation** (§5.3): serving the collector iframe from
  `hyperswitchVaultSdkUrl` so that `getApiEndPoint()` resolves to the Hyperswitch host. React Native
  has no origin, so **the library must select the vault base URL explicitly** rather than inheriting
  it from where the code was served. This is the most consequential non-transferable decision.
- `Window.atob` for base64 (RN needs its own decoder), `document`/DOM, CSS/Tailwind classes,
  Jotai atoms as the cross-iframe transport, `GlobalVars.isPciCompliant` as a build-time global.

---

## 11. Reusable library behaviour

**Observed** — safe to reuse as a contract (not as code):

- The session input shape: `sdkAuthorization` + the `payment_method_session_id` decoded from it.
- Request construction: method, path (`/v1/payment-method-sessions/{id}/confirm`), `Authorization`
  header, and the `payment_method_type` + `payment_method_data.card` body.
- PAN normalization (strip spaces before sending).
- Response decoding: `associated_payment_methods[0].payment_method_token.data` plus the four card
  metadata fields.
- The two payment-confirm body shapes and their PCI switch.
- Validate-before-submit ordering.

**Explicitly reusable only after redesign** (the web behaviour is defective, §8): error
categorisation, loading transitions and duplicate-submit. The library should reject on failure
rather than resolve `null`, must surface a real error instead of a console line, and must lower its
loading state on every path.

**Host responsibility** (neither library nor web SDK): merchant-server session creation,
client-core's `session_tokens` call, payment-confirm orchestration, redirect handling, and the
success/error UI.

---

## 12. Client-core session field comparison

**Observed.** The two consumers do **not** currently share a source for vault input.

| Web source field | Client-core source field | Proposed normalized library field | Confirmed? |
|---|---|---|---|
| `sessions.vault_details.vault_data.sdk_authorization` | `nativeProp.paymentSessionConfig.sdkAuthorization` (`SdkTypes.res:337`), supplied by the **merchant as a native prop** | `sdkAuthorization` | **Both exist, sources differ** (Observed) |
| `payment_method_session_id`, decoded from that token (`Utils.getSdkAuthorizationData`) | **not extracted** — client-core's `Utils.getSdkAuthorizationData` returns only `publishableKey`, `paymentId`, `clientSecret`, `customerId`, `profileId` | `paymentMethodSessionId` | **Gap** (Observed) |
| `sessions.vault_details.vault_type` (`"hyperswitch"` / `"vgs"`) | **absent** — `vault_details` / `vault_data` appear nowhere in client-core | `vaultProvider` | **Missing** (Observed) |
| `profile_id` decoded from the token | `profileId` decoded from the token — same envelope | `profileId` | **Match** (Observed) |
| `ApiEndpoint.getApiEndPoint()` / `getVaultEndPoint` | `GlobalHooks.useGetBaseUrl()` / `HeadlessUtils.getBaseUrl` (`customEndpoints` + `environment`) | `baseUrl` | Both exist, different selectors (Observed) |
| *(no equivalent)* | `SdkConfigTypes.getVaultingAction` → `Tokenize \| Skip`, from `sdk_config.account_config.profile.vaulting_action` | `vaultingEnabled` | **client-core only, and currently uncalled** (Observed) |

**Observed — encouraging.** Both repositories already decode the *same* base64 envelope with the
same comma-separated `key=value` grammar (`Utils.getSdkAuthorizationData` in each). Client-core
simply does not read the `payment_method_session_id` key.

**Observed — the blocking mismatches.**

1. **Client-core has no `vault_details`.** It cannot learn the vault provider, and it has no
   sessions-response path carrying vault credentials. It learns only *whether* to vault, from a
   completely different source (`vaulting_action` in the superposition sdk-config) — and that
   function is not called anywhere in client-core today.
2. **Client-core never calls `payment-method-sessions`.** Grep for `payment-method-session` in
   client-core `src/` returns nothing.
3. The web token is scoped to a vault-specific `sdkAuthorization` that is explicitly distinct from
   the merchant-level one; client-core has only a merchant-level `sdkAuthorization` from native
   props. **Unclear** whether these are the same envelope with the same claims.

Per the brief, this mismatch is **documented, not adapted**. Both consumers *can* be normalized only
if either (a) client-core's session response starts carrying `vault_details`, or (b) the merchant
passes a vault `sdkAuthorization` whose envelope embeds `payment_method_session_id`. Neither is true
today.

---

## 13. Proposed normalized library input

Conceptual, using the names actually found in the implementations. **Not implemented in this phase.**

Shared normalized input (`VaultSession`):

| Field | Source | Required |
|---|---|---|
| `sdkAuthorization` | **Confirmed**: `vault_details.vault_data.sdk_authorization` from `session_tokens`, extracted by the host | yes |
| `environment` | trusted environment supplied by the host; selects the vault host (§10) | yes |
| ~~`paymentMethodSessionId`~~ | **Not an input.** The library decodes it from `sdkAuthorization` itself, so the host never handles it. | no |
| ~~`profileId`~~ | **Not an input.** No observed request sends it. | no |

**Implemented as `VaultConfirm.confirmRequest`:** `{sdkAuthorization, environment, card}`. The
complete `session_tokens` response is deliberately **not** accepted.

- **Embedded client-core** would additionally need a signal that vaulting applies. Today the only
  candidate is `vaulting_action` (`Tokenize`/`Skip`), which is a different mechanism from web's
  `vault_details.vault_type`.
- **Standalone merchant** needs only the shared input, supplied by its own server.
- **Never publicly exposed:** the raw PAN/CVC, the raw API response, and the decoded contents of
  `sdkAuthorization` (it carries `client_secret`, `customer_id`, `publishable_key`).

---

## 14. Proposed structured result

Modelled on the five values the web SDK actually consumes — no raw response:

| Field | Source |
|---|---|
| `token` | `associated_payment_methods[0].payment_method_token.data` |
| `last4Digits` | `payment_method_data.card.last4_digits` |
| `binNumber` | `payment_method_data.card.card_isin` |
| `expiryMonth`, `expiryYear` | `payment_method_data.card.expiry_month` / `expiry_year` |

Consumers need the metadata only for the **non-PCI** confirm body (§7.2); a PCI consumer needs
`token` alone. Errors should be a typed category plus message — explicitly **not** the web's
resolve-with-`null`.

---

## 15. Security and sensitive-data boundaries

**Observed.**

- Raw PAN and CVC leave the collector only in the tokenization request body over HTTPS. They are
  never posted to the parent window and never surface in a merchant callback.
- The vault response is posted **whole** across the iframe boundary (`vaultResponse`) but stays
  inside the SDK.
- On the **non-PCI** payment confirm, the token is placed in `card_number` and `card_cvc` — these
  look like card fields but carry a token.
- `sdkAuthorization` is a decodable bearer of `client_secret`, `customer_id`, `publishable_key`,
  `profile_id`, `payment_method_session_id`. Treat it as a secret; never log it.
- The vault calls use plain `fetchApi`, **not** `fetchApiWithLogging`, so request/response bodies
  are not sent to the logging endpoint. On failure, `Console.error2` prints the formatted exception
  (no card data observed in that payload).

No real PAN, CVC, credential or token value appears in this document.

---

## 16. Unanswered questions

1. **Is `/v1/payment-method-sessions/{id}/confirm` the correct path for the v2 API family?** The SDK
   hardcodes a `v1` segment. The API reference the user cited
   (`api-reference.hyperswitch.io/v2/payment-method-session/...`) documents this under **v2**.
   Needs backend confirmation; the brief forbids letting public docs settle implementation fields.
2. **Expiry year shape** — 2-digit or 4-digit? `CardUtils.getExpiryDates` was not found in
   `src/Utilities`; its location and behaviour need confirming.
3. **Is `/confirm` idempotent?** No idempotency key is sent and nothing retries. Required before any
   retry policy can be designed.
4. **Does the backend reject or ignore the stray `api-key: invalid_key`** sent alongside
   `Authorization`?
5. **Full success schema** — the SDK reads only five fields; `payment_method_id`, status and the
   rest of `associated_payment_methods` are unverified.
6. **Is `payment_method_type: "debit"` on the payment confirm meaningful or a latent bug?**
7. **Is the vault-level `sdkAuthorization` the same envelope as client-core's merchant-level one?**
   This determines whether client-core can reuse its existing token.
8. **Is there a vault-only (no payment) flow?** None exists in the SDK.
9. **How should React Native choose the vault base URL** given that web derives PCI isolation from
   the iframe origin (§5.3)?

---

## 17. Source-file and symbol index

**hyperswitch-web** (`be7ac345`)

| File | Symbols |
|---|---|
| `src/Payments/VaultHelpers.res` | `vault`, `hyperswitchVaultType`, `vaultCredentials`, `getVaultName`, `getVaultModeFromName`, `buildHyperswitchVaultConfig`, `buildVGSVaultConfig`, `decodeVaultCredentials`, `getVaultCredentialsFromSessions`, `vaultTokenData`, `decodeVaultTokenData` |
| `src/Payments/HyperswitchVaultCardCollector.res` | `handleSaveCard`, `submitCallback`, `reportCardFieldErrors` |
| `src/Payments/ParentCardComponent.res` | vault message handler (`cardTokenEvent` / `cardTokenFail` / `vgsTokenEvent`), `confirmBody` dispatch, `getVaultEndPoint` usage |
| `src/CardCVCElement.res` | saved-card CVC vault flow, `updatePaymentMethod` call |
| `src/Utilities/PaymentHelpersV2.res` | `savePaymentMethod` (:484), `updatePaymentMethod` (:332) |
| `src/Utilities/PaymentBody.res` | `cardTokenizationBody` (:982), `vaultCardBody` (:935), `vaultExternalCardBody` (:942), `vgsVaultCardBody` (:964) |
| `src/Utilities/PaymentManagementBody.res` | `vaultUpdateCVVBody` (:25) |
| `src/Utilities/ApiEndpoint.res` | `getApiEndPoint`, `hyperswitchVaultEndPoint`, `getVaultEndPoint`, `hyperswitchVaultSdkUrl`, `addCustomPodHeader` |
| `src/Utilities/Utils.res` | `getSdkAuthorizationData` (:2045+), `fetchApi` (:1084), `getHeaders` (:1015) |
| `src/GlobalVars.res` | `isPciCompliant` (:18) |

**hyperswitch-client-core**

| File | Symbols |
|---|---|
| `src/types/SdkTypes.res` | `sdkAuthorization` (:337), paymentId derivation (:856–864) |
| `src/utility/logics/Utils.res` | `sdkAuthorizationData` (:403), `getSdkAuthorizationData` (:411), `getHeader` (:158) |
| `src/utility/constants/GlobalHooks.res` | `useGetBaseUrl` (:58) |
| `src/headless/HeadlessUtils.res` | `getBaseUrl` (:183) |
| `shared-code/sdk-utils/types/SdkConfigTypes.res` | `vaultingAction` (:1), `getVaultingAction` (:49) |
| `shared-code/sdk-utils/utils/SdkConfigParser.res` | `getVaultingActionFromName` (:31) |
