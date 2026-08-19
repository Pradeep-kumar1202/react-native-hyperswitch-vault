/*
 * Static asset table for the built-in card icons.
 *
 * Written in JavaScript rather than ReScript so the imports are literal, statically analysable
 * specifiers. React Native's asset pipeline resolves each base name and picks `@2x` / `@3x` from the
 * same directory per device scale — that only works when the path is a static string, which is why
 * there is no dynamic `require(name + '.png')` anywhere in this package.
 *
 * The paths are relative to the BUNDLED output (`dist/esm/` and `dist/cjs/`), which is where these
 * specifiers end up after Rollup leaves them external. `scripts/copy-assets.mjs` places the PNGs at
 * `dist/assets/` so `../assets/…` resolves from either output directory.
 *
 * `camera` is deliberately absent: scan-card is parked.
 */
import visa from '../assets/visa.png';
import mastercard from '../assets/mastercard.png';
import americanexpress from '../assets/americanexpress.png';
import dinersclub from '../assets/dinersclub.png';
import discover from '../assets/discover.png';
import jcb from '../assets/jcb.png';
import cartesbancaires from '../assets/cartesbancaires.png';
import interac from '../assets/interac.png';
import waitcard from '../assets/waitcard.png';
import cvv from '../assets/cvv.png';

export const cardIconAssets = {
  visa,
  mastercard,
  americanexpress,
  dinersclub,
  discover,
  jcb,
  cartesbancaires,
  interac,
  waitcard,
  cvv,
};
