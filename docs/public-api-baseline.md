# Public API baseline

The complete published surface of `@juspay-tech/react-native-hyperswitch-vault`, as of ADR-0003.

This is the inventory. [control-surface.md](control-surface.md) explains what you can and cannot do
with it; [app-integration.md](app-integration.md) shows the three flows in use.

---

## 1. Entry points

```
.                 → dist/esm/index.js | dist/cjs/index.js | dist/types/public.d.ts
./package.json    → package.json
```

Those two subpaths are the entire export map. There is no `/vault`, no `/embedded`, and no deep
import — `verify-package-contents.mjs` and `verify-publishable.mjs` fail the build if one appears.

---

## 2. Value exports

| Export | Kind |
|---|---|
| `HyperswitchVaultForm` | ready-made form component |
| `HyperswitchVaultFormProvider` | provider for a custom layout |
| `CardNumberField` / `CardNumberWidget` | field component (same object) |
| `CardExpiryField` / `CardExpiryWidget` | field component (same object) |
| `CardCVCField` / `CardCVCWidget` | field component (same object) |
| `CardholderNameField` / `CardholderNameWidget` | field component (same object) |
| `HyperswitchVault` | namespace: `CardForm`, `Form`, `CardNumber`, `Expiry`, `CVC`, `CardholderName` |

Eleven value exports. The `*Field` and `*Widget` spellings are the same component objects, and every
namespace member is identity-equal to its canonical export — `verify-consumers.mjs` asserts both
against the packed tarball.

---

## 3. Operations

```ts
type VaultFormHandle = {
  tokenize(): Promise<VaultTokenizeResult>;
  confirmPayment(input: VaultPaymentConfirmInput): Promise<VaultPaymentResult>;
  reset(): void;
  focus(field: VaultField): void;
};

type VaultFieldHandle = {focus(): void; blur(): void};

type VaultField = 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName';
```

Two operations, deliberately separate. `tokenize()` yields a token; `confirmPayment()` performs the
payment and yields navigation. Neither throws for a documented outcome.

`confirmPayment()` serves BOTH client-core flows; `cardSource` chooses which. That is why there are
two operations and not three: tokenizing before a payment is a property of the request, while
tokenizing INSTEAD of a payment is a different job with a different result type.

---

## 4. Results

```ts
type SafeVaultErrorCode =
  | 'invalid_session' | 'invalid_card_data' | 'not_ready'
  | 'forbidden_card_data' | 'unsupported_configuration'
  | 'card_not_eligible'
  | 'server_error' | 'unknown_outcome';

type SafeVaultError = {code: SafeVaultErrorCode; message: string};

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

The status vocabularies differ on purpose (`success`/`error` versus `succeeded`/`failed`), so a
comparison copied from one flow into the other is a compile error rather than a branch that silently
never runs.

`message` is always library-owned, customer-safe text. A backend error string is never forwarded.

### Navigation payloads

```ts
type VaultNextActionType =
  | 'three_ds_invoke' | 'third_party_sdk_session_token'
  | 'display_bank_transfer_information' | 'invoke_ddc' | 'redirect_to_url';

type VaultNextAction = {
  type_: VaultNextActionType;
  redirectUrl?: string;
  threeDs?: VaultThreeDsData;       // authenticationUrl, authorizeUrl, messageVersion,
                                    // directoryServerId, pollId, delayInSecs, frequency
  ddc?: VaultDdcData;               // iframeUrl, timeoutMs
  sessionToken?: VaultSessionTokenData;  // walletName, openBankingSessionToken
};
```

Allowlisted navigation fields only. A confirm response's `payment_method_data.card` is never read
into these records.

---

## 5. Confirm input (Flows 2 and 3)

```ts
/* Which card credential the confirm carries. Required; there is no default. */
type VaultPaymentCardSource =
  | {type_: 'vault'; session: MerchantSession; confirmTokenMode?: 'payment_token' | 'vault_card'}
  | {type_: 'direct'};

/* Where the cardholder name comes from. See `cardholderName` on the confirm input. */
type VaultCardholderNameMode = 'collect' | 'external' | 'omit';

type VaultPaymentConfirmInput = {
  cardSource: VaultPaymentCardSource;
  paymentId: string;
  sdkAuthorization: string;            // the PAYMENT-INTENT credential
  cardholderName?: string;             // 'external' mode ONLY — the one card value a host may pass
  paymentMethodType?: 'credit' | 'debit';
  paymentMethodData?: VaultHostPaymentMethodData;
  customerAcceptance?: VaultHostCustomerAcceptance;
  browserInfo?: VaultHostBrowserInfo;
  returnUrl?: string;
  paymentType?: 'new_mandate' | 'setup_mandate';
  email?: string;
  eligibilityRequired?: boolean;
  appId?: string;
  endpoint?: VaultEndpointConfig;
};

/* Optional, non-card. Lets the library run the eligibility check AS THE CUSTOMER TYPES. */
type VaultEligibilityConfig = {
  paymentId: string;
  sdkAuthorization: string;
  appId?: string;
  endpoint?: VaultEndpointConfig;
};

type VaultHostPaymentMethodData = {
  billing?: {
    address?: {firstName?, lastName?, line1?, line2?, line3?, city?, state?, country?, zip?};
    email?: string;
    phone?: {number?: string; countryCode?: string};
  };
  nickName?: string;
};
```

Every union is closed. `VaultHostPaymentMethodData` names exactly two members and has no index
signature, so a card field cannot be expressed — and is additionally rejected at runtime, at any
depth, with `forbidden_card_data`.

`cardSource` is closed in both directions: the direct member declares no `session` and no
`confirmTokenMode`, so a mixed source is unwritable in TypeScript and rejected at runtime with
`unsupported_configuration`. `verify-card-source.mjs` asserts both halves.

`cardholderName` is the single explicitly permitted card value crossing INTO the library, and only
in `'external'` mode — where the host owns the field and its validation. It is a member of its own
rather than something inside `paymentMethodData` precisely so that it is one named, auditable
exception instead of a hole in a general-purpose object. Supplying it in `'collect'` or `'omit'` is
`unsupported_configuration`, with no request. The library never sends it back out.

Public fields are camelCase; the library encodes each one to its snake_case backend key by name. The
host object is never forwarded as-is.

---

## 6. Presentation types

`VaultFormAppearance`, `VaultFormLocalisation`, `VaultFormLabels`, `VaultFormValidationMessages`,
`VaultFormLayout` (`stacked | inline`), `VaultFieldArrangement` (`separate | fused`),
`VaultLabelBehavior` (`none | static | floating`), `VaultErrorDisplay` (`none | inline`),
`VaultBrandIconMode` (`standard | animated | hidden | hideGeneric`), `VaultCVCIconDisplay`
(`none | default`), `VaultEnvironment` (`production | sandbox | integration`).

Options: `VaultFieldOptions`, `VaultCardNumberOptions`, `VaultExpiryOptions`, `VaultCVCOptions`,
`VaultCardholderNameOptions`, `VaultFormFieldOptions`.

Styles: `VaultFieldStyles`, `VaultCardNumberStyles`, `VaultExpiryStyles`, `VaultCVCStyles`,
`VaultFormFieldStyles`.

Session: `MerchantSession`.

---

## 7. Not published

Named explicitly so their absence is checkable rather than assumed:

- **State emission — all removed in ADR-0003, gated by `verify-event-surface.mjs`.**
  Removed: `onStateChange`, `onFormStateChange`, `CardFormState`, `VaultFormState`.
  Removed: `VaultFieldState`, `VaultFormFields`, `VaultFieldStatus`, `VaultFieldError`.
  Removed: `VaultFieldErrorCode`, `VaultSessionStatus`, `CardBrand`.
  Removed: `canSubmit`, `fieldsReady`, `complete`. None of these exists.
- **Controlled inputs.** `value`, `defaultValue`, `onChange`, `onChangeText` on any field.
- **Value accessors.** Nothing reads the PAN, expiry, CVC or cardholder name.
- **The transports.** `confirmPaymentMethodSession`, `confirmPayment` (internal), `cardDetails`,
  `confirmRequest`, `confirmOutcome`, `vaultConfirmResult`, `vaultCardMetadata`.
- **The intermediate token in Flow 2.** `VaultPaymentResult` has no `token` member.
- **A `submit()` operation.** Replaced by the two explicit operations above.
- **A top-level `confirmTokenMode`.** It moved inside the vault card source, where it means
  something; at the top level it was settable on a confirm that mints nothing.
- **Host-owned card entry when vaulting is off.** There is no configuration in which the library
  renders no card fields but still participates: Flow 3 is a different REQUEST, not a different
  owner.

---

## 8. Compatibility

| Peer | Range |
|---|---|
| `react` | `>=19.0.0 <20.0.0` |
| `react-native` | `>=0.79.0 <0.88.0` |

Every minor in that range is tested against the packed tarball — TypeScript consumer, a real Jest
render, and Metro bundles for both platforms — by `scripts/verify-rn-matrix.mjs`: 0.79, 0.80, 0.81,
0.82, 0.83, 0.84, 0.85, 0.86 and 0.87.

No runtime dependencies. React and React Native are peers and are never bundled.

`@juspay-tech/react-native-hyperswitch-scancard` is an OPTIONAL peer in the loosest sense: it is not
declared as a dependency at all, and the library resolves it with a guarded `require`. A consumer
that does not install it bundles and runs normally, with no scan button —
`scripts/verify-scancard-packaging.mjs` builds a real consumer both ways to prove it.
