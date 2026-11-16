import { assertEquals, assertThrows } from "@std/assert";
import { go } from "./go.ts";

Deno.test("go resolves shortlinks", () => {
  const actual = go(new URL("https://example.com/github"), {
    github: "https://github.com/FartLabs/go",
  });
  const expected = new URL("https://github.com/FartLabs/go");
  assertEquals(actual.href, expected.href);
});

Deno.test("go throws for circularly recursive shortlinks", () => {
  function testCircularShortlinks() {
    return go(new URL("https://example.com/zig"), {
      zig: "/zag",
      zag: "/zig",
    });
  }

  let error: Error | undefined;
  try {
    testCircularShortlinks();
  } catch (e) {
    error = e as Error;
  } finally {
    assertEquals(error?.message, "cyclic shortlink: zig");
  }
});

Deno.test("go treats a self-referential shortlink as a no-op", () => {
  const shortlinks = { brand: "/brand" };
  assertEquals(
    go(new URL("https://example.com/brand"), shortlinks).href,
    "https://example.com/brand",
  );
  assertEquals(
    go(new URL("https://example.com/brand/whatever?a=b#c"), shortlinks).href,
    "https://example.com/brand/whatever?a=b#c",
  );
});

Deno.test("go throws for longer redirect cycles", () => {
  let error: Error | undefined;
  try {
    go(new URL("https://example.com/a/deep"), {
      a: "/b",
      b: "/c",
      c: "/a",
    });
  } catch (e) {
    error = e as Error;
  }
  assertEquals(error?.message, "cyclic shortlink: a");
});

Deno.test("go properly combines queries", () => {
  const actual = go(new URL("https://example.com/example?foo=bar"), {
    example: "https://example.com?baz=qux",
  });
  const expected = new URL("https://example.com/?baz=qux&foo=bar");
  assertEquals(actual.href, expected.href);
});

Deno.test("go properly overwrites hash", () => {
  const actual = go(new URL("https://example.com/example#yang"), {
    example: "https://example.com#yin",
  });
  assertEquals(actual, new URL("https://example.com/#yang"));
});

Deno.test("go overwrites hash (2)", () => {
  const actual = go(new URL("https://example.com/one#uno"), {
    one: "/two",
    two: "/three#dos",
    three: "/example#tres",
    example: "https://example.com",
  });
  const expected = new URL("https://example.com/#uno");
  assertEquals(actual.href, expected.href);
});

Deno.test("go appends pathnames", () => {
  const actual = go(new URL("https://example.com/example/baz/qux"), {
    example: "https://example.com/foo/bar",
  });
  const expected = new URL("https://example.com/foo/bar/baz/qux");
  assertEquals(actual.href, expected.href);
});

Deno.test("go appends pathnames only if separated by / or end of string", () => {
  const shortlinks = { c: "https://example.com/calendar" };
  const actual1 = go(new URL("https://example.com/colors"), shortlinks);
  const expected1 = new URL("https://example.com/colors");
  assertEquals(actual1.href, expected1.href);

  const actual2 = go(new URL("https://example.com/c"), shortlinks);
  const expected2 = new URL("https://example.com/calendar");
  assertEquals(actual2.href, expected2.href);
});

Deno.test("go resolves relative paths", () => {
  const actual = go(new URL("https://example.com/student-pack"), {
    "student-pack": "/blog/806",
  });
  const expected = new URL("https://example.com/blog/806");
  assertEquals(actual.href, expected.href);
});

Deno.test("go resolves alias shortlink", () => {
  const expected = new URL("https://example.com/blog/806");
  const input = new URL("https://example.com/student-pack");
  const actual = go(input, { "student-pack": "/blog/806" });
  assertEquals(actual.href, expected.href);
});

Deno.test("go returns passed URL if invalid or not found", () => {
  [
    new URL("https://example.com/doesnotexist"),
    new URL("https://example.com/does/not/exist"),
    new URL("https://example.com/<invalid>"),
  ].forEach((input) => {
    assertEquals(go(input, {}), input, `failed on ${input}`);
  });
});

Deno.test("go resolves subdomain destination", () => {
  const expected = new URL("https://foobar.example.com/example");
  const input = new URL("https://example.com/foo/bar");
  const actual = go(input, { "foo/bar": "https://foobar.example.com/example" });
  assertEquals(actual.href, expected.href);
});

Deno.test("backwards compat: version migration preserves deep links", () => {
  const input = new URL("https://example.com/docs/v1/getting-started");
  const actual = go(input, {
    "docs/v1": "/docs/latest",
  });
  const expected = new URL("https://example.com/docs/latest/getting-started");
  assertEquals(actual.href, expected.href);
});

Deno.test("backwards compat: alias rename forwards to new absolute destination", () => {
  const input = new URL("https://example.com/handbook/intro");
  const actual = go(input, {
    handbook: "/guide",
    guide: "https://docs.example.com",
  });
  const expected = new URL("https://docs.example.com/intro");
  assertEquals(actual.href, expected.href);
});

Deno.test("backwards compat: section deprecation with host move keeps deep links", () => {
  const input = new URL("https://example.com/blog/2023/launch");
  const actual = go(input, {
    blog: "https://news.example.com",
  });
  const expected = new URL("https://news.example.com/2023/launch");
  assertEquals(actual.href, expected.href);
});

Deno.test("go resolves shortlink with path segment without double slash", () => {
  const input = new URL("https://example.com/xyz/abc");
  const actual = go(input, {
    xyz: "https://xyz.example.com",
  });
  const expected = new URL("https://xyz.example.com/abc");
  assertEquals(actual.href, expected.href);
});

Deno.test("go self-reference: nested key passes the remaining path through", () => {
  const actual = go(new URL("https://example.com/docs/api/v1"), {
    "docs/api": "/docs/api",
  });
  assertEquals(actual.href, "https://example.com/docs/api/v1");
});

Deno.test("go self-reference: exact path with no remainder", () => {
  const actual = go(new URL("https://example.com/brand"), {
    brand: "/brand",
  });
  assertEquals(actual.href, "https://example.com/brand");
});

Deno.test("go self-reference: preserves request query and hash", () => {
  const actual = go(new URL("https://example.com/brand/logo?v=2#top"), {
    brand: "/brand",
  });
  assertEquals(actual.href, "https://example.com/brand/logo?v=2#top");
});

Deno.test("go self-reference: does not affect unrelated shortlinks", () => {
  const shortlinks = {
    brand: "/brand",
    gh: "https://github.com/FartLabs/go",
  };
  assertEquals(
    go(new URL("https://example.com/gh/issues"), shortlinks).href,
    "https://github.com/FartLabs/go/issues",
  );
  assertEquals(
    go(new URL("https://example.com/other"), shortlinks).href,
    "https://example.com/other",
  );
});

Deno.test("go self-reference: a chain ending at a self-reference resolves to it", () => {
  const actual = go(new URL("https://example.com/x/y"), {
    x: "/brand",
    brand: "/brand",
  });
  assertEquals(actual.href, "https://example.com/brand/y");
});

Deno.test("go self-reference: only an exact self-path is a no-op", () => {
  // A trailing slash, query, or hash makes the target a different resolution
  // step that loops back to the same entry, which is reported as a cycle.
  for (const target of ["/brand/", "/brand?x=1", "/brand#top"]) {
    assertThrows(
      () => go(new URL("https://example.com/brand/x"), { brand: target }),
      Error,
      "cyclic shortlink: brand",
    );
  }
});

Deno.test("go cycles: two-link cycle names the repeated shortlink", () => {
  assertThrows(
    () => go(new URL("https://example.com/a"), { a: "/b", b: "/a" }),
    Error,
    "cyclic shortlink: a",
  );
});

Deno.test("go cycles: entering a cycle from outside is detected", () => {
  assertThrows(
    () =>
      go(new URL("https://example.com/x"), {
        x: "/a",
        a: "/b",
        b: "/a",
      }),
    Error,
    "cyclic shortlink: a",
  );
});

Deno.test("go cycles: detected when the entry matches by prefix", () => {
  assertThrows(
    () => go(new URL("https://example.com/docs/a"), { docs: "/docs/v1" }),
    Error,
    "cyclic shortlink: docs",
  );
});

Deno.test("go cycles: a long acyclic chain is not a false positive", () => {
  const actual = go(new URL("https://example.com/a"), {
    a: "/b",
    b: "/c",
    c: "/d",
    d: "/e",
    e: "https://e.example.com",
  });
  assertEquals(actual.href, "https://e.example.com/");
});

Deno.test("go cycles: chain longer than the redirect limit still terminates", () => {
  const shortlinks: Record<string, string> = {};
  for (let i = 0; i < 300; i++) shortlinks[`l${i}`] = `/l${i + 1}`;
  assertThrows(
    () => go(new URL("https://example.com/l0"), shortlinks),
    Error,
    "too many internal redirects",
  );
});

Deno.test("go cycles: does not mutate the shortlinks argument", () => {
  const shortlinks = { brand: "/brand", gh: "https://github.com" };
  const snapshot = structuredClone(shortlinks);
  go(new URL("https://example.com/brand/x"), shortlinks);
  go(new URL("https://example.com/gh"), shortlinks);
  assertEquals(shortlinks, snapshot);
});

Deno.test("go cycles: the root path with no entry passes through", () => {
  const input = new URL("https://example.com/");
  assertEquals(go(input, { brand: "/brand" }).href, input.href);
});

Deno.test("go is case-sensitive by default", () => {
  const input = new URL("https://example.com/GitHub");
  assertEquals(
    go(input, { github: "https://github.com/FartLabs/go" }),
    input,
  );
});

Deno.test("go matches keys case-insensitively when caseSensitive is false", () => {
  const actual = go(
    new URL("https://example.com/GitHub/Issues"),
    { github: "https://github.com/FartLabs/go" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://github.com/FartLabs/go/Issues");
});

Deno.test("go folds key casing too when caseSensitive is false", () => {
  const actual = go(
    new URL("https://example.com/github"),
    { GitHub: "https://github.com/FartLabs/go" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://github.com/FartLabs/go");
});

Deno.test("go prefers an exact-case key when caseSensitive is false", () => {
  const shortlinks = {
    docs: "https://example.com/lower",
    Docs: "https://example.com/upper",
  };
  const options = { caseSensitive: false };
  assertEquals(
    go(new URL("https://example.com/Docs"), shortlinks, options).href,
    "https://example.com/upper",
  );
  assertEquals(
    go(new URL("https://example.com/DOCS"), shortlinks, options).href,
    "https://example.com/lower",
  );
});

Deno.test("go folds case through chained internal redirects", () => {
  const actual = go(
    new URL("https://example.com/Start"),
    { start: "/Next", next: "https://example.com/done" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://example.com/done");
});

Deno.test("go caseSensitive: explicit true and an unset option both match exactly", () => {
  const shortlinks = { github: "https://github.com/FartLabs/go" };
  const input = new URL("https://example.com/GITHUB");
  assertEquals(go(input, shortlinks, { caseSensitive: true }), input);
  assertEquals(go(input, shortlinks, {}), input);
  assertEquals(go(input, shortlinks, { caseSensitive: undefined }), input);
});

Deno.test("go caseSensitive: exact-case requests still resolve in both modes", () => {
  const shortlinks = { GitHub: "https://github.com/FartLabs/go" };
  for (const options of [{}, { caseSensitive: false }]) {
    assertEquals(
      go(new URL("https://example.com/GitHub"), shortlinks, options).href,
      "https://github.com/FartLabs/go",
    );
  }
});

Deno.test("go caseSensitive: false folds hyphenated and mixed-case keys", () => {
  const actual = go(
    new URL("https://example.com/student-PACK"),
    { "Student-Pack": "/blog/806" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://example.com/blog/806");
});

Deno.test("go caseSensitive: false folds nested keys and keeps remainder casing", () => {
  const actual = go(
    new URL("https://example.com/docs/API/v1/Intro"),
    { "Docs/api": "https://example.com/guide" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://example.com/guide/v1/Intro");
});

Deno.test("go caseSensitive: false falls back to a shorter prefix key", () => {
  const actual = go(
    new URL("https://example.com/DOCS/Sub/Path"),
    { docs: "https://d.example.com" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://d.example.com/Sub/Path");
});

Deno.test("go caseSensitive: false merges query and hash like the default", () => {
  const actual = go(
    new URL("https://example.com/GitHub?x=1#top"),
    { github: "https://github.com/FartLabs/go?tab=readme#intro" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://github.com/FartLabs/go?tab=readme&x=1#top");
});

Deno.test("go caseSensitive: false picks the first-declared key on a collision", () => {
  const options = { caseSensitive: false };
  assertEquals(
    go(
      new URL("https://example.com/DOCS"),
      { Docs: "https://example.com/upper", docs: "https://example.com/lower" },
      options,
    ).href,
    "https://example.com/upper",
  );
  assertEquals(
    go(
      new URL("https://example.com/DOCS"),
      { docs: "https://example.com/lower", Docs: "https://example.com/upper" },
      options,
    ).href,
    "https://example.com/lower",
  );
});

Deno.test("go caseSensitive: false prefers an exact nested key over a folded one", () => {
  const shortlinks = {
    "docs/api": "https://example.com/lower",
    "Docs/API": "https://example.com/upper",
  };
  const options = { caseSensitive: false };
  assertEquals(
    go(new URL("https://example.com/Docs/API"), shortlinks, options).href,
    "https://example.com/upper",
  );
  assertEquals(
    go(new URL("https://example.com/docs/api"), shortlinks, options).href,
    "https://example.com/lower",
  );
});

Deno.test("go caseSensitive: false passes unknown paths through with original casing", () => {
  const input = new URL("https://example.com/Nope/Path?Q=1#Frag");
  assertEquals(
    go(input, { other: "https://example.com" }, { caseSensitive: false }).href,
    input.href,
  );
  assertEquals(go(input, {}, { caseSensitive: false }).href, input.href);
  const root = new URL("https://example.com/");
  assertEquals(go(root, { a: "/b" }, { caseSensitive: false }).href, root.href);
});

Deno.test("go caseSensitive: internal redirects need matching case by default", () => {
  const shortlinks = { start: "/Next", next: "https://example.com/done" };
  assertEquals(
    go(new URL("https://example.com/start"), shortlinks).href,
    "https://example.com/Next",
  );
  assertEquals(
    go(new URL("https://example.com/start"), shortlinks, {
      caseSensitive: false,
    }).href,
    "https://example.com/done",
  );
});

Deno.test("go caseSensitive: self-references stay no-ops in both modes", () => {
  const shortlinks = { brand: "/brand" };
  assertEquals(
    go(new URL("https://example.com/brand/x"), shortlinks).href,
    "https://example.com/brand/x",
  );
  assertEquals(
    go(new URL("https://example.com/BRAND/x"), shortlinks).href,
    "https://example.com/BRAND/x",
  );
  assertEquals(
    go(new URL("https://example.com/BRAND/x"), shortlinks, {
      caseSensitive: false,
    }).href,
    "https://example.com/brand/x",
  );
});

Deno.test("go caseSensitive: false treats a case-variant self-reference as a no-op", () => {
  const actual = go(
    new URL("https://example.com/brand/x"),
    { Brand: "/brand" },
    { caseSensitive: false },
  );
  assertEquals(actual.href, "https://example.com/brand/x");
});

Deno.test("go caseSensitive: cycles that differ only by case", () => {
  const shortlinks = { a: "/B", b: "/A" };
  // Case-sensitive: "/B" matches no key, so the chain simply ends.
  assertEquals(
    go(new URL("https://example.com/a"), shortlinks).href,
    "https://example.com/B",
  );
  // Case-insensitive: the two entries form a cycle.
  assertThrows(
    () =>
      go(new URL("https://example.com/a"), shortlinks, {
        caseSensitive: false,
      }),
    Error,
    "cyclic shortlink",
  );
});

Deno.test("go ignores inherited Object.prototype members as shortlinks", () => {
  for (const options of [{}, { caseSensitive: false }]) {
    for (
      const path of [
        "/constructor",
        "/toString/x",
        "/hasOwnProperty",
        "/valueOf",
        "/__proto__",
        "/CONSTRUCTOR",
      ]
    ) {
      const input = new URL(`https://example.com${path}`);
      assertEquals(go(input, {}, options).href, input.href, `${path}`);
    }
  }
});

Deno.test("go resolves own shortlinks named like Object.prototype members", () => {
  const shortlinks = { constructor: "https://example.com/real" };
  assertEquals(
    go(new URL("https://example.com/constructor"), shortlinks).href,
    "https://example.com/real",
  );
});

Deno.test("go caseSensitive: false does not mutate shortlinks or options", () => {
  const shortlinks = { Docs: "https://example.com/d", brand: "/brand" };
  const options = { caseSensitive: false };
  const shortlinksSnapshot = structuredClone(shortlinks);
  go(new URL("https://example.com/DOCS"), shortlinks, options);
  go(new URL("https://example.com/BRAND/x"), shortlinks, options);
  assertEquals(shortlinks, shortlinksSnapshot);
  assertEquals(options, { caseSensitive: false });
});
