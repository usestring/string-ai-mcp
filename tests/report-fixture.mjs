globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/report") throw new Error("Unexpected request");
  const { error } = JSON.parse(options.body);
  if (!options.signal) throw new Error("Missing reporting deadline");
  if (error === "stalled") {
    return new Promise((_, reject) => {
      if (options.signal.aborted) return reject(options.signal.reason);
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  }
  if (error === "rate-limited") return new Response('{"error":"Too many reports"}', { status: 429 });
  return new Response('{"status":"accepted"}', { headers: { "content-type": "application/json" } });
};
