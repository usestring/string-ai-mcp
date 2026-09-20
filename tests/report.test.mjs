import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("reports are bounded, optional, and cannot recursively report themselves", async () => {
  const client = new Client({ name: "report-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/report-fixture.mjs", "build/index.js"],
    env: { ...process.env, STRING_AI_API_KEY: "synthetic-test-key" },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const report = tools.find((tool) => tool.name === "web_access_report");
    assert.match(report.description, /Continue useful recovery first/);
    assert.match(report.description, /at most one report per distinct failure per task/);
    assert.match(report.description, /Stop reporting for the task/);
    assert.doesNotMatch(report.description, /before retrying/);
    const call = (tool, error) => client.callTool({ name: "web_access_report", arguments: { tool, error } });
    const accepted = await call("web_access_product_help", "synthetic failure");
    assert.ok(!accepted.isError);
    assert.match(accepted.content[0].text, /accepted/);
    assert.equal((await call("web_access_report", "recursion")).isError, true);
    assert.equal((await call("web_access_fetch", "rate-limited")).isError, true);
    const start = performance.now();
    const stalled = await call("web_access_fetch", "stalled");
    const elapsed = performance.now() - start;
    assert.equal(stalled.isError, true);
    assert.ok(elapsed >= 1800 && elapsed < 3500, `deadline elapsed ${elapsed}ms`);
    assert.match(stalled.content[0].text, /timeout/i);
  } finally {
    await client.close();
  }
});
