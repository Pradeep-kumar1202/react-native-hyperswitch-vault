# Merchant integration guide

How to let a customer save a card in your React Native app with
`@juspay-tech/react-native-hyperswitch-vault`.

This guide covers **Flow 1 — standalone merchant tokenization**: the library owns the card fields,
you get back a payment-method token, and your backend does the rest.

> Building the Hyperswitch payment sheet rather than your own checkout? That is **Flow 2**, where
> the library performs the payment confirmation itself and hands back a navigation decision instead
> of a token. See [app-integration.md](app-integration.md#flow-2--client-core-payment-confirmation).

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
     |  tokenize(): the component POSTs the card straight to the vault
     |  POST /v1/payment-method-sessions/{id}/confirm              |
     |------------------------------------------------------------>|
     |<------------------------------------------------------------|
     |   payment-method token                                       |
     |                              |                              |
     |  send the token to YOUR server, store it against the customer|
     |----------------------------->|                              |
```

Three things to notice:

- **The card never touches your code.** The component collects it and posts it to the vault itself.
  Your app receives a token and nothing else — no PAN, no CVC, and no masked card metadata either.
- **Your secret key never leaves your server.** The app only ever sees the session response, which
  carries a short-lived, single-session credential.
- **`tokenize()` does not move money.** It exchanges a card for a token and stops there. Charging
  that token is your backend's job.

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

**Note the auth change.** Call 2 is the one request in this flow that does **not** use your secret
key. `POST /payments/session_tokens` is authenticated by the `sdk_authorization` that call 1
returned, sent in the `Authorization` header — there is no `api-key` header on this request. Call 1
keeps `api-key: <SECRET_API_KEY>`; your secret key is never used for call 2 and never leaves your
server. `example-server/merchant-server.mjs` makes both calls exactly this way.

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
form library — the package has **no runtime dependencies at all**, and the standalone entries keep
their state in an internal reducer. Peers are just `react` (>=19 <20) and `react-native`
(>=0.79 <0.80).

### 3.2 Fetch, render, tokenize

```tsx
import React, {useEffect, useRef, useState} from 'react';
import {Button, View} from 'react-native';
import {
  HyperswitchVaultForm,
  type VaultFormHandle,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

export function SaveCardScreen() {
  const formRef = useRef<VaultFormHandle>(null);
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('https://your-backend.example/vault-session')
      .then(response => response.json())
      .then(setSession);
  }, []);

  const onSave = async () => {
    setBusy(true);
    const result = await formRef.current?.tokenize();
    setBusy(false);

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
      <Button title="Save card" onPress={onSave} disabled={busy} />
    </View>
  );
}
```

You supply the button. The component owns only the card fields.

**There is no readiness callback to wait for.** The library emits nothing as the customer types —
no validity, no focus, no brand, no completion. Enable your button and let `tokenize()` answer: it
returns `validation_error` or `not_ready` **without making any network request**, and the inline
field errors appear on screen at the same time. The only state worth tracking is whether your own
promise is still pending, as `busy` does above.

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
| `fieldOptions` | `VaultFormFieldOptions` | which visual elements each field renders. With none, the form is empty neutral inputs — see the README. |
| `fieldStyles` | `VaultFormFieldStyles` | per-field style slots |
| `layout` | `VaultFormLayout` | `"stacked"` (default) gives each field its own row; `"inline"` puts expiry and CVC side by side. |
| `fieldArrangement` | `VaultFieldArrangement` | `"separate"` (default) gives each field its own bordered box; `"fused"` joins them. |
| `localisation` | `VaultFormLocalisation` | validation message overrides and RTL |

### 3.5 The cardholder name

The ready-made form renders a **cardholder name** field, full width, above the card number. It is
optional: leave it blank and it is omitted from the request entirely. In a custom layout you may
place `<CardholderNameField />` yourself or omit it — tokenization still succeeds without it.

Like every other field, it is library-owned: you can style and label it, and there is no supported
way to read or set what the customer typed.

### 3.6 The ref handle

```ts
tokenize(): Promise<VaultTokenizeResult>            // Flow 1 — this guide
confirmPayment(input): Promise<VaultPaymentResult>  // Flows 2 and 3 — not used here
reset(): void                              // clears values, expiry text, validation state and errors
focus(field: 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName'): void
```

Use `tokenize()`. `confirmPayment()` completes a payment — either by tokenizing first
(`cardSource: {type_: 'vault', session}`) or by sending the card directly
(`cardSource: {type_: 'direct'}`). Neither hands back a token, so neither is what you want here.

---

## 4. Handling the result

`tokenize()` always resolves. Handle it by `status`:

| `status` | `error.code` | What happened | Retry? |
|---|---|---|---|
| `success` | — | card vaulted; `token` is yours | — |
| `validation_error` | `invalid_card_data` | nothing was sent; inline errors are now on screen | yes, after the customer corrects it |
| `not_ready` | `not_ready` | fields have not registered yet; nothing sent | yes |
| `error` | `invalid_session` | session unusable; nothing sent | no — fetch a new session |
| `error` | `server_error` | the vault refused, or answered 2xx with an unreadable body | no, not automatically |
| `error` | `unknown_outcome` | the request threw, timed out, or was aborted | **no** — see below |

`token` exists on the `success` branch and on no other, and the TypeScript union enforces that.

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

To charge it later, your backend passes it as `payment_token` in the payments confirm body and omits
`payment_method_data` entirely. Confirm the exact shape for your API version before you build on it —
that part is outside this library.

---

## 6. Security requirements

- Secret API key: **server only.** Never in the app, an app-level `.env`, or version control.
- Never log or display `sdk_authorization` or anything decoded from it. In React Native a
  `console.log` reaches Metro, logcat and Console.app, where it persists. This library contains no
  logging at all, deliberately.
- Never persist the session — not AsyncStorage, not a persisted Redux/MMKV store, not a file. Keep
  it in component state and refetch.
- Never log or display the PAN, expiry, CVC or cardholder name. You never receive them anyway; the
  type surface does not admit them.
- The payment-method token belongs on your backend. (`example/App.tsx` renders it on screen so a
  developer can check it against the dashboard — that is an example affordance, not a pattern.)
- Serve your session endpoint with `Cache-Control: no-store`.
- Fetch a **fresh session per attempt**. Replacing the `session` prop cancels an in-flight
  confirmation and the next call always uses the current authorization.

**On compliance.** The boundary, stated exactly:

> PAN, expiry and CVC never cross the library's supported public API. They remain in library-owned
> state and are transmitted only by the library's internal tokenization transport. The merchant
> receives safe UI state and the resulting token.

There is one entry point per flow, so the guarantee has no carve-out.

That is an API and data-flow guarantee — **not** native-process isolation, **not** memory
zeroization, **not** a claim of PCI DSS compliance, **not** a claim that your PCI scope is reduced,
and **not** protection from malicious code executing inside your own application process. Only your
own assessor can determine your scope.

**One caveat, stated plainly.** Host code runs in the same JavaScript process and can monkey-patch
globals such as `fetch`; the library's own test suite does exactly that to observe its requests. The
guarantee covers the supported public API, not malicious instrumentation inside your own process.

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
| `not_ready` from `tokenize()` | called before the fields registered. There is no readiness event to wait for; retry, or simply let the customer press again. |
| `View config getter callback for component 'AndroidTextInput' must be a function` | two copies of `react-native` in the bundle. Normal installs have one; this shows up in monorepos and with linked packages. Pin resolution to a single copy. |

---

## 9. Before going live

- [ ] Secret API key is on the server only; no app `.env` contains one.
- [ ] Session endpoint requires your own user session and sends `Cache-Control: no-store`.
- [ ] `environment` in the app matches the environment the server creates sessions in.
- [ ] Nothing logs the authorization, the token or card values.
- [ ] `unknown_outcome` is handled without an automatic retry.
- [ ] Walked `docs/manual-device-checklist.md` on both Android and iOS.
