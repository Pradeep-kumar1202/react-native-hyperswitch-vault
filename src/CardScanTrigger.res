
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
