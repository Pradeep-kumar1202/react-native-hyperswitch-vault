# Merchant integration guide

How to let a customer save a card in your React Native app with
`@juspay-tech/react-native-hyperswitch-vault`.

There are two pieces of work: **a backend endpoint you write** and **a component you render**. The
split is not optional — it is what keeps your secret API key off the device and keeps card details
out of your app code.

Everything below was executed against a live Hyperswitch sandbox, not written from the API docs.
Where something is version- or account-specific, it says so.

---

## 1. The shape of the flow

```
  your app                     your server                    Hyperswitch
     |                              |                              |
     |  GET /vault-session          |                              |
     |----------------------------->|                              |
     |                              |  POST /payments              |
     |                              |  api-key: <SECRET>           |
     |                              |----------------------------->|
     |                              |<-----------------------------|
     |                              |   payment_id, sdk_authorization
     |                              |                              |
     |                              |  POST /payments/session_tokens
     |                              |  Authorization: <sdk_authorization>
     |                              |----------------------------->|
     |                              |<-----------------------------|
     |                              |   session_token, vault_details
     |<-----------------------------|                              |
     |   the session response, verbatim                            |
     |                                                             |
     |  the component POSTs the card straight to the vault         |
     |  POST /v1/payment-method-sessions/{id}/confirm              |
     |------------------------------------------------------------>|
     |<------------------------------------------------------------|
     |   payment-method token                                       |
     |                              |                              |
     |  send the token to YOUR server, store it against the customer|
     |----------------------------->|                              |
```

Two things to notice:

- **The card never touches your code.** The component collects it and posts it to the vault itself.
  Your app receives a token and masked metadata (`last4Digits`, optional `binNumber`, expiry) —
  never a PAN or CVC.
- **Your secret key never leaves your server.** The app only ever sees the session response, which
  carries a short-lived, single-session credential.

---

## 2. The server

You need **one endpoint**. Call it whatever you like; the example uses `GET /vault-session`.

### 2.1 What it needs

| Value | Where it comes from | Notes |
|---|---|---|
| Secret API key | Hyperswitch dashboard | **Server only.** Never in the app, an app `.env`, or version control. |
| Profile ID | Hyperswitch dashboard | The profile the intent belongs to. |
| Customer ID | your own system | The customer the saved card will belong to. |
| API base URL | per environment | `https://sandbox.hyperswitch.io`, `https://integ-api.hyperswitch.io`, `https://api.hyperswitch.io` |

### 2.2 Call 1 — create a payment intent

```http
POST {BASE_URL}/payments
Content-Type: application/json
api-key: <SECRET_API_KEY>

{
  "customer_id":         "<CUSTOMER_ID>",
  "profile_id":          "<PROFILE_ID>",
  "amount":              1000,
  "currency":            "USD",
  "capture_method":      "automatic",
  "confirm":             false,
  "authentication_type": "no_three_ds"
}
```

The response carries `payment_id` and `sdk_authorization`.

**`confirm: false` matters.** The intent is created and never confirmed, so no money moves. It
exists only to mint a vault session. If your product genuinely charges the customer in the same
flow, use that real intent instead of a throwaway one — the rest is identical.

### 2.3 Call 2 — get the session tokens

```http
POST {BASE_URL}/payments/session_tokens
Content-Type: application/json
Authorization: <sdk_authorization from call 1>

{ "payment_id": "<payment_id from call 1>", "wallets": [] }
```

**Note the auth change.** This call authenticates with the intent's own `sdk_authorization`, *not*
with your secret key. That is how `hyperswitch-client-core` does it too — see `Utils.getHeader`,
which sends `Authorization` instead of `api-key` whenever an sdk_authorization is present.

The response looks like this:

```json
{
  "payment_id": "pay_…",
  "client_secret": "pay_…_secret_…",
  "session_token": [],
  "vault_details": {
    "vault_type": "hyperswitch",
    "vault_data": { "sdk_authorization": "<base64 envelope>" }
  }
}
```

### 2.4 What to return to the app

**Return that response verbatim.** Do not unwrap it, rename fields, or extract the authorization —
the component reads `vault_details.vault_type` and `vault_details.vault_data.sdk_authorization` and
ignores everything else, so extra fields are harmless and a reshaped payload is not.

Send it with `Cache-Control: no-store`:

```
Cache-Control: no-store
Pragma: no-cache
```

`no-store` is the only directive that forbids *storing* the response. `no-cache` still permits it,
and the body carries a live credential.

### 2.5 Rules for the endpoint

- **Never log the response**, the `sdk_authorization`, or anything decoded from it. Log the HTTP
  status and nothing else.
- **Never forward a Hyperswitch error body to the app.** It can echo request context. Return a
  generic failure and read the detail from your dashboard.
- **Fail loudly if `vault_details` is missing.** Otherwise the app reports
  `error / invalid_session` and the real cause — vaulting not enabled on that profile — is
  invisible.
- Require your own user's session on this endpoint. It mints a credential tied to a customer id;
  it should not be callable for an arbitrary customer.

A complete, dependency-free implementation you can read in one sitting is
`example-server/merchant-server.mjs`.

---

## 3. The app

### 3.1 Install

```sh
yarn add @juspay-tech/react-native-hyperswitch-vault
```

That is the whole install. No provider SDK, no native module, no `pod install`, no Codegen, and no
react-final-form — the standalone entry bundles its own. Peers are just `react` (>=19 <20) and
`react-native` (>=0.79 <0.80).

### 3.2 Fetch, render, submit

```tsx
import React, {useEffect, useRef, useState} from 'react';
import {Button, View} from 'react-native';
import {
  HyperswitchVaultForm,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

export function SaveCardScreen() {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const [session, setSession] = useState<MerchantSession | null>(null);

  useEffect(() => {
    fetch('https://your-backend.example/vault-session')
      .then(response => response.json())
      .then(setSession);
  }, []);

  const onSave = async () => {
    const result = await formRef.current?.submit();
    if (result?.status === 'success') {
      await fetch('https://your-backend.example/save-card', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token: result.token}),
      });
    } else if (result) {
      showMessage(result.error.message);
    }
  };

  if (!session) return null;

  return (
    <View>
      <HyperswitchVaultForm ref={formRef} session={session} environment="sandbox" />
      <Button title="Save card" onPress={onSave} />
    </View>
  );
}
```

You supply the button. The component owns only the three card fields.

### 3.3 `environment` selects the vault host

| `environment` | vault host |
|---|---|
| `"sandbox"` | `https://beta.hyperswitch.io/api` |
| `"integration"` | `https://dev.hyperswitch.io/api` |
| `"production"` | `https://checkout.hyperswitch.io/api` |

React Native has no document origin, so unlike the web SDK this cannot be inferred — pass it
explicitly and make sure it matches the environment your **server** created the session in.

### 3.4 Optional props

| Prop | Type | Notes |
|---|---|---|
| `appearance` | `VaultFormAppearance` | colours, radius, border width, font, input height — every field optional |
| `disabled` | `boolean` | makes the inputs genuinely non-interactive |
| `splitCardFields` | `boolean` | `false` (default) is one bordered block, expiry and CVC sharing a row — the card-only client-core look. `true` gives three separately bordered fields, each error beneath its own field. |
| `onStateChange` | `(state: CardFormState) => void` | `{complete, cardNumberValid, expiryValid, cvcValid, brand}` — validity only, never a card value. Use `complete` to enable your button. |

### 3.5 The ref handle

```ts
submit(): Promise<VaultSubmitResult>   // never throws for a validation/HTTP/network failure
reset(): void                          // clears values, expiry text, validation state and errors
focus(field: 'cardNumber' | 'expiry' | 'cvc'): void
```

---

## 4. Handling the result

`submit()` always resolves. Handle it by `status`:

| `status` | `error.code` | What happened | Retry? |
|---|---|---|---|
| `success` | — | card vaulted; `token` + masked `card` | — |
| `validation_error` | `invalid_card_data` | nothing was sent; inline errors are now on screen | yes, after the customer corrects it |
| `not_ready` | `not_ready` | fields have not registered yet; nothing sent | yes |
| `error` | `invalid_session` | session unusable; nothing sent | no — fetch a new session |
| `error` | `server_error` | the vault refused, or answered 2xx with an unreadable body | no, not automatically |
| `error` | `unknown_outcome` | the request threw, timed out, or was aborted | **no** — see below |

**`unknown_outcome` is the one to get right.** A thrown fetch, a timeout and an abort are
indistinguishable from a request the vault already processed. The endpoint takes no idempotency key,
so a blind retry can vault the same card twice. There is deliberately no `network_error` code,
because nothing can promise the request never landed. **The library never retries anything**; if you
want to, reconcile on your backend first.

---

## 5. What to do with the token

Send it to your server and store it against the customer. It is a reference to the stored card, not
card data — but it is still a credential for charging that card, so treat it like one: your backend,
not your app, and not your logs.

To charge it later, `hyperswitch-client-core` passes it as `payment_token` in the payments confirm
body (see `PaymentUtils.generateCardConfirmBody`) and omits `payment_method_data` entirely. Confirm
the exact shape for your API version before you build on it — that part is outside this library.

---

## 6. Security requirements

- Secret API key: **server only.** Never in the app, an app-level `.env`, or version control.
- Never log or display `sdk_authorization` or anything decoded from it. In React Native a
  `console.log` reaches Metro, logcat and Console.app, where it persists. This library contains no
  logging at all, deliberately.
- Never persist the session — not AsyncStorage, not a persisted Redux/MMKV store, not a file. Keep
  it in component state and refetch.
- Never log or display the PAN, expiry or CVC. You never receive them anyway; the type surface does
  not admit them.
- The payment-method token belongs on your backend. (`example/App.tsx` renders it on screen so a
  developer can check it against the dashboard — that is an example affordance, not a pattern.)
- Serve your session endpoint with `Cache-Control: no-store`.
- Fetch a **fresh session per attempt**. Replacing the `session` prop cancels an in-flight
  confirmation and the next `submit()` always uses the current authorization.

**On compliance:** this design keeps card values out of your application code. That is a statement
about data flow, not a compliance claim — it is **not** a claim of PCI DSS compliance and **not** a
claim that your PCI scope is reduced. Only your own assessor can determine that.

---

## 7. Local development

| | |
|---|---|
| iOS simulator | `http://localhost:<port>` reaches your machine |
| Android emulator | use `http://10.0.2.2:<port>` — `localhost` is the emulator itself |
| Physical Android device | use your machine's LAN address (`ipconfig getifaddr en0`), same network |

Cleartext HTTP to a local server needs `android:usesCleartextTraffic="true"` — put it in
`android/app/src/debug/AndroidManifest.xml` **only**, never the main/release manifest. The React
Native template already does this.

---

## 8. Troubleshooting

| Symptom | Cause |
|---|---|
| `error / invalid_session` immediately, nothing sent | the session has no `vault_details`, an unsupported `vault_type`, or a blank/undecodable `sdk_authorization`. Check what your server returned — and that it returned it *verbatim*. |
| Server gets `400 IR_06 missing field 'storage_type'` | you called `POST /v2/payment-method-sessions`. That is a different API; use the two calls in §2. |
| Server gets `401 "API key not provided or invalid API key used"` on v2 | same cause. A key that works on v1 `/payments` is rejected by that v2 route. |
| `error / server_error` after a 2xx | the vault answered but the body held no token. The card was probably saved — reconcile on your backend, do not blind-retry. |
| Form renders but `submit()` returns `not_ready` | called before the fields registered. Use `onStateChange` to know when the form is live. |
| `View config getter callback for component 'AndroidTextInput' must be a function` | two copies of `react-native` in the bundle. Normal installs have one; this shows up in monorepos. Pin resolution to a single copy. |

---

## 9. Before going live

- [ ] Secret API key is on the server only; no app `.env` contains one.
- [ ] Session endpoint requires your own user session and sends `Cache-Control: no-store`.
- [ ] `environment` in the app matches the environment the server creates sessions in.
- [ ] Nothing logs the authorization, the token or card values.
- [ ] `unknown_outcome` is handled without an automatic retry.
- [ ] Walked `docs/manual-device-checklist.md` on both Android and iOS.
