
@genType
let make = React.forwardRef((_props: {"children": option<React.element>}, ref) => {
  let ctx = VaultWidgetContext.useRequired("CardExpiryWidget")
  let controller = ctx.controller

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () => VaultCardController.focusRef(controller.expiryRef),
    blur: () => VaultCardController.blurRef(controller.expiryRef),
  })

  <BoundCardFields.Expiry ctx />
})
