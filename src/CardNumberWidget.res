
@genType
let make = React.forwardRef((_props: {"children": option<React.element>}, ref) => {
  let ctx = VaultWidgetContext.useRequired("CardNumberWidget")
  let controller = ctx.controller

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () => VaultCardController.focusRef(controller.cardRef),
    blur: () => VaultCardController.blurRef(controller.cardRef),
  })

  <BoundCardFields.Number
    ctx
    iconRight=CardInput.CustomIcon(
      <CardIcons detectedScheme=controller.values.brand mode=ctx.brandIconMode />,
    )
  />
})
