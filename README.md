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
field widgets, so the layout is yours while validation, formatting, focus behaviour and the vault
call stay identical to the ready-made form:

```tsx
import {useRef} from 'react';
import {View} from 'react-native';
import {
  HyperswitchVaultFormProvider,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type HyperswitchVaultFormHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';

function Checkout({session}) {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);

  const save = async () => {
    const result = await formRef.current?.submit();
    // same typed result as the ready-made form
  };

  return (
    <HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
      <CardNumberWidget />

      <View style={{flexDirection: 'row', gap: 12}}>
        <View style={{flex: 1}}>
          <CardExpiryWidget />
        </View>
        <View style={{flex: 1}}>
          <CardCVCWidget />
        </View>
      </View>
    </HyperswitchVaultFormProvider>
  );
}
```

The rules:

- **All three widgets are mandatory.** The submit contract needs the card number, expiry and CVC,
  so `submit()` returns `not_ready` — naming the widget, with no network request — until exactly
  one of each is mounted. Rendering a widget twice is refused the same way.
- **Widgets can sit anywhere under one provider** — nested in your own Views, fragments, rows,
  whatever your layout needs. Focus auto-advance stays semantic (number → expiry → CVC) no matter
  where you place them.
- **`appearance` and `localisation` live on the provider** and flow to every widget. There is no
  `splitCardFields` here — layout is yours — and widgets take no style props of their own in this
  release.
- **`onStateChange` on the provider** reports the same safe aggregate as the ready-made form
  (`complete`, per-field validity, detected `brand` — never a card value). `complete` also
  requires all three widgets to be mounted, so a hidden field can never look valid.
- A widget rendered outside its provider throws immediately with an actionable message.
- Each widget shows its own validation error directly beneath itself, with the form's error
  styling and your `localisation` strings.
- The provider ref exposes the same handle as the form (`submit`/`reset`/`focus`), and each widget
  accepts a ref exposing `focus()`/`blur()` only.

Per-widget state events and per-widget style overrides are planned future work, deliberately not
in this release.

## API

### `<HyperswitchVaultForm />`

| Prop | Type | Required | Notes |
|---|---|---|---|
| `session` | `MerchantSession` | yes | the session response from your backend, passed through untouched. Only `vault_details.vault_type` and `vault_details.vault_data.sdk_authorization` are read; any other field is ignored. |
| `environment` | `"production" \| "sandbox" \| "integration"` | yes | selects the vault host |
| `appearance` | `VaultFormAppearance` | no | colours, radius, border width, font, input height — every field optional |
| `disabled` | `boolean` | no | makes the three inputs genuinely non-interactive (not merely dimmed) |
| `splitCardFields` | `boolean` | no | `false` (default) renders one bordered block with expiry and CVC sharing a row; `true` renders three separately bordered fields, each error under its own field |
| `localisation` | `VaultFormLocalisation` | no | translated labels, translated validation messages and `isRtl` — every field optional, merged over the English defaults |
| `accessible` | `boolean` | no | forwarded to each of the three inputs individually |
| `onStateChange` | `(state: CardFormState) => void` | no | validity only — never a card value |

`CardFormState` is `{ complete, cardNumberValid, expiryValid, cvcValid, brand }`. It carries no card
data at all, not even a masked BIN or last4.

**Card icons are built in.** The detected brand mark and the CVC hint render automatically — no
prop, no asset setup and no `react-native-svg`. Artwork ships for Visa, Mastercard, American
Express, Diners Club, Discover, JCB, Cartes Bancaires and Interac; any other detected scheme falls
back to a neutral card placeholder, so the field is never blank.

For what all of this adds up to — everything a merchant can shape, what is fixed on purpose, and
what is not configurable yet — see **[docs/control-surface.md](docs/control-surface.md)**.

### Ref handle

```ts
interface HyperswitchVaultFormHandle {
  submit(): Promise<VaultSubmitResult>;
  reset(): void;
  focus(field: 'cardNumber' | 'expiry' | 'cvc'): void;
}
```

`submit()` never throws for a validation, configuration, HTTP or network failure — each is a typed
result:

```ts
type VaultSubmitResult =
  | { status: 'success'; token: string; card: { last4Digits; binNumber?; expiryMonth; expiryYear } }
  | { status: 'validation_error' | 'not_ready' | 'error'; error: SafeVaultError };
```

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
  card data, but it is still a credential for charging that card. The vault's masked `last4Digits`
  is fine to show. (`example/App.tsx` deliberately renders the token on screen so a developer can
  check it against their dashboard. That is an example-app affordance, not a pattern to copy.)
- **Serve your session endpoint with `Cache-Control: no-store`.** It is the only directive that
  forbids storing the response; `no-cache` still permits it. `example-server/merchant-server.mjs`
  does this.
- **Keep secret API keys on your server.** Only your backend holds the Hyperswitch API key; the app
  receives the session response and nothing else. In the example the key is read from
  `example-server/.env`, which is gitignored and lives OUTSIDE the app directory; only the mode
  ("live" / "offline") is ever logged, never a value.
- **Do not paste a real authorization anywhere** — issues, screenshots, chat, or this repository.
  Every fixture here is base64 of an obviously fake envelope.

**On compliance:** this library is designed so that card values pass from the native inputs to the
Hyperswitch vault without entering merchant application code. That is a statement about data flow,
not a compliance claim. It is **not** a claim of PCI DSS compliance and **not** a claim that your
PCI scope is reduced. Only your own assessor, evaluating your whole integration, can determine that.

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

| Dependency | Kind | Range | Verified against |
|---|---|---|---|
| react | peer | `>=19.0.0 <20.0.0` | 19.0.0 |
| react-native | peer | `>=0.79.0 <0.80.0` | 0.79.7 |

For the Quick Start above you install **only this package**. It has **no form library at all**:
the card fields are controlled views, the standalone entries keep their state in an internal
reducer, and hyperswitch-client-core keeps its own `react-final-form` and passes values in through
`/embedded`. Nothing about a form library is shared between the two repositories.

## Advanced exports

Most integrations need only the Quick Start above.

- `@juspay-tech/react-native-hyperswitch-vault/vault` — `confirmPaymentMethodSession`, the bare
  transport, if you have your own card UI. Free of React and React Native.
- `@juspay-tech/react-native-hyperswitch-vault/embedded` — the controlled card fields, for a host
  that owns its own card state and form library (used by hyperswitch-client-core).

The default standalone form deliberately excludes card scanning and the co-badged network picker:
both need host-provided capabilities that would force a native module or a viewport-aware popover.

### Why the entries are packaged the way they are

The package contains **no form library**. Its card fields are controlled views: the owner holds the
values and passes them in, together with the resolved errors and the change callbacks.

- the **root** entry owns its state in an internal reducer, so a merchant installs one package and
  configures no form library;
- **`/embedded`** is rendered by hyperswitch-client-core, which keeps its own `react-final-form`,
  performs every field registration itself and feeds the values in.

Because nothing about a form library crosses the package boundary, there is no module-identity
hazard to manage and one Rollup configuration builds all three entries. The package declares **no
runtime `dependencies`**. `yarn verify:consumers` proves this against the packed tarball: no entry
imports or bundles a form library, the package declares none, `/embedded` loads and constructs with
none installed, and hyperswitch-client-core still declares its own.

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
