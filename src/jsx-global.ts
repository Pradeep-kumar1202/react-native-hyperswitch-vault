/*
 * genType emits `JSX.Element` for ReScript's `React.element`. React 19's type definitions removed
 * the ambient global `JSX` namespace (it now lives at `React.JSX`), so the generated declarations
 * would not resolve in a React 19 consumer without this alias.
 *
 * Published deliberately and referenced from the entry declarations. Safe for this package because
 * the react peer range is `>=19.0.0 <20.0.0`; on React 18, whose types still declare a global JSX,
 * this would need removing.
 */
import type * as React from 'react';

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
  }
}

export {};
