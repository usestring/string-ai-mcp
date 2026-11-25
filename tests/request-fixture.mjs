// Stands in for POST /v1/fetch. It answers with the body it was sent, so a test can see exactly which fields went out.
globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/fetch") throw new Error("Unexpected request");
  if (options.headers.Authorization !== `Bearer ${process.env.STRING_API_KEY}`) throw new Error("Wrong caller credential");
  const body = JSON.parse(options.body);
  if (body.url === "https://refused.example/") return Response.json({ error: "Forbidden" }, { status: 403 });
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};
