globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/search") throw new Error("Unexpected request");
  const body = JSON.parse(options.body);
  return Response.json({
    results: [{ position: 1, title: "Echo", url: "https://echo.example/", snippet: JSON.stringify(body), displayUrl: "echo.example" }],
  });
};
