# Field props reference — composed layout

Every prop a merchant can pass when placing the card fields themselves, and how to pass it.

This document covers the **composed layout** only: `HyperswitchVaultFormProvider` wrapping the four
field components. The ready-made `HyperswitchVaultForm` is deliberately out of scope, so the
form-only props (`layout`, `fieldArrangement`, `fieldOptions`, `fieldStyles`) do not appear here —
in a composed layout you set those things on each field directly.

---

## Contents

1. [The shape](#1-the-shape)
2. [Provider props](#2-provider-props)
3. [Field props — common to all four](#3-field-props--common-to-all-four)
4. [Field-specific props](#4-field-specific-props)
5. [Per-field defaults](#5-per-field-defaults)
6. [styles — the slots](#6-styles--the-slots)
7. [appearance](#7-appearance)
8. [localisation](#8-localisation)
9. [Which wins: precedence](#9-which-wins-precedence)
10. [onStateChange — per field](#10-onstatechange--per-field)
11. [onFormStateChange — the whole form](#11-onformstatechange--the-whole-form)
12. [Refs](#12-refs)
13. [Everything together](#13-everything-together)

---

## 1. The shape

The provider renders nothing itself. It supplies context; you place the fields wherever you want,
interleaved with your own inputs, in any order.

```tsx
import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  CardholderNameField,
} from '@juspay-tech/react-native-hyperswitch-vault';

<HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
  <CardNumberField />
  <View style={{flexDirection: 'row', gap: 12}}>
    <CardExpiryField />
    <CardCVCField />
  </View>
  {/* your own inputs can sit anywhere among them */}
</HyperswitchVaultFormProvider>
```

All four fields are optional in a composed layout **except** that the card number, expiry and CVC
make up the presence gate. The cardholder name may be omitted entirely and `tokenize()` still
succeeds.

Each field is published under two names — `CardNumberField` and `CardNumberWidget` are the same
object (`===` holds at runtime). Pick one spelling and keep it.

---

## 2. Provider props

`HyperswitchVaultFormProvider` takes thirteen props. Two are required.

| Prop | Type | Required | What it does |
|---|---|---|---|
| `environment` | `'production' \| 'sandbox' \| 'integration'` | **yes** | Selects the vault host |
| `children` | `ReactNode` | **yes** | Your layout, containing the fields |
| `session` | `MerchantSession` | no | The response from your backend, verbatim. Absent = direct-confirm flow |
| `appearance` | `VaultFormAppearance` | no | Form-wide visual tokens — see §7 |
| `localisation` | `VaultFormLocalisation` | no | Labels, validation messages, RTL — see §8 |
| `cardholderName` | `'collect' \| 'omit'` | no | Whether the name field's value is sent |
| `enabledCardSchemes` | `string[]` | no | Candidate set for the co-badge chooser |
| `vaultEndpoint` | `{ baseUrl: string }` | no | Override the vault host |
| `disabled` | `boolean` | no | Disables every field at once |
| `accessible` | `boolean` | no | Marks the group accessible |
| `unstyled` | `boolean` | no | Strips chrome from every field — see §6 |
| `onFormStateChange` | `(s: VaultFormState) => void` | no | Live form state — see §11 |

### How to pass each

```tsx
<HyperswitchVaultFormProvider
  ref={formRef}

  environment="sandbox"
  session={session}

  appearance={{primaryColor: '#0B5FBF', borderRadius: 12, inputHeight: 56}}
  localisation={{labels: {cardNumberPlaceholder: 'Card number'}, isRtl: false}}

  cardholderName="collect"
  enabledCardSchemes={['visa', 'mastercard', 'cartesBancaires']}


  vaultEndpoint={{baseUrl: 'https://sandbox.hyperswitch.io'}}

  disabled={isBusy}
  accessible
  unstyled={false}

  onFormStateChange={s => setCanSubmit(s.canSubmit)}>
  {/* fields */}
</HyperswitchVaultFormProvider>
```

### cardholderName — the three modes

| Value | Renders a name field? | Sends a name? | Use when |
|---|---|---|---|
| `'collect'` | yes, the library's | yes, what was typed | You want the library to handle it |
| `'external'` | **no** | yes — you supply it on the confirm input | You already have your own name field |
| `'omit'` | **no** | **no** | There is no name to send |

`'external'` and `'omit'` look identical on screen and differ entirely in what is transmitted.
Passing a `cardholderName` value on the confirm input in any mode but `'external'` is refused with
`unsupported_configuration` — never resolved by precedence, because a host with two names has no way
to know which one was sent.

In `'collect'` mode you must still place `<CardholderNameField />` yourself; the provider renders
nothing on its own.

---

## 3. Field props — common to all four

Every field accepts these. In a composed layout you set them directly on the component.

| Prop | Type | Default | What it does |
|---|---|---|---|
| `placeholder` | `string` | per field, see §5 | Text shown while empty |
| `label` | `string` | per field, see §5 | The floating label |
| `labelBehavior` | `'none' \| 'static' \| 'floating'` | `'floating'` | How the label behaves. `'none'` hides it |
| `errorDisplay` | `'none' \| 'inline'` | `'inline'` | `'none'` = you draw errors yourself |
| `accessibilityLabel` | `string` | per field, see §5 | Screen-reader name |
| `accessibilityHint` | `string` | — | Screen-reader hint |
| `testID` | `string` | per field, see §5 | For your e2e tests |
| `unstyled` | `boolean` | `false` | Strips all chrome — see §6 |
| `styles` | `VaultFieldStyles` | — | Per-slot styling — see §6 |
| `onStateChange` | `(s) => void` | — | Live field state — see §10 |
| `ref` | `Ref<VaultFieldHandle>` | — | `{ focus() · blur() }` — see §12 |

```tsx
<CardNumberField
  placeholder="Card number"
  label="Card number"
  labelBehavior="floating"
  errorDisplay="inline"
  accessibilityLabel="Card number"
  accessibilityHint="Enter the 16 digits on the front of your card"
  testID="checkout-card-number"
  styles={{input: {fontSize: 17}}}
  onStateChange={s => setNumberValid(s.valid)}
  ref={cardNumberRef}
/>
```

Setting `labelBehavior="none"` removes the floating label but keeps the placeholder. If you want
neither, set `placeholder=""` as well.

---

## 4. Field-specific props

Two fields take one extra prop each. The expiry and cardholder name take none.

### CardNumberField — `brandIconMode`

Controls the card-scheme mark inside the field.

| Value | Effect |
|---|---|
| `'standard'` | Static brand mark (the default) |
| `'animated'` | Brand mark animates on change |
| `'hidden'` | No mark at all |
| `'hideGeneric'` | Mark shown only once a scheme is detected — nothing while unknown |

```tsx
<CardNumberField brandIconMode="hideGeneric" />
```

### CardCVCField — `cvcIcon`

Controls the little card-with-CVC glyph.

| Value | Effect |
|---|---|
| `'default'` | Glyph shown (the default) |
| `'none'` | No glyph |

```tsx
<CardCVCField cvcIcon="none" />
```

---

## 5. Per-field defaults

What you get if you pass nothing. Placeholders and labels come from `localisation.labels`, whose own
defaults are shown here.

| Field | `placeholder` | `label` | `accessibilityLabel` | `testID` |
|---|---|---|---|---|
| `CardNumberField` | `Card number` | `Card number` | `Card number` | `CardNumberInputTestId` |
| `CardExpiryField` | `MM / YY` | `Expiry` | `Expiration date` | `ExpiryInputTestId` |
| `CardCVCField` | `CVC` | `CVC` | `Security code` | `CVCInputTestId` |
| `CardholderNameField` | `Name on card` | `Name on card` | `Cardholder name` | `CardholderNameInputTestId` |

Other testIDs the library renders, useful for e2e:

```
CardFieldErrorTestId        the inline validation message (same id on every field)
CardNetworkTriggerTestId    the co-badge chooser trigger
CardNetworkHeadingTestId    the chooser heading
CardNetworkBackdropTestId   the chooser backdrop
CardNetworkOption-<scheme>  one per offered scheme, e.g. CardNetworkOption-visa
ScanCardButtonTestId        the scan-card affordance, when available
```

Every field's error carries the **same** id on purpose: they are never on screen together in a way
that needs telling apart, and asserting "an error is showing" should not require knowing which field
produced it.

---

## 6. `styles` — the slots

Real React Native styles, not opaque handles. Pass any subset.

| Slot | Type | Targets |
|---|---|---|
| `root` | `ViewStyle` | The outermost wrapper |
| `container` | `ViewStyle` | The bordered box |
| `input` | `TextStyle` | The typed value |
| `placeholder` | `TextStyle` | The placeholder text |
| `label` | `TextStyle` | The floating label |
| `error` | `TextStyle` | The inline validation message |
| `accessory` | `ViewStyle` | The trailing element — brand mark, CVC glyph, scan button |

```tsx
<CardNumberField
  styles={{
    root:      {marginBottom: 14},
    container: {borderWidth: 1, borderRadius: 12, paddingHorizontal: 14},
    input:     {fontSize: 17, letterSpacing: 0.5},
    label:     {fontSize: 12},
    error:     {fontSize: 12, marginTop: 4},
    accessory: {marginRight: 4},
  }}
/>
```

**The expiry field has no `accessory` slot.** It renders no accessory element, and a slot with no
rendered target would be a silent no-op — so `VaultExpiryStyles` omits it and passing one is a type
error.

### unstyled

The nuclear option, available per field or form-wide on the provider:

```tsx
<CardNumberField unstyled />
```

It removes the floating label, the brand mark, the CVC glyph, the inline messages **and the bordered
box**, leaving a plain `TextInput` that keeps only its accessibility label, keyboard type, length
limit and CVC masking. `unstyled` wins over the individual toggles — there is no point setting
`labelBehavior` alongside it.

Use it with `errorDisplay="none"` and `onStateChange` when you want to render every part of the
field's presentation yourself.

---

## 7. `appearance`

Form-wide visual tokens, set once on the provider. They reach every field wherever you place it, so
this is the right place for anything that should be consistent.

| Token | Type | Applies to |
|---|---|---|
| `primaryColor` | `string` | Focus ring, active accents |
| `textColor` | `string` | The typed value |
| `errorColor` | `string` | Error text, error border, typed value in an error state |
| `placeholderColor` | `string` | Placeholder text |
| `backgroundColor` | `string` | Field background |
| `borderColor` | `string` | Field border |
| `borderRadius` | `number` | Field corners |
| `borderWidth` | `number` | Field border |
| `fontFamily` | `string` | All field text |
| `inputHeight` | `number` | Field height |
| `gap` | `number` | Spacing the library applies between its own elements |
| `fontScale` | `number` | Multiplier on all field text |
| `placeholderTextSizeAdjust` | `number` | Nudge placeholder size |
| `errorTextSizeAdjust` | `number` | Nudge error-message size |
| `errorMessageSpacing` | `number` | Gap between field and error message |
| `brandIconMode` | `'standard' \| 'animated' \| 'hidden' \| 'hideGeneric'` | Default for the card number |

```tsx
<HyperswitchVaultFormProvider
  appearance={{
    primaryColor: '#0B5FBF',
    textColor: '#0B1220',
    placeholderColor: '#94A3B8',
    borderColor: '#D7E0E5',
    errorColor: '#DC2626',
    borderRadius: 12,
    inputHeight: 56,
    fontFamily: 'Inter',
  }}>
```

The library never picks a colour of its own. If you do not set `errorColor`, error states use the
library default — not something derived from your other tokens.

---

## 8. `localisation`

Language and direction. Set once on the provider.

```tsx
<HyperswitchVaultFormProvider
  localisation={{
    labels: {
      cardNumberPlaceholder:       'Numéro de carte',
      cardNumberFloatingLabel:     'Numéro de carte',
      expiryPlaceholder:           'MM / AA',
      expiryFloatingLabel:         'Expiration',
      cvcPlaceholder:              'CVC',
      cvcFloatingLabel:            'CVC',
      cardholderNamePlaceholder:   'Nom sur la carte',
      cardholderNameFloatingLabel: 'Nom sur la carte',
      selectCardBrandLabel:        'Choisir le réseau',
    },
    validationMessages: {
      cardNumberRequired: 'Numéro de carte requis',
      cardNumberInvalid:  'Numéro de carte invalide',
      expiryRequired:     'Date d’expiration requise',
      expiryInvalid:      'Date d’expiration invalide',
      cvcRequired:        'CVC requis',
      cvcInvalid:         'CVC invalide',
      unsupportedCard:    'Carte non prise en charge',
      cardNotEligible:    'Cette carte n’est pas acceptée',
    },
    isRtl: false,
  }}>
```

Note the spelling difference: in `localisation` the two strings per field are
`…Placeholder` and `…FloatingLabel`; on a field component they are `placeholder` and `label`.

`selectCardBrandLabel` is the heading of the co-badge chooser — reachable only when a card belongs to
two networks and `enabledCardSchemes` offers more than one.

---

## 9. Which wins: precedence

Resolved in exactly one place, `CardFieldOptions.res`:

```
field prop   →   localisation.labels   →   library default
```

So:

```tsx
// localisation sets the language for the whole form
<HyperswitchVaultFormProvider
  localisation={{labels: {cardNumberPlaceholder: 'Numéro de carte'}}}>

  // …and this one field overrides it for this screen only
  <CardNumberField placeholder="Numéro de carte bancaire" />
```

**Rule of thumb: `localisation` for language, field props for this one screen.** A per-field prop
always wins.

`brandIconMode` follows the same idea with one extra step:

```
fieldOptions.cardNumber.brandIconMode  →  appearance.brandIconMode  →  'standard'
```

For `unstyled`, form-wide and per-field are OR'd — setting it on the provider makes every field
unstyled regardless of the field's own value.

---

## 10. `onStateChange` — per field

Fires as the customer types, focuses and blurs, de-duplicated by value rather than per keystroke.

All four fields report the same six members:

| Member | Type | Answers |
|---|---|---|
| `field` | `'cardNumber' \| 'expiry' \| 'cvc' \| 'cardholderName'` | Which field this is |
| `status` | `'empty' \| 'incomplete' \| 'complete'` | How far along is it? |
| `valid` | `boolean` | Would it pass submission right now? |
| `touched` | `boolean` | Has the customer interacted, so should your chrome complain yet? |
| `focused` | `boolean` | Is the cursor in it? |
| `error` | `{ code, message }` | What the customer is being shown **now** |

The card number adds three:

| Member | Type | |
|---|---|---|
| `brand` | `VaultCardBrand` | The detected scheme name |
| `isCoBadged` | `boolean` | Is a network chooser showing? |

```tsx
<CardNumberField onStateChange={s => {
  setBrand(s.brand);                          // 'visa' | 'mastercard' | … | 'unknown'
  setShowError(s.touched && !s.valid);
  if (s.error) setMessage(s.error.message);   // already localised
}} />
```

One handler for several fields — narrow on `field`:

```tsx
const onField = (s: VaultFieldState) => {
  switch (s.field) {
    case 'cardNumber': setBrand(s.brand); break;   // brand only exists here
    case 'expiry':
    case 'cvc':
    case 'cardholderName': break;
  }
};
```

Reading `s.brand` outside the `'cardNumber'` branch is a **type error**, not a runtime surprise.

`error.code` is closed: `required`, `invalid_card_number`, `invalid_expiry`, `invalid_cvc`,
`unsupported_network`.

`brand` is closed: `visa`, `mastercard`, `americanExpress`, `dinersClub`, `discover`, `jcb`,
`cartesBancaires`, `interac`, `maestro`, `unionPay`, `rupay`, `sodexo`, `bajaj`, `unknown`.

**No card value is ever carried here** — no PAN, no BIN, no last four, no length, no expiry parts, no
CVC. That is enforced by `scripts/verify-event-surface.mjs` against the packed declarations.

---

## 11. `onFormStateChange` — the whole form

On the provider. Use this to drive your Pay button.

| Member | Type | Answers |
|---|---|---|
| `fieldsReady` | `boolean` | Have the fields mounted? |
| `sessionStatus` | `'valid' \| 'invalid' \| 'absent'` | Is the session usable? |
| `complete` | `boolean` | Is every required field filled? |
| `valid` | `boolean` | Would it pass submission? |
| `submitting` | `boolean` | Is a request in flight? |
| `canSubmit` | `boolean` | **Enable your button on this one** |
| `brand` | `VaultCardBrand` | Detected scheme |
| `isCoBadged` | `boolean` | Chooser showing? |
| `networkError` | `{ code, message }` | Optional |
| `fields` | `{ cardNumber, expiry, cvc, cardholderName? }` | The four field states |

```tsx
<HyperswitchVaultFormProvider
  onFormStateChange={s => {
    setCanSubmit(s.canSubmit);
    setBusy(s.submitting);
    if (s.sessionStatus !== 'valid') setBanner('Checkout could not start.');
  }}>
```

> Do not call `tokenize()` to find out whether the form is ready. That **mints a payment-method token
> as a side effect of rendering**. `canSubmit` is the answer to that question.

---

## 12. Refs

### The form handle

On the provider. Three methods.

```tsx
const formRef = useRef<VaultFormHandle>(null);

await formRef.current?.tokenize();          // → VaultTokenizeResult, the only route to a token
formRef.current?.reset();                   // clear the fields
formRef.current?.focus('cvc');              // 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName'
```

### Field handles

Each field takes its own ref, with two methods.

```tsx
const cvcRef = useRef<VaultFieldHandle>(null);

<CardCVCField ref={cvcRef} />

cvcRef.current?.focus();
cvcRef.current?.blur();
```

Use the form handle's `focus(field)` for moving between the library's own fields; use a field ref
when you need to move focus from one of *your* inputs into a specific card field.

---

## 13. Everything together

```tsx
import {useRef, useState} from 'react';
import {View, Pressable, Text} from 'react-native';
import {
  HyperswitchVaultFormProvider,
  CardNumberField, CardExpiryField, CardCVCField, CardholderNameField,
  type MerchantSession, type VaultFormHandle, type VaultFieldHandle, type VaultFormState,
} from '@juspay-tech/react-native-hyperswitch-vault';

export function Checkout({session}: {session: MerchantSession}) {
  const formRef = useRef<VaultFormHandle>(null);
  const cvcRef  = useRef<VaultFieldHandle>(null);

  const [canSubmit, setCanSubmit] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const result = await formRef.current?.tokenize();
    setBusy(false);

    if (result?.status === 'success') {
      // send result.token to your backend
    } else if (result) {
      // result.error.message — already localised, safe to display
    }
  };

  return (
    <HyperswitchVaultFormProvider
      ref={formRef}
      session={session}
      environment="sandbox"
      cardholderName="collect"
      enabledCardSchemes={['visa', 'mastercard', 'cartesBancaires']}
      appearance={{
        primaryColor: '#0B5FBF',
        borderColor: '#D7E0E5',
        errorColor: '#DC2626',
        borderRadius: 12,
        inputHeight: 56,
      }}
      localisation={{labels: {expiryPlaceholder: 'MM / YY'}}}
      disabled={busy}
      onFormStateChange={(s: VaultFormState) => setCanSubmit(s.canSubmit)}>

      <CardholderNameField styles={{root: {marginBottom: 12}}} />

      <CardNumberField
        brandIconMode="hideGeneric"
        testID="checkout-card-number"
        styles={{root: {marginBottom: 12}, input: {fontSize: 17}}}
        onStateChange={s => { if (s.status === 'complete') cvcRef.current?.focus(); }}
      />

      <View style={{flexDirection: 'row', gap: 12}}>
        <View style={{flex: 1}}><CardExpiryField /></View>
        <View style={{flex: 1}}><CardCVCField ref={cvcRef} cvcIcon="none" /></View>
      </View>

      <Pressable disabled={!canSubmit || busy} onPress={save}>
        <Text>{busy ? 'Saving…' : 'Save card'}</Text>
      </Pressable>
    </HyperswitchVaultFormProvider>
  );
}
```

Note what the merchant never writes: no card state, no validation, no formatting, no submit body.
The entire relationship with the card is `formRef.current.tokenize()`.

---

## See also

- [`merchant-api-surface.md`](merchant-api-surface.md) — the complete export surface, results, error
  codes, and what is sealed
- [`merchant-integration.md`](merchant-integration.md) — the backend endpoint and end-to-end flow
