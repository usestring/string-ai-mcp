globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/search") throw new Error("Unexpected request");
  const body = JSON.parse(options.body);
  if (body.format === "raw") {
    const big = "<p>" + "r".repeat(70000) + "</p>";
    return Response.json({
      pages: [
        { page: 1, html: `<html><head><script>var s = "<p>";</script><style>p{}</style></head><body><a href="https://a.example/" data-original-href="/goto?a">${JSON.stringify(body)}</a></body></html>`, htmlBytes: 1048576, htmlSource: "google", resolvedLinks: { "/goto?a": "https://a.example/" } },
        { page: 2, html: `<html><body>${big}${big}</body></html>`, htmlBytes: 140026, htmlSource: "rendered", resolvedLinks: {} },
        { page: 3, html: "<html><body>three</body></html>", htmlBytes: 31, htmlSource: "partner", resolvedLinks: { "/goto?c": "https://c.example/" } },
      ],
      paging: { pages: 3, complete: true },
    });
  }
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
