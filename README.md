# `@fartlabs/go`

[![GitHub Actions](https://github.com/FartLabs/go/actions/workflows/check.yaml/badge.svg)](https://github.com/FartLabs/go/actions/workflows/check.yaml)
[![JSR](https://jsr.io/badges/@fartlabs/go)](https://jsr.io/@fartlabs/go)
[![JSR score](https://jsr.io/badges/@fartlabs/go/score)](https://jsr.io/@fartlabs/go/score)

Deterministic shortlink resolution for Deno.

This library resolves shortlinks (compact path aliases) into fully-qualified
URLs. It supports:

- Absolute destinations (e.g., `example -> https://example.com`)
- Origin-relative internal redirects with loop protection (e.g.,
  `docs -> /documentation`)
- Path appending (e.g., `/github/denoland/deno` resolves against
  `github -> https://github.com`)
- Deterministic query parameter merging and fragment selection

The resolution algorithm is documented as an Internet-Draft: see “A
Deterministic Algorithm for Resolving Shortlinks with Internal Redirects”
([IETF Datatracker](https://datatracker.ietf.org/doc/draft-go-protocol/),
[spec repo](https://github.com/EthanThatOneKid/go-protocol/)).

## Motivation

Many organizations maintain internal "go/" links (e.g., `go/docs`) for knowledge
sharing. The need is portability: define shortlinks as a simple, static
`Record<string, string>` (JSON) and get identical behavior across Cloudflare
Workers, Vercel Edge, Deno servers, or static sites. Without a standard,
behaviors diverge, especially around query params, fragments, and internal
redirects.

This project and its Internet-Draft standardize the deterministic resolution
algorithm so a single ruleset behaves the same everywhere.

## Design Goals

- Simplicity: ruleset is a plain key-value map
- Determinism: longest-prefix match, well-defined query/fragment precedence
- Portability: no runtime-specific features; works on any platform
- Safety: loop protection for internal redirects

### Non-goals (by design)

- No regex or wildcards
- No user-agent or conditional logic
- No complex rule engines

Rationale: allowing regex/wildcards transforms the data model into
`Record<regex, substitution>` and forces `O(n)` scans with engine-specific
semantics, undermining portability and the “simple JSON file” anchor. If you
need advanced routing, use tools like Nginx, Caddy, or Cloudflare Rules; this
library standardizes the "fiddly bits" for simple maps.

## Data Model

```ts
type Shortlinks = Record<string, string>;

// Example
const shortlinks = {
  "github": "https://github.com",
  "docs": "/documentation",
  "docs/api": "/documentation/reference",
};
```

## Portability and Scope

- Stateless resolution from a provided ruleset
- Storage is out of scope (KV, JSON, DB all fine)
- Works anywhere a `URL` and a `Record<string, string>` are available

## Who is this for?

Teams and OSS orgs running internal go-links who want consistent behavior across
platforms. This library is in production use across several open-source projects
and sites.

## Getting Started

Use via JSR in Deno:

```ts
import { go } from "jsr:@fartlabs/go";

// Given an incoming request URL and a shortlink ruleset
const url = new URL("https://example.com/docs/api/v1/users");
const shortlinks = {
  docs: "/documentation",
  "docs/api": "/documentation/reference",
};
const destination = go(url, shortlinks);
console.log(destination.href); // https://example.com/documentation/reference/v1/users
```

JSR documentation: `https://jsr.io/@fartlabs/go`

## Usage

### Core API

See the Getting Started example above for basic usage. The function signature
is:

```ts
function go(url: URL, shortlinks: Record<string, string>): URL;
```

Ruleset value types:

- `"https://..."` → absolute destination
- `"/path"` → internal redirect (origin-relative), supports chained redirects
  with loop protection (256 max)

Query and fragment handling:

- Query parameters merge in this order: destination base query, then any query
  embedded in the matched pathname, then the request query (later values
  overwrite earlier ones)
- Fragment precedence: request `#hash` if present, else matched-path `#hash` if
  present, else destination `#hash`

### Examples

Absolute destination with path appending:

```ts
go(new URL("https://example.com/github/ietf/guidelines"), {
  github: "https://github.com",
});
// => https://github.com/ietf/guidelines
```

Internal redirect chain:

```ts
go(new URL("https://example.com/docs/api/v1/users"), {
  docs: "/documentation",
  "docs/api": "/documentation/reference",
});
// => https://example.com/documentation/reference/v1/users
```

Query merging and fragment precedence:

```ts
go(new URL("https://example.com/example?foo=bar#yang"), {
  example: "https://example.com?baz=qux#yin",
});
// => https://example.com/?baz=qux&foo=bar#yang
```

Backwards compatibility (keeping old links alive):

Version migration without breaking old links:

```ts
go(new URL("https://example.com/docs/v1/getting-started"), {
  // Old version path now redirects to the stable location
  "docs/v1": "/docs/latest",
});
// => https://example.com/docs/latest/getting-started
```

Alias rename while preserving existing references:

```ts
go(new URL("https://example.com/handbook/intro"), {
  // Keep old alias but forward it internally to the new one
  handbook: "/guide",
  guide: "https://docs.example.com",
});
// => https://docs.example.com/intro
```

Deprecate a whole section but keep deep links working via longest-prefix:

```ts
go(new URL("https://example.com/blog/2023/launch"), {
  blog: "https://news.example.com",
});
// => https://news.example.com/2023/launch
```

## Development

### Prerequisites

- Deno latest

### Scripts

- Format: `deno fmt`
- Lint: `deno lint`
- Test: `deno test`

## License

This project is licensed under the Do What The Fuck You Want To Public License
(WTFPL). See `LICENSE` for details.

## References

- JSR package: <https://jsr.io/@fartlabs/go>
- Internet-Draft:
  [IETF Datatracker](https://datatracker.ietf.org/doc/draft-go-protocol/)
- Protocol spec repo: <https://github.com/EthanThatOneKid/go-protocol/>
- Prior art: Deno's official documentation implements a similar go-link pattern,
  demonstrating institutional demand for a standardized go-link protocol. See
  [their implementation](https://github.com/denoland/docs/blob/6c612a6531de64d6072bd8993bfdf82d769fa90e/middleware/redirects.ts#L152).

## Web Server

This repo ships a minimal web UI and API backed by Deno KV to manage shortlinks.

### Run

```bash
deno task start
```

Requires Deno and `--unstable-kv`.

### Environment Variables

- `GO_TOKEN` (optional): token required for POST/DELETE requests to `/api`.

### Data Storage

Uses Deno KV; data is stored under the `"go"` namespace key.

### Server API

All write operations require the header `Authorization: Token ${GO_TOKEN}`.

- GET `/api` (read)
  - Returns the current shortlink map `{ [alias: string]: string }`.

- POST `/api` (write)
  - Body: `{ alias: string; destination: string; force?: boolean }`
  - Creates a shortlink. If alias exists and `force` is not set, returns an
    error.

- DELETE `/api` (write)
  - Body: `{ alias: string }`
  - Deletes a shortlink.

### Deployment

Any Deno-compatible environment. The server is a simple `Deno.serve` app using
Deno KV. Ensure `--unstable-kv` is available and set `GO_TOKEN` for write
protection.

## Contribute

### Style

Run `deno fmt` to format the code.

Run `deno lint` to lint the code.

### Test

Run `deno test` to run the tests.

Run `deno task start` to start the server.

---

Developed with ❤️ [**@FartLabs**](https://github.com/FartLabs)
