# Control surface

Exactly what a host can control, observe and call — and what it deliberately cannot.

This is the reference companion to [app-integration.md](app-integration.md), which explains the
three flows. Here the question is narrower: for each thing you might want to do, is there a
supported way to do it?

---

## 1. The short version

| You want to… | Supported? | How |
|---|---|---|
| Render the card fields | yes | `HyperswitchVaultForm`, or the provider plus field widgets |
| Style them | yes | `appearance`, `fieldStyles`, per-field `styles` |
| Label / localise them | yes | `fieldOptions`, `localisation` |
| Arrange them | yes | `layout`, `fieldArrangement`, or place widgets yourself |
| Disable them | yes | `disabled` |
| Focus one | yes | `focus(field)` on the handle |
| Clear them | yes | `reset()` on the handle |
| Get a payment-method token | yes | `tokenize()` — Flow 1 |
| Confirm a payment with a tokenized card | checkout SDK only | `confirmPayment({cardSource: {type_: 'vault', session}})` on the `./host` entry — Flow 2 |
| Confirm a payment WITHOUT tokenizing | checkout SDK only | `confirmPayment({cardSource: {type_: 'direct'}})` on the `./host` entry — Flow 3 |
| Choose whether the card is tokenized | yes | `cardSource` — required, no default |
| Know whether an operation is running | yes | track your own promise |
| Read the PAN, expiry, CVC or cardholder name | **no** | there is no accessor, in any form |
| Set a card value | **no** | the fields are not controlled inputs |
| Subscribe to typing, focus, validity or brand | **yes** | `onStateChange` per field, `onFormStateChange` for the form ([ADR-0005](adr/0005-restore-card-safe-state-emission.md)) |
| Pre-disable a button from library state | **no** | call the operation; it answers without a request |
| Call the tokenization transport yourself | **no** | it is internal and has no export |
| Receive the intermediate token in Flow 2 | **no** | `VaultPaymentResult` has no `token` member |

---

## 2. What you may observe, and what you may not

ADR-0003 removed every state-emission callback. [ADR-0005](adr/0005-restore-card-safe-state-emission.md)
restored them, because the claim they had no consumer was wrong: `submit()` answers "may I submit?"
at one instant on demand, and a merchant drawing their own chrome needs the answer continuously,
while the customer types.

What came back is **state**, never values. `onStateChange` per field and `onFormStateChange` for the
form report validity, completeness, focus, whether the field has been touched, the message already
on screen, and — for the card number — the detected scheme, whether the card is co-badged and its
eligibility verdict. They carry no PAN, no BIN, no last four, not even the length of what was typed.
`verify-event-surface.mjs` pins that member by member against the packed declarations, so widening
the payload is a build failure rather than a review comment.

Some questions are still answered by the operations rather than a callback, without a network
request:

| Old question | New answer |
|---|---|
| "Is the form complete, so I can enable my button?" | Enable it. A premature press returns `validation_error` and shows inline errors. |
| "Are the fields mounted yet?" | A premature call returns `not_ready`, naming what is missing. |
| "Is the session usable?" | The operation returns `invalid_session` on the first attempt. |
| "Is something in flight?" | Your own promise is pending. Track that. |

The cost is one extra press in the worst case. The benefit is that no card-derived value has a route
out of the library at all — there is no callback for one to travel through.

---

## 3. The handle

```ts
type VaultFormHandle = {
  tokenize(): Promise<VaultTokenizeResult>;
  reset(): void;
  focus(field: 'cardNumber' | 'expiry' | 'cvc' | 'cardholderName'): void;
};
```

That is the root handle. The checkout SDK's entry, `./host`, types the same object as
`HostFormHandle`, which adds `confirmPayment(input)` (ADR-0010). Merchants never see that member.

Field widgets take their own ref with a smaller handle:

```ts
type VaultFieldHandle = {focus(): void; blur(): void};
```

Neither exposes a value, in either direction.

### Concurrency

- The same operation called twice while pending returns the **same promise**. Double submission is
  therefore harmless and produces one set of requests.
- The *other* operation called while one is pending returns `not_ready` without a request. The two
  drive the same card state and the same session, so running both at once would mint against a card
  the customer may still be editing.
- `reset()` is ignored while an operation is in flight.
- Replacing the `session` prop or unmounting aborts in-flight work and discards any cached token.

---

## 4. Presentation controls

| Prop | Scope | Effect |
|---|---|---|
| `appearance` | form-wide | colours, radius, border width, font family, input height, gap, font scale |
| `localisation` | form-wide | validation message overrides, `isRtl` |
| `layout` | ready-made form | `stacked` (default) or `inline` (expiry and CVC share a row) |
| `fieldArrangement` | ready-made form | `separate` (default) or `fused` (joined borders) |
| `fieldOptions` | per field | which elements exist: placeholder, label, `labelBehavior`, `errorDisplay`, accessibility text, `testID`, `brandIconMode` (card number only), `cvcIcon` (CVC only) |

`errorDisplay` governs **all** error presentation — the inline message, the field border and the
typed text — not the message alone. Its default is `inline`, so a form that configures nothing shows
its errors, in the `errorColor` you passed on `appearance`; the library never picks an error colour
of its own. At `none` an invalid field is drawn exactly like a valid one and the problem reaches you
through `onStateChange` / `onFormStateChange` instead.
| `fieldStyles` | per field | style slots: `root`, `input`, `placeholder`, `error`, `accessory` (not on expiry) |
| `disabled` | form-wide | genuinely non-interactive inputs |
| `accessible` | form-wide | forwarded to the underlying inputs |

**Defaults are complete on purpose.** With no options a field renders a floating label carrying
the library's own string, the brand mark (card number), the CVC glyph and inline validation
messages. `unstyled` strips every one of them, and the bordered box too, leaving a plain
`TextInput` — it wins over the per-feature props rather than merely changing their defaults. Accessibility
labels stay on regardless — a blank field is still announced correctly to a screen reader.

Field options decide **whether an element exists**; field styles decide **how it looks**. A style
never turns an element on.

---

## 5. The cardholder name

A library-owned field like the other three.

- The ready-made form **always** renders it, full width, above the card number, outside the fused
  group.
- A custom layout may mount it or omit it. It is **not** part of the presence gate, so omitting it
  does not make an operation return `not_ready`.
- Left blank, it is omitted from the request entirely.
- It takes the standard field options and styles. It has no `brandIconMode` and no `cvcIcon`,
  because it renders neither element.
- Its value is trimmed once, at the wire boundary — never per keystroke, which would delete the
  space between a first and last name as it is typed.

---

## 6. What crosses the boundary, per flow

| | Into the library | Out of the library |
|---|---|---|
| **Flow 1** (`tokenize`) | session, presentation | `{status: 'success', token}` or a safe error |
| **Flow 2** (`confirmPayment`, vault source — `./host`) | session, presentation, non-card confirmation input | a navigation decision or a safe error — no token |
| **Flow 3** (`confirmPayment`, direct source — `./host`) | presentation, non-card confirmation input | a navigation decision or a safe error — no token |

Non-card confirmation input is narrow by construction: `billing` and `nickName` and nothing else. A
card key at any depth fails the call with `forbidden_card_data` before any request is made.

---

## 7. Enforcement

Every claim on this page is gated, not asserted:

| Claim | Gate |
|---|---|
| The emitted payload is exactly its allowlist — no card value, no wider, no narrower | `verify-event-surface.mjs` |
| `token` appears in the tokenize result and nowhere else | `verify-result-mapping.mjs`, `verify-publishable.mjs`, `verify-merchant-only.mjs` |
| Host input is narrow; card keys rejected at depth | `verify-noncard-input.mjs` |
| Every outcome maps to a safe result with a fixed message | `verify-result-mapping.mjs`, `verify-final-confirm.mjs` |
| Only `.` and `./package.json` are published | `verify-package-contents.mjs`, `verify-publishable.mjs` |
| The three flows are documented with their own contracts | `verify-flow-docs.mjs` |
| Controlled values and removed callbacks are compile errors | `type-tests/consumer.tsx` |
