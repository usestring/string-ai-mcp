# String AI Web Access MCP Server

The official [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for
[String AI](https://usestring.ai)'s Web Access API. Search the web, fetch any URL or send it a
request, and map a site's URLs — all returned as clean, LLM-ready Markdown. Connect any
MCP-compatible client — VS Code, Cursor, Windsurf, Claude Desktop, and more.

## Connect to the hosted server

The hosted server runs at `https://mcp.usestring.ai` over Streamable HTTP. There is nothing to
install, and you can start without an account or an API key.

| URL | Access | What it serves |
| --- | --- | --- |
| `https://mcp.usestring.ai` | No account or API key | Fetch and search within a free daily allowance, plus String product help |
| `https://mcp.usestring.ai?login` | Sign in with your String account | Every hosted tool: search, fetch, browser actions on a page, sending requests to a URL, site crawls, your account balance and String product help |
| `https://mcp.usestring.ai/integration` | Sign in, or an API key | Every hosted tool plus site integrations |

Claude, Claude Code, ChatGPT, Codex, Grok and OpenCode v2 can sign in with String. In other
clients, connect to `https://mcp.usestring.ai` and send an API key as
`Authorization: Bearer YOUR_API_KEY`. You can create a key in
[String settings](https://portal.usestring.ai/settings).

### Claude Code

```bash
claude mcp add --transport http --scope user string "https://mcp.usestring.ai?login"
claude mcp login string
```

The second command opens String's sign-in page in your browser. To try the server without an
account, add `https://mcp.usestring.ai` and skip the second command.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "string": {
      "url": "https://mcp.usestring.ai",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "stringApiKey",
      "description": "String API key",
      "password": true
    }
  ],
  "servers": {
    "string": {
      "type": "http",
      "url": "https://mcp.usestring.ai",
      "headers": { "Authorization": "Bearer ${input:stringApiKey}" }
    }
  }
}
```

In Cursor or VS Code, leave out `headers` (and the VS Code `inputs`) to use the free tools with no
key.

Setup for Claude, ChatGPT, Codex, Grok, OpenCode and other clients is in the
[hosted MCP docs](https://docs.usestring.ai/mcp/remote). To run the server on your own
machine instead, see [Run it locally](#run-it-locally).

## Tools

| Tool                  | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `web_access_balance`      | Read your account's USD balance, recorded spend, held credit and remaining credit; free to call |
| `web_access_fetch`        | Fetch one URL and get clean, LLM-ready Markdown back                            |
| `web_access_integrations` | List maintained integrations for specific sites, and describe a site's actions with their input and output schemas |
| `web_access_integration_run` | Run one action of a site integration and get typed rows back, billed to your String account |
| `web_access_interact`     | Run browser actions on a page (click, type, scroll, wait), then read the page they leave; billed as a browser session |
| `web_access_product_help` | Ask about String products or services; get one source (two for comparisons), with a shared 4 KiB excerpt budget and source links |
| `web_access_request`      | Send a POST, PUT or PATCH with a body to a URL                                  |
| `web_access_search`       | Search the web: ranked results plus the knowledge panel, AI overview, local pack and other surfaces Google rendered; `country`, `language`, `location` and `coordinates` set where it runs from; `aiMode` asks Google AI Mode for one answer with its sources instead, and `aiOverview` fills a streamed AI Overview at twice the cost; optional `searchCount` (1–300) pages Google; `searchType` searches Google's images, videos, shopping, books, places or forums tab; `safeSearch`, `includeOmittedResults`, `autocorrect`, `restrictCountry` and `verbatim` filter it; `page`, `dateRange` and `sortBy` refine a Google search; `format` is `"structured"` (JSON, the default and recommended) or `"raw"` (the Google results page as HTML, one page per call; `page` only, `searchCount` is rejected with raw) |
| `web_access_sitemap_quote` | Quote a crawl of one site: estimated pages and cost. Nothing is crawled or billed until the crawl starts |
| `web_access_sitemap_start` | Start a quoted crawl after the user approves the quote; pages are billed as they are fetched |
| `web_access_sitemap_status` | Check a crawl's progress, and read the URLs it found once it finishes |
| `web_access_sitemap`      | Deprecated: the same crawl lifecycle in one tool, driven by `action`            |
| `web_access_report`       | Send one redacted, credit-free failure diagnostic to String support             |

The tools you get depend on where you connect:

| Server | Tools |
| --- | --- |
| `https://mcp.usestring.ai` with no key | `web_access_fetch`, `web_access_search` and `web_access_product_help` |
| The npm package, run locally with no key | The same three, within the same daily allowance; see [Without a key](#without-a-key) |
| `https://mcp.usestring.ai?login`, or `https://mcp.usestring.ai` with an API key | Those three, plus `web_access_request`, `web_access_interact`, `web_access_sitemap_quote`, `web_access_sitemap_start`, `web_access_sitemap_status` and `web_access_balance` |
| `https://mcp.usestring.ai/integration` | All of the above, plus `web_access_integrations` and `web_access_integration_run` |
| The npm package, run locally | `web_access_fetch`, `web_access_interact`, `web_access_search`, `web_access_product_help`, `web_access_balance`, `web_access_sitemap_quote`, `web_access_sitemap_start`, `web_access_sitemap_status`, the deprecated `web_access_sitemap` and `web_access_report` |

`web_access_search`, `web_access_product_help`, `web_access_balance`, `web_access_sitemap_status`
and `web_access_integrations` are read-only. So is `web_access_fetch` on the hosted server, where
`web_access_interact` runs browser actions that can modify destination data and `web_access_request`
sends writes. The npm package's fetch can send writes through `method` and `body`.
`web_access_sitemap_start` and the npm package's `web_access_sitemap` start billed crawl jobs, and
`web_access_integration_run` is billed to your account.

### `web_access_balance` - account balance

The npm package also provides `web_access_balance`. Call it with no arguments to read your
organization's USD `balance`, recorded `spent`, `held`, `remaining`, `exhausted` and `asOf`.
The read is free and works when your balance is exhausted. `asOf` is query time; unrecorded
usage is excluded. Use the `exhausted` flag to check exhaustion, rather than deriving it
from rounded monetary amounts. The snapshot is not a final invoice or a guarantee that a
later request can run.

Balance checks count toward your organization's API rate limit alongside other requests.
If you exceed the limit, the API returns `429 Too Many Requests`. See
[rate limits](https://docs.usestring.ai/api-reference/rate-limits) for plan limits and
retry guidance.

### `web_access_sitemap_quote`, `web_access_sitemap_start`, `web_access_sitemap_status`

A crawl is a **quote → start → poll** job: nothing is crawled or billed until the user approves
the quote and `web_access_sitemap_start` runs.

| Tool | What it does |
| --- | --- |
| `web_access_sitemap_quote` | `url` required; `maxPages` ≤ 10000 default 10, `maxDepth` ≤ 100 default 2, `pathPrefix`, `budgetUsd`, `useSitemap` optional. Returns `jobId` + `estimatedCostUsd` + `estimatedPages`, status `awaiting_approval`. |
| `web_access_sitemap_start` | Billing consent: starts the quoted crawl. 402 = insufficient funds; 409 `partial_state` = call it again. |
| `web_access_sitemap_status` | Poll progress: `awaiting_approval` → `running` (`pending`/`processed`) → `completed` \| `failed` \| `canceled` \| `token_cap_exceeded`. Once terminal it also returns `total` and one page of `urls` (`limit` ≤ 5000 default 1000, `offset`). |

### `web_access_sitemap` — sitemap crawl jobs (deprecated)

Use the three tools above instead; this one keeps working for existing callers. A crawl is a two-phase, asynchronous **quote → approve → poll → read** job:
nothing is crawled or billed until the quote is explicitly approved.

| `action`  | What it does                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------- |
| `submit`  | Quote a crawl (`url` required; `maxPages` ≤ 10000 default 10, `maxDepth` ≤ 100 default 2, `pathPrefix`, `budgetUsd`, `useSitemap` optional). Returns `jobId` + `estimatedCostUsd` + `estimatedPages`, status `awaiting_approval`. |
| `approve` | Billing consent — starts the crawl. 402 = insufficient funds; 409 `partial_state` = retry approve.  |
| `status`  | Poll progress: `awaiting_approval` → `running` (`pending`/`processed`) → `completed` \| `failed` \| `canceled` \| `token_cap_exceeded`; `partial_state` = retry approve. Returns counts only — URLs come from `results`. |
| `results` | Paginated discovered URLs (`limit` ≤ 5000 default 1000, `offset`). Durable after completion; per-URL `discoveredUrls` is only present for ~1h. |
| `cancel`  | Stop a non-terminal job; already-fetched pages stay billed and readable.                            |
| `list`    | The account's recent crawl jobs (`limit` ≤ 100 default 20, `offset`).                               |

### `web_access_interact` — browser actions

The npm package also provides `web_access_interact`, as the hosted server does. It opens `url` in a real browser
session, runs `actions` in order (1 to 50 steps of `wait`, `click`, `write`, `press`, `scroll`, `navigate`, `hover`
or `selectOption`), and returns the page as it stands after the last one: Markdown by default, its HTML with
`format: "json"`. A failed step still returns the page, with `error` and `failedActionIndex` naming the step. Its
annotations say a call can change data on the destination, so a client that follows them asks before each one. A call
is billed as a browser session; see [Browser actions](https://docs.usestring.ai/fetch/browser-actions).

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

## Run it locally

The npm package runs the server on your own machine over stdio. With a String API key, it lists the tools
the table above gives for the npm package. Without one, it lists `web_access_fetch`, `web_access_search` and
`web_access_product_help`; see [Without a key](#without-a-key).

### Run with npx

```bash
env STRING_API_KEY=your-key npx @usestring/mcp
```

Leave out `STRING_API_KEY` to try it without a key.

### Without a key

With no `STRING_API_KEY`, fetch and search call the Web Access API with no `Authorization` header, so they run
within the API's [allowance without a key](https://docs.usestring.ai/get-started/authentication#without-a-key): a
daily allowance per IP address that resets at 00:00 UTC. They take only the inputs that allowance accepts, and list
only those: fetch takes `url`, `format` and `executeJS`, and search takes `query` and a few filters such as
`dateRange` and `sortBy`. Any other input is refused before anything is sent. Product help reads String's public site
and needs no key at all.

When the allowance runs out, or the API is not serving requests without a key, the tool's error says so and where to
sign up. Set `STRING_API_KEY` in the server's environment for the other tools, the other inputs and your account's own
limits.

### Install globally

```bash
npm install -g @usestring/mcp
STRING_API_KEY=your-key string-ai-mcp
```

### Build from source

```bash
git clone https://github.com/usestring/string-ai-mcp.git
cd string-ai-mcp
npm install
npm run build
STRING_API_KEY=your-key node build/index.js
```

## Environment Variables

| Variable             | Required | Description                       |
| -------------------- | -------- | --------------------------------- |
| `STRING_API_KEY`     | No       | Your String API key, from [String settings](https://portal.usestring.ai/settings). Without it, only fetch, search and product help are listed; see [Without a key](#without-a-key). Read from 1.4.1 on. `STRING_AI_API_KEY`, the only name earlier releases read, still works, and wins when both are set. |

## Client Configuration

### VS Code

Press `Ctrl+Shift+P` → **Preferences: Open User Settings (JSON)** and add:

```jsonc
{
	"inputs": [
		{
			"type": "promptString",
			"id": "stringApiKey",
			"description": "String AI API Key",
			"password": true
		}
	],
	"servers": {
		"string": {
			"command": "npx",
			"args": ["-y", "@usestring/mcp"],
			"env": {
				"STRING_API_KEY": "${input:stringApiKey}"
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
    "string": {
      "command": "npx",
      "args": ["-y", "@usestring/mcp"],
      "env": {
        "STRING_API_KEY": "YOUR_API_KEY"
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
    "string": {
      "command": "npx",
      "args": ["-y", "@usestring/mcp"],
      "env": {
        "STRING_API_KEY": "YOUR_API_KEY"
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
    "string": {
      "command": "npx",
      "args": ["-y", "@usestring/mcp"],
      "env": {
        "STRING_API_KEY": "YOUR_API_KEY"
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
   `web_access_search`, or the `web_access_sitemap_*` tools. Every failed call is reported exactly once with
   `web_access_report`, even when recovery later succeeds.
3. This server forwards the request to String AI's Web Access API (with your API key from
   the environment, or without one within the free allowance) and returns the result to the LLM.

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
