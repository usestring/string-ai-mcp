globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/search") throw new Error("Unexpected request");
  const body = JSON.parse(options.body);
  if (body.format === "raw") {
    const big = "<p>" + "r".repeat(70000) + "</p>";
    return Response.json({
      pages: [
        { page: 1, html: `<!doctype html><html data-generated="generated-from-parsed-results"><body><div id="search"><div id="rso"><a href="https://a.example/"><h3>${JSON.stringify(body)}</h3></a></div></div></body></html>`, htmlBytes: 160 },
        { page: 2, html: `<html><body>${big}${big}</body></html>`, htmlBytes: 140026 },
        { page: 3, html: "<html><body>three</body></html>", htmlBytes: 31 },
      ],
      paging: { pages: 3, complete: true, stoppedBy: "search_count" },
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
    results: [
      { position: 1, ...(body.page ? { rank: (body.page - 1) * 10 + 1 } : {}), title: "Echo", url: "https://echo.example/", snippet: JSON.stringify(body), displayUrl: "echo.example" },
      { position: 2, title: "Hidden", snippet: "no destination", displayUrl: "" },
    ],
  });
};
