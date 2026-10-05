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
    assert.deepEqual(props.searchType.enum, ["web", "news"]);
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

    const news = await search({ searchType: "news", dateRange: "day", sortBy: "date" });
    assert.ok(!news.isError, JSON.stringify(news));
    const lines = news.content[0].text.split("\n");
    assert.equal(lines[1].trim(), "Reuters · 2 hours ago, published 2026-09-30T08:12:00Z");
    assert.equal(lines[2].trim(), "https://news.example/a");
    assert.deepEqual(JSON.parse(lines[3].trim()), { query: "q", searchType: "news", dateRange: "day", sortBy: "date" });
    assert.ok(!news.content[0].text.includes("data:image"), "thumbnail data URI leaked into the text");

    const raw = await search({ format: "raw", searchType: "news", searchCount: 30 });
    assert.ok(!raw.isError, JSON.stringify(raw));
    const text = raw.content[0].text;
    assert.ok(text.startsWith("Page 1 · 160 bytes\nHTML:\n<!doctype html>"), text.slice(0, 200));
    assert.ok(text.includes('<a href="https://a.example/"><h3>'), "markup altered");
    assert.ok(text.includes('{"query":"q","searchCount":30,"searchType":"news","format":"raw"}'), "request not forwarded as sent");
    assert.ok(text.includes("Page 2 · 140026 bytes\nHTML (cut short by the 60000-character budget per call):"));
    assert.ok(text.includes("Page 3 · 31 bytes\nHTML (cut short by the 60000-character budget per call, none left for this page):"));
    assert.ok(!text.includes("three"), "page past the budget still carried markup");
    assert.ok(!/htmlSource|resolved link/i.test(text), "raw text still names fields the contract dropped");
    assert.ok(text.length < 61_000 + 2_000, `raw text is ${text.length} characters`);

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
      { searchType: "images" },
      { format: "html" },
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
