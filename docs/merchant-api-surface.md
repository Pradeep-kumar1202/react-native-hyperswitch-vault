# Merchant API surface

Every export, prop, callback and result `@juspay-tech/react-native-hyperswitch-vault` puts in a
merchant's hands — and, just as deliberately, everything it does not.

**Package:** `@juspay-tech/react-native-hyperswitch-vault` · **Version:** 0.8.0
**Peers:** `react >=19.0.0 <20.0.0`, `react-native >=0.79.0 <0.88.0`
**Status:** not yet published to npm; integrators consume it from a local checkout until then.

Compiled from `src/public.ts`, the generated genType declarations, and `docs/merchant-integration.md`.
The worked example is the current `example/App.tsx`.

---

## Contents

1. [The boundary](#1-the-boundary)
2. [Install](#2-install)
3. [Your backend: one endpoint](#3-your-backend-one-endpoint)
4. [MerchantSession](#4-merchantsession)
5. [Worked example](#5-worked-example)
6. [Components](#6-components)
7. [Props](#7-props)
8. [Appearance and copy](#8-appearance-and-copy)
9. [The ref handle](#9-the-ref-handle)
10. [Live state](#10-live-state)
11. [Results and errors](#11-results-and-errors)
12. [What is sealed](#12-what-is-sealed)
13. [Export index](#13-export-index)

---

## 1. The boundary

This library is defined less by its API than by its edge. Card values are entered into fields the
library owns and never cross back out — not as a prop, not as a callback payload, not as a ref
accessor. Reading the surface below is mostly a matter of knowing which side of that line a thing
sits on.

| Yours to use | Sealed by construction |
|---|---|
| `session` and `environment` | card number (PAN) |
| `appearance` · `styles` · options | BIN / first six |
| `localisation` | last four |
| `tokenize()` → token | CVC value |
| `reset()` · `focus(field)` | expiry month / year |
| `onStateChange` · `onFormStateChange` | cardholder name value |
| — | setting any field value |
| — | the vault credential |

The right-hand column is enforced at build time, not by convention. `scripts/verify-event-surface.mjs`
checks the **packed** type declarations against three independent locks:

- an exact-member allowlist per emitted type (not a denylist — "a denylist only catches the leaks
  somebody already thought of");
- a banned member-name denylist (`pan`, `bin`, `last4`, `first6`, `value`, `cvv`, `token`, `length`, …);
- a callback-channel allowlist containing exactly `onStateChange` and `onFormStateChange`.

Widening the surface therefore fails the build rather than passing review. Sixteen further gates
cover the rest; `yarn verify` runs seventeen in total.

---

## 2. Install

```sh
# react and react-native are peer dependencies — the library uses yours
yarn add @juspay-tech/react-native-hyperswitch-vault
```

Pure JavaScript and ReScript: **no native module, no podspec, no Gradle changes.** Adding it does not
require a rebuild of your native shells. Card scanning, if the optional
`@juspay-tech/react-native-hyperswitch-scancard` package is present, is detected and driven entirely
inside the library.

> There is a second entry point, `./orchestration`. It is **not for merchants** — it exists so
> Hyperswitch's own payment-methods façade can confirm a card that an external vault provider
> tokenized. The merchant root never re-exports it.

---

## 3. Your backend: one endpoint

The app holds no API key. Your server makes two calls to Hyperswitch and hands the second response
back untouched. This is a genuine sequence — call 2 is authenticated by what call 1 returns.

### What it needs

| Value | Where it comes from | Notes |
|---|---|---|
| Secret API key | Hyperswitch dashboard | **Server only.** Never in the app, an app `.env`, or version control. |
| Profile ID | Hyperswitch dashboard | The profile the intent belongs to. |
| Customer ID | your own system | The customer the saved card will belong to. |
| API base URL | per environment | `https://sandbox.hyperswitch.io`, `https://integ-api.hyperswitch.io`, `https://api.hyperswitch.io` |

### Step 1 — create a payment intent

Authenticated with your **secret API key**, which never leaves your server.

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

`confirm: false` matters. The intent is created and never confirmed, so no money moves — it exists
only to mint a vault session. If your product genuinely charges in the same flow, use that real
intent instead; the rest is identical.

The response carries `payment_id` and `sdk_authorization`.

### Step 2 — exchange it for session tokens

The one request in this flow with **no `api-key` header**. It is authenticated by the
`sdk_authorization` that step 1 returned.

```http
POST {BASE_URL}/payments/session_tokens
Content-Type: application/json
Authorization: <sdk_authorization from step 1>

{ "payment_id": "<payment_id from step 1>", "wallets": [] }
```

Response:

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

### Step 3 — return that response verbatim

Do not unwrap it, rename fields, or extract the authorization. The component reads
`vault_details.vault_type` and `vault_details.vault_data.sdk_authorization` and ignores everything
else, so extra fields are harmless — a reshaped payload is not.

```http
Cache-Control: no-store
Pragma: no-cache
```

`no-store` is the only directive that forbids *storing* the response. `no-cache` still permits it,
and the body carries a live credential.

> **Never log** the response, the `sdk_authorization`, or anything decoded from it. Log the HTTP
> status and nothing else.

---

## 4. MerchantSession

The only object your app passes in from your backend. Structurally open — extra keys are ignored —
but these two paths are the ones the library reads.

```ts
type MerchantSession = {
  vault_details?: {
    vault_type?: string;
    vault_data?: { sdk_authorization?: string };
  };
  [key: string]: unknown;
};
```

A session whose `sdk_authorization` is missing or blank is reported through `sessionStatus` on the
form state as `'invalid'` or `'absent'`, and refused at submit with `invalid_session` — before any
network call.

---

## 5. Worked example

Fetch a session, render the fields inside a provider, call one method. This is `example/App.tsx`
trimmed to its load-bearing parts.

```tsx
import {
  HyperswitchVaultFormProvider,
  CardNumberField, CardExpiryField, CardCVCField,
  type MerchantSession, type VaultFormHandle, type VaultFormState,
} from '@juspay-tech/react-native-hyperswitch-vault';

const formRef = useRef<VaultFormHandle>(null);
const [session, setSession] = useState<MerchantSession | null>(null);
const [canSubmit, setCanSubmit] = useState(false);

// the only network call the app makes itself
useEffect(() => { fetchMerchantSession().then(setSession); }, []);

const save = async () => {
  const result = await formRef.current?.tokenize();

  if (result === undefined) {
    // the form was not mounted
  } else if (result.status === 'success') {
    // result.token
  } else {
    // result.error.message
  }
};

<HyperswitchVaultFormProvider
  ref={formRef}
  session={session}
  environment="sandbox"
  appearance={appearance}
  onFormStateChange={(s: VaultFormState) => setCanSubmit(s.canSubmit)}>

  <CardNumberField />
  <CardExpiryField />
  <CardCVCField />

  {/* your own button, your own chrome */}
</HyperswitchVaultFormProvider>
```

Note what is absent: no state holding a card number, no validation logic, no submit handler
assembling a request body. The app's entire relationship with the card is
`formRef.current.tokenize()`.

---

## 6. Components

Three ways to render, in descending order of how much the library decides for you.

| Export | Renders | Use when |
|---|---|---|
| `HyperswitchVaultForm` | The complete form, laid out by the library | You want a card form and don't want to place fields |
| `HyperswitchVaultFormProvider` | Nothing — a context wrapper; you place the fields as children | The fields must sit inside your own layout, interleaved with your own inputs |
| `HyperswitchVault` | Namespace object: `.CardForm` `.Form` `.CardNumber` `.Expiry` `.CVC` `.CardholderName` | You prefer one import |

### Field components

Four fields, each published under two names. **The pairs are the same object** —
`CardNumberField === CardNumberWidget` holds at runtime, so ref types and `React.memo` behave
identically. Pick one spelling and keep it.

| Canonical | Alias | Adds beyond the common props |
|---|---|---|
| `CardNumberField` | `CardNumberWidget` | `brandIconMode` |
| `CardExpiryField` | `CardExpiryWidget` | — (and no `accessory` style slot) |
| `CardCVCField` | `CardCVCWidget` | `cvcIcon` |
| `CardholderNameField` | `CardholderNameWidget` | — |

The cardholder name is optional in a custom layout. Omit it and `tokenize()` still succeeds — it is
not part of the presence gate, and a blank value is dropped from the request rather than sent empty.

---

## 7. Props

### Form and provider

| Prop | Type | | Notes |
|---|---|---|---|
| `environment` | `'production' \| 'sandbox' \| 'integration'` | **required** | Selects the vault host |
| `children` | `ReactNode` | provider only | Where you place the fields |
| `session` | `MerchantSession` | optional | Absent means the direct-confirm flow |
| `appearance` | `VaultFormAppearance` | optional | Form-wide visual tokens |
| `localisation` | `VaultFormLocalisation` | optional | Labels, messages, RTL |
| `cardholderName` | `'collect' \| 'omit'` | optional | Whether the name field's value is sent |
| `enabledCardSchemes` | `string[]` | optional | Candidate set for the co-badge chooser |
| `vaultEndpoint` | `{ baseUrl: string }` | optional | Override the vault host |
| `disabled` | `boolean` | optional | |
| `accessible` | `boolean` | optional | |
| `unstyled` | `boolean` | optional | Strips all chrome — see §8 |
| `onFormStateChange` | `(s: VaultFormState) => void` | optional | |
| `layout` | `'stacked' \| 'inline'` | form only | |
| `fieldArrangement` | `'separate' \| 'fused'` | form only | Expiry and CVC in one box, or two |
| `fieldOptions` | `VaultFormFieldOptions` | form only | Per-field options, grouped |
| `fieldStyles` | `VaultFormFieldStyles` | form only | Per-field styles, grouped |

> **The three cardholder-name modes are not interchangeable.**
> `'collect'` renders the library's field and uses what was typed.
> `'external'` renders nothing and expects the value on the confirm input.
> `'omit'` renders nothing and sends nothing.
>
> The last two look identical on screen and differ entirely in what is transmitted. Passing
> `cardholderName` in any mode but `'external'` is refused with `unsupported_configuration`, never
> resolved by precedence — a host with two names has no way to know which one was sent.

### Field props

Set directly on each field when you place it yourself; grouped under `fieldOptions` on the
ready-made form.

| Prop | Type | Notes |
|---|---|---|
| `placeholder` | `string` | |
| `label` | `string` | |
| `labelBehavior` | `'none' \| 'static' \| 'floating'` | Default `floating` |
| `errorDisplay` | `'none' \| 'inline'` | Set `'none'` to draw errors yourself |
| `accessibilityLabel` | `string` | |
| `accessibilityHint` | `string` | |
| `testID` | `string` | |
| `unstyled` | `boolean` | Wins over the individual toggles |
| `styles` | `VaultFieldStyles` | Real RN styles, not opaque handles |
| `onStateChange` | `(s: FieldState) => void` | That field's own shape |
| `ref` | `Ref<VaultFieldHandle>` | `{ focus() · blur() }` |
| `brandIconMode` | `'standard' \| 'animated' \| 'hidden' \| 'hideGeneric'` | Card number only |
| `cvcIcon` | `'none' \| 'default'` | CVC only |

### Style slots

`root` and `container` take `ViewStyle`; `input`, `placeholder`, `label` and `error` take
`TextStyle`; `accessory` takes `ViewStyle` and exists on every field **except the expiry**, which
renders no accessory element — a slot with no rendered target would be a silent no-op.

---

## 8. Appearance and copy

### appearance

Form-wide tokens. Set on the provider, they reach every field wherever you place it.

```
primaryColor      textColor        errorColor       placeholderColor
backgroundColor   borderColor      borderRadius     borderWidth
fontFamily        inputHeight      gap              fontScale
placeholderTextSizeAdjust          errorTextSizeAdjust
errorMessageSpacing                brandIconMode
```

The library never picks a colour of its own — error text, borders and the typed value all take
`errorColor` from here.

### localisation

```ts
{
  labels: {
    cardNumberPlaceholder, cardNumberFloatingLabel,
    expiryPlaceholder,     expiryFloatingLabel,
    cvcPlaceholder,        cvcFloatingLabel,
    cardholderNamePlaceholder, cardholderNameFloatingLabel,
    selectCardBrandLabel,
  },
  validationMessages: {
    cardNumberRequired, cardNumberInvalid,
    expiryRequired,     expiryInvalid,
    cvcRequired,        cvcInvalid,
    unsupportedCard,    cardNotEligible,
  },
  isRtl: boolean,
}
```

### Taking over the chrome

`unstyled` is the escape hatch: it removes the floating label, the brand mark, the CVC glyph, the
inline messages **and** the bordered box, leaving a plain `TextInput` that keeps only its
accessibility label, keyboard type, length limit and CVC masking. Combine it with
`errorDisplay: 'none'` and `onStateChange` to render every piece of the field's presentation
yourself.

---

## 9. The ref handle

One operation on the card, and its name says what comes back.

| Method | Returns | What it does |
|---|---|---|
| `tokenize()` | `Promise<VaultTokenizeResult>` | Mints a payment-method token and stops. Takes no input. **Charges nothing.** The only route to a token. |
| `reset()` | `void` | Clears the fields. Ignored while a request is in flight. |
| `focus(field)` | `void` | `'cardNumber' \| 'expiry' \| 'cvc' \| 'cardholderName'` |

The payment operation the Hyperswitch checkout SDK uses, `confirmPayment(input)`, is typed on a
separate entry — `@juspay-tech/react-native-hyperswitch-vault/host`, `HostFormHandle` — over the
same runtime object (ADR-0010). It is not a member of the merchant handle and is documented in
`docs/host-api-reference.md`.

### Concurrency

- The same operation twice while pending returns the **same** promise.
- Replacing `session` or unmounting aborts in-flight work and discards any cached token.
- A premature call returns `validation_error` and shows inline errors — **without a network call**.

---

## 10. Live state

Two callbacks, and only two. The build gate's allowlist contains exactly these names, so a third one
— an `onScanResult`, an `onBinDetected` — fails the build rather than arriving quietly.

### onFormStateChange

| Member | Type | Answers |
|---|---|---|
| `fieldsReady` | `boolean` | Have the fields mounted? |
| `sessionStatus` | `'valid' \| 'invalid' \| 'absent'` | Is the session usable? |
| `complete` | `boolean` | Is every required field filled? |
| `valid` | `boolean` | Would it pass submission? |
| `submitting` | `boolean` | Is a request in flight? |
| `canSubmit` | `boolean` | Enable your Pay button on this |
| `brand` | `VaultCardBrand` | Detected scheme name |
| `isCoBadged` | `boolean` | Is a network chooser showing? |
| `networkError` | `{ code, message }` | Optional |
| `fields` | `{ cardNumber, expiry, cvc, cardholderName? }` | The four field states |

### onStateChange

Per field. All four report the same five things; the card number adds two.

| Member | Type | Answers |
|---|---|---|
| `field` | `'cardNumber' \| 'expiry' \| 'cvc' \| 'cardholderName'` | The discriminant |
| `status` | `'empty' \| 'incomplete' \| 'complete'` | How far along is it? |
| `valid` | `boolean` | Would it pass right now? |
| `touched` | `boolean` | Should your chrome complain yet? |
| `focused` | `boolean` | Is the cursor in it? |
| `error` | `{ code, message }` | What the customer is being shown now |
| `brand` · `isCoBadged` | — | **Card number only** |

`VaultFieldState` is the union of all four, narrowed by `field` — so `switch (state.field)` gives
back the exact shape, and reading `brand` outside the card-number branch is a type error.

`VaultFieldErrorCode` is closed: `required`, `invalid_card_number`, `invalid_expiry`,
`invalid_cvc`, `unsupported_network`.

`VaultCardBrand` is a closed 14-member union: `visa`, `mastercard`, `americanExpress`, `dinersClub`,
`discover`, `jcb`, `cartesBancaires`, `interac`, `maestro`, `unionPay`, `rupay`, `sodexo`, `bajaj`,
`unknown`.

Updates are de-duplicated by value, not fired per keystroke.

---

## 11. Results and errors

### VaultTokenizeResult

The only published type with a `token` member. Permitted here and nowhere else.

```ts
| { status: 'success';          token: string }
| { status: 'validation_error'; error: SafeVaultError }
| { status: 'not_ready';        error: SafeVaultError }
| { status: 'error';            error: SafeVaultError }
```

### VaultPaymentResult

Not on the root. The payment result, its navigation payloads and the confirm input are `./host`
types — see `docs/host-api-reference.md`.

### SafeVaultErrorCode

| Code | Means |
|---|---|
| `invalid_session` | The session is missing, blank or unusable |
| `invalid_card_data` | The entered card failed validation |
| `not_ready` | A required field is not mounted, or is mounted twice |
| `unsupported_configuration` | `vaultEndpoint` will not resolve |
| `server_error` | Hyperswitch returned an error |
| `unknown_outcome` | The response could not be classified |

Six codes. The two confirm-only codes (`forbidden_card_data`, `card_not_eligible`) exist on the
`./host` entry's wider `SafeVaultErrorCode` and cannot come back from `tokenize()`.

`error.message` is localised and safe to display. Field validation messages are localised through
`localisation.validationMessages`; result messages are not.

---

## 12. What is sealed

Worth stating explicitly, because integrators reasonably ask — and because each of these is enforced
by a build gate rather than a code-review habit.

| You may want | Available? | Why not, and what to use instead |
|---|---|---|
| Read the PAN, CVC or expiry | **no** | No accessor exists. The fields are not controlled inputs. |
| Read BIN / first six / last four | **no** | The event gate bans these member names outright. Get them from your backend after tokenization. |
| Set a field's value | **no** | Prefilling a card number is not a supported operation. |
| Read the selected co-badge network | **no** | You control the candidate set via `enabledCardSchemes` and observe `isCoBadged`. |
| Observe or trigger a card scan | **no** | Scanning is fully internal. A hypothetical `onScanResult` is the exact case the callback allowlist exists to block. |
| Confirm a payment | **no** | `confirmPayment()` is a `./host` handle member for the Hyperswitch checkout SDK; the merchant handle has `tokenize()` only. |
| Know if the form is complete | yes | `onFormStateChange` → `canSubmit`. |
| Know the card brand | yes | On the card-number state and the form state — the scheme name only. |
| Draw your own errors | yes | `errorDisplay: 'none'` plus the `error` on each state. |

> **Why polling is the wrong instinct.** If you find yourself calling `tokenize()` to discover
> whether the form is ready, stop — that mints a payment-method token as a side effect of rendering.
> That question is exactly what `onFormStateChange` exists to answer.

---

## 13. Export index

Everything importable from the package root. The `./host` entry adds `HostFormHandle`,
`VaultPaymentConfirmInput`, `VaultPaymentCardSource`, `VaultPaymentResult`, the next-action types,
the non-card host-data types, `VaultEligibilityConfig` and `VaultEligibilityStatus`; see
`docs/host-api-reference.md`.

### Components — 12 runtime values

```
HyperswitchVaultForm            HyperswitchVaultFormProvider
HyperswitchVault
CardNumberField / CardNumberWidget
CardExpiryField / CardExpiryWidget
CardCVCField    / CardCVCWidget
CardholderNameField / CardholderNameWidget
HyperswitchVaultSavedCardForm   (ADR-0008 — saved-card CVC)
```

### Handles and results

```
VaultFormHandle          HyperswitchVaultFormHandle
VaultFieldHandle         WidgetHandle              VaultField
VaultSavedCardHandle
VaultTokenizeResult      VaultTokenizeStatus
SafeVaultError           SafeVaultErrorCode
```

### Configuration

```
MerchantSession            VaultEnvironment          VaultEndpointConfig
VaultCardholderNameMode
HyperswitchVaultFormProps  HyperswitchVaultFormProviderProps
HyperswitchVaultSavedCardFormProps
```

### Presentation

```
VaultFormAppearance        VaultFormLocalisation     VaultFormLabels
VaultFormValidationMessages
VaultFormLayout            VaultFieldArrangement
VaultFieldOptions          VaultCardNumberOptions    VaultExpiryOptions
VaultCVCOptions            VaultCardholderNameOptions
VaultFormFieldOptions
VaultFieldStyles           VaultCardNumberStyles     VaultExpiryStyles
VaultCVCStyles             VaultFormFieldStyles
VaultLabelBehavior         VaultErrorDisplay
VaultBrandIconMode         VaultFormBrandIconMode    VaultCVCIconDisplay
```

### Emitted state

```
VaultFormState             VaultFormFields           VaultFieldState
VaultCardNumberState       VaultExpiryState
VaultCVCState              VaultCardholderNameState
VaultFieldStatus           VaultFieldError           VaultFieldErrorCode
VaultCardBrand             VaultSessionStatus
```

### Navigation

On `./host` only: `VaultNextAction`, `VaultNextActionType`, `VaultThreeDsData`, `VaultDdcData`,
`VaultSessionTokenData`.

---

## Open points for maintainers

Not integration guidance — things to settle before this is handed out widely.

1. ~~**`confirmPayment` is documented as merchant-facing**~~ Settled by ADR-0010: it is a member of
   the `./host` handle only, and the merchant root publishes neither it nor its types.
2. **Both `*Field` and `*Widget` spellings ship.** This doc tells integrators to pick one. If the
   `*Widget` names are to be deprecated, say so here first.
3. **`environment` accepts `integration`**, but `confirmCardPayment` in the payment-methods façade
   types its environment as `'sandbox' | 'production'` only. Harmless for merchants using this
   library directly; check before anyone relies on `integration` through the façade.
