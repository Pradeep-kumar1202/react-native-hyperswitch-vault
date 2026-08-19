# Manual runtime procedure — Android and iOS

**Why this exists.** Everything else in this repository is verified automatically: ReScript
compiles, declarations are generated and type-checked against the real React Native tsconfig, the
tarball contents are asserted, the result-mapping table is executed, three consumer fixtures prove
react-final-form module identity, and the lifecycle contract is exercised with `react-test-renderer`
under the React Native jest preset.

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

The server mints the vault session the same way hyperswitch-client-core does: `POST /payments` with
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
  (`splitCardFields` is off for the standalone form);
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

- the status line reads `Card saved •••• <last4>`;
- one `POST …/v1/payment-method-sessions/{id}/confirm` in the proxy, returning 2xx;
- **nothing** on screen or in Metro / logcat / Console.app shows the token, the PAN, the expiry, the
  CVC, `sdk_authorization`, or anything decoded from it. Check the logs explicitly:
  `npx react-native log-ios` / `npx react-native log-android`.

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

Record the device model and OS version beside the ticks — keyboard and text-measurement behaviour
varies more between OS versions than between devices. File a failure with the platform, the OS
version and which field was focused: nearly every layout issue in this form is focus-state
dependent.
