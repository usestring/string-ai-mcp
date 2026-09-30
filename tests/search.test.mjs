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
