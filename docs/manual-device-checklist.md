# Manual runtime procedure — Android and iOS

**Why this exists.** Everything else in this repository is verified automatically: ReScript
compiles, declarations are generated and type-checked against the real React Native tsconfig, the
tarball contents are asserted, the result-mapping table is executed, a packed-consumer fixture
proves that the entry imports and bundles no form library, and the lifecycle contract is exercised
with `react-test-renderer` under the
React Native jest preset.

None of that is a device. The automated suite **builds and bundles** the example; it has never been
launched on a simulator or a handset. Keyboard behaviour, focus movement between native inputs, text
measurement, secure entry, dimming, and what actually happens when the radio drops can only be
confirmed by looking at it.

Walk this once per platform before release, and again after any change to `CardInput.res`,
`CardFormView.res`, `HyperswitchVaultForm.res` or the theme defaults.

Every step is executable from the example app as shipped. The app opens on a demo storefront;
tap **Dev** (bottom right) for the developer panel, whose buttons — **Reset**, **Submit ×2**,
**New session**, **Focus …** — exist for exactly this purpose. No code editing is required.

The storefront itself is worth one pass too: it exercises the ordering a real integration has,
where **Checkout** calls the merchant server first and the card sheet only appears once a session
comes back.

---

## 0. Setup

### 0.1 Common (once)

```sh
cd <repo>
git submodule update --init --recursive
yarn install
yarn build
```

`yarn build` must end with `[emit-package-type] OK`. If it fails on `check:generated`, run
`yarn re:build` and stage `src/*.gen.tsx`.

### 0.2 Start the merchant backend (terminal 1, both platforms)

```sh
cp example-server/.env.example example-server/.env    # first run only
cd example-server && npm start
```

Expect:

```
[merchant-server] listening on http://localhost:3001
[merchant-server] Android emulator reaches this at http://10.0.2.2:3001
[merchant-server] mode: offline — serving a FAKE session; no card will be vaulted
```

Offline mode is enough for steps 1–4 and 6–8. **Step 5 needs `mode: live`** — see 0.5.

### 0.3 iOS (terminal 2)

```sh
cd example
bundle install          # first run only, installs CocoaPods
cd ios && bundle exec pod install && cd ..
yarn ios                # or: yarn ios --simulator "iPhone 16"
```

The simulator reaches the server on `http://localhost:3001`; no forwarding is needed. If Metro is
not already running, `yarn ios` starts it.

### 0.4 Android (terminal 2)

```sh
cd example
yarn android
adb reverse tcp:8081 tcp:8081     # only if Metro cannot be reached
```

The emulator reaches the host machine on `10.0.2.2`, which `App.tsx` already selects by platform.
**On a physical Android device** `10.0.2.2` does not exist — set `LAN_OVERRIDE` in `example/App.tsx`
to your machine's LAN address (`http://192.168.x.x:3001`) for the run, and revert it afterwards.

### 0.5 Live sandbox mode (step 5 only)

Fill `HYPERSWITCH_API_KEY`, `HYPERSWITCH_PROFILE_ID` and `HYPERSWITCH_CUSTOMER_ID` in
`example-server/.env`, then restart the server. Do not type credentials into a terminal that logs
history, and never into `example/`.

`example-server/.env` is gitignored and lives outside the app directory. The key stays on the
server; the app never receives it. The server logs only the mode, never a value and never the
session contents. Expect `[merchant-server] mode: live (sandbox)`.

The server mints the vault session with `POST /payments` and
the secret key, then `POST /payments/session_tokens` authenticated with that intent's own
`sdk_authorization`. The intent is never confirmed, so no money moves.

### 0.6 Watching requests (steps 6, 7, 8)

Run a proxy (Proxyman, Charles, mitmproxy) and trust its certificate on the device.

- iOS Simulator: Proxyman → *Install Certificate → iOS Simulators*.
- Android emulator: `adb root && adb remount`, install the CA, or run the emulator with
  `-http-proxy http://10.0.2.2:9090`.

**Never copy the `Authorization` header out of the proxy** — into a ticket, a screenshot, a chat
message, or this repository. It bears the session's client secret. Read the request line and the
body shape; redact the header at capture time.

---

## 1. Rendering

1. Launch the app. Wait for the card form.

**Expect**

- three fields in ONE bordered block: card number on top, expiry and CVC sharing the row beneath;
- no gap between the rows, and rounded corners only on the outside of the block
  (the default `layout` is `stacked` and `fieldArrangement` is `separate`);
- resting placeholders read `Card number`, `MM / YY`, `CVC`;
- under the divider: `Manual checks — session #1, form incomplete`
  (tap **Dev** first — the app opens on the storefront).

**Also check**

- rotate the device: no clipping, no overlap;
- raise the OS text size to its largest setting and relaunch — labels and input text scale without
  clipping. (iOS: Settings → Accessibility → Display & Text Size → Larger Text. Android: Settings →
  Display → Font size.)

## 2. Validation

1. Type `4242424242424241` (last digit deliberately wrong) into the card number.
2. Tap outside the field to blur it.

**Expect** exactly one inline message under the block, in red, and the field's border and text turn
red. The message must appear on **blur**, not while typing.

3. Fix it to `4242424242424242`. The message clears.
4. Enter `01 / 20` (a past date) in expiry.

**Expect** the expiry error only once all five digits are present — a partially typed date must not
show an error.

5. Enter `1` in the CVC and blur.

**Expect** the CVC error on blur, not while typing.

6. Clear all three fields and press **Save card**.

**Expect** field errors appear for all three, the status line reads *"Please check your card details
and try again."*, and `validation_error / invalid_card_data` under it. **No request is made** —
confirm in the proxy that nothing was sent.

## 3. Focus and backspace

1. Type a complete valid card number: `4242 4242 4242 4242`.

**Expect** focus jumps to expiry by itself the moment the number is complete and valid.

2. Type `12` then a future year, e.g. `30`.

**Expect** focus jumps to CVC once the expiry is complete and valid.

3. In the CVC, press backspace until it is empty, then press backspace **once more**.

**Expect** focus moves to expiry.

4. In expiry, press backspace until empty, then once more.

**Expect** focus moves to the card number.

5. In the card number, press backspace until empty, then once more.

**Expect** the field **blurs itself** and the keyboard dismisses. This is pre-existing card-form
behaviour, deliberately preserved — see `docs/card-element-behavior-contract.md` §17.2. Do not
"fix" it here.

6. Tap **Focus number**, **Focus expiry**, **Focus CVC** in turn.

**Expect** the keyboard opens on the named field each time.

7. Focus each field and watch the label.

**Expect** the placeholder animates up into a floating label and back down when the field is
emptied and blurred. The CVC renders as dots, never digits.

## 4. Reset

1. Fill all three fields with a valid card. Blur.
2. Press **Reset**.

**Expect** all three fields are empty — **including the visible `MM / YY` text**, which is React
state rather than a form value and is the thing most likely to regress — and no error is displayed.

3. Type an invalid number, blur so the error shows, then press **Reset**.

**Expect** the value and the error both disappear.

4. Fill a valid card, press **Save card**, and press **Reset** while the request is still in flight
   (throttle the proxy or use Airplane mode to widen the window).

**Expect** **nothing happens** — the fields keep their values and the request is not cancelled.
`reset()` is deliberately refused for that window so a pending result can never be misread as
belonging to a newer card. Once the request settles, **Reset** clears the form as usual.

## 5. Real sandbox tokenization

Requires 0.5 (`mode: live`).

1. Restart the app so it fetches a live session (`session #1`).
2. Enter a valid Hyperswitch sandbox test card, a future expiry and any CVC of the right length.
3. Press **Save card**.

**Expect**

- the status line reads `Card saved` — `submit()` returns the token only, so there is no last4 to
  render;
- one `POST …/v1/payment-method-sessions/{id}/confirm` in the proxy, returning 2xx;
- **nothing** on screen or in Metro / logcat / Console.app shows the PAN, the expiry, the CVC,
  `sdk_authorization`, or anything decoded from it. Check the logs explicitly:
  `npx react-native log-ios` / `npx react-native log-android`. (The token itself *is* rendered, in
  the panel labelled "demo only" — an example-app affordance, not a pattern to copy. It must still
  never appear in a log.)

## 6. Double submit sends one request

1. Fill a valid card.
2. Press **Submit ×2** (it calls `submit()` twice in the same tick, as a double tap would).

**Expect**

- the small line under the status reads `same promise returned`;
- the proxy shows **exactly one** confirm request;
- both calls resolve with the same outcome.

3. Repeat with a rapid physical double-tap on **Save card**.

**Expect** the same: one request. The button is also disabled while busy.

4. While the request is in flight (use a throttled proxy or Airplane mode to widen the window),
   try to type into the fields and press **Reset**.

**Expect** the inputs are dimmed and **do not accept input**, and **Reset does nothing** until the
request settles. Both are deliberate: the card being confirmed must not change underneath the
request. Once it settles, the fields accept input and **Reset** clears them again.

## 7. Timeout / unknown outcome

1. Fill a valid card. Do not submit yet.
2. Turn on Airplane mode (iOS Simulator: disable the host's network, or use Network Link Conditioner
   → 100% Loss. Android emulator: `adb shell svc wifi disable && adb shell svc data disable`).
3. Press **Save card**.

**Expect**

- the status line reads *"We could not confirm your card. Please check before trying again."*;
- the detail line reads `error / unknown_outcome` — **not** a network error;
- **nothing retries by itself**. Watch the proxy for at least 30s: no second request.

4. Restore the network. Press **Save card** again.

**Expect** exactly one new request. The library never retries an unknown outcome for you — that
decision is yours, after checking on your own backend.

5. Repeat, but this time background the app mid-request (press Home) and return.

**Expect** the same single result, no crash, and no "state update on an unmounted component"
warning in the logs.

## 8. Session replacement

1. Fill a valid card and press **Save card**, then — while it is still in flight — press
   **New session**. (Throttle the proxy or use Network Link Conditioner to widen the window.)

**Expect**

- the in-flight request is **cancelled** in the proxy;
- the status line shows the unknown-outcome message and `error / unknown_outcome`;
- the header now reads `session #2`.

2. Fill a valid card again and press **Save card**.

**Expect** the new request goes to a **different** `payment-method-sessions/{id}` path than the
cancelled one, and carries a different `Authorization` header. Compare the two request *lines* in
the proxy; do not copy the header values anywhere.

3. Press **New session** while nothing is in flight, then **Save card**.

**Expect** a normal single request against the newest session.

---

## 9. Merchant styling (`fieldStyles` / `styles`)

**Not yet performed.** Every styling claim in the README and in ADR-0002 §9 is currently backed by
`react-test-renderer` plus a Metro bundle — no pixel has been rendered on a device. This section is
the pass that has to happen before the styling API is announced.

Use the example app's custom-layout screen and the ready-made form, applying the styles below.

### 9.1 Custom font family

Bundle a font the OS does not have by default and set it on `input`, `placeholder` and `label` for
all three fields.

| Check | Expect |
|---|---|
| the input text uses the custom face | not a silent fallback to System |
| the resting placeholder and the floating label both use it | the label keeps the face through the whole float |
| Android missing-font behaviour | Android silently falls back where iOS may not — compare the two side by side |

### 9.2 Label endpoints, very large and very small

Set `placeholder: {fontSize: 34}` with `label: {fontSize: 8}`, then invert it
(`placeholder: {fontSize: 9}`, `label: {fontSize: 30}` — floating LARGER than resting, which the API
allows).

| Check | Expect |
|---|---|
| the label animates smoothly between the two sizes | no jump, no flicker, no mid-animation reflow |
| the large resting label fits the box | it must not clip or overlap the accessory icon |
| the inverted pair | still animates; the floating label must not spill out of the box top |
| the label never collides with the typed text | at every size pair |

### 9.3 Floating-label animation

| Check | Expect |
|---|---|
| tap in / tap out, unstyled | the label floats and returns, size and position both animating |
| the same with only `placeholder: {color}` set | identical animation — a non-`fontSize` style must not disturb it |
| the same with both endpoints set | animates between the merchant's two sizes |
| type, then blur with content | the label stays floated |

### 9.4 RTL

Set `localisation={{isRtl: true}}` and, separately, force the OS into an RTL locale.

| Check | Expect |
|---|---|
| the expiry/CVC row reverses | CVC on the left, expiry on the right |
| merchant `container` styles follow the field, not the position | the CVC's colour stays on the CVC |
| `input.textAlign` set by the merchant | honoured, and not fought by RTL auto-alignment |
| the accessory icons | still inside their own field's box |

### 9.5 Split and fused layouts

| Check | Expect |
|---|---|
| fused, no merchant styles | one bordered block; shared edges are a single visual line, inner corners square |
| split, no merchant styles | three separately bordered fields, each with rounded corners |
| fused, merchant `container.borderColor` on all three | the join still reads as one block, in the merchant's colour |
| fused, merchant `container.borderRadius` on the card number only | corners change as asked — this is a legitimate override, not a bug |
| split, merchant `container.height` on expiry only | the row does not misalign the CVC |

### 9.6 Error positioning

| Check | Expect |
|---|---|
| split layout, invalid card number | the message appears under the card-number field only |
| fused layout, invalid expiry | one message under the whole block, in the expiry's `error` style |
| fused layout, several fields invalid | one message, card number first, in the card number's `error` style |
| a large merchant `error.fontSize` | the message does not overlap the field above or the button below |
| the error appears and disappears | no layout jump that moves the submit button under the user's finger |

### 9.7 Registered styles

Pass `StyleSheet.create({...}).x` — not inline objects — for `container`, `input`, `placeholder` and
`label`.

| Check | Expect |
|---|---|
| every slot behaves identically to the inline form | registered IDs must resolve the same way |
| `placeholder`/`label` `fontSize` inside a registered style | still becomes an animation endpoint |
| an array and a nested array containing a registered style | same result |

### 9.8 Field height

| Check | Expect |
|---|---|
| `container: {height: 72}` on one field | the box grows, the input stays vertically centred, the label still floats inside it |
| a merchant height smaller than `appearance.inputHeight` | the text must not clip; note which layer wins |
| the accessory icon in a taller box | stays centred, does not stretch |

### 9.9 Brand and CVC accessories

| Check | Expect |
|---|---|
| type a Visa, then a Mastercard, with `accessory: {width: 56}` | the icon swaps and the merchant width holds through the swap |
| an unknown scheme | the neutral placeholder card renders, still at the merchant's width |
| CVC `accessory` styled | the CVC hint icon respects it; the expiry field has no accessory at all |
| a very wide accessory | the input shrinks rather than the icon clipping |

### 9.10 Font scaling and accessibility settings

Raise the OS text size to its maximum, and turn on bold text.

| Check | Expect |
|---|---|
| unstyled fields at max text size | already covered by step 1 — re-confirm it still holds |
| merchant `input.fontSize` at max text size | note whether the merchant value or the OS scaling wins, and that nothing clips |
| merchant label endpoints at max text size | the float still animates and the label still fits |
| VoiceOver / TalkBack over a styled form | the reading order and labels are unchanged by styling |

---

## 10. Merchant state events (`onStateChange` / `onFormStateChange`)

**Not yet performed.** Every event claim is currently backed by `react-test-renderer` plus a Metro
bundle. Emission ordering, focus interaction and screen-reader behaviour are exactly the things a
JS-level renderer cannot tell you about.

Attach both callbacks in the example app and log every snapshot to the console.

### 10.1 Typing transitions

| Check | Expect |
|---|---|
| type one digit at a time into the card number | `empty` → `incomplete` → `complete`, once each, never a per-keystroke storm |
| the same on the expiry and CVC | same three-way progression |
| delete back to empty | returns to `empty`, brand returns to `'unknown'` |
| paste a full card number | a single transition straight to `complete` |

### 10.2 Focus and blur ordering

| Check | Expect |
|---|---|
| tap into a field | `focused: true` arrives before any error would |
| tap directly from one field to another | the leaving field reports `focused: false`, the entering one `true`; no interleaving that shows both true |
| dismiss the keyboard | the focused flag clears |
| the OS "next" key | ordering is the same as a tap |

### 10.3 Auto-advance from card number to expiry

| Check | Expect |
|---|---|
| complete a 16-digit PAN | focus moves to expiry, and the two snapshots agree: card number `focused: false, status: 'complete'`, expiry `focused: true` |
| a 15-digit Amex | advances at 15, not 16 |
| advance, then tap back | no spurious error on the card number |

### 10.4 Expiry backspace focus movement

| Check | Expect |
|---|---|
| backspace on an empty expiry | focus returns to the card number and the flags follow |
| backspace on an empty CVC | focus returns to expiry |
| the snapshots during that move | exactly one field reports `focused: true` at rest |

### 10.5 Brand changes

| Check | Expect |
|---|---|
| type a Visa, clear, type a Mastercard | `brand` changes once per detection, and matches the icon on screen |
| an unrecognised BIN | `'unknown'`, and the neutral placeholder card |
| a scheme with no artwork (RuPay, Maestro, UnionPay, Sodexo, Bajaj) | the brand is still reported by name even though the artwork is the generic card |

### 10.6 Validation timing

| Check | Expect |
|---|---|
| half-type and stay focused | no `error` in the snapshot, and none on screen |
| blur | the error appears in the snapshot **and** on screen, in the same frame |
| press Pay with an invalid field | the error appears without a blur |
| correct the value | the error clears in both places together |
| `reset()` | errors clear, statuses return to `empty` |

### 10.7 Rapid typing

| Check | Expect |
|---|---|
| type as fast as the keyboard allows | the last snapshot matches what is on screen — no lag, no stale final value |
| autofill / a password manager filling all three | the final snapshot is `complete` and `canSubmit` |
| type while a submission is in flight | inputs are non-interactive, and `submitting` stays true |

### 10.8 Submission button state

| Check | Expect |
|---|---|
| a Pay button bound to `canSubmit` | disabled until all three are complete, and only then |
| press Pay | the button disables immediately (`submitting: true`) |
| on success / failure / timeout | the button re-enables exactly once, and the state matches the result |
| an unusable session | the button never enables, even with a fully valid card |

### 10.9 Screen unmount during submission

**Harness limitation.** `react-test-renderer` runs React 19's Strict Mode faithfully — a probe
confirmed the effect sequence really is `mount, cleanup, mount`, and the lifecycle suite exercises
it. What it cannot model is the *native* side: it has no real `TextInput`, so it cannot show whether
a field loses native focus across a Strict Mode replay, whether the keyboard dismisses, or whether
an in-flight native request survives a screen teardown. Those three belong here and nowhere else.

| Check | Expect |
|---|---|
| a development build with Strict Mode on, tap into a field | focus is not stolen back by the effect replay; the keyboard stays up |
| the same on a release build | identical behaviour, no double-mount artefacts |

| Check | Expect |
|---|---|
| navigate away mid-submit | no callback fires after the screen unmounts; no warning in the console |
| navigate back | a fresh initial snapshot, and no leaked in-flight state |
| background the app mid-submit, then return | state is coherent; nothing double-fires |

### 10.10 Callback replacement during rerender

| Check | Expect |
|---|---|
| a parent that rerenders on every keystroke with an inline arrow callback | no extra emissions, no field remount, no lost focus |
| swap the callback for a different function | the next real change goes to the new one only |

### 10.11 Accessibility and screen readers

| Check | Expect |
|---|---|
| VoiceOver / TalkBack focus moves between fields | the `focused` flags match what the screen reader announces |
| a merchant-rendered error driven by `error.message` | announced once, not duplicated with the library's own message |
| a merchant Pay button driven by `canSubmit` | its disabled state is announced correctly |
| OS font scaling at maximum | events unchanged; only layout differs |

---

## 11. External-consumer install (device leg)

**Not yet performed on a device.** Phase 4 verified the packed tarball in a clean external project:
a real `yarn install` outside this repository, no workspace links, no aliases, TypeScript against
the packed declarations, and Metro release bundles for both platforms on React Native 0.79.1 and
0.79.7. What that cannot show is a build running on hardware.

| Check | Expect |
|---|---|
| a fresh app created outside this repo, `yarn add` the tarball, no Metro or Babel changes | builds and launches |
| the card artwork on a device | brand icons and the CVC hint render at the right density (@1x/@2x/@3x) |
| Hermes release build | the bundle byte-compiles and runs; no dynamic-require failure at startup |
| an Expo managed project | **unverified** — if attempted, record the result rather than assuming |

## 12. Real sandbox tokenization

Real sandbox tokenization remains a manual integration gate. See §5 above for the procedure; nothing
in the automated suite performs a live request, and no production request has ever been made.

---

## 13. Default UI — what ships, and stripping it back

**Not yet performed.** The rendered-tree proofs are `react-test-renderer` plus Metro bundling; no
pixel has been rendered.

| Check | Expect |
|---|---|
| the zero-configuration form on a device | four complete fields — floating label, brand mark on the number, CVC glyph, and an inline message after an invalid blur |
| `unstyled` on the provider | four bare inputs: no box, no border, no background, no fixed height, nothing but text you position yourself |
| `unstyled` with a per-feature prop, e.g. `unstyled errorDisplay="inline"` | still bare — `unstyled` wins over the per-feature props rather than being overridden by them |
| **floating-label cost while typing a full PAN** | no dropped frames and no lag on a low-end Android device. The lift animation is JS-driven (`fontSize` and `height` cannot use the native driver) and now runs only on the down/up transition, not per keystroke — this row exists to confirm that on real hardware |
| **the floating touch target** | tapping the TOP third of a field still focuses it. Floating mode gives the input 70% height and bottom alignment, so the whole box must still respond, not just the lower two thirds |
| tap through an `unstyled` form | focus ring moves, keyboard opens, auto-advance still works with nothing visible to read |
| VoiceOver / TalkBack on an `unstyled` form | each field is still announced "Card number" / "Expiration date" / "Security code" |
| `labelBehavior="static"` | the label sits above the box and never overlaps the placeholder at any font scale |
| `labelBehavior="floating"` | the animation is unchanged, and no second placeholder shows behind it |
| `labelBehavior="none"`, empty field | the placeholder sits on the vertical centre line of the box, not below it |
| `labelBehavior="none"`, typing | the typed text keeps exactly the placeholder's baseline — no jump when the placeholder goes |
| `appearance.inputHeight` 32 / 48 / 72 | the placeholder stays centred at every height |
| max OS font scale with a placeholder | placeholder and typed text stay centred and unclipped |
| `labelBehavior="none"`, empty field | the placeholder sits on the vertical centre line of the box, not below it |
| `labelBehavior="none"`, typing | the typed text keeps exactly the placeholder's baseline — no jump when the placeholder goes |
| `appearance.inputHeight` 32 / 48 / 72 | the placeholder stays centred at every height |
| max OS font scale with a placeholder | placeholder and typed text stay centred and unclipped |
| `layout="stacked"` vs `"inline"` | stacked gives three rows; inline puts expiry and CVC side by side, and reverses under RTL |
| `fieldArrangement="fused"` at inline | shared edges read as one line on both platforms |
| `errorDisplay="none"` with an invalid field | nothing appears, the border and typed text stay their normal colours, and the layout does not shift |
| `errorDisplay="inline"` | the message appears without pushing the Pay button under the user's finger |
| `brandIconMode` `'standard'` → `'hidden'` / `cvcIcon` on then off | correct density artwork when on; no reserved space when off |
| `brandIconMode="animated"` on `appearance`, `'hidden'` on the field | the field's mark stays off — the field value wins over the form-wide one |
| VoiceOver / TalkBack over an enabled brand or CVC icon | the icon is skipped entirely; it is never announced as a button and never takes focus |
| max OS font scale, default form | the floating labels and marks keep their positions and do not clip |

---

## Recording results

| # | Check | iOS | Android |
|---|---|---|---|
| 1 | Rendering, rotation, large text | ☐ | ☐ |
| 2 | Validation timing and no-request-on-invalid | ☐ | ☐ |
| 3 | Focus, backspace, floating labels, masked CVC | ☐ | ☐ |
| 4 | Reset clears values, expiry text and errors | ☐ | ☐ |
| 5 | Real sandbox tokenization, nothing sensitive logged | ☐ | ☐ |
| 6 | Double submit = one request; locked and reset-refused while in flight | ☐ | ☐ |
| 7 | Timeout / unknown outcome, no auto-retry | ☐ | ☐ |
| 8 | Session replacement cancels and never reuses the old authorization | ☐ | ☐ |
| 9.1 | Custom font family on input, placeholder and label | ☐ | ☐ |
| 9.2 | Very large / very small / inverted label endpoints | ☐ | ☐ |
| 9.3 | Floating-label animation, styled and unstyled | ☐ | ☐ |
| 9.4 | RTL row direction and per-field style ownership | ☐ | ☐ |
| 9.5 | Split and fused layouts, default and overridden | ☐ | ☐ |
| 9.6 | Error positioning and error-style selection | ☐ | ☐ |
| 9.7 | Registered styles, arrays and nested arrays | ☐ | ☐ |
| 9.8 | Field height overrides | ☐ | ☐ |
| 9.9 | Brand and CVC accessories under merchant styles | ☐ | ☐ |
| 9.10 | OS font scaling and accessibility settings | ☐ | ☐ |
| 10.1 | Typing transitions empty → incomplete → complete | ☐ | ☐ |
| 10.2 | Focus and blur ordering | ☐ | ☐ |
| 10.3 | Auto-advance from card number to expiry | ☐ | ☐ |
| 10.4 | Expiry/CVC backspace focus movement | ☐ | ☐ |
| 10.5 | Brand changes, including schemes without artwork | ☐ | ☐ |
| 10.6 | Validation timing matches the visible UI | ☐ | ☐ |
| 10.7 | Rapid typing and autofill | ☐ | ☐ |
| 10.8 | Pay button state through every submission outcome | ☐ | ☐ |
| 10.9 | Screen unmount during submission | ☐ | ☐ |
| 10.10 | Callback replacement during rerender | ☐ | ☐ |
| 10.11 | Accessibility and screen-reader interaction | ☐ | ☐ |
| 11 | External-consumer install, artwork density, Hermes release build | ☐ | ☐ |
| 12 | Real sandbox tokenization | ☐ | ☐ |
| 13 | Default UI: what ships, `unstyled`, labels, layout, icons, errors | ☐ | ☐ |

Record the device model and OS version beside the ticks — keyboard and text-measurement behaviour
varies more between OS versions than between devices. File a failure with the platform, the OS
version and which field was focused: nearly every layout issue in this form is focus-state
dependent.
