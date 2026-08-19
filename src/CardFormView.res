/*
 * CardFormView — the portable card form.
 *
 * Binds into the HOST's `ReactFinalForm.Form` through `useField`. It does not
 * create a form of its own and must never be wrapped in a nested one:
 * react-final-form context is an intentional dependency of this component.
 *
 * Imports allowed here: react-final-form, ReactNative, sdk-utils (`Validation`,
 * `PaymentEventData`) and other modules in this package. It imports NO host-owned module: the card
 * form now lives in its own repository and is consumed by the host as a packed npm artifact.
 *
 * Deliberately absent: ThemebasedStyle, GetLocale / locale context,
 * LoadingContext, LoggerHook, AlertHook, NativePropContext,
 * DynamicFieldsContext, ViewportContext, ScanCardModule, Icon, ErrorText,
 * navigation and API hooks. Each of those arrives as a resolved prop.
 *
 * Field names, validators, formatters, focus transitions, error timing, testIDs
 * and the masked card event are unchanged from the previous CardElement.
 *
 * The cross-field coordination — field bindings, expiry display state, co-badge scheme state,
 * change handlers, focus auto-advance, controls registration, card-info emission, eligibility —
 * lives in `CardFieldCore` (the shared field-core, ADR-0001). This module is the layout only.
 */

open ReactNative
open Style
open Validation

module CardAccessory = {
  @react.component
  let make = (
    ~theme: CardFormTypes.cardTheme,
    ~renderIcon: CardFormTypes.renderIcon,
    ~renderSchemeAccessory: option<CardFormTypes.schemeAccessory => React.element>,
    ~schemeAccessory: CardFormTypes.schemeAccessory,
    ~scanCard: option<CardFormTypes.scanCardCapability>,
    ~cardNumberFilled: bool,
    ~onScanned: (~pan: string, ~expiry: string) => unit,
  ) => {
    <View style={s({flexDirection: #row, alignItems: #center})}>
      {switch renderSchemeAccessory {
      | Some(render) => render(schemeAccessory)
      | None => React.null
      }}
      {switch scanCard {
      | Some(capability) =>
        <CardRenderIf condition={capability.isAvailable && !cardNumberFilled}>
          <CardScanTrigger theme renderIcon launch=capability.launch onScanned />
        </CardRenderIf>
      | None => React.null
      }}
    </View>
  }
}
@react.component
let make = (
  ~selection: CardFormTypes.cardFieldSelection,
  /*
   * Validators and the card-number formatter arrive already built by the host.
   *
   * Previously this component received `createFieldValidator` plus `Validation.validationRule`
   * constructors, which meant constructing a ReScript variant here and pattern-matching it in a
   * separately compiled repository. Expiry and CVC rules carry live state (the visible expiry
   * string, the detected brand), so the host supplies factories that take those plain strings and
   * return a validator. A fresh closure is still produced on every render, which is what makes
   * react-final-form re-validate — identical to the previous behaviour.
   */
  ~cardNumberValidator: option<string> => option<string>,
  ~cardNumberFormatter: (option<string>, string) => option<string>,
  ~makeExpiryValidator: string => (option<string> => option<string>),
  ~makeCvcValidator: string => (option<string> => option<string>),
  ~cardNetworkValidator: option<option<string> => option<string>>=?,
  ~accessible=?,
  ~checkEligibility: option<string> => unit=_ => (),
  ~theme: CardFormTypes.cardTheme,
  ~labels: CardFormTypes.cardLabels,
  ~layout: CardFormTypes.cardLayout,
  ~eligibilityStatus: CardFormTypes.eligibilityState,
  ~isProcessing: bool,
  /*
   * Whether the three inputs accept input at all.
   *
   * Defaults to `true`, which is the EMBEDDED host's behaviour and must stay that way: the
   * pre-extraction card form left its inputs editable while a payment was running (dimmed only),
   * and that is recorded as a suspected defect to be preserved until it is decided on, not fixed
   * here. A form OWNER that needs a genuinely disabled form passes `false`.
   */
  ~editable: bool=true,
  ~onAnalytics: CardFormTypes.analyticsEvent => unit,
  ~emitCardInfo: PaymentEventData.cardInfo => unit,
  ~renderIcon: CardFormTypes.renderIcon,
  ~renderError: string => React.element,
  ~renderSchemeAccessory: option<CardFormTypes.schemeAccessory => React.element>=?,
  ~scanCard: option<CardFormTypes.scanCardCapability>=?,
  /*
   * Optional. Called with `Some(controls)` on mount and with `None` on unmount, so a host that owns
   * the `<Form>` can expose an imperative `focus()` / `reset()` without reaching into these refs,
   * and so the registration cannot outlive this component. The embedded host does not use it;
   * passing nothing changes nothing.
   */
  ~registerControls: option<option<CardFormTypes.cardFormControls> => unit>=?,
) => {
  let {
    cardNumberInput,
    cardNumberMeta,
    cardExpiryYearInput,
    cardExpiryYearMeta,
    cardNetworkInput,
    cardNetworkMeta,
    cardCvcInput,
    cardCvcMeta,
    hasCvc,
    expireDate,
    eligibleCardSchemes,
    showCardSchemeDropDown,
    cardRef,
    expireRef,
    cvvRef,
    nullRef,
    onChangeCardNumber,
    onChangeCardExpire,
    onChangeCvv,
    onScanned,
    numberOnKeyPress,
    expiryOnKeyPress,
    cvcOnKeyPress,
  } = CardFieldCore.use(
    ~selection,
    ~cardNumberValidator,
    ~cardNumberFormatter,
    ~makeExpiryValidator,
    ~makeCvcValidator,
    ~cardNetworkValidator,
    ~checkEligibility,
    ~eligibilityStatus,
    ~emitCardInfo,
    ~registerControls,
  )

  let splitCardFields = layout.splitCardFields

  <React.Fragment>
    <View style={s({marginBottom: theme.gap->dp})}>
      <View style={s({width: 100.->pct, borderRadius: theme.borderRadius})}>
        <View
          style={s({
            width: 100.->pct,
            marginBottom: ?(splitCardFields ? Some(theme.gap->dp) : None),
          })}>
          <CardInput
            theme
            isProcessing
            editable
            onAnalytics
            fieldId=CardFormTypes.CardNumberField
            name={CardTestIds.cardNumberInputTestId}
            reference=Some(cardRef)
            state={cardNumberInput.value->Option.getOr("")}
            setState={text => onChangeCardNumber(text, expireRef)}
            placeholder={labels.cardNumberPlaceholder}
            keyboardType=#"number-pad"
            isValid={cardNumberMeta.error->Option.isNone ||
            !cardNumberMeta.touched ||
            cardNumberMeta.active}
            maxLength=Some(23)
            borderBottomWidth=?{splitCardFields ? None : Some(theme.borderWidth /. 2.)}
            borderBottomLeftRadius=?{splitCardFields ? None : Some(0.)}
            borderBottomRightRadius=?{splitCardFields ? None : Some(0.)}
            textColor={{
              cardNumberMeta.error->Option.isNone ||
              !cardNumberMeta.touched ||
              cardNumberMeta.active
            }
              ? theme.textColor
              : theme.dangerColor}
            iconRight=CardInput.CustomIcon(
              <CardAccessory
                theme
                renderIcon
                renderSchemeAccessory
                schemeAccessory={
                  availableSchemes: eligibleCardSchemes,
                  selectedScheme: cardNetworkInput.value->Option.getOr(""),
                  detectedScheme: eligibleCardSchemes->Array.get(0)->Option.getOr(""),
                  showPicker: showCardSchemeDropDown,
                  onSelectScheme: cardNetworkInput.onChange,
                }
                scanCard
                cardNumberFilled={switch cardNumberInput.value {
                | None | Some("") => false
                | _ => true
                }}
                onScanned
              />,
            )
            onFocus={() => {
              cardNumberInput.onFocus()
            }}
            onBlur={() => {
              cardNumberInput.onBlur()
            }}
            onKeyPress=numberOnKeyPress
            animateLabel={labels.cardNumberFloatingLabel}
            ?accessible
          />
          <CardRenderIf condition={splitCardFields}>
            {switch (cardNumberMeta.error, cardNumberMeta.touched) {
            | (Some(error), true) => renderError(error)
            | _ => React.null
            }}
          </CardRenderIf>
        </View>
        <View
          style={s({
            flexDirection: labels.isRtl ? #"row-reverse" : #row,
            gap: ?(splitCardFields ? Some(theme.gap->dp) : None),
          })}>
          <View style={s({flex: 1.})}>
            <CardInput
              theme
              isProcessing
              editable
              onAnalytics
              fieldId=CardFormTypes.ExpiryField
              name={CardTestIds.expiryInputTestId}
              reference={Some(expireRef)}
              state=expireDate
              setState={text => onChangeCardExpire(text, cvvRef)}
              placeholder={labels.expiryPlaceholder}
              keyboardType=#"number-pad"
              isValid={((cardExpiryYearMeta.error->Option.isNone ||
              !cardExpiryYearMeta.touched ||
              cardExpiryYearMeta.active) && expireDate->String.length < 7) ||
                (expireDate->String.length === 7 && checkCardExpiry(expireDate))}
              maxLength=Some(7)
              borderTopWidth=?{splitCardFields ? None : Some(theme.borderWidth /. 2.)}
              borderRightWidth=?{splitCardFields
                ? None
                : Some(hasCvc ? theme.borderWidth /. 2. : theme.borderWidth)}
              borderTopLeftRadius=?{splitCardFields ? None : Some(0.)}
              borderTopRightRadius=?{splitCardFields ? None : Some(0.)}
              borderBottomRightRadius=?{splitCardFields
                ? None
                : Some(hasCvc ? 0. : theme.borderRadius)}
              textColor={((cardExpiryYearMeta.error->Option.isNone ||
              !cardExpiryYearMeta.touched ||
              cardExpiryYearMeta.active) && expireDate->String.length < 7) ||
                (expireDate->String.length === 7 && checkCardExpiry(expireDate))
                ? theme.textColor
                : theme.dangerColor}
              onFocus={() => {
                cardExpiryYearInput.onFocus()
              }}
              onBlur={() => {
                cardExpiryYearInput.onBlur()
              }}
              onKeyPress=expiryOnKeyPress
              animateLabel={labels.expiryFloatingLabel}
              ?accessible
            />
            <CardRenderIf condition={splitCardFields}>
              {switch (
                cardExpiryYearMeta.error,
                (expireDate->String.length > 0 || !cardExpiryYearMeta.touched) &&
                  (expireDate->String.length < 7 || checkCardExpiry(expireDate)),
              ) {
              | (Some(error), false) => renderError(error)
              | _ => React.null
              }}
            </CardRenderIf>
          </View>
          <CardRenderIf condition={hasCvc}>
            <View style={s({flex: 1.})}>
              <CardInput
                theme
                isProcessing
                editable
                onAnalytics
                fieldId=CardFormTypes.CvcField
                name={CardTestIds.cvcInputTestId}
                reference={Some(cvvRef)}
                borderTopWidth={splitCardFields ? theme.borderWidth : theme.borderWidth /. 2.}
                borderLeftWidth={splitCardFields ? theme.borderWidth : theme.borderWidth /. 2.}
                borderTopLeftRadius={splitCardFields ? theme.borderRadius : 0.}
                borderTopRightRadius={splitCardFields ? theme.borderRadius : 0.}
                borderBottomLeftRadius={splitCardFields ? theme.borderRadius : 0.}
                borderBottomRightRadius=theme.borderRadius
                borderBottomWidth=theme.borderWidth
                borderRightWidth=theme.borderWidth
                secureTextEntry=true
                state={cardCvcInput.value->Option.getOr("")}
                isValid={cardCvcMeta.error->Option.isNone ||
                !cardCvcMeta.touched ||
                cardCvcMeta.active}
                maxLength=Some(4)
                setState={text => onChangeCvv(text, nullRef)}
                placeholder={labels.cvcPlaceholder}
                keyboardType=#"number-pad"
                onFocus={() => {
                  cardCvcInput.onFocus()
                }}
                onBlur={() => {
                  cardCvcInput.onBlur()
                }}
                textColor={cardCvcMeta.error->Option.isNone ||
                !cardCvcMeta.touched ||
                cardCvcMeta.active
                  ? theme.textColor
                  : theme.dangerColor}
                iconRight={layout.showCvcIcon
                  ? CardInput.CustomIcon(
                      <View
                        style={s({
                          height: 46.->dp,
                          display: #flex,
                          flexDirection: #row,
                          justifyContent: #center,
                          alignItems: #center,
                        })}>
                        {renderIcon(
                          ~name="cvv",
                          ~height=32.,
                          ~width=32.,
                          ~fill={
                            checkCardCVC(
                              cardCvcInput.value->Option.getOr(""),
                              cardNetworkInput.value->Option.getOr(""),
                            )
                              ? theme.primaryColor
                              : "#858F97"
                          },
                        )}
                      </View>,
                    )
                  : CardInput.NoIcon}
                onKeyPress=cvcOnKeyPress
                animateLabel={labels.cvcFloatingLabel}
                ?accessible
              />
              <CardRenderIf condition={splitCardFields}>
                {switch (cardCvcMeta.error, cardCvcMeta.touched, cardCvcMeta.active) {
                | (Some(error), true, false) => renderError(error)
                | _ =>
                  switch (cardNetworkMeta.error, cardNetworkMeta.touched) {
                  | (Some(error), true) => renderError(error)
                  | _ =>
                    switch eligibilityStatus {
                    | #denied => renderError(labels.notEligibleText)
                    | #pending => React.null
                    | _ => React.null
                    }
                  }
                }}
              </CardRenderIf>
            </View>
          </CardRenderIf>
        </View>
      </View>
      <CardRenderIf condition={!splitCardFields}>
        {switch (cardNumberMeta.error, cardNumberMeta.touched) {
        | (Some(error), true) => renderError(error)
        | _ =>
          switch (
            cardExpiryYearMeta.error,
            (expireDate->String.length > 0 || !cardExpiryYearMeta.touched) &&
              (expireDate->String.length < 7 || checkCardExpiry(expireDate)),
          ) {
          | (Some(error), false) => renderError(error)
          | _ =>
            switch (cardCvcMeta.error, cardCvcMeta.touched, cardCvcMeta.active) {
            | (Some(error), true, false) => renderError(error)
            | _ =>
              switch (cardNetworkMeta.error, cardNetworkMeta.touched) {
              | (Some(error), true) => renderError(error)
              | _ =>
                switch eligibilityStatus {
                | #denied => renderError(labels.notEligibleText)
                | #pending => React.null
                | _ => React.null
                }
              }
            }
          }
        }}
      </CardRenderIf>
    </View>
  </React.Fragment>
}
