
@genType
let make = React.forwardRef((
  props: {
    "children": option<React.element>,
    "styles": option<CardFieldStyles.fieldStyles>,
    /*
     * Flattened field options, like every other field. There is no `brandIconMode` and no
     * `cvcIcon`: a name field has neither element to turn on.
     */
    "placeholder": option<string>,
    "label": option<string>,
    "labelBehavior": option<CardFieldOptions.labelBehavior>,
    "errorDisplay": option<CardFieldOptions.errorDisplay>,
    "accessibilityLabel": option<string>,
    "accessibilityHint": option<string>,
    "testID": option<string>,
    /*
     * Called with one snapshot on mount and again whenever THIS field's state actually changes, by
     * structural comparison. Carries no card value — see `VaultPublicState`.
     */
    "onStateChange": option<VaultPublicState.cardholderNameState => unit>,
  },
  ref,
) => {
  let ctx = VaultWidgetContext.useRequired("CardholderNameWidget")

  VaultStateEmitter.use(
    ~build=() => ctx.publicSnapshot().cardholderName,
    ~equal=VaultPublicState.cardholderNameEq,
    ~notify=props["onStateChange"],
  )
  let controller = ctx.controller

  React.useImperativeHandle0(ref, () => {
    HyperswitchVaultFormProvider.focus: () =>
      VaultCardController.focusRef(controller.cardholderRef),
    blur: () => VaultCardController.blurRef(controller.cardholderRef),
  })

  let options: CardFieldOptions.cardholderNameOptions = {
    placeholder: ?props["placeholder"],
    label: ?props["label"],
    labelBehavior: ?props["labelBehavior"],
    errorDisplay: ?props["errorDisplay"],
    accessibilityLabel: ?props["accessibilityLabel"],
    accessibilityHint: ?props["accessibilityHint"],
    testID: ?props["testID"],
  }

  <BoundCardFields.CardholderName ctx styles=?{props["styles"]} options />
})
