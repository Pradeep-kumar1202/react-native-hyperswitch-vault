/*
 * CardInput — context-free text input for card fields only.
 *
 * `CustomInput` is deliberately NOT modified and NOT reused: it reads
 * ThemebasedStyle, LoadingContext, LoggerContext (via LoggerHook),
 * NativePropContext (via FontFamily) and ShadowHook, and it has eight non-card
 * consumers whose behaviour is not locked by tests.
 *
 * ── Inventory: which CustomInput features the three card fields actually use ──
 *
 * Passed explicitly by the card fields, reproduced here:
 *   state, setState, placeholder, animateLabel, keyboardType, maxLength,
 *   isValid, textColor, secureTextEntry (CVC only), name (-> testID),
 *   reference, onKeyPress, onFocus, onBlur, iconRight, accessible,
 *   borderTopWidth / borderBottomWidth / borderLeftWidth / borderRightWidth,
 *   borderTopLeftRadius / borderTopRightRadius / borderBottomLeftRadius /
 *   borderBottomRightRadius.
 *
 * Relied on via CustomInput's defaults, reproduced here as fixed behaviour:
 *   animate = true          -> the floating animated label is always used
 *   enableShadow = true     -> the shadow style is always applied
 *   fontSize = 16.
 *   width = 100%
 *   editable = true         -> card inputs stay editable while a payment runs
 *   pointerEvents = #auto
 *   multiline = false
 *   placeholderTextColor = None -> falls back to the theme placeholder colour
 *   autoCapitalize #none, autoCorrect false, autoComplete #off,
 *   textContentType #oneTimeCode (suppresses OS card autofill)
 *
 * Never used by card fields, therefore NOT reproduced:
 *   iconLeft, heading, mandatory, autoFocus, clearTextOnFocus, textAlign,
 *   onPressIconRight, showEyeIconaftersecureTextEntry (so the CVC eye toggle
 *   cannot exist), height override, style override, animate = false,
 *   enableShadow = false, editable = false, pointerEvents override,
 *   placeholderTextColor override, and `enableCrossIcon` — which the card
 *   fields do pass as `false` but which CustomInput never reads (dead prop).
 *
 * Host-owned values arrive as props: `theme`, `isProcessing` (from
 * LoadingContext) and `onAnalytics` (focus/blur telemetry).
 *
 * Telemetry carries `fieldId` only — a `CardFormTypes.cardFieldId` — so no input value can leave
 * through the analytics channel. The host maps the identifier back to the placeholder string it
 * logs, which keeps the logged value identical to the pre-extraction behaviour.
 */

open ReactNative
open Style

type iconType =
  | NoIcon
  | CustomIcon(React.element)

let fontSize = 16.

@react.component
let make = (
  ~theme: CardFormTypes.cardTheme,
  ~isProcessing: bool,
  ~onAnalytics: CardFormTypes.analyticsEvent => unit,
  ~fieldId: CardFormTypes.cardFieldId,
  ~state,
  ~setState,
  ~placeholder,
  ~animateLabel,
  ~keyboardType,
  ~maxLength=None,
  ~isValid=true,
  ~textColor,
  ~secureTextEntry=false,
  /* Standalone forms can disable input; the host card path never passes this. */
  ~editable=true,
  ~iconRight: iconType=NoIcon,
  ~reference=None,
  ~onKeyPress=?,
  ~onFocus=() => (),
  ~onBlur=() => (),
  ~name="",
  ~accessible=?,
  ~borderTopWidth=?,
  ~borderBottomWidth=?,
  ~borderLeftWidth=?,
  ~borderRightWidth=?,
  ~borderTopLeftRadius=?,
  ~borderTopRightRadius=?,
  ~borderBottomLeftRadius=?,
  ~borderBottomRightRadius=?,
) => {
  let (isFocused, setIsFocused) = React.useState(_ => false)
  let animatedValue = CardAnimatedValue.useAnimatedValue(0.)

  React.useEffect1(() => {
    animatedValue->Animated.Value.setValue(state === "" ? 0. : 1.)
    None
  }, [state])

  React.useEffect2(() => {
    Animated.timing(
      animatedValue,
      {
        toValue: if isFocused || state != "" {
          1.->Animated.Value.Timing.fromRawValue
        } else {
          0.->Animated.Value.Timing.fromRawValue
        },
        duration: 200.,
        useNativeDriver: false,
      },
    )->Animated.start

    None
  }, (isFocused, state))

  <View style={s({width: 100.->pct})}>
    <View
      style={array([
        theme.bgStyle,
        s({
          backgroundColor: theme.inputBackground,
          borderTopWidth: borderTopWidth->Option.getOr(theme.borderWidth),
          borderBottomWidth: borderBottomWidth->Option.getOr(theme.borderWidth),
          borderLeftWidth: borderLeftWidth->Option.getOr(theme.borderWidth),
          borderRightWidth: borderRightWidth->Option.getOr(theme.borderWidth),
          borderTopLeftRadius: borderTopLeftRadius->Option.getOr(theme.borderRadius),
          borderTopRightRadius: borderTopRightRadius->Option.getOr(theme.borderRadius),
          borderBottomLeftRadius: borderBottomLeftRadius->Option.getOr(theme.borderRadius),
          borderBottomRightRadius: borderBottomRightRadius->Option.getOr(theme.borderRadius),
          height: theme.inputHeight->dp,
          flexDirection: #row,
          borderColor: isValid
            ? isFocused ? theme.primaryColor : theme.normalBorderColor
            : theme.errorBorderColor,
          width: 100.->pct,
          paddingHorizontal: 13.->dp,
          alignItems: #center,
          justifyContent: #center,
        }),
        theme.shadowStyle,
      ])}>
      <View
        style={s({
          flex: 1.,
          position: #relative,
          height: 100.->pct,
          justifyContent: #"flex-end",
        })}>
        <Animated.View
          pointerEvents=#none
          style={s({
            top: 0.->dp,
            position: #absolute,
            height: animatedValue
            ->Animated.Interpolation.interpolate({
              inputRange: [0., 1.],
              outputRange: [
                "100%",
                `${((theme.inputHeight +. 10.) /. 1.4)->Float.toString}%`,
              ]->Animated.Interpolation.fromStringArray,
            })
            ->Animated.StyleProp.size,
            justifyContent: #center,
          })}>
          <Animated.Text
            style={array([
              s({
                fontFamily: theme.fontFamily,
                fontWeight: isFocused || state != "" ? #500 : #normal,
                fontSize: animatedValue
                ->Animated.Interpolation.interpolate({
                  inputRange: [0., 1.],
                  outputRange: [
                    (fontSize +. theme.placeholderTextSizeAdjust) *. theme.fontScale,
                    fontSize +. theme.placeholderTextSizeAdjust -. 5.,
                  ]->Animated.Interpolation.fromFloatArray,
                })
                ->Animated.StyleProp.float,
                color: theme.placeholderColor,
              }),
            ])}>
            {React.string(
              if isFocused || state != "" {
                animateLabel
              } else {
                placeholder
              },
            )}
          </Animated.Text>
        </Animated.View>
        <TextInput
          ref=?{reference->Option.map(ref => ref->ReactNative.Ref.value)}
          style={array([
            s({
              fontStyle: #normal,
              color: textColor,
              opacity: isProcessing ? 0.5 : 1.,
              fontFamily: theme.fontFamily,
              fontSize: (fontSize +. theme.placeholderTextSizeAdjust) *. theme.fontScale,
            }),
            s({padding: 0.->dp, height: (theme.inputHeight *. 0.7)->dp, width: 100.->pct}),
          ])}
          testID=name
          secureTextEntry
          autoCapitalize=#none
          multiline={false}
          autoCorrect={false}
          clearTextOnFocus={false}
          ?maxLength
          placeholderTextColor={theme.placeholderColor}
          value={state}
          ?onKeyPress
          onChangeText={text => setState(text)}
          keyboardType
          autoFocus={false}
          autoComplete={#off}
          textContentType={#oneTimeCode}
          onFocus={_ => {
            setIsFocused(_ => true)
            onFocus()
            onAnalytics(FieldFocused(fieldId))
          }}
          onBlur={_ => {
            // TODO: remove invalid input (string with only space) eg: "      "
            state->String.trim == "" ? setState("") : ()
            onBlur()
            setIsFocused(_ => false)
            onAnalytics(FieldBlurred(fieldId))
          }}
          editable
          pointerEvents=#auto
          ?accessible
        />
      </View>
      {switch iconRight {
      | NoIcon => React.null
      | CustomIcon(element) => <CardPressable> element </CardPressable>
      }}
    </View>
  </View>
}
