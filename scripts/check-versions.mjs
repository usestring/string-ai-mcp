// The version lives in three places that must agree before anything publishes:
// package.json (what npm serves), server.json `version` (the registry entry) and
// server.json packages[].version (the npm release that entry points at). They have
// drifted apart before, which is how the registry ended up advertising a release
// that was never published.
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const pkg = read("package.json");
const server = read("server.json");

const found = [
	["package.json version", pkg.version],
	["server.json version", server.version],
	...(server.packages ?? []).map((p, i) => [`server.json packages[${i}].version`, p.version]),
];

const disagree = found.filter(([, v]) => v !== pkg.version);
if (disagree.length > 0) {
	console.error(`version mismatch — package.json is ${pkg.version}:`);
	for (const [where, v] of disagree) console.error(`  ${where} = ${v}`);
	process.exit(1);
}
console.log(`all version fields agree at ${pkg.version}`);
