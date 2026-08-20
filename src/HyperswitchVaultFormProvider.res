
@genType
type widgetHandle = {
  focus: unit => unit,
  blur: unit => unit,
}

@genType
let make = React.forwardRef((
  props: {
    "session": VaultFormOptions.vaultSession,
    "environment": VaultFormOptions.vaultEnvironment,
    "appearance": option<VaultFormOptions.appearance>,
    "localisation": option<VaultFormOptions.localisation>,
    "disabled": option<bool>,
    "accessible": option<bool>,
    "onStateChange": option<VaultFormOptions.cardFormState => unit>,
    "children": React.element,
  },
  ref,
) => {
  let host = VaultFormHost.useHost(
    ~session=props["session"]->VaultFormOptions.sessionToJson,
    ~environment=props["environment"],
    ~appearance=props["appearance"],
    ~localisation=props["localisation"],
    ~disabled=props["disabled"]->Option.getOr(false),
    ~accessible=props["accessible"],
    ~onStateChange=props["onStateChange"],
  )

  React.useImperativeHandle0(ref, () => {
    VaultFormOptions.submit: host.machinery.submit,
    reset: host.machinery.reset,
    focus: host.focusField,
  })

  <VaultWidgetContext.ContextProvider value={Some(host.contextValue)}>
    {props["children"]}
  </VaultWidgetContext.ContextProvider>
})
