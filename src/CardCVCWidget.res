/*
 * CardCVCWidget — the CVC field for merchant-owned layouts (ADR-0001, Checkpoint 2).
 *
 * The brand-dependent CVC validator, formatter and length rules come from
 * CardFieldUnits.useCardCvcField (the brand travels through the provider's coordination — a safe
 * scheme name). The CVC hint icon matches the ready-made form's default (shown). The explicit
 * border props are the ready-made split layout's values: an individually bordered field.
 * No public props in this phase.
 */

open ReactNative

@genType
let make = React.forwardRef((_props: {"children": option<React.element>}, ref) => {
  let ctx = VaultWidgetContext.useRequired("CardCVCWidget")
  let field = CardFieldUnits.useCardCvcField(
    ~cvcPath=ctx.selection.cardCvcPath,
    ~makeCvcValidator=ctx.makeCvcValidator,
    ~coord=ctx.coordination,
  )

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () =>
      switch field.fieldRef.current->Nullable.toOption {
      | None => ()
      | Some(node) => node->TextInputElement.focus
      },
    blur: () =>
      switch field.fieldRef.current->Nullable.toOption {
      | None => ()
      | Some(node) => node->TextInputElement.blur
      },
  })

  <View>
    <CardInput
      theme=ctx.theme
      isProcessing=ctx.isProcessing
      editable=ctx.editable
      onAnalytics=ctx.onAnalytics
      fieldId=CardFormTypes.CvcField
      name={CardTestIds.cvcInputTestId}
      reference=Some(field.fieldRef)
      borderTopWidth=ctx.theme.borderWidth
      borderLeftWidth=ctx.theme.borderWidth
      borderTopLeftRadius=ctx.theme.borderRadius
      borderTopRightRadius=ctx.theme.borderRadius
      borderBottomLeftRadius=ctx.theme.borderRadius
      borderBottomRightRadius=ctx.theme.borderRadius
      borderBottomWidth=ctx.theme.borderWidth
      borderRightWidth=ctx.theme.borderWidth
      secureTextEntry=true
      state={field.input.value->Option.getOr("")}
      setState=field.setText
      placeholder=ctx.labels.cvcPlaceholder
      keyboardType=#"number-pad"
      isValid=field.fieldOk
      maxLength=Some(4)
      textColor={field.fieldOk ? ctx.theme.textColor : ctx.theme.dangerColor}
      iconRight=CardInput.CustomIcon(
        <View
          style={Style.s({
            height: 46.->Style.dp,
            display: #flex,
            flexDirection: #row,
            justifyContent: #center,
            alignItems: #center,
          })}>
          <CardIcons.Cvc size=32. />
        </View>,
      )
      onFocus={() => field.input.onFocus()}
      onBlur={() => field.input.onBlur()}
      onKeyPress=field.onKeyPress
      animateLabel=ctx.labels.cvcFloatingLabel
      accessible=?ctx.accessible
    />
    {switch field.visibleError {
    | Some(message) =>
      <VaultWidgetContext.ErrorText
        message
        theme=ctx.theme
        errorFontSize=ctx.errorFontSize
        errorSpacing=ctx.errorSpacing
      />
    | None => React.null
    }}
  </View>
})
