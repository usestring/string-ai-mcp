globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/account/balance") throw new Error("Unexpected request");
  if (options.method !== "GET" || options.body !== undefined) throw new Error("Balance must use GET without a body");
  if (options.headers.Authorization !== `Bearer ${process.env.STRING_AI_API_KEY}`) throw new Error("Wrong caller credential");
  const mode = process.env.BALANCE_TEST_CASE;
  if (mode === "unauthorized") return new Response('{"error":"Unauthorized"}', { status: 401 });
  if (mode === "unavailable") return new Response('{"error":"Unavailable"}', { status: 500 });
  if (mode === "malformed") return new Response("{");
  if (mode === "null") return Response.json(null);
  const data = {
    currency: "USD", balance: 25, spent: 8, held: 2, remaining: 15,
    exhausted: false, asOf: "2026-11-08T12:00:00.000Z",
  };
  if (mode === "exhausted") Object.assign(data, { spent: 30, remaining: 0, exhausted: true });
  if (mode === "missing") delete data.spent;
  if (mode === "null-spent") data.spent = null;
  return Response.json(data);
};
