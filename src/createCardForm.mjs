/*
 * `createCardForm(config)` — the imperative spelling of <CardForm>.
 *
 * WHY THIS EXISTS. The component is the integration a merchant writes by hand. Some callers want
 * the shape VGS Collect uses instead: build the form object first, hold it in a plain variable, and
 * drive it with method calls.
 *
 *     const form = createCardForm({session, environment: 'sandbox'});
 *
 *     <form.Form>
 *       <CardNumberField />
 *       <CardExpiryField />
 *       <CardCVCField />
 *     </form.Form>
 *
 *     const result = await form.tokenize();
 *
 * WHAT IT IS NOT. This is a HANDLE, not a store. The card state still lives inside the mounted
 * component, exactly as it does for a merchant using a ref — that is what keeps the PAN inside
 * library-owned React state and off this object. So:
 *
 *   - the fields must still be rendered inside `form.Form`; nothing is collected before that;
 *   - `tokenize()` before the form mounts resolves to the library's own `not_ready` result rather
 *     than throwing, matching every other refusal on this surface;
 *   - `getState()` is `null` until the first snapshot arrives.
 *
 * A true external store — state owned by this object, fields subscribing to it — would let a
 * caller drive the form before render. It is deliberately not that: it would move card state out
 * of the component that owns it, and every field's prop contract with it.
 *
 * One instance drives ONE mounted form. Rendering `form.Form` twice points the handle at whichever
 * mounted last, so create one instance per form.
 */
import * as React from 'react';
import { make as CardFormImpl } from './CardForm.bs.js';
import { tokenizeNotReady, notReadyMessage } from './VaultResult.bs.js';

export function createCardForm(config = {}) {
  const ref = React.createRef();
  const listeners = new Set();
  let latest = null;

  /*
   * The snapshot is captured here and fanned out, so a caller can subscribe imperatively AND still
   * pass their own `onFormStateChange` through the config. Theirs is called first and unchanged.
   */
  const announce = (state, fromRender) => {
    latest = state;
    if (typeof config.onFormStateChange === 'function') config.onFormStateChange(state);
    if (typeof fromRender === 'function') fromRender(state);
    for (const listener of listeners) listener(state);
  };

  /*
   * Props given at render override the ones given at construction, so a caller can build the form
   * once and still vary presentation per render. `children` is never taken from the config.
   */
  const Form = ({ children, onFormStateChange: fromRender, ...overrides }) =>
    React.createElement(
      CardFormImpl,
      {
        ...config,
        ...overrides,
        ref,
        /*
         * Pulled out of `overrides` deliberately. This wrapper has to BE the component's callback
         * so the instance can keep `latest` and feed subscribers, and it is spread last, so leaving
         * a caller's `onFormStateChange` in `overrides` would let this one silently overwrite it.
         * Taking it as a named argument and calling it here is what stops that.
         */
        onFormStateChange: (state) => announce(state, fromRender),
      },
      children
    );
  Form.displayName = 'CardForm';

  return {
    Form,
    /* The one operation that yields a token. Refuses, never throws, when nothing is mounted. */
    tokenize: () =>
      ref.current
        ? ref.current.tokenize()
        : Promise.resolve(tokenizeNotReady(notReadyMessage)),
    reset: () => {
      if (ref.current) ref.current.reset();
    },
    focus: (field) => {
      if (ref.current) ref.current.focus(field);
    },
    /* The last card-free snapshot, or null before the form has mounted. */
    getState: () => latest,
    /* Fires on every subsequent snapshot. Returns an unsubscribe. */
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
