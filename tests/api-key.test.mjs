import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// The test runner's own environment may hold either variable, so each case
// removes both before setting the ones it is about.
function envWith(keys) {
  const env = { ...process.env };
  delete env.STRING_API_KEY;
  delete env.STRING_AI_API_KEY;
  return { ...env, ...keys };
}

async function authorizationSent(keys) {
  const client = new Client({ name: "api-key-test", version: "1" });
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/api-key-fixture.mjs", "build/index.js"],
    env: envWith(keys),
    stderr: "pipe",
  });
  transport.stderr.on("data", (chunk) => stderr.push(chunk));
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "web_access_fetch", arguments: { url: "https://example.com/" } });
    assert.ok(!result.isError, JSON.stringify(result));
    return { authorization: result.content[0].text, stderr: Buffer.concat(stderr).toString() };
  } finally {
    await client.close();
  }
}

test("STRING_API_KEY alone is the key sent", async () => {
  const { authorization, stderr } = await authorizationSent({ STRING_API_KEY: "documented-name" });
  assert.equal(authorization, "Bearer documented-name");
  assert.doesNotMatch(stderr, /ignored/);
});

test("STRING_AI_API_KEY alone still works", async () => {
  const { authorization } = await authorizationSent({ STRING_AI_API_KEY: "earlier-name" });
  assert.equal(authorization, "Bearer earlier-name");
});

test("STRING_AI_API_KEY wins over a different STRING_API_KEY, and says so", async () => {
  const { authorization, stderr } = await authorizationSent({ STRING_API_KEY: "from-shell", STRING_AI_API_KEY: "for-this-server" });
  assert.equal(authorization, "Bearer for-this-server");
  assert.match(stderr, /Using the key in STRING_AI_API_KEY; STRING_API_KEY is also set, to a different key, and is ignored/);
});

test("the same key in both is sent without a note", async () => {
  const { authorization, stderr } = await authorizationSent({ STRING_API_KEY: "same", STRING_AI_API_KEY: "same" });
  assert.equal(authorization, "Bearer same");
  assert.doesNotMatch(stderr, /ignored/);
});

test("an empty STRING_AI_API_KEY falls back to STRING_API_KEY", async () => {
  const { authorization } = await authorizationSent({ STRING_API_KEY: "documented-name", STRING_AI_API_KEY: "" });
  assert.equal(authorization, "Bearer documented-name");
});

test("with neither set, the server exits 1 and names STRING_API_KEY", () => {
  const run = spawnSync(process.execPath, ["build/index.js"], { env: envWith({}), encoding: "utf8", timeout: 10000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /set STRING_API_KEY to a String API key from https:\/\/portal\.usestring\.ai\/settings/);
});
