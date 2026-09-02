# Host API reference — the `./host` entry

The API of `@juspay-tech/react-native-hyperswitch-vault/host`, written for the one consumer it is
delivered to: `@juspay-tech/react-native-hyperswitch-payment-methods`, which drives the card form on
behalf of hyperswitch-client-core. Merchants do not import this entry; their reference is
[merchant-api-reference.md](merchant-api-reference.md), and ADR-0010 records why the two are
separate.

```text
client-core  →  payment-methods  →  @juspay-tech/react-native-hyperswitch-vault/host
                                    @juspay-tech/react-native-hyperswitch-vault/orchestration
```

Everything here is taken from the published declarations in `dist/types/host.d.ts`. If this document
and the declarations disagree, the declarations win.

---

## 1. Same objects, wider types

`./host` exports five runtime values, and every one of them **is** the root's object:

```ts
import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardholderNameField,
} from '@juspay-tech/react-native-hyperswitch-vault/host';
```

`dist/esm/host.js` is a single re-export line over `dist/esm/index.js`; `verify-consumers` asserts
`host.CardNumberField === root.CardNumberField` against the packed tarball. There is one React
context in the app whichever entry a component came from. What differs is the type surface:

| | root (merchant) | `./host` (checkout SDK) |
| --- | --- | --- |
| handle | `VaultFormHandle` = `tokenize`, `reset`, `focus` | `HostFormHandle` = the same **plus `confirmPayment`** |
| provider props | no `eligibility`; `cardholderName: 'collect' \| 'omit'` | the generated props in full |
| `SafeVaultErrorCode` | the six codes `tokenize()` can return | all eight |
| `VaultFormState`, `VaultCardNumberState` | without `eligibility` | with `eligibility` |
| `VaultFormValidationMessages` | without `cardNotEligible` | with it |
| confirm-input, result, next-action types | absent | present |

Not exported here: the ready-made `HyperswitchVaultForm`, the `HyperswitchVault` namespace and the
legacy `*Widget` spellings. The checkout SDK composes fields; it has never rendered those.

---

## 2. `HostFormHandle`

```ts
type HostFormHandle = {
  tokenize(): Promise<VaultTokenizeResult>;
  confirmPayment(input: VaultPaymentConfirmInput): Promise<VaultPaymentResult>;
  reset(): void;
  focus(field: 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName'): void;
};
```

| Method | Returns | Notes |
| --- | --- | --- |
| `tokenize()` | a token, or an error | Identical to the root's. Needs the `session` prop |
| `confirmPayment(input)` | a payment outcome | Flows 2 and 3. **Never a token, in any branch** |
| `reset()` | — | No-op while either operation is in flight |
| `focus(field)` | — | |

The two operations share one in-flight slot: `tokenize()` during a `confirmPayment()` (or the
reverse) answers `not_ready` with *"Another card operation is already in progress."* Calling the
same operation twice returns the same promise.

---

## 3. Provider props

The generated `HyperswitchVaultFormProviderProps`, in full. The rows the root does not have are
marked **host**.

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `environment` | `'production' \| 'sandbox' \| 'integration'` | yes | — | Selects the vault host; also decides whether an `http` loopback `vaultEndpoint` is tolerated |
| `session` | `MerchantSession` | for `tokenize()` and vault confirms | absent | The session-tokens body, verbatim; `vault_type` must be `'hyperswitch'` |
| `children` | `ReactNode` | yes | — | The fields, placed by the host |
| `appearance` | `VaultFormAppearance` | no | library theme | |
| `localisation` | `VaultFormLocalisation` | no | English | Includes `validationMessages.cardNotEligible` **host** |
| `cardholderName` | `'collect' \| 'external' \| 'omit'` | no | `'collect'` | `'external'` is **host**: the value arrives on the confirm input |
| `enabledCardSchemes` | `string[]` | no | `[]` | Exact sdk-utils names |
| `eligibility` | `VaultEligibilityConfig` | no | absent | **host.** Runs the eligibility probe as the customer finishes the number. §7 |
| `vaultEndpoint` | `{baseUrl: string}` | no | the `environment` host | Overrides the tokenization host |
| `disabled` | `boolean` | no | `false` | |
| `accessible` | `boolean` | no | platform default | |
| `unstyled` | `boolean` | no | `false` | |
| `onFormStateChange` | `(state: VaultFormState) => void` | no | absent | The snapshot carries `eligibility` here |
| `ref` | `HostFormHandle` | — | — | |

Field props are the root's, unchanged: see the merchant reference §4. The card-number field's
`onStateChange` snapshot carries `eligibility` on this entry.

---

## 4. `confirmPayment(input)`

Confirms a **payment intent** using the card in the fields, running every request inside the
library, and resolves to a navigation decision. It does not return a token; the token minted in the
vault flow stays internal.

```ts
type VaultPaymentConfirmInput = {
  readonly cardSource: VaultPaymentCardSource;                    // required, no default
  readonly paymentId: string;                                      // required
  readonly sdkAuthorization?: string;     // payment-intent credential — wins when non-blank
  readonly publishableKey?: string;       // legacy credential, with clientSecret (ADR-0009)
  readonly clientSecret?: string;
  readonly cardholderName?: string;       // only in 'external' mode
  readonly paymentMethodType?: 'credit' | 'debit';                 // wire default 'credit'
  readonly paymentMethodData?: VaultHostPaymentMethodData;         // {billing?, nickName?}
  readonly customerAcceptance?: VaultHostCustomerAcceptance;
  readonly browserInfo?: VaultHostBrowserInfo;
  readonly returnUrl?: string;
  readonly paymentType?: 'new_mandate' | 'setup_mandate';
  readonly email?: string;
  readonly eligibilityRequired?: boolean;
  readonly appId?: string;                // x-app-id header
  readonly endpoint?: {baseUrl: string};       // payment host
  readonly vaultEndpoint?: {baseUrl: string};  // tokenization host (vault source)
};

type VaultPaymentCardSource =
  | {readonly type_: 'vault'; readonly session: MerchantSession; readonly confirmTokenMode?: 'payment_token' | 'vault_card'}
  | {readonly type_: 'direct'};
```

### Which flow

| `cardSource` | Flow | Requests | Requires |
| --- | --- | --- | --- |
| `{type_: 'vault', session}` | 2 — tokenize, then confirm | payment-method-session confirm, then payments confirm | a usable session; the host's `vaulting_action` is `tokenize` |
| `{type_: 'direct'}` | 3 — confirm with the card values | payments confirm | the provider mounted **without** a `session` |

`confirmTokenMode` decides how the vault token is presented on the final confirm: `'payment_token'`
(default) sends it as `payment_token`; `'vault_card'` sends it under `payment_method_data.vault_card`.

### Gate order

Each gate answers before any request opens:

1. Required fields mounted exactly once → else `not_ready`.
2. No other operation in flight → else `not_ready`.
3. `cardSource` well-formed: a direct source carrying `session` or `confirmTokenMode`, or a vault
   source without `session` → `unsupported_configuration` / `invalid_session`.
4. **A provider mounted with a usable `session` refuses `{type_: 'direct'}`** with
   `unsupported_configuration`. A form declared as vaulting is never silently downgraded.
5. `cardholderName` on the input in `'collect'` or `'omit'` mode → `unsupported_configuration`.
6. Any card-shaped key anywhere inside `paymentMethodData` → `forbidden_card_data` (deep scan; the
   type already forbids it, the runtime re-checks).
7. Credential present: `sdkAuthorization`, or both `publishableKey` and `clientSecret` → else
   `invalid_session`.
8. Every field valid → else `validation_error`.
9. `endpoint` / `vaultEndpoint`, if given, valid → else `unsupported_configuration`.
10. `eligibilityRequired: true` → the eligibility check runs with the PAN the library holds; a denial
    is `failed / card_not_eligible`. A transport failure resolves to *allowed*, reproducing the
    client-core contract (the backend still refuses at confirm time).
11. Vault source: the payment-method-session confirm. Its token is cached per card and session; a
    retry after a failed final confirm re-runs only the final confirm.
12. The payments confirm.

### Result

```ts
type VaultPaymentResult =
  | {readonly status: 'succeeded'}
  | {readonly status: 'processing'}
  | {readonly status: 'requires_customer_action'; readonly nextAction: VaultNextAction}
  | {readonly status: 'failed';           readonly error: SafeVaultError}
  | {readonly status: 'validation_error'; readonly error: SafeVaultError}
  | {readonly status: 'not_ready';        readonly error: SafeVaultError};

type VaultNextAction = {
  readonly type_: 'three_ds_invoke' | 'third_party_sdk_session_token' | 'display_bank_transfer_information' | 'invoke_ddc' | 'redirect_to_url';
  readonly redirectUrl?: string;
  readonly threeDs?: VaultThreeDsData;        // authenticationUrl, pollId, …
  readonly ddc?: VaultDdcData;                // iframeUrl, timeoutMs, …
  readonly sessionToken?: VaultSessionTokenData;
};
```

`unknown_outcome` on this call means a payment **may** have been processed; the host reconciles from
its backend before letting the customer retry.

### Error codes

```ts
type SafeVaultErrorCode =
  | 'invalid_session' | 'invalid_card_data' | 'not_ready' | 'forbidden_card_data'
  | 'unsupported_configuration' | 'card_not_eligible' | 'server_error' | 'unknown_outcome';
```

`error.message` is one of the library's own fixed English strings; it is never backend prose and it
is not localisable through `localisation`. The merchant reference §6 lists the six tokenize strings;
the two confirm-only codes carry *"Card details cannot be supplied by the host."*
(`forbidden_card_data`) and *"This card is not accepted for this payment."* (`card_not_eligible`).

---

## 5. Non-card host data

```ts
type VaultHostPaymentMethodData = {readonly billing?: VaultHostBilling; readonly nickName?: string};
type VaultHostBilling = {readonly address?: VaultHostBillingAddress; readonly email?: string; readonly phone?: VaultHostPhone};
type VaultHostBillingAddress = {firstName?, lastName?, line1?, line2?, line3?, city?, state?, country?, zip?};  // all string
type VaultHostPhone = {readonly number?: string; readonly countryCode?: string};
type VaultHostCustomerAcceptance = {readonly acceptanceType: 'online' | 'offline'; readonly acceptedAt: string; readonly online: {readonly userAgent?: string}};
type VaultHostBrowserInfo = {userAgent?, acceptHeader?, language?, colorDepth?, screenHeight?, screenWidth?, timeZone?, javaEnabled?, javaScriptEnabled?, deviceModel?, osType?, osVersion?};
```

Every type is closed. A card key cannot be expressed in TypeScript, and the runtime deep-scans the
object anyway and answers `forbidden_card_data`.

---

## 6. Cardholder name — three modes

| Mode | Field rendered by | Value sent | `cardholderName` on the input |
| --- | --- | --- | --- |
| `'collect'` (default) | the library, if the host places `<CardholderNameField />` | what was typed, when non-blank | refused: `unsupported_configuration` |
| `'external'` | the host, in its own UI | `input.cardholderName`, when non-blank | accepted; may be omitted |
| `'omit'` | nobody | nothing | refused: `unsupported_configuration` |

---

## 7. Eligibility

```ts
type VaultEligibilityConfig = {
  readonly paymentId: string;
  readonly sdkAuthorization?: string;   // or the legacy pair below
  readonly publishableKey?: string;
  readonly clientSecret?: string;
  readonly appId?: string;
  readonly endpoint?: {baseUrl: string};
};
```

With the `eligibility` prop, the library probes `/payments/{id}/eligibility` with the PAN it holds
when the number completes, and reports the verdict on `state.eligibility` and
`state.fields.cardNumber.eligibility` as `'unknown' | 'pending' | 'allowed' | 'denied'`. A denial
paints `validationMessages.cardNotEligible` on the card-number field. Without a complete credential
the probe does not run.

`canSubmit` deliberately does **not** consult the verdict: a denial is the backend's judgement on a
correctly typed card, not something the customer can fix by retyping. `confirmPayment()` with
`eligibilityRequired: true` enforces it.

---

## 8. What is shared with the root

Re-exported from `./host` so payment-methods needs no second import: `VaultField`,
`VaultTokenizeResult`, `VaultTokenizeStatus`, `VaultFieldHandle`, `WidgetHandle`, every style and
option type, `VaultFormAppearance`, `VaultFormLabels`, `VaultEnvironment`, `VaultEndpointConfig`,
`MerchantSession`, `VaultCardBrand`, `VaultFieldStatus`, `VaultFieldErrorCode`, `VaultFieldError`,
`VaultSessionStatus`, `VaultExpiryState`, `VaultCVCState`, `VaultCardholderNameState`.

---

## 9. The `./orchestration` entry

For a card tokenized by an **external** provider (VGS today), payment-methods parses the provider's
response into a `ProviderTokenizedCard` and calls `confirmTokenizedCardPayment(input)` from
`@juspay-tech/react-native-hyperswitch-vault/orchestration`. It resolves to the same
`VaultPaymentResult` as `confirmPayment()`; the result types are re-published there from `./host`.
See ADR-0007.

---

## 10. Verification

| Claim | Gate |
| --- | --- |
| `./host` values are the root's objects (`===`) | `scripts/verify-consumers.mjs` |
| `host-entry.mjs` is a pure re-export; every host value is a root value | `scripts/verify-public-surface.mjs` |
| The root names none of the host vocabulary | `verify-public-surface`, `verify-merchant-only`, `verify-publishable` |
| The payment result has no token in any branch | `verify-merchant-only`, `verify-publishable`, `verify-result-mapping` |
| The card-source union matches the ReScript record | `scripts/verify-card-source.mjs` |
| The confirm input rejects card keys | `type-tests/host.tsx`, `scripts/verify-noncard-input.mjs` |
| Eligibility reproduces the client-core contract | `scripts/verify-eligibility.mjs` |
