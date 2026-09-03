# Merchant API reference

The API guide for `@juspay-tech/react-native-hyperswitch-vault`, written for the integration the
library is delivered for:

```text
your backend hands the app a session  →  you place the four secure fields  →  tokenize()  →  a token
```

You place the fields where you want them. The library owns what is typed into them, validates it,
and exchanges it for a payment-method token you send to your backend. No card value is ever readable
by your code, in any callback, at any time.

Everything here is taken from the published TypeScript declarations in `dist/types/public.d.ts`.
If this document and the declarations disagree, the declarations win — report it.

This is the whole of the package root. The Hyperswitch checkout SDK drives the same components
through a separate entry, `@juspay-tech/react-native-hyperswitch-vault/host`, with a wider contract
(payment confirmation, live eligibility). Nothing from that entry appears on the root or in this
document; see [host-api-reference.md](host-api-reference.md) and ADR-0010 if you maintain that SDK.

**Version:** 0.8.0 · **Peers:** React `>=19.0.0 <20.0.0`, React Native `>=0.79.0 <0.88.0`

```bash
yarn add @juspay-tech/react-native-hyperswitch-vault
```

Everything is imported from the package root.

---

## 1. The integration

```tsx
import React, {useRef, useState} from 'react';
import {Button, View} from 'react-native';
import {
  HyperswitchVaultFormProvider,
  CardholderNameField,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type MerchantSession,
  type VaultFormHandle,
  type VaultFormState,
} from '@juspay-tech/react-native-hyperswitch-vault';

export function SaveCard({session}: {session: MerchantSession}) {
  const formRef = useRef<VaultFormHandle>(null);
  const [canSave, setCanSave] = useState(false);
  const [busy, setBusy] = useState(false);

  const onFormStateChange = (state: VaultFormState) =>
    setCanSave(state.canSubmit && state.sessionStatus === 'valid');

  const save = async () => {
    setBusy(true);
    const result = await formRef.current?.tokenize();
    setBusy(false);
    if (!result) return;

    if (result.status === 'success') {
      await fetch('https://your-backend.example/cards', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token: result.token}),
      });
    } else {
      showMessage(result.error.message); // library-owned text, safe to display
    }
  };

  return (
    <View>
      <HyperswitchVaultFormProvider
        ref={formRef}
        session={session}
        environment="sandbox"
        onFormStateChange={onFormStateChange}>
        <CardholderNameField />
        <CardNumberField />
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={{flex: 1}}><CardExpiryField /></View>
          <View style={{flex: 1}}><CardCVCField /></View>
        </View>
      </HyperswitchVaultFormProvider>

      <Button title="Save card" disabled={!canSave || busy} onPress={save} />
    </View>
  );
}
```

That is the whole integration. Everything below is the exact contract of each piece.

---

## 2. The session

### What you pass, and where

| What | Where it goes | Type |
| --- | --- | --- |
| The session body your backend returned | `session` prop on the provider | `MerchantSession` |
| The Hyperswitch environment the session was created in | `environment` prop | `'production' \| 'sandbox' \| 'integration'` |
| Your button press | `formRef.current.tokenize()` | — |
| The token that comes back | your own backend, in your own request | `string` |

Nothing else is required. Every other prop is optional styling, localisation or behaviour.

### How your backend produces the session

Two calls, both from your server. The first uses your **secret** API key; the second uses the
short-lived credential the first one returned. The secret key never leaves your server.

```http
POST {API_HOST}/payments
Content-Type: application/json
api-key: <SECRET_API_KEY>

{
  "customer_id": "<the customer the card will belong to>",
  "profile_id": "<your profile>",
  "amount": 1000,
  "currency": "USD",
  "capture_method": "automatic",
  "confirm": false,
  "authentication_type": "no_three_ds"
}
```

The response carries `payment_id` and `sdk_authorization`. `confirm: false` matters: the intent is
never confirmed, so it only exists to mint a vault session. If your product already has a real
intent for this customer, use that one instead.

```http
POST {API_HOST}/payments/session_tokens
Content-Type: application/json
Authorization: <sdk_authorization from the first call>

{ "payment_id": "<payment_id from the first call>", "wallets": [] }
```

Note the header: this call is authenticated by the intent's `sdk_authorization`, not by your API
key. The response is the session:

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

| `API_HOST` | Environment | Matching `environment` prop |
| --- | --- | --- |
| `https://sandbox.hyperswitch.io` | sandbox | `'sandbox'` |
| `https://integ-api.hyperswitch.io` | integration | `'integration'` |
| `https://api.hyperswitch.io` | production | `'production'` |

Rules for the endpoint that returns this to the app:

- Return the second response **verbatim**. Do not unwrap it or extract the authorization.
- Send it with `Cache-Control: no-store`. The body carries a live credential.
- If `vault_details` is missing, fail loudly on the server. Otherwise the app sees only
  `error / invalid_session` and the real cause, vaulting not enabled on the profile, is invisible.
- Never log the response or anything decoded from `sdk_authorization`.
- Require your own user's login on this endpoint. It mints a credential tied to a customer.

`sdk_authorization` is a short-lived client credential scoped to one session. Do not persist it in
app state beyond the screen that uses it.

### How the app passes it

```tsx
const [session, setSession] = useState<MerchantSession | undefined>();

useEffect(() => {
  fetch('https://your-backend.example/vault-session')
    .then(r => r.json())
    .then(setSession);
}, []);

<HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
```

- `session` accepts `MerchantSession | undefined`, **not `null`**. Hold the state as `undefined`
  while loading, or pass `session ?? undefined`.
- The fields can mount before the session arrives. They render and validate without it, and
  `state.sessionStatus` moves from `'absent'` to `'valid'` when the prop is set.
- Replacing the `session` prop discards any cached token. Fetch a fresh session per save attempt.
- Do not build the object by hand from `sdk_authorization`. Pass the response body as it came.

### Type

```ts
type MerchantSession = {
  vault_details?: {
    vault_type?: string;
    vault_data?: {sdk_authorization?: string};
  };
  [key: string]: unknown;
};
```

Pass the object your backend returned **verbatim**. The index signature exists so extra members from
your backend are carried through untouched. The library reads exactly two things:

| Path | Requirement |
| --- | --- |
| `vault_details.vault_type` | must be `'hyperswitch'` (case-insensitive, trimmed) |
| `vault_details.vault_data.sdk_authorization` | must be a non-blank string |

A session whose `vault_type` is anything else — a session issued for a different card vault — is
**not usable** by this component: `tokenize()` returns `error / invalid_session` with the message
*"This session uses a card vault this component does not support."*

### Session present vs absent

| `session` prop | `state.sessionStatus` | `tokenize()` |
| --- | --- | --- |
| usable | `'valid'` | works |
| supplied but unreadable (no `vault_details`, blank credential, other `vault_type`) | `'invalid'` | `error / invalid_session`, no request |
| not supplied | `'absent'` | `error / invalid_session`, no request |

The fields render and validate in every case; only tokenization needs the session. Gate your button
on `state.canSubmit && state.sessionStatus === 'valid'` as in §1.

---

## 3. `HyperswitchVaultFormProvider`

Renders nothing itself. It owns the card state, validation and the tokenization request, and
supplies context to the four fields placed anywhere inside it.

```ts
type HyperswitchVaultFormProviderProps = {
  readonly environment: 'production' | 'sandbox' | 'integration';
  readonly session?: MerchantSession;
  readonly children: React.ReactNode;
  readonly appearance?: VaultFormAppearance;
  readonly localisation?: VaultFormLocalisation;
  readonly cardholderName?: 'collect' | 'omit';
  readonly enabledCardSchemes?: string[];
  readonly vaultEndpoint?: {baseUrl: string};
  readonly disabled?: boolean;
  readonly accessible?: boolean;
  readonly unstyled?: boolean;
  readonly onFormStateChange?: (state: VaultFormState) => void;
};
```

| Prop | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `environment` | `'production' \| 'sandbox' \| 'integration'` | **yes** | — | Selects the Hyperswitch host. See §15 |
| `session` | `MerchantSession` | for `tokenize()` | absent | The session from your backend. See §2 |
| `children` | `React.ReactNode` | **yes** | — | Your layout, containing the fields |
| `appearance` | `VaultFormAppearance` | no | library theme | Colours, radius, height, fonts. See §8 |
| `localisation` | `VaultFormLocalisation` | no | English, LTR | Placeholders, labels, validation messages, RTL. See §11 |
| `cardholderName` | `'collect' \| 'omit'` | no | `'collect'` | Whether the name field's value is sent. See §13 |
| `enabledCardSchemes` | `string[]` | no | `[]` = no restriction | Networks you accept. See §12 |
| `vaultEndpoint` | `{baseUrl: string}` | no | the `environment` host | Overrides the tokenization host. See §15 |
| `disabled` | `boolean` | no | `false` | Every field non-editable and dimmed |
| `accessible` | `boolean` | no | platform default | Sets `accessible` on each input |
| `unstyled` | `boolean` | no | `false` | Strips all chrome and the box from every field; a field may override with its own `unstyled` |
| `onFormStateChange` | `(state: VaultFormState) => void` | no | absent | A card-free snapshot on mount and on every real change. See §7 |
| `ref` | `VaultFormHandle` | — | — | `useRef<VaultFormHandle>(null)`. See §5 |

---

## 4. The four fields

```tsx
<CardNumberField />      // required
<CardExpiryField />      // required
<CardCVCField />         // required
<CardholderNameField />  // optional
```

Place each one **exactly once** inside the provider, in any order, interleaved with your own views.
`tokenize()` refuses with `not_ready` if a required field is missing or mounted twice. The
cardholder-name field is optional: omitting it never blocks a submit.

### Props common to all four

| Prop | Type | Default | Effect |
| --- | --- | --- | --- |
| `placeholder` | `string` | the localisation string | Resting text. `''` renders **no** placeholder |
| `label` | `string` | the localisation string | Floating or static label text. `''` renders **no** label |
| `labelBehavior` | `'none' \| 'static' \| 'floating'` | `'floating'` | `floating` lifts on focus; `static` sits above; `none` shows only the placeholder |
| `errorDisplay` | `'none' \| 'inline'` | `'inline'` | `inline` paints the message, the error border and the error colour; `none` paints nothing and leaves the drawing to you via state |
| `accessibilityLabel` | `string` | `Card number` / `Expiration date` / `Security code` / `Cardholder name` | Screen-reader name; kept even when `unstyled` |
| `accessibilityHint` | `string` | absent | Screen-reader hint |
| `testID` | `string` | see §17 | E2E identifier |
| `unstyled` | `boolean` | provider `unstyled` | Strips this field's chrome and box |
| `styles` | `VaultFieldStyles` (`VaultExpiryStyles` on expiry) | `{}` | Per-element style slots. See §10 |
| `onStateChange` | `(state) => void` — the field's own state type | absent | See §7 |
| `ref` | `VaultFieldHandle` = `{focus(): void; blur(): void}` | — | |

### Field-specific props

| Prop | Field | Type | Default |
| --- | --- | --- | --- |
| `brandIconMode` | `CardNumberField` | `'standard' \| 'animated' \| 'hidden' \| 'hideGeneric'` | `appearance.brandIconMode`, else `'standard'` |
| `cvcIcon` | `CardCVCField` | `'none' \| 'default'` | `'default'` |

### Behaviour that comes for free

- Formatting (`4242 4242 4242 4242`, `MM / YY`), length limits per network, CVC masking, focus
  advancing number → expiry → CVC, backspace from an empty expiry back into the number.
- Validation on every keystroke (Luhn, expiry in the future, CVC length for the network, network in
  `enabledCardSchemes`), with messages shown after the customer leaves a field or presses your button.
- Brand mark on the number, co-badge chooser when a card carries two networks you accept (§12), the
  CVC hint glyph, and — if the optional scanner package is installed — a scan button (§14).

---

## 5. The handle

```ts
type VaultFormHandle = {
  tokenize(): Promise<VaultTokenizeResult>;
  reset(): void;
  focus(field: 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName'): void;
};
```

| Method | What it does |
| --- | --- |
| `tokenize()` | Validates, sends the card to the Hyperswitch vault, resolves to a token. §6 |
| `reset()` | Clears every value, error, touched flag, the co-badge choice and the cached token. **No-op while an operation is in flight** |
| `focus(field)` | Moves the keyboard to one field |

Three members. There is no `submit()`, no accessor for any value, and no payment operation: the root
handle does exactly one thing with the card, and its name says what comes back.

---

## 6. `tokenize()`

Takes **no argument**. Needs the `session` prop and all three required fields mounted.

```ts
tokenize(): Promise<VaultTokenizeResult>
```

What happens, in order — each gate answers **before** any request is sent:

1. Every required field mounted exactly once → else `not_ready`.
2. Every field valid (including the network rule) → else `validation_error`, and the fields show why.
3. Session usable (§2) → else `error / invalid_session`.
4. `vaultEndpoint` (if given) valid → else `error / unsupported_configuration`.
5. One request to the vault. The response becomes `success` with the token, or an `error`.

It does not confirm a payment and it does not charge anything.

### Result

```ts
type VaultTokenizeResult =
  | {readonly status: 'success';          readonly token: string}
  | {readonly status: 'validation_error'; readonly error: SafeVaultError}
  | {readonly status: 'not_ready';        readonly error: SafeVaultError}
  | {readonly status: 'error';            readonly error: SafeVaultError};

type SafeVaultError = {readonly code: SafeVaultErrorCode; readonly message: string};

type SafeVaultErrorCode =
  | 'invalid_card_data' | 'not_ready' | 'invalid_session'
  | 'unsupported_configuration' | 'server_error' | 'unknown_outcome';
```

Six codes; an exhaustive `switch` on `error.code` needs exactly those six.

| Status | `error.code` | When | Request sent? | What to do |
| --- | --- | --- | --- | --- |
| `success` | — | A token was minted | yes | Send `token` to your backend |
| `validation_error` | `invalid_card_data` | A field is empty, malformed, or of a network you do not accept — locally, or as judged by the vault | local: no · vault: yes | Nothing — the fields already show the reason |
| `not_ready` | `not_ready` | A required field is missing or duplicated | no | Fix the layout |
| `error` | `invalid_session` | No `session`, an unreadable one, another vault's session, or a credential that cannot be decoded | no | Fetch a fresh session from your backend |
| `error` | `unsupported_configuration` | `vaultEndpoint.baseUrl` failed validation | no | Fix the URL |
| `error` | `server_error` | The vault refused the request (any HTTP error, including an expired or already-used session) or answered with an unreadable body | yes | Let the customer retry; if it persists, fetch a fresh session |
| `error` | `unknown_outcome` | The request did not complete (network failure, abort, unmount) | unknown | Safe to retry `tokenize()` — nothing is charged by this call |

### The messages

`error.message` is one of the library's own English strings, listed here so you can map on `code`
if you localise. **These strings are not localisable through `localisation`**; only the field
validation messages and labels are (§11).

| Code | Messages |
| --- | --- |
| `invalid_card_data` | *Please check your card details and try again.* |
| `not_ready` | *`<Widget names>` must be mounted inside `<HyperswitchVaultFormProvider>` before submit().* · *Only one `<Widget>` may be mounted per `<HyperswitchVaultFormProvider>`; found N.* |
| `invalid_session` | *This session can no longer be used.* · *No card-vault session was supplied.* · *This session does not support saving a card.* · *This session is missing its vault details.* · *This session uses a card vault this component does not support.* |
| `unsupported_configuration` | *This payment cannot be completed with the current configuration.* |
| `server_error` | *The payment could not be completed.* |
| `unknown_outcome` | *We could not confirm the payment. Please check before trying again.* |

### Calling it more than once

| Situation | Result |
| --- | --- |
| Called again while the first call is in flight | The **same** promise; no second request |
| Called again after `success`, **nothing edited** | The **same token**, no second request — the library caches the token for the current card and session |
| Called again after the customer edits any field | A fresh token |
| `reset()` between calls | The cache is dropped; the next call mints afresh |

The token is a payment credential: hand it to your backend, do not keep it in app state, do not log
it.

### What is sent

The card values from the library's own fields; the cardholder name when the mode is `'collect'`
and the field is non-blank (§13); the network the customer chose when the card was co-badged (§12).
Nothing from your code is included — `tokenize()` takes no input.

### After you have the token

Send it to your backend and store it against the customer. It is a reference to the stored card, not
card data, but it is still a credential for charging that card: your backend, not your app, and
not your logs.

To use it later, your backend passes it as `payment_token` in the body of a payments confirm request
and omits `payment_method_data`. That request is made with your secret key from your server; the
app is not involved. Confirm the exact body for your API version in the Hyperswitch API reference.

```http
POST {API_HOST}/payments/{payment_id}/confirm
api-key: <SECRET_API_KEY>

{ "payment_token": "<the token>", "customer_id": "<the same customer>" }
```

---

## 7. Form state

### `onFormStateChange` (on the provider)

```ts
type VaultFormState = {
  readonly fieldsReady: boolean;   // exactly one of each required field is mounted
  readonly sessionStatus: 'valid' | 'invalid' | 'absent';
  readonly complete: boolean;      // number, expiry and CVC are all complete
  readonly valid: boolean;         // complete AND the network is accepted
  readonly submitting: boolean;    // an operation is in flight
  readonly canSubmit: boolean;     // fieldsReady && sessionStatus !== 'invalid' && valid && !submitting
  readonly brand: VaultCardBrand;
  readonly isCoBadged: boolean;    // the customer is being offered a network choice
  readonly networkError?: VaultFieldError;  // present when the network is not one you accept
  readonly fields: {
    readonly cardNumber: VaultCardNumberState;
    readonly expiry: VaultExpiryState;
    readonly cvc: VaultCVCState;
    readonly cardholderName?: VaultCardholderNameState; // present only when that field is mounted
  };
};
```

Fires once on mount and then only when the snapshot actually changes (structural comparison).
Passing an inline arrow is safe.

`canSubmit` is `true` with an **absent** session — the fields are complete — but `tokenize()` will
still return `invalid_session`. For a save-card button use `canSubmit && sessionStatus === 'valid'`.

### `onStateChange` (on each field)

```ts
type VaultCardNumberState = {
  readonly field: 'cardNumber';
  readonly status: 'empty' | 'incomplete' | 'complete';
  readonly valid: boolean;
  readonly touched: boolean;
  readonly focused: boolean;
  readonly brand: VaultCardBrand;
  readonly isCoBadged: boolean;
  readonly error?: VaultFieldError;   // the message currently on screen, if any
};
// VaultExpiryState, VaultCVCState, VaultCardholderNameState carry
// field / status / valid / touched / focused / error only.

type VaultFieldError = {
  readonly code: 'required' | 'invalid_card_number' | 'invalid_expiry' | 'invalid_cvc' | 'unsupported_network';
  readonly message: string;
};

type VaultCardBrand =
  | 'visa' | 'mastercard' | 'americanExpress' | 'dinersClub' | 'discover' | 'jcb'
  | 'cartesBancaires' | 'interac' | 'maestro' | 'unionPay' | 'rupay' | 'sodexo' | 'bajaj'
  | 'unknown';
```

One handler for several fields narrows on `field`:

```tsx
import type {VaultFieldState} from '@juspay-tech/react-native-hyperswitch-vault';

const handle = (state: VaultFieldState) => {
  if (state.field === 'cardNumber') setBrand(state.brand); // brand exists only on this branch
  setValid(prev => ({...prev, [state.field]: state.valid}));
};
```

**No snapshot contains a card value.** No PAN, no BIN, no last four, no expiry month or year, no
CVC, and not even the length of what was typed. `brand` is a network name; `message` is text
already on screen. This is enforced against the packed declarations at build time.

---

## 8. `appearance`

```ts
type VaultFormAppearance = {
  readonly primaryColor?: string;              // #0570DE  focused border
  readonly textColor?: string;                 // #1A1A1A  typed text
  readonly errorColor?: string;                // #DF1B41  error message, border and text
  readonly placeholderColor?: string;          // #6B7280  placeholder and floating label
  readonly backgroundColor?: string;           // #FFFFFF  field fill
  readonly borderColor?: string;               // #E6E6E6  resting border, co-badge divider
  readonly borderRadius?: number;              // 8
  readonly borderWidth?: number;               // 1
  readonly fontFamily?: string;                // System
  readonly inputHeight?: number;               // 48
  readonly gap?: number;                       // 12   (unused in a composed layout — you own spacing)
  readonly fontScale?: number;                 // 1    multiplies every font size
  readonly placeholderTextSizeAdjust?: number; // 0    added to the 16pt base before scaling
  readonly errorTextSizeAdjust?: number;       // 0    added to the 12pt error size before scaling
  readonly errorMessageSpacing?: number;       // 4    gap above the error message
  readonly brandIconMode?: 'standard' | 'animated' | 'hidden' | 'hideGeneric'; // 'standard'
};
```

```tsx
<HyperswitchVaultFormProvider
  session={session}
  environment="sandbox"
  appearance={{primaryColor: '#0B5FBF', borderRadius: 12, inputHeight: 56, fontFamily: 'Inter'}}>
```

`appearance` sets the theme; a field's `styles` override individual elements on top of it and always
win.

---

## 9. Field options — the visual elements

With no options a field renders a **complete** UI: a floating label with the library's string, the
brand mark on the number, the CVC glyph, inline validation. Each element is individually switchable:

```tsx
<CardNumberField placeholder="Card number" labelBehavior="static" brandIconMode="animated" />
<CardExpiryField placeholder="MM / YY" label="Expiry" />
<CardCVCField cvcIcon="none" errorDisplay="none" />
<CardholderNameField labelBehavior="none" />
```

| Want | Set |
| --- | --- |
| No floating label, placeholder only | `labelBehavior="none"` |
| Label always above the box | `labelBehavior="static"` |
| Draw errors yourself from `onStateChange` | `errorDisplay="none"` — validation still runs, nothing is painted |
| No brand artwork, no reserved space | `brandIconMode="hidden"` |
| Space reserved, artwork only once detected | `brandIconMode="hideGeneric"` |
| Cycling generic marks while empty | `brandIconMode="animated"` |
| No CVC hint | `cvcIcon="none"` |
| A bare `TextInput` — no box, label, icon or error line | `unstyled` (per field or on the provider); keyboard type, length limit, CVC masking and accessibility label survive |

---

## 10. `styles` — the slots

```ts
type VaultFieldStyles = {
  readonly root?: StyleProp<ViewStyle>;        // outermost wrapper, including the error line
  readonly container?: StyleProp<ViewStyle>;   // the bordered box
  readonly input?: StyleProp<TextStyle>;       // the TextInput
  readonly placeholder?: StyleProp<TextStyle>;
  readonly label?: StyleProp<TextStyle>;       // floating or static label
  readonly error?: StyleProp<TextStyle>;       // the validation message
  readonly accessory?: StyleProp<ViewStyle>;   // the icon container at the right
};
type VaultExpiryStyles = Omit<VaultFieldStyles, 'accessory'>; // the expiry field renders no accessory
```

Real React Native style props — arrays, `StyleSheet.create` handles and platform values all work.
`container` is applied after the field's own border, so this is how you join fields into one box:

```tsx
<CardNumberField styles={{container: {borderBottomLeftRadius: 0, borderBottomRightRadius: 0}}} />
<View style={{flexDirection: 'row'}}>
  <View style={{flex: 1}}>
    <CardExpiryField styles={{container: {borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0}}} />
  </View>
  <View style={{flex: 1}}>
    <CardCVCField styles={{container: {borderTopWidth: 0, borderLeftWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 0}}} />
  </View>
</View>
```

---

## 11. `localisation`

```ts
type VaultFormLocalisation = {
  readonly labels?: VaultFormLabels;
  readonly validationMessages?: VaultFormValidationMessages;
  readonly isRtl?: boolean; // default false
};
```

| `labels` key | Default | Where |
| --- | --- | --- |
| `cardNumberPlaceholder` | `Card number` | number, resting |
| `cardNumberFloatingLabel` | `Card number` | number, lifted |
| `expiryPlaceholder` | `MM / YY` | expiry, resting |
| `expiryFloatingLabel` | `Expiry` | expiry, lifted |
| `cvcPlaceholder` | `CVC` | CVC, resting |
| `cvcFloatingLabel` | `CVC` | CVC, lifted |
| `cardholderNamePlaceholder` | `Name on card` | name, resting |
| `cardholderNameFloatingLabel` | `Name on card` | name, lifted |
| `selectCardBrandLabel` | `Select a card brand` | co-badge chooser heading |

| `validationMessages` key | Default | Shown when |
| --- | --- | --- |
| `cardNumberRequired` | `Card Number cannot be empty` | empty number after blur or submit |
| `cardNumberInvalid` | `Card number is invalid.` | fails Luhn / length |
| `expiryRequired` | `Card expiry date cannot be empty` | empty expiry |
| `expiryInvalid` | `Your card's expiration date is invalid.` | past or malformed |
| `cvcRequired` | `CVC Number cannot be empty` | empty CVC |
| `cvcInvalid` | `Your card's security code is invalid.` | wrong length for the network |
| `unsupportedCard` | `Card brand is not supported.` | network not in `enabledCardSchemes` |

Precedence for text: a field's own `placeholder` / `label` → `localisation.labels` → the default.

`isRtl: true` affects the library's own internal row direction (the co-badge chooser); the
arrangement of the fields is yours in a composed layout.

**Not localisable:** the `error.message` strings on a `tokenize()` result (§6). Map on `error.code`
if you need them in another language.

---

## 12. Card networks

### `enabledCardSchemes`

```ts
enabledCardSchemes?: string[]   // default [] = no restriction
```

Exact, case-sensitive names:

```text
Visa · Mastercard · AmericanExpress · DinersClub · Discover · JCB
CartesBancaires · Interac · Maestro · UnionPay · RuPay · SODEXO · BAJAJ
```

A completed number whose network is not listed fails validation with your `unsupportedCard` message,
`state.networkError` is set, and `canSubmit` is `false`. An incomplete number is never judged
unsupported — the number validator owns the empty and malformed cases.

### Co-badge

When at least 16 digits are typed and the number matches **more than one** network you accept, the
number field's accessory becomes a chooser. The chosen network drives the CVC length rule, the
displayed mark, and is sent with the tokenization request. `state.isCoBadged` tells you a choice is
being offered; **which network was chosen is not reported**. Re-typing the number drops a stale
choice.

---

## 13. `cardholderName`

The prop names a **mode**: whether the name field's value is part of what is sent.

| Mode | `tokenize()` sends | Place `<CardholderNameField />`? |
| --- | --- | --- |
| `'collect'` (default) | the name typed into `<CardholderNameField />`, when non-blank | yes, if you want a name |
| `'omit'` | **no name** | no |

There is no mode for supplying a name from your own code: `tokenize()` takes no input, and the
library never accepts a card field it did not render.

For a token that carries the cardholder name, use `'collect'` and place the field. The library never
reports the name back in any mode.

---

## 14. Scan card

Available when `@juspay-tech/react-native-hyperswitch-scancard` is installed in your app. You pass
nothing: installing the package is the opt-in. The button appears at the right of the number field
while it is empty, feeds the scan through the same path as typing, and is removed by `unstyled`.
Absent the package, no button renders and nothing errors.

---

## 15. `environment` and `vaultEndpoint`

| `environment` | Host | Use |
| --- | --- | --- |
| `'production'` | `https://checkout.hyperswitch.io/api` | live |
| `'sandbox'` | `https://beta.hyperswitch.io/api` | development and testing |
| `'integration'` | `https://dev.hyperswitch.io/api` | Hyperswitch-internal |

`vaultEndpoint.baseUrl` overrides the host for the tokenization call. Validation: `https` required;
`http` accepted only on `localhost`, `127.0.0.1`, `10.0.2.2` and never in `production`; no
credentials, query or fragment; a path prefix is kept, trailing slashes trimmed. An invalid base is
`error / unsupported_configuration` with nothing sent — never a silent fallback to the public host.

---

## 16. Behaviour reference

| Situation | Behaviour |
| --- | --- |
| Customer presses your button with an empty or invalid field | `validation_error`; every field's message appears; no request |
| Network you do not accept | number field shows `unsupportedCard`; `canSubmit` is `false` |
| `disabled` or an operation in flight | fields non-editable, dimmed to 50 % |
| Component unmounts during `tokenize()` | the request is aborted; the promise resolves `unknown_outcome`; the cache is dropped |
| Session changes (new `session` prop) | any cached token is discarded |
| `reset()` | clears values, errors, touched flags, co-badge choice, cached token — unless an operation is in flight, then no-op |
| Same card, same session, second `tokenize()` | the cached token, no request |

---

## 17. Defaults, test IDs, precedence

**Defaults**

| Prop / option | Default |
| --- | --- |
| `environment` | none — required |
| `session` | absent |
| `cardholderName` | `'collect'` |
| `enabledCardSchemes` | `[]` — no restriction |
| `disabled` / `unstyled` | `false` |
| `vaultEndpoint` | the `environment` host |
| `labelBehavior` / `errorDisplay` | `'floating'` / `'inline'` |
| `brandIconMode` / `cvcIcon` | `'standard'` / `'default'` |
| `placeholder` / `label` | the localisation string |
| appearance tokens | see §8 |
| `localisation.isRtl` | `false` |

**Test IDs**

| ID | Element | Overridable |
| --- | --- | --- |
| `CardNumberInputTestId` | number input | yes, via `testID` |
| `ExpiryInputTestId` | expiry input | yes |
| `CVCInputTestId` | CVC input | yes |
| `CardholderNameInputTestId` | name input | yes |
| `CardFieldErrorTestId` | any inline validation message | no |
| `CardNetworkTriggerTestId` / `CardNetworkHeadingTestId` / `CardNetworkBackdropTestId` / `CardNetworkOption-<Scheme>` | co-badge chooser | no |
| `ScanCardButtonTestId` | scan button | no |

**Precedence**

```text
placeholder / label     field prop → localisation.labels → default   ('' = render none)
brand icon              field brandIconMode → appearance.brandIconMode → 'standard'
CVC icon                field cvcIcon → 'default'
unstyled                field → provider → false   (unstyled wins over every visual option)
styling                 field styles slot → appearance token → default
tokenization host       vaultEndpoint.baseUrl → environment host
validation messages     localisation.validationMessages → default English
```

---

## 18. Security boundary

```text
onStateChange / onFormStateChange   → no PAN, no CVC, no expiry value, not even a length
tokenize()                          → the only operation on the root handle; it returns a token and its name says so
error.message                       → library text, never backend prose
```

> PAN, expiry and CVC never cross the library's supported public API. They remain in library-owned
> state and are transmitted only by the library's internal transport.

That is an API and data-flow guarantee — not native-process isolation, not memory zeroization, not
a claim of PCI DSS compliance, not a claim that your PCI scope is reduced, and not protection from
malicious code executing inside your own application process.

---

## 19. Saved cards — `HyperswitchVaultSavedCardForm`

A second, smaller component for a card the customer has **already** saved and must re-verify with
its CVC. One field, one operation, the same result type as `tokenize()`. It is on the package root
only. Decision record: [ADR-0008](adr/0008-saved-card-cvc-flow.md).

### When to use it

Your app calls `GET /v1/payment-method-sessions/{id}/list-payment-methods` with the session's
`vault_details.vault_data.sdk_authorization` and reads `requires_cvv` off each
`customer_payment_methods[]` entry. `false`: charge the listed token directly, no component.
`true`: mount this component with that entry's token. The component does not take `requires_cvv`.

### Props

| Prop | Type | Required | Effect |
| --- | --- | --- | --- |
| `session` | `MerchantSession` | yes | The **same** session `list-payment-methods` was called with. Listing is what associates the saved cards with it |
| `environment` | `VaultEnvironment` | yes | Selects the vault host. Not inferable from the session |
| `paymentMethodToken` | `string` | yes | One entry's token from that listing. Never empty — see §19 behaviour |
| `cardNetwork` | `string` | no | A hint selecting the CVC length rule. Pass the entry's `card_network` (`"Visa"`, `"AmericanExpress"`, …; `"American Express"` and `"amex"` are understood). Absent or unrecognised: three **or** four digits are accepted |
| `vaultEndpoint` | `VaultEndpointConfig` | no | A self-hosted vault host, validated as in §15 |
| `appearance` | `VaultFormAppearance` | no | As §8 |
| `cvcOptions` | `VaultCVCOptions` | no | As §9, for this one field: placeholder, label, `labelBehavior`, `errorDisplay`, `cvcIcon`, `unstyled`, accessibility text, `testID` |
| `cvcStyles` | `VaultCVCStyles` | no | As §10, for this one field |
| `containerStyle` | `StyleProp<ViewStyle>` | no | The outer box only |
| `onStateChange` | `(state: VaultCVCState) => void` | no | The same snapshot a `CardCVCField` emits (§7). One on mount, then on every real change |

No `children`, no `localisation`, no `disabled`. It renders its own field, uses the library's own
messages, and is non-editable only while its own request is in flight.

### The handle

```ts
type VaultSavedCardHandle = {
  updateSavedPaymentMethod(): Promise<VaultTokenizeResult>;
  reset(): void;
  focus(): void;   // one field, so no argument
  blur(): void;
};
```

### `updateSavedPaymentMethod()`

Takes no argument. In order — each gate answers **before** any request is sent:

1. CVC well-formed for the network in force → else `validation_error`, and the field shows why.
2. `paymentMethodToken` non-blank → else `not_ready`. On the wire an absent token mints a **new**
   token, a different operation, so a blank one is never sent.
3. Session usable (§2) → else `error / invalid_session`.
4. `vaultEndpoint` (if given) valid → else `error / unsupported_configuration`.
5. One request: `PUT {vault}/v1/payment-method-sessions/{id}/update-saved-payment-method` with
   `{payment_method_token, payment_method_data: {card: {card_cvc}}}` and nothing else, authenticated
   with the session's own credential.

The response becomes `success` with **the token the response carries** — use that one, not the one
you passed — or an `error`. It does not confirm a payment and it does not charge anything.

| Status | `error.code` | When | Request sent? | What to do |
| --- | --- | --- | --- | --- |
| `success` | — | The CVC is now held under the token, for **15 minutes** | yes | Send `token` to your backend; it confirms within the window |
| `validation_error` | `invalid_card_data` | The CVC is empty or the wrong length for the network | no | Nothing — the field shows the reason |
| `not_ready` | `not_ready` | `paymentMethodToken` is empty or blank | no | Mount with a token from `list-payment-methods` |
| `error` | `invalid_session` | No usable `session` | no | Fetch a fresh session and list again |
| `error` | `unsupported_configuration` | `vaultEndpoint.baseUrl` failed validation | no | Fix the URL |
| `error` | `server_error` | The vault refused the request — including a token that this session did not list — or answered without the token | yes | List again with a fresh session and retry |
| `error` | `unknown_outcome` | The request did not complete, was aborted, or the component unmounted | unknown | Safe to retry: the update is idempotent and nothing is charged |

Messages are the library's own, as in §6. The one message specific to this operation:
`not_ready` → *No saved payment-method token was supplied.*

### Behaviour

| Situation | Behaviour |
| --- | --- |
| Called again while a call is in flight | The **same** promise; no second request |
| Called again after a settled call | A fresh request. The update is idempotent and restarts the 15-minute window |
| `paymentMethodToken` or `session` changes | The CVC is cleared and an in-flight request aborted (it resolves `unknown_outcome`) |
| `environment` or `vaultEndpoint` changes | An in-flight request is aborted; the CVC is **kept** — it describes the card, not the host |
| `cardNetwork` changes | Re-validated and re-emitted without a keystroke; `state.valid` can flip either way |
| `reset()` | Clears the CVC **and** aborts an in-flight request (unlike the card form's `reset()`) |
| Unmount | Aborts an in-flight request; the promise resolves `unknown_outcome` |
| No `onStateChange` | No snapshot is built at all |

### What your backend does with the token

The returned token is a CVC-bearing reference to the saved card. Your server places it on the
payments confirm as `payment_method_data.vault_card_token.card_cvc`, together with the saved card's
`payment_token`, using your secret key, within 15 minutes of the update. Confirm the exact body for
your API version in the Hyperswitch API reference.

### Enforcement

`scripts/verify-saved-card.mjs` (in `yarn verify`) pins the method, the URL, the header set, the
body, the one token path and every refusal against the compiled transport.
`example/__tests__/savedCardCvc.test.tsx` covers the component: one input, the emitted state walked
for leaks, and every row of the behaviour table.

---

## Appendix — `HyperswitchVaultForm`

A ready-made form that renders the four fields in a fixed layout, for integrations that do not want
to place fields themselves. Same handle, same `session`, same `appearance` / `localisation` /
`cardholderName` / `enabledCardSchemes` / `vaultEndpoint` / `disabled` / `accessible` / `unstyled` /
`onFormStateChange` props, plus four of its own:

| Prop | Type | Default |
| --- | --- | --- |
| `layout` | `'stacked' \| 'inline'` | `'stacked'` (expiry and CVC on one row when `inline`) |
| `fieldArrangement` | `'separate' \| 'fused'` | `'separate'` (`fused` joins the three boxes and shares one error line) |
| `fieldOptions` | `{cardNumber?, expiry?, cvc?, cardholderName?}` of §9 options | `{}` |
| `fieldStyles` | `{cardNumber?, expiry?, cvc?, cardholderName?}` of §10 slots | `{}` |

It has no per-field `onStateChange` or field refs; read `state.fields` instead. The `*Widget`
names (`CardNumberWidget` …) are legacy aliases of the `*Field` components — the same objects — and
`HyperswitchVault` is a namespace object over all six components.

---

## Related documents

| Document | Use it for |
| --- | --- |
| `docs/field-props-reference.md` | Every field prop in a composed layout, in depth |
| `docs/merchant-integration.md` | Backend setup and the end-to-end walkthrough |
| `docs/control-surface.md` | What the library does and does not let you control, and why |
| `docs/host-api-reference.md` | The `./host` entry the Hyperswitch checkout SDK uses — not needed for this integration |
| `docs/adr/0008-saved-card-cvc-flow.md` | Why the saved-card CVC component looks the way it does, and the backend contract it was built against |
