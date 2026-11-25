import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function withClient(run) {
  const client = new Client({ name: "search-ai-mode-test", version: "1" });
  const env = { ...process.env, STRING_API_KEY: "synthetic-search" };
  delete env.STRING_AI_API_KEY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./tests/search-ai-mode-fixture.mjs", "build/index.js"],
    env,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    await run((args) => client.callTool({ name: "web_access_search", arguments: { query: "q", ...args } }), client);
  } finally {
    await client.close();
  }
}

const text = (result) => {
  assert.ok(!result.isError, JSON.stringify(result));
  return result.content[0].text;
};
// The fixture puts the body it was sent in the first result's snippet, or in an AI Mode answer's "sent:" line.
const sentWith = (result) => JSON.parse(text(result).split("\n")[2].trim());
const sentInAnswer = (result) => JSON.parse(text(result).split("\n").find((line) => line.startsWith("sent: ")).slice("sent: ".length));

test("search lists the targeting fields, aiMode and aiOverview", async () => {
  await withClient(async (_search, client) => {
    const { tools } = await client.listTools();
    const props = tools.find(({ name }) => name === "web_access_search").inputSchema.properties;
    for (const field of ["country", "language", "location", "coordinates", "aiMode", "aiOverview"]) assert.ok(props[field], field);
    assert.equal(props.location.maxLength, 200);
    assert.deepEqual(props.coordinates.required, ["latitude", "longitude"]);
    assert.equal(props.coordinates.additionalProperties, false);
    assert.equal(props.coordinates.properties.radius.maximum, 1_000_000);
    assert.equal(props.aiMode.type, "boolean");
  });
});

test("country, language, location, coordinates and aiOverview reach the API as the reference names them", async () => {
  await withClient(async (search) => {
    const coordinates = { latitude: 30.2672, longitude: -97.7431, radius: 2000 };
    assert.deepEqual(sentWith(await search({ country: "gb", language: "pt-br", location: "  Austin,Texas,United States  ", coordinates })), {
      query: "q",
      country: "GB",
      language: "pt-br",
      location: "Austin,Texas,United States",
      coordinates,
    });
    assert.deepEqual(sentWith(await search({ aiOverview: true })), { query: "q", aiOverview: true });
    assert.deepEqual(sentWith(await search({ aiMode: false })), { query: "q" });
  });
});

test("aiMode asks the google_ai_mode engine and renders its answer, sources and what it showed", async () => {
  await withClient(async (search) => {
    const answer = await search({ aiMode: true, country: "GB", language: "en", location: "London", coordinates: { latitude: 51.5, longitude: -0.12 } });
    assert.deepEqual(sentInAnswer(answer), {
      query: "q",
      engine: "google_ai_mode",
      country: "GB",
      language: "en",
      location: "London",
      coordinates: { latitude: 51.5, longitude: -0.12 },
    });
    const rendered = text(answer);
    assert.ok(rendered.startsWith("## Top trail running shoes\n\n"), rendered);
    assert.ok(
      rendered.includes(
        "Sources:\n1. The best trail running shoes\n   https://runners.example/best\n   Our pick for rocky trails.\n   from Runners\n\n2. A forum thread\n   (no link: the citation could not be resolved)\n   from Forum",
      ),
      rendered,
    );
    const shown = JSON.parse(rendered.slice(rendered.indexOf("Also in the answer (products, places):\n") + "Also in the answer (products, places):\n".length));
    assert.deepEqual(Object.keys(shown), ["products", "places"]);
    assert.ok(!rendered.includes("undefined"), rendered);

    assert.equal(text(await search({ query: "text only", aiMode: true })), "Just the text.\n\nSources: none cited.");

    const unavailable = await search({ query: "no answer", aiMode: true });
    assert.equal(unavailable.isError, true);
    assert.match(unavailable.content[0].text, /^Search failed: API request failed \(502\)/);
  });
});

test("fields AI Mode or the tab does not take are refused before anything is sent", async () => {
  await withClient(async (search) => {
    const refusals = [
      [{ aiMode: true, searchCount: 20 }, /^Search failed: searchCount does not apply with aiMode/],
      [{ aiMode: true, aiOverview: true }, /^Search failed: aiOverview does not apply with aiMode/],
      [{ aiMode: true, page: 2 }, /^Search failed: page does not apply with aiMode/],
      [{ aiMode: true, dateRange: "week" }, /^Search failed: dateRange does not apply with aiMode/],
      [{ aiMode: true, sortBy: "date" }, /^Search failed: sortBy does not apply with aiMode/],
      [{ aiMode: true, searchType: "web" }, /^Search failed: searchType does not apply with aiMode/],
      [{ aiMode: true, safeSearch: false }, /^Search failed: safeSearch does not apply with aiMode/],
      [{ aiMode: true, includeOmittedResults: true }, /^Search failed: includeOmittedResults does not apply with aiMode/],
      [{ aiMode: true, autocorrect: true }, /^Search failed: autocorrect does not apply with aiMode/],
      [{ aiMode: true, restrictCountry: "FR" }, /^Search failed: restrictCountry does not apply with aiMode/],
      [{ aiMode: true, verbatim: false }, /^Search failed: verbatim does not apply with aiMode/],
      [{ aiMode: true, format: "raw" }, /^Search failed: format "raw" does not apply with aiMode/],
      [{ aiOverview: true, searchType: "images" }, /^Search failed: aiOverview applies only to searchType web, got "images"/],
    ];
    for (const [args, message] of refusals) {
      const result = await search(args);
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(result.content[0].text, message, JSON.stringify(args));
    }
    for (const args of [
      { country: "GBR" },
      { language: "english" },
      { location: "   " },
      { location: "x".repeat(201) },
      { coordinates: { latitude: 91, longitude: 0 } },
      { coordinates: { latitude: 0, longitude: 0, radius: 0 } },
      { coordinates: { latitude: 0, longitude: 0, altitude: 10 } },
    ]) {
      const result = await search(args);
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(result.content[0].text, /Input validation error/, JSON.stringify(args));
    }
  });
});
