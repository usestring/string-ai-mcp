import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("search passes the Google options through and validates them", async () => {
  const client = new Client({ name: "search-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/search-fixture.mjs", "build/index.js"],
    env: { ...process.env, STRING_AI_API_KEY: "synthetic-test-key" },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const props = tools.find((tool) => tool.name === "web_access_search").inputSchema.properties;
    assert.deepEqual(props.sortBy.enum, ["relevance", "date"]);
    assert.deepEqual(props.format.enum, ["structured", "raw"]);
    assert.equal(props.page.minimum, 1);
    assert.equal(props.page.maximum, 30);
    assert.ok(props.dateRange.anyOf, JSON.stringify(props.dateRange));

    const search = (args) => client.callTool({ name: "web_access_search", arguments: { query: "q", ...args } });

    const sent = { page: 2, dateRange: { from: "2024-01-01", to: "2024-06-30" }, sortBy: "date", searchCount: 20 };
    const echoed = await search(sent);
    assert.ok(!echoed.isError, JSON.stringify(echoed));
    assert.deepEqual(JSON.parse(echoed.content[0].text.split("\n")[2].trim()), { query: "q", ...sent });

    const plain = await search({});
    assert.deepEqual(JSON.parse(plain.content[0].text.split("\n")[2].trim()), { query: "q" });

    const windowed = await search({ page: 3, dateRange: "week" });
    assert.deepEqual(JSON.parse(windowed.content[0].text.split("\n")[2].trim()), { query: "q", page: 3, dateRange: "week" });
    assert.equal(windowed.content[0].text.split("\n")[0], "1. Echo (Google rank 21)");
    assert.equal(plain.content[0].text.split("\n")[0], "1. Echo");
    assert.ok(plain.content[0].text.includes("2. Hidden\n   (no link: Google hid the destination)\n   no destination"), plain.content[0].text);
    assert.ok(!plain.content[0].text.includes("undefined"), "a result without url printed undefined");

    const raw = await search({ format: "raw", page: 2 });
    assert.ok(!raw.isError, JSON.stringify(raw));
    const text = raw.content[0].text;
    assert.match(text, /^\d+ bytes · truncated: true\nHTML \(cut short by the 60000-character budget per call\):\n<!doctype html>/);
    assert.ok(Number(text.split(" ")[0]) > 140_000, text.slice(0, 80));
    assert.ok(text.includes('<a href="https://a.example/"><h3>'), "markup altered");
    assert.ok(text.includes('{"query":"q","page":2,"format":"raw"}'), "request not forwarded as sent");
    assert.ok(text.endsWith("</h3></a>"), "cut was not at a tag boundary");
    assert.ok(!text.includes("tail"), "markup past the budget was sent");
    assert.ok(!/Page \d|htmlSource|resolved link/i.test(text), "raw text still names fields the contract dropped");
    assert.ok(text.length < 61_000, `raw text is ${text.length} characters`);

    const small = await client.callTool({ name: "web_access_search", arguments: { query: "small", format: "raw" } });
    const smallHtml = '<!doctype html><html><body><a href="https://a.example/"><h3>{"query":"small","format":"raw"}</h3></a><p>é</p></body></html>';
    assert.equal(small.content[0].text, `${Buffer.byteLength(smallHtml)} bytes · truncated: false\nHTML:\n${smallHtml}`);

    const legacy = await client.callTool({ name: "web_access_search", arguments: { query: "legacy", format: "raw" } });
    assert.ok(!legacy.isError, JSON.stringify(legacy));
    assert.ok(legacy.content[0].text.endsWith("<p>one</p><p>two</p></body></html>"), legacy.content[0].text);
    assert.ok(legacy.content[0].text.includes("truncated: false\nHTML:\n<!doctype html>"), legacy.content[0].text);

    for (const bad of [
      { page: 0 },
      { page: 31 },
      { page: 21, searchCount: 101 },
      { page: 30, searchCount: 11 },
      { dateRange: "decade" },
      { dateRange: {} },
      { dateRange: { from: "2024-06-30", to: "2024-01-01" } },
      { dateRange: { from: "2024-02-30" } },
      { dateRange: { from: "2024-01-01", until: "2024-02-01" } },
      { sortBy: "newest" },
      { format: "html" },
      { format: "raw", searchCount: 20 },
    ]) {
      const result = await search(bad).catch((err) => ({ isError: true, content: [{ text: String(err) }] }));
      assert.equal(result.isError, true, `${JSON.stringify(bad)} was accepted`);
    }
    const edge = await search({ page: 21, searchCount: 100 });
    assert.ok(!edge.isError, JSON.stringify(edge));
  } finally {
    await client.close();
  }
});

test("search sends searchType and the Google filters and renders each tab's answer", async () => {
  const client = new Client({ name: "search-types-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/search-fixture.mjs", "build/index.js"],
    env: { ...process.env, STRING_AI_API_KEY: "synthetic-test-key" },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const props = tools.find((tool) => tool.name === "web_access_search").inputSchema.properties;
    assert.deepEqual(props.searchType.enum, ["web", "images", "videos", "shopping", "books", "places", "forums"]);
    for (const name of ["safeSearch", "includeOmittedResults", "autocorrect", "verbatim"]) assert.equal(props[name].type, "boolean", name);
    assert.equal(props.restrictCountry.type, "string");

    const search = (args) => client.callTool({ name: "web_access_search", arguments: { query: "q", ...args } });

    const filters = { safeSearch: true, includeOmittedResults: true, autocorrect: false, verbatim: true, dateRange: "week" };
    const filtered = await search({ ...filters, restrictCountry: "fr" });
    assert.ok(!filtered.isError, JSON.stringify(filtered));
    assert.deepEqual(JSON.parse(filtered.content[0].text.split("\n")[2].trim()), { query: "q", dateRange: "week", ...filters, restrictCountry: "FR" });

    const images = await search({ searchType: "images", page: 3 });
    assert.ok(!images.isError, JSON.stringify(images));
    assert.equal(
      images.content[0].text,
      "1. Lounge chair\n   https://img.example/chair.jpg · 1200×800\n   on https://shop.example/chair · shop.example",
    );

    const products = await search({ searchType: "shopping", searchCount: 50 });
    assert.equal(
      products.content[0].text,
      "1. Lounge chair\n   $5,000 · was $6,000 · Shop and more merchants · rated 4.5 (20 reviews)\n   Free delivery\n   productId 123",
    );

    const places = await search({ searchType: "places", page: 15 });
    assert.equal(
      places.content[0].text,
      "1. Corner Cafe\n   Coffee shop · rated 4.7 (310 reviews)\n   1 Main St\n   https://cafe.example/ · https://maps.example/cafe",
    );

    const videos = await search({ searchType: "videos", sortBy: "date" });
    assert.ok(videos.content[0].text.endsWith("\n   video: Chan · YouTube · 3:10"), videos.content[0].text);
    assert.deepEqual(JSON.parse(videos.content[0].text.split("\n")[2].trim()), { query: "q", sortBy: "date", searchType: "videos" });

    const books = await search({ searchType: "books" });
    assert.ok(books.content[0].text.endsWith("\n   by A. Author, B. Author · 2001"), books.content[0].text);

    for (const bad of [
      { searchType: "news" },
      { searchType: "images", page: 4 },
      { searchType: "shopping", page: 2 },
      { searchType: "places", page: 16 },
      { searchType: "images", page: 3, searchCount: 101 },
      { searchType: "books", dateRange: "week" },
      { searchType: "images", sortBy: "date" },
      { searchType: "shopping", verbatim: true },
      { searchType: "videos", format: "raw" },
      { restrictCountry: "FRA" },
      { safeSearch: "yes" },
    ]) {
      const result = await search(bad).catch((err) => ({ isError: true, content: [{ text: String(err) }] }));
      assert.equal(result.isError, true, `${JSON.stringify(bad)} was accepted`);
    }
  } finally {
    await client.close();
  }
});
