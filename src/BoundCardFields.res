
open ReactNative

let useBinding = (ctx: VaultWidgetContext.contextValue, kind: VaultCardController.widgetKind) => {
  let register = ctx.controller.register
  React.useEffect0(() => Some(register(kind)))
  message =>
    <VaultWidgetContext.ErrorText
      message
      theme=ctx.theme
      errorFontSize=ctx.errorFontSize
      errorSpacing=ctx.errorSpacing
    />
}

module Number = {
  @react.component
  let make = (
    ~ctx: VaultWidgetContext.contextValue,

    ~renderError: option<string => React.element>=?,
    ~iconRight: CardInput.iconType=CardInput.NoIcon,
    ~borderBottomWidth: option<float>=?,
    ~borderBottomLeftRadius: option<float>=?,
    ~borderBottomRightRadius: option<float>=?,
  ) => {
    let defaultRenderError = useBinding(ctx, VaultCardController.CardNumberKind)
    let controller = ctx.controller
    <CardFields.Number
      value=controller.values.cardNumber
      onChange=controller.onNumberChange
      currentBrand=controller.values.brand
      onFocus={() => controller.onFocus(#cardNumber)}
      onBlur={() => controller.onBlur(#cardNumber)}
      onBackspace={action => controller.onBackspace(#cardNumber, action)}
      error=?controller.visibleErrors.cardNumber
      isValid=controller.fieldOk.cardNumber
      renderError={renderError->Option.getOr(defaultRenderError)}
      label=ctx.labels.cardNumberPlaceholder
      floatingLabel=ctx.labels.cardNumberFloatingLabel
      common={ctx->VaultWidgetContext.commonFor}
      onAnalytics=ctx.onAnalytics
      reference=controller.cardRef
      iconRight
      ?borderBottomWidth
      ?borderBottomLeftRadius
      ?borderBottomRightRadius
    />
  }
}

module Expiry = {
  @react.component
  let make = (
    ~ctx: VaultWidgetContext.contextValue,
    ~renderError: option<string => React.element>=?,
    ~borderTopWidth: option<float>=?,
    ~borderRightWidth: option<float>=?,
    ~borderTopLeftRadius: option<float>=?,
    ~borderTopRightRadius: option<float>=?,
    ~borderBottomRightRadius: option<float>=?,
  ) => {
    let defaultRenderError = useBinding(ctx, VaultCardController.ExpiryKind)
    let controller = ctx.controller
    <CardFields.Expiry
      value=controller.values.expiryDisplay
      onChange=controller.onExpiryChange
      onFocus={() => controller.onFocus(#expiry)}
      onBlur={() => controller.onBlur(#expiry)}
      onBackspace={action => controller.onBackspace(#expiry, action)}
      error=?controller.visibleErrors.expiry
      isValid=controller.fieldOk.expiry
      renderError={renderError->Option.getOr(defaultRenderError)}
      label=ctx.labels.expiryPlaceholder
      floatingLabel=ctx.labels.expiryFloatingLabel
      common={ctx->VaultWidgetContext.commonFor}
      onAnalytics=ctx.onAnalytics
      reference=controller.expiryRef
      ?borderTopWidth
      ?borderRightWidth
      ?borderTopLeftRadius
      ?borderTopRightRadius
      ?borderBottomRightRadius
    />
  }
}

module Cvc = {
  @react.component
  let make = (
    ~ctx: VaultWidgetContext.contextValue,
    ~renderError: option<string => React.element>=?,

    ~borderTopWidth: option<float>=?,
    ~borderLeftWidth: option<float>=?,
    ~borderTopLeftRadius: option<float>=?,
    ~borderTopRightRadius: option<float>=?,
    ~borderBottomLeftRadius: option<float>=?,
  ) => {
    let defaultRenderError = useBinding(ctx, VaultCardController.CvcKind)
    let controller = ctx.controller
    let borderTopWidth = borderTopWidth->Option.getOr(ctx.theme.borderWidth)
    let borderLeftWidth = borderLeftWidth->Option.getOr(ctx.theme.borderWidth)
    let borderTopLeftRadius = borderTopLeftRadius->Option.getOr(ctx.theme.borderRadius)
    let borderTopRightRadius = borderTopRightRadius->Option.getOr(ctx.theme.borderRadius)
    let borderBottomLeftRadius = borderBottomLeftRadius->Option.getOr(ctx.theme.borderRadius)
    <CardFields.Cvc
      value=controller.values.cvc
      onChange=controller.onCvcChange
      brand=controller.values.brand
      onFocus={() => controller.onFocus(#cvc)}
      onBlur={() => controller.onBlur(#cvc)}
      onBackspace={action => controller.onBackspace(#cvc, action)}
      error=?controller.visibleErrors.cvc
      isValid=controller.fieldOk.cvc
      renderError={renderError->Option.getOr(defaultRenderError)}
      label=ctx.labels.cvcPlaceholder
      floatingLabel=ctx.labels.cvcFloatingLabel
      common={ctx->VaultWidgetContext.commonFor}
      onAnalytics=ctx.onAnalytics
      reference=controller.cvcRef
      borderTopWidth
      borderLeftWidth
      borderTopLeftRadius
      borderTopRightRadius
      borderBottomLeftRadius
      borderBottomRightRadius=ctx.theme.borderRadius
      borderBottomWidth=ctx.theme.borderWidth
      borderRightWidth=ctx.theme.borderWidth
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
    />
  }
}
