# What a merchant controls

A guide to everything `@juspay-tech/react-native-hyperswitch-vault` exposes — and everything it
deliberately does not — so you can judge how well it will fit a given integration before writing any
code.

Every claim here is drawn from the shipped source. Where something is fixed or missing, it says so
plainly rather than leaving you to find out during an integration.

---

## The model in one line

**You own everything around the card fields. We own the three fields and the vault call.**

```
┌──────────────────────────────────────────────────────────────┐
│ YOUR APP                                                     │
│                                                              │
│   your screen / sheet / modal / accordion  ← you             │
│   your heading, copy, amount               ← you             │
│                                                              │
│   ┌────────────────────────────────────┐                     │
│   │  <HyperswitchVaultForm />          │  ← us               │
│   │  card number · expiry · CVC        │                     │
│   └────────────────────────────────────┘                     │
│         ↑ shaped by appearance / splitCardFields / disabled   │
│                                                              │
│   your submit button                       ← you             │
│   your error placement, your wording       ← you             │
│   your success screen                      ← you             │
└──────────────────────────────────────────────────────────────┘
              │
              │  submit()  →  the vault call    ← us
              ▼
        typed result  →  your handling         ← you
```

There is no sheet, no navigation, no button, no loading overlay and no copy inside the package. That
is the single most important thing to understand about it: this is **a field group, not a payment
sheet**.

---

## Layer 1 — Placement and flow

The largest lever, and the one most people overlook because it isn't a prop.

`HyperswitchVaultForm` is an ordinary React component. It renders three inputs and nothing else, so
it drops into any container you already have:

| Pattern | How it looks |
|---|---|
| Bottom sheet at checkout | your `Modal` + the form + your Pay button (what `example/` demos) |
| Dedicated "Add card" screen | a normal screen in your navigator |
| Inline in account settings | the form inside a card, with a Save button |
| Step in a multi-step checkout | one step of your own stepper |
| Inside an accordion | expand the "New card" row to reveal it |

You also decide:

- **When the session is fetched.** Eagerly on screen mount, or lazily when the customer taps
  Checkout. The demo does the latter, because the round trip is honest to show and the sheet cannot
  render without a session anyway.
- **How long a session lives.** Replace the `session` prop and the form re-arms against the new one;
  an in-flight confirmation under the old session is cancelled for you.
- **What triggers submission.** Your button, your form-level "Continue", or automatically once
  `onStateChange` reports `complete` — all just a call to `submit()`.

---

## Layer 2 — Appearance

Ten optional tokens. Pass none and you get a neutral default; pass two and only those change.

| Token | Default | What it actually affects |
|---|---|---|
| `primaryColor` | `#0570DE` | focused border, CVC hint icon when enabled |
| `textColor` | `#1A1A1A` | entered text |
| `placeholderColor` | `#6B7280` | placeholders and floating labels |
| `backgroundColor` | `#FFFFFF` | input fill |
| `borderColor` | `#E6E6E6` | resting border **and** the divider between fields |
| `errorColor` | `#DF1B41` | error text **and** the error border |
| `borderRadius` | `8` | corner radius of the block or of each field |
| `borderWidth` | `1` | border thickness |
| `fontFamily` | `System` | all text in the fields |
| `inputHeight` | `48` | field height |

Two of them do double duty on purpose — `borderColor` also sets the divider, and `errorColor` also
sets the error border — so a two-line theme still looks coherent rather than half-styled.

```tsx
const appearance = {
  primaryColor: '#4F46E5',
  borderColor: '#E2E8F0',
  borderRadius: 12,
  inputHeight: 52,
};
```

**Fixed, not exposed:** the 12pt gap between fields in split layout, font scale, placeholder size
adjustment, and any shadow. If a design needs those, it needs a change to the library, not a
workaround.

---

## Layer 3 — Layout

`splitCardFields`:

- `false` (default) — one bordered block, expiry and CVC sharing the row beneath the card number.
  This is what a card-only hyperswitch-client-core payment sheet looks like.
- `true` — three separately bordered fields, and each field's error moves directly beneath that
  field instead of below the whole block.

That second half matters more than the borders: in split layout, error messages sit next to what
they describe, which is usually the better choice on a long form and the worse choice in a compact
sheet.

---

## Decided, not yet shipped — custom layout via HyperswitchVaultFormProvider

> **Status: accepted in [ADR-0001](adr/0001-widget-api-shape.md), not implemented.** Everything
> else in this document describes shipped source; this section describes a committed contract so
> you can plan against it.

A second hosting component will let you arrange the three fields yourself:

```tsx
<HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
  <CardNumberWidget />
  <CardExpiryWidget />
  <CardCVCWidget />
</HyperswitchVaultFormProvider>
```

`HyperswitchVaultForm` stays exactly what it is today — the ready-made form. The provider is for
custom layout only, and both are the same engine underneath: one coordinator, one field
implementation, the same validation and the same vault call.

The contract you can rely on:

- **The widget set is closed**: card number, expiry, CVC. All three must be mounted — exactly one
  of each — for `submit()` to do anything. Missing or duplicated widgets: `submit()` returns
  `not_ready` whose message names the widget at fault, and no network request is made — the
  diagnostic travels in the result, nothing is logged. A widget outside the provider throws with
  a message that names both.
- **Errors render per widget**, directly beneath the field they describe — the same presentation
  as `splitCardFields: true`. There is no `splitCardFields` on the provider; layout is yours.
- **`appearance` and `localisation` sit on the provider** and flow to every widget. Widgets take
  no per-widget style props (first release).
- **Focus auto-advance keeps the semantic order** number → expiry → CVC regardless of where you
  place the widgets; each widget also exposes a `WidgetHandle` with `focus()` / `blur()`.
- **The same ref handle** (`submit` / `reset` / `focus`) and the same typed result as the form.
- **No card value ever reaches you** through the provider, the widgets, their handles, errors or
  anything else — the same boundary the form has today.

The provider also takes the form's existing aggregate `onStateChange` (`complete`, per-field
validity, `brand`) — form-level parity, unchanged. Per-widget state callbacks are a later phase,
deliberately.

---

## Layer 4 — State and imperative control

**`onStateChange(state)`** fires as the customer types:

```ts
{ complete, cardNumberValid, expiryValid, cvcValid, brand }
```

Enough to drive a Pay button, a per-field checkmark, or a brand icon of your own (`brand` is the
detected scheme name). It carries no card data at all — not a BIN, not a last4 — so it is safe to
put in any state container.

**The ref handle:**

| Method | Use it for |
|---|---|
| `submit()` | the only required call; returns a typed result, never throws |
| `reset()` | "use a different card", clearing after an error, resetting a reusable sheet |
| `focus(field)` | deep links, "edit card", returning focus after your own validation step |

**`disabled`** makes the inputs genuinely non-interactive, for a review step or while your own
pre-checks run.

---

## Layer 5 — Results and wording

`submit()` resolves to a discriminated union. Six codes, closed:

`invalid_card_data` · `not_ready` · `invalid_session` · `server_error` · `unknown_outcome`
— plus `success`.

The library ships a fixed English message with every failure, but **you are not obliged to show it**.
Because `code` is a closed union, you can switch on it and supply your own wording, in your own
language, at your own severity. That is the intended path for anything customer-facing:

```tsx
const copy = {
  invalid_card_data: t('checkout.card_invalid'),
  invalid_session:   t('checkout.session_expired'),
  server_error:      t('checkout.try_again'),
  unknown_outcome:   t('checkout.check_before_retry'),
  not_ready:         t('checkout.one_moment'),
};
```

You also choose *where* that message appears — a toast, a banner, inline under the sheet — because
result handling is entirely yours.

---

## What you cannot change, on purpose

These are guarantees, not gaps. Each one exists because letting an integrator vary it is how card
forms go wrong.

| Fixed | Why |
|---|---|
| Card values never reach your code | Not a rule — a type-level fact. No prop or callback carries a PAN, expiry or CVC. |
| Formatting, grouping, Luhn, scheme lengths, expiry window, CVC rules | One implementation, compiled from `hyperswitch-sdk-utils`, shared with the iOS, Android, React Native and web SDKs. Your form validates identically to every other Hyperswitch surface. |
| Errors appear on blur, not while typing | Typing-time errors make a card form feel hostile. This timing is the pre-existing, tested behaviour. |
| Automatic focus advance | PAN → expiry → CVC, and backspace-on-empty walking back. Always on. |
| Request shape, headers, expiry normalisation | The 2-digit year the form stores becomes the 4-digit year the endpoint requires, in exactly one place. |
| No logging, anywhere | The package contains zero `console` calls, deliberately. |
| No automatic retry | A timeout or abort may have already been processed, and the endpoint takes no idempotency key. |

---

## Not currently configurable — know before you promise

Honest list. None of these are hard to add; none are exposed today.

1. **Field labels and validation messages are English only.** The standalone form ships fixed labels
   (`Card number`, `MM / YY`, `CVC`) and validation strings from sdk-utils' default locale. There is
   no `labels` or `locale` prop. **A non-English merchant cannot localise the fields.** This is the
   single biggest gap for international selling. (The `/embedded` path does not have this problem —
   client-core passes resolved locale strings in.)
2. **RTL** is wired through the same labels structure and is likewise not exposed.
3. **Focus auto-advance cannot be turned off.**
4. **Field-level error placement** is a consequence of `splitCardFields`, not an independent choice.
5. **Card scanning** and the **co-badged network picker** are excluded from the standalone form.
   Both need host capabilities — a native module, and a viewport-aware popover — and including them
   would cost the "no native module, no Pod install, no Codegen" property.
6. **Saved cards** are not in scope. This component collects and stores a *new* card.
7. **The gap between fields**, font scale and shadow are fixed.
8. **Field order and field set** are fixed at card number, expiry, CVC. No postal code, no
   cardholder name, no nickname.

---

## What you take on

Owning the chrome means owning what the chrome is responsible for. The three most commonly missed:

- **Keyboard avoidance.** The form does not manage the keyboard; in a bottom sheet you need a
  `KeyboardAvoidingView` or the CVC ends up underneath it.
- **Dismissal during a confirmation.** Nothing stops you closing your sheet mid-request. The request
  still completes; your UI has simply moved on. Gate your close handler while a submit is in flight.
- **Button enablement.** Use `onStateChange().complete`, or accept that the first press returns
  `validation_error` and surfaces the inline messages.

Also yours: fetching a fresh session per attempt, storing the returned token on your backend, and
keeping secret keys off the device.

---

## Footprint

| | |
|---|---|
| Packages to install | 1 |
| Native modules | 0 |
| `pod install` required | no |
| Codegen | no |
| Peers | `react`, `react-native` only (react-final-form is bundled in) |

---

## Standalone vs embedded

Two entry points, different jobs.

| | root entry (`HyperswitchVaultForm`) | `/embedded` (`EmbeddedCardElement`) |
|---|---|---|
| Owns the form | yes | no — binds into the host's react-final-form |
| Intended consumer | any merchant app | hyperswitch-client-core |
| Labels / locale | fixed English | supplied by the host |
| Scan card, co-badge picker | excluded | injected by the host |
| react-final-form | bundled in | must be the host's instance |

If you are already rendering client-core's payment sheet, you do not need this package. It exists
for merchants who want the card-saving step inside their own UI.

---

## The one-paragraph pitch

A merchant adds one dependency, renders one component, and calls one method. They keep complete
control of their checkout — where the fields sit, how they look, when submission happens, what the
customer is told and in what language. What they give up is the ability to get card handling wrong:
formatting, validation, error timing and the vault call are the same implementation every
Hyperswitch SDK uses, and no card value is reachable from their code by construction.
