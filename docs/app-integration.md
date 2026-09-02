# App integration

Everything the app side needs to collect a card with
`@juspay-tech/react-native-hyperswitch-vault`.

## The three flows

The library supports exactly three flows. **All three render the library's own card fields**: the
PAN, expiry, CVC and cardholder name belong to the library in every one of them. What differs is
what the library then does with those values, and therefore what crosses the public boundary. Pick
one deliberately; they are not interchangeable.

| | Requests the library makes | What the caller receives | Operation |
|---|---|---|---|
| **Flow 1 — standalone merchant tokenization** | tokenize | a payment-method token | `tokenize()` |
| **Flow 2 — client-core payment confirmation** | tokenize, then confirm | a navigation decision, no token | `confirmPayment({cardSource: {type_: 'vault', session}})` — `./host` |
| **Flow 3 — vault disabled** | confirm only | a navigation decision, no token | `confirmPayment({cardSource: {type_: 'direct'}})` — `./host` |

Flows 2 and 3 are the SAME operation with a different `cardSource`. The source is required and has
no default — whether a customer's card is tokenized and saved is not a thing to infer from which
other arguments happened to be passed.

Two layout styles are available to all three flows:

- **Ready-made form.** One component renders every card field. Fastest path.
- **Custom layout.** You place the field widgets yourself, anywhere in your own screen.

Both share the same session, the same operations, the same result types and the same guarantees.

## Read this first

- **This release collects a new card.** Listing, selecting, updating or deleting a previously saved
  card is not implemented in this package.
- **Choose one integration style per card-form instance.** A single card form is either ready-made
  or custom, never both.
- **Multiple providers may exist on one screen**, and each is independent — but every widget belongs
  to exactly one provider, and each provider needs its own session.
- **The library reports state as the customer types, and never values.** `onStateChange` per field
  and `onFormStateChange` for the form carry validity, completeness, focus, touched and the visible
  message — no PAN, no BIN, no last four, no length (see
  [ADR-0005](adr/0005-restore-card-safe-state-emission.md)). Pass no callback and the library derives
  nothing at all, which is exactly what it cost before the callbacks existed.

The backend endpoint that produces a session is **not** covered here — see
[merchant-integration.md](merchant-integration.md#2-the-server). This document assumes you have it.

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

**No native step.** The package is pure JavaScript: no native module, no `pod install`, no Codegen,
no autolinking, no `react-native.config.js` entry.

This package has **no form library**. It declares only `react` and `react-native` as peers, and its
card fields are controlled views whose state it owns internally.

> **Linked or portal installs:** a linked package resolves its own peer dependencies from its own
> directory, which can put a second copy of React in your bundle. The symptom is a null hook
> dispatcher (`Cannot read properties of null (reading 'useMemo')`) at render, not a resolution
> error. Alias `react`, `react-dom` and `react-native`/`react-native-web` to single absolute paths
> in your bundler config.

---

## 2. Get a session

Your backend returns the `session_tokens` response verbatim. The app passes it to the component
untouched — do not reshape, unwrap or decode it.

```ts
import type {MerchantSession} from '@juspay-tech/react-native-hyperswitch-vault';

const session: MerchantSession = await fetch(`${YOUR_BACKEND}/vault-session`).then(r => r.json());
```

Only `vault_details.vault_type` and `vault_details.vault_data.sdk_authorization` are read; every
other field is carried through and ignored. The `sdk_authorization` value is a **Base64-encoded**
string — which is precisely why nothing in your app should decode or inspect it.

Rules:

- A session belongs to **one Payment Method Session — one vault attempt.** Create a new one per
  attempt rather than holding one open or reusing it.
- Keep it in component state. Never persist it (AsyncStorage, Redux persist, disk).
- Never log it, render it, or decode it.
- After an `unknown_outcome` result, **reconcile the previous attempt server-side** before creating
  or submitting another one.

`environment` must match the environment your backend created the session in:

| `environment` | vault host |
|---|---|
| `"sandbox"` | `https://beta.hyperswitch.io/api` |
| `"integration"` | `https://dev.hyperswitch.io/api` |
| `"production"` | `https://checkout.hyperswitch.io/api` |

---

## 3. Flow 1 — standalone merchant tokenization

You collect a card, get a token, and your own backend charges it whenever you choose.

```
library fields → PMS confirm → {status: 'success', token}
```

```tsx
import {useRef, useState} from 'react';
import {Button, View} from 'react-native';
import {
  HyperswitchVaultForm,
  type VaultFormHandle,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

export function SaveCard({session}: {session: MerchantSession}) {
  const formRef = useRef<VaultFormHandle>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const result = await formRef.current?.tokenize();
    setBusy(false);

    if (result?.status === 'success') {
      await sendToYourBackend(result.token);   // never store or display it in the app
    } else if (result) {
      showMessage(result.error.message);
    }
  };

  return (
    <View>
      <HyperswitchVaultForm ref={formRef} session={session} environment="sandbox" />
      <Button title="Save card" onPress={save} disabled={busy} />
    </View>
  );
}
```

`tokenize()` takes no arguments. It exchanges the card for a token and stops; nothing is charged.

### The tokenize result

```ts
type VaultTokenizeResult =
  | {status: 'success';          token: string}
  | {status: 'validation_error'; error: SafeVaultError}
  | {status: 'not_ready';        error: SafeVaultError}
  | {status: 'error';            error: SafeVaultError};
```

**This is the only published type with a `token`.** `validation_error` and `not_ready` are returned
without any network request.

---

## 4. Flow 2 — client-core payment confirmation

The library performs both calls and hands back what to do next. This is the flow the Hyperswitch
payment sheet uses.

Flows 2 and 3 are driven through the **`./host` entry** (ADR-0010):

```ts
import {
  HyperswitchVaultFormProvider,
  CardNumberField, CardExpiryField, CardCVCField, CardholderNameField,
  type HostFormHandle,
  type VaultPaymentConfirmInput,
  type VaultPaymentResult,
} from '@juspay-tech/react-native-hyperswitch-vault/host';

const formRef = useRef<HostFormHandle>(null);
```

The components are the root's own objects; only the types are wider. The merchant root does not
publish `confirmPayment`, the confirm input or the payment result.

```
library fields → PMS confirm → internal token → final payment confirm → navigation result
```

The intermediate token stays inside the library. It is not returned, not published, and not readable
through any handle — `VaultPaymentResult` has no `token` member, so this is a property of the type
rather than a promise in prose.

```tsx
const result = await formRef.current!.confirmPayment({
  paymentId: 'pay_123',
  sdkAuthorization: intentCredential,       // the PAYMENT-INTENT credential
  paymentMethodType: 'credit',
  paymentMethodData: {billing: {email: 'ada@example.com'}, nickName: 'Travel card'},
  browserInfo: {userAgent, colorDepth: 32, javaEnabled: true},
  returnUrl: 'myapp://return',
});

switch (result.status) {
  case 'succeeded': return done();
  case 'processing': return showPending();
  case 'requires_customer_action': return drive(result.nextAction);
  default: return showMessage(result.error.message);
}
```

### The two credentials are not interchangeable

| | Credential | Source | Used by |
|---|---|---|---|
| Call 1 | vault `sdk_authorization` | inside `cardSource.session`'s `vault_details` | the library only |
| Call 2 | payment-intent `sdkAuthorization` | the `confirmPayment` input | the library only |

You supply the second because you own the payment intent. You never see the first — you hand over
the session it lives in, and the library decodes it.

Flow 3 uses only the second: there is no call 1 and no vault credential in that flow.

### The payment result

```ts
type VaultPaymentResult =
  | {status: 'succeeded'}
  | {status: 'processing'}
  | {status: 'requires_customer_action'; nextAction: VaultNextAction}
  | {status: 'failed';           error: SafeVaultError}
  | {status: 'validation_error'; error: SafeVaultError}
  | {status: 'not_ready';        error: SafeVaultError};
```

`nextAction.type_` is one of `three_ds_invoke`, `third_party_sdk_session_token`,
`display_bank_transfer_information`, `invoke_ddc` or `redirect_to_url`, with optional
`redirectUrl`, `threeDs`, `ddc` and `sessionToken` payloads. Only allowlisted navigation fields are
carried; a confirm response's `payment_method_data.card` is never read.

### Host input is non-card only, and fails closed

`paymentMethodData` accepts exactly `billing` and `nickName`. A card key anywhere inside it, at any
depth — `card`, `card_number`, `cardNumber`, `cvc`, `expiryMonth`, `cardHolderName`, `bin`, `last4`,
`payment_token`, `vault_card`, and the rest — fails the whole call with `forbidden_card_data` and
sends **no network request**. Nothing is silently stripped: a caller trying to hand the library a
PAN has an integration bug, and hiding it would not fix it.

`nickName` names the saved card and is sent on call 1 only.

### Who collects the cardholder name

Three arrangements, chosen with `cardholderName` on the form:

| Mode | The library renders | Value comes from |
|---|---|---|
| `'collect'` *(default)* | its own bare input | what the customer typed into it |
| `'external'` | **nothing** | the `cardholderName` member of the confirm input |
| `'omit'` | **nothing** | nowhere — no name is sent |

```tsx
/* Default: the library collects it. */
<HyperswitchVaultForm environment="sandbox" />

/* Your screen owns the field; you supply the validated value at confirm time. */
<HyperswitchVaultForm environment="sandbox" cardholderName="external" />
```

```ts
await formRef.current!.confirmPayment({
  cardSource: {type_: 'direct'},
  paymentId, sdkAuthorization,
  cardholderName: nameFromYourOwnField,   // 'external' only
});
```

`'external'` and `'omit'` look identical on screen and differ entirely in what is sent. They are
separate on purpose: *"I will supply it"* and *"there is none"* must not be spelled the same way, or
a value you forgot to pass becomes a name silently dropped.

**Why `'external'` exists.** A host with its own dynamic form has its own cardholder-name field —
with its own validation, localised messages and error timing. Replacing that with the library's
bare input would throw all of it away; rendering both asks the customer for one name twice, from two
components that cannot see each other. `'external'` keeps your field and your validation, and moves
only the validated string.

`cardholderName` is the **one** card value a host may pass into the library, and it is a member of
its own for that reason. It is not reachable through `paymentMethodData`, which stays non-card and
still rejects `card`, `card_holder_name`, `cardHolderName` and every other card key at any depth.

Supplying it in `'collect'` or `'omit'` is a configuration error — `unsupported_configuration`, with
no request. It is never resolved by precedence: a host with two names cannot tell which was sent.
Omitting it in `'external'` is fine and means the customer left an optional field blank.

Nothing comes back. The library attaches the name to `payment_method_data.card.card_holder_name` on
a direct confirm, and to the card object of the tokenization request on a vault one, and never
returns, emits or logs it.

**The library's own field is drawn like the others.** In `'collect'` it renders with a floating
"Name on card" label. It stays optional and uncontrolled, and the library forms no verdict about it:
no validation, and therefore no error message however `errorDisplay` is set. `unstyled` reduces it
to a plain input like any other field. It
keeps an internal accessibility label, trims outer whitespace only when the request is built, and
omits `card_holder_name` entirely when blank. Merchant-configurable validation and messages are not
implemented yet.

In a custom layout, `<CardholderNameField />` renders only where you place it — leaving it out is
already supported, and a confirmation succeeds without it.

### Co-badged cards

When the typed number matches more than one network you accept, the card-number field's accessory
becomes a chooser. The customer's pick decides which network the payment is routed over, and it
reaches every flow that sends a card:

| | Where the choice lands |
|---|---|
| `tokenize()` | `payment_method_data.card.card_network` on the tokenization request |
| `cardSource: vault` | the same field on the tokenization request; the saved card records it |
| `cardSource: direct` | `payment_method_data.card.card_network` on the payment confirm |

Supply `enabledCardSchemes` to narrow what may be offered and to enable the "card not supported"
rule. With one acceptable network left there is no choice to make and no chooser appears.

Nothing about the selection is published — there is no callback and no way to read it back.

### Other inputs

| Input | Notes |
|---|---|
| `cardSource` | **Required.** `{type_: 'vault', session, confirmTokenMode?}` tokenizes first; `{type_: 'direct'}` does not. A direct source carrying `session` or `confirmTokenMode` is rejected with `unsupported_configuration` and no request — it describes a caller who believes the card is being saved when it is not. |
| `cardSource.confirmTokenMode` | Vault source only. `'payment_token'` (default) sends the token top-level; `'vault_card'` puts it in `payment_method_data.vault_card` for processors that expect that shape. |
| `paymentMethodType` | `'credit'` (default) or `'debit'`. |
| `paymentType` | `'new_mandate'` or `'setup_mandate'`. Omit for a normal payment. |
| `customerAcceptance` | `{acceptanceType: 'online' \| 'offline', acceptedAt, online: {userAgent}}`. |
| `browserInfo` | scalars only; the library has no device access, so the host supplies them. |
| `returnUrl`, `email` | passed through. |
| `eligibilityRequired` | `true` makes the library run the backend eligibility check itself, with the PAN it owns, before confirming. A denial returns `card_not_eligible` and confirms nothing. A transport failure resolves to *allowed*, reproducing the existing behaviour — eligibility is a routing preference, and the backend still refuses an ineligible card at confirm time. |
| `appId` | Non-card. Reproduces the `x-app-id` header on the eligibility call. |
| `cardholderName` | `'collect'` (default) or `'omit'`. A form prop, not a confirm input — see above. |
| `enabledCardSchemes` | A form prop. The networks you accept; drives the co-badge chooser and the unsupported-card rule. |
| `endpoint` | `{baseUrl}` overrides the FINAL confirm host only. Validated: https required, except `http://localhost` and `http://10.0.2.2` in sandbox/integration; credentials, path, query and fragment are rejected. Invalid values fail with `unsupported_configuration` and no request. |

---

### Eligibility

Set `eligibilityRequired: true` when the payment has a backend eligibility step. The library makes
the call itself, with the PAN it owns, and gates the confirmation on the answer.

| Backend answer | Result |
|---|---|
| `sdk_next_action.next_action` is `"deny"`, or an object with a `deny` key | `failed` / `card_not_eligible`, and **no** confirmation request |
| any other action | the confirmation proceeds |
| a transport failure, a 5xx, an unreadable body, no `sdk_next_action` | the confirmation proceeds |

**That last row is deliberate, and it is the one place the library fails open.** Eligibility is a
merchant routing preference, not an authorization control, and the backend still refuses an
ineligible card at confirm time — so a dropped packet must not become a declined checkout. It
reproduces a decision already made in client-core (`94b89ee`, *"allowing the payment for all the
cases and blocking for deny"*), which changed this behaviour **from** fail-closed **to** fail-open
because failing closed was rejecting payments merchants wanted taken.

Passing the optional `eligibility` prop additionally runs the check as the customer finishes typing,
so the "card not accepted" message appears inline. That prop only changes WHEN the check happens;
`confirmPayment` re-checks regardless.

### Retries, and what is never retried

| Situation | What the library does |
|---|---|
| Two confirmations in flight at once | the second returns the same promise; one sequence, one set of requests |
| The other operation while one is pending | refused with `not_ready`, and no request |
| Tokenization succeeded, the payment confirm failed definitively | a retry re-runs **only** the payment confirm — the token is reused |
| The payment confirm returned an unknown outcome | `failed` / `unknown_outcome`, and **never** retried automatically |
| The card is edited, `reset()` is called, the session changes, or the form unmounts | any cached token is discarded |

The reason the token is reused rather than re-minted: the payment-method-session confirm is **not
idempotent**. It accepts no idempotency key, nothing refuses a second confirm of the same session,
and each confirm stores another payment method. Re-minting on retry would vault one card twice.

An `unknown_outcome` means the request may already have been processed and there is no idempotency
key on that endpoint either — so the decision to retry is yours, with whatever context you have.

### Unsupported configuration

`failed` / `unsupported_configuration` means the request was never sent, and the reason is the
integration rather than the card or the customer:

- a `cardSource: direct` carrying a `session` or a `confirmTokenMode`;
- a `cardSource: direct` on a form mounted **with** a usable vault session — the mount says
  "tokenize this card" and the call says "do not", and the library will not pick one for you;
- an `endpoint.baseUrl` that fails validation.

## 5. Flow 3 — vault disabled

When the merchant profile does not ask for tokenization, **the library still renders the card fields
and still makes the payment confirmation**. Nothing is tokenized: the card values the library holds
go straight into `payment_method_data.card`, in one request, and no token exists at any point.

```tsx
/* No `session` prop — there is no vault session in this flow. */
<HyperswitchVaultForm ref={formRef} environment="sandbox" />
```

```ts
const result = await formRef.current!.confirmPayment({
  cardSource: {type_: 'direct'},
  paymentId: 'pay_123',
  sdkAuthorization: intentCredential,
  paymentMethodType: 'credit',
  paymentMethodData: {billing: {email: 'ada@example.com'}},
});
```

The request:

```json
{
  "payment_method": "card",
  "payment_method_type": "credit",
  "payment_method_data": {
    "billing": {"email": "ada@example.com"},
    "card": {
      "card_number": "<library-owned>",
      "card_exp_month": "<library-owned>",
      "card_exp_year": "<library-owned>",
      "card_cvc": "<library-owned>",
      "card_holder_name": "<library-owned, omitted when blank>"
    }
  }
}
```

The result is the SAME `VaultPaymentResult` union Flow 2 returns, with the same navigation branches
and the same absence of a token. The host non-card data is serialized first and the card subtree is
attached last, by explicit assignment — the library decides where the card goes, never the caller.

`tokenize()` on a form mounted without a session reports `invalid_session`. That is the honest
answer rather than an error: the operation that mints a token cannot run without a vault session.

### Why this is not "the library steps aside"

An earlier design had this flow mean exactly that: with vaulting off, the application kept card
fields of its own and built its own confirm body. That was narrowed deliberately. It left a PAN in
application code for no benefit — the library was already on screen — and it meant a merchant's PCI
posture silently depended on a server-side profile flag.

Flow 3 is selected by configuration, never by failure. If a profile *is* configured to tokenize but
the session cannot back it — no `vault_details`, an unsupported vault type, a blank authorization —
the correct behaviour is to stop and report it. Confirming directly instead would transmit a PAN for
a merchant who configured the opposite, and it would look completely normal on screen while doing
so. That is not a fallback; it is a silent downgrade of a security posture, and the integration must
refuse it.

---

## 6. Custom layout

Place the fields yourself. Everything else is identical.

```tsx
<HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
  <CardholderNameField label="Name on card" />
  <CardNumberField placeholder="Card number" brandIconMode="standard" />
  <View style={{flexDirection: 'row', gap: 12}}>
    <CardExpiryField placeholder="MM / YY" />
    <CardCVCField placeholder="CVC" cvcIcon="default" />
  </View>
</HyperswitchVaultFormProvider>
```

Exactly one card-number, one expiry and one CVC field must be mounted per provider; `tokenize()` and
`confirmPayment()` both return `not_ready` otherwise, naming what is missing.

**`CardholderNameField` is optional.** The ready-made form always renders it, full width above the
card number; a custom layout may omit it entirely and still succeed. Left blank, it is omitted from
the request.

---

## 7. The handle

```ts
/* root */
type VaultFormHandle = {
  tokenize(): Promise<VaultTokenizeResult>;
  reset(): void;
  focus(field: 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName'): void;
};

/* ./host */
type HostFormHandle = VaultFormHandle & {
  confirmPayment(input: VaultPaymentConfirmInput): Promise<VaultPaymentResult>;
};
```

Two explicit operations rather than one ambiguous `submit()`: which one you call decides what can
come back, so the exposure is visible at the call site instead of depending on which arguments were
passed.

- **`reset()`** clears values, expiry text, validation state and errors. It is ignored while an
  operation is in flight.
- **Repeating the same operation** while it is pending returns the same promise, so a double press
  is harmless. Requesting the *other* operation while one is pending returns `not_ready` without a
  request — there is no honest answer to give it mid-flight.

There are no value accessors in either direction. State callbacks report validity, completeness,
focus and the visible message — never a card value; see
[ADR-0005](adr/0005-restore-card-safe-state-emission.md).

---

## 8. Retry safety

- **`unknown_outcome` is never retried automatically**, on either call. A thrown fetch, a timeout
  and an abort are indistinguishable from a request the backend already processed, and neither
  endpoint takes an idempotency key.
- **A minted token is not re-minted.** If call 1 succeeds and call 2 fails, the library keeps the
  token internally and a subsequent `confirmPayment()` re-runs only call 2. Whether the
  payment-method-session confirm is idempotent is **not established**, so assuming it and being
  wrong would vault the customer's card twice.
- That cached token is discarded when any card value changes, when the session changes, on
  `reset()`, and on unmount.

---

## 9. Errors

Every error is `{code, message}` where `message` is library-owned, customer-safe text. A backend
error string is never forwarded.

| `code` | Meaning |
|---|---|
| `invalid_card_data` | the customer's entry is incomplete or invalid; nothing was sent |
| `not_ready` | fields are not mounted yet, or the other operation is in flight; nothing was sent |
| `invalid_session` | the session cannot be used; nothing was sent |
| `forbidden_card_data` | the host put a card key in the confirm input; nothing was sent |
| `unsupported_configuration` | eligibility required, or an invalid endpoint; nothing was sent |
| `server_error` | the backend refused, or answered 2xx with an unreadable body |
| `unknown_outcome` | the request threw, timed out, or was aborted — outcome genuinely unknown |

---

## 10. The boundary

> PAN, expiry and CVC never cross the library's supported public API. They remain in library-owned
> state and are transmitted only by the library's internal tokenization transport. The merchant
> receives safe UI state and the resulting token.

In Flow 2 that is narrower still: the caller receives a navigation decision and not the token
either.

That is an API and data-flow guarantee — **not** native-process isolation, **not** memory
zeroization, **not** a claim of PCI DSS compliance, **not** a claim that your PCI scope is reduced,
and **not** protection from malicious code executing inside your own application process.

Host code runs in the same JavaScript process and can monkey-patch globals such as `fetch`; the
library's own tests do exactly that to observe its requests. The guarantee covers the supported
public API, not malicious in-process instrumentation.
