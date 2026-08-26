
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
type fieldStyles = CardFieldStyles.fieldStyles

@genType
type expiryStyles = CardFieldStyles.expiryStyles

@genType
type formFieldStyles = CardFieldStyles.formFieldStyles

@genType
type vaultFormState = VaultPublicState.vaultFormState

@genType
type formFieldOptions = CardFieldOptions.formFieldOptions

@genType
type formLayout = CardFieldOptions.formLayout

@genType
type fieldArrangement = CardFieldOptions.fieldArrangement

@genType
let make = React.forwardRef((
  props: {
    "session": vaultSession,
    "environment": vaultEnvironment,
    "appearance": option<appearance>,
    "disabled": option<bool>,

    /*
     * `layout` and `fieldArrangement` replaced `splitCardFields: bool`. That boolean conflated
     * "do expiry and CVC share a row" with "are the borders joined", and could not express the
     * new default of three stacked, separately-bordered fields.
     */
    "layout": option<formLayout>,
    "fieldArrangement": option<fieldArrangement>,
    "localisation": option<localisation>,
    "accessible": option<bool>,
    "onStateChange": option<cardFormState => unit>,
    "onFormStateChange": option<vaultFormState => unit>,
    "fieldStyles": option<formFieldStyles>,
    "fieldOptions": option<formFieldOptions>,
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
    ~onFormStateChange=props["onFormStateChange"],
  )

  React.useImperativeHandle0(ref, () => {
    VaultFormOptions.submit: host.machinery.submit,

    reset: host.machinery.reset,
    focus: host.focusField,
  })

  <VaultWidgetContext.ContextProvider value={Some(host.contextValue)}>
    <CardFormView
      layout=?{props["layout"]}
      fieldArrangement=?{props["fieldArrangement"]}
      fieldStyles=?{props["fieldStyles"]}
      fieldOptions=?{props["fieldOptions"]}
    />
  </VaultWidgetContext.ContextProvider>
})
