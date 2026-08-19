/*
 * CardExpiryWidget — the expiry field for merchant-owned layouts (ADR-0001, Checkpoint 2).
 *
 * The visible "MM / YY" text lives HERE, inside the widget — never in the provider context — and
 * every behaviour (formatting, month/year writes, auto-advance, backspace navigation, the error
 * predicate) comes from CardFieldUnits.useCardExpiryField. No public props in this phase.
 */

open ReactNative

@genType
let make = React.forwardRef((_props: {"children": option<React.element>}, ref) => {
  let ctx = VaultWidgetContext.useRequired("CardExpiryWidget")
  let field = CardFieldUnits.useCardExpiryField(
    ~monthPath=ctx.selection.cardExpiryMonthPath,
    ~yearPath=ctx.selection.cardExpiryYearPath,
    ~makeExpiryValidator=ctx.makeExpiryValidator,
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
      fieldId=CardFormTypes.ExpiryField
      name={CardTestIds.expiryInputTestId}
      reference=Some(field.fieldRef)
      state=field.expireDate
      setState=field.setText
      placeholder=ctx.labels.expiryPlaceholder
      keyboardType=#"number-pad"
      isValid=field.fieldOk
      maxLength=Some(7)
      textColor={field.fieldOk ? ctx.theme.textColor : ctx.theme.dangerColor}
      onFocus={() => field.yearInput.onFocus()}
      onBlur={() => field.yearInput.onBlur()}
      onKeyPress=field.onKeyPress
      animateLabel=ctx.labels.expiryFloatingLabel
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
