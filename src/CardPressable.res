/*
 * Card-form-local pressable.
 *
 * Exposes only the three props the card form actually uses: `children`, `style`, `onPress`.
 *
 * IMPORTANT — the two defaults below are behaviourally significant and are set explicitly rather
 * than left to React Native. `CustomPressable` in client-core defaults both to `false`, whereas a
 * bare `<Pressable>` defaults `accessible` to `true` for touchables. Omitting them would change the
 * accessibility tree for the card-brand icon slot and the scan button:
 *
 *   accessible = false
 *   focusable  = false
 *
 * Replicated rather than imported because `CustomPressable` has 24 other client-core consumers and
 * cannot move with the card form. `CustomPressable` is NOT modified, and none of the props it
 * supports beyond these three are reproduced here.
 */

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
