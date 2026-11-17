import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function withBalanceClient(mode, run) {
  const client = new Client({ name: "balance-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/balance-fixture.mjs", "build/index.js"],
    env: { ...process.env, STRING_AI_API_KEY: `synthetic-${mode}`, BALANCE_TEST_CASE: mode },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    await run(client);
  } finally {
    await client.close();
  }
}

test("balance discovery and funded/exhausted reads use the configured credential", async () => {
  for (const mode of ["funded", "exhausted"]) {
    await withBalanceClient(mode, async (client) => {
      const { tools } = await client.listTools();
      const tool = tools.find(({ name }) => name === "web_access_balance");
      assert.ok(tool);
      assert.deepEqual(tool.inputSchema.properties, {});
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true,
      });
      const result = await client.callTool({ name: tool.name, arguments: {} });
      assert.ok(!result.isError);
      assert.equal(result.structuredContent.currency, "USD");
      assert.equal(result.structuredContent.remaining, mode === "exhausted" ? 0 : 15);
      assert.equal(result.structuredContent.exhausted, mode === "exhausted");
      assert.equal(result.structuredContent.held, 2);
      assert.equal((await client.callTool({ name: tool.name, arguments: { apiKey: "override" } })).isError, true);
    });
  }
});

for (const mode of ["unauthorized", "unavailable", "malformed", "null", "missing", "null-spent"]) {
  test(`balance rejects ${mode} instead of returning zero funds`, async () => {
    await withBalanceClient(mode, async (client) => {
      const result = await client.callTool({ name: "web_access_balance", arguments: {} });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent, undefined);
    });
  });
}
