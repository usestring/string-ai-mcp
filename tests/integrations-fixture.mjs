// Stands in for the public integrations routes under /v1/integrations, answering as
// https://docs.usestring.ai/sites/making-a-request and /sites/responses document them. Any other request throws.
const action = (name, extra = {}) => ({
  name,
  description: `The ${name} action.`,
  input: { type: "object", properties: { items: { type: "array" } } },
  output: { type: "object", properties: { id: { type: "string" } } },
  examples: [{ input: { items: ["a"] }, output: [{ id: "a" }] }],
  requests: { min: 1, max: 2, per: "item" },
  billing: { mode: "passthrough" },
  // A manifest field the hosted tool leaves out, so this one must too.
  operation: "not-for-callers",
  ...extra,
});

const sites = [
  { name: "examplesite", title: "Example Site", description: "Records from an example site.", version: "1.2.0", hosts: ["www.example.com"], actions: [action("record"), action("search")] },
  { name: "othersite", title: "Other Site", description: "Profiles from another site.", version: "0.3.1", hosts: ["other.example"], actions: [action("profile")], visibility: "enterprise" },
];

globalThis.fetch = async (input, options) => {
  const { pathname } = new URL(input);
  if (options.headers.Authorization !== `Bearer ${process.env.STRING_API_KEY}`) throw new Error("Wrong caller credential");
  const method = options.method ?? "GET";
  if (method === "GET" && pathname === "/v1/integrations/manifest.json") return Response.json({ manifestVersion: 2, sites });
  const site = pathname.match(/^\/v1\/integrations\/([^/]+)$/);
  if (method === "GET" && site) {
    const found = sites.find(({ name }) => name === decodeURIComponent(site[1]));
    if (!found) return Response.json({ error: "Not found", message: `unknown site ${decodeURIComponent(site[1])}` }, { status: 404 });
    return Response.json({ manifestVersion: 2, sites: [found] });
  }
  const run = pathname.match(/^\/v1\/integrations\/([^/]+)\/([^/]+)$/);
  if (method !== "POST" || !run) throw new Error(`Unexpected request: ${method} ${pathname}`);
  const [name, act] = [decodeURIComponent(run[1]), decodeURIComponent(run[2])];
  const body = JSON.parse(options.body);
  const envelope = {
    envelopeVersion: 1,
    integration: { site: name, action: act, version: "1.2.0" },
    data: [{ sent: body }],
    failures: [{ input: "not-a-record", error: "The site does not resolve this record" }],
    warnings: [],
    requests: [
      { url: "", requestType: "request_standard", requestId: "r1" },
      { url: "", requestType: "request_standard", requestId: "r2" },
    ],
    attempts: [{ host: "", path: "", outcome: "ok", status: 200, durationMs: 10 }],
    attemptTotals: { attempts: 1, failed: 0, cancelled: 0, billed: 1 },
    billing: { mode: "passthrough", calls: 1, rows: 1 },
    traceId: "trace-1",
  };
  if (name === "examplesite" && act === "record") {
    if (body.items?.[0] === 1) {
      return Response.json(
        { error: "Validation error", message: 'type: 1 has type "integer", want "string"', issues: [{ field: "items.0", message: 'type: 1 has type "integer", want "string"' }] },
        { status: 400 },
      );
    }
    if (body.items?.[0] === "every-input-fails") {
      return Response.json({ ...envelope, data: [], requests: [], billing: { mode: "passthrough", calls: 0, rows: 0 }, error: "The site does not resolve this record" }, { status: 502 });
    }
    if (body.items?.[0] === "over-the-rate") return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
    return Response.json(envelope);
  }
  return Response.json({ error: "Not found", message: `unknown action ${act}` }, { status: 404 });
};
