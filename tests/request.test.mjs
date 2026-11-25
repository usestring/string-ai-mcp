import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function withClient(run) {
  const client = new Client({ name: "request-test", version: "1" });
  const env = { ...process.env, STRING_API_KEY: "synthetic-request" };
  delete env.STRING_AI_API_KEY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/request-fixture.mjs", "build/index.js"],
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

const sent = (result) => {
  assert.ok(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
};

test("writes go through web_access_request, and web_access_fetch is a read-only GET", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const request = tools.find(({ name }) => name === "web_access_request");
    assert.ok(request);
    assert.deepEqual(request.annotations, { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false });
    assert.deepEqual(request.inputSchema.required, ["url", "method"]);
    assert.deepEqual(request.inputSchema.properties.method.enum, ["POST", "PUT", "PATCH"]);
    assert.ok(!("executeJS" in request.inputSchema.properties));
    const fetchTool = tools.find(({ name }) => name === "web_access_fetch");
    assert.equal(fetchTool.annotations.readOnlyHint, true);
    assert.ok(!("method" in fetchTool.inputSchema.properties));
    assert.ok(!("body" in fetchTool.inputSchema.properties));
    assert.equal(fetchTool.inputSchema.additionalProperties, false);
  });
});

test("web_access_request sends the method, body and the json envelope by default", async () => {
  await withClient(async (client) => {
    assert.deepEqual(
      sent(await client.callTool({ name: "web_access_request", arguments: { url: "https://api.example/search", method: "POST", body: { q: "widgets" } } })),
      { url: "https://api.example/search", method: "POST", format: "json", body: { q: "widgets" } },
    );
    assert.deepEqual(
      sent(
        await client.callTool({
          name: "web_access_request",
          arguments: { url: "https://api.example/items/1", method: "PATCH", body: "name=widget", format: "raw", headers: { "content-type": "application/x-www-form-urlencoded" }, countryCode: "DE", solveCaptcha: false },
        }),
      ),
      { url: "https://api.example/items/1", method: "PATCH", format: "raw", body: "name=widget", headers: { "content-type": "application/x-www-form-urlencoded" }, countryCode: "DE", solveCaptcha: false },
    );
    const refused = await client.callTool({ name: "web_access_request", arguments: { url: "https://refused.example/", method: "PUT", body: "x" } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /^PUT https:\/\/refused\.example\/ failed: API request failed \(403\): Forbidden$/);
  });
});

test("a GET through web_access_request, or a body through web_access_fetch, is refused before anything is sent", async () => {
  await withClient(async (client) => {
    const get = await client.callTool({ name: "web_access_request", arguments: { url: "https://api.example/", method: "GET" } });
    assert.equal(get.isError, true);
    assert.match(get.content[0].text, /Input validation error/);
    const post = await client.callTool({ name: "web_access_fetch", arguments: { url: "https://api.example/", method: "POST", body: { q: 1 } } });
    assert.equal(post.isError, true);
    assert.match(post.content[0].text, /To send a POST, PUT or PATCH with a body, use web_access_request/);
    assert.deepEqual(sent(await client.callTool({ name: "web_access_fetch", arguments: { url: "https://example.com/" } })), {
      url: "https://example.com/",
      format: "markdown",
    });
  });
});
