import { Delete, Get, Post, Router } from "@fartlabs/rtx";
import {
  A,
  BODY,
  BR,
  BUTTON,
  FORM,
  H1,
  HEAD,
  HTML,
  INPUT,
  LABEL,
  LINK,
  SCRIPT,
  TITLE,
} from "@fartlabs/htx";
import { go } from "go/go.ts";

type Shortlinks = Record<string, string>;

class GoService {
  public constructor(
    private readonly kv: Deno.Kv | undefined,
    private readonly staticShortlinks: Shortlinks = {},
    private readonly kvNamespace: Deno.KvKey = ["go"],
  ) {}

  public get writable(): boolean {
    return this.kv !== undefined;
  }

  private requireKv(): Deno.Kv {
    if (!this.kv) {
      throw new Error(
        "Shortlinks are read-only: no Deno KV database is bound to this deployment.",
      );
    }
    return this.kv;
  }

  public async add(
    alias: string,
    destination: string,
    force = false,
  ): Promise<void> {
    const kv = this.requireKv();
    const shortlinksResult = await kv.get<Shortlinks>(this.kvNamespace);
    const shortlinks = shortlinksResult.value ?? {};
    if (!force && shortlinks[alias]) {
      throw new Error("Shortlink already exists.");
    }

    shortlinks[alias] = destination;
    const result = await kv.atomic()
      .check(shortlinksResult)
      .set(this.kvNamespace, shortlinks)
      .commit();
    if (!result.ok) {
      throw new Error("Failed to add shortlink.");
    }
  }

  public async delete(alias: string): Promise<void> {
    const kv = this.requireKv();
    const shortlinksResult = await kv.get<Shortlinks>(this.kvNamespace);
    const shortlinks = shortlinksResult.value ?? {};
    if (!shortlinks[alias]) {
      throw new Error("Shortlink does not exist.");
    }

    delete shortlinks[alias];
    const result = await kv.atomic()
      .check(shortlinksResult)
      .set(this.kvNamespace, shortlinks)
      .commit();
    if (!result.ok) {
      throw new Error("Failed to delete shortlink.");
    }
  }

  public async shortlinks(): Promise<Shortlinks> {
    if (!this.kv) {
      return this.staticShortlinks;
    }
    const shortlinksResult = await this.kv.get<Shortlinks>(this.kvNamespace);
    return { ...this.staticShortlinks, ...(shortlinksResult.value ?? {}) };
  }
}

function isAuthorized(headers: Headers): boolean {
  const token = Deno.env.get("GO_TOKEN");
  if (!token) {
    return true;
  }
  return headers.get("Authorization") === `Token ${token}`;
}

function GoRouter(props: { service: GoService }) {
  return (
    <Router error={(error) => Response.json({ error: error.message })}>
      <Post
        pattern="/api"
        handler={async (ctx) => {
          if (!isAuthorized(ctx.request.headers)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (!props.service.writable) {
            return Response.json(
              {
                error:
                  "Shortlinks are read-only: no Deno KV database is bound.",
              },
              { status: 503 },
            );
          }

          const body = await ctx.request.json();
          await props.service.add(body.alias, body.destination, body.force);
          return Response.json(
            { message: "Shortlink created." },
            { status: 201 },
          );
        }}
      />
      <Delete
        pattern="/api"
        handler={async (ctx) => {
          if (!isAuthorized(ctx.request.headers)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (!props.service.writable) {
            return Response.json(
              {
                error:
                  "Shortlinks are read-only: no Deno KV database is bound.",
              },
              { status: 503 },
            );
          }

          const body = await ctx.request.json();
          await props.service.delete(body.alias);
          return Response.json({ message: "Shortlink deleted." });
        }}
      />
      <Get
        pattern="/api"
        handler={async () => {
          const shortlinks = await props.service.shortlinks();
          return Response.json(shortlinks);
        }}
      />
      <Get
        pattern="/favicon.ico"
        handler={() =>
          new Response(
            null,
            {
              status: 302,
              headers: { "Location": "https://deno.land/favicon.ico" },
            },
          )}
      />
      <Get
        pattern="/"
        handler={() =>
          new Response(
            <HTML>
              <HEAD>
                <TITLE>go.fart.tools</TITLE>
                <LINK rel="icon" href="/favicon.ico" />
                <LINK
                  rel="stylesheet"
                  href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css"
                />
              </HEAD>
              <BODY>
                <H1>
                  <A href="/">go.fart.tools</A>
                </H1>
                <FORM>
                  <LABEL for="alias">
                    Alias:
                    <INPUT
                      name="alias"
                      placeholder="example"
                      autofocus="true"
                    />
                  </LABEL>
                  <BR />
                  <LABEL for="destination">
                    Destination:
                    <INPUT
                      name="destination"
                      placeholder="https://example.com"
                    />
                  </LABEL>
                  <BR />
                  <LABEL for="token">
                    Token:
                    <INPUT type="password" name="token" />
                  </LABEL>
                  <BR />
                  <BUTTON type="submit">Submit</BUTTON>
                </FORM>

                <SCRIPT>
                  {Deno.readTextFileSync(
                    new URL(import.meta.resolve("./static/ui.js")),
                  )}
                </SCRIPT>
              </BODY>
            </HTML>,
            { headers: { "Content-Type": "text/html" } },
          )}
      />
      <Get
        pattern="/:path*"
        handler={async (ctx) => {
          const shortlinks = await props.service.shortlinks();
          const url = new URL(ctx.request.url);
          const destination = go(url, shortlinks);
          if (destination.href === url.href) {
            return Response.json(
              { error: `Shortlink not found: ${url.pathname}` },
              { status: 404 },
            );
          }
          return new Response(
            null,
            {
              status: 302,
              headers: { "Location": destination.href },
            },
          );
        }}
      />
    </Router>
  );
}

const staticShortlinks: Shortlinks = JSON.parse(
  Deno.readTextFileSync(new URL("../links.json", import.meta.url)),
);

async function openKvIfAvailable(): Promise<Deno.Kv | undefined> {
  try {
    return await Deno.openKv();
  } catch (error) {
    console.warn(
      "Deno KV is unavailable, serving links.json read-only:",
      String(error),
    );
    return undefined;
  }
}

const kv = await openKvIfAvailable();

let serviceRouter: ReturnType<typeof GoRouter> | undefined;

function getServiceRouter(): ReturnType<typeof GoRouter> {
  if (!serviceRouter) {
    serviceRouter = <GoRouter service={new GoService(kv, staticShortlinks)} />;
  }
  return serviceRouter;
}

export default {
  fetch: (request: Request) => getServiceRouter().fetch(request),
} satisfies Deno.ServeDefaultExport;

if (import.meta.main) {
  const port = parseInt(Deno.env.get("PORT") ?? "8000");
  console.info(`go.fart.tools development server: http://localhost:${port}/`);
  Deno.serve({ port }, (request) => getServiceRouter().fetch(request));
}
