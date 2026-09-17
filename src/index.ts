#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// String AI Web Access MCP Server
// Official MCP server for interacting with the String AI Web Access API
// https://usestring.ai
// ---------------------------------------------------------------------------

const API_BASE_URL = "https://request.usestring.ai/v1";
const API_KEY = process.env.STRING_AI_API_KEY ?? "";

if (!API_KEY) {
	console.error("Error: STRING_AI_API_KEY environment variable is required.");
	process.exit(1);
}
interface ApiErrorBody {
	error?: string;
	message?: string;
	reason?: string;
	// Sitemap error envelopes carry the job status (e.g. the 409 partial_state
	// body), which handlers need to distinguish repairable states from failures.
	status?: string;
	// /search answers a rejected body with zod's flattened error: an unknown key
	// lands in formErrors, a bad value under its field. Without it the caller
	// sees "Invalid request" and nothing else.
	details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
}

function describeApiError(body: ApiErrorBody, fallback: string): string {
	const head = body.error ?? body.message ?? body.reason ?? fallback;
	const details = [
		...(body.details?.formErrors ?? []),
		...Object.entries(body.details?.fieldErrors ?? {}).map(([field, messages]) => `${field}: ${messages.join("; ")}`),
	];
	return details.length > 0 ? `${head}: ${details.join(", ")}` : head;
}

class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: ApiErrorBody,
		detail: string,
	) {
		super(`API request failed (${status}): ${detail}`);
	}
}

interface ApiRequestOptions {
	method?: "GET" | "POST" | "DELETE";
	query?: Record<string, string | number | undefined>;
	body?: Record<string, unknown>;
}

// Tells the String API which first-party surface a request came from; it is telemetry only and
// never affects authorization or billing.
const REQUEST_SOURCE_HEADER = "x-string-source";
const REQUEST_SOURCE = "self_hosted_mcp";

async function apiFetch(path: string, { method = "POST", query, body }: ApiRequestOptions = {}): Promise<Response> {
	const url = new URL(`${API_BASE_URL}${path}`);
	for (const [key, value] of Object.entries(query ?? {})) {
		if (value !== undefined) url.searchParams.set(key, String(value));
	}

	const res = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${API_KEY}`,
			[REQUEST_SOURCE_HEADER]: REQUEST_SOURCE,
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	if (!res.ok) {
		let detail = res.statusText;
		let errBody: ApiErrorBody = {};
		try {
			errBody = (await res.json()) as ApiErrorBody;
			detail = describeApiError(errBody, detail);
		} catch {
			// ignore parse errors on the error body
		}
		throw new ApiError(res.status, errBody, detail);
	}

	return res;
}

async function apiRequestText(path: string, body: Record<string, unknown>): Promise<string> {
	return await (await apiFetch(path, { body })).text();
}

async function apiRequestJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
	return (await (await apiFetch(path, options)).json()) as T;
}

interface SearchResult {
	position: number;
	title: string;
	url: string;
	snippet: string;
	displayUrl: string;
}

/**
 * Every field beside results and zeroResults is a surface Google rendered around the ranked
 * documents (knowledge panel, AI overviews, local pack, People also ask, ...). Each is present
 * only when the page carried it and is never merged into results; only Google returns them.
 * The full shape is documented at https://docs.usestring.ai/docs/api-reference/search#response.
 */
interface SearchResponse {
	results: SearchResult[];
	zeroResults?: boolean;
	paging?: { pages: number; complete: boolean };
	[surface: string]: unknown;
}

const SEARCH_SURFACES = [
	"entity",
	"places",
	"overviews",
	"peopleAlsoAsk",
	"relatedSearches",
	"answers",
	"spelling",
	"ads",
	"videos",
	"shortVideos",
	"discussions",
	"images",
	"sitelinks",
	"paging",
] as const;

const SEARCH_COUNT_MAX = 50;

/** Renders the ranked documents as numbered lines and appends every surface the page carried, as JSON. */
function formatSearch(data: SearchResponse): string {
	const results = data.results.map((r) => `${r.position}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
	const surfaces: Record<string, unknown> = {};
	for (const name of SEARCH_SURFACES) {
		if (data[name] !== undefined) surfaces[name] = data[name];
	}
	const head = results || (data.zeroResults ? "No results: the engine reported that nothing matched." : "No ranked documents.");
	if (Object.keys(surfaces).length === 0) return head;
	return `${head}\n\nAlso on the page (${Object.keys(surfaces).join(", ")}):\n${JSON.stringify(surfaces, null, 2)}`;
}

const server = new McpServer({
	name: "@usestring/mcp",
	version: "1.0.0",
	description:
		"String AI Web Access MCP Server - The most reliable tools for web fetching (web_access_fetch), search (web_access_search), and whole-site URL crawling (web_access_sitemap: quote with submit, consent to the quoted cost with approve, poll status, then page results). Automatically bypasses anti-bot protection, CAPTCHAs, and rate limits.",
});

server.registerTool(
	"web_access_fetch",
	{
		title: "Fetch a webpage",
		annotations: { readOnlyHint: true, openWorldHint: true },
		description: `
Fetch any webpage and get clean, LLM-ready Markdown back. String AI's Web Access API handles proxy rotation, anti-bot protection, CAPTCHAs, and JavaScript-rendered content automatically. If available, default to this tool for any web fetching or scraping.

**Primary use (the common case):** pass only a \`url\`. The page is fetched with a normal GET and returned as Markdown — no other parameters are needed.
\`\`\`json
{ "url": "https://example.com/article" }
\`\`\`

**Best for:** any URL, especially sites with anti-bot protection, paywalls, or dynamic content (news, docs, blogs, web apps).
**Not for:** searching the web when you don't have a URL — use web_access_search instead.

**Optional parameters (omit unless you need them):**
- \`format\` — \`markdown\` (default), \`raw\` (verbatim upstream body), or \`json\` (a \`{ statusCode, headers, data }\` envelope with the destination's status and headers).
- \`executeJS\` — set true to render JavaScript for SPAs when the content comes back empty. Cannot be combined with \`headers\`.
- \`method\` + \`body\` — use POST/PUT/PATCH with a body to send writes (\`body\` is rejected on GET).
- \`headers\` — forward custom request headers. Not supported when \`executeJS\` is enabled.
- \`countryCode\` — ISO 3166-1 alpha-2 (e.g. "US") to route through a proxy in that country.
- \`solveCaptcha\` — defaults true; set false to fail fast instead of spending effort solving a challenge.

**Returns:** Markdown by default; the verbatim body or a JSON envelope when \`format\` is set accordingly.
`,
		inputSchema: {
			url: z.string().url().describe("The full URL of the webpage to fetch. Must be a valid HTTP/HTTPS URL."),
			format: z
				.enum(["json", "raw", "markdown"])
				.default("markdown")
				.describe(
					"Output format: 'markdown' for clean LLM-optimized text (recommended), 'raw' for the verbatim upstream body, 'json' for a { statusCode, headers, data } envelope.",
				),
			executeJS: z
				.boolean()
				.default(false)
				.describe(
					"Enable JavaScript rendering for SPAs and dynamic content. Set to true if content appears empty or incomplete. Cannot be combined with custom headers.",
				),
			method: z
				.enum(["GET", "POST", "PUT", "PATCH"])
				.default("GET")
				.describe("HTTP method for the request. Use POST/PUT/PATCH to send a body."),
			body: z
				.union([z.string(), z.record(z.string(), z.unknown())])
				.optional()
				.describe(
					"Request body for POST/PUT/PATCH. A string is sent as-is; an object is JSON-stringified. Not allowed for GET.",
				),
			headers: z
				.record(z.string(), z.string())
				.optional()
				.describe("Custom request headers to forward (max 50). Not supported when executeJS is enabled."),
			countryCode: z
				.string()
				.length(2)
				.optional()
				.describe("ISO 3166-1 alpha-2 country code for geolocated proxy routing, e.g. 'US'."),
			solveCaptcha: z
				.boolean()
				.optional()
				.describe(
					"Whether to attempt captcha solving. Defaults to true server-side; set false to fail fast on challenges.",
				),
		},
	},
	async (args: {
		url: string;
		format: "json" | "raw" | "markdown";
		executeJS: boolean;
		method: "GET" | "POST" | "PUT" | "PATCH";
		body?: string | Record<string, unknown>;
		headers?: Record<string, string>;
		countryCode?: string;
		solveCaptcha?: boolean;
	}) => {
		const { url, format, executeJS, method, body, headers, countryCode, solveCaptcha } = args;
		try {
			const requestBody: Record<string, unknown> = { url, format, method };
			if (executeJS) requestBody.executeJS = true;
			if (body !== undefined) requestBody.body = body;
			if (headers) requestBody.headers = headers;
			if (countryCode) requestBody.countryCode = countryCode;
			if (solveCaptcha !== undefined) requestBody.solveCaptcha = solveCaptcha;

			const data = await apiRequestText("/fetch", requestBody);

			return {
				content: [
					{
						type: "text" as const,
						text: data,
					},
				],
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text: `Failed to fetch ${url}: ${message}`,
					},
				],
			};
		}
	},
);

server.registerTool(
	"web_access_search",
	{
		title: "Search the web",
		annotations: { readOnlyHint: true, openWorldHint: true },
		description: `
Search the public web for a query and get ranked organic results back, plus whatever Google rendered around them: knowledge panel, AI overview, People also ask, local pack, videos, discussions.

**Best for:** a request that names no URL, or one that needs sources found before anything is read.
**Not for:** a URL you already have — use web_access_fetch instead.

**Optional request field:** \`searchCount\` — how many organic results you want, an integer from 1 to ${SEARCH_COUNT_MAX} (above ${SEARCH_COUNT_MAX} is rejected). Google is paged, up to 10 pages, until that many are in hand; each page is billed as one search. Omit it for one page, about 10 results.

**Usage Example:**
\`\`\`json
{ "query": "latest developments in AI agents 2026" }
\`\`\`
\`\`\`json
{ "query": "construction consulting firms Ohio", "searchCount": 30 }
\`\`\`

**Returns:** the ranked organic results as numbered lines, each with position, title, URL and snippet. When the page carried more, an "Also on the page" JSON block follows with every surface Google rendered — present only when the page carried it, and only Google returns them:
- \`entity\` — the knowledge panel for the one business or person the query named: title, subtitle, description and its source, rating, reviews, website, labelled attributes (address, phone, hours…), social profiles. Often the whole answer for a business query, with no results.
- \`places\` — local-pack business listings: name, category, rating, reviews, address, phone, hours, url, mapsUrl. Read entity and places before treating empty results as no answer.
- \`overviews\` — Google's AI overviews: the first entry with no topic is the query's own summary, entries with a topic and question are the "Things to know" tabs, declined: true marks a frame Google did not fill. Each has text and the cited sources as { title, url } — fetch those to verify a claim.
- \`peopleAlsoAsk\` (questions only; answers are not on the page), \`relatedSearches\`, \`answers\` (localTime, currency, unitConversion, weather, translation, sports or flights), \`spelling\` (substituted or suggested correction).
- \`ads\`, \`videos\`, \`shortVideos\`, \`discussions\`, \`images\`, \`sitelinks\` — each entry with position, title and url.
- \`paging\` — { pages, complete }, only when searchCount was sent. pages is how many results pages answered, each billed as one search. complete: false means the search was cut short (a later page could not be fetched, or the time budget ran out before searchCount) and results holds what was collected; fewer results with complete: true means Google had no more, the ten-page cap was reached, or the first page carried no organic results (a local pack or knowledge panel alone is not paged). Surfaces describe the first page only; positions run on across pages.

A snippet is not the page, and an overview is not a source. To read a result, call web_access_fetch on its URL before answering from it.
`,
		inputSchema: {
			query: z.string().describe("The search query. Be specific and descriptive for best results."),
			searchCount: z
				.number()
				.int()
				.min(1)
				.max(SEARCH_COUNT_MAX)
				.optional()
				.describe(
					`Organic results wanted, 1 to ${SEARCH_COUNT_MAX}. Google is paged, up to 10 pages, until that many are in hand; each page is billed as one search. Omit for one page (about 10 results).`,
				),
		},
	},
	async ({ query, searchCount }) => {
		try {
			const data = await apiRequestJson<SearchResponse>("/search", {
				body: { query, ...(searchCount !== undefined ? { searchCount } : {}) },
			});

			return {
				content: [
					{
						type: "text" as const,
						text: formatSearch(data),
					},
				],
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text: `Search failed: ${message}`,
					},
				],
			};
		}
	},
);

interface SitemapSubmitResponse {
	jobId: string;
	status: string;
	estimatedCostUsd: string;
	estimatedPages: number;
}

interface SitemapJobStatusResponse {
	jobId: string;
	status: string;
	estimatedCostUsd?: string;
	pagesProcessed?: number;
	pending?: number;
	processed?: number;
	urls?: SitemapUrlEntry[];
	errorMessage?: string;
	finishedAt?: string;
}

interface SitemapUrlEntry {
	url: string;
	statusCode: number;
	discoveredUrls?: number;
	depth: number;
	isSitemap: boolean;
	error?: string;
	parentUrl: string | null;
	sourceType: string;
}

interface SitemapResultsResponse {
	jobId: string;
	total: number;
	urls: SitemapUrlEntry[];
}

interface SitemapMutationResponse {
	jobId: string;
	status: string;
}

interface SitemapListResponse {
	jobs: { jobId: string; status: string }[];
}

/** Summary + full JSON payload, matching the Go server's result() convention. */
function sitemapResult(summary: string, payload: unknown) {
	return {
		content: [
			{ type: "text" as const, text: summary },
			{ type: "text" as const, text: JSON.stringify(payload) },
		],
	};
}

function sitemapStatusDetail(status: SitemapJobStatusResponse): string {
	if (status.pending !== undefined || status.processed !== undefined) {
		return ` (pending ${status.pending ?? 0}, processed ${status.processed ?? 0})`;
	}
	if (status.pagesProcessed !== undefined) {
		return ` (${status.pagesProcessed} pages processed)`;
	}
	if (status.errorMessage) return ` (${status.errorMessage})`;
	if (status.estimatedCostUsd) return ` (estimated $${status.estimatedCostUsd})`;
	return "";
}

const sitemapHandlers: Record<string, (args: SitemapToolArgs) => Promise<ReturnType<typeof sitemapResult>>> = {
	submit: async ({ url, maxPages, maxDepth, pathPrefix, budgetUsd, useSitemap }) => {
		if (!url) throw new Error('url is required for action "submit"');
		const body: Record<string, unknown> = { url };
		if (maxPages !== undefined) body.maxPages = maxPages;
		if (maxDepth !== undefined) body.maxDepth = maxDepth;
		if (pathPrefix !== undefined) body.pathPrefix = pathPrefix;
		if (budgetUsd !== undefined) body.budgetUsd = budgetUsd;
		if (useSitemap) body.useSitemap = true;
		const data = await apiRequestJson<SitemapSubmitResponse>("/sitemap", { body });
		return sitemapResult(
			`sitemap job ${data.jobId} quoted: ~${data.estimatedPages} pages for $${data.estimatedCostUsd} — awaiting approval (call approve to start)`,
			data,
		);
	},
	approve: async ({ jobId }) => {
		const data = await apiRequestJson<SitemapMutationResponse>(
			`/sitemap/${encodeURIComponent(requireJobId(jobId, "approve"))}/approve`,
		);
		return sitemapResult(`sitemap job ${data.jobId} approved: ${data.status}`, data);
	},
	status: async ({ jobId }) => {
		const id = requireJobId(jobId, "status");
		let data: SitemapJobStatusResponse;
		try {
			data = await apiRequestJson<SitemapJobStatusResponse>(`/sitemap/${encodeURIComponent(id)}`, {
				method: "GET",
			});
		} catch (err) {
			// partial_state arrives as a 409, but it is a queryable job state with a
			// documented repair (retry approve), not a failure of the poll itself.
			if (err instanceof ApiError && err.body.status === "partial_state") {
				return sitemapResult(
					`sitemap job ${id}: partial_state — approval handoff incomplete, call approve again`,
					{ jobId: id, status: "partial_state" },
				);
			}
			throw err;
		}
		// A warm completed status inlines the full URL list (up to maxPages rows).
		// Relaying it would turn what agents treat as a cheap progress poll into an
		// unbounded result, so keep only the count and leave URL reading to the
		// paginated results action.
		const { urls, ...payload } = data;
		if (payload.pagesProcessed === undefined && urls?.length) {
			payload.pagesProcessed = urls.length;
		}
		return sitemapResult(`sitemap job ${payload.jobId}: ${payload.status}${sitemapStatusDetail(payload)}`, payload);
	},
	results: async ({ jobId, limit, offset }) => {
		// The server silently clamps oversized limits, which would make a
		// fewer-than-requested page look like the end of the data — reject instead.
		if (limit !== undefined && limit > 5000) {
			throw new Error(`limit ${limit} exceeds the results maximum of 5000 — request smaller pages and use offset`);
		}
		const data = await apiRequestJson<SitemapResultsResponse>(
			`/sitemap/${encodeURIComponent(requireJobId(jobId, "results"))}/urls`,
			{ method: "GET", query: { limit, offset } },
		);
		return sitemapResult(
			`sitemap job ${data.jobId}: ${data.urls.length} of ${data.total} urls (offset ${offset ?? 0})`,
			data,
		);
	},
	cancel: async ({ jobId }) => {
		const data = await apiRequestJson<SitemapMutationResponse>(
			`/sitemap/${encodeURIComponent(requireJobId(jobId, "cancel"))}`,
			{ method: "DELETE" },
		);
		return sitemapResult(`sitemap job ${data.jobId}: ${data.status}`, data);
	},
	list: async ({ limit, offset }) => {
		// Same clamp-vs-truncation ambiguity as results, at the list maximum.
		if (limit !== undefined && limit > 100) {
			throw new Error(`limit ${limit} exceeds the list maximum of 100 — request smaller pages and use offset`);
		}
		const data = await apiRequestJson<SitemapListResponse>("/sitemap", {
			method: "GET",
			query: { limit, offset },
		});
		return sitemapResult(`${data.jobs.length} sitemap jobs (offset ${offset ?? 0})`, data);
	},
};

function requireJobId(jobId: string | undefined, action: string): string {
	if (!jobId) throw new Error(`jobId is required for action "${action}"`);
	return jobId;
}

interface SitemapToolArgs {
	action: "submit" | "approve" | "status" | "results" | "cancel" | "list";
	url?: string;
	maxPages?: number;
	maxDepth?: number;
	pathPrefix?: string;
	budgetUsd?: number;
	useSitemap?: boolean;
	jobId?: string;
	limit?: number;
	offset?: number;
}

server.registerTool(
	"web_access_sitemap",
	{
		title: "Map a website's URLs",
		annotations: { readOnlyHint: true, openWorldHint: true },
		description: `
Crawl an entire website and map its URLs using String AI's Web Access API sitemap crawler. Starting from one URL it follows same-domain links breadth-first (optionally seeded from the site's /sitemap.xml) and records every URL it reaches with fetch status, depth, and parent. The crawl runs asynchronously server-side, so it handles whole sites that a single web_access_fetch call cannot.

**Best for:** discovering all pages/URLs of a site (site audits, building scraping worklists, coverage checks) before fetching individual pages with web_access_fetch.
**Not for:** reading one page's content (use web_access_fetch) or open-ended web queries (use web_access_search).

This single tool drives the whole job lifecycle through \`action\`:

**1. \`submit\` — quote a crawl (nothing is crawled or billed yet).** Requires \`url\`. Optional: \`maxPages\` (1–10000, default 10), \`maxDepth\` (1–100, default 2), \`pathPrefix\` (only crawl URLs whose path starts with this, e.g. "/docs"), \`budgetUsd\` (spend ceiling; the crawl stops with status token_cap_exceeded if it would exceed it), \`useSitemap\` (also seed the site's root /sitemap.xml — one extra billed page, but finds pages links miss). Returns \`jobId\`, \`estimatedPages\`, and \`estimatedCostUsd\` with status \`awaiting_approval\`.
\`\`\`json
{ "action": "submit", "url": "https://example.com", "maxPages": 200, "maxDepth": 3 }
\`\`\`

**2. \`approve\` — start the quoted crawl (requires \`jobId\`).** This is the billing-consent step: pages are billed as they are fetched, capped by the quote/budget. Before approving a non-trivial \`estimatedCostUsd\`, confirm the spend with your user. Fails with status 402 if the account balance cannot cover the quote; a 409 partial_state error means an earlier approve was interrupted — just call approve again.

**3. \`status\` — poll progress (requires \`jobId\`).** Statuses: \`awaiting_approval\` → \`running\` → terminal \`completed\` | \`failed\` | \`canceled\` | \`token_cap_exceeded\` (budget hit before maxPages; collected results are still readable). While running it returns \`pending\` and \`processed\` counts; a \`partial_state\` status means an interrupted approve — call approve again to repair it. Status never includes the URL list — page that with \`results\`. Poll every few seconds for small crawls; give hundreds-of-pages crawls tens of seconds between polls.

**4. \`results\` — page through discovered URLs (requires \`jobId\`).** Optional \`limit\` (default 1000, max 5000) and \`offset\`; \`total\` tells you when to stop paging. Each entry has \`url\`, \`statusCode\` (0 = discovered but not fetched), \`depth\`, \`parentUrl\`, \`isSitemap\`, \`sourceType\`, and an \`error\` when that page failed. \`discoveredUrls\` (links found on the page) is only present for ~1h after completion; afterwards results come from durable storage which omits it — everything else stays available.

**5. \`cancel\` — stop a running or pending job (requires \`jobId\`).** Already-terminal jobs return a 409 error. Pages already fetched stay billed and readable via \`results\`.

**6. \`list\` — recent crawl jobs for the account.** Optional \`limit\` (default 20, max 100) and \`offset\`. Use it to find a jobId you lost or check for an equivalent recent crawl before paying for a new one.

**Typical workflow:** submit → check estimatedCostUsd → approve → poll status until terminal → results (paged). A 404 on any jobId action means the job doesn't exist or belongs to another account; a 403 on submit means the target domain is blocked for this account (contact support@usestring.ai).

**Returns:** the JSON envelope for the chosen action (quote, status, URL page, job list) alongside a one-line summary.
`,
		inputSchema: {
			action: z
				.enum(["submit", "approve", "status", "results", "cancel", "list"])
				.describe(
					"Lifecycle action to perform: 'submit' (quote a new crawl), 'approve' (start a quoted crawl — billing consent), 'status' (poll progress), 'results' (page through discovered URLs), 'cancel' (stop a job), or 'list' (recent jobs).",
				),
			url: z
				.string()
				.url()
				.optional()
				.describe(
					"submit only (required there): the full http(s) URL to start crawling from. The crawl stays on this URL's domain.",
				),
			maxPages: z
				.number()
				.int()
				.min(1)
				.max(10_000)
				.optional()
				.describe("submit only: maximum pages to fetch, 1-10000 (server default 10). Each fetched page is billed."),
			maxDepth: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("submit only: maximum link depth from the start URL, 1-100 (server default 2)."),
			pathPrefix: z
				.string()
				.optional()
				.describe("submit only: restrict the crawl to URLs whose path starts with this prefix, e.g. '/docs'."),
			budgetUsd: z
				.number()
				.min(0.0001)
				.optional()
				.describe(
					"submit only: spend ceiling in USD (min 0.0001). The crawl finalizes as token_cap_exceeded when it would exceed this; omit to let the approved quote be the cap.",
				),
			useSitemap: z
				.boolean()
				.optional()
				.describe(
					"submit only: also seed the crawl from the site's root /sitemap.xml (one extra billed page; finds pages that internal links miss).",
				),
			jobId: z
				.string()
				.optional()
				.describe("The job id returned by submit. Required for approve, status, results, and cancel."),
			limit: z
				.number()
				.int()
				.min(1)
				.optional()
				.describe("results/list only: page size. results default 1000 (max 5000); list default 20 (max 100)."),
			offset: z.number().int().min(0).optional().describe("results/list only: number of rows to skip for pagination."),
		},
	},
	async (args: SitemapToolArgs) => {
		try {
			return await sitemapHandlers[args.action](args);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text: `Sitemap ${args.action} failed: ${message}`,
					},
				],
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("String AI Web Access MCP server running on stdio");
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
