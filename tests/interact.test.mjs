import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function withClient(run) {
  const client = new Client({ name: "interact-test", version: "1" });
  const env = { ...process.env, STRING_API_KEY: "synthetic-interact" };
  delete env.STRING_AI_API_KEY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/interact-fixture.mjs", "build/index.js"],
    env,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    await run(client);
  } finally {
    await client.close();
  }
}

const steps = [
  { type: "click", selector: "input[name=q]" },
  { type: "write", text: "standing desk" },
];

test("web_access_interact is listed as a tool that can change the destination, with no screenshot step", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find(({ name }) => name === "web_access_interact");
    assert.ok(tool);
    assert.deepEqual(tool.annotations, { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false });
    assert.deepEqual(Object.keys(tool.inputSchema.properties), ["url", "actions", "format", "countryCode"]);
    assert.deepEqual(tool.inputSchema.required, ["url", "actions"]);
    const actions = tool.inputSchema.properties.actions;
    assert.equal(actions.minItems, 1);
    assert.equal(actions.maxItems, 50);
    assert.equal(actions.items.additionalProperties, false);
    assert.ok(!actions.items.properties.type.enum.includes("screenshot"));
    assert.deepEqual(tool.inputSchema.properties.format.enum, ["markdown", "json"]);
    assert.ok(tool.outputSchema);
  });
});

test("web_access_interact sends the steps to /v1/fetch and returns the final page", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "web_access_interact", arguments: { url: "https://shop.example/", actions: steps } });
    assert.ok(!result.isError, JSON.stringify(result));
    assert.deepEqual(JSON.parse(result.structuredContent.body), { url: "https://shop.example/", actions: steps, format: "markdown" });
    assert.equal(result.structuredContent.statusCode, 200);
    assert.equal(result.structuredContent.finalUrl, "https://shop.example/search?q=desk");
    assert.deepEqual(result.structuredContent.headers, { "content-type": ["text/html; charset=utf-8"] });
    assert.equal(result.content[0].text, `2 actions ran, HTTP 200, ${result.structuredContent.body.length} characters`);
    assert.deepEqual(JSON.parse(result.content[1].text), result.structuredContent);

    const json = await client.callTool({
      name: "web_access_interact",
      arguments: { url: "https://shop.example/", actions: steps, format: "json", countryCode: "GB" },
    });
    assert.deepEqual(JSON.parse(json.structuredContent.body), { url: "https://shop.example/", actions: steps, format: "json", countryCode: "GB" });
  });
});

test("a failed step still returns the page, naming the step", async () => {
  await withClient(async (client) => {
    const failed = await client.callTool({ name: "web_access_interact", arguments: { url: "https://step-fails.example/", actions: steps } });
    assert.ok(!failed.isError, JSON.stringify(failed));
    assert.equal(failed.structuredContent.error, "No element matches .missing");
    assert.equal(failed.structuredContent.failedActionIndex, 1);
    assert.equal(failed.structuredContent.body, "## The page before the step");
    assert.match(failed.content[0].text, /^action #1 failed: No element matches \.missing/);

    const noLoad = await client.callTool({ name: "web_access_interact", arguments: { url: "https://no-load.example/", actions: steps } });
    assert.ok(!noLoad.isError, JSON.stringify(noLoad));
    assert.equal(noLoad.structuredContent.failedActionIndex, undefined);
    assert.match(noLoad.content[0].text, /^the sequence failed: Navigation failed/);
  });
});

test("steps the tool does not take are refused before anything is sent, and an API refusal is an error", async () => {
  await withClient(async (client) => {
    for (const actions of [[], [{ type: "screenshot" }], [{ type: "click", selector: "a", full_page: true }], Array(51).fill({ type: "wait", milliseconds: 1 })]) {
      const result = await client.callTool({ name: "web_access_interact", arguments: { url: "https://shop.example/", actions } });
      assert.equal(result.isError, true, JSON.stringify(actions));
      assert.match(result.content[0].text, /Input validation error/);
    }
    const refused = await client.callTool({ name: "web_access_interact", arguments: { url: "https://refused.example/", actions: steps } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /Interaction with https:\/\/refused\.example\/ failed: API request failed \(400\): Invalid request: actions: selector is required for click/);
  });
});
