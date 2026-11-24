import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function readBalance(planCase) {
  const client = new Client({ name: "balance-plan-test", version: "1" });
  const env = { ...process.env, STRING_API_KEY: `synthetic-${planCase}`, BALANCE_PLAN_CASE: planCase };
  delete env.STRING_AI_API_KEY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/balance-plan-fixture.mjs", "build/index.js"],
    env,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const result = await client.callTool({ name: "web_access_balance", arguments: {} });
    return { tool: tools.find(({ name }) => name === "web_access_balance"), result };
  } finally {
    await client.close();
  }
}

const core = { currency: "USD", balance: 25, spent: 8, held: 2, remaining: 15, exhausted: false, asOf: "2026-11-08T12:00:00.000Z" };
const pricingUrl = "https://usestring.ai/pricing";

test("balance returns the plan, auto top-up and pricing page, in structured content and in text", async () => {
  const { tool, result } = await readBalance("paid");
  const output = tool.outputSchema;
  assert.ok(output.required.includes("pricingUrl"));
  assert.ok(!output.required.includes("plan") && !output.required.includes("autoTopUp"));
  assert.deepEqual(output.properties.plan.required, ["tier", "name", "priceUsdMonth"]);
  assert.match(tool.description, /point them to pricingUrl/);

  assert.ok(!result.isError, JSON.stringify(result));
  assert.deepEqual(result.structuredContent, {
    ...core,
    plan: { tier: "starter", name: "Starter", priceUsdMonth: 49 },
    autoTopUp: { enabled: true, amountUsd: 50, maxPerPeriodUsd: 200, spentThisPeriodUsd: 50, remainingThisPeriodUsd: 150 },
    pricingUrl,
  });
  assert.equal(result.content[0].text, "Remaining credit: 15 USD (recorded usage as of 2026-11-08T12:00:00.000Z)");
  assert.deepEqual(JSON.parse(result.content[1].text), result.structuredContent);
});

test("a free plan's nulls come back as null", async () => {
  const { result } = await readBalance("free");
  assert.deepEqual(result.structuredContent.plan, { tier: "free", name: null, priceUsdMonth: null });
  assert.deepEqual(result.structuredContent.autoTopUp, { enabled: false, amountUsd: null, maxPerPeriodUsd: null, spentThisPeriodUsd: 0, remainingThisPeriodUsd: null });
});

test("a missing, null or malformed plan or auto top-up is left out, and the balance still reads", async () => {
  for (const planCase of ["older", "null", "malformed"]) {
    const { result } = await readBalance(planCase);
    assert.ok(!result.isError, `${planCase}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.structuredContent, { ...core, pricingUrl }, planCase);
  }
});
