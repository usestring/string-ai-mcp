// Stands in for POST /v1/fetch with actions. It echoes the body it was sent as the final page, so a test can see
// exactly what went out, and a URL from the list below draws that answer instead.
globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/fetch") throw new Error("Unexpected request");
  if (options.method !== "POST") throw new Error("Browser actions must be a POST");
  if (options.headers.Authorization !== `Bearer ${process.env.STRING_API_KEY}`) throw new Error("Wrong caller credential");
  const body = JSON.parse(options.body);
  if (body.url === "https://step-fails.example/") {
    return Response.json({
      statusCode: 200,
      headers: { "content-type": ["text/html"] },
      finalUrl: "https://step-fails.example/",
      data: "## The page before the step",
      error: "No element matches .missing",
      failedActionIndex: 1,
    });
  }
  if (body.url === "https://no-load.example/") {
    return Response.json({ statusCode: 502, headers: {}, data: "", error: "Navigation failed", failedActionIndex: null });
  }
  if (body.url === "https://refused.example/") {
    return Response.json({ error: "Invalid request", details: { fieldErrors: { actions: ["selector is required for click"] } } }, { status: 400 });
  }
  return Response.json({
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    finalUrl: `${body.url}search?q=desk`,
    data: JSON.stringify(body),
  });
};
