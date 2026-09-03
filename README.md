# @juspay-tech/react-native-hyperswitch-vault

Collect a card in React Native. The card details never touch your app code.

Authored in ReScript, published as JavaScript with genType-generated TypeScript declarations — you
need neither.

---

## The three flows

The library supports exactly three flows. **All three render the library's own card fields** — the
PAN, expiry, CVC and cardholder name are the library's in every one of them. What differs is what
the library then does with them, and therefore what crosses the public boundary.

| | Requests the library makes | What the caller receives | Operation |
|---|---|---|---|
| **Flow 1 — standalone merchant tokenization** | tokenize | a payment-method token | `tokenize()` |
| **Flow 2 — client-core payment confirmation** | tokenize, then confirm | a navigation decision, no token | `confirmPayment({cardSource: {type_: 'vault', session}})` — `./host` entry |
| **Flow 3 — vault disabled** | confirm only | a navigation decision, no token | `confirmPayment({cardSource: {type_: 'direct'}})` — `./host` entry |
| **Saved card — CVC only** | update a card you already saved | `{status: 'success', token}` — the same union as Flow 1 | `HyperswitchVaultSavedCardForm` + `updateSavedPaymentMethod()` — root entry ([ADR-0008](docs/adr/0008-saved-card-cvc-flow.md)) |

Most standalone integrations want **Flow 1**. Start there.

The package publishes one entry per audience (ADR-0010). The root is the merchant's: Flow 1, and
nothing that confirms a payment. Flows 2 and 3 are driven by the Hyperswitch checkout SDK through
`@juspay-tech/react-native-hyperswitch-vault/host` — the same components, typed with the wider
`HostFormHandle`. Merchants never import `./host`.

Flows 2 and 3 are the same operation with a different `cardSource`. The source is required and has
no default: whether a customer's card gets tokenized and saved is not something to infer from which
other arguments happened to be present.

---

## Quick start (Flow 1)

**1. Install**

```sh
yarn add @juspay-tech/react-native-hyperswitch-vault
```

No native step: no native module, no `pod install`, no Codegen, no autolinking. Peers are `react`
(>=19 <20) and `react-native` (>=0.79 <0.80), and there are no runtime dependencies.

**2. Get a session from your backend**

Your server creates the payment-method session with your secret key and returns the response as-is.

```ts
const session = await fetch('https://your-backend.example/vault-session').then(r => r.json());
```

Pass it through untouched — see [merchant-integration.md](docs/merchant-integration.md#2-the-server)
for the two backend calls that produce it.

**3. Render the form**

```tsx
import {
  HyperswitchVaultForm,
  type VaultFormHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';

const formRef = useRef<VaultFormHandle>(null);

<HyperswitchVaultForm
  ref={formRef}
  session={session}
  environment="sandbox"
  fieldOptions={{
    cardholderName: {placeholder: 'Name on card'},
    cardNumber: {placeholder: 'Card number', brandIconMode: 'standard'},
    expiry: {placeholder: 'MM/YY'},
    cvc: {placeholder: 'CVC', cvcIcon: 'default'},
  }}
/>;
```

**`fieldOptions` is how you change the form, not how you get one.** With no configuration at all
the library renders a complete field: a floating label carrying its own string, the brand mark on
the card number, the CVC glyph and inline validation messages. Every element is individually
switchable, and `unstyled` removes all of them — and the bordered box with them — leaving a plain
`TextInput`:

```tsx
<CardNumberField />           {/* full UI */}
<CardNumberField unstyled />  {/* a bare TextInput you position and style yourself */}
```

`unstyled` wins over the per-feature props: it is the "there is no UI" answer, not a different set
of defaults. Accessibility labels, keyboard type, length limits and the CVC's masking survive it. The library owns the card values; you
own how the checkout looks.

**4. Tokenize when your button is pressed**

```ts
const [busy, setBusy] = useState(false);

const save = async () => {
  setBusy(true);
  const result = await formRef.current?.tokenize();
  setBusy(false);

  if (result?.status === 'success') {
    await sendTokenToYourBackend(result.token); // never store or display the token in the app
  } else if (result) {
    showMessage(result.error.message);
  }
};
```

`tokenize()` takes no arguments and moves no money. It exchanges the card for a token and stops.

**There is nothing to wait for before enabling your button.** The library emits no state as the
customer types. A premature press returns `validation_error` or `not_ready` **without any network
request**, and the inline field errors appear at the same moment. The only state worth tracking is
whether your own promise is pending, as `busy` does above.

---

## Flow 2 — the library confirms the payment

Used by the Hyperswitch payment sheet. The library performs the tokenization *and* the final payment
confirmation, then hands back what to do next. The intermediate token never leaves the library.

```ts
import {HyperswitchVaultFormProvider, type HostFormHandle} from '@juspay-tech/react-native-hyperswitch-vault/host';

const formRef = useRef<HostFormHandle>(null);   // the ./host handle carries confirmPayment

const result = await formRef.current!.confirmPayment({
  cardSource: {type_: 'vault', session},  // tokenize first; the token stays inside
  paymentId: 'pay_123',
  sdkAuthorization: intentCredential,   // the PAYMENT-INTENT credential, not the vault one
  paymentMethodType: 'credit',
  paymentMethodData: {billing: {email: 'ada@example.com'}, nickName: 'Travel card'},
});

switch (result.status) {
  case 'succeeded': return done();
  case 'processing': return showPending();
  case 'requires_customer_action': return drive(result.nextAction);
  default: return showMessage(result.error.message);
}
```

`VaultPaymentResult` has no `token` member, so the credential cannot cross the boundary even by
accident. Full details, including the non-card input contract, are in
[app-integration.md](docs/app-integration.md#4-flow-2--client-core-payment-confirmation).

---

## Flow 3 — vault disabled

When the merchant profile does not ask for tokenization, the library still renders the card fields
and still makes the payment confirmation. Nothing is tokenized: the card values go straight into
`payment_method_data.card`, in one request, and no token exists at any point.

```ts
// formRef: useRef<HostFormHandle> from '@juspay-tech/react-native-hyperswitch-vault/host'
const result = await formRef.current!.confirmPayment({
  cardSource: {type_: 'direct'},        // no session, no tokenization, one request
  paymentId: 'pay_123',
  sdkAuthorization: intentCredential,
  paymentMethodType: 'credit',
});
```

Mount the form with no `session` prop at all in this flow — there is no vault session to give it.
`tokenize()` on such a form reports `invalid_session`, which is the honest answer: the operation
that mints a token cannot run without one.

Vaulting being switched off changes **what the request carries**, not **who owns the card**. This
release deliberately narrowed the earlier design, in which a merchant with vaulting off kept card
fields of their own: that left a PAN in application code for no benefit, since the library was
already there rendering nothing.

Flow 3 is chosen by configuration, never by failure. A profile configured to tokenize whose session
cannot back it must stop and report that. Quietly confirming the payment directly instead would
collect and transmit a PAN for a merchant who configured the opposite, and it would look entirely
normal on screen — a silent downgrade of a security posture, not a fallback.

---

## Custom layout

Place the fields yourself; everything else is identical.

```tsx
import {
  HyperswitchVaultFormProvider,
  CardholderNameField,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
} from '@juspay-tech/react-native-hyperswitch-vault';

<HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
  <CardholderNameField label="Name on card" />
  <CardNumberField placeholder="Card number" brandIconMode="standard" />
  <View style={{flexDirection: 'row', gap: 12}}>
    <CardExpiryField placeholder="MM / YY" />
    <CardCVCField placeholder="CVC" cvcIcon="default" />
  </View>
</HyperswitchVaultFormProvider>;
```

Exactly one card-number, one expiry and one CVC field per provider. `CardholderNameField` is
optional in a custom layout; the ready-made form always renders it, full width above the card
number.

### Naming — two spellings, one component

`CardNumberField` and `CardNumberWidget` are the same object (`===` holds at runtime), as are the
expiry, CVC and cardholder-name pairs. Use whichever reads better.

### The `HyperswitchVault` namespace

```tsx
import {HyperswitchVault} from '@juspay-tech/react-native-hyperswitch-vault';

<HyperswitchVault.CardForm session={session} environment="sandbox" />;
<HyperswitchVault.Form session={session} environment="sandbox">
  <HyperswitchVault.CardholderName />
  <HyperswitchVault.CardNumber />
  <HyperswitchVault.Expiry />
  <HyperswitchVault.CVC />
</HyperswitchVault.Form>;
```

Every member is identity-equal to its canonical export, and the namespace tree-shakes away when
unreferenced.

---

## The handle

```ts
/* root — merchants */
type VaultFormHandle = {
  tokenize(): Promise<VaultTokenizeResult>;
  reset(): void;
  focus(field: 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName'): void;
};

/* ./host — the checkout SDK; the same runtime object */
type HostFormHandle = VaultFormHandle & {
  confirmPayment(input: VaultPaymentConfirmInput): Promise<VaultPaymentResult>;
};
```

Two explicit operations rather than one ambiguous `submit()`, published on two entries: the function
you call decides what can come back, and the entry you import from decides which functions exist.

- Repeating the **same** operation while it is pending returns the same promise — double presses are
  harmless.
- Requesting the **other** operation mid-flight returns `not_ready` with no request.
- `reset()` clears values, expiry text, validation state and errors, and is ignored while an
  operation is in flight.

Field widgets take their own ref: `{focus(), blur()}`. Nothing exposes a value.

---

## Results

```ts
/* Flow 1 — the ONLY published type carrying a token. */
type VaultTokenizeResult =
  | {status: 'success';          token: string}
  | {status: 'validation_error'; error: SafeVaultError}
  | {status: 'not_ready';        error: SafeVaultError}
  | {status: 'error';            error: SafeVaultError};

/* Flow 2 — no token member exists. */
type VaultPaymentResult =
  | {status: 'succeeded'}
  | {status: 'processing'}
  | {status: 'requires_customer_action'; nextAction: VaultNextAction}
  | {status: 'failed';           error: SafeVaultError}
  | {status: 'validation_error'; error: SafeVaultError}
  | {status: 'not_ready';        error: SafeVaultError};
```

The status vocabularies differ on purpose, so a comparison copied between flows is a compile error
rather than a branch that silently never runs.

| `error.code` | Meaning | Retry? |
|---|---|---|
| `invalid_card_data` | entry incomplete or invalid; nothing sent | yes, after correction |
| `not_ready` | fields not mounted, or (on `./host`) the other operation is in flight; nothing sent | yes |
| `invalid_session` | session unusable; nothing sent | no — fetch a new session |
| `forbidden_card_data` | `./host` only — a card key was passed in the confirm input; nothing sent | no — fix the integration |
| `unsupported_configuration` | an invalid endpoint, or (on `./host`) contradictory confirm props; nothing sent | no |
| `server_error` | the backend refused, or answered 2xx unreadably | not automatically |
| `unknown_outcome` | the request threw, timed out, or was aborted | **no** — reconcile first |

`message` is always library-owned, customer-safe text. A backend error string is never forwarded.

**`unknown_outcome` is the one to get right.** A thrown fetch, a timeout and an abort are
indistinguishable from a request that was already processed, and neither endpoint takes an
idempotency key. The library never retries anything.

---

## State events

The form tells you what the customer has typed **about**, never what they typed.

```tsx
<CardNumberField
  onStateChange={s => {
    s.valid;        // would this field pass submission right now?
    s.status;       // 'empty' | 'incomplete' | 'complete'
    s.touched;      // has the customer been here yet — should your chrome complain?
    s.focused;      // is the cursor in it?
    s.brand;        // 'visa' | 'mastercard' | … | 'unknown'   (card number only)
    s.error?.code;  // 'required' | 'invalid_card_number' | …
  }}
/>

<HyperswitchVault.CardForm
  session={session}
  environment="sandbox"
  onFormStateChange={s => setPayEnabled(s.canSubmit)}
/>
```

`onStateChange` is available on all four fields; `onFormStateChange` on the ready-made form and the
provider. Both fire once on mount and again only when the snapshot actually changes, so an inline
arrow function is safe and typing a digit that changes nothing observable emits nothing.

**No card value is on any snapshot** — no PAN, no BIN, no last four, not even the length of what was
typed, and never the payment-method token. That is the line where this parts company with VGS
Collect, whose per-field update carries `bin` and `last4`. `verify-event-surface.mjs` pins the exact
member set against the packed declarations, so the payload cannot be widened without failing the
build. See [ADR-0005](docs/adr/0005-restore-card-safe-state-emission.md).

Pass no callback and nothing is derived at all.

---

## Field options and styling

Field **options** decide which elements exist; field **styles** decide how they look. A style never
turns an element on.

```tsx
<HyperswitchVaultForm
  session={session}
  environment="sandbox"
  layout="inline"              // expiry and CVC share a row
  fieldArrangement="fused"     // joined borders
  fieldOptions={{cardNumber: {label: 'Card number', labelBehavior: 'floating', errorDisplay: 'inline'}}}
  fieldStyles={{cardNumber: {root: {marginTop: 8}, input: {fontSize: 16}}}}
  appearance={{primaryColor: '#0570DE', borderRadius: 8}}
  localisation={{validationMessages: {cardNumberInvalid: 'Check the number'}}}
/>;
```

Per-field option props are flattened on the individual widgets (`<CardNumberField placeholder="…" />`)
and grouped on the ready-made form. Accessibility labels stay on even under `unstyled`.

The complete inventory is in [control-surface.md](docs/control-surface.md) and
[public-api-baseline.md](docs/public-api-baseline.md).

---

## Self-hosted deployments

`environment` selects a public Hyperswitch host. A self-hosted deployment overrides it with
`vaultEndpoint`, which is where `tokenize()` posts the payment-method-session confirm:

```tsx
<HyperswitchVaultForm
  session={session}
  environment="sandbox"
  vaultEndpoint={{baseUrl: 'https://payments.your-company.example/api'}}
/>;
```

The base is validated exactly like every other one: `https` required — `http` only on a loopback host
(`localhost`, `127.0.0.1`, `10.0.2.2`) and never in production — no credentials, no query string,
no fragment. A path prefix is kept (`/api` above) and a trailing slash is trimmed.
A base that fails validation returns `unsupported_configuration` **with nothing sent** — it is never
silently replaced by the public host. Omit the prop and the `environment` host is used.

`vaultEndpoint` covers the vault call only. In Flows 2 and 3 the payment confirm has its own
`endpoint` on the `confirmPayment()` input; set both when you self-host.

---

## Lifecycle

- **Replacing the `session` prop** aborts in-flight work and discards any cached token. Fetch a
  fresh session per attempt.
- **Unmounting** does the same.
- **A minted token is never re-minted.** If tokenization succeeds and the payment confirm then
  fails, the library keeps the token internally and a retry re-runs only the confirm — whether the
  payment-method-session confirm is idempotent is not established, and assuming it wrongly would
  vault the card twice. The cached token is discarded when any card value changes, when the session
  changes, on `reset()`, and on unmount.

---

## Security

- Secret API key: **server only.** Never in the app, an app `.env`, or version control.
- Never log or display the session, the `sdk_authorization`, or anything decoded from it. This
  library contains no logging at all, deliberately.
- Never persist the session. Keep it in component state and refetch.
- The payment-method token belongs on your backend, not in your app and not in your logs.

The boundary, stated exactly:

> PAN, expiry and CVC never cross the library's supported public API. They remain in library-owned
> state and are transmitted only by the library's internal tokenization transport. The merchant
> receives safe UI state and the resulting token.

In Flow 2 it is narrower still: the caller receives a navigation decision and not the token either.

That is an API and data-flow guarantee — **not** native-process isolation, **not** memory
zeroization, **not** a claim of PCI DSS compliance, **not** a claim that your PCI scope is reduced,
and **not** protection from malicious code executing inside your own application process. Only your
own assessor can determine your scope.

Host code runs in the same JavaScript process and can monkey-patch globals such as `fetch`; the
library's own tests do exactly that to observe its requests. The guarantee covers the supported
public API, not malicious in-process instrumentation.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `invalid_session` immediately, nothing sent | the session has no `vault_details`, an unsupported `vault_type`, or a blank authorization. Check your server returned the response *verbatim*. |
| `not_ready` from an operation | fields have not registered yet, or the other operation is in flight. There is no readiness event to wait for. |
| `forbidden_card_data` | your `paymentMethodData` contains a card key. The library owns the card fields; pass only `billing` and `nickName`. |
| `server_error` after a 2xx | the backend answered but the body held no token. Reconcile on your backend; do not blind-retry. |
| `Cannot read properties of null (reading 'useMemo')` at render | two copies of React in the bundle, typical of linked/portal installs. Alias `react`, `react-dom` and `react-native`/`react-native-web` to single absolute paths. |
| `View config getter callback for component 'AndroidTextInput' must be a function` | two copies of `react-native`. Same fix. |

---

## Example app

`example/` is a runnable React Native app and `example-server/` a dependency-free merchant backend.
They are separate directories on purpose — **the secret API key belongs only on the server. Never put
it in the React Native app**, in an app `.env`, or anywhere that ships to a device. The app receives
only the client-safe session response.

## Documentation

| Document | What it covers |
|---|---|
| [docs/merchant-integration.md](docs/merchant-integration.md) | Flow 1 end to end, including the backend endpoint |
| [docs/app-integration.md](docs/app-integration.md) | all three flows, the operations, and the input contracts |
| [docs/control-surface.md](docs/control-surface.md) | what you can and cannot control or observe |
| [docs/public-api-baseline.md](docs/public-api-baseline.md) | the complete published surface |
| [docs/adr/0003-…md](docs/adr/0003-remove-state-emission-and-own-final-confirmation.md) | why the library owns the confirmation (its emission removal is superseded) |
| [docs/adr/0005-…md](docs/adr/0005-restore-card-safe-state-emission.md) | why state emission is back, and how the payload is pinned |
| [docs/adr/0006-…md](docs/adr/0006-default-ui.md) | why the library ships a UI by default, and what `unstyled` removes |
| [docs/adr/0008-…md](docs/adr/0008-saved-card-cvc-flow.md) | the saved-card CVC component, and the backend authorization contract it was verified against |
| [docs/followup-saved-card-final-confirm.md](docs/followup-saved-card-final-confirm.md) | P0: the checkout SDK cannot yet consume the saved-card CVC token on its final confirm |
