// Answers every fetch with the Authorization header it was sent, so a test can
// see which key the server chose.
globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/fetch") throw new Error("Unexpected request");
  return new Response(options.headers.Authorization, { headers: { "content-type": "text/plain" } });
};
