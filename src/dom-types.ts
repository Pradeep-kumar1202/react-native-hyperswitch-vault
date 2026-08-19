/*
 * The platform AbortSignal, referenced by the generated declarations.
 *
 * genType cannot describe `AbortSignal` structurally, and emitting it as an opaque class would force
 * every TypeScript consumer to cast a real `new AbortController().signal`. Mapping the ReScript type
 * onto the ambient global through `@genType.import` keeps the published contract standard and
 * cast-free.
 *
 * The global is always present for this package's consumers, from two independent sources:
 *   - React Native declares `class AbortSignal` itself, in react-native/src/types/globals.d.ts.
 *     That is what makes it resolve under the stock `@react-native/typescript-config`, whose `lib`
 *     list deliberately contains no "dom";
 *   - anywhere else (a web bundler, Node) it comes from lib.dom.d.ts.
 *
 * `type-tests/consumer.tsx` is compiled under the real React Native tsconfig and passes an actual
 * controller signal with no cast, so a regression here fails this build rather than a merchant's.
 */
export type AbortSignalType = AbortSignal;
