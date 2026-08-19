/*
 * CardNumberWidget — the card-number field for merchant-owned layouts (ADR-0001, Checkpoint 2).
 *
 * Renders the SAME CardInput, validator, formatter, brand accessory, focus transitions and error
 * presentation as the ready-made form's number field — every behaviour comes from
 * CardFieldUnits.useCardNumberField and the provider context; nothing is re-implemented here.
 * No public props in this phase: configuration is inherited from HyperswitchVaultFormProvider,
 * and the ref exposes only focus()/blur().
 */

open ReactNative

@genType
let make = React.forwardRef((_props: {"children": option<React.element>}, ref) => {
  let ctx = VaultWidgetContext.useRequired("CardNumberWidget")
  let field = CardFieldUnits.useCardNumberField(
    ~path=ctx.selection.cardNumberPath,
    ~validator=ctx.validateCardNumber,
    ~formatter=ctx.cardNumberFormatter,
    ~coord=ctx.coordination,
    /* Co-badge scheme state is a ready-made-form concern; the widget shows the brand mark only. */
    ~onSchemesDetected=(_schemes, _showDropDown) => (),
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
      fieldId=CardFormTypes.CardNumberField
      name={CardTestIds.cardNumberInputTestId}
      reference=Some(field.fieldRef)
      state={field.input.value->Option.getOr("")}
      setState=field.setText
      placeholder=ctx.labels.cardNumberPlaceholder
      keyboardType=#"number-pad"
      isValid=field.fieldOk
      maxLength=Some(23)
      textColor={field.fieldOk ? ctx.theme.textColor : ctx.theme.dangerColor}
      iconRight=CardInput.CustomIcon(
        <CardIcons detectedScheme=ctx.coordination.brand mode=ctx.brandIconMode />,
      )
      onFocus={() => field.input.onFocus()}
      onBlur={() => field.input.onBlur()}
      onKeyPress=field.onKeyPress
      animateLabel=ctx.labels.cardNumberFloatingLabel
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
