#!/usr/bin/env node
/*
 * Executes the transport-outcome → merchant-result mapping and asserts every row.
 *
 * `src/VaultResult.res` imports neither React nor React Native precisely so this can run in a plain
 * Node process against the REAL compiled module, rather than being argued about in review.
 *
 * What is asserted:
 *   1. every `VaultConfirm.vaultErrorCode` — parsed out of the ReScript source, so adding one and
 *      forgetting it here is a failure — maps to the required (status, code) pair;
 *   2. every `VaultFinalConfirm.navOutcome` — likewise parsed — maps to a navigation result;
 *   3. a thrown fetch / timeout / abort stays `failed` + `unknown_outcome` and never becomes a
 *      "network error";
 *   4. every code the public union declares is actually reachable (no decorative members);
 *   5. NO RESULT CARRIES A TOKEN OR CARD METADATA. Under ADR-0003 the library performs the final
 *      confirmation itself, so the intermediate token has no reason to appear in the public union
 *      and must not;
 *   6. every message is one of the module's own fixed strings — backend prose is never forwarded.
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
import { nodeResolve } from '@rollup/plugin-node-resolve';

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
  plugins: [nodeResolve({ rootDir: root })],
  onwarn: () => {},
});
await bundle.write({ file: path.join(stage, 'mapping.js'), format: 'es' });
await bundle.close();
const VaultResult = await import(pathToFileURL(path.join(stage, 'mapping.js')).href);

/* ── 1. Call-1 (token mint) failures ─────────────────────────────────────── */

const expected = {
  invalid_card_data: ['validation_error', 'invalid_card_data'],
  invalid_authorization: ['failed', 'invalid_session'],
  missing_session_id: ['failed', 'invalid_session'],
  unknown_outcome: ['failed', 'unknown_outcome'],
  http_error: ['failed', 'server_error'],
  malformed_response: ['failed', 'server_error'],
  missing_token: ['failed', 'server_error'],
};

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

const produced = new Set();
const HOSTILE = 'BACKEND SAYS: card 4242424242424242 declined for customer cus_123';

for (const [code, [status, publicCode]] of Object.entries(expected)) {
  const result = VaultResult.fromPmsFailure({
    code,
    message: HOSTILE,
    httpStatus: 402,
    retryable: true,
    unknownOutcome: code === 'unknown_outcome',
  });
  check(result.status === status, `#${code} produced status "${result.status}", expected "${status}"`);
  check(result.error?.code === publicCode, `#${code} produced code "${result.error?.code}", expected "${publicCode}"`);
  check(result.error?.message !== HOSTILE, `#${code} echoed the backend message back to the merchant`);
  check(!JSON.stringify(result).includes('4242424242424242'), `#${code} leaked card data into the result`);
  check(!JSON.stringify(result).includes('cus_123'), `#${code} leaked customer context into the result`);
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

/* ── 2. Call-2 (final confirm) outcomes ──────────────────────────────────── */

const navSource = readFileSync(path.join(root, 'src/VaultFinalConfirm.res'), 'utf8');
const navBody = navSource.match(/type navOutcome =([\s\S]*?)\n\ntype finalConfirmRequest/);
if (!navBody) {
  console.error('[verify-mapping] FAIL: could not find `navOutcome` in src/VaultFinalConfirm.res');
  process.exit(1);
}
const navConstructors = [...navBody[1].matchAll(/\|\s*([A-Z][A-Za-z]*)/g)].map((m) => m[1]);
const expectedNav = ['Succeeded', 'Processing', 'RequiresAction', 'Failed', 'UnknownOutcome'];
for (const ctor of navConstructors) {
  check(expectedNav.includes(ctor), `navOutcome constructor ${ctor} has no expected mapping in this test`);
}
for (const ctor of expectedNav) {
  check(navConstructors.includes(ctor), `this test expects navOutcome ${ctor}, which no longer exists`);
}

const navCases = [
  ['Succeeded', 'Succeeded', 'succeeded', undefined],
  ['Processing', 'Processing', 'processing', undefined],
  /* eslint-disable-next-line */
  [
    'RequiresAction',
    { TAG: 'RequiresAction', type_: 'redirect_to_url', redirectUrl: 'https://x.example', threeDs: undefined, ddc: undefined, sessionToken: undefined },
    'requires_customer_action',
    undefined,
  ],
  ['Failed', { TAG: 'Failed', reason: 'GenericFailure' }, 'failed', 'server_error'],
  ['UnknownOutcome', 'UnknownOutcome', 'failed', 'unknown_outcome'],
];

for (const [label, outcome, status, publicCode] of navCases) {
  const result = VaultResult.fromNavOutcome(outcome);
  /*
   * EVERY branch must be an OBJECT carrying `status`. A ReScript `@tag` variant compiles a
   * payload-less constructor to a bare string, which silently made `result.status` undefined for
   * `succeeded` — the most common outcome. This assertion is what keeps that from coming back.
   */
  check(
    typeof result === 'object' && result !== null,
    `navOutcome ${label} produced a ${typeof result}, not an object — status would be unreadable`
  );
  check(result.status === status, `navOutcome ${label} produced status "${result.status}", expected "${status}"`);
  if (publicCode) {
    check(result.error?.code === publicCode, `navOutcome ${label} produced code "${result.error?.code}"`);
    produced.add(result.error.code);
  }
  check(!('token' in result), `navOutcome ${label} put a token on the result`);
}

/*
 * ── host.ts must describe the runtime shape exactly ──────────────────────────
 *
 * `host.ts` (ADR-0010: the payment vocabulary lives on ./host) republishes the result as a
 * hand-written TypeScript discriminated union so the checkout SDK gets narrowing. Hand-written means
 * it can drift, so the exact member set produced for each status is asserted here against what that
 * union declares.
 */
const EXPECTED_MEMBERS = {
  succeeded: ['status'],
  processing: ['status'],
  requires_customer_action: ['nextAction', 'status'],
  failed: ['error', 'status'],
  validation_error: ['error', 'status'],
  not_ready: ['error', 'status'],
};

const samples = [
  VaultResult.fromNavOutcome('Succeeded'),
  VaultResult.fromNavOutcome('Processing'),
  VaultResult.fromNavOutcome({ TAG: 'RequiresAction', type_: 'redirect_to_url', redirectUrl: 'https://x', threeDs: undefined, ddc: undefined, sessionToken: undefined }),
  VaultResult.serverError(),
  VaultResult.invalidCardData(),
  VaultResult.notReady(),
];

for (const sample of samples) {
  const members = Object.keys(sample).filter((k) => sample[k] !== undefined).sort();
  const expectedMembers = EXPECTED_MEMBERS[sample.status];
  check(expectedMembers !== undefined, `a result carries an undeclared status "${sample.status}"`);
  if (expectedMembers) {
    check(
      members.join(',') === expectedMembers.join(','),
      `status "${sample.status}" carries members [${members.join(',')}], host.ts declares [${expectedMembers.join(',')}]`
    );
  }
}

const publicSource = readFileSync(path.join(root, 'src/public.ts'), 'utf8');
const hostSource = readFileSync(path.join(root, 'src/host.ts'), 'utf8');
const unionDecl = hostSource.match(/export type VaultPaymentResult =([\s\S]*?);\n/);
check(unionDecl !== null, 'host.ts declares a VaultPaymentResult union');
check(!/export type VaultPaymentResult =/.test(publicSource), 'public.ts (the merchant root) declares no VaultPaymentResult union');
if (unionDecl) {
  for (const status of Object.keys(EXPECTED_MEMBERS)) {
    check(
      unionDecl[1].includes(`'${status}'`),
      `host.ts's VaultPaymentResult union is missing the "${status}" branch`
    );
  }
  check(!/token/.test(unionDecl[1]), 'host.ts\'s VaultPaymentResult union mentions a token');
}

/* ── Flow 1: the tokenize result is the ONE place a token may appear ───────── */

const TOKENIZE_MEMBERS = {
  success: ['status', 'token'],
  validation_error: ['error', 'status'],
  not_ready: ['error', 'status'],
  error: ['error', 'status'],
};

const tokenizeFailures = [];

const tokenizeSamples = [
  VaultResult.tokenizeSuccess('tok_abc'),
  VaultResult.tokenizeInvalidCardData(),
  VaultResult.tokenizeNotReady(VaultResult.notReadyMessage),
  VaultResult.tokenizeFailedWith('server_error', VaultResult.serverErrorMessage),
];

for (const sample of tokenizeSamples) {
  const members = Object.keys(sample).filter((k) => sample[k] !== undefined).sort();
  const expectedMembers = TOKENIZE_MEMBERS[sample.status];
  check(expectedMembers !== undefined, `a tokenize result carries an undeclared status "${sample.status}"`);
  if (expectedMembers) {
    check(
      members.join(',') === expectedMembers.join(','),
      `tokenize status "${sample.status}" carries [${members.join(',')}], expected [${expectedMembers.join(',')}]`
    );
  }
}

check(VaultResult.tokenizeSuccess('tok_abc').token === 'tok_abc', 'a tokenize success carries the token through');

/*
 * ADR-0010: the merchant root narrows `SafeVaultErrorCode` to the codes `tokenize()` can emit. That
 * narrowing is a hand-written union in public.ts, so it is pinned here against the mapping: every
 * code the tokenize mapping produces must be declared, and nothing else may be.
 */
const rootCodesDecl = publicSource.match(/export type SafeVaultErrorCode =([\s\S]*?);\n/);
check(rootCodesDecl !== null, 'public.ts declares the merchant SafeVaultErrorCode union');
const rootCodes = new Set([...(rootCodesDecl?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
const tokenizeCodesEmitted = new Set(['invalid_card_data', 'not_ready', 'invalid_session', 'unsupported_configuration', 'server_error', 'unknown_outcome']);
for (const code of tokenizeCodesEmitted) check(rootCodes.has(code), `the merchant SafeVaultErrorCode declares "${code}"`);
for (const code of rootCodes) check(tokenizeCodesEmitted.has(code), `the merchant SafeVaultErrorCode declares no code tokenize() cannot emit ("${code}")`);

/*
 * The SAME transport codes must be mapped by BOTH flows, so a new one cannot be handled in one and
 * forgotten in the other.
 */
const tokenizeExpected = {
  invalid_card_data: ['validation_error', 'invalid_card_data'],
  invalid_authorization: ['error', 'invalid_session'],
  missing_session_id: ['error', 'invalid_session'],
  unknown_outcome: ['error', 'unknown_outcome'],
  http_error: ['error', 'server_error'],
  malformed_response: ['error', 'server_error'],
  missing_token: ['error', 'server_error'],
};
for (const code of transportCodes) {
  check(tokenizeExpected[code] !== undefined, `transport code #${code} has no tokenize mapping in this test`);
  const [status, publicCode] = tokenizeExpected[code] ?? [];
  const result = VaultResult.tokenizeFromPmsFailure({
    code,
    message: HOSTILE,
    httpStatus: 402,
    retryable: true,
    unknownOutcome: code === 'unknown_outcome',
  });
  check(result.status === status, `tokenize #${code} produced status "${result.status}", expected "${status}"`);
  check(result.error?.code === publicCode, `tokenize #${code} produced code "${result.error?.code}"`);
  check(result.error?.message !== HOSTILE, `tokenize #${code} echoed the backend message`);
  check(!JSON.stringify(result).includes('4242424242424242'), `tokenize #${code} leaked card data`);
  check(!('token' in result), `tokenize #${code} put a token on a failure result`);
  tokenizeFailures.push(result);
}

const tokenizeUnionDecl = publicSource.match(/export type VaultTokenizeResult =([\s\S]*?);\n/);
check(tokenizeUnionDecl !== null, 'public.ts declares a VaultTokenizeResult union');
if (tokenizeUnionDecl) {
  for (const status of Object.keys(TOKENIZE_MEMBERS)) {
    check(
      tokenizeUnionDecl[1].includes(`'${status}'`),
      `public.ts's VaultTokenizeResult union is missing the "${status}" branch`
    );
  }
  check(/token/.test(tokenizeUnionDecl[1]), 'the tokenize union DOES declare a token (this flow is allowed one)');
}

/*
 * The final-confirm boundary carries a closed REASON, not a string, so there is no slot a backend
 * message could arrive in. Every reason must still land on one of this module's own fixed strings.
 */
const reasonSource = readFileSync(path.join(root, 'src/VaultFinalConfirm.res'), 'utf8');
const reasonBody = reasonSource.match(/type finalFailureReason =([\s\S]*?)\n\ntype navOutcome/);
check(reasonBody !== null, 'could not find `finalFailureReason` in VaultFinalConfirm.res');
const reasons = reasonBody ? [...reasonBody[1].matchAll(/\|\s*([A-Z][A-Za-z]*)/g)].map((m) => m[1]) : [];
check(reasons.length > 0, 'finalFailureReason declares no reasons');

for (const reason of reasons) {
  const mapped = VaultResult.fromNavOutcome({ TAG: 'Failed', reason });
  check(mapped.status === 'failed', `reason ${reason} did not map to status "failed"`);
  check(mapped.error?.code === 'server_error', `reason ${reason} did not map to code "server_error"`);
  check(typeof mapped.error?.message === 'string' && mapped.error.message.length > 0,
    `reason ${reason} produced no message`);
  produced.add(mapped.error.code);
}

/* A hostile payload cannot even be expressed on this boundary, but prove nothing forwards it. */
const hostileNav = VaultResult.fromNavOutcome({ TAG: 'Failed', reason: 'GenericFailure', message: HOSTILE });
check(!JSON.stringify(hostileNav).includes('4242424242424242'), 'fromNavOutcome leaked card data');
check(!JSON.stringify(hostileNav).includes('cus_123'), 'fromNavOutcome leaked customer context');

/* ── 3. Abort / timeout stays unknown, never retryable ───────────────────── */

const abortResult = VaultResult.fromPmsFailure({
  code: 'unknown_outcome',
  message: 'The vault did not respond in time; the outcome is unknown.',
  retryable: false,
  unknownOutcome: true,
});
check(abortResult.status === 'failed', 'abort/timeout did not produce status "failed"');
check(abortResult.error.code === 'unknown_outcome', 'abort/timeout did not produce code "unknown_outcome"');

/* ── 5. No token, no card metadata, anywhere ─────────────────────────────── */

const everyResult = [
  VaultResult.fromNavOutcome('Succeeded'),
  VaultResult.fromNavOutcome('Processing'),
  VaultResult.fromNavOutcome({ TAG: 'RequiresAction', type_: 'redirect_to_url', redirectUrl: 'https://x', threeDs: undefined, ddc: undefined, sessionToken: undefined }),
  VaultResult.invalidCardData(),
  VaultResult.notReady(),
  VaultResult.invalidSession(VaultResult.unusableSessionMessage),
  VaultResult.forbiddenCardData(),
  VaultResult.unsupportedConfiguration(),
  VaultResult.serverError(),
  VaultResult.unknownOutcome(),
  ...Object.keys(expected).map((code) =>
    VaultResult.fromPmsFailure({ code, message: 'x', retryable: false, unknownOutcome: false })
  ),
];

const FORBIDDEN_MEMBERS = ['token', 'payment_method_token', 'card', 'last4', 'last4Digits', 'binNumber', 'bin', 'cardNumber', 'expiryMonth', 'expiryYear', 'cvc', 'authorization', 'sdkAuthorization', 'sessionId'];
const walk = (value, path_ = '$') => {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    check(!FORBIDDEN_MEMBERS.includes(key), `a public result exposes "${key}" at ${path_}`);
    walk(child, `${path_}.${key}`);
  }
};
for (const result of everyResult) walk(result);

const succeeded = VaultResult.fromNavOutcome('Succeeded');
check(
  Object.keys(succeeded).sort().join(',') === 'status',
  `a succeeded result has unexpected keys: ${Object.keys(succeeded).join(',')}`
);
check(succeeded.status === 'succeeded', 'the succeeded result is tagged "succeeded"');

/* Direct constructors */
const validation = VaultResult.invalidCardData();
check(validation.status === 'validation_error', 'invalidCardData is not status "validation_error"');
produced.add(validation.error.code);

const notReady = VaultResult.notReady();
check(notReady.status === 'not_ready', 'notReady is not status "not_ready"');
produced.add(notReady.error.code);

produced.add(VaultResult.invalidSession(VaultResult.unusableSessionMessage).error.code);
produced.add(VaultResult.forbiddenCardData().error.code);
produced.add(VaultResult.unsupportedConfiguration().error.code);

/*
 * The eligibility DENIAL. It is a `failed` result, not a validation error, because nothing about
 * what the customer typed is wrong — the backend refused this particular card for this payment.
 */
const notEligible = VaultResult.cardNotEligible();
check(notEligible.status === 'failed', 'cardNotEligible is not status "failed"');
check(
  notEligible.error.message === VaultResult.cardNotEligibleMessage,
  'cardNotEligible does not use the library-owned message'
);
produced.add(notEligible.error.code);

/* ── 4. The public union is exactly what is reachable ────────────────────── */

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

for (const file of ['src/VaultResult.res', 'src/HyperswitchVaultForm.res']) {
  const body = readFileSync(path.join(root, file), 'utf8');
  check(!/#network_error/.test(body), `${file} references #network_error`);
}

/* ── 6. Messages are the module's own fixed strings ──────────────────────── */

const allowedMessages = new Set([
  VaultResult.invalidCardMessage,
  VaultResult.notReadyMessage,
  VaultResult.unusableSessionMessage,
  VaultResult.unknownOutcomeMessage,
  VaultResult.serverErrorMessage,
  VaultResult.forbiddenCardDataMessage,
  VaultResult.unsupportedConfigurationMessage,
  VaultResult.unauthorizedMessage,
  VaultResult.rejectedMessage,
  VaultResult.sessionAlreadyUsedMessage,
  VaultResult.sessionExpiredMessage,
  VaultResult.malformedResponseMessage,
]);
for (const reason of reasons) {
  everyResult.push(VaultResult.fromNavOutcome({ TAG: 'Failed', reason }));
}
for (const result of [...everyResult, ...tokenizeFailures, ...tokenizeSamples]) {
  if (result.error) {
    check(
      allowedMessages.has(result.error.message),
      `a result produced a message that is not one of the module's fixed strings: "${result.error.message}"`
    );
  }
}

rmSync(stage, { recursive: true, force: true });

if (failures.length) {
  console.error('\n[verify-mapping] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[verify-mapping] OK - every outcome maps to a navigation result; no token or card data anywhere');
