/**
 * go resolves a link to its destination given a collection of shortlinks.
 * @param url of incoming request.
 * @param shortlinks collection of shortlinks.
 * @param options optional resolution settings.
 * @returns the computed destination URL.
 */
export function go(
  url: URL,
  shortlinks: Record<string, string>,
  options: GoOptions = {},
): URL {
  const lookup = createLookup(shortlinks, options.caseSensitive ?? true);
  const foundURL = findURL(url.pathname, lookup, url.origin);
  if (!foundURL) {
    return url;
  }

  const { pathname, query: initialQuery, hash: initialHash, destination: dst } =
    foundURL;
  const hash = url.hash || initialHash || dst.hash;
  const query = combineQueries(dst.search, initialQuery, url.search);
  const joinedPathname = joinPathnames(dst.pathname, pathname);
  return new URL(`${dst.origin}${joinedPathname}${query}${hash}`);
}

/**
 * GoOptions are optional settings for {@link go}.
 */
export interface GoOptions {
  /**
   * caseSensitive controls whether shortlink keys are matched case-sensitively.
   * Defaults to true. When false, keys match regardless of case, an exact-case
   * key wins over a differently-cased one, and the rest of the path keeps its
   * original casing.
   */
  caseSensitive?: boolean;
}

function createLookup(
  shortlinks: Record<string, string>,
  caseSensitive: boolean,
): (id: string) => string | undefined {
  if (caseSensitive) {
    return (id) => shortlinks[id];
  }

  const folded = new Map<string, string>();
  for (const [key, value] of Object.entries(shortlinks)) {
    const foldedKey = key.toLowerCase();
    if (!folded.has(foldedKey)) {
      folded.set(foldedKey, value);
    }
  }

  return (id) => shortlinks[id] ?? folded.get(id.toLowerCase());
}

interface FoundURL {
  pathname: string;
  query: string;
  hash: string;
  destination: URL;
}

function findURL<ID extends string>(
  pathname: string,
  lookup: (id: string) => string | undefined,
  destinationOrigin: string,
  maxInternalRedirects = 256,
): FoundURL {
  const visitedIds = new Set<ID>();
  let initialHash: string | undefined;
  let initialQuery: string | undefined;
  let relativePathname = "";
  while (maxInternalRedirects-- > 0) {
    const hashIdx = pathname.lastIndexOf("#");
    if (hashIdx > -1) {
      if (initialHash === undefined) {
        initialHash = pathname.slice(hashIdx);
      }

      pathname = pathname.slice(0, hashIdx);
    }

    const queryIdx = pathname.lastIndexOf("?");
    if (queryIdx > -1) {
      if (initialQuery === undefined) {
        initialQuery = pathname.slice(queryIdx);
      }

      pathname = pathname.slice(0, queryIdx);
    }

    let id = pathname.slice(1) as ID;
    while (id.length > 0 && !lookup(id)) {
      const slashIndex = id.lastIndexOf("/");
      if (slashIndex === -1) {
        break;
      }

      id = id.slice(0, slashIndex) as ID;
    }

    const target = lookup(id);
    if (!target) {
      return {
        pathname: relativePathname,
        query: initialQuery || "",
        hash: initialHash || "",
        destination: new URL(pathname, destinationOrigin),
      };
    }

    if (target.startsWith("http")) {
      relativePathname = pathname.slice(id.length + 1) + relativePathname;

      return {
        pathname: relativePathname,
        query: initialQuery || "",
        hash: initialHash || "",
        destination: new URL(target),
      };
    }

    if (target.startsWith("/")) {
      relativePathname = pathname.slice(id.length + 1) + relativePathname;

      // A shortlink that points at its own path (e.g., "brand": "/brand") is a
      // no-op: the page already lives there, so pass the path through as-is.
      if (target === `/${id}`) {
        return {
          pathname: relativePathname,
          query: initialQuery || "",
          hash: initialHash || "",
          destination: new URL(target, destinationOrigin),
        };
      }

      if (visitedIds.has(id)) {
        throw new Error(`cyclic shortlink: ${id}`);
      }

      visitedIds.add(id);
      pathname = target;
      continue;
    }
  }

  throw new Error("too many internal redirects");
}

function combineQueries(baseQuery: string, ...queries: string[]): string {
  const baseQueryParams = new URLSearchParams(baseQuery);

  const queryParams = queries.map((q) => new URLSearchParams(q));
  for (const params of queryParams) {
    for (const [key, value] of params) {
      baseQueryParams.set(key, value);
    }
  }

  const query = baseQueryParams.toString();
  return query.length > 0 ? `?${query}` : "";
}

function joinPathnames(basePathname: string, suffixPathname: string): string {
  if (!suffixPathname) return basePathname;
  if (!basePathname) return suffixPathname;

  const baseEndsWithSlash = basePathname.endsWith("/");
  const suffixStartsWithSlash = suffixPathname.startsWith("/");
  if (baseEndsWithSlash && suffixStartsWithSlash) {
    return basePathname + suffixPathname.slice(1);
  }

  if (!baseEndsWithSlash && !suffixStartsWithSlash) {
    return `${basePathname}/${suffixPathname}`;
  }

  return basePathname + suffixPathname;
}
