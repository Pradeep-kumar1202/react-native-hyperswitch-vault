/*
 * Card-form-local conditional render.
 *
 * Behaviourally identical to `UIUtils.RenderIf`: renders `children` when `condition` is true,
 * `React.null` otherwise.
 *
 * Replicated rather than imported because `UIUtils` has 18 other client-core consumers and cannot
 * move with the card form. Note that `UIUtils` is not a broad utility module — it contains only
 * `RenderIf` and its compiled output has no imports — so nothing is gained or lost in bundle terms;
 * this exists purely to close the ownership boundary. `UIUtils` is NOT modified.
 */

@react.component
let make = (~condition, ~children) => {
  if condition {
    children
  } else {
    React.null
  }
}
