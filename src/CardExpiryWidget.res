
@genType
let make = React.forwardRef((
  props: {
    "children": option<React.element>,
    /* Expiry has no accessory element, so its slot set is one member smaller. */
    "styles": option<CardFieldStyles.expiryStyles>,
    "onStateChange": option<VaultPublicState.expiryState => unit>,
  },
  ref,
) => {
  let ctx = VaultWidgetContext.useRequired("CardExpiryWidget")
  let controller = ctx.controller

  /*
   * Merchant field state (ADR-0002 §4). The snapshot is derived by the controller and emitted only
   * when it structurally changes; the callback itself is never stored in controller, registration
   * or submission state.
   */
  VaultStateEmitter.use(
    ~build=() => controller.publicFields.expiry,
    ~equal=VaultPublicState.expiryEq,
    ~notify=props["onStateChange"],
  )

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () => VaultCardController.focusRef(controller.expiryRef),
    blur: () => VaultCardController.blurRef(controller.expiryRef),
  })

  <BoundCardFields.Expiry ctx styles=?{props["styles"]->Option.map(CardFieldStyles.widenExpiry)} />
})
