# ADR-0006 — The library ships a UI; merchants strip it

**Status:** Accepted · supersedes the "merchant UI reset" recorded only in
`src/CardFieldOptions.res` · amends §12 and §14 of
[ADR-0002](0002-merchant-public-api-contract.md)

## Context

Until now every visual element was opt-in. A merchant who rendered
`<CardNumberField />` got a bordered box, an accessibility label, and nothing else — no placeholder,
no label, no brand mark, no error message. The rationale was ownership: the library owns card
values, the merchant owns the checkout's appearance, so inheriting a presentation nobody asked for
makes the merchant's job harder.

That argument was coherent, and it is still half right. What it got wrong is what a merchant meets
first. **A blank rectangle does not read as a neutral starting point; it reads as a broken
integration.** The strongest evidence was in our own README, which had to carry the sentence
*"`fieldOptions` is not optional decoration — it is how you get a visible form."* A default that
needs that sentence is the wrong default.

Two further things are worth recording, because they are the reason this was easy to get wrong and
easy to leave wrong:

- **The decision was never written down.** "The merchant UI reset" is named in five places across
  tests and checklists, and no ADR records it. Its only rationale was a comment block in
  `CardFieldOptions.res`. A decision that lives in a source comment is a decision nobody can find
  when they need to revisit it.
- **The default was not in one place either.** `resolveWith` claimed to be "the only place a default
  lives", and three other sites re-derived one — `cvcIconOf`, `VaultFormHost`'s form-wide brand
  icon, and *three separate copies* in `CardFormView` deciding who owns the fused layout's shared
  error line. They agreed by coincidence, and the coincidence was load-bearing.

## Decision

**Render a complete UI by default. Add one prop that strips it back to a plain text input.**

Defaults, all resolved from a single named block in `CardFieldOptions`:

| Option | Was | Is |
|---|---|---|
| `placeholder` / `label` | absent | the string from `localisation.labels`, or the library's own |
| `labelBehavior` | `none` | `floating` |
| `errorDisplay` | `none` | `inline` |
| `brandIconMode` | `hidden` | `standard` |
| `cvcIcon` | `none` | `default` |

```tsx
<CardNumberField />                       // full UI
<CardNumberField unstyled />              // a bare TextInput
<HyperswitchVaultFormProvider unstyled>   // form-wide
<CardNumberField unstyled={false} />      // one field opts back in
```

**Precedence:** field `unstyled` → provider `unstyled` → `false`, the same shape
`resolveBrandIconMode` already used, so the library has one precedence idiom rather than two.

### `unstyled` wins over the per-feature props

Not "a different set of defaults" — a veto. The two escape hatches answer two different asks:
per-feature props are *change the UI*; `unstyled` is *there is no UI, give me a text input*. Letting
a stray `errorDisplay` survive `unstyled` would put an element inside a field with no box to hold
it, and would make the result depend on which of two props the reader noticed first. The resolved
record reflects this, so nothing downstream re-checks the flag to know what it is looking at.

### `unstyled` removes the box, and means NOT RENDERED

It removes the border, background, radius and fixed height as well as the chrome — "plain text
input" taken literally. And it removes elements rather than flattening them: ADR-0004 already
established that a styled-away node is still mounted, still in the layout and, for an input, still
focusable and announced. `defaultUi.test.tsx` and `unstyled.test.tsx` both assert this
differentially, on tree size, rather than on a zeroed style property.

**What survives `unstyled`:** `accessibilityLabel`, `testID`, keyboard type, length limit, the CVC's
masking, and the processing/disabled state. Accessibility and input behaviour are not decoration.

### `placeholder=""` means "no placeholder"

Absent now means "use the library's string", so there had to be a way to say "none". `""` is what a
bare `<TextInput placeholder="" />` does in React Native, so it needs no new type on the public
surface and adds no second way to spell "off" — the mistake `CardFieldOptions.res` already records
having made once with `brandIcon` / `brandIconMode`.

## What this does NOT change

- **Scan card.** Adding `@juspay-tech/react-native-hyperswitch-scancard` *is* the merchant's opt-in;
  present means the button works with no prop, absent means nothing renders. There is deliberately
  no prop, and `unstyled` does not turn it on.
- **The ready-made `HyperswitchVaultForm`.** Same API. It shares the resolution path, so it
  inherits the new defaults; no new layout variations will be added to it.
- **Everything security-shaped.** Validation, focus order, error timing, the card-source union,
  every result and event shape, and the fact that no card value crosses the public API.

## Consequences

- **`localisation.labels.*` takes effect for the first time.** Those members were accepted and
  rendered nothing. A merchant who passed them will now see their strings appear. That is a bug fix
  and a visible change.
- **The floating-label animation is now everyone's cost.** It was JS-driven and restarted on every
  keystroke — four fields by sixteen PAN digits is sixty-four restarted rAF loops to type one card.
  It now runs only on the down/up transition. It cannot move to the native driver: the animated
  properties are `fontSize` and `height`, which the native driver does not support.
- **Floating mode changes the touch target.** The input takes 70% height and bottom alignment, so
  the default form's tappable area is no longer trivially the whole box. A device check covers it.
- **The cardholder name renders a label but never an error.** The library forms no verdict about it
  — it is optional and the submit gate never inspects it — so `errorDisplay` is inert on that field.
  Documented rather than fixed: inventing a validator would flip its `valid` from always-true and
  break any merchant who ANDs the four field flags.
- **A merchant-reported bug is now the intended behaviour.** A placeholder-only integration showing
  a brand mark was once a defect. Its regression guard is kept, with its assertion inverted and the
  reversal recorded in the test itself.

## Alternatives considered

| Alternative | Why not |
|---|---|
| A `chrome: 'default' \| 'minimal' \| 'none'` union | `minimal` exists to reproduce the old render for merchants upgrading. There are none — 0.7 is unreleased — so the third member would be dead on arrival. |
| `unstyled` strips chrome but keeps the box | Then "plain text input" takes two props, `unstyled` plus `appearance.borderWidth: 0`, which is the friction this ADR exists to remove. |
| Keep defaults off, improve the docs | The README sentence *was* the improved documentation. It did not stop merchants meeting four blank rectangles first. |
| Ship the new UI behind an opt-in first | Two releases and two migrations to protect nobody: the surface is unreleased. |

## Enforcement

| Property | Gate |
|---|---|
| Every default resolves in one place | the named block in `CardFieldOptions`; `CardFormView` reads resolved values instead of re-deriving |
| `unstyled` removes elements rather than styling them away | `unstyled.test.tsx` and `defaultUi.test.tsx`, both differential on tree size |
| Accessibility and input behaviour survive `unstyled` | `unstyled.test.tsx` |
| Brand-icon precedence is total | the 5×5 matrix in `defaultUi.test.tsx` |
