globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/search") throw new Error("Unexpected request");
  const body = JSON.parse(options.body);
  if (body.format === "raw") {
    const big = "<p>" + "r".repeat(70000) + "</p>";
    const head = `<!doctype html><html><body><a href="https://a.example/"><h3>${JSON.stringify(body)}</h3></a>`;
    if (body.query === "legacy") {
      return Response.json({
        pages: [
          { page: 1, html: `${head}<p>one</p>`, htmlBytes: 0 },
          { page: 2, html: "<p>two</p></body></html>", htmlBytes: 0 },
        ],
        paging: { pages: 2, complete: true, stoppedBy: "search_count" },
      });
    }
    const html = body.query === "small" ? `${head}<p>é</p></body></html>` : `${head}${big}${big}<p>tail</p></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return Response.json({
    results: [
      { position: 1, ...(body.page ? { rank: (body.page - 1) * 10 + 1 } : {}), title: "Echo", url: "https://echo.example/", snippet: JSON.stringify(body), displayUrl: "echo.example" },
      { position: 2, title: "Hidden", snippet: "no destination", displayUrl: "" },
    ],
  });
};
