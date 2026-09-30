globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/search") throw new Error("Unexpected request");
  const body = JSON.parse(options.body);
  if (body.searchType === "news") {
    return Response.json({
      results: [
        { position: 1, title: "Echo", url: "https://news.example/a", snippet: JSON.stringify(body), source: "Reuters", publishedAt: "2026-09-30T08:12:00Z", age: "2 hours ago", thumbnail: "data:image/png;base64,AAAA" },
      ],
    });
  }
  return Response.json({
    results: [{ position: 1, title: "Echo", url: "https://echo.example/", snippet: JSON.stringify(body), displayUrl: "echo.example" }],
  });
};
