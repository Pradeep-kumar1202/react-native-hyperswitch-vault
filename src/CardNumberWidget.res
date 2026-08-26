
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
    "brandIconMode": option<CardFieldOptions.brandIconMode>,
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

  let options: CardFieldOptions.cardNumberOptions = {
    placeholder: ?props["placeholder"],
    label: ?props["label"],
    labelBehavior: ?props["labelBehavior"],
    errorDisplay: ?props["errorDisplay"],
    accessibilityLabel: ?props["accessibilityLabel"],
    accessibilityHint: ?props["accessibilityHint"],
    testID: ?props["testID"],
    brandIconMode: ?props["brandIconMode"],
  }

  <BoundCardFields.Number
    ctx
    styles=?{props["styles"]}
    options
    iconRight={switch CardFieldOptions.resolveBrandIconMode(
      Some(options),
      ~formWide=ctx.brandIconMode,
    ) {
    | #hidden => CardInput.NoIcon
    | mode => CardInput.CustomIcon(<CardIcons detectedScheme=controller.values.brand mode />)
    }}
  />
})
