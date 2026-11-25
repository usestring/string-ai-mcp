// Stands in for the API's answers to requests sent without a key. A request that carries an Authorization header
// fails, so a test cannot pass on a key it did not mean to send. A fetch or search otherwise echoes the body it was
// sent, so a test can see exactly which fields went out, and a URL from the list below draws that refusal.
const refusals = {
  "https://limit.example/": [429, { error: "Keyless limit reached", message: "This address has used today's keyless allowance.", signupUrl: "https://portal.usestring.ai/sign-up?from=fixture" }],
  "https://off.example/": [503, { error: "Keyless access unavailable", message: "Requests without a key can't be served right now." }],
  "https://unaccepted.example/": [401, { error: "Unauthorized" }],
  "https://busy.example/": [429, { error: "Too Many Requests" }],
};

globalThis.fetch = async (input, options) => {
  if ("Authorization" in options.headers) throw new Error("A request without a key carried an Authorization header");
  const path = new URL(input).pathname;
  const body = JSON.parse(options.body);
  if (path === "/v1/fetch") {
    const refusal = refusals[body.url];
    if (refusal) return Response.json(refusal[1], { status: refusal[0] });
    return new Response(JSON.stringify(body), { headers: { "content-type": "text/plain" } });
  }
  if (path === "/v1/search") {
    return Response.json({ results: [{ position: 1, title: "Echo", url: "https://echo.example/", snippet: JSON.stringify(body) }] });
  }
  throw new Error(`Unexpected request to ${path}`);
};
