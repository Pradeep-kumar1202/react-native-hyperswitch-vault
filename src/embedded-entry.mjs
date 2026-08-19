/*
 * Runtime entry for `<package>/embedded`.
 *
 * A pure re-export that gives the compiled ReScript values their public JavaScript names. ReScript
 * emits a React component as `make`, which is the right convention inside ReScript but a poor
 * public API name. No logic lives here.
 *
 * The matching type entry is `src/embedded.ts`; the two must export the same names.
 */
export { make as EmbeddedCardElement, selectCardFields } from './VaultEmbedded.bs.js';
