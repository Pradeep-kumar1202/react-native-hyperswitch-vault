
@genType
let make = React.forwardRef((
  props: {
    "children": option<React.element>,
    "styles": option<CardFieldStyles.fieldStyles>,
    "onStateChange": option<VaultPublicState.cvcState => unit>,
  },
  ref,
) => {
  let ctx = VaultWidgetContext.useRequired("CardCVCWidget")
  let controller = ctx.controller

  /*
   * Merchant field state (ADR-0002 §4). The snapshot is derived by the controller and emitted only
   * when it structurally changes; the callback itself is never stored in controller, registration
   * or submission state.
   */
  VaultStateEmitter.use(
    ~build=() => controller.publicFields.cvc,
    ~equal=VaultPublicState.cvcEq,
    ~notify=props["onStateChange"],
  )

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () => VaultCardController.focusRef(controller.cvcRef),
    blur: () => VaultCardController.blurRef(controller.cvcRef),
  })

  <BoundCardFields.Cvc ctx styles=?{props["styles"]} />
})
