globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (!url.hostname.endsWith("usestring.ai")) throw new Error("Unexpected host");
  const pages = {
    "/llms.txt": [
      "- [Broad comparison](https://usestring.ai/comparisons/tools): pricing cost billing Web Access requests MCP Claude Composer Bespoke Web Datasets",
      "- [Pricing](https://usestring.ai/pricing): Plans and rates",
      "- [Remote MCP](https://portal.usestring.ai/docs/mcp/remote): Connect Claude Code",
      "- [Composer](https://usestring.ai/composer)",
      "- [Bespoke Web Datasets](https://usestring.ai/managed-services)",
      "- [Products](https://usestring.ai/products)",
    ].join("\n"),
    "/pricing": "# Background\n" + "Background. ".repeat(600) + "\n## Pricing\nStarter costs $20.\n" + "Price details 界. ".repeat(1000),
    "/docs/mcp/remote": "# Claude Code\nConnect to the remote MCP endpoint.\n" + "Setup 界. ".repeat(2000),
    "/composer": "# Composer\nBuild datasets.\n" + "Composer 界. ".repeat(2000),
    "/managed-services": "# Bespoke Web Datasets\nManaged delivery.\n" + "Bespoke 界. ".repeat(2000),
    "/products": "# Products\nString products.",
    "/comparisons/tools": "# Broad comparison\n" + "pricing MCP Composer Bespoke. ".repeat(1000),
  };
  const failPricing = process.env.HELP_FIXTURE_FAIL_PRICING === "1" && url.pathname === "/pricing";
  return new Response(pages[url.pathname] ?? "Missing", {
    status: failPricing || !pages[url.pathname] ? 503 : 200,
    headers: { "content-type": "text/markdown" },
  });
};
