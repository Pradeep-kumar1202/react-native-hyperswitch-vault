/*
 * Runtime entry for `<package>/vault`.
 *
 * The payment-method-session transport has no UI and no React Native dependency, so it gets its own
 * entry: a host can import it without pulling in the card form, and it can be exercised in a plain
 * Node process. Pure re-export — no logic here.
 */
export { confirmPaymentMethodSession } from './VaultConfirm.bs.js';
