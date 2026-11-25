import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// The test runner's own environment may hold either variable, so each server starts with both removed.
function envWith(keys) {
  const env = { ...process.env };
  delete env.STRING_API_KEY;
  delete env.STRING_AI_API_KEY;
  return { ...env, ...keys };
}

async function withServer(keys, run) {
  const client = new Client({ name: "keyless-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/keyless-fixture.mjs", "build/index.js"],
    env: envWith(keys),
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

test("without a key, only fetch, search and product help are listed, with only the inputs the API takes", async () => {
  await withServer({}, async (client) => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(({ name }) => name).sort(), ["web_access_fetch", "web_access_product_help", "web_access_search"]);
    const fetchTool = tools.find(({ name }) => name === "web_access_fetch");
    assert.deepEqual(Object.keys(fetchTool.inputSchema.properties), ["url", "format", "executeJS"]);
    assert.deepEqual(fetchTool.inputSchema.required, ["url"]);
    assert.equal(fetchTool.inputSchema.additionalProperties, false);
    assert.match(fetchTool.description, /with no API key/);
    const search = tools.find(({ name }) => name === "web_access_search");
    const listed = Object.keys(search.inputSchema.properties);
    // The inputs search sends without a key, as the API documents them; search lists each one it has.
    const keyless = ["query", "language", "dateRange", "sortBy", "safeSearch", "autocorrect", "verbatim"];
    assert.ok(listed.every((field) => keyless.includes(field)), listed.join());
    for (const field of ["query", "dateRange", "sortBy", "safeSearch", "autocorrect", "verbatim"]) assert.ok(listed.includes(field), field);
    assert.deepEqual(search.inputSchema.required, ["query"]);
    assert.equal(search.inputSchema.additionalProperties, false);
    for (const field of listed.filter((name) => name !== "query")) assert.match(search.description, new RegExp(`\`${field}\``));
    assert.match(client.getInstructions(), /running without an API key[\s\S]*set STRING_API_KEY/);
    const help = tools.find(({ name }) => name === "web_access_product_help");
    assert.deepEqual(Object.keys(help.inputSchema.properties), ["question"]);
  });
});

test("without a key, fetch and search send no Authorization header and only the fields they were given", async () => {
  await withServer({}, async (client) => {
    assert.deepEqual(sent(await client.callTool({ name: "web_access_fetch", arguments: { url: "https://example.com/" } })), {
      url: "https://example.com/",
      format: "markdown",
    });
    assert.deepEqual(
      sent(await client.callTool({ name: "web_access_fetch", arguments: { url: "https://example.com/", format: "raw", executeJS: true } })),
      { url: "https://example.com/", format: "raw", executeJS: true },
    );
    const search = await client.callTool({ name: "web_access_search", arguments: { query: "heat pumps", sortBy: "date", safeSearch: true } });
    assert.ok(!search.isError, JSON.stringify(search));
    assert.match(search.content[0].text, /\{"query":"heat pumps","sortBy":"date","safeSearch":true\}/);
  });
});

test("without a key, an input that needs one is refused before anything is sent", async () => {
  await withServer({}, async (client) => {
    const fetchResult = await client.callTool({ name: "web_access_fetch", arguments: { url: "https://example.com/", countryCode: "US" } });
    assert.equal(fetchResult.isError, true);
    assert.match(fetchResult.content[0].text, /countryCode/);
    assert.match(fetchResult.content[0].text, /Without a key, web_access_fetch takes only url, format and executeJS/);
    const searchResult = await client.callTool({ name: "web_access_search", arguments: { query: "heat pumps", searchCount: 30 } });
    assert.equal(searchResult.isError, true);
    assert.match(searchResult.content[0].text, /searchCount/);
    assert.match(searchResult.content[0].text, /Without a key, web_access_search takes only query, /);
    const balance = await client.callTool({ name: "web_access_balance", arguments: {} });
    assert.equal(balance.isError, true);
    assert.match(balance.content[0].text, /web_access_balance not found/);
  });
});

test("without a key, a spent or unavailable allowance says how to keep going, and other refusals pass through", async () => {
  await withServer({}, async (client) => {
    const call = async (url) => (await client.callTool({ name: "web_access_fetch", arguments: { url } })).content[0].text;
    assert.match(
      await call("https://limit.example/"),
      /The free allowance is used up for today; it resets at 00:00 UTC\. To keep going, sign up at https:\/\/portal\.usestring\.ai\/sign-up\?from=fixture and set STRING_API_KEY/,
    );
    for (const url of ["https://off.example/", "https://unaccepted.example/"]) {
      assert.match(await call(url), /Free access is not available right now\. To keep going, sign up at https:\/\/portal\.usestring\.ai\/sign-up and set STRING_API_KEY/);
    }
    const busy = await call("https://busy.example/");
    assert.match(busy, /API request failed \(429\): Too Many Requests$/);
  });
});

test("with a key, every tool and input is listed as before", async () => {
  await withServer({ STRING_API_KEY: "synthetic" }, async (client) => {
    const { tools } = await client.listTools();
    for (const name of ["web_access_balance", "web_access_report", "web_access_sitemap", "web_access_sitemap_quote"]) {
      assert.ok(tools.some((tool) => tool.name === name), name);
    }
    const fetchTool = tools.find(({ name }) => name === "web_access_fetch");
    assert.ok("countryCode" in fetchTool.inputSchema.properties);
    assert.doesNotMatch(fetchTool.description, /with no API key/);
    assert.equal(client.getInstructions(), undefined);
  });
});
