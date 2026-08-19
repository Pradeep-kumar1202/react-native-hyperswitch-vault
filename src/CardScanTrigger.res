/*
 * CardScanTrigger — the divider + camera button that sits inside the card-number
 * input's right icon slot.
 *
 * The UI is card-domain and stays portable. The native module, the SCAN_CARD
 * analytics and the failure alert live behind the injected
 * `CardFormTypes.scanCardCapability.launch`, so this component imports no
 * native module and no client-core hook.
 *
 * Visual parity note: reproduces `ScanCardButton.res` exactly, with
 * `component.borderColor` supplied as `theme.dividerColor` and the camera glyph
 * supplied by the host through `renderIcon`.
 */

open ReactNative
open Style

@react.component
let make = (
  ~theme: CardFormTypes.cardTheme,
  ~renderIcon: CardFormTypes.renderIcon,
  ~launch: (~onScanned: (~pan: string, ~expiry: string) => unit) => unit,
  ~onScanned: (~pan: string, ~expiry: string) => unit,
) => {
  <>
    <View
      style={s({
        backgroundColor: theme.dividerColor,
        marginLeft: 10.->dp,
        marginRight: 10.->dp,
        height: 80.->pct,
        width: 1.->dp,
      })}
    />
    <CardPressable
      style={s({
        height: 100.->pct,
        width: 28.->dp,
        display: #flex,
        alignItems: #"flex-start",
        justifyContent: #center,
      })}
      onPress={_pressEvent => launch(~onScanned)}>
      {renderIcon(~name="CAMERA", ~height=26., ~width=26., ~fill=theme.primaryColor)}
    </CardPressable>
  </>
}
