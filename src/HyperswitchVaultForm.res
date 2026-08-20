
@genType
type vaultEnvironment = VaultFormOptions.vaultEnvironment

@genType
type vaultSession = VaultFormOptions.vaultSession

@genType
type brandIconMode = VaultFormOptions.brandIconMode

@genType
type appearance = VaultFormOptions.appearance

@genType
type localisationLabels = VaultFormOptions.localisationLabels

@genType
type localisationMessages = VaultFormOptions.localisationMessages

@genType
type localisation = VaultFormOptions.localisation

@genType
type cardFormState = VaultFormOptions.cardFormState

@genType
type safeVaultErrorCode = VaultResult.safeVaultErrorCode

@genType
type safeVaultError = VaultResult.safeVaultError

@genType
type vaultSubmitResult = VaultResult.vaultSubmitResult

@genType
type vaultFormHandle = VaultFormOptions.vaultFormHandle

@genType
let make = React.forwardRef((
  props: {
    "session": vaultSession,
    "environment": vaultEnvironment,
    "appearance": option<appearance>,
    "disabled": option<bool>,

    "splitCardFields": option<bool>,
    "localisation": option<localisation>,
    "accessible": option<bool>,
    "onStateChange": option<cardFormState => unit>,
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
    <CardFormView splitCardFields={props["splitCardFields"]->Option.getOr(false)} />
  </VaultWidgetContext.ContextProvider>
})
