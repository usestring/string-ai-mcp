# String AI Web Access MCP Server

The official [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for
[String AI](https://usestring.ai)'s Web Access API. Connect any MCP-compatible client —
VS Code, Cursor, Windsurf, Claude Desktop, and more — to String AI's powerful web access capabilities.

## Tools

| Tool                  | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `web_access_fetch`    | Fetch one URL and get clean, LLM-ready Markdown back                            |
| `web_access_request`  | Send a POST, PUT or PATCH with a body to a URL                                  |
| `web_access_search`   | Search the web and get structured results back                                  |
| `web_access_sitemap`  | Crawl a site and map its URLs as an asynchronous job, driven by `action`        |

`web_access_fetch` and `web_access_search` are read-only. `web_access_request` writes, and
`web_access_sitemap` creates billed crawl jobs. Pages that rate-limit, geo-gate or block
automated traffic come back as Markdown rather than a block screen: proxy rotation, challenge
handling and JavaScript rendering happen server-side.

> The four-tool shape above is what the hosted server at `https://mcp.usestring.ai/v1/mcp`
> serves. The npm package on this repo is still at 1.2.1, where writes go through
> `web_access_fetch`'s `method` and `body` parameters instead of a separate tool.

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
2. When the LLM decides it needs web content, it invokes `web_access_fetch`
   or `web_access_search`.
3. This server forwards the request to String AI's Web Access API (using your API key from
   the environment) and returns the result to the LLM.

## About String AI

[String AI](https://usestring.ai) provides a powerful web access API that handles proxies,
anti-bot measures, and JavaScript rendering automatically. Get your API key at
[usestring.ai](https://usestring.ai).

## License

MIT

## Security

Please report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
