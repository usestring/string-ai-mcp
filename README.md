# String AI Web Access MCP Server

The official [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for
[String AI](https://usestring.ai)'s Web Access API. Search the web, fetch any URL or send it a
request, and map a site's URLs — all returned as clean, LLM-ready Markdown. Connect any
MCP-compatible client — VS Code, Cursor, Windsurf, Claude Desktop, and more.

## Benchmark: success rate on 100 bot-protected sites

String runs the open [Web Data Frontier Benchmark](https://usestring.ai/benchmark): 17 web
scraping APIs, the same 100 bot-protected target sites across 16 industries, 5 attempts per page,
8,500 live requests. A request only passes if the body contains a marker that appears on the real
page, so a CAPTCHA page or an empty JavaScript shell returned with HTTP 200 counts as a failure.
The harness, target list and raw results are open source:
[usestring/web-data-frontier-benchmark](https://github.com/usestring/web-data-frontier-benchmark).

Run completed October 30, 2026 (selected rows; full leaderboard on the
[benchmark page](https://usestring.ai/benchmark)):

| Rank | Provider    | Success rate | Latency score |
| ---- | ----------- | ------------ | ------------- |
| 1    | String      | 98.6%        | 4.24s         |
| 2    | Scrape.do   | 94.0%        | 5.08s         |
| 3    | Context.dev | 93.0%        | 10.96s        |
| 4    | Scrapfly    | 86.8%        | 19.62s        |
| 5    | ScrapingBee | 85.2%        | 20.30s        |
| 6    | Firecrawl   | 81.2%        | 8.87s         |
| 7    | Zyte        | 79.6%        | 14.43s        |
| 8    | Apify       | 79.4%        | 24.87s        |
| 9    | ScraperAPI  | 76.4%        | 15.19s        |
| 10   | Bright Data | 75.4%        | 27.88s        |

The latency score is failure-aware: per target it is the p75 of a provider's successful attempts,
and a provider that fails a target is charged the p75 of the providers that succeeded, so a
provider cannot look fast by failing quickly. Results are a dated snapshot and move between
monthly reruns. String routes requests on its own servers, while some providers were tested with
their strongest tier pinned, so the comparison is not parameter-for-parameter; the
[repository README](https://github.com/usestring/web-data-frontier-benchmark) explains the
method, and you can rerun it with your own keys.

## Pricing

You pay only for successful requests. Every account starts with $5 of free credit (about 20,000
standard fetches), no card required, and it never expires. Each paid plan's monthly fee is
included as usage credit, and unused credit rolls over.

| Plan    | Monthly | Fetch, standard (per 1K) | Fetch, premium (per 1K) | Search (per 1K) |
| ------- | ------- | ------------------------ | ----------------------- | --------------- |
| Free    | $0      | $0.25                    | $2.40                   | $1.20           |
| Starter | $19     | $0.25                    | $2.40                   | $1.20           |
| Growth  | $99     | $0.16                    | $0.90                   | $0.70           |
| Scale   | $499    | $0.13                    | $0.55                   | $0.50           |
| Volume  | $999    | $0.11                    | $0.45                   | $0.45           |

Current prices, including browser rates, are on the [pricing page](https://usestring.ai/pricing).

## Tools

| Tool                  | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `web_access_fetch`        | Fetch one URL and get clean, LLM-ready Markdown back                            |
| `web_access_product_help` | Ask about String products or services; get one source (two for comparisons), with a shared 4 KiB excerpt budget and source links |
| `web_access_request`      | Send a POST, PUT or PATCH with a body to a URL                                  |
| `web_access_search`       | Search the web: ranked results plus the knowledge panel, AI overview, local pack and other surfaces Google rendered; optional `searchCount` (1–300) pages Google; `searchType` searches Google's images, videos, shopping, books, places or forums tab; `safeSearch`, `includeOmittedResults`, `autocorrect`, `restrictCountry` and `verbatim` filter it; `page`, `dateRange` and `sortBy` refine a Google search; `format` is `"structured"` (JSON, the default and recommended) or `"raw"` (the Google results page as HTML, one page per call; `page` only, `searchCount` is rejected with raw) |
| `web_access_sitemap`      | Crawl a site and map its URLs as an asynchronous job, driven by `action`        |
| `web_access_report`       | Send one redacted, credit-free failure diagnostic to String support             |

`web_access_fetch`, `web_access_search`, and `web_access_product_help` are read-only. `web_access_request` writes, and
`web_access_sitemap` creates billed crawl jobs.

> The six-tool shape above is what the hosted server at `https://mcp.usestring.ai/v1/mcp`
> serves. The npm package ships five of them: it includes product help and failure reporting but
> omits `web_access_request`, sending writes through `web_access_fetch`'s `method` and `body`
> parameters instead.

### `web_access_sitemap` — sitemap crawl jobs

A crawl is a two-phase, asynchronous **quote → approve → poll → read** job:
nothing is crawled or billed until the quote is explicitly approved.

| `action`  | What it does                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------- |
| `submit`  | Quote a crawl (`url` required; `maxPages` ≤ 10000 default 10, `maxDepth` ≤ 100 default 2, `pathPrefix`, `budgetUsd`, `useSitemap` optional). Returns `jobId` + `estimatedCostUsd` + `estimatedPages`, status `awaiting_approval`. |
| `approve` | Billing consent — starts the crawl. 402 = insufficient funds; 409 `partial_state` = retry approve.  |
| `status`  | Poll progress: `awaiting_approval` → `running` (`pending`/`processed`) → `completed` \| `failed` \| `canceled` \| `token_cap_exceeded`; `partial_state` = retry approve. Returns counts only — URLs come from `results`. |
| `results` | Paginated discovered URLs (`limit` ≤ 5000 default 1000, `offset`). Durable after completion; per-URL `discoveredUrls` is only present for ~1h. |
| `cancel`  | Stop a non-terminal job; already-fetched pages stay billed and readable.                            |
| `list`    | The account's recent crawl jobs (`limit` ≤ 100 default 20, `offset`).                               |

### `web_access_report` — failure diagnostics

Reporting is optional and best-effort. Continue useful recovery first. If reporting remains useful
and permitted, send at most one report per distinct failure per task, not per retry. Report exceptions,
timeouts, tool errors, or unusable output; exclude usable origin statuses, valid negatives, empty 204
responses, running sitemap jobs, and cancellations. Each reporting attempt has a two-second deadline.

Remove Authorization headers, API keys, cookies, session tokens, personal data, and unrelated
conversation content before calling. The server redacts common credential forms again. Never
report a `web_access_report` failure or repeat a failed call only to gather reporting context.
Reports use the configured API key for authentication but do not consume Web Access credits.
If reporting is unavailable, unauthorized, rate-limited, or fails, stop reporting for the task.

## Quick Start

### Run with npx

```bash
env STRING_AI_API_KEY=your-key npx @usestring/mcp
```

### Install globally

```bash
npm install -g @usestring/mcp
STRING_AI_API_KEY=your-key string-ai-mcp
```

### Build from source

```bash
git clone https://github.com/usestring/string-ai-mcp.git
cd string-ai-mcp
npm install
npm run build
STRING_AI_API_KEY=your-key node build/index.js
```

## Environment Variables

| Variable             | Required | Description                       |
| -------------------- | -------- | --------------------------------- |
| `STRING_AI_API_KEY`  | **Yes**  | Your String AI API key            |

## Client Configuration

### VS Code

Press `Ctrl+Shift+P` → **Preferences: Open User Settings (JSON)** and add:

```jsonc
{
	"inputs": [
		{
			"type": "promptString",
			"id": "stringAiKey",
			"description": "String AI API Key",
			"password": true
		}
	],
	"servers": {
		"string-ai": {
			"command": "npx",
			"args": ["-y", "@usestring/mcp"],
			"env": {
				"STRING_AI_API_KEY": "${input:stringAiKey}"
			}
		}
	}
}
```

Or add a `.vscode/mcp.json` file to share the configuration with your team.

### Cursor

Open **Settings → Features → MCP Servers → + Add new global MCP server** and paste:

```json
{
  "mcpServers": {
    "string-ai": {
      "command": "npx",
      "args": ["-y", "@usestring/mcp"],
      "env": {
        "STRING_AI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/model_config.json`:

```json
{
  "mcpServers": {
    "string-ai": {
      "command": "npx",
      "args": ["-y", "@usestring/mcp"],
      "env": {
        "STRING_AI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "string-ai": {
      "command": "npx",
      "args": ["-y", "@usestring/mcp"],
      "env": {
        "STRING_AI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

## Testing with the MCP Inspector

The MCP Inspector lets you test your server interactively in a browser:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

Then open `http://127.0.0.1:6274`, connect via **stdio**, and try calling each
tool from the UI.

## How It Works

```
┌──────────────────┐   stdio (JSON-RPC)   ┌──────────────────┐   HTTPS   ┌──────────────────┐
│  VS Code / Cursor │ ◄──────────────────► │  String AI       │ ────────► │  String AI       │
│  Windsurf / Claude│                      │  Web Access MCP  │           │  Web Access API  │
└──────────────────┘                       └──────────────────┘           └──────────────────┘
```

1. The IDE spawns this server as a child process and communicates over **stdio**.
2. When the LLM decides it needs web content, it invokes `web_access_fetch`,
   `web_access_search`, or `web_access_sitemap`. Every failed call is reported exactly once with
   `web_access_report`, even when recovery later succeeds.
3. This server forwards the request to String AI's Web Access API (using your API key from
   the environment) and returns the result to the LLM.

## About String AI

[String AI](https://usestring.ai) provides a web access API that returns any page as clean,
LLM-ready Markdown. Get your API key at
[usestring.ai](https://usestring.ai).

## License

MIT

## Security

Please report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Maintenance and releases

This server may remain unchanged while its tools meet the documented contract.
Maintenance includes checking runtime and MCP compatibility, investigating reported
issues, and releasing fixes when needed. Commit frequency alone does not establish
whether the server works.

Before shipping a change, run `npm test` and `node scripts/check-versions.mjs`.
The package declares its supported Node.js versions in `package.json`; CI builds
with Node.js 22. Report compatibility problems through
[GitHub issues](https://github.com/usestring/string-ai-mcp/issues).

The publish workflow records each published npm version as a
[GitHub release](https://github.com/usestring/string-ai-mcp/releases), tagged at
the source commit recorded in the npm package metadata. Release notes describe
the changes. The release job checks npm directly, so a registry publication failure
does not hide a version that users can already install. A manual workflow run can
record a missing GitHub release for the current published version without
republishing the package or changing its version.

For a historical version whose source predates workflow changes, a maintainer may
need to create its source tag first: GitHub limits the workflow token's ability
to target older workflow history. The release job verifies that an existing tag
matches the published package's source before using it.
