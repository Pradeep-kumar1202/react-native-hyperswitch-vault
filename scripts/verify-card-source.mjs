#!/usr/bin/env node
/*
 * THE CARD-SOURCE GATE.
 *
 * `cardSource` decides whether `confirmPayment()` tokenizes the customer's card before charging it,
 * or sends the card itself. That is a decision about the customer's PCI posture and about whether
 * their card ends up saved, so the two must be impossible to confuse — and this script is what
 * makes "impossible" checkable rather than asserted.
 *
 * Three things are proved here:
 *
 *   1. RUNTIME SHAPE. The ReScript record and the hand-written TypeScript union in `public.ts`
 *      describe the same objects. They are written twice on purpose (see `VaultCardSource.res` for
 *      why a `@tag` variant cannot be used), and two hand-kept declarations drift.
 *
 *   2. RESOLUTION. Every combination a caller can construct — including the ones TypeScript
 *      forbids, which a plain-JavaScript caller can still build — resolves to a known outcome, and
 *      the contradictory ones are REJECTED rather than quietly reinterpreted.
 *
 *   3. NON-VACUITY. A resolver that accepted everything would pass check 2 trivially, so the
 *      rejections are asserted to be rejections, with their specific error codes.
 */
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

/* ── Load the compiled resolver ───────────────────────────────────────────── */

/*
 * The real `.bs.js`, bundled with its `@rescript/core` dependencies — the same loader the other
 * runtime gates use. This asserts against the code that actually ships, not a re-implementation.
 */
const stage = mkdtempSync(path.join(tmpdir(), 'vault-cardsource-'));
writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ type: 'module' }));

const load = async (name) => {
  const bundle = await rollup({
    input: path.join(root, `src/${name}.bs.js`),
    plugins: [nodeResolve({ rootDir: root })],
    onwarn: () => {},
  });
  const file = path.join(stage, `${name}.js`);
  await bundle.write({ file, format: 'es' });
  await bundle.close();
  return import(pathToFileURL(file).href);
};

const Source = await load('VaultCardSource');

const SESSION = {
  vault_details: { vault_type: 'hyperswitch', vault_data: { sdk_authorization: 'auth' } },
};

const isOk = (r) => r.TAG === 'Ok';
const errorOf = (r) => (r.TAG === 'Error' ? Source.describe(r._0) : null);
const okOf = (r) => (r.TAG === 'Ok' ? r._0 : null);

/* ── 1. Resolution ────────────────────────────────────────────────────────── */

console.log('Every source a caller can build resolves to a known outcome');

const vault = Source.resolve({ type_: 'vault', session: SESSION });
check(isOk(vault), 'a vault source with a session resolves');
check(okOf(vault)?.TAG === 'VaultSource', 'it resolves to the VAULT source');
check(
  okOf(vault)?.confirmTokenMode === 'payment_token',
  'an unspecified token mode defaults to payment_token'
);

const vaultCard = Source.resolve({
  type_: 'vault',
  session: SESSION,
  confirmTokenMode: 'vault_card',
});
check(okOf(vaultCard)?.confirmTokenMode === 'vault_card', 'an explicit token mode is carried through');

const direct = Source.resolve({ type_: 'direct' });
check(isOk(direct), 'a bare direct source resolves');
check(okOf(direct) === 'DirectSource', 'it resolves to the DIRECT source');

/* ── 2. Rejections — the whole point ──────────────────────────────────────── */

console.log('\nContradictory and incomplete sources are REJECTED, not reinterpreted');

/*
 * These are the cases TypeScript already forbids. A plain-JavaScript caller is not bound by that,
 * and neither is an object that arrived from a server response, so each is refused at runtime too.
 */
const vaultNoSession = Source.resolve({ type_: 'vault' });
check(!isOk(vaultNoSession), 'a vault source with no session is refused');
check(errorOf(vaultNoSession) === 'invalid_session', '...as invalid_session');

const vaultBadSession = Source.resolve({ type_: 'vault', session: 'not-an-object' });
check(!isOk(vaultBadSession), 'a vault source whose session is not an object is refused');
check(errorOf(vaultBadSession) === 'invalid_session', '...as invalid_session');

/*
 * The dangerous one. A caller who passes a vault session alongside `#direct` believes their
 * customer's card is being tokenized and saved. It would not be — the PAN would go straight to the
 * payment confirm. Honouring the request silently would hand them the opposite of the posture they
 * asked for, with no signal at all, so it is a configuration error.
 */
const directWithSession = Source.resolve({ type_: 'direct', session: SESSION });
check(!isOk(directWithSession), 'a direct source carrying a vault session is refused');
check(errorOf(directWithSession) === 'unsupported_configuration', '...as unsupported_configuration');

const directWithMode = Source.resolve({ type_: 'direct', confirmTokenMode: 'vault_card' });
check(!isOk(directWithMode), 'a direct source carrying a token mode is refused');
check(errorOf(directWithMode) === 'unsupported_configuration', '...as unsupported_configuration');

const missing = Source.resolve(undefined);
check(!isOk(missing), 'a missing source is refused rather than throwing');

/* Non-vacuity: the resolver is not simply refusing everything. */
check(
  isOk(vault) && isOk(direct),
  'the resolver is not vacuous: the two well-formed sources DO resolve'
);

/* ── 3. The two declarations agree ────────────────────────────────────────── */

console.log('\nThe ReScript record and the published TypeScript union describe the same shapes');

const res = readFileSync(path.join(root, 'src/VaultCardSource.res'), 'utf8');
const ts = readFileSync(path.join(root, 'src/public.ts'), 'utf8');

/*
 * Captured to the next BLANK LINE, not to the next `;`. The vault branch's own members end in
 * semicolons, so stopping at the first one would have silently cut the declaration in half and made
 * every check below pass or fail for the wrong reason.
 */
const union = ts.match(/export type VaultPaymentCardSource =([\s\S]*?)\n\n/)?.[1] ?? '';
check(union.length > 0, 'public.ts declares VaultPaymentCardSource');
check(/'vault'/.test(union) && /'direct'/.test(union), 'the whole union was captured, not a prefix');

/* The discriminant spelling has to match what the record actually emits. */
check(/type_:\s*cardSourceType/.test(res), 'the record discriminates on `type_`');
check(/type_:\s*'vault'/.test(union), 'the published union spells the vault member `type_: \'vault\'`');
check(/type_:\s*'direct'/.test(union), 'the published union spells the direct member `type_: \'direct\'`');

/* The direct branch must carry NOTHING — that is what makes the mixed case unwritable. */
const directBranch = union.split('|').find((branch) => /'direct'/.test(branch)) ?? '';
check(!/session/.test(directBranch), 'the direct branch declares no session');
check(!/confirmTokenMode/.test(directBranch), 'the direct branch declares no confirmTokenMode');

const vaultBranch = union.split('|').find((branch) => /'vault'/.test(branch)) ?? '';
check(/session:\s*MerchantSessionInternal/.test(vaultBranch), 'the vault branch requires a session');
check(!/session\?:/.test(vaultBranch), 'the vault session is required, not optional');

/*
 * `confirmTokenMode` must be gone from the top level of the confirm input. Leaving it there while
 * ALSO having it inside the vault source would give two places to set one thing, and a caller who
 * set the outer one on a direct confirm would be silently ignored.
 */
const inputDecl = readFileSync(path.join(root, 'dist/types/VaultFormCoordinator.gen.d.ts'), 'utf8');
check(
  !/^\s*readonly confirmTokenMode/m.test(inputDecl),
  'confirmTokenMode is NOT a top-level member of the confirm input'
);
check(
  /readonly cardSource:/.test(inputDecl),
  'cardSource is a REQUIRED member of the confirm input'
);

if (failures.length) {
  console.error('\n[verify-card-source] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[verify-card-source] OK - the two card sources are closed, disjoint and fail closed');
