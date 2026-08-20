# App integration

Everything the app side needs to collect and tokenize a card with
`@juspay-tech/react-native-hyperswitch-vault`, for both supported layouts:

- **Flow A — ready-made form.** One component renders all three card fields. Fastest path.
- **Flow B — custom layout.** You place three field widgets yourself, anywhere in your own screen.

Both flows share the same session, the same submit call, the same result type and the same
guarantees.

## Read this first

- **This release collects and tokenizes a new card.** That is its entire job.
- **Saved-card flows are not covered.** Listing, selecting, updating or deleting a previously
  saved card is not implemented in this package. See [section 9](#9-what-to-do-with-the-token).
- **Choose one integration style per card-form instance.** A single card form is either Flow A or
  Flow B, never both.
- **Multiple providers may exist on one screen**, and each is independent — but every widget
  belongs to exactly one provider, and each provider needs its own session.

The backend endpoint that produces a session is **not** covered here — see
[merchant-integration.md](merchant-integration.md#2-the-server). This document assumes you already
have it.

---

## 1. Install

```bash
npm install @juspay-tech/react-native-hyperswitch-vault
# or: yarn add @juspay-tech/react-native-hyperswitch-vault
```

| Requirement | Version |
| --- | --- |
| `react` | `>=19.0.0 <20.0.0` |
| `react-native` | `>=0.79.0 <0.80.0` |

> **Pre-release:** the package is not on the public npm registry yet. Until it is, install the
> packed tarball you were given:
> `npm install ./juspay-tech-react-native-hyperswitch-vault-<version>.tgz`.
> Nothing else in this document changes.

**No native step.** The package is pure JavaScript: no native module, no `pod install`, no Codegen,
no autolinking, no `react-native.config.js` entry.

This package has **no form library**. It declares only `react` and `react-native` as peers, and its
card fields are controlled views whose state it owns internally. You do not install, configure or
interact with a form library to use it.

---

## 2. Get a session

Your backend returns the `session_tokens` response verbatim. The app passes it to the component
untouched — do not reshape, unwrap or decode it.

```ts
import type {MerchantSession} from '@juspay-tech/react-native-hyperswitch-vault';

const session: MerchantSession = await fetch(`${YOUR_BACKEND}/vault-session`).then(r => r.json());
```

The session is **JSON**. Only `vault_details.vault_type` and
`vault_details.vault_data.sdk_authorization` are read; every other field your backend returns is
carried through and ignored. The `sdk_authorization` value inside that JSON is a **Base64-encoded**
string — which is precisely why nothing in your app should decode or inspect it.

Rules:

- A session belongs to **one Payment Method Session — one vault attempt.** Create a new one for a
  new attempt rather than holding one open or reusing it.
- Keep it in component state. Never persist it (AsyncStorage, Redux persist, disk). It is a
  short-lived credential.
- Never log it, render it, or decode it.
- After an `unknown_outcome` result, **reconcile the previous attempt server-side before creating
  or submitting another one** — see [section 5](#5-the-result).

`environment` must match the environment your backend created the session in:

```ts
type VaultEnvironment = 'production' | 'sandbox' | 'integration';
```

| `environment` | Vault host |
| --- | --- |
| `production` | `checkout.hyperswitch.io` |
| `sandbox` | `beta.hyperswitch.io` |
| `integration` | `dev.hyperswitch.io` |

---

## 3. Flow A — ready-made form

`sendTokenToYourBackend` and `showError` below are **your** functions, written by you for this
example. They are not exported by the package.

```tsx
import {useRef, useState} from 'react';
import {Button} from 'react-native';
import {
  HyperswitchVaultForm,
  type CardFormState,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

function SaveCard({session}: {session: MerchantSession}) {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const [card, setCard] = useState<CardFormState | null>(null);

  const save = async () => {
    const result = await formRef.current?.submit();
    if (!result) return;
    if (result.status === 'success') {
      await sendTokenToYourBackend(result.token);   // your function — see section 9
    } else {
      showError(result.error.message);              // your function — see section 5
    }
  };

  return (
    <>
      <HyperswitchVaultForm
        ref={formRef}
        session={session}
        environment="sandbox"
        onStateChange={setCard}
      />
      <Button title="Save card" onPress={save} disabled={!card?.complete} />
    </>
  );
}
```

### Props

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `session` | `MerchantSession` | yes | See section 2. |
| `environment` | `VaultEnvironment` | yes | See section 2. |
| `appearance` | `VaultFormAppearance` | no | See section 6. |
| `localisation` | `VaultFormLocalisation` | no | See section 7. |
| `splitCardFields` | `boolean` | no | `false` (default) is one bordered block, expiry and CVC sharing a row, errors below the block. `true` is three separately bordered fields, each error under its own field. |
| `disabled` | `boolean` | no | Makes the inputs non-interactive. |
| `accessible` | `boolean` | no | Passed to each `TextInput`. |
| `onStateChange` | `(state: CardFormState) => void` | no | See section 8. |

---

## 4. Flow B — custom layout

Wrap your screen in `HyperswitchVaultFormProvider` and place the three widgets wherever your design
puts them. Your own components can sit between them; nesting inside your Views and fragments is
fine.

```tsx
import {useRef, useState} from 'react';
import {Button, Text, TextInput, View} from 'react-native';
import {
  HyperswitchVaultFormProvider,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type CardFormState,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

function SaveCard({session}: {session: MerchantSession}) {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const [card, setCard] = useState<CardFormState | null>(null);
  const [plate, setPlate] = useState('');

  const save = async () => {
    const result = await formRef.current?.submit();
    if (!result) return;
    if (result.status === 'success') {
      await sendTokenToYourBackend(result.token);   // your function — see section 9
    } else {
      showError(result.error.message);              // your function — see section 5
    }
  };

  return (
    <HyperswitchVaultFormProvider
      ref={formRef}
      session={session}
      environment="sandbox"
      onStateChange={setCard}>
      <Text>Card number</Text>
      <CardNumberWidget />

      {/* your own field, your own state — the SDK never sees it */}
      <Text>Number plate</Text>
      <TextInput value={plate} onChangeText={setPlate} />

      {/* the row is yours: give each widget a flex:1 View of your own */}
      <View style={{flexDirection: 'row', gap: 12}}>
        <View style={{flex: 1}}>
          <CardExpiryWidget />
        </View>
        <View style={{flex: 1}}>
          <CardCVCWidget />
        </View>
      </View>

      <Button title="Save card" onPress={save} disabled={!card?.complete} />
    </HyperswitchVaultFormProvider>
  );
}
```

Widgets have no width of their own — they fill their parent. Sizing and spacing come from the
Views you wrap them in.

### Provider props

Identical to Flow A **except**: `children` is required, and there is no `splitCardFields` — layout
is yours.

| Prop | Type | Required |
| --- | --- | --- |
| `session` | `MerchantSession` | yes |
| `environment` | `VaultEnvironment` | yes |
| `children` | `React.ReactNode` | yes |
| `appearance` | `VaultFormAppearance` | no |
| `localisation` | `VaultFormLocalisation` | no |
| `disabled` | `boolean` | no |
| `accessible` | `boolean` | no |
| `onStateChange` | `(state: CardFormState) => void` | no |

### Widget rules

These are enforced, not advisory:

1. **All three widgets are mandatory.** `CardNumberWidget`, `CardExpiryWidget` and `CardCVCWidget`
   must each be mounted. The vault call needs number, expiry and CVC.
2. **Exactly one instance of each, per provider.** Two of the same widget under one provider is
   refused.
3. If a widget is missing or duplicated, `submit()` returns `status: 'not_ready'` with a message
   naming the widget, and **makes no network request**. Nothing is written to the console.
4. A widget rendered outside a provider **throws** while rendering, with a message naming the
   widget. This is the only throw in the API; it is a wiring mistake, so it fails loudly in
   development rather than silently at payment time.
5. Widgets take **no props** in this release — no `style`, no `textStyle`, no per-widget events, no
   field names, no custom validators. They inherit `appearance`, `localisation`, `accessible` and
   `disabled` from their provider. Wrap a widget in your own `View` to position or space it.
6. There is no `CardHolderWidget`. Collect a cardholder name as your own field if you need one; it
   is not part of the vault request.

### Placement is free, order is semantic

Put the widgets in any visual arrangement. Focus auto-advance always follows **number, then expiry,
then CVC**, regardless of where they sit on screen; if the next widget is not mounted, the advance
is a no-op. Backspace on an empty CVC returns to the expiry field, and on an empty expiry returns to
the card number.

---

## 5. The result

`submit()` **never throws** — not for validation, not for configuration, not for network failure.
It returns a discriminated union. Handle all four branches.

```ts
type VaultSubmitResult =
  | {status: 'success'; token: string; card: VaultCardMetadata}
  | {status: 'validation_error'; error: SafeVaultError}
  | {status: 'not_ready'; error: SafeVaultError}
  | {status: 'error'; error: SafeVaultError};

type VaultCardMetadata = {
  last4Digits: string;
  binNumber?: string;   // absent when the vault returns no BIN
  expiryMonth: string;
  expiryYear: string;
};

type SafeVaultError = {code: SafeVaultErrorCode; message: string};
type SafeVaultErrorCode =
  | 'invalid_session'
  | 'invalid_card_data'
  | 'not_ready'
  | 'server_error'
  | 'unknown_outcome';
```

| `status` | `error.code` | What happened |
| --- | --- | --- |
| `success` | not applicable | The card was tokenized. `token` is a short-lived Payment Method Token — see section 9. |
| `validation_error` | `invalid_card_data` | The card failed validation. Inline messages are already shown on the fields. |
| `not_ready` | `not_ready` | Fields have not registered yet, or in Flow B a required widget is missing or duplicated. |
| `error` | `invalid_session` | No `vault_details`, an unsupported `vault_type`, or a missing, blank or undecodable `sdk_authorization`. |
| `error` | `server_error` | The vault rejected the request or returned something unusable. |
| `error` | `unknown_outcome` | The request may or may not have reached the vault — a thrown fetch, a timeout, or an abort landing after the server had already processed it. |

### What to do about each

- **`invalid_card_data`** — the customer corrects the card and submits again. No new session
  needed.
- **`not_ready`** — safe to call again once the form is ready. In Flow B, fix the layout so exactly
  one of each widget is mounted.
- **`invalid_session`** — a configuration fault, not a transient one. **Verify and fix the
  `vault_details` configuration** behind the session. Fetching another identical session is not a
  solution; it will fail the same way.
- **`server_error`** — **there is no automatic retry, and none is performed for you.** Whether a
  fresh, explicit attempt is safe is a backend and product policy decision. Decide it deliberately.
- **`unknown_outcome`** — **requires server-side reconciliation.** The card may already have been
  tokenized. Reconcile that previous attempt before creating or submitting another one, and never
  retry blindly.

`error.message` is a fixed, safe string. It never contains a card value, a backend message, a
session identifier or anything decoded from the authorization. Show it, or substitute your own copy
keyed off `error.code`.

---

## 6. Appearance

One optional object, applied at the form or provider level. Every field is optional and falls back
to the built-in default.

| Key | Type | Applies to |
| --- | --- | --- |
| `primaryColor` | `string` | focus and active accent, CVC hint glyph |
| `textColor` | `string` | input text |
| `errorColor` | `string` | error text and invalid border |
| `placeholderColor` | `string` | placeholder and floating label |
| `backgroundColor` | `string` | input background |
| `borderColor` | `string` | input border and dividers |
| `borderRadius` | `number` | input corners |
| `borderWidth` | `number` | input border |
| `fontFamily` | `string` | all text in the fields |
| `inputHeight` | `number` | input height |
| `gap` | `number` | space between fields in split layout, and below the field block |
| `fontScale` | `number` | multiplies every font size |
| `placeholderTextSizeAdjust` | `number` | added to placeholder and label size before scaling |
| `errorTextSizeAdjust` | `number` | added to the 12pt error size before scaling |
| `errorMessageSpacing` | `number` | space between a field and its error |
| `brandIconMode` | `VaultFormBrandIconMode` | the card brand mark |

```ts
type VaultFormBrandIconMode = 'standard' | 'animated' | 'hidden' | 'hideGeneric';
```

`standard` (default) shows the detected brand, otherwise a generic card mark; `animated` cycles
brand placeholders until one is detected; `hidden` shows no mark; `hideGeneric` shows a detected
brand only.

Card brand artwork ships with the package. There is no network fetch for icons and no
`react-native-svg` dependency.

---

## 7. Localisation

```ts
localisation={{
  labels: {cardNumberPlaceholder: 'Numéro de carte', cvcPlaceholder: 'CVC'},
  validationMessages: {cardNumberInvalid: 'Numéro de carte invalide'},
  isRtl: false,
}}
```

Merged per field over the English defaults, so you can translate one string or all of them.

**labels** (`VaultFormLabels`): `cardNumberPlaceholder`, `cardNumberFloatingLabel`,
`expiryPlaceholder`, `expiryFloatingLabel`, `cvcPlaceholder`, `cvcFloatingLabel`.

**validationMessages** (`VaultFormValidationMessages`): `cardNumberRequired`, `cardNumberInvalid`,
`expiryRequired`, `expiryInvalid`, `cvcRequired`, `cvcInvalid`.

These replace text only. The rules behind them — Luhn, per-scheme lengths, the expiry window, CVC
length — are not configurable.

---

## 8. Form state

```ts
type CardFormState = {
  complete: boolean;
  cardNumberValid: boolean;
  expiryValid: boolean;
  cvcValid: boolean;
  brand: string;        // detected scheme name, empty until one is detected
};
```

Use `complete` to enable your submit button. It carries no card value — no PAN, no BIN, no last4,
no expiry.

In **Flow B** the mounted-widget registry is part of the calculation:

- a field's validity is reported `false` unless exactly one instance of its widget is mounted;
- `complete` requires exactly one of each of the three widgets **and** all three valid;
- mounting or unmounting a widget re-emits state immediately;
- a value typed into a widget that is later unmounted can never make the form look valid, and can
  never be submitted.

---

## 9. What to do with the token

`result.token` is a **short-lived Payment Method Token** returned by the payment-method-session
confirm. It is not card data, and it is **not a permanent identifier for the customer's card.**

Send it to **your** backend over TLS. Your backend then does one of two things:

1. **Use it for an immediate payment.**
2. **Exchange it server-to-server for a reusable Payment Method ID**, if the card is to be charged
   again later.

Both paths are described in the official Hyperswitch documentation:
[Token Led Payment](https://github.com/juspay/hyperswitch-docs/blob/main/integration-guide/payment-suite/payment-method-card/payments.md).

**Do not store the Payment Method Token as a permanent customer card identifier.** It is
short-lived. The reusable identifier is the Payment Method ID obtained from the exchange above.

Also:

- Do not log the token, render it, or send it to analytics. The example app renders it deliberately
  so a developer can read it off the device; a production app must not.
- **Saved-card flows are not implemented in this package.** Listing a customer's saved cards,
  selecting one, updating one, or collecting a CVC for one are not part of this release. Those are
  backend and product work today.

---

## 10. Imperative control

The form and the provider expose the same handle:

```ts
type HyperswitchVaultFormHandle = {
  submit: () => Promise<VaultSubmitResult>;
  reset: () => void;
  focus: (field: 'cardNumber' | 'expiry' | 'cvc') => void;
};
```

In Flow B each widget also accepts a ref:

```ts
type WidgetHandle = {focus: () => void; blur: () => void};
```

There is deliberately no getter for a field value, on either handle.

### Lifecycle guarantees

| Situation | Behaviour |
| --- | --- |
| `submit()` called again while one is in flight | Returns the **same promise**. No second request is issued. |
| While a submission is in flight | All fields are non-interactive. |
| `reset()` while in flight | **Refused** — a no-op. The request is not cancelled, and the fields keep their values. |
| `reset()` when idle | Clears values, validation state, displayed errors and the visible expiry text. |
| `session` or `environment` replaced | An in-flight request under the old session is aborted and resolves as `unknown_outcome`. The next `submit()` uses the new session. |
| Component or provider unmounted | An in-flight request is aborted. |
| A widget unmounted mid-flight, Flow B | The in-flight request is **not** aborted; it settles normally. |

---

## 11. Security and PCI DSS

Hyperswitch is a PCI DSS Level 1 Service Provider. When this SDK is integrated as documented, raw
card details are collected and sent directly to the Hyperswitch Vault and are not exposed through
the merchant-facing API. This can reduce the merchant's PCI DSS scope. Merchants remain responsible
for their own integration, applicable PCI obligations and required assessment. Modifying the
package to expose, log or persist raw card data can expand that scope.

Official sources:
[PCI compliance](https://docs.hyperswitch.io/other-features/security-and-compliance/pci-compliance)
and [Vault workflow](https://docs.hyperswitch.io/integration-guide/workflows/vault).

Rules for your integration:

1. Your secret API key stays on your server. The app never holds it.
2. Never persist or log the session, `sdk_authorization`, or anything decoded from it.
3. Never attempt to read a card value. There is no API for it.
4. Send the token to your own backend only, over TLS.
5. Use `environment: 'production'` only with production sessions.

---

## 12. Before you ship

- [ ] A session is created per vault attempt and never persisted.
- [ ] All four `submit()` branches are handled.
- [ ] `unknown_outcome` triggers server-side reconciliation of the previous attempt, never a blind
      retry.
- [ ] `server_error` retry behaviour is an explicit, documented product decision.
- [ ] `invalid_session` is treated as a configuration fault to fix, not a case to re-fetch.
- [ ] The submit button is driven by `complete`.
- [ ] The token goes to your backend, is not logged or rendered, and is either used for an
      immediate payment or exchanged for a Payment Method ID.
- [ ] **Flow B only:** all three widgets are mounted exactly once on every path through the screen,
      including conditional rendering, tabs and steppers.
- [ ] Tested on a physical device, both platforms.
- [ ] `environment` matches the backend environment in each build configuration.

---

## Reference

- Backend endpoint and the two Hyperswitch calls:
  [merchant-integration.md](merchant-integration.md#2-the-server)
- Charging with the token, server side:
  [merchant-integration.md](merchant-integration.md#5-what-to-do-with-the-token)
- What is and is not configurable: [control-surface.md](control-surface.md)
- Working code for both flows: [`example/src/MerchantCheckout.tsx`](../example/src/MerchantCheckout.tsx)
  (Flow A) and [`example/src/CustomLayoutCheckout.tsx`](../example/src/CustomLayoutCheckout.tsx)
  (Flow B)
