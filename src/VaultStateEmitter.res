/*
 * One emission rule, shared by the field callbacks and the aggregate form callback.
 *
 * The contract it implements:
 *
 *   - exactly one initial snapshot, taken AFTER registration has run. The snapshot is built inside
 *     the effect, not during render, because a field registers itself in a child effect and child
 *     effects run before the parent's — so a render-time snapshot would report a registry that is
 *     one commit stale;
 *   - an emission whenever the public snapshot actually differs, by STRUCTURAL comparison;
 *   - no emission when only the callback's function identity changed. The callback is held in a
 *     ref that is refreshed every render, so a parent that passes an inline arrow function causes
 *     no emission and no re-registration;
 *   - no emission after unmount. Emission is synchronous inside an effect BODY, and React never runs
 *     an effect body for an unmounted component. Nothing is scheduled, so there is no queued call
 *     to cancel. An earlier revision also cleared the callback ref in a teardown; that was removed
 *     in the Phase 3 closure because React 19 Strict Mode replays effects (mount, cleanup, mount)
 *     and the teardown left the ref null between the replay and the next render — a window in
 *     which a genuine emission would have been silently dropped. It protected against nothing that
 *     could happen and created a hazard that could;
 *   - no render loop: nothing here sets state.
 *
 * The effect deliberately has NO dependency array. It runs after every commit and the equality
 * check decides whether to emit — which is what makes "the final snapshot corresponds to the latest
 * controller state" true under rapid typing, where several state updates can be batched into one
 * commit. A dependency array would have to list every public member and would drift.
 */
let use = (~build: unit => 'a, ~equal: ('a, 'a) => bool, ~notify: option<'a => unit>) => {
  let notifyRef = React.useRef(notify)
  notifyRef.current = notify

  let lastRef: React.ref<option<'a>> = React.useRef(None)

  React.useEffectOnEveryRender(() => {
    let next = build()
    let changed = switch lastRef.current {
    | Some(previous) => !equal(previous, next)
    | None => true
    }
    if changed {
      lastRef.current = Some(next)
      notifyRef.current->Option.forEach(fn => fn(next))
    }
    None
  })
}
