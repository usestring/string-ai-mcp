// Stands in for POST /v1/search. It echoes the body it was sent inside each answer, so a test can see exactly which
// fields went out, and answers engine google_ai_mode the way the API documents it.
globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/search") throw new Error("Unexpected request");
  const body = JSON.parse(options.body);
  if (body.engine === "google_ai_mode") {
    if (body.query === "no answer") return Response.json({ error: "Search request failed", statusCode: 502 }, { status: 502 });
    if (body.query === "text only") return Response.json({ results: [], zeroResults: false, aiMode: { text: "Just the text.", sources: [] } });
    return Response.json({
      results: [],
      zeroResults: false,
      aiMode: {
        text: "Top trail running shoes",
        markdown: `## Top trail running shoes\n\nsent: ${JSON.stringify(body)}`,
        blocks: [{ type: "heading", text: "Top trail running shoes", level: 2 }],
        sources: [
          { title: "The best trail running shoes", url: "https://runners.example/best", snippet: "Our pick for rocky trails.", source: "Runners" },
          { title: "A forum thread", source: "Forum" },
        ],
        products: [{ title: "Trail shoe", price: "$124.95", merchant: "Outdoor shop" }],
        places: [{ name: "Running store", category: "Shoe store" }],
      },
    });
  }
  return Response.json({ results: [{ position: 1, title: "Echo", url: "https://echo.example/", snippet: JSON.stringify(body) }] });
};
