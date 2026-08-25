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
  /* Merchant per-field style slots. None => byte-identical to the unstyled render. */
  ~styles: option<CardFieldStyles.fieldStyles>=?,
) => {
  let (isFocused, setIsFocused) = React.useState(_ => false)
  let animatedValue = CardAnimatedValue.useAnimatedValue(0.)

  /*
   * The floating label's ONLY animated key is `fontSize`, so a static merchant value there would
   * shadow the interpolation and collapse AnimatedStyle. Take it away instead:
   * `splitAnimatedText` returns the merchant's font size (to use as the animation endpoint for that
   * state) and the REST of their style with `fontSize` removed. Memoised on the raw slot value so a
   * merchant passing a stable style object does not re-flatten every render.
   */
  let placeholderSlot = React.useMemo1(
    () => styles->CardFieldStyles.placeholderOf->CardFieldStyles.splitAnimatedText,
    [styles->CardFieldStyles.placeholderOf],
  )
  let labelSlot = React.useMemo1(
    () => styles->CardFieldStyles.labelOf->CardFieldStyles.splitAnimatedText,
    [styles->CardFieldStyles.labelOf],
  )

  /*
   * The two ends of the float animation. A merchant font size REPLACES the endpoint for its own
   * state and leaves the other one alone, so `placeholder: {fontSize: 20}` still animates — down to
   * the library's floating size. The merchant's number is taken literally: it is not multiplied by
   * `theme.fontScale`, because an explicit size means that size.
   */
  let restingFontSize =
    placeholderSlot.fontSize->Option.getOr(
      (fontSize +. theme.placeholderTextSizeAdjust) *. theme.fontScale,
    )
  let floatingFontSize =
    labelSlot.fontSize->Option.getOr(fontSize +. theme.placeholderTextSizeAdjust -. 5.)

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
      ])->CardFieldStyles.withView(styles->CardFieldStyles.containerOf)}>
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
                    restingFontSize,
                    floatingFontSize,
                  ]->Animated.Interpolation.fromFloatArray,
                })
                ->Animated.StyleProp.float,
                color: theme.placeholderColor,
              }),
            ])->CardFieldStyles.withText(
              isFocused || state != "" ? labelSlot.rest : placeholderSlot.rest,
            )}>
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
          ])->CardFieldStyles.withText(styles->CardFieldStyles.inputOf)}
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
      | CustomIcon(element) =>
        switch styles->CardFieldStyles.accessoryOf {
        | None => <CardPressable> element </CardPressable>
        | Some(accessory) =>
          <CardPressable style={s({})->CardFieldStyles.withView(Some(accessory))}>
            element
          </CardPressable>
        }
      }}
    </View>
  </View>
}
