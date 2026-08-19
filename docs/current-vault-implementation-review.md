# Current vault implementation review

A reviewer-facing account of what exists **right now** in the card-vault work: what was built, why,
how, and where. Written by reading the current source, the generated declarations, the built
bundles and the packed tarball — not by trusting earlier reports.

**Status of this document:** investigation and documentation only. No production code, API name or
defect was changed while producing it.

**How to read the evidence markers**

| Marker | Meaning |
| --- | --- |
| *source* | hand-written ReScript or TypeScript that a human edits |
| *generated* | produced by genType from ReScript; committed; never hand-edited |
| *build output* | produced by `rescript` / `rollup` / `tsc`; gitignored |
| *docs* | documentation, no runtime effect |
| *example-only* | demo application code, never shipped in the package |
| *inference* | reasoning not directly proven by a single line of code — labelled inline |

---

## 1. Actual repository state

Recorded on 2026-08-19 from the working trees below.

### 1.1 Repositories inspected

| Repository | Path | Branch / HEAD | Role |
| --- | --- | --- | --- |
| `react-native-hyperswitch-vault` | `/Users/pradeep.kumar/Documents/react-native-hyperswitch-vault` | branch `master`, **0 commits** | the extracted library (main subject) |
| `hyperswitch-client-core` | `/Users/pradeep.kumar/Documents/hyperswitch-client-core` | branch `main`, HEAD `1eea95c` | the SDK host that embeds the card form |
| `hyperswitch-sdk-utils` | `react-native-hyperswitch-vault/shared-code` (submodule) | `1669cc28955bf547b7fe35d6401ea47720019ff9` (`heads/main`) | validation, formatting, event payloads |

**Comparison base — read this before any "before/after" claim.** The library repository has **no
commits at all**: `git rev-list --count --all` returns `0`, and `git log`/`HEAD` do not resolve.
There is therefore **no in-repo baseline to diff against** for the library. Every "previously"
statement in this document is derived from one of:

- the *current* client-core working tree versus its committed HEAD `1eea95c` (a real, verifiable
  diff), or
- comments and documents written during the work (labelled *docs* evidence, not source evidence).

Where neither exists, the statement is marked *inference*. **`main` was never used as a comparison
base for the library**, because no such branch exists there.

### 1.2 Working-tree state

**Library** — 175 files staged (`git diff --cached --name-only | wc -l`), 1 untracked, on `master`.
Because there are no commits, "staged" here means "added to the index for a first commit", not
"changed since a previous commit". Files with additional unstaged edits at the time of writing:

```text
AM README.md
AM example/src/CustomLayoutCheckout.tsx
?? docs/app-integration.md
```

**client-core** — HEAD `1eea95c`, with these vault-related paths staged (`M` = modified against
HEAD, `A` = new file):

```text
M  src/components/dynamic/CardElement.res
M  src/components/dynamic/DynamicComponent.res
A  src/contexts/VaultContext.res
A  src/hooks/CardVaultHook.res
M  src/hooks/UpdateIntentHook.res
M  src/pages/payment/PaymentMethod.res
M  src/routes/NavigationRouter.res
M  src/types/AllApiDataTypes/SessionsType.res
A  src/utility/libraries/HyperswitchVault.res
M  src/utility/logics/PaymentUtils.res
A  src/utility/logics/VaultConfiguration.res
```

**Nothing is committed in either repository, and nothing is published.** `npm view
@juspay-tech/react-native-hyperswitch-vault version` returns `E404 Not Found`.

### 1.3 Package identity and toolchain

| Item | Value | Source |
| --- | --- | --- |
| Package name | `@juspay-tech/react-native-hyperswitch-vault` | `package.json` |
| Version | `0.7.0` | `package.json` |
| `sideEffects` | `false` | `package.json` |
| Runtime `dependencies` | **none** | `package.json` (no `dependencies` key) |
| Package manager | `yarn@3.6.4` | `package.json` `packageManager` |
| Node floor | `>=18.18.0` | `package.json` `engines` |

Versions actually installed in the library (`node_modules/<pkg>/package.json`):

| Package | Library declares | Installed |
| --- | --- | --- |
| `react` | peer `>=19.0.0 <20.0.0`, dev `19.0.0` | `19.0.0` |
| `react-native` | peer `>=0.79.0 <0.80.0`, dev `0.79.7` | `0.79.7` |
| `react-final-form` | **optional** peer `^7.0.0`, dev `7.0.0` | `7.0.0` |
| `final-form` | **optional** peer `^5.0.0`, dev `5.0.0` | `5.0.0` |
| `rescript` | dev `11.1.4` | `11.1.4` |
| `@rescript/core` | dev `1.6.1` | `1.6.1` |
| `@rescript/react` | dev `0.13.1` | `0.13.1` |
| `rescript-react-native` | dev `0.77.4` | `0.77.4` |
| `rollup` | dev `^4.24.0` | `4.62.4` |
| `typescript` | dev `^5.6.0` | `5.9.3` |

client-core's own toolchain, for comparison: `react 19.0.0`, `react-native ^0.79.1`,
`rescript ^11.1.4`, `react-final-form ^7.0.0`, `final-form ^5.0.0`. client-core depends on the
library as `"@juspay-tech/react-native-hyperswitch-vault": "file:../react-native-hyperswitch-vault"`
— **a local path, which must become a published range before merge.**

### 1.4 File classification

| Class | Files | Notes |
| --- | --- | --- |
| *source* (ReScript) | `src/*.res` — 22 files, 4,321 lines total | the only files a human edits |
| *source* (TypeScript) | `src/public.ts`, `src/embedded.ts`, `src/vault.ts`, `src/merchantTypes.ts`, `src/dom-types.ts`, `src/jsx-global.ts`, `src/bs-modules.d.ts` | hand-written type entries and facades |
| *source* (entry) | `src/standalone-entry.mjs`, `src/embedded-entry.mjs`, `src/vault-entry.mjs`, `src/cardIconAssets.mjs` | runtime entry points; pure re-exports |
| *generated*, committed | `src/*.gen.tsx` — 10 files | genType output; a build gate fails on drift |
| *build output*, gitignored | `src/*.bs.js`, `dist/**`, `lib/**` | verified via `git check-ignore` |
| *docs* | `docs/*.md`, `docs/adr/*.md` | including this file |
| *example-only* | `example/**`, `example-server/**` | never in the tarball (see §3 of the packing rules) |

Largest source files, for orientation:

```text
601 src/VaultConfirm.res            491 src/HyperswitchVaultForm.res
438 src/CardFieldUnits.res          388 src/CardFormView.res
294 src/VaultFormCoordinator.res    292 src/HyperswitchVaultFormProvider.res
262 src/CardIcons.res               239 src/CardInput.res
213 src/CardFormTypes.res           183 src/CardFieldCore.res
```

---

## 2. Public merchant API inventory

Derived from `package.json` `exports` + the entry files + `dist/types/**`, not from file names.

### 2.1 Package entries

| Entry | Types | Runtime (ESM / CJS) | Runtime entry *source* | Who it is for |
| --- | --- | --- | --- | --- |
| `.` | `dist/types/public.d.ts` | `dist/esm/index.js` / `dist/cjs/index.js` | `src/standalone-entry.mjs` | merchants |
| `./embedded` | `dist/types/embedded.d.ts` | `dist/esm/embedded.js` / `dist/cjs/embedded.js` | `src/embedded-entry.mjs` | hyperswitch-client-core only |
| `./vault` | `dist/types/vault.d.ts` | `dist/esm/vault.js` / `dist/cjs/vault.js` | `src/vault-entry.mjs` | transport-only consumers |
| `./package.json` | — | the file itself | — | tooling |

`files` ships only `dist/esm/**`, `dist/cjs/**`, `dist/types/**`, `dist/assets/**`, `README.md`,
`LICENSE`, `THIRD-PARTY-NOTICES.md`, with negative entries `!dist/**/*.map`, `!shared-code`,
`!shared-code/**`. **No `src/`, no `example/`, no submodule sources reach the tarball.**

The root runtime entry is a pure re-export — five components, no logic (*source*,
`src/standalone-entry.mjs:7-11`):

```js
export { make as HyperswitchVaultForm } from './HyperswitchVaultForm.bs.js';
export { make as HyperswitchVaultFormProvider } from './HyperswitchVaultFormProvider.bs.js';
export { make as CardNumberWidget } from './CardNumberWidget.bs.js';
export { make as CardExpiryWidget } from './CardExpiryWidget.bs.js';
export { make as CardCVCWidget } from './CardCVCWidget.bs.js';
```

### 2.2 Complete export table

Every merchant-accessible export, verified against the **packed tarball's**
`dist/types/public.d.ts` (21 names), plus the two advanced entries.

| Merchant import | Package entry | Public type / component / function | Implemented in | Generated declaration | Purpose | Sensitive data exposed? |
| --- | --- | --- | --- | --- | --- | --- |
| `HyperswitchVaultForm` | `.` | component | `src/HyperswitchVaultForm.res:332` | `src/HyperswitchVaultForm.gen.tsx` → `dist/types/public.d.ts` | ready-made 3-field card form | no |
| `HyperswitchVaultFormProvider` | `.` | component | `src/HyperswitchVaultFormProvider.res:168` | `src/HyperswitchVaultFormProvider.gen.tsx` | coordinator for custom layouts | no |
| `CardNumberWidget` | `.` | component | `src/CardNumberWidget.res:14` | `src/CardNumberWidget.gen.tsx` | card-number field | no |
| `CardExpiryWidget` | `.` | component | `src/CardExpiryWidget.res:12` | `src/CardExpiryWidget.gen.tsx` | expiry field | no |
| `CardCVCWidget` | `.` | component | `src/CardCVCWidget.res:14` | `src/CardCVCWidget.gen.tsx` | CVC field | no |
| `HyperswitchVaultFormHandle` | `.` | type (ref handle) | `src/HyperswitchVaultForm.res:167` (`vaultFormHandle`) | `HyperswitchVaultForm.gen.tsx` | `submit`/`reset`/`focus` | no |
| `WidgetHandle` | `.` | type (ref handle) | `src/HyperswitchVaultFormProvider.res:29` (`widgetHandle`) | `HyperswitchVaultFormProvider.gen.tsx` | `focus`/`blur` | no |
| `HyperswitchVaultFormProps` | `.` | type | genType `Props` | `HyperswitchVaultForm.gen.tsx` | form props | no |
| `HyperswitchVaultFormProviderProps` | `.` | type | genType `Props` | `HyperswitchVaultFormProvider.gen.tsx` | provider props | no |
| `MerchantSession` | `.` | type | `src/merchantTypes.ts` (*hand-written*) | same file | the backend session response | **carries `sdk_authorization`** (input, never emitted) |
| `VaultEnvironment` | `.` | type | `src/VaultConfirm.res:34` | `VaultConfirm.gen.tsx` | `production`/`sandbox`/`integration` | no |
| `VaultFormAppearance` | `.` | type | `src/HyperswitchVaultForm.res` `appearance` | `HyperswitchVaultForm.gen.tsx` | 16 styling tokens | no |
| `VaultFormBrandIconMode` | `.` | type | `src/CardIcons.res:116` | `CardIcons.gen.tsx` | brand-mark behaviour | no |
| `VaultFormLocalisation` | `.` | type | `src/HyperswitchVaultForm.res` `localisation` | `HyperswitchVaultForm.gen.tsx` | labels + messages + RTL | no |
| `VaultFormLabels` | `.` | type | `localisationLabels` | same | 6 visible strings | no |
| `VaultFormValidationMessages` | `.` | type | `localisationMessages` | same | 6 validation strings | no |
| `CardFormState` | `.` | type | `src/HyperswitchVaultForm.res` `cardFormState` | same | safe aggregate state | no — booleans + scheme name only |
| `VaultSubmitResult` | `.` | type | `src/VaultResult.res:48` | `VaultResult.gen.tsx` | tagged submit result | token + masked metadata |
| `SafeVaultError` | `.` | type | `src/VaultResult.res:37` | same | `{code, message}` | no |
| `SafeVaultErrorCode` | `.` | type | `src/VaultResult.res:28` | same | 5 fixed codes | no |
| `VaultCardMetadata` | `.` | type | `src/VaultConfirm.res:77` | `VaultConfirm.gen.tsx` | last4 / BIN / expiry | **masked metadata only** |
| `confirmPaymentMethodSession` | `./vault` | async function | `src/VaultConfirm.res:503` | `VaultConfirm.gen.tsx` | raw PMS-confirm transport | **caller supplies PAN/CVC** |
| `EmbeddedCardElement`, `selectCardFields` + 10 types | `./embedded` | component + function + types | `src/VaultEmbedded.res` | `VaultEmbedded.gen.tsx` | client-core's card form | host owns values |

### 2.3 Grouped by audience

**1. Ready-made form API** — `HyperswitchVaultForm`, `HyperswitchVaultFormHandle`,
`HyperswitchVaultFormProps`.

**2. Custom widget API** — `HyperswitchVaultFormProvider`, `CardNumberWidget`,
`CardExpiryWidget`, `CardCVCWidget`, `WidgetHandle`, `HyperswitchVaultFormProviderProps`.

**3. Vault transport API** (`./vault`) — `confirmPaymentMethodSession` plus `vaultEnvironment`,
`cardDetails`, `confirmRequest`, `vaultCardMetadata`, `vaultConfirmResult`, `vaultErrorCode`,
`vaultError`, `confirmOutcome` (*source* `src/vault.ts`).

**4. Embedded / client-core API** (`./embedded`) — `EmbeddedCardElement`, `selectCardFields`, and
types `analyticsPayload`, `cardFieldSpec`, `cardFieldSelection`, `cardTheme`, `cardLabels`,
`cardLayout`, `eligibilityState`, `schemeAccessory`, `scanCardCapability`, `maskedCardInfo`
(*source* `src/embedded.ts:10-23`).

**5. Types only** — `MerchantSession`, `VaultEnvironment`, `VaultFormAppearance`,
`VaultFormBrandIconMode`, `VaultFormLocalisation`, `VaultFormLabels`,
`VaultFormValidationMessages`, `CardFormState`, `VaultSubmitResult`, `SafeVaultError`,
`SafeVaultErrorCode`, `VaultCardMetadata`.

**6. Accidentally exported or internal-looking surface** — none found at the root entry. Two
observations a reviewer should still confirm:

- `./vault` exposes `confirmPaymentMethodSession`, whose `cardDetails` argument **is raw card
  data** (`cardNumber`, `expiryMonth`, `expiryYear`, `cvc` — `src/VaultConfirm.res:37-44`). It is
  a legitimate advanced entry, but it is the one public surface where a caller handles a PAN. It
  is not needed by, or mentioned to, merchants using flows 1 or 2.
- `./embedded` is a public entry in `exports`, so any consumer *can* import it. It is intended for
  client-core only; nothing prevents a merchant from importing it, and doing so would require them
  to own a `react-final-form` `<Form>` and supply resolved theme/label/validator props.

### 2.4 Per-component contracts

#### `HyperswitchVaultForm`

```ts
import {HyperswitchVaultForm} from '@juspay-tech/react-native-hyperswitch-vault';
```

Published type (*generated* → *hand-written facade*, `dist/types/public.d.ts`):

```ts
export declare const HyperswitchVaultForm:
  React.ForwardRefExoticComponent<Props & React.RefAttributes<vaultFormHandle>>;
```

| Prop | Type | Required | Default (from *source*) |
| --- | --- | --- | --- |
| `session` | `MerchantSession` | yes | — |
| `environment` | `VaultEnvironment` | yes | — |
| `appearance` | `VaultFormAppearance` | no | built-in theme; `brandIconMode` defaults to `standard` (`HyperswitchVaultForm.res:355`) |
| `localisation` | `VaultFormLocalisation` | no | English defaults, merged per field |
| `splitCardFields` | `boolean` | no | `false` (`HyperswitchVaultForm.res:338`) |
| `disabled` | `boolean` | no | `false` (`HyperswitchVaultForm.res:337`) |
| `accessible` | `boolean` | no | not passed → React Native's own default |
| `onStateChange` | `(state: CardFormState) => void` | no | absent |

Ref handle (`vaultFormHandle`, *source* `src/HyperswitchVaultForm.res:167-171`):

```rescript
type vaultFormHandle = {
  submit: unit => promise<vaultSubmitResult>,
  reset: unit => unit,
  focus: [#cardNumber | #expiry | #cvc] => unit,
}
```

Error outcomes: `submit()` resolves — never rejects — with `validation_error`, `not_ready` or
`error` (codes `invalid_session`, `server_error`, `unknown_outcome`). **Sensitive data exposed:**
none; the result carries a token and masked metadata only.

#### `HyperswitchVaultFormProvider`

```ts
import {HyperswitchVaultFormProvider} from '@juspay-tech/react-native-hyperswitch-vault';
```

Same props as the form **minus `splitCardFields`, plus required `children`** — confirmed in
*generated* `dist/types/HyperswitchVaultFormProvider.gen.d.ts`:

```ts
export type Props = {
  readonly accessible?: boolean;
  readonly appearance?: HyperswitchVaultForm_appearance;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly environment: HyperswitchVaultForm_vaultEnvironment;
  readonly localisation?: HyperswitchVaultForm_localisation;
  readonly onStateChange?: (_1: HyperswitchVaultForm_cardFormState) => void;
  readonly session: HyperswitchVaultForm_vaultSession;
};
```

`children` is `React.ReactNode` **in the generated output itself** — no hand-written widening was
needed. The ref is the *same* `vaultFormHandle` as the ready-made form.

#### `CardNumberWidget` / `CardExpiryWidget` / `CardCVCWidget`

```ts
import {CardNumberWidget, CardExpiryWidget, CardCVCWidget}
  from '@juspay-tech/react-native-hyperswitch-vault';
```

```ts
export declare const CardNumberWidget:
  React.ForwardRefExoticComponent<React.RefAttributes<widgetHandle>>;
```

**No props at all** in this release — only a ref. `widgetHandle` is
`{focus: () => void; blur: () => void}` (*source* `src/HyperswitchVaultFormProvider.res:29-32`).
No value getter exists on either handle.

#### `MerchantSession`

*Hand-written* (`src/merchantTypes.ts`), deliberately structural so unrelated backend fields never
break a build:

```ts
export type MerchantSession = {
  vault_details?: {vault_type?: string; vault_data?: {sdk_authorization?: string}};
  [key: string]: unknown;
};
```

#### `confirmPaymentMethodSession` (`./vault`)

```ts
import {confirmPaymentMethodSession} from '@juspay-tech/react-native-hyperswitch-vault/vault';
```

Async function taking `confirmRequest` `{sdkAuthorization, environment, card, signal?, timeoutMs?}`
and returning `confirmOutcome` — a `@tag("status")` union of `Success({result})` /
`Failure({error})` (*source* `src/VaultConfirm.res:127-132`, 503). The `card` argument is raw card
data. This entry imports **no React and no React Native**, which is why it is verifiable in plain
Node.

---

## 3. Copy-paste examples

All four are transcribed from, or match, working code in this repository. **A and B were compiled
against the packed `dist/types` declarations** under `tsconfig.consumer.json` (the stock React
Native TypeScript config) while writing this document; the temporary file used for that check was
deleted afterwards and no production file was touched.

`fetchSession`, `sendTokenToYourBackend` and `showError` are **merchant-provided** functions in
these examples. They are not package exports.

### A. Ready-made form

```tsx
import {useEffect, useRef, useState} from 'react';
import {Button, View} from 'react-native';
import {
  HyperswitchVaultForm,
  type CardFormState,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
} from '@juspay-tech/react-native-hyperswitch-vault';

export function SaveCardScreen() {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [card, setCard] = useState<CardFormState | null>(null);

  useEffect(() => {
    // your backend mints the session; the app never holds a secret key
    fetch(`${YOUR_BACKEND}/vault-session`)
      .then(r => r.json())
      .then(setSession);
  }, []);

  const onSave = async () => {
    const result = await formRef.current?.submit();
    if (!result) return;
    switch (result.status) {
      case 'success':
        await sendTokenToYourBackend(result.token);   // merchant function
        break;
      case 'validation_error':
      case 'not_ready':
      case 'error':
        showError(result.error.message);              // merchant function
        break;
    }
  };

  if (!session) return null;

  return (
    <View>
      <HyperswitchVaultForm
        ref={formRef}
        session={session}
        environment="sandbox"
        onStateChange={setCard}
      />
      <Button title="Save card" onPress={onSave} disabled={!card?.complete} />
    </View>
  );
}
```

Only `result.token` leaves the component. `result.card` is masked metadata
(`last4Digits`, optional `binNumber`, `expiryMonth`, `expiryYear`).

### B. Custom widgets

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
  type WidgetHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';

export function CustomLayout({session}: {session: MerchantSession}) {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const numberRef = useRef<WidgetHandle>(null);
  const [card, setCard] = useState<CardFormState | null>(null);
  const [plate, setPlate] = useState('');

  return (
    <HyperswitchVaultFormProvider
      ref={formRef}
      session={session}
      environment="sandbox"
      appearance={{primaryColor: '#0B5FBF'}}
      onStateChange={setCard}>
      <Text>Card number</Text>
      <CardNumberWidget ref={numberRef} />

      {/* merchant-owned content between the card fields */}
      <Text>Number plate</Text>
      <TextInput value={plate} onChangeText={setPlate} />

      <View style={{flexDirection: 'row', gap: 12}}>
        <View style={{flex: 1}}>
          <CardExpiryWidget />
        </View>
        <View style={{flex: 1}}>
          <CardCVCWidget />
        </View>
      </View>

      <Button title="Focus number" onPress={() => numberRef.current?.focus()} />
      <Button title="Focus expiry" onPress={() => formRef.current?.focus('expiry')} />
      <Button title="Reset" onPress={() => formRef.current?.reset()} />
      <Button
        title="Save card"
        disabled={!card?.complete}
        onPress={async () => {
          const result = await formRef.current?.submit();
          if (result?.status === 'success') await sendTokenToYourBackend(result.token);
          else if (result) showError(result.error.message);
        }}
      />
    </HyperswitchVaultFormProvider>
  );
}
```

**These widgets are visually independent but they are not independent vault forms.** There is one
`ReactFinalForm.Form` inside the provider (`src/HyperswitchVaultFormProvider.res:271`), one
mounted-widget registry (`src/CardFieldUnits.res:98-120`), and one submission
(`src/VaultFormCoordinator.res:250-270`). The widgets coordinate through the provider's private
context and produce exactly one PMS-confirm request. Placing them in separate sections changes
layout only.

### C. Direct vault transport — supported, but not a merchant path

Publicly reachable via the `./vault` entry:

```ts
import {confirmPaymentMethodSession} from '@juspay-tech/react-native-hyperswitch-vault/vault';

const outcome = await confirmPaymentMethodSession({
  sdkAuthorization,                      // Base64 string from vault_details
  environment: 'sandbox',
  card: {cardNumber, expiryMonth, expiryYear, cvc},   // RAW card data — caller-held
  signal: new AbortController().signal,  // optional
  timeoutMs: 30_000,                     // optional; NO default exists
});

if (outcome.status === 'success') {
  outcome.result.token;
} else {
  outcome.error.code;   // invalid_authorization | missing_session_id | invalid_card_data |
                        // unknown_outcome | http_error | malformed_response | missing_token
}
```

**Assessment:** this entry is primarily for internal/host integration, and that is how it is used
today — client-core binds exactly this function
(`hyperswitch-client-core/src/utility/libraries/HyperswitchVault.res:180-182`). It is the only
public surface whose caller must hold a PAN and CVC, so a merchant using it would be collecting
card data in their own code, which is the situation flows A and B exist to avoid. Nothing in the
package prevents a merchant from importing it; treating it as internal is a documentation
convention, not an enforced boundary (*inference* from the absence of any guard).

### D. Embedded entry — **client-core only, not a merchant example**

client-core does not import the package as a component in JSX-with-TS style; it declares ReScript
externals against the `/embedded` subpath. Verbatim from
`hyperswitch-client-core/src/utility/libraries/HyperswitchVault.res`:

```rescript
@module("@juspay-tech/react-native-hyperswitch-vault/embedded")
external selectCardFields: array<cardFieldSpec> => Nullable.t<cardFieldSelection> =
  "selectCardFields"

@module("@juspay-tech/react-native-hyperswitch-vault/embedded")
@react.component
external make: (...) => React.element = "EmbeddedCardElement"
```

and invokes it from `client-core/src/components/dynamic/CardElement.res:185-227` with nineteen resolved props
(`selection`, validators, `theme`, `labels`, `layout`, `eligibilityStatus`, `isProcessing`,
`onAnalytics`, `emitCardInfo`, `renderIcon`, `renderError`, `renderSchemeAccessory`, `scanCard`,
…). The host owns the `<Form>`; the package renders fields into it.

---

## 4. Phase-by-phase implementation

Phase boundaries are reconstructed from current code plus the design documents written alongside
it. Where a claim rests on a document rather than on code, it is marked *docs*.

### Phase 0 — Behaviour contract

**Problem.** The card form was about to be moved out of the SDK it grew up in. Without a written
record of observed behaviour, "the extraction changed nothing" would be unprovable.

**What was produced.** `hyperswitch-client-core/docs/card-element-behavior-contract.md` — 92 KB,
19 numbered sections (*docs*, untracked; `docs/` is in client-core's local excludes). Sections
cover render hierarchy, form ownership, per-field contract, formatting, validation, react-final-form
behaviour, focus/interaction, co-badge, eligibility, appearance/RTL/accessibility, scan-card,
events and sensitive-data boundaries, submission shape, dependency inventory, live-versus-dead
files, must-not-change behaviour, open questions and a source index.

**Paths investigated.** The live `CardElement` path under both parents (`TabElement` and
`DynamicComponent`); §16 separately classifies adjacent and dead card code (saved-card CVC,
`CvcWidget`, headless, GiftCard, the unused `CardWidget.res`).

**Defects found and deliberately preserved.** Fifteen, tabulated at
`card-element-behavior-contract.md:1487-1501` with the file or section that proves each. Examples,
quoted from the contract:

- **D1** — "AmEx is grouped 4-4-4-7, not 4-6-5" because `cardType`'s switch only accepts `"AMEX"`
  while the pattern issuer is `"AmericanExpress"`.
- **D3** — the brand-change reset "fires only when the PAN matches **no** pattern, never on a brand
  *switch*", so a stale 4-digit CVC can survive.
- **D4** — "CVC auto-blur-on-complete is dead": `onChangeCvv` receives `nullRef`, never attached.
- **D8** — "The PAN is submitted space-formatted."
- **D10** — "Card inputs remain editable during payment processing."

**Why they were not fixed.** Each is a product decision with user-visible consequences, and fixing
one during a move would make behavioural parity unprovable — the extraction could no longer be
verified by "output is unchanged". The rule adopted was *preserve-until-decided*. **Current code
still honours this**: `CardFormView.res` keeps the `editable` default at `true` for the embedded
path specifically to preserve D10, and `CardFieldUnits.res:363-366` keeps D4's dead blur target
with a comment naming it.

```rescript
/*
 * The blur-on-complete target. The pre-extraction view passed its `nullRef` here, so the blur
 * has always been a no-op — a documented suspected defect, preserved until decided, not fixed.
 */
let deadRef: React.ref<Nullable.t<TextInput.element>> = React.useRef(Nullable.null)
```

**Remaining risk.** The contract is untracked in git (`docs/` is excluded locally), so it exists
only on this machine.

### Phase 1 — Client-core context decoupling

**Problem.** The card form read client-core React contexts and hooks directly. Any of those makes
the component unusable outside client-core.

**Design decision.** Invert every dependency into a *prop*, and keep the host-specific chrome in
client-core behind render callbacks. The rule is written into the portable prop contract
(*source*, `src/CardFormTypes.res:4-8`):

```rescript
 * Nothing in this package may read a host React context, a host hook (ThemebasedStyle / GetLocale /
 * LoadingContext / LoggerHook / AlertHook), a native module, navigation, or an API hook. Everything
 * a card field needs arrives through these types, resolved by a host adapter.
```

**Every removed dependency, and where it went.** The host adapter is
`hyperswitch-client-core/src/components/dynamic/CardElement.res`; the portable consumer is this
package.

| Original dependency (client-core) | Why it blocked portability | Replacement boundary | Host adapter (client-core) | Portable consumer (package) |
| --- | --- | --- | --- | --- |
| `ThemebasedStyle.useThemeBasedStyle()` | React context + client-core theme model | `theme: cardTheme` — 17 pre-resolved tokens incl. two opaque `styleObject`s | `CardElement.res:77` destructures the theme, builds `cardTheme` | `CardFormTypes.res:21-45`, consumed in `CardFormView.res` |
| `GetLocale.useGetLocalObj()` | locale context | `labels: cardLabels` — 6 resolved strings + `notEligibleText` + `isRtl` | `CardElement.res:57` | `CardFormTypes.res:56-65` |
| `LoadingContext.loadingContext` | context | `isProcessing: bool` (and `editable: bool` for form owners) | `CardElement.res:55` | `CardFormView.res:82,90` |
| `LoggerHook.useLoggerHook()` | hook + client-core logger types | `onAnalytics: analyticsEvent => unit`, payload is a **field identifier**, never a value | `CardElement.res:58`, maps id → placeholder string then logs (`:199-214`) | `CardFormTypes.res:117-120` |
| `AlertHook.useAlerts()` | hook | folded into the scan capability's host-side handler | `CardElement.res:59`, alerts on scan failure (`:174-178`) | not present in package |
| `NativePropContext` | context carrying merchant config | individually selected props (`layout.showCvcIcon`, brand-icon config, …) | `CardElement.res:53`, e.g. `:120` `cvcIcon === Shown` | `CardFormTypes.res:67-70` |
| `DynamicFieldsContext` (eligibility) | context | `eligibilityStatus: [#allowed \| #pending \| #denied]` + `checkEligibility` callback | `CardElement.res:54`, mapped at `:124-126` | `CardFormTypes.res:78` |
| `ViewportContext` + `Tooltip` (co-badge picker) | viewport-aware popover, deeply host-coupled | `renderSchemeAccessory: schemeAccessory => React.element` — package computes semantic state, host renders chrome | `CardElement.res:218-225` renders `<CardSchemeComponent>` | `CardFormTypes.res:97-103`, invoked in `CardFormView.res` `CardAccessory` |
| `ScanCardModule` (native module) | native dependency | `scanCard: scanCardCapability` `{isAvailable, launch}` | `CardElement.res:149-183` owns module, logs and alerts | `CardFormTypes.res:90-93`, trigger UI in `CardScanTrigger.res` |
| `Icon` | client-core asset/context | `renderIcon: (~name, ~width, ~height, ~fill) => React.element` | `CardElement.res:216` | `CardFormTypes.res` `renderIcon` |
| `ErrorText` | client-core component | `renderError: string => React.element` | `CardElement.res:217` | `CardFormView.res:92` |

**Why `CardInput` was created instead of moving `CustomInput`.** `CustomInput` has eight non-card
consumers in client-core. Moving it would have forced those consumers to depend on the new package;
generalising it into a shared base would have coupled two repositories to one input implementation.
A card-only `CardInput.res` (239 lines) was created instead, and **`CustomInput` was not modified**,
so the eight other consumers are untouched by construction.

**How `CardElement` became the host adapter, and how the outer gate avoids running hooks.** The
public props of `CardElement` did not change. Its outer component now runs **no hooks at all** — it
only computes the field selection and mounts an inner `Host` module (*source*,
`client-core/src/components/dynamic/CardElement.res:231-247`):

```rescript
let make = (~fields, ~createFieldValidator, ~formatValue, ~enabledCardSchemes=[], ~accessible=?,
            ~checkEligibility=_ => ()) => {
  switch fields->Array.map(toFieldSpec)->HyperswitchVault.selectCardFields->Nullable.toOption {
  | Some(selection) => <Host selection ... />
  | None => React.null
  }
}
```

Every context read (`NativePropContext`, `DynamicFieldsContext`, `LoadingContext`, locale, logger,
alerts, theme) lives inside `Host` (`:43-229`), so an unconfigured card group renders `React.null`
without running a single hook — the pre-extraction behaviour. The selection rule itself is **not**
reimplemented in the host; it is imported from the package (`selectCardFields`,
`src/CardFormTypes.res:196`).

**Who owns the `<Form>` in the embedded path.** client-core does. The package's `/embedded`
component calls `useField` only; the single `ReactFinalForm.Form` for that path lives in
client-core's `RequiredFields.res` (*docs* evidence from the behaviour contract §3, plus *source*
evidence that `VaultEmbedded.res` contains no `<Form>`).

**Behaviour intentionally preserved:** field names, sentinels, validators, formatters, focus
transitions, error timing, testIDs, masked card event. **Public API impact:** none — `CardElement`
props unchanged.

### Phase 2 — Portability closure

**Problem.** After Phase 1 the portable layer still imported four context-free client-core modules.
They are not contexts, but they are still client-core files, so the code could not move
repositories.

**Decision.** Recreate the minimum functionality locally, and *do not modify* the client-core
originals. Each replacement file documents its own rationale and the consumer count that ruled out
moving the original.

| Client-core module | Other consumers | Replacement (*source*) | Equivalence |
| --- | --- | --- | --- |
| `AnimatedValue.useAnimatedValue` | 13 | `src/CardAnimatedValue.res` (23 lines) | "Behaviourally identical … a lazily created `Animated.Value` held in a `useRef`" |
| `CustomPressable` | 24 | `src/CardPressable.res` (30 lines) | **intentionally reduced** to 3 props, with `accessible=false`/`focusable=false` set explicitly because "a bare `<Pressable>` defaults `accessible` to `true`" |
| `UIUtils.RenderIf` | 18 | `src/CardRenderIf.res` (20 lines) | identical; the comment notes `UIUtils` "has no imports — so nothing is gained or lost in bundle terms; this exists purely to close the ownership boundary" |
| `TestUtils` (3 card IDs) | — | `src/CardTestIds.res` (14 lines) | **byte-identical strings**; `payButtonTestId` deliberately left behind as non-card-domain |

**Why importing all of shared-code was rejected:** it would ship client-core modules with 13–24
unrelated consumers into a merchant bundle, and would make the package depend on a repository it is
supposed to be independent of.

**Why non-card consumers are unaffected:** none of the four originals was edited. This is verifiable
in client-core's diff — `AnimatedValue`, `CustomPressable`, `UIUtils` and `TestUtils` do **not**
appear in its staged file list (§1.2).

**Final dependency graph of the portable card form** (compiled-import evidence, `dist`-level):

```text
CardFormView (layout)
├── CardFieldCore ──► CardFieldUnits ──► react-final-form (useField/useForm)
│                                   └──► sdk-utils Validation, PaymentEventData
├── CardInput ──► CardAnimatedValue, CardPressable, CardRenderIf, CardTestIds
├── CardScanTrigger (embedded only; host injects the capability)
└── react-native, react
```

**sdk-utils modules still consumed** — `Validation` (Luhn, scheme patterns, formatting, expiry/CVC
rules) and `PaymentEventData` (masked card-info payload), plus `LocaleDataType` for default
validation strings in the standalone form. Nothing else; the transport re-uses `Validation` rather
than reimplementing card checks (`src/VaultConfirm.res:311-327`).

### Phase 3 — Library foundation and packaging

**ReScript library setup.** `rescript.json` declares `namespace: true`, JSX 4, `-open RescriptCore`,
suffix `.bs.js`, in-source ESM output, sources from `src` **and** `./shared-code/sdk-utils`, and a
`gentypeconfig` emitting `.gen.tsx`.

**genType instead of hand-written declarations.** Public ReScript values/types carry `@genType`;
`tsc -p tsconfig.build.json` then emits `dist/types`. A build gate fails on drift — and it is
sensitive enough that a doc *comment* containing the literal token `@genType` in a file with no
generated output fails the build (observed while writing `CardFieldUnits.res`; the comment was
reworded). Evidence: `scripts/check-generated.mjs` matches `/@genType/` against the whole file body.

**Entry design and outputs.** Three entries; ESM at `dist/esm/*.js` and CJS at `dist/cjs/*.js`,
each with its own `package.json` `type` marker written by `scripts/emit-package-type.mjs`. **Both
formats use the `.js` extension deliberately** — the rollup config records that client-core's
webpack routes unknown extensions through `asset/resource` with `emit:false`, so a `.mjs`/`.cjs`
entry silently becomes a stub and the card form vanishes from the bundle while the build still
succeeds.

**Peer dependencies.** `react` and `react-native` are required peers; `react-final-form` and
`final-form` are **optional** peers, and the package declares **no runtime `dependencies` at all**,
so no install can create a nested copy (this is what Phase 7 depends on).

**Tarball allowlist.** `files` (§2.1) plus negative entries. Measured on the current tree: 60
entries, **182,119 bytes compressed / 702,018 bytes unpacked**, containing no `example/`, no Pods,
no `node_modules`, no source maps and no `shared-code` sources.

**`sideEffects: false`** — enables consumer-side tree-shaking; audited as safe because the bundles'
top level is only imports, function declarations and literal initialisers.

**sdk-utils pinning.** Submodule pinned at `1669cc2`; `scripts/check-submodule.mjs` fails the build
on drift or a dirty submodule.

**Keeping unrelated sdk-utils out of the merchant bundle.** Rollup tree-shaking at publish time,
plus a deliberate avoidance of `Validation.createFieldValidator` in the standalone form. That
function routes through `validateField`, whose postal-code/CPF/CNPJ branches pull `PostalCodes`
(244 country regexes), `CpfValidation` and `CnpjValidation` into the graph. The standalone form
calls `cardValid` / `checkCardExpiry` / `checkCardCVC` directly instead (*source*,
`src/HyperswitchVaultForm.res:262-330`, with the reasoning in the comment above it). **Verified on
the current build:** `PostalCodes`, `CpfValidation` and `CnpjValidation` each appear **0 times** in
`dist/esm/index.js`.

**The four dependency classes, distinguished:**

| Class | Contents |
| --- | --- |
| Build-time only | `rescript`, `@rescript/core`, `@rescript/react`, `rescript-react-native`, `rollup`, `typescript`, the pinned sdk-utils submodule |
| Peer, required in the app | `react`, `react-native` |
| Peer, optional (embedded path only) | `react-final-form`, `final-form` |
| Bundled into the root entry | ReScript runtime helpers, sdk-utils card code, **react-final-form + final-form** |
| Externalised by `/embedded` | `react`, `react-native`, **`react-final-form`, `final-form`** |
| `/vault` | neither React nor React Native — verified: `dist/esm/vault.js` imports nothing |

### Phase 4 — Vault transport

All evidence *source*, `src/VaultConfirm.res` (601 lines). This module imports **no React and no
React Native** — verified in the build output: `dist/esm/vault.js` has no imports at all.

**`sdk_authorization` parsing.** It is not opaque. `decodeBase64` (`:142`) decodes it with a
local alphabet table; `readSessionId` (`:226-242`) then splits the decoded text on `,` and takes
the value of the `payment_method_session_id` key:

```rescript
key === "payment_method_session_id" && value->String.length > 0 ? Some(value) : None
```

`resolveSessionId` (`:244`) turns failures into typed outcomes before anything else happens:
empty → `#invalid_authorization`; undecodable → `#invalid_authorization`; decodable but no session
id → `#missing_session_id`.

**Environment → URL** (`:335-343`), selected from the caller's trusted environment, never from the
session:

```rescript
| #production => "https://checkout.hyperswitch.io/api"
| #integration => "https://dev.hyperswitch.io/api"
| #sandbox => "https://beta.hyperswitch.io/api"
```
```rescript
let confirmUrl = (~environment, ~sessionId) =>
  `${environment->vaultBaseUrl}/v1/payment-method-sessions/${sessionId}/confirm`
```

Note this is a **v1** path.

**Headers — exactly two** (`:540-546`):

```rescript
headers: [
  ("Content-Type", "application/json"),
  ("Authorization", request.sdkAuthorization),
]->Dict.fromArray,
```

The comment above records that hyperswitch-web additionally emits `api-key: invalid_key` as a
fallback artefact and that this is deliberately not reproduced.

**Body** (`:353-372`) — PMS-confirm shape, with the PAN space-stripped at the boundary:

```rescript
("card_number", card.cardNumber->Validation.clearSpaces->JSON.Encode.string),
("card_exp_month", card.expiryMonth->JSON.Encode.string),
("card_exp_year", card.expiryYear->requestExpiryYear->JSON.Encode.string),
("card_cvc", card.cvc->JSON.Encode.string),
```

wrapped as `{payment_method_type: "card", payment_method_data: {card: {…}}}`. This differs from the
subsequent payments confirm, which the host owns.

**PAN-space normalisation.** `Validation.clearSpaces` at the transport boundary — so even though the
form submits a space-formatted PAN (behaviour-contract defect **D8**), the vault receives digits.

**Card validation before fetch** (`:311-327`, called at `:504` as the *first* statement of
`confirmPaymentMethodSession`): empty number → "Card number is required"; `Validation.cardValid`
(Luhn + scheme lengths); `checkCardExpiry`; `checkCardCVC` for the detected brand. All four are
sdk-utils functions — nothing is reimplemented. A failure returns `#invalid_card_data` **with zero
network calls**, and the rejected value never appears in the error.

**Expiry conversion** (`:280-295`). The form holds a 2-digit year; the PMS confirm takes 4 digits.
`requestExpiryYear` passes through anything already ≥4 digits, otherwise derives the century via
sdk-utils `getExpiryDates` — the comment states "never hardcode `20`".

**Token extraction** (`:404-410`):

```rescript
->Dict.get("associated_payment_methods")
->Option.flatMap(JSON.Decode.array)
->Option.flatMap(entries => entries->Array.get(0))
->Option.flatMap(JSON.Decode.object)
->Option.mapOr("", entry => entry->objectAt("payment_method_token")->stringAt("data"))
```

An empty token on a 2xx response is `#missing_token`, not a success.

**Sanitised error mapping.** `describeHttpFailure` (`:442`) reads **only** `error.code` from the
envelope and maps it to a fixed public string via `publicMessageForCode` (`:210`); the backend's own
message and the rest of the body are discarded.

**Timeout and abort** (`:527-536`, `:466-490`). `timeoutMs` is caller-supplied with **no default**;
when present, a `setTimeout` sets a `timedOut` flag and aborts the controller. A caller-supplied
`signal` is funnelled into the same controller, so there is a single abort path.

**Unknown-outcome semantics** (`:560-572`). A thrown fetch — network failure, timeout or abort
alike — becomes `#unknown_outcome`, with `retryable: false` and `unknownOutcome: true`:

```rescript
 * A thrown fetch covers network failure, timeout and abort alike. Any of them can occur
 * after the server accepted the request, so the outcome is unknown and never retryable.
```

**Why no automatic retry.** `retryableForStatus` (`:201`) is an intentionally empty approved
mapping — `let retryableForStatus = (_status: int, _code: option<string>) => false`. The endpoint
carries no idempotency key, and the function's own header states "Exactly one request is issued.
Nothing is retried automatically."

**Can it reject?** No `raise`, `throw` or exception constructor appears anywhere in the file; both
`await` sites are wrapped in `try`. **Verified by grep**, and relevant to a client-core finding in
§5 below.

### Phase 5 — Client-core vault integration

Data flow, traced through the current client-core working tree.

**1. `vault_details` decode** — `SessionsType.res:123-141`. `getVaultDetails` returns
`option<vaultDetails>`; `decodeSessionsResponse` (`:155-159`) returns one snapshot carrying both
`tokens` and `vaultDetails`, so both are replaced from a single response.

**2. `VaultContext`** — `client-core/src/contexts/VaultContext.res:14`, `React.createContext((None:
option<SessionsType.vaultDetails>))`. Read-only downstream (no setter in context). Provided in
`NavigationRouter.res:147-169`; consumed at exactly one place, `CardVaultHook.res:79`.

**3. `VaultConfiguration.resolve`** — `client-core/src/utility/logics/VaultConfiguration.res:44-63`. Verified
verbatim:

```rescript
switch vaultDetails {
| None => NoVault
| Some(details) =>
  switch details.vaultType->String.trim->String.toLowerCase {
  /* Present but unusable — never NoVault, or the raw-card fallback opens up. */
  | "" => InvalidVaultConfiguration
  | "hyperswitch" =>
    details.sdkAuthorization->String.trim->String.length > 0
      ? HyperswitchVault({sdkAuthorization: details.sdkAuthorization,
                          environment: environment->toVaultEnvironment})
      : InvalidVaultConfiguration
  | provider => UnsupportedVault(provider)
  }
}
```

**Environment normalisation** (`:37-42`) is a total switch `PROD → #production`,
`SANDBOX → #sandbox`, `INTEG → #integration` — no default branch, so a new env constructor breaks
the build. **There is no fallback to `nativeProp.paymentSessionConfig.sdkAuthorization`**; the file
header explains that it is a different, merchant-level token.

**Decision table — fail-closed rules**

| `vault_details` state | `resolve` | PMS confirm attempted? | Raw-card `payments/confirm` allowed? |
| --- | --- | --- | --- |
| absent (key missing / not an object) | `NoVault` | no | **yes** — unchanged legacy path |
| present, `vault_type: ""` (or `vault_data` missing) | `InvalidVaultConfiguration` | no | **no** — `VaultFailed` |
| present, `vault_type: "hyperswitch"`, blank `sdk_authorization` | `InvalidVaultConfiguration` | no | **no** — `VaultFailed` |
| present, `vault_type: "<other>"` | `UnsupportedVault(provider)` | no | **no** — `VaultFailed` |
| present, `"hyperswitch"` + non-blank authorization | `HyperswitchVault{…}` | **yes** | only via token substitution on success |

Only a **completely absent** `vault_details` yields `NoVault`. Every present-but-unusable shape
fails closed.

**4. `CardVaultHook.useCardVaultSubmit`** — `client-core/src/hooks/CardVaultHook.res`. Returns
`vaultSubmitOutcome = NoVault | VaultSucceeded(string) | VaultFailed(string) | AlreadyInFlight`
(`:12-24`). Guards (`:81-94`): a `React.useRef` in-flight boolean, an `AbortController` ref, and a
`useEffect0` cleanup that aborts on unmount. Non-card payment methods short-circuit to `NoVault`
(`:101`). The library call (`:128-137`) passes `sdkAuthorization`, `environment`, `card` and the
abort `signal`, and **passes no `timeoutMs`** — the comment says client-core has no approved
payment-API timeout.

**5. Call sites** — `PaymentMethod.res:255-278` and `DynamicComponent.res:215-238`, structurally
identical four-case switches:

```rescript
| CardVaultHook.NoVault => continueWithConfirm(~paymentToken=None)
| CardVaultHook.VaultSucceeded(token) => continueWithConfirm(~paymentToken=Some(token))
| CardVaultHook.VaultFailed(message) => errorCallback(...)
| CardVaultHook.AlreadyInFlight => ()
```

**6. Token into the confirm body.** The **callers** omit raw card data when a token exists
(`PaymentMethod.res:204-207`, identical at `DynamicComponent.res:165-168`):

```rescript
~payment_method_data=?switch paymentToken {
| Some(_) => None
| None => mergedPaymentData->Dict.get("payment_method_data")
},
```

**7. `customer_acceptance` preserved for a freshly vaulted card.** `PaymentUtils.res:57-64`,
verified verbatim — line 58 is the vault-specific addition:

```rescript
customer_acceptance: ?(
  (payment_token->Option.isNone || isFreshVaultToken) &&
  (nativeProp.configuration.alwaysSendCustomerAcceptance || …) &&
  !isGuestCustomer
```

`~isFreshVaultToken` defaults to `false` (`:36`), so every pre-existing caller is unchanged. **Why
saved cards differ:** a saved card also arrives with a `payment_token`, but its call sites never
pass `isFreshVaultToken`, so the first clause is false and acceptance stays suppressed — the
pre-vault behaviour.

**8. Session refresh.** `NavigationRouter.res:83-103` sets vault details from the fresh snapshot on
success and **clears** them on both the error and the null branches. `UpdateIntentHook.res:129-155`
does the same for a new intent, deliberately clearing vault details while *not* clearing session
tokens (a stale wallet token is inert).

**Two integration findings (reported, not fixed):**

- **`UpdateIntentHook.res:222-240`** — the outer `Promise.catch` on the refresh does **not** call
  `setVaultDetails(_ => None)`; it only emits `api_call_failed` and resets loading. A rejected
  refresh therefore leaves the previous intent's vault authorization in context, which is the exact
  case the `:140-154` else-branch was written to prevent. **Verified by reading both branches.**
- **`CardVaultHook.res:128`** — the `await` is not wrapped in `try`. If the library call ever
  rejected, `inFlight.current` would stay `true` and every later submit would return
  `AlreadyInFlight`, which both call sites handle by doing nothing — leaving the sheet in
  `ProcessingPayments`. **Reachability assessment:** `VaultConfirm.res` contains no `raise`/`throw`
  and wraps both `await`s, so this is **not reachable through the transport's own paths**; it is a
  latent robustness gap (e.g. a binding/module-resolution failure), not a live defect. *Inference,
  based on the absence of throwing constructs.*
- **`VaultConfiguration.res:55-57`** — emptiness is tested on the *trimmed* authorization while the
  **untrimmed** value is forwarded to the library. A whitespace-padded authorization would be sent
  as-is; `VaultConfirm.resolveSessionId` trims before its own emptiness check but base64-decodes the
  untrimmed string, so padding could produce `#invalid_authorization`. *Inference — not exercised
  by any test found.*

### Phase 6 — Standalone ready-made form

*Source*, `src/HyperswitchVaultForm.res` (491 lines).

**Why it owns one `<Form>`.** The embedded path renders into client-core's form; a standalone
merchant has no form at all, so the component must create exactly one. It is created at `:400`
(`<ReactFinalForm.Form onSubmit={_ => ()} …>`) — `onSubmit` is a deliberate no-op because
submission goes through the ref handle, not through form submission.

**Why it takes the whole session object.** The prop is the merchant's `session_tokens` response
(`vaultSession`, `@genType.import` of `MerchantSession`), and the component reads only two fields
from it. The design keeps merchants from extracting or decoding `sdk_authorization` themselves —
they never touch the string.

**Session parsing is shared, not duplicated.** `readSession` now lives in the coordinator and is
called by the form at `:342-344`: `session->VaultFormCoordinator.readSession`. It returns
`Ready(authorization)` or `Unusable(message)`.

**Reuse of `CardFormView` and sdk-utils.** The form renders the same `CardFormView` the embedded
path renders (`:418`), and builds validators from module-level factories that call sdk-utils
directly (`:262-330`), avoiding `createFieldValidator` for the bundle reasons in Phase 3.

**`submit` / `reset` / `focus`** are wired at `:378-397`; `submit` and `reset` come from the shared
machinery, `focus` from the registered card-form controls:

```rescript
React.useImperativeHandle0(ref, () => {
  submit: machinery.submit,
  reset: machinery.reset,
  focus: field => controlsRef.current->Option.forEach(controls => controls.focus(field)),
})
```

**Field values stay internal.** They live in the react-final-form instance created inside this
component. The only outward paths are the sanitised `onStateChange` and the submit result.

**Repeated submit shares one promise** — `VaultFormCoordinator.res:250-270`: if `inFlightRef` holds
a promise it is returned as-is, so no second request is issued.

**`reset()` during an in-flight request is refused** — `VaultFormCoordinator.res:277-284`:

```rescript
let reset = () =>
  switch inFlightRef.current {
  | Some(_) => ()
  | None =>
    formMethodsRef.current->Option.forEach(methods => methods.reset())
    clearLocal()
  }
```

**Session/environment change** — the coordinator tags the abort slot with
`"${sdkAuthorization}|${environmentKey}"` (`:219`) and an effect keyed on that string aborts and
detaches only a request belonging to a superseded session (`:181-190`), so a request issued after
the swap is not cancelled.

**Errors become merchant-safe results** through `VaultResult.fromConfirmOutcome`
(`src/VaultResult.res:105-120`), which maps seven transport codes onto five public ones and
replaces every message with a fixed string.

### Phase 7 — React Final Form identity

**The real problem.** react-final-form connects `<Form>` to `useField` through a React context that
lives *in the module instance*. Two copies of the package mean two contexts, and a field from copy B
inside a form from copy A does not degrade gracefully — react-final-form's own `useForm()` guard
throws `useField must be used inside of a <Form> component`. The rollup config records this at
`rollup.config.mjs:25-27`.

**Why `/embedded` must use the host's instance.** client-core owns the `<Form>`. If the package
bundled its own react-final-form, the embedded card fields would register against a *different*
instance than the host's form and could never participate in it.

**Why the root entry can bundle its own.** The standalone component owns both the `<Form>` and the
fields; nothing outside the bundle needs to share that context. Bundling means a merchant installs
one package and no peer.

**How Rollup treats them differently.** `external` applies per *configuration*, not per entry, so
the file exports **two configurations** (`rollup.config.mjs:97-123`):

```js
const hostRuntime = ['react', 'react/jsx-runtime', 'react-native'];
const reactFinalForm = ['react-final-form', 'final-form'];
...
external: (id) => [...hostRuntime, ...reactFinalForm].includes(id) || isImageAsset(id),  // embedded + vault
...
external: (id) => hostRuntime.includes(id) || isImageAsset(id),                          // standalone root
```

**How the package prevents a nested copy.** It declares **no runtime `dependencies`**, and
react-final-form/final-form only as **optional peers**. An install therefore cannot place a second
copy inside the package's own `node_modules`.

**What happens if a nested copy is forced.** `scripts/verify-consumers.mjs` builds a fixture that
deliberately nests one and asserts the failure is loud rather than silent
(`verify-consumers.mjs:400-403`):

```js
check(
  thrown !== null && /must be used inside of a <Form>/.test(thrown.message),
  `a mismatched field throws react-final-form's own guard instead of failing silently (...)`,
);
```

**How module identity is proven.** Three offline consumer fixtures built from the packed tarball —
25 checks — assert that the root entry asks the host for no react-final-form, that `/embedded` does
ask and resolves the **host's** instance (same module object), that `/vault` pulls in neither React
nor React Native, and that a field from the package registers against the host's form instance.

**"Are we unable to put React Final Form in the library?"** No — it *is* in the library. The root
entry ships react-final-form bundled inside it, and a standalone merchant installs nothing extra.
What differs is **ownership and module identity**: for the standalone entry the library owns the
form instance, so bundling is correct; for `/embedded` the host owns it, so the dependency must stay
external and resolve to the host's copy. The same source (`CardFormView`) is compiled into both
entries under different externalisation rules, which is why the card UI appears in both bundles.

### Phase 8 — Appearance, localisation and brand icons

**Localisation shape and merging.** `localisation = {labels?, validationMessages?, isRtl?}`. Both
resolvers merge **per field** over defaults, so passing one string overrides only that string
(`src/HyperswitchVaultForm.res:282-330`): `resolveLabels` falls back to the module's English
`defaultLabels`, `resolveMessages` falls back to sdk-utils' `LocaleDataType.defaultLocale` —
meaning an untranslated form shows exactly the strings the SDK already shows.

**Validation-message localisation replaces text only.** The rules stay in sdk-utils; the standalone
validators call `cardValid` / `checkCardExpiry` / `checkCardCVC` and merely choose which message
string to return.

**RTL.** Carried as `localisation.isRtl` into `cardLabels.isRtl`, consumed in `CardFormView.res` to
flip the expiry/CVC row direction (`flexDirection: labels.isRtl ? #"row-reverse" : #row`).

**Appearance tokens.** 16 optional keys flattened into the portable `cardTheme` by `buildTheme`
(`HyperswitchVaultForm.res:226-254`), each with an explicit default.

**Error presentation.** Reproduced from client-core's `ErrorText` without importing it: font size
`(12 + errorTextSizeAdjust) * fontScale` and spacing default `4`
(`HyperswitchVaultForm.res:346-353`). The standalone form passes a `renderError` closure; the widget
path renders the same presentation through `VaultWidgetContext.ErrorText`.

**Accessibility.** `accessible` is an optional passthrough placed on each `TextInput` (not on a
wrapping View), so the three inputs are never collapsed into one accessibility element. The
replicated `CardPressable` sets `accessible=false`/`focusable=false` explicitly to preserve
client-core's `CustomPressable` behaviour.

**Card-brand mapping and the coverage gate.** `CardIcons.res` declares a closed `detectedScheme`
variant (`:44-58`) whose `fromDetectedName` ends in `| _ => Unrecognised`. Because sdk-utils issuers
are **runtime strings**, a closed variant is not a compile-time guarantee — so
`scripts/verify-icon-coverage.mjs` reads every issuer from the pinned submodule and requires each to
be classified `HasArtwork` or `IntentionalWaitcardFallback`, with PNGs present at all three
densities. It fails on an unclassified issuer, a double classification, a stale entry, or a missing
`@1x/@2x/@3x` file, and it runs in `build`, `prepack` **and** `verify`.

**CVC icon.** Rendered via the injected `renderIcon` in the embedded/ready-made path (name `"cvv"`)
and as `CardIcons.Cvc` in the CVC widget; tinting follows `checkCardCVC` validity.

**The four modes** (`brandIconMode`): `standard` (detected brand, else waitcard), `animated`,
`hidden`, `hideGeneric`.

**Scaling/fading but no rotation.** The animated cycle is a 2000 ms delay, a 300 ms fade to 0,
placeholder advance, a 300 ms fade back to 1, with **scale interpolated 0.8 → 1.0 from the same
animated value** (`CardIcons.res:128-142`). The comment states: "There is no rotation in the source
and none here."

**Documentation/source disagreement found (source wins).** The file header at
`src/CardIcons.res:15-16` still says "`Animated` mode (client-core's delay/fade placeholder cycle)
is **NOT implemented here** and is not part of this phase." The code below it *does* implement
`#animated` (`:128-142`, plus the mode switch in the component). The header is stale; the
implementation is authoritative.

**Asset packaging.** 10 artwork names × 3 densities = **30 PNGs**, copied to `dist/assets` by
`scripts/copy-assets.mjs` and shipped via the `dist/assets/**` allowlist entry. React Native's
bundler picks the density per platform from the `@2x`/`@3x` suffixes; there is no `react-native-svg`
and no native module, which preserves the "no Pod install, no Codegen" property.

### Phase 9 — Independent field widgets

**Why `HyperswitchVaultFormProvider` exists, and how it differs from `HyperswitchVaultForm`.** Both
own exactly one `<Form>` and expose the same `vaultFormHandle`. The difference is what they render:
the form renders the built-in three-field layout (and therefore accepts `splitCardFields`); the
provider renders **the merchant's `children`** and accepts no layout prop. ADR-0001 records the
decision to keep them as two named components rather than one dual-mode component.

**Why the widgets cannot be isolated forms.** The three card fields are cross-coupled by design:

- the detected **brand** is written by the card-number handler and read by the CVC validator and
  formatter (CVC length depends on scheme);
- the visible **expiry** string feeds the expiry validator;
- **focus auto-advance** runs number → expiry → CVC;
- a brand change **clears** expiry and CVC;
- the masked card-info event is computed from all four values together.

Three independent forms could not do any of that. They therefore share one coordinator.

**Registration and unregistration.** Each field hook registers on mount and returns the
unregistration as its effect cleanup (`src/CardFieldUnits.res:110-120`):

```rescript
let register = (kind, controls) => {
  nextIdRef.current = nextIdRef.current + 1
  let id = nextIdRef.current
  registryRef.current->Map.set(id, {entryKind: kind, controls})
  setRegistryVersion(version => version + 1)
  () => {
    registryRef.current->Map.delete(id)->ignore
    setRegistryVersion(version => version + 1)
  }
}
```

Entries are keyed by a **monotonic integer identity**, not by kind — which is what makes duplicate
*counting* possible and what makes StrictMode's mount→unmount→mount replay safe: the replayed mount
takes a fresh id and the first id is deleted by its own cleanup.

**Duplicate detection and missing widgets.** `countOf(kind)` counts entries of that kind. The
provider's presence gate (`HyperswitchVaultFormProvider.res:226-241`) runs **before any value is
read**:

```rescript
let presenceGate = () =>
  switch coordRef.current {
  | None => Some(VaultResult.notReadyWithMessage(missingMessage(requiredKinds)))
  | Some(coord) =>
    let missing = requiredKinds->Array.filter(kind => coord.countOf(kind) == 0)
    if missing->Array.length > 0 {
      Some(VaultResult.notReadyWithMessage(missingMessage(missing)))
    } else {
      switch requiredKinds->Array.find(kind => coord.countOf(kind) > 1) {
      | Some(kind) => Some(VaultResult.notReadyWithMessage(duplicateMessage(kind, coord.countOf(kind))))
      | None => None
      }
    }
  }
```

It is passed into the shared machinery as `~presenceGate` (`:246`) and evaluated at the top of the
`Ready` branch in `VaultFormCoordinator.res:204-206`, before any form value is read and before any
request is built. Both outcomes are `not_ready`, **nothing is logged**, and no fetch occurs.

**Unmount and completeness.** The aggregate effect (`HyperswitchVaultFormProvider.res:126-141`)
recomputes from validity **and** registry counts, and is keyed on `registryVersion` so mount/unmount
re-emits immediately:

```rescript
let cardNumberValidPublic = numberCount == 1 && numberValid
let expiryValidPublic = expiryCount == 1 && expiryValid
let cvcValidPublic = cvcCount == 1 && cvcValid
let complete = cardNumberValidPublic && expiryValidPublic && cvcValidPublic
```

This is what prevents a react-final-form value that outlived its field from presenting as valid.

**Focus and backspace with merchant-controlled layout.** Navigation targets a **kind**, never a
sibling ref, so visual order is irrelevant: `coord.focusKind(ExpiryKind)` after a complete card
number, `coord.focusKind(CvcKind)` after a valid expiry, and backspace-on-empty going
CVC → expiry → number. `focusKind` takes the first registered entry of that kind and is a **no-op
when none is registered**.

**Two providers stay isolated** because the registry, the coordination record and the machinery are
all created inside each provider's own React subtree — there is no module-level state anywhere in
`CardFieldUnits.res`, `VaultFormCoordinator.res` or the provider.

**How submission reads the three values without exposing them.** The values live in the provider's
react-final-form instance. `useFormStateHandler` writes the latest snapshot into
`machinery.valuesRef` (`HyperswitchVaultFormProvider.res:92`), and the coordinator reads the four
card fields out of that ref *at call time* via `VaultFormCoordinator.readCardField`, passing them
straight into the transport. They are never placed in context, never in a callback, never in state.

**Per-field errors.** Each field hook computes its own `visibleError` using the same predicate the
ready-made split layout uses, and each widget renders it beneath itself through the shared
`VaultWidgetContext.ErrorText`. There is no cross-field priority chain in widget mode.

**Call / dependency diagram**

```text
                    ┌──────────────────────────────────────────────┐
                    │ HyperswitchVaultForm.res   (ready-made)       │
                    │  owns <Form>, renders CardFormView            │
                    └───────┬──────────────────────────┬───────────┘
                            │                          │
        VaultFormCoordinator.useMachinery      CardFormView.res  (layout only)
        (session parse, submit lock,                   │
         abort/generation, reset,                CardFieldCore.use
         presenceGate hook-point)                      │
                            │                          ▼
                            │                   CardFieldUnits.res
                            │        useCoordination + useCardNumberField
                            │        + useCardExpiryField + useCardCvcField
                            │            (registry, handlers, predicates)
                            │                          ▲
                    ┌───────┴──────────────────────────┼───────────┐
                    │ HyperswitchVaultFormProvider.res │           │
                    │  owns <Form>, renders children   │           │
                    │  presenceGate + aggregate state  │           │
                    │            │                     │           │
                    │   VaultWidgetContext (private) ──┘           │
                    └────────────┬─────────────────────────────────┘
                                 │  useRequired(...)  →  one field hook each
                    ┌────────────┼────────────┬───────────────────┐
              CardNumberWidget  CardExpiryWidget  CardCVCWidget
                    └────────────┴────────────┴───────────────────┘
                                 │
                        CardInput.res (shared input shell)

   VaultEmbedded.res ──► CardFormView.res            (client-core owns its <Form>)
   VaultConfirm.res  ◄── both machineries            (transport, no React)
   VaultResult.res   ◄── transport → merchant-safe result mapping
```

---

## 5. Shared logic versus duplication audit

"Owner" = the file that actually contains the logic for that path.

| Concern | Ready-made form | Custom widgets | Embedded (client-core) | Shared or duplicated? | Reason |
| --- | --- | --- | --- | --- | --- |
| Luhn / card validation | sdk-utils `Validation` | same | same | **shared** | never reimplemented; transport re-validates with the same functions |
| Validation **messages** | `HyperswitchVaultForm.res` factories over `LocaleDataType` | same factories, via provider | client-core builds its own validators and passes them in | **shared within the package**; host supplies its own for embedded | client-core owns its locale system |
| Formatting (PAN/expiry/CVC) | `CardFieldUnits` handlers | same | same | **shared** | one `setText` per field |
| Field registration | `CardFieldUnits.useCoordination` | same | same | **shared** | one registry implementation |
| Field state (RFF binding) | `CardFieldUnits.useCardNumberField` etc. | same | same | **shared** | one `useField` call per field, one sentinel rule |
| Focus handling / auto-advance | `coord.focusKind` | same | same | **shared** | kind-based, layout-independent |
| Backspace navigation | `numberOnKeyPress` etc. from the hooks | same handlers | same | **shared** | Checkpoint 2 replaced three inline JSX handlers with these |
| Brand detection | `useCardNumberField` | same | same | **shared** | `getAllMatchedCardSchemes` |
| Co-badge scheme state | `CardFieldCore` keeps it, feeds `renderSchemeAccessory` | **discarded** — `onSchemesDetected` is a no-op (`CardNumberWidget.res:22`) | client-core renders the picker | **shared computation, different sinks** | co-badge selection is parked; widgets show the brand mark only |
| Masked card info (`buildCardInfo`) | `CardFieldCore` effect → mapped into `onStateChange` (`HyperswitchVaultForm.res:443-452`) | recomputed in `HyperswitchVaultFormProvider.res` `Body` from form values | `CardFieldCore` effect → host's `emitCardInfo` | **shared function, two call sites** | provider needs booleans only and must mask by registry counts |
| **Error visibility predicates** | inline expressions in `CardFormView.res` (`:208`, `:267`, `:342-348`) | `fieldOk` / `visibleError` fields from `CardFieldUnits` | inline, same `CardFormView` | **deliberately duplicated** | see below |
| **Border/`isValid` styling predicates** | inline in `CardFormView.res` | `field.fieldOk` in each widget | inline | **deliberately duplicated** | same reason |
| Cross-field error **priority chain** | `CardFormView.res:359-377` (fused layout only) | **none by design** | same `CardFormView` | **not duplicated** | widget mode shows only each field's own error |
| Form coordination / `<Form>` ownership | `HyperswitchVaultForm.res:400` | `HyperswitchVaultFormProvider.res:271` | **client-core** owns it | **one per owner** | required — a form owner must create exactly one |
| Session parsing | `VaultFormCoordinator.readSession` | same | n/a (client-core parses `vault_details` itself) | **shared in package**; client-core has its own decoder | different inputs: package reads the session JSON, client-core decodes the API response |
| Vault transport | `VaultConfirm.confirmPaymentMethodSession` | same | same (via `/vault` binding) | **shared** | one implementation, three consumers |
| Submission locking (shared promise) | `VaultFormCoordinator.useMachinery` | same | client-core's own `inFlight` ref | **shared in package**; host has its own | host guards its own hook instance |
| Reset semantics | `VaultFormCoordinator.reset` | same | n/a | **shared** | including the in-flight refusal |
| Lifecycle cancellation | `useMachinery` abort/generation | same | client-core `AbortController` in `CardVaultHook` | **shared in package**; host separate | two independent owners of cancellation |
| Icon rendering | injected `renderIcon` / `renderSchemeAccessory` → `CardIcons` | widgets render `CardIcons` directly | host injects its own `Icon` | **shared module, different wiring** | embedded must use client-core's asset pipeline |
| Analytics / event construction | `onAnalytics={_ => ()}` (no-op) | `onAnalytics: _ => ()` (no-op) | host's `LoggerHook` via `onAnalytics` | **only embedded emits** | see §6 |

### The four categories, explicitly

**1. Behaviour-critical logic that is genuinely shared.** Validation, formatting, field binding and
sentinels, registration, focus/backspace, brand detection, session parsing, transport, submission
locking, reset, cancellation. Checkpoint 1 and 2 collapsed these into `CardFieldUnits.res`,
`CardFieldCore.res` and `VaultFormCoordinator.res`; grep confirms exactly one implementation of
each handler (`let onChangeCardNumber` / `useOptionalCardField` / `useMachinery` appear once).

**2. Presentation logic intentionally repeated.** The **error-visibility and border predicates**.
The same boolean expressions exist twice: inline inside `CardFormView`'s JSX (which the ready-made
and embedded paths render) and as `fieldOk` / `visibleError` record fields computed inside
`CardFieldUnits` (which the widgets read). This was accepted in ADR-0001 because the fused layout's
error rendering is a *priority chain across fields* that a standalone widget must not reproduce,
while a widget needs its own field-level state. Validators, formatters, handlers and registration
stayed single-sourced. **Risk:** the two copies can drift; nothing fails the build if they do. They
are pinned only by tests (`customWidgets.test.tsx` "per-widget validation errors";
`vaultFormLifecycle.test.tsx` "reset" and "splitCardFields").

**3. Generated files that look duplicated but are build artefacts.** `src/*.gen.tsx` (10 files)
mirror ReScript types; `dist/esm` and `dist/cjs` are the same code in two module formats; the card
UI genuinely appears in **both** `index.js` and `embedded.js` because Rollup builds them under
different externalisation rules (Phase 7). None of these are hand-maintained duplicates.

**4. Accidental or risky duplication still present.** None found in the package beyond category 2.
One cross-repository near-duplicate worth a reviewer's attention: **session/vault-config parsing
exists in both repositories** — `VaultFormCoordinator.readSession` (package) and
`SessionsType.getVaultDetails` + `VaultConfiguration.resolve` (client-core). They read the same
`vault_details` shape with different rules (the package treats a non-`hyperswitch` vault type as
`Unusable`; client-core distinguishes `UnsupportedVault` from `InvalidVaultConfiguration`). This is
correct today — the two consume different inputs — but a backend change to `vault_details` would
have to be made in two places.

---

## 6. Events currently available to merchants

| Public name | Payload | Trigger | Frequency | Sensitive? | Ready for public use | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `onStateChange` (form) | `CardFormState` | effect on `(cardNumber, expiry, cvc, brand)` change | every keystroke that changes a value | **no** — booleans + scheme name | yes | `HyperswitchVaultForm.res:443-452` via `CardFieldCore`'s `emitCardInfo` |
| `onStateChange` (provider) | `CardFormState` | form-value change **and** widget mount/unmount (`registryVersion`) | keystrokes + registry changes | **no** | yes | `HyperswitchVaultFormProvider.res:126-141` |
| `submit()` result | `VaultSubmitResult` | awaited return value, not a callback | once per submission | token + masked metadata | yes | `VaultFormCoordinator.res:250-270` |

**That is the complete merchant-facing event surface.** `onStateChange` is an **aggregate
form-state callback, not an event system**: it reports whether each field is currently valid, whether
the form is complete, and the detected scheme. It does not report *what happened*.

**Internal, not merchant-facing:**

| Name | Payload | Who receives it | Notes |
| --- | --- | --- | --- |
| `onAnalytics` | `{eventType: #focus \| #blur, field: string}` | **embedded only** — client-core's `LoggerHook` | The standalone form and the provider both pass a **no-op** (`HyperswitchVaultForm.res:442`, `HyperswitchVaultFormProvider.res:158`), so focus/blur telemetry does not exist for merchants |
| `emitCardInfo` | `PaymentEventData.cardInfo` (BIN, last4, expiry parts, validity flags) | **embedded only** — client-core's event emitter | opaque to TypeScript (`@genType.opaque`); the standalone form converts it into `CardFormState` and never forwards it |
| client-core logging | `SCAN_CARD` INFO/WARNING/ERROR, API events | client-core only | `CardElement.res:149-183` |

**Availability of the events a merchant might expect:**

| Event | Available today? |
| --- | --- |
| focus | **No** — computed internally, sunk to a no-op |
| blur | **No** — same |
| change (per field) | **No** — only the aggregate `onStateChange` |
| validation (per field) | **No** — only aggregate booleans |
| brand change | **Partially** — `CardFormState.brand` changes value, but there is no dedicated event |
| submit start | **No** — merchant knows because it called `submit()` |
| submit success | **No callback** — it is the resolved `status: 'success'` result |
| submit failure | **No callback** — resolved `status` of `validation_error` / `not_ready` / `error` |

**Planned but not implemented:** per-widget `onStateChange` events. ADR-0001 defers them and states
that the registry entries are the prepared observation points. Nothing per-widget is exposed today,
and the type-tests actively assert that a widget rejects an `onStateChange` prop
(`type-tests/consumer.tsx`).

---

## 7. End-to-end data flows

Legend: **raw card** = PAN/expiry/CVC; **auth** = `sdk_authorization`.

### 7.1 Embedded (client-core vaulting)

```text
merchant backend ──(session_tokens JSON incl. vault_details)──► client-core
                                                                  │ decodes vault_details
                                                                  │ VaultContext (auth held in JS memory)
client-core RequiredFields <Form> ──owns form state──┐
   raw card typed into package fields ──────────────►│ values live in client-core's RFF instance
                                                     │
CardVaultHook ──(auth + raw card + AbortSignal)─────►│ package /vault  ──POST /v1/payment-method-sessions/{id}/confirm──► Hyperswitch Vault
                                                     ◄──(PM token + masked metadata)──
client-core ──(payment_token, NO payment_method_data)──► POST /payments/confirm ──► Hyperswitch
```

| Boundary | Owner | Raw card crosses? | Auth crosses? |
| --- | --- | --- | --- |
| backend → app | client-core | no | **yes** (that is its purpose) |
| client-core → package `/embedded` | client-core owns the `<Form>`; values are in client-core's RFF instance | **yes**, in-process | no |
| client-core → package `/vault` | client-core passes `card` + `sdkAuthorization` | **yes**, in-process function call | **yes**, in-process |
| package → Vault | package | **yes**, over TLS | **yes**, `Authorization` header |
| app → merchant backend | client-core | **no** | no |

PMS confirm is called by **the package**; `payments/confirm` is called by **client-core**.

### 7.2 Standalone ready-made form

```text
merchant backend ──(session JSON)──► merchant app ──session prop──► HyperswitchVaultForm
                                                                       │ owns its own <Form>
                             raw card typed by the user ──────────────►│ stays inside the component
                                                                       │
                                    submit() ──► VaultConfirm ──POST .../confirm──► Vault
                                                                       ◄── PM token + masked metadata
merchant app ◄──{status:'success', token, card{last4Digits,…}}── HyperswitchVaultForm
merchant app ──token──► merchant backend ──► payment or PM-ID exchange
```

Raw card **never** crosses into merchant code. Auth crosses backend → app → component, and the
merchant never decodes it. `payments/confirm` is **not** called by the package at all.

### 7.3 Standalone custom widgets

Identical to 7.2 with one addition: the three widgets register into the provider's registry, and the
presence gate runs before values are read.

```text
HyperswitchVaultFormProvider (one <Form>, one registry, one machinery)
   ├── CardNumberWidget ─┐
   ├── CardExpiryWidget ─┼─ register(kind, controls) ─► registry (Map<int, entry>)
   └── CardCVCWidget ────┘
              │ values → provider's RFF instance only
   submit() → presenceGate → (exactly one of each?) → VaultConfirm → Vault → token
```

Merchant code between the widgets (their own `TextInput`s) is entirely separate state; the package
neither reads nor sends it.

### 7.4 Non-vault fallback (client-core, `vault_details` absent)

```text
session_tokens without vault_details ──► VaultConfiguration.resolve ──► NoVault
   ──► CardVaultHook returns NoVault, no PMS confirm, no network call
   ──► client-core POST /payments/confirm with payment_method_data.card (raw card to Hyperswitch)
```

This is the pre-vault behaviour, byte-preserved. Any *present-but-unusable* `vault_details` does
**not** reach this path — it fails closed with `VaultFailed` (§4, Phase 5 decision table).

---

## 8. Sensitive-data review

Implemented data-flow properties only; no compliance claim is made here.

| Value | Enters at | Stored in | Used by | Can it reach a callback / log / error / ref / public state? | Cleared when |
| --- | --- | --- | --- | --- | --- |
| **PAN** | `CardInput` `onChangeText` → `useCardNumberField.setText` | the owning react-final-form instance (package's own for standalone; client-core's for embedded); the field's `input.value` | formatting, brand detection, validation, `buildConfirmBody` | **No callback, log, error or public ref.** `onStateChange` carries booleans + scheme; `SafeVaultError` messages are fixed strings; no handle exposes a getter | `reset()` when idle; component unmount |
| **Expiry** | expiry `setText` | RFF month/year + a **widget-local** `expireDate` display string (`CardFieldUnits.res:262`) | validation, request body | no | `reset()` clears both (`clearLocal`); unmount |
| **CVC** | CVC `setText` | RFF value only | validation, request body | no | `reset()`; unmount |
| **`sdk_authorization`** | `session` prop (standalone) / `vault_details` decode (client-core) | component state / `VaultContext`; never persisted | `Authorization` header, session-id extraction | Not in any callback or result. **Decoded** in-process by `decodeBase64` to read the session id | replaced on new session; cleared by client-core on failed/null refresh (except the `Promise.catch` gap in §4) |
| **Payment Method Session ID** | derived from the decoded authorization | local `let` inside `confirmPaymentMethodSession` | URL path | Appears in the **request URL** only. Not returned to the merchant, not in `SafeVaultError` | function scope ends |
| **Payment-method token** | vault response | returned to caller | merchant backend (their responsibility) | **Yes — deliberately** in `{status:'success', token}` | caller's own state |
| **Masked card metadata** | vault response | returned to caller | display | **Yes — deliberately**: `last4Digits`, optional `binNumber`, `expiryMonth`, `expiryYear` | caller's own state |

**Verified negative properties.**

- `scripts/verify-result-mapping.mjs` executes the real compiled mapping and asserts no backend
  message and no card data reach a result, and that transport internals (`httpStatus`, `retryable`)
  do not surface — result keys must be exactly `error,status` or `card,status,token`.
- `customWidgets.test.tsx:282-290` serialises the result **and every emitted state** and asserts the
  PAN, the fake authorization and the session id are all absent.
- `vaultFormLifecycle.test.tsx:512` asserts the PAN is absent from a backend-failure result.
- The package logs nothing: no `console.*` call exists in `src/*.res` for these paths, and the
  duplicate-widget path was specifically designed to return a result rather than log
  (`customWidgets.test.tsx:347-349` asserts `console.error/warn/log` are never called).

**Two items a reviewer should check manually.**

1. `example-server/.env` **exists on disk** (untracked and gitignored). Its contents were **not
   inspected**; whether it holds live sandbox credentials is **unverified**. `.env.example` was
   checked and contains placeholders/empties only.
2. The example app deliberately renders the returned token on screen (both checkout screens) — it is
   labelled "demo only" in the code and README, and a production app must not do this.

---

## 9. Manual code-review guide

Review order is dependency-shallow first. Tick as you go.

### 1. Package exports

- [ ] **`package.json`** — why: the public surface is defined here, not by file names. Confirm:
      `exports` has exactly `.`, `./embedded`, `./vault`, `./package.json`; `files` ships only
      `dist/**` plus the three text files; **no runtime `dependencies`**; `react-final-form` and
      `final-form` are *optional* peers; `sideEffects: false`. → next: the entry files.
- [ ] **`src/standalone-entry.mjs`**, **`src/embedded-entry.mjs`**, **`src/vault-entry.mjs`** — why:
      these are the only runtime entries. Confirm each is a pure re-export with no logic, and that
      the root exports exactly five components. → next: `rollup.config.mjs`.

### 2. Public TypeScript types

- [ ] **`src/public.ts`** — why: the one hand-written facade over generated types. Confirm every
      `as unknown as` cast only re-attaches a ref type, and that no type is re-declared by hand.
      Invariant: casts must not widen or invent a shape. → next: the generated declarations.
- [ ] **`dist/types/public.d.ts`**, **`HyperswitchVaultForm.gen.d.ts`**,
      **`HyperswitchVaultFormProvider.gen.d.ts`**, **`VaultResult.gen.d.ts`** — why: this is what a
      merchant's `tsc` sees. Confirm the provider's `children` is `React.ReactNode`, the result
      union has four branches, `SafeVaultErrorCode` has five members, and no raw-value accessor
      exists anywhere. → next: `type-tests/`.
- [ ] **`type-tests/consumer.tsx`**, **`type-tests/vault-consumer.ts`** — why: the negative controls
      that stop the contract rotting. Confirm each `@ts-expect-error` still marks a real error.

### 3. Standalone component

- [ ] **`src/HyperswitchVaultForm.res`** (491) — why: the ready-made merchant API. Key symbols:
      `readSession` usage (`:342`), `buildTheme` (`:226`), `resolveLabels`/`resolveMessages`
      (`:282`/`:300`), the three validator factories (`:262-330`), `useImperativeHandle0`
      (`:378-397`). Invariants: exactly one `<Form>`; `submit`/`reset` come from the shared
      machinery; `onStateChange` receives booleans only. → next: `VaultFormCoordinator.res`.

### 4. Provider and widgets

- [ ] **`src/HyperswitchVaultFormProvider.res`** (292) — why: the custom-layout coordinator. Key:
      `requiredKinds` (`:44`), `presenceGate` (`:226-241`), the aggregate effect (`:126-141`),
      `Body` (`:55`). Invariants: presence gate runs before any value read; aggregate masks validity
      by registry counts; no co-badge state in context. → next: the three widgets.
- [ ] **`src/VaultWidgetContext.res`** (64) — why: it defines exactly what crosses to widgets.
      Invariant: **no card value, no RFF binding** in `contextValue` (`:18-34`); `useRequired`
      throws with an actionable message (`:42-49`).
- [ ] **`src/CardNumberWidget.res`**, **`CardExpiryWidget.res`**, **`CardCVCWidget.res`** — why: to
      confirm they are thin. Each should only call `useRequired`, call **one** field hook, attach a
      focus/blur ref, render `CardInput` + its own error. Invariant: no validation, formatting or
      registration logic of their own.

### 5. Shared card-field core

- [ ] **`src/CardFieldUnits.res`** (438) — why: the single implementation of every field behaviour.
      Key: `widgetKind` (`:37`), `coordination` (`:55`), `useCoordination` (`:85`),
      `useCardNumberField` (`:173`), `useCardExpiryField` (`:274`), `useCardCvcField` (`:368`).
      Invariants: registry keyed by unique id (StrictMode safety); `clearDependents` writes by field
      name; the CVC `deadRef` preserves defect **D4** on purpose. → next: `CardFieldCore.res`.
- [ ] **`src/CardFieldCore.res`** (183) — why: the form-owner composition. Invariant: it *composes*
      the units and adds no second implementation; the returned record is what `CardFormView` reads.
- [ ] **`src/CardFormView.res`** (388) — why: layout + the fused-layout error priority chain
      (`:359-377`). Invariant: layout only; every handler comes from `CardFieldCore.use`. **This is
      where the deliberate predicate duplication lives** — compare `:208`/`:267`/`:342-348` against
      `CardFieldUnits`' `visibleError`. → next: `CardInput.res`.
- [ ] **`src/CardInput.res`** (239) and the four replicas (`CardAnimatedValue`, `CardPressable`,
      `CardRenderIf`, `CardTestIds`) — why: to confirm the portability closure. Invariant: no
      client-core import anywhere in `src/`.

### 6. Validation and presentation

- [ ] **`shared-code/sdk-utils/validation/Validation.res`** (submodule, pinned) — why: Luhn, scheme
      patterns, expiry/CVC rules live here and are *not* reimplemented. Invariant: the package calls
      `cardValid`/`checkCardExpiry`/`checkCardCVC`/`formatCardNumber` and never `validateField`.
- [ ] **`src/CardIcons.res`** (262) — why: brand artwork + four modes. Invariants: closed
      `detectedScheme` variant; `#animated` has scale but no rotation. **Note the stale header
      comment** claiming animated is not implemented.

### 7. Vault transport

- [ ] **`src/VaultConfirm.res`** (601) — why: the only network call. Key: `resolveSessionId`
      (`:244`), `validateCard` (`:311`), `vaultBaseUrl` (`:335`), `buildConfirmBody` (`:353`),
      `decodeConfirmResponse` (`:390`), `describeHttpFailure` (`:442`),
      `confirmPaymentMethodSession` (`:503`). Invariants: validation before fetch; exactly two
      headers; PAN space-stripped; **no automatic retry**; a thrown fetch is `#unknown_outcome`;
      no `raise`/`throw` anywhere. → next: `VaultResult.res`.
- [ ] **`src/VaultResult.res`** (120) — why: transport → merchant-safe mapping. Invariant: seven
      transport codes → five public codes, fixed message strings, no backend text echoed.
- [ ] **`src/VaultFormCoordinator.res`** (294) — why: one submission lifecycle for both public
      components. Key: `useMachinery` (`:107`), in-flight promise sharing (`:250-270`), tagged abort
      (`:219`), supersession effect (`:181-190`), guarded `reset` (`:277-284`).

### 8. Client-core session parsing

- [ ] **`client-core/src/types/AllApiDataTypes/SessionsType.res:123-159`** — invariant: one snapshot
      decodes both tokens and vault details.
- [ ] **`client-core/src/contexts/VaultContext.res`** — invariant: read-only, default `None`.
- [ ] **`client-core/src/utility/logics/VaultConfiguration.res:44-63`** — invariant: **only absent
      `vault_details` yields `NoVault`**; every present-but-unusable shape fails closed. Check the
      untrimmed-authorization observation in §4.
- [ ] **`client-core/src/routes/NavigationRouter.res:83-103`** and
      **`UpdateIntentHook.res:129-155`** — invariant: vault details are cleared on failed/null
      refresh. **Check the `Promise.catch` gap at `UpdateIntentHook.res:222-240`.**

### 9. Client-core payment confirmation

- [ ] **`client-core/src/hooks/CardVaultHook.res`** — key: `vaultSubmitOutcome` (`:12`), in-flight
      ref (`:81`), unmount abort (`:85-94`), the library call (`:128`). **Check the unguarded
      `await`.**
- [ ] **`client-core/src/components/dynamic/CardElement.res`** — invariant: the outer component runs
      **no hooks**; all contexts live in `Host`; nineteen resolved props cross to `/embedded`.
- [ ] **`client-core/src/utility/logics/PaymentUtils.res:57-64`** — invariant: acceptance gate is
      `(payment_token->Option.isNone || isFreshVaultToken) && …`; saved cards stay suppressed.
- [ ] **`PaymentMethod.res:255-278`** and **`DynamicComponent.res:215-238`** — invariant: identical
      four-case switches; `payment_method_data` omitted when a token exists.

### 10. Build and packaging

- [ ] **`rollup.config.mjs`** — invariant: two configurations; `react-final-form` external for
      `/embedded`, bundled for the root; both formats emit `.js`.
- [ ] **`rescript.json`**, **`tsconfig.build.json`**, **`tsconfig.consumer.json`** — invariant:
      genType configured; consumer types compiled under the stock RN config.
- [ ] **`scripts/`** (12) — invariant: `check-submodule`, `verify-icon-coverage`, `check-generated`
      run inside `build`/`prepack`; `verify-*` do **not** — they are a separate `yarn verify` gate.
      Confirm you are comfortable with that split before publishing.

---

## 10. Current completion boundary

### Completed — proven by current code and builds

- Portable card form with **zero client-core imports**, consumed by client-core through
  `/embedded`, and by merchants through the root entry.
- **Ready-made** `HyperswitchVaultForm` — session parsing, appearance, localisation, RTL,
  `splitCardFields`, `disabled`, `accessible`, aggregate `onStateChange`, ref handle.
- **Custom-layout** `HyperswitchVaultFormProvider` + three widgets + `WidgetHandle`, with
  registry-backed presence gating, registry-aware aggregate state, per-widget errors, and
  layout-independent focus.
- **Vault transport** with base64 session-id extraction, pre-fetch validation, two-header request,
  4-digit expiry normalisation, sanitised errors, abort/timeout and `unknown_outcome` semantics.
- **client-core integration** — fail-closed `vault_details` resolution, one shared submit hook,
  token substitution into `payments/confirm`, `customer_acceptance` preserved for fresh vault
  tokens, session-refresh clearing on failed/null responses.
- **Packaging** — three entries, ESM+CJS+types, 30 packaged PNGs, no runtime dependencies, RFF
  identity handled per entry.
- **Verification** — `build:clean` and `verify` (4 gates) pass; 36 example jest tests and the
  example `tsc --noEmit` pass (re-run while writing this document, after the latest example edits);
  consumer type-tests pass; a packed-tarball install into client-core passes `re:check` and
  `build:web`. The §3 examples in this document were compiled against `dist/types` under
  `tsconfig.consumer.json` as a check and the temporary file was deleted.

### Parked — verified current state

| Item | Current state in code |
| --- | --- |
| **Scan card** | The **capability injection exists** (`CardFormTypes.scanCardCapability`, `CardScanTrigger.res`) and is used by the embedded path only — client-core supplies the native module. There is **no `/scan-card` entry**, no adapter, no camera asset. Verified: `scancard`/`ScanCard` appear **0 times** in `dist/esm/index.js`. |
| **Co-badge selection** | The package **computes** scheme state and hands it to `renderSchemeAccessory`; client-core renders the picker. Widgets **discard** it (`CardNumberWidget.res:22`). Verified: `buildConfirmBody` sends no `card_network` field, so a selection has no effect on the vault request. |
| **Saved-card vaulting / update** | **Not implemented** — no listing, selection, CVC-for-saved-card or update API exists in any entry. |
| **Merchant events** | **Not implemented** beyond aggregate `onStateChange` (§6). Type-tests assert widgets reject event props. |
| **Animated icon mode** | **Completed, not parked** — implemented at `CardIcons.res:128-142` and covered by `brandIcon.test.tsx`. Only the file's header comment is stale. |

### Known limitations

1. **No device run for the widget work.** Checkpoint 1 had a device pass; **Checkpoint 2 has
   build/bundle/jest/type evidence only.** `docs/manual-device-checklist.md` does not yet cover the
   widget screen.
2. **Nothing is committed or published.** The library has 0 commits; client-core depends on it via
   `file:../react-native-hyperswitch-vault`, which contradicts the binding file's own stated
   contract and must become a version range.
3. **Package size.** The card UI is compiled into both root (208 KB ESM) and `/embedded` (55 KB
   ESM) by design; `/embedded` grew ~5.4 KB when the shared field units landed.
4. **Generated/manual facade.** `src/public.ts` re-attaches ref types with `as unknown as` casts.
   The casts are checked by `type-tests/consumer.tsx`, but a wrong cast would compile.
5. **Predicate duplication** (§5 category 2) is unguarded by any build gate.
6. **`verify` does not run on publish.** `prepack` is byte-identical to `build`, so tarball,
   consumer-fixture and result-mapping checks must be run deliberately.
7. **Two client-core robustness gaps** — the `UpdateIntentHook` catch path that does not clear vault
   details, and the unguarded `await` in `CardVaultHook` (not reachable today).
8. **Compatibility windows are narrow** — `react >=19 <20`, `react-native >=0.79 <0.80`. RN 0.80+
   consumers are excluded by the peer range.
9. **Untracked artefacts.** The Phase 0 behaviour contract and `example-server/.env` exist only
   locally; the latter's contents were not inspected.
10. **Example app drift.** `example/src/CustomLayoutCheckout.tsx` currently renders the three
    widgets with its `<Section>` wrappers commented out and the number-plate `TextInput` unrendered
    (`plate` state and `styles.input` are now unused), while its header comment still describes the
    merchant field. *example-only; no library impact.*

### Next recommended phase — not implemented here

**Run the manual device checklist for the widget path on both platforms, and extend the checklist to
cover it.** No code change; it is the smallest step that materially raises confidence, because it is
the one class of evidence entirely missing for Checkpoint 2 — every claim about focus, keyboard
behaviour, icon rendering and real vault round-trips in widget mode currently rests on jest and
bundle analysis. It would also settle whether the known widget-remount behaviour (a re-mounted
expiry widget shows an empty field while the form still reports it valid, because the display string
is widget-local while the RFF value survives) matters in practice.

Only after that would I sequence: (a) the two client-core robustness gaps, (b) publishing mechanics
(commit, version range, `verify` in `prepack`).
