/*
 * INTERNAL. Validation for a host-supplied base URL.
 *
 * A merchant may need to point the FINAL confirm at their own environment. That is a legitimate
 * configuration knob and an obvious exfiltration vector, so the value is validated rather than
 * trusted: whatever survives here receives a payment-intent credential in an `Authorization` header.
 *
 * Rejected, and why:
 *   - non-https, except the two loopback hosts and only outside production — a plaintext hop would
 *     put the credential on the wire;
 *   - userinfo in the authority (`https://user:pass@host`) — it is a credential-shaped payload that
 *     many URL parsers and log scrubbers handle inconsistently;
 *   - any path, query or fragment — the library appends its own path, and a base with a path would
 *     let a caller reshape the final endpoint;
 *   - an unparseable value.
 *
 * An invalid endpoint is a MISCONFIGURATION, not a bad session: it surfaces as
 * `#unsupported_configuration`, so a merchant is told to fix their setup rather than being sent to
 * mint a fresh session that would fail identically.
 *
 * The PMS host is NOT configurable — call 1 always goes to the environment-selected vault host.
 */

@genType
type vaultEndpointConfig = {baseUrl: string}

type parsedUrl

@val @scope("globalThis") external urlConstructor: Nullable.t<'a> = "URL"
@new external makeUrl: string => parsedUrl = "URL"
@get external urlProtocol: parsedUrl => string = "protocol"
@get external urlHostname: parsedUrl => string = "hostname"
@get external urlUsername: parsedUrl => string = "username"
@get external urlPassword: parsedUrl => string = "password"
@get external urlPathname: parsedUrl => string = "pathname"
@get external urlSearch: parsedUrl => string = "search"
@get external urlHash: parsedUrl => string = "hash"
@get external urlOrigin: parsedUrl => string = "origin"

let loopbackHosts = ["localhost", "127.0.0.1", "10.0.2.2"]

let allowsCleartext = (environment: VaultConfirm.vaultEnvironment) =>
  switch environment {
  | #sandbox | #integration => true
  | #production => false
  }

/*
 * Returns the validated ORIGIN, never the caller's string: anything the parser normalised away
 * cannot come back. `None` means "no override" and the environment default is used.
 */
let validateEndpoint = (
  endpoint: option<vaultEndpointConfig>,
  ~environment: VaultConfirm.vaultEnvironment,
): result<option<string>, unit> =>
  switch endpoint {
  | None => Ok(None)
  | Some({baseUrl}) =>
    let trimmed = baseUrl->String.trim
    if trimmed->String.length === 0 {
      Error()
    } else {
      switch urlConstructor->Nullable.toOption {
      | None => Error()
      | Some(_) =>
        switch try {Some(makeUrl(trimmed))} catch {
        | _ => None
        } {
        | None => Error()
        | Some(url) =>
          let protocol = url->urlProtocol
          let hostname = url->urlHostname
          let isLoopback = loopbackHosts->Array.some(host => host === hostname)
          let schemeOk =
            protocol === "https:" ||
              (protocol === "http:" && isLoopback && environment->allowsCleartext)
          let hasCredentials =
            url->urlUsername->String.length > 0 || url->urlPassword->String.length > 0
          let path = url->urlPathname
          let hasPath = path->String.length > 0 && path !== "/"
          let hasQuery = url->urlSearch->String.length > 0
          let hasHash = url->urlHash->String.length > 0

          if schemeOk && !hasCredentials && !hasPath && !hasQuery && !hasHash {
            Ok(Some(url->urlOrigin))
          } else {
            Error()
          }
        }
      }
    }
  }

/* The default final-confirm host per environment, mirroring the vault host selection. */
let defaultBaseUrl = (environment: VaultConfirm.vaultEnvironment) =>
  switch environment {
  | #production => "https://checkout.hyperswitch.io/api"
  | #integration => "https://dev.hyperswitch.io/api"
  | #sandbox => "https://beta.hyperswitch.io/api"
  }

let resolveBaseUrl = (
  endpoint: option<vaultEndpointConfig>,
  ~environment: VaultConfirm.vaultEnvironment,
): result<string, unit> =>
  switch endpoint->validateEndpoint(~environment) {
  | Error() => Error()
  | Ok(None) => Ok(environment->defaultBaseUrl)
  | Ok(Some(origin)) => Ok(origin)
  }
