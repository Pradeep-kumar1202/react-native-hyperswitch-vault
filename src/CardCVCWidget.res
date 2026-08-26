
@genType
let make = React.forwardRef((
  props: {
    "children": option<React.element>,
    "styles": option<CardFieldStyles.fieldStyles>,
    /*
     * Flattened field options. A merchant writes `<CardNumberField placeholder="Card number" />`
     * rather than nesting a record — the grouped `fieldOptions` shape is for the ready-made form,
     * where three fields have to be addressed at once.
     */
    "placeholder": option<string>,
    "label": option<string>,
    "labelBehavior": option<CardFieldOptions.labelBehavior>,
    "errorDisplay": option<CardFieldOptions.errorDisplay>,
    "accessibilityLabel": option<string>,
    "accessibilityHint": option<string>,
    "testID": option<string>,
    "cvcIcon": option<CardFieldOptions.cvcIconDisplay>,
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

  let options: CardFieldOptions.cvcOptions = {
    placeholder: ?props["placeholder"],
    label: ?props["label"],
    labelBehavior: ?props["labelBehavior"],
    errorDisplay: ?props["errorDisplay"],
    accessibilityLabel: ?props["accessibilityLabel"],
    accessibilityHint: ?props["accessibilityHint"],
    testID: ?props["testID"],
    cvcIcon: ?props["cvcIcon"],
  }

  <BoundCardFields.Cvc ctx styles=?{props["styles"]} options />
})
