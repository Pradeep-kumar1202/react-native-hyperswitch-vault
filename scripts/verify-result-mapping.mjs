#!/usr/bin/env node
/*
 * Executes the transport-outcome -> merchant-result mapping and asserts every row.
 *
 * `src/VaultResult.res` imports neither React nor React Native precisely so this can run in a plain
 * Node process against the REAL compiled module, rather than being argued about in review.
 *
 * What is asserted:
 *   1. every `VaultConfirm.vaultErrorCode` — parsed out of the ReScript source, so adding one and
 *      forgetting it here is a failure — maps to the required (status, code) pair;
 *   2. a thrown fetch / timeout / abort stays `error` + `unknown_outcome` and never becomes a
 *      "network error";
 *   3. `network_error` does not exist anywhere in the public union or in any produced result;
 *   4. every code the public union declares is actually reachable (no decorative union members);
 *   5. results carry nothing but {status, error} or {status, token, card} — no httpStatus, no
 *      `retryable`, no backend body, no request data;
 *   6. every message is one of the module's own fixed strings.
 *
 * The compiled ReScript is ESM with a .js extension inside a CommonJS package, so Node cannot
 * import it directly. Rollup's JS API bundles it into a temp ESM module first — the same compiled
 * code, just made loadable.
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rollup } from 'rollup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
};

/* ── Load the compiled mapping ───────────────────────────────────────────── */

const stage = mkdtempSync(path.join(tmpdir(), 'vault-mapping-'));
writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ type: 'module' }));
const bundle = await rollup({
  input: path.join(root, 'src/VaultResult.bs.js'),
  onwarn: () => {},
});
await bundle.write({ file: path.join(stage, 'mapping.js'), format: 'es' });
await bundle.close();
const VaultResult = await import(pathToFileURL(path.join(stage, 'mapping.js')).href);

/* ── The required table, from the release gate ───────────────────────────── */

const expected = {
  invalid_card_data: ['validation_error', 'invalid_card_data'],
  invalid_authorization: ['error', 'invalid_session'],
  missing_session_id: ['error', 'invalid_session'],
  unknown_outcome: ['error', 'unknown_outcome'],
  http_error: ['error', 'server_error'],
  malformed_response: ['error', 'server_error'],
  missing_token: ['error', 'server_error'],
};

/*
 * Parse the transport's own union so a newly added code cannot slip through unmapped. Polymorphic
 * variants compile to plain strings, which is what makes the fixtures below real values rather than
 * guesses at a runtime representation.
 */
const source = readFileSync(path.join(root, 'src/VaultConfirm.res'), 'utf8');
const unionBody = source.match(/type vaultErrorCode = \[([\s\S]*?)\]/);
if (!unionBody) {
  console.error('[verify-mapping] FAIL: could not find `vaultErrorCode` in src/VaultConfirm.res');
  process.exit(1);
}
const transportCodes = [...unionBody[1].matchAll(/#([a-z_]+)/g)].map((m) => m[1]);

for (const code of transportCodes) {
  check(expected[code] !== undefined, `transport code #${code} has no expected mapping in this test`);
}
for (const code of Object.keys(expected)) {
  check(transportCodes.includes(code), `this test expects #${code}, which no longer exists in VaultConfirm`);
}

/* ── 1, 2: every failure code maps as required ───────────────────────────── */

const produced = new Set();

for (const [code, [status, publicCode]] of Object.entries(expected)) {
  const failure = {
    status: 'failure',
    error: {
      code,
      /* Deliberately hostile: a backend-ish message that must NOT survive into the result. */
      message: 'BACKEND SAYS: card 4242424242424242 declined for customer cus_123',
      httpStatus: 402,
      retryable: true,
      unknownOutcome: code === 'unknown_outcome',
    },
  };
  const result = VaultResult.fromConfirmOutcome(failure);
  check(result.status === status, `#${code} produced status "${result.status}", expected "${status}"`);
  check(
    result.error?.code === publicCode,
    `#${code} produced code "${result.error?.code}", expected "${publicCode}"`
  );
  check(
    result.error?.message !== failure.error.message,
    `#${code} echoed the backend message back to the merchant`
  );
  check(
    !JSON.stringify(result).includes('4242424242424242'),
    `#${code} leaked card data from the transport error into the result`
  );
  check(
    !JSON.stringify(result).includes('cus_123'),
    `#${code} leaked customer context from the transport error into the result`
  );
  check(
    !('httpStatus' in result.error) && !('retryable' in result.error),
    `#${code} exposed transport internals (httpStatus/retryable) on the public error`
  );
  check(
    Object.keys(result).sort().join(',') === 'error,status',
    `#${code} result has unexpected keys: ${Object.keys(result).join(',')}`
  );
  produced.add(result.error.code);
}

/* An aborted or timed-out request is the load-bearing case: it must never read as retryable. */
const abortResult = VaultResult.fromConfirmOutcome({
  status: 'failure',
  error: {
    code: 'unknown_outcome',
    message: 'The vault did not respond in time; the outcome is unknown.',
    retryable: false,
    unknownOutcome: true,
  },
});
check(abortResult.status === 'error', 'abort/timeout did not produce status "error"');
check(abortResult.error.code === 'unknown_outcome', 'abort/timeout did not produce code "unknown_outcome"');

/* ── Success passthrough ─────────────────────────────────────────────────── */

const success = VaultResult.fromConfirmOutcome({
  status: 'success',
  result: {
    token: 'token_fake_abc',
    card: { last4Digits: '4242', binNumber: '424242', expiryMonth: '12', expiryYear: '2030' },
  },
});
check(success.status === 'success', 'success outcome did not map to status "success"');
check(success.token === 'token_fake_abc', 'success did not carry the token through');
check(success.card?.last4Digits === '4242', 'success did not carry the card metadata through');
check(
  Object.keys(success).sort().join(',') === 'card,status,token',
  `success result has unexpected keys: ${Object.keys(success).join(',')}`
);
check(success.error === undefined, 'success result carries an error field');

/* ── Direct constructors ─────────────────────────────────────────────────── */

const validation = VaultResult.invalidCardData();
check(validation.status === 'validation_error', 'invalidCardData is not status "validation_error"');
check(validation.error.code === 'invalid_card_data', 'invalidCardData is not code "invalid_card_data"');
produced.add(validation.error.code);

const notReady = VaultResult.notReady();
check(notReady.status === 'not_ready', 'notReady is not status "not_ready"');
check(notReady.error.code === 'not_ready', 'notReady is not code "not_ready"');
produced.add(notReady.error.code);

const badSession = VaultResult.invalidSession(VaultResult.unusableSessionMessage);
check(badSession.status === 'error', 'invalidSession is not status "error"');
check(badSession.error.code === 'invalid_session', 'invalidSession is not code "invalid_session"');
produced.add(badSession.error.code);

/* ── 3, 4: the public union is exactly what is reachable ─────────────────── */

const publicUnion = readFileSync(path.join(root, 'src/VaultResult.res'), 'utf8').match(
  /type safeVaultErrorCode = \[([\s\S]*?)\]/
);
const declaredCodes = [...publicUnion[1].matchAll(/#([a-z_]+)/g)].map((m) => m[1]);

check(!declaredCodes.includes('network_error'), 'network_error is still declared in the public union');
for (const code of declaredCodes) {
  check(produced.has(code), `public union declares "${code}" but no code path produces it`);
}
for (const code of produced) {
  check(declaredCodes.includes(code), `a code path produces "${code}", which the union does not declare`);
}

/* Nothing anywhere may reintroduce the retry-implying vocabulary. */
for (const file of ['src/VaultResult.res', 'src/HyperswitchVaultForm.res']) {
  const body = readFileSync(path.join(root, file), 'utf8');
  const offending = body
    .split('\n')
    .filter((line) => /#network_error/.test(line));
  check(offending.length === 0, `${file} references #network_error`);
}

/* ── 6: messages are the module's own fixed strings ──────────────────────── */

const allowedMessages = new Set([
  VaultResult.invalidCardMessage,
  VaultResult.notReadyMessage,
  VaultResult.unusableSessionMessage,
  VaultResult.unknownOutcomeMessage,
  VaultResult.serverErrorMessage,
]);
for (const [code] of Object.entries(expected)) {
  const result = VaultResult.fromConfirmOutcome({
    status: 'failure',
    error: { code, message: 'x', retryable: false, unknownOutcome: false },
  });
  check(
    allowedMessages.has(result.error.message),
    `#${code} produced a message that is not one of the module's fixed strings`
  );
}

rmSync(stage, { recursive: true, force: true });

/* ── Report ──────────────────────────────────────────────────────────────── */

console.log('result mapping');
for (const [code, [status, publicCode]] of Object.entries(expected)) {
  console.log(`  #${code.padEnd(22)} -> ${status.padEnd(17)} / ${publicCode}`);
}
console.log(`  ${'(session unusable)'.padEnd(23)} -> ${'error'.padEnd(17)} / invalid_session`);
console.log(`  ${'(form not registered)'.padEnd(23)} -> ${'not_ready'.padEnd(17)} / not_ready`);
console.log(`  ${'(local validation)'.padEnd(23)} -> ${'validation_error'.padEnd(17)} / invalid_card_data`);

if (failures.length) {
  console.error('\n[verify-mapping] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n[verify-mapping] OK - ${transportCodes.length} transport codes + 3 local outcomes verified`);
