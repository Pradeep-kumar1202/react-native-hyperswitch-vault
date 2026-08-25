# @juspay-tech/react-native-hyperswitch-vault

Save a card in React Native. One component, one `submit()` call. The card details never touch your
app code.

Authored in ReScript, published as JavaScript with genType-generated TypeScript declarations — you
need neither.

## Quick Start

**1. Install**

```sh
yarn add @juspay-tech/react-native-hyperswitch-vault
```

**2. Get a session from your backend**

Your server creates the payment-method session with your secret key and returns the response as-is.

```ts
const session = await fetch('https://your-backend.example/vault-session').then(r => r.json());
```

**3. Render the form**

```tsx
import {
  HyperswitchVaultForm,
  type HyperswitchVaultFormHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';

const formRef = useRef<HyperswitchVaultFormHandle>(null);

<HyperswitchVaultForm ref={formRef} session={session} environment="sandbox" />;
```

**4. Submit when your button is pressed**

```ts
const result = await formRef.current?.submit();

if (result?.status === 'success') {
  await sendTokenToYourBackend(result.token); // never store or display the token in the app
} else if (result) {
  showMessage(result.error.message);
}
```

That is the whole integration. You do not extract or decode `sdk_authorization`, you do not handle a
`payment_method_session_id`, you do not build card request data, and you never receive a card number,
expiry or CVC.

**Full app-side reference** — both layouts, props, result handling, lifecycle:
**[docs/app-integration.md](docs/app-integration.md)**.

**Step 2 is the part you have to build.** See **[docs/merchant-integration.md](docs/merchant-integration.md)**
for the two backend calls that produce that session, the exact request/response shapes, and the
security rules — all verified against a live sandbox.

## Custom layout

When the built-in arrangement is not enough, the same package exposes a coordinator plus three
card fields, so the layout is yours while validation, formatting, focus behaviour and the vault
call stay identical to the ready-made form:

```tsx
import {useRef} from 'react';
import {View} from 'react-native';
import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type VaultFormHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';

function Checkout({session}) {
  const formRef = useRef<VaultFormHandle>(null);

  const save = async () => {
    const result = await formRef.current?.submit();
    // same typed result as the ready-made form
  };

  return (
    <HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
      <CardNumberField />

      <View style={{flexDirection: 'row', gap: 12}}>
        <View style={{flex: 1}}>
          <CardExpiryField />
        </View>
        <View style={{flex: 1}}>
          <CardCVCField />
        </View>
      </View>
    </HyperswitchVaultFormProvider>
  );
}
```

The rules:

- **All three fields are mandatory.** The submit contract needs the card number, expiry and CVC,
  so `submit()` returns `not_ready` — naming the field, with no network request — until exactly
  one of each is mounted. Rendering a field twice is refused the same way.
- **Fields can sit anywhere under one provider** — nested in your own Views, fragments, rows,
  whatever your layout needs. Focus auto-advance stays semantic (number → expiry → CVC) no matter
  where you place them.
- **`appearance` and `localisation` live on the provider** and flow to every field. There is no
  `splitCardFields` here — layout is yours — and fields take no style props of their own in this
  release.
- **`onStateChange` on the provider** reports the same safe aggregate as the ready-made form
  (`complete`, per-field validity, detected `brand` — never a card value). `complete` also
  requires all three fields to be mounted, so a hidden field can never look valid.
- A field rendered outside its provider throws immediately with an actionable message.
- Each field shows its own validation error directly beneath itself, with the form's error
  styling and your `localisation` strings.
- The provider ref exposes the same handle as the form (`submit`/`reset`/`focus`), and each field
  accepts a ref exposing `focus()`/`blur()` only.

Per-field state events and per-field style overrides are planned future work, deliberately not
in this release.

### Naming — two spellings, one component

`CardNumberField` / `CardExpiryField` / `CardCVCField` are the canonical names.
`CardNumberWidget` / `CardExpiryWidget` / `CardCVCWidget` are the original names and remain fully
supported — they are **the same objects**, not wrappers, so `CardNumberField === CardNumberWidget`
holds and you can mix the two spellings in one layout. Nothing is deprecated.

The handle types follow the same rule: `VaultFieldHandle` is `WidgetHandle`, and `VaultFormHandle`
is `HyperswitchVaultFormHandle`.

### Optional: the `HyperswitchVault` namespace

If you prefer one import, the package also exports a convenience namespace over the same five
components:

```tsx
import {HyperswitchVault} from '@juspay-tech/react-native-hyperswitch-vault';

<HyperswitchVault.CardForm ref={formRef} session={session} environment="sandbox" />;
```

```tsx
<HyperswitchVault.Form ref={formRef} session={session} environment="sandbox">
  <HyperswitchVault.CardNumber />

  <View style={{flexDirection: 'row', gap: 12}}>
    <View style={{flex: 1}}>
      <HyperswitchVault.Expiry />
    </View>
    <View style={{flex: 1}}>
      <HyperswitchVault.CVC />
    </View>
  </View>
</HyperswitchVault.Form>;
```

| Namespace member | Same object as |
|---|---|
| `HyperswitchVault.CardForm` | `HyperswitchVaultForm` |
| `HyperswitchVault.Form` | `HyperswitchVaultFormProvider` |
| `HyperswitchVault.CardNumber` | `CardNumberField` (= `CardNumberWidget`) |
| `HyperswitchVault.Expiry` | `CardExpiryField` (= `CardExpiryWidget`) |
| `HyperswitchVault.CVC` | `CardCVCField` (= `CardCVCWidget`) |

The named exports remain first-class — prefer them if your bundler tree-shakes, since importing the
namespace pulls in all five components. There is no `HyperswitchVault.useForm` yet.

## API

### `<HyperswitchVaultForm />`

| Prop | Type | Required | Notes |
|---|---|---|---|
| `session` | `MerchantSession` | yes | the session response from your backend, passed through untouched. Only `vault_details.vault_type` and `vault_details.vault_data.sdk_authorization` are read; any other field is ignored. |
| `environment` | `"production" \| "sandbox" \| "integration"` | yes | selects the vault host |
| `appearance` | `VaultFormAppearance` | no | colours, radius, border width, font, input height — every field optional |
| `fieldStyles` | `VaultFormFieldStyles` | no | per-field React Native styles, grouped as `{cardNumber, expiry, cvc}` — see [Styling](#styling) |
| `disabled` | `boolean` | no | makes the three inputs genuinely non-interactive (not merely dimmed) |
| `splitCardFields` | `boolean` | no | `false` (default) renders one bordered block with expiry and CVC sharing a row; `true` renders three separately bordered fields, each error under its own field |
| `localisation` | `VaultFormLocalisation` | no | translated labels, translated validation messages and `isRtl` — every field optional, merged over the English defaults |
| `accessible` | `boolean` | no | forwarded to each of the three inputs individually |
| `onStateChange` | `(state: CardFormState) => void` | no | validity only — never a card value. Kept permanently; not renamed |
| `onFormStateChange` | `(state: VaultFormState) => void` | no | the fuller state snapshot — see [State events](#state-events) |

`CardFormState` is `{ complete, cardNumberValid, expiryValid, cvcValid, brand }`. It carries no card
data at all, not even a masked BIN or last4.

**Card icons are built in.** The detected brand mark and the CVC hint render automatically — no
prop, no asset setup and no `react-native-svg`. Artwork ships for Visa, Mastercard, American
Express, Diners Club, Discover, JCB, Cartes Bancaires and Interac; any other detected scheme falls
back to a neutral card placeholder, so the field is never blank.

For what all of this adds up to — everything a merchant can shape, what is fixed on purpose, and
what is not configurable yet — see **[docs/control-surface.md](docs/control-surface.md)**.

The exact published surface, export by export, is recorded in
**[docs/public-api-baseline.md](docs/public-api-baseline.md)**. The merchant API contract is
**[ADR-0002](docs/adr/0002-merchant-public-api-contract.md)**; its implementation-status table says
which sections exist today.

### Styling

Two layers, and you can use either or both.

**`appearance`** is semantic and form-wide — `primaryColor`, `borderRadius`, `fontFamily` and so on.
Set it and the whole form stays coherent, including the focus and error states the library computes
for you. Start here.

**`fieldStyles`** is per-field React Native styles, for when a specific element needs to match a
design exactly. Both the ready-made form and the custom layout take the same style records.

#### Ready-made form

One grouped prop. There are deliberately no flat props like `cardNumberContainerStyle`.

```tsx
<HyperswitchVault.CardForm
  session={session}
  environment="sandbox"
  fieldStyles={{
    cardNumber: {
      container: {borderColor: '#2563EB', borderWidth: 2},
      input: {fontSize: 18},
    },
    expiry: {container: {flex: 1}},
    cvc: {container: {flex: 1}},
  }}
/>
```

#### Custom layout

Each field takes its own `styles` prop.

```tsx
<HyperswitchVaultFormProvider session={session} environment="sandbox">
  <CardNumberField styles={{container: {borderColor: '#2563EB'}, input: {fontSize: 18}}} />
  <CardExpiryField styles={{container: {borderColor: '#2563EB'}}} />
  <CardCVCField styles={{container: {borderColor: '#2563EB'}, accessory: {width: 32}}} />
</HyperswitchVaultFormProvider>
```

#### Supported slots

Every slot is optional and takes a real React Native `StyleProp` — a plain object, a
`StyleSheet.create` entry, an array, or a nested array with `null` / `undefined` / `false` in it.

| Slot | Type | The element it styles |
|---|---|---|
| `root` | `StyleProp<ViewStyle>` | the field's outermost wrapper, which contains the input box **and** its error message |
| `container` | `StyleProp<ViewStyle>` | the bordered input box |
| `input` | `StyleProp<TextStyle>` | the `TextInput` itself |
| `placeholder` | `StyleProp<TextStyle>` | the label text while the field is empty and unfocused |
| `label` | `StyleProp<TextStyle>` | the same text once it floats (focused, or filled) |
| `error` | `StyleProp<TextStyle>` | the validation message |
| `accessory` | `StyleProp<ViewStyle>` | the icon container to the right of the input |

**The expiry field has no `accessory` slot**, because it renders no icon. Rather than accept the
property and silently do nothing with it, `VaultExpiryStyles` simply does not have it, and passing
one is a compile error.

`helperText` is not published: no helper-text element is rendered anywhere yet, and a slot that does
nothing is worse than no slot.

#### Precedence

```text
library defaults  →  appearance (form-wide)  →  fieldStyles (per field)
```

Later wins on conflicting properties, and only on those: set `container.borderColor` and the
library's border *width*, radius and focus behaviour are untouched. Pass no styling props at all and
the UI is exactly what it was before this feature existed.

In the ready-made form the library owns the joined layout — the halved shared borders and squared
inner corners of the fused block, the row direction under RTL, and the gaps. A merchant style can
override any of that on purpose; nothing is overridden by accident.

Error placement follows the layout: in the **split** layout each field renders its own message with
its own `error` slot; in the **fused** layout the three fields share one message line, styled with
the `error` slot of the field the message belongs to (a network error uses the card number's).

#### `placeholder.fontSize` and `label.fontSize` are animation endpoints

The label animates between two sizes as it floats, and `fontSize` is the only animated property on
that element. So the two slots interpret it specially:

```tsx
styles={{
  placeholder: {fontSize: 18},  // resting size
  label: {fontSize: 12},        // floating size
}}
```

Set one and the label still animates — to the library's default for the other end. Set neither and
the default animation is unchanged. Every other property in those slots behaves like an ordinary
style.

A static `fontSize` is removed before the style reaches the animated element, because leaving it
there would silently stop the animation. Values that cannot be an endpoint — a string, `NaN`,
infinity, a negative number, or `0` — are ignored, and the library's default is used instead.

#### What you cannot style

The fields take no native `TextInput` props and no bare `style` prop. These are all compile errors,
and none of them is spread onto the input at runtime:

```text
value  defaultValue  onChange  onChangeText  secureTextEntry
maxLength  keyboardType  autoCorrect  textContentType  autoComplete
```

They are library-owned because they carry the card data or the input behaviour the library must
guarantee.

**Styling never exposes a card value.** Style slots are write-only presentation: nothing here is
readable back, no slot is passed a card number, expiry or CVC, and the field ref stays exactly
`focus()` and `blur()`. There is no styling route to the PAN, the expiry, the CVC, the
`sdk_authorization` or any session identifier.

### State events

Two callbacks, both carrying **state snapshots** — not native input events, and never a card value.

#### 1. A Pay button you own

`canSubmit` is the library's own gate, so your button and `submit()` can never disagree.

```tsx
const [state, setState] = useState<VaultFormState>();

<HyperswitchVault.CardForm
  ref={formRef}
  session={session}
  environment="sandbox"
  onFormStateChange={setState}
/>

<Button
  title={state?.submitting ? 'Paying…' : 'Pay'}
  disabled={!state?.canSubmit}
  onPress={() => formRef.current?.submit()}
/>
```

The same prop works on `HyperswitchVaultFormProvider`, so a custom layout gets identical semantics
without switching to the ready-made form.

**Bind your button to `canSubmit` and nothing else** — it consults every gate. The other members
exist so you can explain to the customer *why* it is false:

```tsx
if (state?.sessionStatus === 'invalid') return <SessionProblem onRetry={refetchSession} />;
if (!state?.fieldsReady) return <SetupError />;   // a field is missing or mounted twice
return <PayButton disabled={!state.canSubmit} />;
```

| Property | Meaning |
|---|---|
| `fieldsReady` | exactly one of each field is mounted — **registration only**, nothing about the session |
| `sessionStatus` | `'valid'` / `'invalid'` — whether the session can be used at all |
| `complete` | all three fields are `'complete'` |
| `submitting` | a confirmation is in flight |
| `canSubmit` | `fieldsReady && sessionStatus === 'valid' && complete && !submitting` |
| `brand` | the detected scheme, or `'unknown'` |
| `fields` | the three field states below |

#### 2. Individual field state

```tsx
<CardNumberField onStateChange={(s) => setNumberState(s)} />
<CardExpiryField onStateChange={(s) => setExpiryState(s)} />
<CardCVCField onStateChange={(s) => setCvcState(s)} />
```

Each callback receives only its own field, narrowed to that field's shape:

```ts
type VaultFieldStatus = 'empty' | 'incomplete' | 'complete';

type VaultCardNumberState = {
  field: 'cardNumber';
  status: VaultFieldStatus;
  focused: boolean;
  brand: CardBrand;                 // card number only
  error?: {code: VaultFieldErrorCode; message: string};
};
```

`VaultExpiryState` and `VaultCVCState` are the same without `brand` — the library never detects a
scheme from those fields, so there is no property to read.

| Status | Means |
|---|---|
| `empty` | nothing entered |
| `incomplete` | something entered, but the validator does not accept it yet |
| `complete` | the validator accepts it |

There is deliberately no `invalid` status. Derive it from `error !== undefined` — the same condition
the library uses to paint the field, so your chrome and ours cannot disagree.

#### 3. The detected brand

```tsx
<CardNumberField onStateChange={(s) => setBrand(s.brand)} />
```

`CardBrand` is a closed union of all fourteen values: `'visa'`, `'mastercard'`, `'americanExpress'`,
`'dinersClub'`, `'discover'`, `'jcb'`, `'cartesBancaires'`, `'interac'`, `'maestro'`, `'unionPay'`,
`'rupay'`, `'sodexo'`, `'bajaj'`, `'unknown'`. Every scheme the detector recognises is reported, even
the five that have no dedicated artwork yet.

#### 4. Safe validation errors

```tsx
<CardExpiryField
  onStateChange={(s) =>
    setHint(s.error ? myCopy[s.error.code] ?? s.error.message : undefined)
  }
/>
```

`code` is stable and locale-independent — one of `'required'`, `'invalid_card_number'`,
`'invalid_expiry'`, `'invalid_cvc'` — so you can substitute your own copy. `message` is the resolved,
localised string the library is already showing.

**`error` appears exactly when the customer can see it**, never earlier: not before the field is
touched, and not while it is still focused and half-typed. It appears after blur, or after a
`submit()` attempt, and clears as soon as the input is corrected or `reset()` is called.

#### When callbacks fire

One snapshot after the fields register, then one whenever the public state actually changes,
compared structurally. Passing a new inline arrow function on every render emits nothing. Identical
snapshots are not repeated, and nothing is emitted after unmount.

#### What these callbacks never contain

**No card values, at any depth.** No PAN, formatted PAN, input length, BIN or last four, no expiry
month or year, no CVC or its length. No `sdk_authorization`, no session identifier, and **no token**
— `submit()` remains the only route to the token, and it appears only in its resolved result.

`status: 'complete'` tells you the field is done; it does not tell you what was typed. And these are
state snapshots, not native input events: there is no `nativeEvent`, no `target`, and no React ref.

### Handling the result

`submit()` returns one of three shapes, and the third one is the important one.

```tsx
const result = await formRef.current?.submit();

if (result?.status === 'success') {
  await sendTokenToYourBackend(result.token);   // never store or display it in the app
} else if (result?.error.code === 'unknown_outcome') {
  // The request may or may not have reached the vault. DO NOT silently retry.
  showSupportPrompt();
} else if (result) {
  showMessage(result.error.message);            // a definite failure — retrying is safe
}
```

| Situation | `status` | Retry? |
|---|---|---|
| Card saved | `success` | — |
| The customer's input was rejected | `validation_error` | yes, after they correct it |
| A field is missing or mounted twice | `not_ready` | fix the integration, not the retry |
| The session cannot be used | `error`, code `invalid_session` | get a new session first |
| The vault returned a definite failure | `error`, code `server_error` | yes |
| **The outcome could not be determined** | `error`, code **`unknown_outcome`** | **no — ask your backend what happened first** |

An unknown outcome is not a failure. A network drop or a timeout leaves the vault's own state
unknown to the app, so a blind retry risks saving the card twice. Reconcile server-side.

### Replacing the session

Passing a different `session` prop swaps the credential and nothing else:

- **anything the customer has typed is preserved** — the session is a credential, not form state;
- `sessionStatus` follows the new session immediately;
- passing a structurally identical session as a new object emits nothing and disturbs nothing;
- a request already in flight is not re-attributed to the new session.

There is **no session-refresh mechanism** in this package. When a session expires, your backend
creates a new one and you pass it in. `sessionStatus: 'valid'` means the session names vault details
this component can use — it does **not** guarantee the credential inside is still accepted, which is
only proven when `submit()` runs.

### Unsupported imports

The export map publishes exactly **one** entry point — the package root (plus `/package.json`).
Anything else fails to resolve, deliberately:

```ts
import {…} from '@juspay-tech/react-native-hyperswitch-vault/dist/esm/index.js';  // ERR_PACKAGE_PATH_NOT_EXPORTED
```

Internal module paths are not API and will change without notice.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `CardNumberWidget must be rendered inside a <HyperswitchVaultFormProvider>` | a field mounted outside the provider | wrap it, or use `HyperswitchVault.CardForm` |
| `submit()` returns `not_ready` naming a widget | that field is not mounted | mount exactly one of each |
| `Only one CardExpiryWidget may be mounted … found 2` | the field is rendered twice | remove the duplicate; `fieldsReady` is `false` while it lasts |
| The Pay button never enables | check `sessionStatus` and `fieldsReady` separately — they tell you whether it is the session or your JSX | |
| `invalid_session` on submit with `sessionStatus: 'valid'` | the credential itself is stale or malformed | fetch a new session from your backend |
| `SyntaxError: Cannot use import statement outside a module` in jest | the RN preset does not transform this package | add the `transformIgnorePatterns` line above |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | a deep import, or an import of the removed `/embedded` or `/vault` | import from the package root |

### Ref handle

```ts
interface HyperswitchVaultFormHandle {
  submit(): Promise<VaultSubmitResult>;
  reset(): void;
  focus(field: 'cardNumber' | 'expiry' | 'cvc'): void;
}
```

Every documented operational outcome — validation failure, missing or duplicate widgets, invalid
session, HTTP failure, malformed response and unknown request outcome — resolves through
`VaultSubmitResult`. Raw backend failures are not thrown to your code:

```ts
type VaultSubmitResult =
  | { status: 'success'; token: string }
  | { status: 'validation_error' | 'not_ready' | 'error'; error: SafeVaultError };
```

**A success carries the token and nothing else** — no brand, no BIN, no last four, no expiry, no
card object. `type-tests/consumer.tsx` holds `@ts-expect-error` negative controls against
`result.card`, `result.last4Digits` and `result.expiryMonth`, so the build fails if any of them
becomes readable.

`SafeVaultError` is `{ code, message }`, where `message` is always one of this library's own fixed
strings. A backend error body, the authorization, anything decoded from it, and card values are
never exposed.

### Optional: localisation and appearance

Neither is required — the Quick Start above is still the whole integration. Both merge over the
defaults per field, so you can override one string and leave the rest alone.

```tsx
<HyperswitchVaultForm
  ref={formRef}
  session={session}
  environment="sandbox"
  accessible
  localisation={{
    labels: {
      cardNumberPlaceholder: 'Numéro de carte',
      expiryPlaceholder: 'MM / AA',
      expiryFloatingLabel: 'Expiration',
    },
    validationMessages: {
      cardNumberRequired: 'Le numéro de carte est requis',
      cardNumberInvalid: 'Numéro de carte invalide',
    },
    isRtl: false,
  }}
  appearance={{primaryColor: '#4F46E5', borderRadius: 12, gap: 16}}
/>
```

Translate **both** `labels` and `validationMessages`: translated placeholders with English error
text is a half-translated form. The validation *rules* are unaffected — they still come from
`hyperswitch-sdk-utils`; only the text changes.

`appearance` also accepts `gap`, `fontScale`, `placeholderTextSizeAdjust`, `errorTextSizeAdjust`
and `errorMessageSpacing` alongside the colour and sizing tokens.

### Result mapping

Every outcome, and exactly which one you get:

| What happened | `status` | `error.code` | Safe to try again? |
|---|---|---|---|
| The card was vaulted | `success` | — | — |
| The card failed local validation. Nothing was sent. | `validation_error` | `invalid_card_data` | Yes — the inline field errors are now on screen |
| The fields have not registered yet. Nothing was sent. | `not_ready` | `not_ready` | Yes — call again once the form has mounted |
| The session has no usable `vault_details`, an unsupported `vault_type`, or a missing/undecodable `sdk_authorization`. Nothing was sent. | `error` | `invalid_session` | No — this session will always fail. Fetch a new one. |
| The vault answered with a non-2xx status | `error` | `server_error` | No — not automatically. The vault took a decision. |
| The vault answered 2xx but the body could not be read, or held no token | `error` | `server_error` | **No** — the vault answered, so the card was probably saved even though no token came back |
| The request threw, timed out, or was aborted (including unmount and session replacement) | `error` | `unknown_outcome` | **No** — see below |

**`unknown_outcome` is the important row.** A thrown fetch, a timeout and an abort are
indistinguishable from a request the vault already processed. This endpoint accepts no idempotency
key, so retrying can tokenise the same card twice. That is why there is no `network_error` code in
the union — it would read as "the request never happened, just try again", which cannot be
guaranteed. **Nothing in this library retries anything automatically**, and neither should you
without checking on your own backend first.

### Lifecycle

Asserted by `example/__tests__/vaultFormLifecycle.test.tsx`, which renders the published package
with the real React Native jest preset.

| Situation | Behaviour |
|---|---|
| `submit()` called twice during one request | The **same promise instance** is returned and exactly one network request is made. Not an error, not a second charge on the session. |
| `submit()` after the previous one settled | Starts a fresh request. |
| `reset()` | Clears values, the visible "MM / YY" text, validation state and every displayed error. |
| `reset()` **during** an in-flight confirmation | A **no-op**, and the request is **not cancelled**. Cancelling would turn a knowable outcome into an unknown one, since the vault may already have processed it; clearing without cancelling would be worse, leaving emptied fields while a submission that still resolves for the *old* card is outstanding. The fields are non-interactive for that whole window anyway, so nothing a user typed can be lost. `reset()` works normally once the promise settles. |
| `session` or `environment` replaced | A confirmation already in flight **under the superseded session** is aborted and detached; it resolves as `unknown_outcome`. A request issued under the new session is never cancelled — each in-flight request is tagged with the session and environment it was sent under. The next `submit()` always uses the current authorization: the request is built at call time, so an old one can never be reused. |
| While a confirmation is in flight | The three inputs are non-interactive and dimmed, so the card being confirmed cannot be edited underneath the request. |
| Unmount | An in-flight confirmation is aborted. No state is written back to the unmounted tree. |
| `focus()` before the fields register, or after unmount | A safe no-op. The registration is removed on unmount rather than left pointing at a dead tree. |

## Security

`sdk_authorization` is a **short-lived client credential** that bears the session's client secret,
customer id, publishable key and profile id. Treat it like a bearer token.

- **Never log or display it**, or anything decoded from it. In React Native a `console.log` reaches
  Metro, logcat and Console.app. This library contains no logging at all, deliberately.
- **Never persist the session** — not in AsyncStorage, not in a persisted Redux/MMKV store, not in a
  file. Keep it in component state and refetch when you need a new one.
- **Never log or display** the PAN, expiry or CVC. The payment-method token should go from
  `submit()` to your backend and nowhere else — it is a reference to the stored card rather than
  card data, but it is still a credential for charging that card. `submit()` returns no masked card
  metadata to display; if you want to show "•••• 4242" on a confirmation screen, read it from your
  own backend after you store the token. (`example/App.tsx` deliberately renders the token on screen
  so a developer can check it against their dashboard. That is an example-app affordance, not a
  pattern to copy.)
- **Serve your session endpoint with `Cache-Control: no-store`.** It is the only directive that
  forbids storing the response; `no-cache` still permits it. `example-server/merchant-server.mjs`
  does this.
- **Keep secret API keys on your server.** Only your backend holds the Hyperswitch API key; the app
  receives the session response and nothing else. In the example the key is read from
  `example-server/.env`, which is gitignored and lives OUTSIDE the app directory; only the mode
  ("live" / "offline") is ever logged, never a value.
- **Do not paste a real authorization anywhere** — issues, screenshots, chat, or this repository.
  Every fixture here is base64 of an obviously fake envelope.

**The boundary, stated exactly:**

> PAN, expiry and CVC never cross the library's supported public API. They remain in library-owned
> state and are transmitted only by the library's internal tokenization transport. The merchant
> receives safe UI state and the resulting token.

There is one entry point and one flow, so there is no second path with weaker guarantees. The
library renders the fields, holds the values, confirms the payment-method session itself, and
returns a token.

**What this is not.** It is an API and data-flow guarantee. It is **not** native-process isolation,
**not** physical memory zeroization, **not** automatic PCI compliance or a PCI-scope determination,
and **not** protection from malicious code executing inside your own application process — anything
running there can reach React Native's own internals regardless of this package. Only your own
assessor, evaluating your whole integration, can determine your scope.

## Example app

Two pieces: `example/` is a bare React Native TypeScript app, and `example-server/` is a stand-in
merchant backend. They are separate directories on purpose — **the secret API key lives only in the
server. Never put it in the React Native app**, in an app `.env`, or anywhere that ships to a
device. The app receives only the client-safe session response.

**1. Create the server config**

```sh
cp example-server/.env.example example-server/.env
```

**2. Fill in the server-side credentials** in `example-server/.env` (gitignored):
`HYPERSWITCH_API_KEY`, `HYPERSWITCH_PROFILE_ID`, `HYPERSWITCH_CUSTOMER_ID`. Leave
`HYPERSWITCH_API_KEY` blank to run offline against a fake session instead — everything works except
real tokenization.

**3. Start the merchant server** (terminal 1)

```sh
cd example-server && npm start        # http://localhost:3001
```

**4. Start Metro** (terminal 2)

```sh
cd example && yarn start
```

**5. Run the Android app** (terminal 3)

```sh
cd example && yarn android
```

The emulator reaches the server on `http://10.0.2.2:3001`, which the app selects by platform; the
iOS simulator uses `http://localhost:3001`. For a physical Android device, set `LAN_OVERRIDE` in
`example/App.tsx` to your machine's LAN address. Cleartext HTTP is enabled in the **debug** manifest
only — the release manifest does not allow it.

The controls beneath the Save button — **Reset**, **Submit ×2**, **New session**, **Focus …** —
exist so `docs/manual-device-checklist.md` can be walked on a device without editing code. A real
integration needs only the Save button.

> The automated suite **builds and bundles** the example and runs its tests under the React Native
> jest preset. It does not launch it on a device. Before release, walk
> `docs/manual-device-checklist.md` on both platforms.

## Requirements

No provider SDK, no native module, no Pod install, no Codegen.

| Dependency | Kind | Declared range | Actually verified |
|---|---|---|---|
| react | peer | `>=19.0.0 <20.0.0` | **19.0.0 only** |
| react-native | peer | `>=0.79.0 <0.80.0` | **0.79.1 and 0.79.7** |
| node (to build/test, not to ship) | engine | `>=18.18.0` | 26.3.0 |

The package has **zero runtime dependencies** — no `dependencies`, no `optionalDependencies`. The
two peers above are the whole install.

**Read the right-hand column literally.** The declared ranges are what the manifest allows; the
verified column is what has been installed, type-checked, bundled for both platforms and run. Other
versions inside those ranges are expected to work and have not been tested.

### Supported environment

| Question | Answer |
|---|---|
| Does the package contain native code? | **No.** No Android or iOS directory, no podspec, no Gradle, no Codegen. |
| Native linking steps? | **None.** |
| Pod install? | **Not needed** for this package. |
| Do merchants need ReScript? | **No.** The package ships compiled JavaScript and `.d.ts`. ReScript is a build-time tool of this repository only. |
| Do merchants need Babel config? | **No** for app code. See the jest note below for tests. |
| Do merchants need Metro config? | **No.** Verified with a default `@react-native/metro-config` and no aliases, `extraNodeModules` or custom resolvers. |
| TypeScript | Verified with **5.6.3** against the packed declarations under the stock `@react-native/typescript-config`. |
| Package manager | Developed with **yarn 3.6.4**; verified by installing the packed tarball into a clean external project. |
| Hermes | The bundles are produced by standard Metro for RN 0.79 and contain no dynamic `require` and no Node builtins. Hermes byte-compilation itself has **not** been run — see below. |
| Expo managed workflow | **Unverified.** Not tested; no claim either way. |
| React Native versions outside `0.79.x` | **Unverified.** |

### If your tests import this package

React Native's jest preset excludes everything in `node_modules` from Babel except `react-native`
itself, and jest resolves this package through its `react-native` export condition — which points at
the ESM build, because that is what Metro wants. Add the package to the transform allowlist:

```js
// jest.config.js
module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@juspay-tech)/)',
  ],
};
```

Without it you get `SyntaxError: Cannot use import statement outside a module`. Your app build is
unaffected — Metro handles the ESM build natively.

For the Quick Start above you install **only this package**. It has **no form library at all**: the
card fields are library-controlled and keep their state in an internal reducer.

## One package, one entry point

The package publishes a single entry: the package root. There is no low-level transport subpath and
no controlled-field subpath.

That is a product decision, not an omission. A subpath that accepted raw card details, or one that
let a caller own the card values and pass them in, would put PAN, expiry and CVC back on the
supported public API — which is exactly what this library exists to prevent. The confirmation
transport still exists; it is internal, reachable only by the library's own form, and has no
declaration and no importable path.

The standalone form also deliberately excludes card scanning and the co-badged network picker: both
need host-provided capabilities that would force a native module or a viewport-aware popover.

### No form library

The package contains **no form library** and declares **no runtime `dependencies`**. The card
fields are library-controlled: the library holds the values in an internal reducer, resolves the
errors, and never asks the merchant for either. `yarn verify:consumers` and
`yarn verify:merchant-only` prove this against the packed tarball.

## Development

Card validation is not vendored. It is compiled from `hyperswitch-sdk-utils`, pinned as a git
submodule so there is exactly one source of truth. See
`docs/followup-sdk-utils-card-validation.md` for the one piece still duplicated (the message
mapping) and how to retire it.

```sh
git submodule update --init --recursive
yarn install
yarn build                  # submodule -> rescript -> genType gate -> tsc -> rollup -> consumer types
yarn run build:clean        # same, from a clean tree
yarn verify                 # mapping + tarball + consumer fixtures
cd example && yarn jest     # lifecycle contract, under the React Native preset
```

Verification packs the library to a unique temporary path each run (`scripts/pack-fixture.mjs`), so
no `.tgz` is ever left in the repository and a stale artifact can never be tested by accident. This
is also why the package version is never bumped just to invalidate a package manager's cache: a
`file:` dependency on this directory is keyed by a content hash, so a rebuild is picked up on its
own.

Package manager is **Yarn 3.6.4** (`packageManager` field plus `nodeLinker: node-modules`). There is
no `package-lock.json`; do not add one.

> `yarn rebuild` is a Yarn builtin, which is why the clean-build script is named `build:clean` and
> must be invoked as `yarn run build:clean`.

### Type generation

ReScript is the source of truth. Public exports carry `@genType`, and genType emits `src/*.gen.tsx`,
which is **committed** so the public type surface shows up in review diffs. `tsc` then emits the
published `.d.ts` files into `dist/types/`.

One thing is hand-written rather than generated: genType types a `forwardRef` component as
`React.ComponentType<Props>` and drops the ref, so `src/public.ts` re-attaches it as
`ForwardRefExoticComponent<Props & RefAttributes<vaultFormHandle>>` — **composed from the generated
`Props` and `vaultFormHandle`, never re-declared**. That small facade is checked rather than
trusted: `type-tests/consumer.tsx` type-checks against the published `dist/types`, including
`@ts-expect-error` negative controls for a wrong `environment`, a wrong `focus()` field, reading
`token` off a non-success result and reading `error` off a success. A negative control that stops
failing is itself a build error, so the file cannot pass vacuously.

`yarn run check:generated` fails the build when the committed generated output no longer matches the
ReScript sources. Never hand-edit `src/*.gen.tsx` or anything in `dist/`.

`yarn run check:submodule` fails if `shared-code` is not at the commit recorded in `package.json` →
`hyperswitch.sdkUtilsCommit`, or if that submodule tree is dirty. Both gates run as part of
`yarn build`, so CI inherits them.

### Packaging guarantees

The published tarball contains only bundled JavaScript, generated declarations, metadata, README,
LICENSE and third-party notices. It must never contain `shared-code/`, ReScript sources, build
caches, source maps (their `sourcesContent` embeds compiled sdk-utils source), or sdk-utils modules
the card form does not use. `verify:tarball` enforces all of this, including that `PostalCodes`,
CPF and CNPJ validation stay out of every entry.

Note `yarn pack` force-includes README/LICENSE files at any depth, which pulled
`shared-code/README.md` into the archive; the negative `!shared-code/**` entries in the `files`
allowlist suppress that and must not be removed.

The root entry statically bundles a few `@babel/runtime` helpers;
their MIT notices ship in `THIRD-PARTY-NOTICES.md`.
