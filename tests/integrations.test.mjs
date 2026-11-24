import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function withClient(integrations, run) {
  const client = new Client({ name: "integrations-test", version: "1" });
  const env = { ...process.env, STRING_API_KEY: "synthetic-integrations" };
  delete env.STRING_AI_API_KEY;
  delete env.STRING_INTEGRATIONS;
  if (integrations !== undefined) env.STRING_INTEGRATIONS = integrations;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/integrations-fixture.mjs", "build/index.js"],
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

// Each tool answers with a one-line summary, then the JSON it summarizes.
const answer = (result) => {
  assert.ok(!result.isError, JSON.stringify(result));
  return { summary: result.content[0].text, json: JSON.parse(result.content[1].text) };
};
const failure = (result) => {
  assert.equal(result.isError, true, JSON.stringify(result));
  return result.content[0].text;
};
const integrations = (client, args) => client.callTool({ name: "web_access_integrations", arguments: args });
const run = (client, args) => client.callTool({ name: "web_access_integration_run", arguments: args });

test("the integration tools are listed only when STRING_INTEGRATIONS is 1, with the hosted annotations", async () => {
  for (const unset of [undefined, "", "0", "no"]) {
    await withClient(unset, async (client) => {
      const names = (await client.listTools()).tools.map(({ name }) => name);
      assert.ok(!names.includes("web_access_integrations") && !names.includes("web_access_integration_run"), `${unset}: ${names}`);
    });
  }
  await withClient("1", async (client) => {
    const { tools } = await client.listTools();
    const list = tools.find(({ name }) => name === "web_access_integrations");
    assert.deepEqual(list.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true });
    assert.deepEqual(list.inputSchema.properties.action.enum, ["list", "describe"]);
    assert.deepEqual(list.inputSchema.required, ["action"]);
    const runTool = tools.find(({ name }) => name === "web_access_integration_run");
    assert.deepEqual(runTool.annotations, { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false });
    assert.deepEqual(runTool.inputSchema.required, ["site", "action"]);
    assert.ok(tools.some(({ name }) => name === "web_access_fetch"));
  });
  await withClient("TRUE", async (client) => {
    assert.ok((await client.listTools()).tools.some(({ name }) => name === "web_access_integration_run"));
  });
});

test("list and describe read the public manifest and return the hosted tool's fields", async () => {
  await withClient("1", async (client) => {
    const listed = answer(await integrations(client, { action: "list" }));
    assert.equal(listed.summary, "2 integrations: examplesite (record, search); othersite (profile)");
    assert.deepEqual(Object.keys(listed.json), ["sites"]);
    for (const site of listed.json.sites) {
      assert.deepEqual(Object.keys(site), ["name", "title", "description", "version", "hosts", "actions"]);
      for (const action of site.actions) assert.deepEqual(Object.keys(action), ["name", "description", "requests", "billing"]);
    }
    assert.deepEqual(listed.json.sites[0].hosts, ["www.example.com"]);

    const described = answer(await integrations(client, { action: "describe", site: "examplesite" }));
    assert.equal(described.summary, "examplesite 1.2.0: 2 actions (record, search)");
    assert.deepEqual(Object.keys(described.json), ["site", "title", "description", "version", "hosts", "actions"]);
    assert.deepEqual(Object.keys(described.json.actions[0]), ["name", "description", "input", "output", "examples", "requests", "billing"]);
    assert.deepEqual(described.json.actions[0].examples, [{ input: { items: ["a"] }, output: [{ id: "a" }] }]);

    assert.match(failure(await integrations(client, { action: "describe", site: "nope" })), /^web_access_integrations failed: no integration for site "nope"; call web_access_integrations with action "list"/);
    assert.equal(failure(await integrations(client, { action: "describe" })), 'web_access_integrations failed: site is required for action "describe"');
  });
});

test("a run posts the input to the site's action and returns the envelope without its attempts", async () => {
  await withClient("1", async (client) => {
    const ran = answer(await run(client, { site: "examplesite", action: "record", input: { items: ["abc", "not-a-record"] } }));
    assert.equal(ran.summary, "examplesite.record 1.2.0: 1 row, 1 failure, 2 requests; billed passthrough, 1 call");
    assert.deepEqual(Object.keys(ran.json), ["envelopeVersion", "integration", "data", "failures", "warnings", "requests", "billing", "traceId"]);
    assert.deepEqual(ran.json.data, [{ sent: { items: ["abc", "not-a-record"] } }]);
    assert.deepEqual(ran.json.failures, [{ input: "not-a-record", error: "The site does not resolve this record" }]);
    assert.deepEqual(answer(await run(client, { site: "examplesite", action: "record" })).json.data, [{ sent: {} }]);
  });
});

test("a refused run names what to fix, and a run that failed whole carries its trace", async () => {
  await withClient("1", async (client) => {
    assert.equal(
      failure(await run(client, { site: "examplesite", action: "record", input: { items: [1] } })),
      'web_access_integration_run failed: API request failed (400): Validation error: items.0: type: 1 has type "integer", want "string"; fix the input against the input schema web_access_integrations describe returns',
    );
    assert.equal(
      failure(await run(client, { site: "examplesite", action: "nope" })),
      'web_access_integration_run failed: API request failed (404): Not found: unknown action nope; call web_access_integrations with action "list" for the sites and actions that exist',
    );
    assert.equal(
      failure(await run(client, { site: "examplesite", action: "record", input: { items: ["every-input-fails"] } })),
      "web_access_integration_run failed: API request failed (502): The site does not resolve this record (trace trace-1)",
    );
    assert.equal(
      failure(await run(client, { site: "examplesite", action: "record", input: { items: ["over-the-rate"] } })),
      "web_access_integration_run failed: API request failed (429): Rate limit exceeded",
    );
    assert.match(failure(await run(client, { site: "", action: "record" })), /Input validation error/);
  });
});
