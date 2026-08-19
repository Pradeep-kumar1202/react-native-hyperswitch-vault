/*
 * Card-form-local animated value.
 *
 * Behaviourally identical to `AnimatedValue.useAnimatedValue` in client-core: a lazily created
 * `Animated.Value` held in a `useRef`, so the value is constructed once per mount and the same
 * instance is returned on every subsequent render.
 *
 * Replicated rather than imported because the shared module has 13 other client-core consumers and
 * therefore cannot move with the card form. The shared module is NOT modified.
 */

open ReactNative

let useAnimatedValue = (initialValue: float) => {
  let lazyRef = React.useRef(None)
  if lazyRef.current === None {
    lazyRef.current = Some(Animated.Value.create(initialValue))
  }
  switch lazyRef.current {
  | Some(val) => val
  | None => Animated.Value.create(initialValue)
  }
}
