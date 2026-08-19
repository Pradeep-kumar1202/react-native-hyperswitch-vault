# Hyperswitch Vault library — end-to-end review

Independent review of all vault work completed to date. Claims in earlier documents were **not**
assumed correct; every material statement below was re-verified against current source, generated
declarations, freshly built bundles, a freshly packed tarball, client-core call sites, and runtime
probes with stubbed network calls.

**Review-only.** No production code, API, dependency or lockfile was changed. No real credentials
were used and no real vault or payment request was made. Two temporary probe test files were
created, executed and deleted; nothing else was added to either repository.

Where this review contradicts an earlier document, **the executable artefact wins** and the
disagreement is recorded.

---

## 1. Findings

### BLOCKER

#### B1 — client-core depends on the library through a sibling filesystem path

| | |
| --- | --- |
| Repository | hyperswitch-client-core |
| File / line | `package.json:45` |
| Symbol | `"@juspay-tech/react-native-hyperswitch-vault"` |

**Actual behaviour.** The dependency is `"file:../react-native-hyperswitch-vault"`. The package is
not on the registry (`npm view …` → `E404`), and the library repository has **zero commits**
(`git rev-list --count --all` = 0), so its content exists only in one working tree.

**Why it is a problem.** Any checkout other than this machine — CI, another developer, a release
build — cannot resolve the dependency. It also contradicts the binding file's own stated contract at
`src/utility/libraries/HyperswitchVault.res:4-6`, which says the package is "consumed here as a
published npm artifact — never as a source path, workspace link or yarn/npm link".

**Reproduction.** Clone client-core at HEAD `1eea95c` with these staged changes onto a clean
machine, run `yarn install` → resolution fails because the sibling directory does not exist.

**Impact.** client-core is unbuildable off this machine; the vault work cannot merge or ship.

**Introduced by this work.** Yes.

**Recommended direction.** Commit and publish the library (or an internal registry pre-release),
then pin a version range in client-core.

**Missing test.** A CI job that installs client-core from a clean checkout without the sibling
directory present.

### HIGH

#### H1 — A rejected session refresh keeps the previous intent's vault authorization

| | |
| --- | --- |
| Repository | hyperswitch-client-core |
| File / line | `src/hooks/UpdateIntentHook.res:222-240` |
| Symbol | the `Promise.catch` on the update-intent chain |

**Actual behaviour.** The resolve path clears vault details on a failed or empty response
(`:140-154`, `setVaultDetails(_ => None)`), and the comment there states why. The **rejection** path
at `:222-240` only calls `setLoading(FillingDetails)` and emits `api_call_failed`; it never clears
`vaultDetails`.

**Why it is a problem.** The whole vault-configuration design is fail-closed: a present-but-unusable
`vault_details` must never fall back to the raw-card path, and a superseded authorization must never
be reused. This path leaves the **previous intent's** authorization live in `VaultContext`.

**Reproduction.** Start a payment (vault session A resolved). Trigger an update-intent whose
`Promise.all2` rejects (airplane mode / DNS failure). The catch branch runs, `vaultDetails` still
holds A. Enter a card and submit → `CardVaultHook` resolves `HyperswitchVault{sdkAuthorization: A}`
and PMS-confirms the new intent's card against **session A**.

**Impact.** A card can be vaulted against a payment-method session that belongs to a superseded
intent. Best case the vault rejects it; worst case a token is created against the wrong session and
the subsequent `payments/confirm` uses a token the new intent does not own.

**Introduced by this work.** Yes — the clearing requirement is new; the catch block predates it and
was not updated.

**Recommended direction.** Clear vault details in the rejection path exactly as the resolve path
does. (Not applied — review only.)

**Missing test.** A client-core test asserting `vaultDetails` is `None` after a rejected
update-intent refresh. There is currently **no vault-related test anywhere in client-core**.

#### H2 — The entire widget/provider surface has never run on a device

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| Evidence | `docs/manual-device-checklist.md` covers the ready-made form only |

**Actual behaviour.** `HyperswitchVaultFormProvider` and the three widgets are verified by jest
(20 cases), type-tests, bundle analysis and Metro builds. No physical-device run exists for them.

**Why it is a problem.** Everything device-specific is unproven for the new public API: real
keyboard behaviour and `keyboardType`, focus transitions driven by a real IME, secure-text entry,
brand artwork at real densities, and a real vault round trip. The jest environment mocks
`TextInput`, so focus/blur assertions exercise mocked natives, not the platform.

**Reproduction.** Not applicable — this is an absence of evidence.

**Impact.** Merchant-facing risk concentrated in the newest, least-exercised code.

**Introduced by this work.** Yes.

**Recommended direction.** Extend the manual checklist to the widget screen and run it on both
platforms before any demo or release.

**Missing test.** A device checklist section for custom layouts.

### MEDIUM

#### M1 — After an expiry widget remount the aggregate reports `complete: true` but submission fails

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| File / line | `src/CardFieldUnits.res:274-300` (`useCardExpiryField`), `src/HyperswitchVaultFormProvider.res:126-141` (aggregate) |
| Symbol | widget-local `expireDate` vs react-final-form month/year values |

**Actual behaviour — probe-confirmed.** With all three widgets mounted and a valid card typed, then
the expiry widget conditionally unmounted and remounted:

```text
after typing   : complete=true  expiryValid=true   visible expiry "12 / 29"
while hidden   : complete=false expiryValid=false
after re-show  : complete=true  expiryValid=true   visible expiry ""      <-- inconsistent
submit()       : validation_error / invalid_card_data, 0 network requests
```

The month/year values survive in react-final-form, so the registry-aware aggregate recomputes
`expiryValid: true`; but the **visible** `MM / YY` string is widget-local `React.useState` and resets
to `""`, so the field's own validator (`makeExpiryValidator("")`) reports "required" and the submit
gate refuses.

**Why it is a problem.** Two public signals disagree. `complete` is documented as the thing that
drives a merchant's Pay button, so the button is enabled while the field looks empty and submission
cannot succeed.

**Reproduction.** Any conditional rendering of a card widget — a stepper, an accordion, a tab, a
`{show && <CardExpiryWidget/>}` — after the field has been filled.

**Impact.** Merchant enables Pay, the user taps, and gets a validation error pointing at an
apparently empty field. **Fail-safe on the network** (nothing is sent), so no bad request occurs.

**Introduced by this work.** Yes (Checkpoint 2).

**Recommended direction.** One of: seed the expiry display from the form values on mount; or exclude
a field whose display state is empty from `expiryValid`; or document conditional rendering as
unsupported.

**Missing test.** A widget-remount case in `customWidgets.test.tsx` asserting aggregate and submit
agree. The existing suite tests unmount (`complete=false`) but never **re**mount.

#### M2 — Publishing does not run the tarball, consumer or result-mapping gates

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| File / line | `package.json` `scripts.prepack` vs `scripts.verify` |

**Actual behaviour.** `prepack` is byte-identical to `build` (submodule pin, icon coverage, genType
drift, types, bundle, assets, consumer types). The `verify` script — `verify-icon-coverage`,
`verify-result-mapping`, `verify-tarball`, `verify-consumers` — is a **separate** entry point that
`npm publish` never triggers.

**Why it is a problem.** The checks that protect the published artefact specifically (no forbidden
files, no bundled peers, react-final-form module identity, no leaked card data in results) are
exactly the ones that do not run at publish time.

**Reproduction.** `npm publish` (or `yarn pack` + publish) → only `prepack` runs.

**Impact.** A regression in packaging or result sanitisation could ship.

**Introduced by this work.** Yes.

**Recommended direction.** Run `verify` from `prepack`, or gate publishing in CI.

**Missing test.** None applicable — this is a pipeline wiring gap.

#### M3 — Error-visibility and border predicates are duplicated with no gate

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| File / line | `src/CardFormView.res:208`, `:267`, `:342-348` vs `src/CardFieldUnits.res` `fieldOk` / `visibleError` |

**Actual behaviour.** The same boolean expressions exist twice: inline in `CardFormView`'s JSX (used
by the ready-made and embedded paths) and as record fields computed in `CardFieldUnits` (used by the
widgets). Verified: `CardFormView` never reads `visibleError`.

**Why it is a problem.** The two copies can drift silently. Nothing in the build compares them; only
tests would notice, and only for the cases they cover.

**Reproduction.** Change the CVC predicate in one place; the build stays green.

**Impact.** Ready-made and widget layouts could disagree about when an error is shown.

**Introduced by this work.** Yes, deliberately (recorded in ADR-0001), but unguarded.

**Recommended direction.** Have `CardFormView` consume `fieldOk`/`visibleError` from the hooks, or
add a test asserting the two agree across a matrix of meta states.

**Missing test.** A parity test over `(error, touched, active)` combinations.

### LOW

#### L1 — Dead scan-card code ships in the standalone merchant bundle

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| File / line | `dist/esm/index.js:3720-3752` (`CardScanTrigger`), `:3662` (`onScanned`) |

**Actual behaviour.** `CardScanTrigger` (~1.2 KB) and the `onScanned` handler are bundled into the
root entry. No root-entry component passes `scanCard` — verified: the prop appears in neither
`HyperswitchVaultForm.res` nor `HyperswitchVaultFormProvider.res` nor any widget — and
`CardFormView.res:45-48` renders the trigger only for `Some(capability)`. It is therefore
unreachable for merchants.

**Why it is a problem.** Unreachable code in a merchant bundle, and it makes "scan-card is not in the
standalone bundle" false.

**Correction of an earlier claim.** `docs/current-vault-implementation-review.md` states that
`scancard`/`ScanCard` appear "0 times" in `dist/esm/index.js`. That grep is misleading: the symbol is
`CardScanTrigger`, which contains neither substring. The component **is** present.

**Impact.** Negligible size; zero functional exposure (no native module, no public prop).

**Introduced by this work.** Yes.

**Recommended direction.** Accept and document, or split the scan trigger behind the embedded-only
compilation path.

**Missing test.** A `verify-tarball` assertion listing which optional components may appear in the
root entry.

#### L2 — Unguarded `await` in the client-core vault hook

| | |
| --- | --- |
| Repository | hyperswitch-client-core |
| File / line | `src/hooks/CardVaultHook.res:128` |

**Actual behaviour.** `let outcome = await HyperswitchVault.confirmPaymentMethodSession({…})` is not
wrapped in `try`. A rejection would skip `inFlight.current = false` (`:139`), and every later submit
would return `AlreadyInFlight`, which both call sites handle by doing nothing — leaving the sheet in
`ProcessingPayments`.

**Reachability — verified.** `src/VaultConfirm.res` contains no `raise`/`throw`/exception construct
and wraps both `await` sites in `try`, so the transport resolves rather than rejects on network
failure, timeout and abort. The path is **latent**, reachable only through a module-resolution or
binding failure.

**Impact.** If reached: a permanently stuck payment sheet.

**Introduced by this work.** Yes.

**Recommended direction.** Wrap in `try`/`catch` and reset the guard in a `finally`-equivalent.

**Missing test.** A client-core test that rejects the binding and asserts the guard resets.

#### L3 — Untrimmed `sdk_authorization` forwarded to the library

| | |
| --- | --- |
| Repository | hyperswitch-client-core |
| File / line | `src/utility/logics/VaultConfiguration.res:55-57` |

**Actual behaviour.** Emptiness is tested on `details.sdkAuthorization->String.trim`, but the value
placed in `HyperswitchVault({sdkAuthorization: details.sdkAuthorization, …})` is the **untrimmed**
original.

**Why it is a problem.** The library trims before its own emptiness check but base64-decodes the
string it was given, so whitespace padding would decode to garbage and surface as
`#invalid_authorization` → a merchant-visible `invalid_session`, with the true cause hidden.

**Reproduction.** A backend returning `" eyJ…"`.

**Impact.** Confusing failure mode; no security impact.

**Introduced by this work.** Yes.

**Recommended direction.** Forward the trimmed value.

**Missing test.** A `VaultConfiguration.resolve` unit test with padded input.

#### L4 — Widget public types come from a hand-written cast that disagrees with the generated ones

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| File / line | `src/public.ts:43-54`; generated `dist/types/CardNumberWidget.gen.d.ts` |

**Actual behaviour.** genType emits
`export declare const make: React.ComponentType<{readonly children?: React.ReactNode}>` — props with
children, **ref dropped**. `public.ts` casts through `as unknown as
React.ForwardRefExoticComponent<React.RefAttributes<widgetHandle>>` — ref present, **children
dropped**. The ReScript component really is a `forwardRef` taking `{"children": option<React.element>}`
and ignoring it, so the published type is the closest to intent, but neither generated type matches
it.

**Why it is a problem.** The cast is the only thing defining the widget contract; if a widget ever
gains a real prop, the published type would silently omit it.

**Impact.** Types only; no runtime effect.

**Introduced by this work.** Yes.

**Recommended direction.** Keep the cast but assert the intended shape in `type-tests/consumer.tsx`
(some of this exists already: props are rejected there).

**Missing test.** An assertion that the generated widget `Props` is empty apart from children.

#### L5 — Refs assigned during render

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| File / line | `src/VaultFormCoordinator.res:115` (`latestRef.current = …`), `src/HyperswitchVaultFormProvider.res:83` (`coordRef.current = Some(coord)`) |

**Actual behaviour.** Both are mutations performed in the render body rather than in an effect.

**Why it is a problem.** React documents ref writes during render as unsafe; under concurrent
rendering a discarded render can still leave its value behind.

**Impact.** None observed — the existing suite (including a StrictMode case) passes, and both values
are read only from callbacks that run after commit. Flagged for correctness, not for a symptom.

**Introduced by this work.** Yes.

**Recommended direction.** Assign in a layout effect, or accept with a comment explaining why it is
safe here.

**Missing test.** A concurrent-rendering test; not practical with the current harness.

#### L6 — Provider rebuilds the widget context value on every render

| | |
| --- | --- |
| Repository | react-native-hyperswitch-vault |
| File / line | `src/HyperswitchVaultFormProvider.res:143-159` |

**Actual behaviour.** `contextValue` is constructed fresh each render with no memoisation, so every
provider render re-renders all three widgets.

**Impact.** Performance only, and small (three inputs).

**Recommended direction.** `React.useMemo` on the stable parts if profiling ever shows it.

### INFORMATIONAL

- **I1 — Stale comment contradicting its own file.** `src/CardIcons.res:15-16` says "`Animated` mode
  … is **NOT implemented here**"; `#animated` is implemented at `:128-142` and covered by
  `brandIcon.test.tsx`. Source is authoritative; the comment is wrong.
- **I2 — Behaviour-contract defects remain preserved, as intended.** Probe-confirmed for **D3**:
  switching a filled AmEx PAN to a Visa PAN leaves the 4-digit CVC `"1234"` in place. **D4**'s dead
  blur target is present and labelled at `src/CardFieldUnits.res:363-366`.
- **I3 — Sentinel field in standalone form state (D9).** The standalone field set has no
  `CardNetwork` entry, so the brand is held in a react-final-form field literally named
  `__card_network_unbound` (`src/CardFieldUnits.res:93`). Internal only — the form is private to the
  component and `readCardField` reads only `payment_method_data.card.*`.
- **I4 — `example-server/.env` exists on disk**, untracked and gitignored. Contents deliberately
  **not** inspected (no real credentials to be used in review). `.env.example` was checked and holds
  placeholders/empties only. Outside the package `files` allowlist, so it cannot be packed.
- **I5 — Example drift (example-only).** `example/src/CustomLayoutCheckout.tsx` currently renders the
  three widgets with its `<Section>` wrappers commented out (`:159-171`) and the number-plate
  `TextInput` unrendered, while `plate` state and `styles.input` remain. Its header comment still
  describes the plate field. No library impact.
- **I6 — `MerchantSession` accepts `{}`.** Every field is optional plus an index signature, so an
  empty object typechecks. Runtime is fail-closed: `readSession` returns `Unusable` and `submit()`
  yields `error / invalid_session` with no request (covered by
  `vaultFormLifecycle.test.tsx` "unusable session").

### Areas reviewed with no findings

- **Public export parity.** ESM, CJS, `dist/types` and the freshly packed tarball agree exactly for
  all three entries (see §3).
- **Type hygiene.** No `Js.*`, `Belt_*`, `Curry`, `Caml*` or abstract-class leakage in any
  merchant-facing declaration; no `any`.
- **Scope containment.** No scan-card, co-badge, saved-card, cardholder or event API is exposed:
  `scan`, `CardHolder`, `savedCard`, `onFocus`, `onBlur`, `onChange`, `onSubmit` all appear **0
  times** in `dist/types/public.d.ts`.
- **Provider prop propagation.** Probe-verified that `disabled` reaches all three widgets
  (`editable=false`), that `localisation` reaches both labels and validation messages, and that
  `appearance.inputHeight` reaches the rendered inputs.
- **Presence gating.** Probe-verified that submitting with zero widgets returns `not_ready` naming
  all three widgets with **0 network requests**.
- **Transport request shape.** Exactly two headers, `payment_method_type: "card"`, PAN space-stripped,
  4-digit expiry year derived via sdk-utils, validation before fetch, no automatic retry.
- **Result sanitisation.** `src/VaultResult.res` references neither card values nor authorization.
- **Logging.** No `console.*` / `Js.log` in library source (the only match is a comment).
- **Builds.** `yarn build:clean` and `yarn verify` both exit 0 with all four gates OK; client-core
  `yarn re:check` exits 0; example Android and iOS release bundles build (exit 0).

---

## 2. Review baseline

### 2.1 Repositories and comparison bases

| Repository | Path | Branch / HEAD | Comparison base used |
| --- | --- | --- | --- |
| react-native-hyperswitch-vault | `~/Documents/react-native-hyperswitch-vault` | branch `master`, **0 commits** | **None exists.** No commit, tag or branch to diff against; the whole tree is the change. Reviewed as-is against generated/built artefacts. |
| hyperswitch-client-core | `~/Documents/hyperswitch-client-core` | branch `main`, HEAD **`1eea95c`** | HEAD `1eea95c` — a real, verifiable diff |
| hyperswitch-sdk-utils (submodule) | `…/shared-code` | `1669cc28955bf547b7fe35d6401ea47720019ff9` (`heads/main`) | pinned; `check-submodule.mjs` enforces it |

`main` was **not** assumed for the library: `git rev-list --count --all` returns `0` and `HEAD` does
not resolve, so no such base exists. This is itself part of finding **B1**.

### 2.2 Files belonging to this work

**client-core** (against HEAD `1eea95c`) — 11 vault paths:

```text
M  src/components/dynamic/CardElement.res      A  src/contexts/VaultContext.res
M  src/components/dynamic/DynamicComponent.res A  src/hooks/CardVaultHook.res
M  src/hooks/UpdateIntentHook.res              A  src/utility/libraries/HyperswitchVault.res
M  src/pages/payment/PaymentMethod.res         A  src/utility/logics/VaultConfiguration.res
M  src/routes/NavigationRouter.res
M  src/types/AllApiDataTypes/SessionsType.res
M  src/utility/logics/PaymentUtils.res
```

**Pre-existing / unrelated changes in client-core** — `.gitignore`, `ios` and `shared-code`
gitlinks, `mockServer.js`, `yarn.lock`, and two untracked docs. `package.json` is modified for
**both** reasons (it carries the vault dependency of **B1**). These were left untouched.

**Library** — 175 staged paths (a first commit, not a diff) plus, at review time, working-tree edits
to `README.md` and `example/src/CustomLayoutCheckout.tsx` and untracked `docs/app-integration.md`.
All preserved; this review added only `docs/reviews/vault-end-to-end-review.md`.

### 2.3 Versions

| Item | Value |
| --- | --- |
| Package | `@juspay-tech/react-native-hyperswitch-vault` **0.7.0**, `sideEffects: false`, **no runtime dependencies**, `packageManager: yarn@3.6.4`, `engines.node >=18.18.0` |
| react | peer `>=19.0.0 <20.0.0`; installed **19.0.0** (client-core: 19.0.0) |
| react-native | peer `>=0.79.0 <0.80.0`; installed **0.79.7** (client-core: `^0.79.1`) |
| rescript | **11.1.4** (client-core `^11.1.4`) |
| react-final-form | **optional** peer `^7.0.0`; installed **7.0.0** |
| final-form | **optional** peer `^5.0.0`; installed **5.0.0** |
| @rescript/core / @rescript/react / rescript-react-native | 1.6.1 / 0.13.1 / 0.77.4 |
| rollup / typescript | 4.62.4 / 5.9.3 |

### 2.4 File classification

| Class | Contents |
| --- | --- |
| Hand-written source | `src/*.res` (22 files, 4,321 lines); `src/public.ts`, `embedded.ts`, `vault.ts`, `merchantTypes.ts`, `dom-types.ts`, `jsx-global.ts`, `bs-modules.d.ts`; `src/*-entry.mjs`, `src/cardIconAssets.mjs`; `rollup.config.mjs`, `scripts/*.mjs` |
| Generated source (committed) | `src/*.gen.tsx` (10) — genType output, drift-gated |
| Build output (gitignored) | `src/*.bs.js`, `dist/**`, `lib/**` — confirmed with `git check-ignore` |
| Test code | `example/__tests__/*` (4 files, 36 cases), `type-tests/*` (2 files) |
| Example-only | `example/**`, `example-server/**` — excluded from the tarball by `files` |
| Documentation | `docs/**`, `README.md`, `THIRD-PARTY-NOTICES.md` |

---

## 3. Public merchant API verification

Determined from `package.json` `exports` → entry files → `src/public.ts` → `@genType` → `*.gen.tsx`
→ `dist/types` → **the packed tarball**, then compared against the runtime bundles.

### 3.1 Parity results (the important check)

| Check | Result |
| --- | --- |
| ESM runtime exports vs CJS runtime exports, all 3 entries | **identical** |
| Runtime exports vs `dist/types` declarations | **identical** — no declared-but-missing, no runtime-but-undeclared |
| Freshly packed tarball vs local `dist` (declarations) | **byte-identical** for `public.d.ts`, `embedded.d.ts`, `vault.d.ts` |
| Freshly packed tarball vs local `dist` (runtime exports) | **identical** for all three entries |
| Tarball forbidden content (`example`, Pods, `node_modules`, `.map`, `shared-code`, `src/`, `.env`) | **none present** (60 entries, 182,162 bytes compressed) |
| `/vault` loadable in plain Node without React | **yes** — `confirmPaymentMethodSession` is a function |

### 3.2 Export table

| Import path | Public export | Type | Intended consumer | Implementation file | Generated declaration | Review result |
| --- | --- | --- | --- | --- | --- | --- |
| root | `HyperswitchVaultForm` | component (forwardRef) | merchant | `src/HyperswitchVaultForm.res:332` | `HyperswitchVaultForm.gen.tsx` | OK — props/optionality match source |
| root | `HyperswitchVaultFormProvider` | component (forwardRef) | merchant | `src/HyperswitchVaultFormProvider.res:168` | `HyperswitchVaultFormProvider.gen.tsx` | OK — `children` required and `React.ReactNode` **in the generated output itself** |
| root | `CardNumberWidget` / `CardExpiryWidget` / `CardCVCWidget` | components (forwardRef) | merchant | `CardNumberWidget.res:14`, `CardExpiryWidget.res:12`, `CardCVCWidget.res:14` | respective `.gen.tsx` | **L4** — published type comes from a hand-written cast that disagrees with the generated one |
| root | `HyperswitchVaultFormHandle` | type | merchant | `HyperswitchVaultForm.res:167` | `.gen.tsx` | OK — `submit`/`reset`/`focus`; ref type matches runtime `forwardRef` |
| root | `WidgetHandle` | type | merchant | `HyperswitchVaultFormProvider.res:29` | `.gen.tsx` | OK — `focus`/`blur` only, no value getter |
| root | `MerchantSession` | type | merchant | `src/merchantTypes.ts` (hand-written) | same file | **I6** — accepts `{}`; runtime fails closed |
| root | `CardFormState` | type | merchant | `HyperswitchVaultForm.res` | `.gen.tsx` | OK — booleans + scheme name only |
| root | `VaultFormAppearance` (16 keys), `VaultFormBrandIconMode` | types | merchant | `HyperswitchVaultForm.res`, `CardIcons.res:116` | `.gen.tsx` | OK |
| root | `VaultFormLocalisation` / `VaultFormLabels` / `VaultFormValidationMessages` | types | merchant | `HyperswitchVaultForm.res` | `.gen.tsx` | OK |
| root | `VaultSubmitResult` / `SafeVaultError` / `SafeVaultErrorCode` / `VaultCardMetadata` | types | merchant | `VaultResult.res:28/37/48`, `VaultConfirm.res:77` | `VaultResult.gen.tsx`, `VaultConfirm.gen.tsx` | OK — 4-branch union, 5 error codes, closed |
| root | `HyperswitchVaultFormProps`, `HyperswitchVaultFormProviderProps` | types | merchant | genType `Props` | `.gen.tsx` | OK |
| `/vault` | `confirmPaymentMethodSession` + 8 transport types | function/types | **internal / advanced** | `VaultConfirm.res:503` | `VaultConfirm.gen.tsx` | OK, but its `card` argument is raw card data — the one public surface where a caller holds a PAN |
| `/embedded` | `EmbeddedCardElement`, `selectCardFields` + 10 types | component/function/types | **client-core only** | `VaultEmbedded.res` | `VaultEmbedded.gen.tsx` | OK; nothing prevents a merchant importing it (documentation-only boundary) |

**Specifically checked and not found:** accidentally exported internals (none at the root); missing
exports (none — every name used by the example and type-tests resolves); required props emitted as
optional or vice versa (`session`, `environment`, provider `children` are required; all others
optional, matching the ReScript `option<…>` types); overly broad types (`any` absent); ReScript
leakage (absent); ref types that do not match runtime (the form/provider casts are correct;
widgets are **L4**).

---

## 4. Integration modes reviewed

### 4.1 Ready-made form

Traced `<HyperswitchVaultForm/>` → one `ReactFinalForm.Form` (`HyperswitchVaultForm.res:400`) →
`CardFormView` → `CardFieldCore.use` → `CardFieldUnits`. `submit`/`reset` come from the shared
`VaultFormCoordinator.useMachinery`; `focus` from registered card-form controls. Verified by the
existing 11-case lifecycle suite: shared promise on repeated submit, one request, reset refusal
in flight, session-replacement abort → `unknown_outcome`, unmount abort, unusable session →
`invalid_session` with zero requests, non-2xx → `server_error` with no retry and no PAN in the
result, and `splitCardFields` layout switching.

### 4.2 Custom widgets

Traced `<HyperswitchVaultFormProvider/>` → one `<Form>` → `Body` → private
`VaultWidgetContext` → one field hook per widget. The presence gate runs **before** any value is
read (`VaultFormCoordinator.res:204-206`), and the aggregate masks per-field validity by registry
counts. Existing suite (20 cases) plus my probes confirm: one request on the happy path, missing or
duplicate widgets → `not_ready` with zero requests and nothing logged, outside-provider render
throws, two providers stay isolated, StrictMode replay creates no false duplicates, focus and
backspace remain semantic regardless of layout.

**The one behavioural gap found here is M1** (remount).

### 4.3 client-core embedded path

`vault_details` decode → `VaultContext` → `VaultConfiguration.resolve` → `CardVaultHook` →
`/vault` transport → token substituted into `generateCardConfirmBody`, with raw
`payment_method_data` omitted by the call sites and `customer_acceptance` preserved via
`isFreshVaultToken`. Fail-closed table re-verified from source: **only a completely absent
`vault_details` yields `NoVault`**; empty, unsupported and blank-authorization all fail closed.
Findings here: **H1**, **L2**, **L3**.

---

## 5. Security and sensitive-data review

Re-verified, not inherited:

- **No logging.** No `console.*` or `Js.log` in library source.
- **No card data in results or errors.** `VaultResult.res` references neither card fields nor the
  authorization; `verify-result-mapping.mjs` executes the compiled mapping and asserts this, and the
  widget suite serialises results *and every emitted state* to assert the PAN, the fake
  authorization and the session id are absent.
- **PAN/expiry/CVC** live only in the owning react-final-form instance plus the expiry widget's local
  display string. No public handle exposes a getter; `CardFormState` carries booleans and the scheme
  name.
- **`sdk_authorization`** enters as a prop / context value, is decoded in-process to extract the
  session id, and is sent only as the `Authorization` header. It never appears in a result.
- **Session id** appears only in the request URL.
- **Token and masked metadata** cross to the merchant deliberately.
- **Not verified:** the contents of `example-server/.env` (**I4**) — deliberately not read.

No new PCI claim is made here; this is a description of implemented data flow only.

---

## 6. Test and verification coverage

**Present.** 36 jest cases in `example/__tests__` (1 smoke, 4 brand-icon, 11 ready-made lifecycle,
20 widget contract); 2 consumer type-test files compiled against the **published** declarations
under the stock React Native tsconfig; 12 build/verify scripts including submodule pinning, icon
coverage, genType drift, tarball contents, result-mapping and three offline consumer fixtures.

**Independently re-run for this review:** `yarn build:clean` = 0, `yarn verify` = 0 (4 gates OK),
example `tsc --noEmit` = 0, example jest 36/36, client-core `yarn re:check` = 0, example Android
release bundle = 0 (1,089,164 bytes) and iOS release bundle = 0 (1,084,089 bytes), fresh
`yarn pack` + tarball inspection.

**Gaps.**

| Gap | Consequence |
| --- | --- |
| **No vault test of any kind in client-core** | H1, L2 and L3 would all have been caught by unit tests of `VaultConfiguration.resolve`, the refresh paths and the hook's guard |
| No widget **remount** case | M1 |
| No predicate-parity test between `CardFormView` and `CardFieldUnits` | M3 |
| No device coverage for widgets | H2 |
| `verify` not wired into `prepack` | M2 |
| No test asserting which optional components may appear in the root bundle | L1 |

---

## 7. Verification log

Everything run for this review, all safe and non-mutating:

```text
git branch/rev-list/status (both repos)      submodule status
yarn build:clean                        = 0  yarn verify = 0 (4 gates OK)
yarn pack --out <scratch>/rev.tgz       = 0  tar -tzf + content/parity diff
node -e require('dist/cjs/vault.js')         (loads without React)
export parity: esm vs cjs vs d.ts vs tarball (all 3 entries)
grep: ReScript leakage / any / console / scope containment
example: npx tsc --noEmit               = 0  yarn jest = 36/36
example: react-native bundle android    = 0  ios = 0
client-core: yarn re:check              = 0  installed-copy export parity vs fresh dist
2 temporary probe suites (8 probes) executed, then deleted
```

**Probe results retained as evidence for findings:** M1 (remount inconsistency), plus the no-finding
confirmations for `disabled`, `localisation`, `appearance`, zero-widget submit, and defect **D3**
preservation.
