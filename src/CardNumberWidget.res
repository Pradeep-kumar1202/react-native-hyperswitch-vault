
@genType
let make = React.forwardRef((
  props: {
    "children": option<React.element>,
    "styles": option<CardFieldStyles.fieldStyles>,
    "onStateChange": option<VaultPublicState.cardNumberState => unit>,
  },
  ref,
) => {
  let ctx = VaultWidgetContext.useRequired("CardNumberWidget")
  let controller = ctx.controller

  /*
   * Merchant field state (ADR-0002 §4). The snapshot is derived by the controller and emitted only
   * when it structurally changes; the callback itself is never stored in controller, registration
   * or submission state.
   */
  VaultStateEmitter.use(
    ~build=() => controller.publicFields.cardNumber,
    ~equal=VaultPublicState.cardNumberEq,
    ~notify=props["onStateChange"],
  )

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () => VaultCardController.focusRef(controller.cardRef),
    blur: () => VaultCardController.blurRef(controller.cardRef),
  })

  <BoundCardFields.Number
    ctx
    styles=?{props["styles"]}
    iconRight=CardInput.CustomIcon(
      <CardIcons detectedScheme=controller.values.brand mode=ctx.brandIconMode />,
    )
  />
})
