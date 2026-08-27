
@genType
let make = React.forwardRef((
  props: {
    "children": option<React.element>,
    /* Expiry has no accessory element, so its slot set is one member smaller. */
    "styles": option<CardFieldStyles.expiryStyles>,
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
  },
  ref,
) => {
  let ctx = VaultWidgetContext.useRequired("CardExpiryWidget")
  let controller = ctx.controller

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () => VaultCardController.focusRef(controller.expiryRef),
    blur: () => VaultCardController.blurRef(controller.expiryRef),
  })

  let options: CardFieldOptions.expiryOptions = {
    placeholder: ?props["placeholder"],
    label: ?props["label"],
    labelBehavior: ?props["labelBehavior"],
    errorDisplay: ?props["errorDisplay"],
    accessibilityLabel: ?props["accessibilityLabel"],
    accessibilityHint: ?props["accessibilityHint"],
    testID: ?props["testID"],
  }

  <BoundCardFields.Expiry
    ctx
    styles=?{props["styles"]->Option.map(CardFieldStyles.widenExpiry)}
    options
  />
})
