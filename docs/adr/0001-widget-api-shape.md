# ADR-0001: Custom card-field layout via HyperswitchVaultFormProvider and field widgets

**Date**: 2026-08-18
**Status**: accepted
**Deciders**: Pradeep Kumar
**Reversibility**: Type 2 (two-way)
**Confidence**: high

## Context

Merchants need to lay the three card fields out themselves. The first-party POC
(`react-native-hyperswitch-payment-methods`, inspected at `juspay/react-native-hyperswitch`
origin/main) establishes the merchant experience this package should match: a hosting component
plus `CardNumberWidget` / `CardExpiryWidget` / `CardCVCWidget` children, a ref-based `submit()`
that never throws, and widgets that throw an actionable error outside their host. The POC's
`HyperswitchForm` is coordinator-only — it has no ready-made childless mode — while this
package's `HyperswitchVaultForm` already means ready-made UI.

Verified facts that constrain any design:

1. **react-final-form validation is field-level, and values outlive fields.** Proven empirically
   against the bundled final-form 5.0.0 with this package's default form config: a field that was
   invalid makes the form report `valid: true` the moment it unregisters, and a value typed into a
   field survives that field's unmount (`destroyOnUnregister` defaults to false; enabling it is a
   form-level setting that would also change the ready-made path's reset semantics, so it is not
   the fix). Consequences: a missing CVC widget yields a "valid" form holding an empty CVC, and a
   CVC typed into a since-unmounted widget rides along invisibly. Submission must therefore check
   widget presence itself, before reading values.
2. **The transport is the last gate, not the right gate, for missing widgets.**
   `VaultConfirm.confirmPaymentMethodSession` calls `validateCard` first (`VaultConfirm.res:504`),
   before resolving the session id and before any fetch — empty or invalid number/expiry/CVC
   returns `#invalid_card_data` with zero network requests. But that wording would mislead when
   the real fault is "the merchant did not mount a widget", so it remains defence-in-depth only.
3. **`selectCardFields` cannot be the required-widget source.** It treats `Cvc` as optional
   (`cardCvcPath: option<string>` in `CardFormTypes.res`; only number + expiry month + expiry
   year are its mandatory triple), while the transport record requires `cvc: string` and
   `validateCard` rejects a bad one. A presentation selection that can omit a transport-required
   input cannot define the transport's widget set.
4. **`reset()` while a confirmation is in flight is a refusal: it neither clears nor cancels.**
   Verified from current source (`HyperswitchVaultForm.res:609` — the in-flight branch does
   nothing), from the compiled output (`HyperswitchVaultForm.bs.js:402` — a bare return), and
   from the lifecycle test (`example/__tests__/vaultFormLifecycle.test.tsx`, "reset" describe
   block), which asserts that during the in-flight window the typed values stay on screen, the
   dispatched request is not aborted, and all three inputs are non-interactive; after the promise
   settles, `reset()` clears normally. An earlier contract statement — that `reset()` clears the
   visible form without cancelling — described behaviour that was deliberately superseded:
   clearing without cancelling empties the fields while a promise that resolves for the old card
   is still outstanding, so the outcome could be misread as belonging to whatever is typed next.
   The current refusal semantics are the ones this ADR carries forward.

Independently of the public shape, `CardFormView`'s cross-field coupling (shared expiry display
state, brand written by the card-number handler and read by the CVC validator, focus auto-advance
refs, co-badge state, cross-field error priority in the fused layout, `emitCardInfo`) means
widget support requires lifting that logic into a private coordinator no matter what shell is
chosen.

## Decision

Add **`HyperswitchVaultFormProvider`** — a coordinator component that requires widget children —
plus the three widgets **`CardNumberWidget`**, **`CardExpiryWidget`**, **`CardCVCWidget`** and a
**`WidgetHandle`** (`focus()` / `blur()`). The existing childless **`HyperswitchVaultForm`
remains the ready-made form, unchanged.**

```tsx
<HyperswitchVaultFormProvider ref={formRef} session={session} environment="sandbox">
  <CardNumberWidget />
  <CardExpiryWidget />
  <CardCVCWidget />
</HyperswitchVaultFormProvider>
```

This is not two implementations. Both public components consume one private form coordinator and
one field-core implementation, the same sdk-utils validation, and the existing `VaultConfirm`
transport. The provider carries the same ref handle as the form (`submit` / `reset` / `focus`)
and the same `session` / `environment` / `appearance` / `localisation` / `disabled` /
`accessible` props, **plus the existing aggregate `onStateChange` callback with the existing safe
`cardFormState`** (`complete`, `cardNumberValid`, `expiryValid`, `cvcValid`, `brand`) — this is
form-level parity with `HyperswitchVaultForm`, not the future per-widget events phase. It has
**no `splitCardFields`** — layout belongs to the merchant. Widgets export from the root entry
only, so they share the bundled react-final-form instance and context identity. No
`CardHolderWidget`; no merchant field names; no custom validation rules; no id-based submit; no
provider registration; no raw provider results.

### Why a separate provider instead of a dual-mode HyperswitchVaultForm

1. Children-driven dual mode is ambiguous for null/conditional children.
2. It makes `splitCardFields` silently meaningless in one mode.
3. It requires a more complicated handwritten TypeScript facade.
4. A separate provider adds no merchant integration step; it only gives the two use cases
   explicit names.
5. The payment-methods POC's `HyperswitchForm` is coordinator-only, while the existing
   `HyperswitchVaultForm` already means ready-made UI — one name per meaning.

## Behavioural contract

### Required widget set

The closed standalone PMS-confirm input contract: **card number, expiry, CVC** — matching the
transport's `cardDetails` record field-for-field. It is deliberately not derived from
`selectCardFields` (see Context fact 3). The widget kinds form a closed type, and submission
builds the transport's `cardDetails` through an exhaustive mapping from that closed type, so the
required set is coupled to the transport contract at compile time (see "Transport-contract
growth" below).

### Missing / duplicate / outside-provider

- `submit()` requires **exactly one currently mounted instance of every required widget** before
  reading any value or invoking the transport.
- **Missing** widget(s): `submit()` returns `not_ready` whose safe message names the missing
  widget(s), and makes zero network requests.
- **Duplicate** widget(s): `submit()` returns `not_ready` whose safe message names the duplicated
  widget, and makes zero network requests. The diagnostic travels in the result; nothing is
  written to any console — the package's zero-log contract is preserved.
- A widget rendered **outside** `HyperswitchVaultFormProvider` **throws** an actionable error
  naming both the widget and the provider (POC precedent).
- The mounted-instance rule also closes the stale-value hazard from Context fact 1: a value typed
  into a since-unmounted widget can never be submitted, because the next `submit()` fails the
  presence check.

### reset() and in-flight requests

`reset()` keeps its verified current semantics (Context fact 4): while a confirmation is in
flight it is a refusal — values stay on screen, the request is not cancelled, and the inputs are
non-interactive for that whole window; once the promise settles, `reset()` clears values,
validation state, displayed errors and the visible expiry text.

### Widget unmount during an in-flight request

- Widget unmount does not abort an in-flight confirmation. Only provider unmount and
  session/environment replacement abort (existing cancellation semantics, unchanged).
- The in-flight promise settles normally and is delivered to the `submit()` caller.
- All widgets are non-interactive while a confirmation is in flight or `disabled` is set
  (`editable=false` threaded through the coordinator — the standalone form's existing behaviour).

### Per-widget error rendering

- Every custom widget uses its own existing error-visibility predicate — the same per-field
  predicates the ready-made split layout uses today.
- Every custom widget uses the existing error typography and localisation (the `renderError`
  presentation and `localisation.validationMessages`).
- The cross-field error priority chain exists only in the ready-made fused (non-split) layout.
  Custom widgets do not reproduce a cross-field priority chain: each widget shows only its own
  field's error, directly beneath itself.

### Aggregate onStateChange and the mounted-widget registry

The provider's aggregate `onStateChange` incorporates the registry — react-final-form validity
alone is never trusted (Context fact 1: RFF drops a field's validation on unmount while keeping
its value):

- `complete` is true only when exactly one of every required widget is currently mounted **and**
  all three fields are valid.
- A missing field reports that field's validity as false.
- Any missing or duplicate widget forces `complete = false`.
- Mounting or unmounting a widget recalculates and emits the aggregate state; unmounting a
  required widget immediately emits with `complete = false`.
- Stale react-final-form validity can never make `complete = true`.

### Form and submission invariants

- `HyperswitchVaultFormProvider` owns exactly one `ReactFinalForm.Form`.
- Widgets never create nested forms.
- `submit()` never throws — not for missing or duplicate widgets, not for validation failures,
  not for configuration failures, not for transport failures. Every one of those is a typed
  result.
- The only throw in the surface is rendering a widget outside its provider.
- Repeated `submit()` while a confirmation is in flight preserves the current shared-promise
  behaviour: the caller receives the same promise, and no second request is issued.

### Focus ordering

- Auto-advance follows the canonical semantic order **number → expiry → CVC** regardless of the
  merchant's visual arrangement; if the next field's widget is not mounted, the advance is a
  no-op. The CVC blur-on-complete behaviour is unchanged.
- `formRef.focus(field)` focuses that field's widget when mounted, no-op otherwise (existing
  semantics).
- `WidgetHandle.focus()` / `blur()` act on that widget's own input.

### Appearance and localisation inheritance

Provider-level `appearance` and `localisation` (same types as the form) flow to every widget
through the private context. Widgets take no per-widget `style` / `textStyle` this phase
(divergence from the POC, deliberate — smallest surface). Placeholders and floating labels remain
`localisation.labels`. `brandIconMode` continues to govern the brand accessory inside
`CardNumberWidget`.

### Raw card values

- Raw card values are never stored in the provider context.
- They are never exposed publicly, and never emitted through callbacks, events, refs, errors or
  logs.
- Internal handlers may transiently receive input as function arguments (a change handler
  receives the typed text to format and forward into react-final-form); they do not retain it.
- Outside react-final-form, only safe metadata is retained — registration entries, the detected
  brand string, validity booleans, focus/clear callbacks, `editable`. The one field-display
  exception is each field's own visible input text (today: the expiry display string), which is
  retained only inside that field's widget as its input state and is never placed in the
  coordinator context.
- The package logs nothing (unchanged, and reaffirmed by the duplicate-widget decision above).
- `WidgetHandle` exposes focus/blur only.

### Generated TypeScript acceptance condition

In the published declarations, `HyperswitchVaultFormProvider`'s `children` must be
`React.ReactNode` — not `JSX.Element` — and must compile with multiple sibling widgets, with
fragments, and with widgets nested inside merchant-owned Views. This is an acceptance condition
verified in the consumer type-tests (the `tsconfig.consumer.json` harness, which compiles under a
merchant's exact React Native compiler settings); genType's own emission for children is narrower,
so the guarantee is provided and proven at the published-declaration layer.

### Transport-contract growth

The mounted-widget registry cannot discover an unknown future backend field automatically.
Coupling is therefore made structural: widget kinds are a closed type, and the submit path
constructs the full transport `cardDetails` record through an exhaustive mapper from that closed
type (or an equivalent build-time coverage gate). If the transport contract gains a field, that
construction no longer compiles — the build fails until an explicit widget decision is made.

### Events

Out of this phase. The provider's aggregate `onStateChange` above is existing form-level parity,
not an event surface. The registration entries are the prepared safe observation points for a
later per-widget `onStateChange` (POC `FieldState` shape, safe fields only); nothing per-widget is
exposed now.

## Alternatives considered

### A — dual-mode HyperswitchVaultForm (childless = ready-made, children = coordinator)
- For: one public component; childless behaviour trivially unchanged; closest to the POC's
  merchant snippet.
- Against: the five reasons above.
- Why rejected: the provider gives the same merchant experience with explicit names and no mode
  boundary.

### C — renderLayout render prop handing pre-built field elements to the merchant
- For: no registration mechanism.
- Against: does not actually solve missing-field detection (the merchant can still drop an
  element); worse generated-type ergonomics; matches no first-party precedent.
- Why rejected: fails the problem it appears to solve.

### Do nothing — splitCardFields stays the only layout control
- For: zero risk, zero cost.
- Why rejected: blocks the stated product direction (POC-parity merchant experience) and the
  events phase, both of which presuppose widgets.

## Implementation plan (Checkpoint 1 executed 2026-08-18; Checkpoint 2 executed 2026-08-18)

**Checkpoint 1 — extraction, no new public API.** Extract the private coordinator/field-core out
of `CardFormView` (shared-handler extraction, not duplicated glue). `HyperswitchVaultForm` and
`/embedded` observable behaviour must not change. The co-badge/Tooltip/ViewportContext chrome
stays outside the standalone coordinator: the existing injected `renderSchemeAccessory` boundary
is preserved, and no co-badge dependency is introduced into the root standalone provider. Verify:
formatting, validation, focus/backspace, errors, accessibility, testIDs, icons, analytics and
reset — plus the standing matrices (`yarn build && yarn verify`; example `tsc --noEmit` + jest;
client-core `re:check` + `build:web`) and the manual device checklist. `/embedded` bytes will
change; behavioural parity is the bar.

**Checkpoint 2 — the public surface.** Add `HyperswitchVaultFormProvider` and the three widgets;
presence/duplicate registration with the contract above; `WidgetHandle` focus()/blur();
custom-layout examples and verification — including negative tests: missing widget gives
`not_ready` with zero fetches, duplicate gives `not_ready` with zero fetches, outside-provider
throws, unmount-during-flight, stale-value-never-submitted, and the generated-TypeScript
acceptance condition (multiple siblings, fragments, nested Views).

## Consequences

### What becomes easier
- The events phase: per-widget `onStateChange` and richer `WidgetHandle` slot into the registry.
- Merchant migration from POC-style code: same widget names, same submit-by-ref shape.
- Reasoning: one name per meaning; each component has one behaviour.

### What becomes harder
- Two top-level components to document ("which do I use?" — answer: ready-made vs custom layout).
- Future built-in-layout features (e.g. a co-badge picker, if unparked) need an explicit
  widget-mode answer or a documented ready-made-only label.

### What we are locked into
- The private-context coordination model and root-entry-only widget exports.
- A closed widget set (no merchant field names) — deliberate, and load-bearing for the
  transport-contract build gate.
- The shared field-core: `CardFormView` refactors now affect both public components.

### What we are locked out of
- Nothing structural. A dual-mode form could still be added later as sugar over the provider;
  the provider cannot be cleanly removed once public.

## Top failure modes

| # | Mode | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|------------|-------|
| 1 | Missing/unmounted widget lets a stale or empty value reach the transport | H (proven mechanism) | H | Mounted-registry check before reading values; `not_ready`, zero network; negative-tested. `validateCard` stays as defence-in-depth | implementer |
| 2 | Behavioural drift between ready-made form and widget path | M | H | One shared field-core consumed by both; Checkpoint 1 lands the extraction alone with full parity verification before any new surface exists | implementer |
| 3 | `/embedded` regression from the shared extraction (client-core's paying checkout) | M | Very high | Checkpoint 1 gate: full client-core matrix + manual device checklist; D1–D15 preserved untouched | implementer + user |
| 4 | POC package evolves; two Juspay packages export same-named widgets with different props (organizational) | M | M | README states the reference-not-dependency relationship; naming parity is a snapshot, not a coupling | user |
| 5 | react-final-form unregisters a field's validation on unmount while retaining its value, so form validity lies after a widget unmounts (verified against the bundled final-form 5.0.0) | H (proven) | H | The mounted-widget registry — never bare RFF validity — gates `submit()` and `complete`; the bundled RFF version stays pinned; direct mount/unmount lifecycle tests assert both the value-retention and the validity-flip | implementer |
| 6 | PMS-confirm contract gains a required input; widget-mode merchants are structurally missing a widget (right call, bad luck) | L | M | The closed widget-kind type plus the exhaustive mapper to `cardDetails` makes a transport-contract change fail the build until an explicit widget decision is made; the registry cannot and does not claim to discover unknown fields at runtime | implementer |

## Migration path off this decision

If the provider proves wrong, `HyperswitchVaultForm` already covers every merchant who accepts the
built-in layout; the provider and widgets could be deprecated as one unit without touching the
form, the transport, or `/embedded`. The shared field-core extraction stands on its own merits
either way.

## Open questions

- Per-widget `style` / `textStyle` overrides (POC has them; deferred here).
- The events-phase `FieldState` field list and its safe-state boundary.
