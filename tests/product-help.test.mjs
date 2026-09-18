import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function withClient(fn, env = {}) {
  const client = new Client({ name: "help-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/help-fixture.mjs", "build/index.js"],
    env: { ...process.env, STRING_AI_API_KEY: "synthetic-test-key", ...env },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    await fn(client);
  } finally {
    await client.close();
  }
}

test("help selects canonical pages within one shared UTF-8 excerpt budget", async () => {
  await withClient(async (client) => {
    for (const [question, paths] of [
      ["How does String price Web Access requests?", ["/pricing"]],
      ["How do I connect String MCP to Claude Code?", ["/docs/mcp/remote"]],
      ["How do I run self-hosted MCP locally?", ["/docs/mcp/self-hosted"]],
      ["How does Composer differ from Bespoke Web Datasets?", ["/composer", "/managed-services"]],
    ]) {
      const result = await client.callTool({ name: "web_access_product_help", arguments: { question } });
      assert.ok(!result.isError, JSON.stringify(result));
      const { sources } = JSON.parse(result.content[0].text);
      assert.deepEqual(sources.map((source) => new URL(source.url).pathname).sort(), paths.sort());
      assert.ok(sources.reduce((total, source) => total + Buffer.byteLength(source.excerpt), 0) <= 4096);
      for (const source of sources) {
        assert.equal(source.truncated, true);
        assert.ok(!source.excerpt.includes("\ufffd"));
      }
      if (paths.includes("/pricing")) assert.match(sources[0].excerpt, /Starter costs \$20/);
    }
  });
});

test("help falls back when its highest-ranked page is unavailable", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "web_access_product_help", arguments: { question: "What is the price?" } });
    assert.ok(!result.isError);
    const { sources } = JSON.parse(result.content[0].text);
    assert.equal(sources.length, 1);
    assert.notEqual(new URL(sources[0].url).pathname, "/pricing");
  }, { HELP_FIXTURE_FAIL_PRICING: "1" });
});
