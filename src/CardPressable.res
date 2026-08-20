
open ReactNative

@react.component
let make = (~onPress=?, ~children=?, ~style=?) => {
  <Pressable
    ?onPress
    children=?{children->Option.map(children => _ => children)}
    style=?{style->Option.map(style => _ => style)}
    accessible={false}
    focusable={false}
  />
}
