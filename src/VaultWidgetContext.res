/*
 * VaultWidgetContext — the private context between HyperswitchVaultFormProvider and the card
 * widgets (ADR-0001, Checkpoint 2).
 *
 * Carries ONLY what the ADR's raw-values boundary allows: the coordination record (registry +
 * focus/clear callbacks + the safe detected brand), resolved appearance and localisation, the
 * shared validators/formatter, editable/loading state, and the (no-op) analytics sink. No card
 * value, no react-final-form binding and no co-badge scheme state is ever stored here.
 *
 * A widget rendered outside the provider throws an actionable developer error — the one throw in
 * the whole public surface, and it happens while rendering, never from submit().
 *
 * Deliberately carries no genType annotation: nothing here crosses the package boundary.
 */

open ReactNative

type contextValue = {
  coordination: CardFieldUnits.coordination,
  selection: CardFormTypes.cardFieldSelection,
  theme: CardFormTypes.cardTheme,
  labels: CardFormTypes.cardLabels,
  validateCardNumber: option<string> => option<string>,
  cardNumberFormatter: (option<string>, string) => option<string>,
  makeExpiryValidator: string => (option<string> => option<string>),
  makeCvcValidator: string => (option<string> => option<string>),
  errorFontSize: float,
  errorSpacing: float,
  brandIconMode: CardIcons.brandIconMode,
  accessible: option<bool>,
  editable: bool,
  isProcessing: bool,
  onAnalytics: CardFormTypes.analyticsEvent => unit,
}

let context: React.Context.t<option<contextValue>> = React.createContext(None)

module ContextProvider = {
  let make = React.Context.provider(context)
}

let useRequired = (widgetName: string): contextValue =>
  switch React.useContext(context) {
  | Some(value) => value
  | None =>
    Js.Exn.raiseError(
      widgetName ++ " must be rendered inside a <HyperswitchVaultFormProvider>.",
    )
  }

/* The per-widget error line — the standalone form's renderError presentation, unchanged. */
module ErrorText = {
  @react.component
  let make = (~message: string, ~theme: CardFormTypes.cardTheme, ~errorFontSize, ~errorSpacing) =>
    <Text
      style={Style.s({
        color: theme.dangerColor,
        fontFamily: theme.fontFamily,
        fontSize: errorFontSize,
        marginTop: errorSpacing->Style.dp,
      })}>
      {React.string(message)}
    </Text>
}
