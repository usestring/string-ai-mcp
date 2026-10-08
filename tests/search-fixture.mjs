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
  if (body.searchType === "images") {
    return Response.json({
      results: [],
      images: [{ position: 1, title: "Lounge chair", url: "https://shop.example/chair", source: "shop.example", imageUrl: "https://img.example/chair.jpg", imageWidth: 1200, imageHeight: 800, thumbnail: "https://thumb.example/1" }],
    });
  }
  if (body.searchType === "shopping") {
    return Response.json({
      results: [],
      products: [{ position: 1, title: "Lounge chair", productId: "123", price: "$5,000", originalPrice: "$6,000", merchant: "Shop", moreMerchants: true, delivery: "Free delivery", rating: 4.5, reviews: 20 }],
    });
  }
  if (body.searchType === "places") {
    return Response.json({
      results: [],
      places: [{ position: 1, name: "Corner Cafe", category: "Coffee shop", rating: 4.7, reviews: 310, address: "1 Main St", url: "https://cafe.example/", mapsUrl: "https://maps.example/cafe" }],
    });
  }
  if (body.searchType === "videos" || body.searchType === "books") {
    return Response.json({
      results: [
        body.searchType === "videos"
          ? { position: 1, title: "Video", url: "https://v.example/", snippet: JSON.stringify(body), video: { channel: "Chan", platform: "YouTube", duration: "3:10" } }
          : { position: 1, title: "Book", url: "https://b.example/", snippet: JSON.stringify(body), book: { authors: ["A. Author", "B. Author"], published: "2001" } },
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
