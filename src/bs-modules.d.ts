/*
 * Build-time only shim (never published).
 *
 * genType's generated .gen.tsx files import the ReScript compiler output (`*.bs.js`) to obtain the
 * runtime value. That output is untyped JavaScript, so under `strict` TypeScript reports TS7016.
 * The import is elided from the emitted .d.ts (it is only used in a value position), so this shim
 * affects declaration generation only and contributes no published types.
 */
declare module '*.bs.js' {
  const value: any;
  export = value;
}
