import { nodeResolve } from '@rollup/plugin-node-resolve';

/*
 * Build pipeline stage 2: bundle the ReScript output into publishable artifacts.
 *
 * Why bundle instead of publishing per-module files (e.g. via react-native-builder-bob):
 *
 *   The card form compiles against hyperswitch-sdk-utils, which is a build-time submodule. A
 *   file-by-file publish would have to ship shared-code/ inside the tarball, and would drag in
 *   sdk-utils modules the card form never uses (PostalCodes for 244 countries, CPF/CNPJ tax-ID
 *   validators, and the near-dead CardValidations/CardPattern duplicates) because they sit in the
 *   same compilation unit graph as Validation.res.
 *
 *   Metro does not perform cross-module tree-shaking, so a React Native merchant would pay for all
 *   of that. Bundling here with Rollup's tree-shaking resolves it at publish time: only the code
 *   actually reachable from the library entry is emitted. Validation logic is still compiled from
 *   the pinned submodule — never copied — so sdk-utils remains the single source of truth.
 *
 * The ReScript runtime helpers (rescript/lib, @rescript/core) are deliberately NOT external: they
 * are inlined so the merchant never has to install ReScript.
 *
 *
 * REACT FINAL FORM MODULE IDENTITY — the reason this file exports TWO configurations.
 *
 *   react-final-form connects <Form> to useField through a React context that lives in the module
 *   instance. Two copies of the package means two contexts, and a field from copy B inside a form
 *   from copy A does not "degrade": react-final-form's own useForm() guard throws
 *   "useField must be used inside of a <Form> component".
 *
 *   The two entries have opposite requirements:
 *
 *     - `<package>/embedded` renders INTO the host's <Form> (hyperswitch-client-core owns it).
 *       react-final-form MUST stay external so the host's instance is the one that resolves. If it
 *       were bundled, the embedded card form could never register.
 *
 *     - the root entry OWNS its <Form> and its fields. Nothing outside the bundle needs to share
 *       that context, so react-final-form is bundled IN — which is what lets a merchant install
 *       exactly one package and nothing else.
 *
 *   Rollup applies `external` per configuration, not per entry, so the two entries are built by two
 *   configurations. Neither `dependencies` nor a peer install can then introduce a second copy for
 *   the standalone merchant, and the embedded consumer has no nested copy to resolve because this
 *   package declares react-final-form only as an OPTIONAL PEER — it never installs one of its own.
 *   `scripts/verify-consumers.mjs` proves all of this against the packed tarball.
 *
 *
 * Dual-package layout: dist/esm/*.js and dist/cjs/*.js, each with its own package.json "type"
 * marker written by scripts/emit-package-type.mjs.
 *
 * Both formats deliberately use the .js extension. hyperswitch-client-core's webpack config routes
 * any file whose extension is not in jsx?|tsx?|json|css|html|svg|images|fonts through
 * `type: 'asset/resource'` with `emit: false`. A .mjs or .cjs entry therefore becomes a 42-byte
 * asset stub: the build SUCCEEDS and the card form is silently missing from the bundle. Verified —
 * webpack resolved the `require` condition to dist/embedded.cjs and dropped it exactly that way.
 * Using .js for both formats makes the package independent of any consumer's loader allowlist.
 */

/* Always external: the host application's own React / React Native must be the only instances. */
const hostRuntime = ['react', 'react/jsx-runtime', 'react-native'];

const reactFinalForm = ['react-final-form', 'final-form'];

const plugins = [nodeResolve({ extensions: ['.js', '.mjs'] })];

/*
 * Packaged image assets are NOT bundled. Rollup leaves the specifier verbatim so React Native's
 * asset pipeline resolves it at build time and selects @1x/@2x/@3x per device scale — which only
 * works for a static path. `scripts/copy-assets.mjs` puts the PNGs at dist/assets/, so the emitted
 * `../assets/<name>.png` resolves from both dist/esm/ and dist/cjs/.
 */
const isImageAsset = (id) => /\.(png|jpe?g|gif|webp)$/.test(id);

const treeshake = {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
};

/* Chunk prefixes differ per configuration so the two builds cannot collide in dist/. */
const outputs = (chunkPrefix) => [
  {
    dir: 'dist/esm',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: `${chunkPrefix}-[hash].js`,
    sourcemap: true,
  },
  {
    dir: 'dist/cjs',
    format: 'cjs',
    entryFileNames: '[name].js',
    chunkFileNames: `${chunkPrefix}-[hash].js`,
    exports: 'named',
    sourcemap: true,
  },
];

export default [
  /*
   * Host-facing entries. `embedded` and `vault` share one chunk graph, so the compiled sdk-utils
   * card validation they have in common is hoisted into a single shared chunk rather than inlined
   * twice.
   */
  {
    input: {
      embedded: 'src/embedded-entry.mjs',
      vault: 'src/vault-entry.mjs',
    },
    external: (id) => [...hostRuntime, ...reactFinalForm].includes(id) || isImageAsset(id),
    plugins,
    treeshake,
    output: outputs('shared'),
  },

  /*
   * Standalone merchant entry. react-final-form and final-form are bundled, so this is the only
   * configuration whose output may contain them.
   */
  {
    input: { index: 'src/standalone-entry.mjs' },
    external: (id) => hostRuntime.includes(id) || isImageAsset(id),
    plugins,
    treeshake,
    output: outputs('standalone'),
  },
];
