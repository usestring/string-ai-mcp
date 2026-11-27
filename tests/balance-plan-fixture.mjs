// Stands in for GET /v1/account/balance, with the plan and auto top-up the response carries, or an older or broken copy
// of them, chosen by BALANCE_PLAN_CASE.
globalThis.fetch = async (input, options) => {
  if (new URL(input).pathname !== "/v1/account/balance" || options.method !== "GET") throw new Error("Unexpected request");
  if (options.headers.Authorization !== `Bearer ${process.env.STRING_API_KEY}`) throw new Error("Wrong caller credential");
  const data = { currency: "USD", balance: 25, spent: 8, held: 2, remaining: 15, exhausted: false, asOf: "2026-11-08T12:00:00.000Z" };
  const extras = {
    paid: {
      plan: { tier: "starter", name: "Starter", priceUsdMonth: 49 },
      autoTopUp: { enabled: true, amountUsd: 50, maxPerPeriodUsd: 200, spentThisPeriodUsd: 50, remainingThisPeriodUsd: 150 },
    },
    free: {
      plan: { tier: "free", name: null, priceUsdMonth: null },
      autoTopUp: { enabled: false, amountUsd: null, maxPerPeriodUsd: null, spentThisPeriodUsd: 0, remainingThisPeriodUsd: null },
    },
    older: {},
    malformed: { plan: { tier: 3 }, autoTopUp: "on" },
    null: { plan: null, autoTopUp: null },
  }[process.env.BALANCE_PLAN_CASE];
  return Response.json({ ...data, ...extras });
};
