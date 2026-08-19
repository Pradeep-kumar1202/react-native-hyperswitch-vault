/*
 * HyperswitchVaultForm — the standalone merchant component.
 *
 * The merchant hands it the session_tokens-shaped response from their own backend plus an
 * environment, renders it, and calls `submit()` through a ref. Everything else is internal: the
 * component owns the only react-final-form Form, reuses `CardFormView` for the card UI, reuses
 * sdk-utils for validation and formatting, reuses `VaultConfirm` for the transport and
 * `VaultResult` for the result mapping.
 *
 * The merchant never extracts or decodes `sdk_authorization`, never sees a
 * `payment_method_session_id`, never builds card request data, never imports react-final-form or
 * any internal module, and never receives a PAN, expiry or CVC through a callback.
 *
 * Deliberately excluded from the default standalone form: scan-card and the co-badge picker. Both
 * need host-supplied capabilities (a native module, a viewport-aware popover), and requiring either
 * would break "no native module, no Pod install, no Codegen".
 *
 * Nothing here logs.
 *
 * Lifecycle contract (asserted by example/__tests__/vaultFormLifecycle.test.tsx):
 *   - at most one confirmation is in flight; a repeated `submit()` returns the SAME promise and
 *     issues no second request;
 *   - `reset()` clears values, validation state, displayed errors and the visible expiry text. It
 *     never cancels an in-flight confirmation — that request may already have been processed, and
 *     cancelling it would turn a knowable outcome into an unknown one;
 *   - replacing `session` or `environment` aborts an in-flight confirmation and detaches it, so the
 *     next `submit()` always uses the current authorization. An old authorization can never be
 *     reused, because the request is built from `latestRef` at call time;
 *   - unmounting aborts an in-flight confirmation;
 *   - `focus()` before the fields register is a no-op, and the registration is removed on unmount.
 */

open ReactNative

/* ── Public types ─────────────────────────────────────────────────────────── */

@genType
type vaultEnvironment = VaultConfirm.vaultEnvironment

/*
 * The merchant's session_tokens response, described to TypeScript by `src/merchantTypes.ts`.
 *
 * Opaque to ReScript so the component cannot accidentally depend on any field beyond the two it
 * reads, and structural on the TypeScript side so an unrelated backend field never breaks a build.
 */
@genType.import(("./merchantTypes", "MerchantSession"))
type vaultSession

external sessionToJson: vaultSession => JSON.t = "%identity"

/*
 * Optional visual customisation. Every field is optional and falls back to the built-in theme, so a
 * merchant can pass nothing, or only the two or three values they care about.
 */
/*
 * How the brand accessory behaves — the standalone equivalent of client-core's
 * `LayoutTypes.cardBrandVisibility`, without importing it.
 *
 *   #standard    (default) detected brand, else waitcard, no animation
 *   #animated    client-core's placeholder cycle while no brand is detected
 *   #hidden      no brand accessory at all
 *   #hideGeneric hide the waitcard placeholder, show a detected supported brand
 */
@genType
type brandIconMode = CardIcons.brandIconMode

@genType
type appearance = {
  primaryColor?: string,
  textColor?: string,
  errorColor?: string,
  placeholderColor?: string,
  backgroundColor?: string,
  borderColor?: string,
  borderRadius?: float,
  borderWidth?: float,
  fontFamily?: string,
  inputHeight?: float,
  /* Space between the fields in split layout. */
  gap?: float,
  /* Multiplies every font size in the form. */
  fontScale?: float,
  /* Added to the placeholder/floating-label font size before scaling. */
  placeholderTextSizeAdjust?: float,
  /* Added to the 12pt error font size before scaling — mirrors client-core's errorTextSizeAdjust. */
  errorTextSizeAdjust?: float,
  /* Space between a field and its error message — mirrors client-core's errorMessageSpacing. */
  errorMessageSpacing?: float,
  /* Brand accessory behaviour. Defaults to #standard. */
  brandIconMode?: brandIconMode,
}

/*
 * Optional visible strings. One field per string the form can currently show, derived from the
 * built-in defaults below — nothing new is introduced. Every field is optional and falls back to
 * the current English default, so a merchant may translate one string or all of them.
 */
@genType
type localisationLabels = {
  cardNumberPlaceholder?: string,
  cardNumberFloatingLabel?: string,
  expiryPlaceholder?: string,
  expiryFloatingLabel?: string,
  cvcPlaceholder?: string,
  cvcFloatingLabel?: string,
}

/*
 * Optional validation strings. One field per message the three standalone validators can produce.
 *
 * These replace only the TEXT. The rules behind them are untouched and keep calling sdk-utils
 * `cardValid`, `checkCardExpiry` and `checkCardCVC` — no Luhn, card-scheme, expiry or CVC logic is
 * reimplemented or copied here.
 */
@genType
type localisationMessages = {
  cardNumberRequired?: string,
  cardNumberInvalid?: string,
  expiryRequired?: string,
  expiryInvalid?: string,
  cvcRequired?: string,
  cvcInvalid?: string,
}

/*
 * One coherent object rather than three loose props: translating a form means translating labels
 * AND validation messages together, and `isRtl` belongs with them. Passing nothing keeps today's
 * English defaults.
 */
@genType
type localisation = {
  labels?: localisationLabels,
  validationMessages?: localisationMessages,
  isRtl?: bool,
}

/*
 * Safe form state. Deliberately carries no card values at all — not even a masked BIN or last4, and
 * never the expiry — only whether each field is currently valid, and the detected scheme name.
 */
@genType
type cardFormState = {
  complete: bool,
  cardNumberValid: bool,
  expiryValid: bool,
  cvcValid: bool,
  brand: string,
}

@genType
type vaultCardMetadata = VaultConfirm.vaultCardMetadata

/*
 * The result types and the transport-outcome mapping live in `VaultResult`, which imports neither
 * React nor React Native so the whole mapping table can be executed in a plain Node process. They
 * are re-exported here because this component is the package's public entry.
 */
@genType
type safeVaultErrorCode = VaultResult.safeVaultErrorCode

@genType
type safeVaultError = VaultResult.safeVaultError

@genType
type vaultSubmitResult = VaultResult.vaultSubmitResult

@genType
type vaultFormHandle = {
  submit: unit => promise<vaultSubmitResult>,
  reset: unit => unit,
  focus: [#cardNumber | #expiry | #cvc] => unit,
}

/* ── Defaults ─────────────────────────────────────────────────────────────── */

let emptyStyle = Style.s({})

let buildTheme = (appearance: option<appearance>): CardFormTypes.cardTheme => {
  let pick = (selector, fallback) => appearance->Option.flatMap(selector)->Option.getOr(fallback)

  let text = pick(a => a.textColor, "#1A1A1A")
  {
    borderWidth: pick(a => a.borderWidth, 1.),
    borderRadius: pick(a => a.borderRadius, 8.),
    gap: pick(a => a.gap, 12.),
    inputHeight: pick(a => a.inputHeight, 48.),
    fontFamily: pick(a => a.fontFamily, "System"),
    fontScale: pick(a => a.fontScale, 1.),
    placeholderTextSizeAdjust: pick(a => a.placeholderTextSizeAdjust, 0.),
    placeholderColor: pick(a => a.placeholderColor, "#6B7280"),
    primaryColor: pick(a => a.primaryColor, "#0570DE"),
    dangerColor: pick(a => a.errorColor, "#DF1B41"),
    textColor: text,
    inputBackground: pick(a => a.backgroundColor, "#FFFFFF"),
    dividerColor: pick(a => a.borderColor, "#E6E6E6"),
    errorBorderColor: pick(a => a.errorColor, "#DF1B41"),
    normalBorderColor: pick(a => a.borderColor, "#E6E6E6"),
    bgStyle: emptyStyle,
    shadowStyle: emptyStyle,
  }
}

/*
 * The built-in English defaults. `localisation` merges OVER these per field, so a merchant who
 * passes nothing sees exactly what they see today, and one who passes a single string overrides
 * only that string.
 */
let defaultLabels: CardFormTypes.cardLabels = {
  cardNumberPlaceholder: "Card number",
  cardNumberFloatingLabel: "Card number",
  expiryPlaceholder: "MM / YY",
  expiryFloatingLabel: "Expiry",
  cvcPlaceholder: "CVC",
  cvcFloatingLabel: "CVC",
  /* Eligibility is a client-core concept; the standalone form always reports #allowed, so this
   * string can never render and is deliberately not part of the public localisation surface. */
  notEligibleText: "",
  isRtl: false,
}

/*
 * Resolved validation strings. The defaults come from sdk-utils' own locale record, so an
 * untranslated form shows exactly the messages it shows today.
 */
type resolvedMessages = {
  cardNumberRequired: string,
  cardNumberInvalid: string,
  expiryRequired: string,
  expiryInvalid: string,
  cvcRequired: string,
  cvcInvalid: string,
}

let resolveLabels = (localisation: option<localisation>): CardFormTypes.cardLabels => {
  let labels = localisation->Option.flatMap(l => l.labels)
  let pick = (selector, fallback) => labels->Option.flatMap(selector)->Option.getOr(fallback)
  {
    cardNumberPlaceholder: pick(l => l.cardNumberPlaceholder, defaultLabels.cardNumberPlaceholder),
    cardNumberFloatingLabel: pick(
      l => l.cardNumberFloatingLabel,
      defaultLabels.cardNumberFloatingLabel,
    ),
    expiryPlaceholder: pick(l => l.expiryPlaceholder, defaultLabels.expiryPlaceholder),
    expiryFloatingLabel: pick(l => l.expiryFloatingLabel, defaultLabels.expiryFloatingLabel),
    cvcPlaceholder: pick(l => l.cvcPlaceholder, defaultLabels.cvcPlaceholder),
    cvcFloatingLabel: pick(l => l.cvcFloatingLabel, defaultLabels.cvcFloatingLabel),
    notEligibleText: defaultLabels.notEligibleText,
    isRtl: localisation->Option.flatMap(l => l.isRtl)->Option.getOr(defaultLabels.isRtl),
  }
}

let resolveMessages = (localisation: option<localisation>): resolvedMessages => {
  let locale = LocaleDataType.defaultLocale
  let messages = localisation->Option.flatMap(l => l.validationMessages)
  let pick = (selector, fallback) => messages->Option.flatMap(selector)->Option.getOr(fallback)
  {
    cardNumberRequired: pick(m => m.cardNumberRequired, locale.cardNumberEmptyText),
    cardNumberInvalid: pick(m => m.cardNumberInvalid, locale.inValidCardErrorText),
    expiryRequired: pick(m => m.expiryRequired, locale.cardExpiryDateEmptyText),
    expiryInvalid: pick(m => m.expiryInvalid, locale.inValidExpiryErrorText),
    cvcRequired: pick(m => m.cvcRequired, locale.cvcNumberEmptyText),
    cvcInvalid: pick(m => m.cvcInvalid, locale.inValidCVCErrorText),
  }
}

/*
 * Card-only validator factories, shared by the ready-made form and the provider. The bodies are
 * the pre-extraction component-local validators, unchanged; only `messages` became a parameter.
 * They call sdk-utils directly — `cardValid` / `checkCardExpiry` / `checkCardCVC` — for the reasons
 * documented in docs/followup-sdk-utils-card-validation.md (createFieldValidator would drag
 * PostalCodes/CPF/CNPJ into a card-only bundle).
 */
  let makeCardNumberValidator = (messages: resolvedMessages) => (value: option<string>) => {
    let value = value->Option.getOr("")
    if value->String.length === 0 {
      Some(messages.cardNumberRequired)
    } else {
      let cardBrand = value->Validation.getCardBrand
      let formattedNumber = Validation.formatCardNumber(value, cardBrand->Validation.cardType)
      Validation.cardValid(formattedNumber, cardBrand) ? None : Some(messages.cardNumberInvalid)
    }
  }

  let makeExpiryValidatorWith = (messages: resolvedMessages) => (expiry: string) => (_: option<string>) =>
    if expiry->String.length === 0 {
      Some(messages.expiryRequired)
    } else if Validation.checkCardExpiry(expiry) {
      None
    } else {
      Some(messages.expiryInvalid)
    }

  let makeCvcValidatorWith = (messages: resolvedMessages) => (cardBrand: string) => (value: option<string>) => {
    let value = value->Option.getOr("")
    if value->String.length === 0 {
      Some(messages.cvcRequired)
    } else if Validation.checkCardCVC(value, cardBrand) {
      None
    } else {
      Some(messages.cvcInvalid)
    }
  }
/* ── Component ────────────────────────────────────────────────────────────── */

@genType
let make = React.forwardRef((
  props: {
    "session": vaultSession,
    "environment": vaultEnvironment,
    "appearance": option<appearance>,
    "disabled": option<bool>,
    /*
     * Layout of the three fields. Defaults to `false`: one bordered block with the card number on
     * top and expiry/CVC sharing the row beneath, which is the layout hyperswitch-client-core uses
     * for a card-only sheet. `true` separates them into individually bordered fields, and moves
     * each field's error message directly beneath that field instead of below the block.
     */
    "splitCardFields": option<bool>,
    /*
     * Optional strings and direction. Merges over the built-in English defaults per field.
     */
    "localisation": option<localisation>,
    /*
     * Forwarded to each of the three text inputs, exactly as the embedded host adapter does.
     * `CardFormView` passes it per field, and `CardInput` puts it on the `TextInput` itself rather
     * than on a wrapping View, so the three inputs are never collapsed into one accessibility
     * element. Omitted by default, which is React Native's own default.
     */
    "accessible": option<bool>,
    "onStateChange": option<cardFormState => unit>,
  },
  ref,
) => {
  let session = props["session"]->sessionToJson
  let environment = props["environment"]
  let appearance = props["appearance"]
  let disabled = props["disabled"]->Option.getOr(false)
  let splitCardFields = props["splitCardFields"]->Option.getOr(false)
  let localisation = props["localisation"]
  let accessible = props["accessible"]
  let onStateChange = props["onStateChange"]
  let sessionState = React.useMemo1(
    () => session->VaultFormCoordinator.readSession,
    [session],
  )
  let theme = React.useMemo1(() => appearance->buildTheme, [appearance])
  let labels = React.useMemo1(() => localisation->resolveLabels, [localisation])
  let messages = React.useMemo1(() => localisation->resolveMessages, [localisation])
  /* Error typography, matching client-core's ErrorText: (12 + adjust) * scale, spacing 4. */
  let errorFontSize =
    (12. +. appearance->Option.flatMap(a => a.errorTextSizeAdjust)->Option.getOr(0.)) *.
      theme.fontScale
  let errorSpacing = appearance->Option.flatMap(a => a.errorMessageSpacing)->Option.getOr(4.)
  let brandIconMode =
    appearance->Option.flatMap(a => a.brandIconMode)->Option.getOr(#standard)

  /* Fresh closures per render — unchanged: that is what makes react-final-form re-validate. */
  let validateCardNumber = makeCardNumberValidator(messages)
  let validateExpiry = makeExpiryValidatorWith(messages)
  let validateCvc = makeCvcValidatorWith(messages)

  let selection = React.useMemo0(() =>
    VaultFormCoordinator.fieldSpecs->CardFormTypes.selectCardFields
  )

  let controlsRef: React.ref<option<CardFormTypes.cardFormControls>> = React.useRef(None)

  /* The ONE submission machinery, shared with HyperswitchVaultFormProvider (ADR-0001). The
     ready-made form has no widget registry, so its presence gate always passes. */
  let machinery = VaultFormCoordinator.useMachinery(
    ~sessionState,
    ~environment,
    ~selection,
    ~presenceGate=() => None,
    ~clearLocal=() => controlsRef.current->Option.forEach(controls => controls.clearLocalState()),
  )

  React.useImperativeHandle0(ref, () => {
    submit: machinery.submit,
    /*
     * Clears react-final-form's values, touched state and therefore every displayed error, plus the
     * two pieces of card state the form does not own (the visible "MM / YY" text and the detected
     * co-badge schemes).
     *
     * While a confirmation is in flight this is a NO-OP, and the request is NOT cancelled.
     *
     * Both halves matter. Cancelling would replace a knowable outcome with an unknown one, since the
     * vault may already have processed the request. Clearing without cancelling would be worse: the
     * fields would empty while a submission that still resolves for the OLD card is outstanding, and
     * a `submit()` in that window returns that same promise — so the result could reasonably be read
     * as belonging to whatever was typed next. Refusing until the promise settles is the only option
     * with no misreadable state, and the inputs are non-interactive for exactly that window, so a
     * user cannot be mid-edit when it is refused.
     */
    reset: machinery.reset,
    /* A no-op until the fields have registered, and again after they unmount. */
    focus: field => controlsRef.current->Option.forEach(controls => controls.focus(field)),
  })

  <ReactFinalForm.Form
    onSubmit={_ => ()}
    render={formProps => {
      ReactFinalForm.useFormStateHandler(
        ~onFormChange=values => machinery.valuesRef.current = values,
        ~onValidationChange=valid => machinery.isValidRef.current = valid,
        ~formProps,
      )

      React.useEffect0(() => {
        machinery.formMethodsRef.current = Some(formProps.form)
        Some(() => machinery.formMethodsRef.current = None)
      })

      switch selection {
      | None => React.null
      | Some(selection) =>
        <View>
          <CardFormView
            selection
            cardNumberValidator=validateCardNumber
            cardNumberFormatter={Validation.formatValue(Validation.CardNumber)}
            makeExpiryValidator=validateExpiry
            makeCvcValidator=validateCvc
            theme
            labels
            /*
             * `showCvcIcon: true` matches client-core's default. Its `paymentMethodLayout.cvcIcon`
             * defaults to `Shown` (LayoutTypes.res), and `CardElement.res` maps that to
             * `showCvcIcon: cvcIcon === Shown` — so a client-core sheet shows the CVC hint unless a
             * merchant turns it off. The standalone form now does the same.
             */
            layout={splitCardFields, showCvcIcon: true}
            ?accessible
            eligibilityStatus=#allowed
            isProcessing={machinery.isSubmitting || disabled}
            /*
             * Genuinely non-interactive, not merely dimmed, while a confirmation is in flight or the
             * merchant passes `disabled`. The embedded host passes no `editable` and keeps its
             * existing stays-editable-while-processing behaviour untouched.
             */
            editable={!machinery.isSubmitting && !disabled}
            onAnalytics={_ => ()}
            emitCardInfo={info =>
              onStateChange->Option.forEach(notify =>
                notify({
                  complete: info.isCardNumberValid && info.isExpiryValid && info.isCvcComplete,
                  cardNumberValid: info.isCardNumberValid,
                  expiryValid: info.isExpiryValid,
                  cvcValid: info.isCvcComplete,
                  brand: info.brand->Option.getOr(""),
                })
              )}
            /*
             * CardFormView calls `renderIcon` for the CVC hint only. `fill` is ignored: the glyph is
             * packaged artwork rather than a tintable vector, which is the trade for not depending
             * on react-native-svg. Any other name renders nothing — scan-card is parked, so no
             * camera asset is packaged.
             */
            renderIcon={(~name, ~width, ~height as _, ~fill as _) =>
              name === "cvv" ? <CardIcons.Cvc size=width /> : React.null}
            /*
             * The brand mark. Standalone renders the detected scheme only — no picker and no
             * chevron — which is client-core's Standard behaviour. Co-badge SELECTION stays parked:
             * the PMS confirm request carries no card_network field, so a selection would have no
             * proven effect.
             */
            renderSchemeAccessory={accessory =>
              <CardIcons detectedScheme=accessory.selectedScheme mode=brandIconMode />}
            /*
             * Matches client-core's ErrorText presentation, reproduced from its context-free values
             * rather than by importing the module: colour, family, (12 + adjust) * scale, and the
             * 4pt spacing from its theme default. The error PREDICATES and the priority chain are
             * CardFormView's and are untouched.
             */
            renderError={message =>
              <Text
                style={Style.s({
                  color: theme.dangerColor,
                  fontFamily: theme.fontFamily,
                  fontSize: errorFontSize,
                  marginTop: errorSpacing->Style.dp,
                })}>
                {React.string(message)}
              </Text>}
            registerControls={controls => controlsRef.current = controls}
          />
        </View>
      }
    }}
  />
})
