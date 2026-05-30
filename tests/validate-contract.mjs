/**
 * S00 contract validator — computational mirror runner.
 * Parses docs/implementation_contract.md, asserts all done criteria.
 * Exits 0 on pass, 1 on failure (red/green signal for the harness).
 *
 * mirror record: reflects=S00-exec-contract, test_kind=journey,
 *                cert_language=gherkin, liveness=live
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const CONTRACT_PATH = resolve(ROOT, "docs/implementation_contract.md");

let failures = 0;

function assert(condition, message) {
	if (!condition) {
		console.error(`  FAIL: ${message}`);
		failures++;
	} else {
		console.log(`  PASS: ${message}`);
	}
}

// ── Scenario: The contract file exists ──────────────────────────────────────
console.log("\nScenario: The contract file exists");

let raw;
try {
	raw = readFileSync(CONTRACT_PATH, "utf8");
	assert(true, "docs/implementation_contract.md exists on disk");
} catch {
	assert(false, "docs/implementation_contract.md exists on disk");
	console.error("Cannot continue — file missing.");
	process.exit(1);
}

// ── Scenario: The contract is versioned and parses ──────────────────────────
console.log("\nScenario: The contract is versioned and parses");

// Extract the YAML front block (between the first pair of ---\n lines)
const frontMatch = raw.match(/^---\n([\s\S]*?)\n---/);
assert(frontMatch !== null, "Embedded front block delimited by --- found");

if (!frontMatch) {
	console.error("Cannot continue — no front block.");
	process.exit(1);
}

const yamlText = frontMatch[1];

// Parse YAML manually enough to extract the contract object.
// We avoid adding a yaml dep; use a targeted regex approach since the file
// format is under our control.

// Extract contract.version and contract.kind
const versionMatch = yamlText.match(/^\s{2}version:\s*"([^"]+)"/m);
const kindMatch = yamlText.match(/^\s{2}kind:\s*(\S+)/m);

const version = versionMatch ? versionMatch[1] : null;
const kind = kindMatch ? kindMatch[1] : null;

// semver pattern: MAJOR.MINOR.PATCH
const SEMVER = /^\d+\.\d+\.\d+$/;
assert(
	version !== null && SEMVER.test(version),
	`version is semver — got "${version}"`,
);
assert(kind === "step-contract", `kind is "step-contract" — got "${kind}"`);

// ── Extract phases ──────────────────────────────────────────────────────────
// Find all phase blocks: "    - id: <id>" within "  phases:"
const phasesSection = yamlText.match(
	/\s{2}phases:\n([\s\S]*?)\n\s{2}granularity:/,
);
assert(phasesSection !== null, "phases section found before granularity");

const phasesText = phasesSection ? phasesSection[1] : "";
const phaseIds = [];
const phaseGates = [];

for (const m of phasesText.matchAll(/^\s{4}-\s+id:\s+(\S+)/gm)) {
	phaseIds.push(m[1]);
}
for (const m of phasesText.matchAll(/^\s{6}gate:\s+(\S+)/gm)) {
	phaseGates.push(m[1]);
}

assert(
	phaseIds.length === 9,
	`nine per-step loop phases present — found ${phaseIds.length}`,
);
assert(
	phaseGates.every((g) => g === "computational" || g === "human"),
	`all phase gates are "computational" or "human" — gates: [${phaseGates.join(", ")}]`,
);
assert(
	phaseGates.length === phaseIds.length,
	`every phase has a gate (${phaseGates.length} gates for ${phaseIds.length} phases)`,
);

// ── Extract granularity properties ─────────────────────────────────────────
const granularitySection = yamlText.match(/\s{2}granularity:\n([\s\S]*?)$/);
assert(granularitySection !== null, "granularity section found");

const granularityText = granularitySection ? granularitySection[1] : "";
const granularityIds = [];

for (const m of granularityText.matchAll(/^\s{4}-\s+id:\s+(\S+)/gm)) {
	granularityIds.push(m[1]);
}

assert(
	granularityIds.length === 5,
	`five granularity properties present — found ${granularityIds.length}`,
);

// The done criteria names the exact five granularity properties: the mirror
// must pin the semantics, not merely the count (otherwise five wrong ids pass).
const EXPECTED_GRANULARITY = [
	"minimal",
	"autonomous",
	"visualizable",
	"non-destructive",
	"chainable",
];
assert(
	EXPECTED_GRANULARITY.every((id) => granularityIds.includes(id)),
	`granularity ids are exactly [${EXPECTED_GRANULARITY.join(", ")}] — got [${granularityIds.join(", ")}]`,
);

// Likewise pin the nine per-step loop phase ids (CLAUDE.md §6).
const EXPECTED_PHASES = [
	"grill-with-docs",
	"bdd-mirror-first",
	"tdd",
	"sensors-green",
	"completeness",
	"diagnose",
	"ui-playwright",
	"improve-architecture",
	"artifacts",
];
assert(
	EXPECTED_PHASES.every((id) => phaseIds.includes(id)),
	`phase ids include the nine §6 loop phases — got [${phaseIds.join(", ")}]`,
);

// ── Scenario: Every checklist item id is unique ─────────────────────────────
console.log("\nScenario: Every checklist item id is unique");

const allIds = [...phaseIds, ...granularityIds];
const uniqueIds = new Set(allIds);
assert(
	uniqueIds.size === allIds.length,
	`all ${allIds.length} ids are unique — unique count ${uniqueIds.size}`,
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(
	`\n${failures === 0 ? "All assertions PASSED." : `${failures} assertion(s) FAILED.`}`,
);
process.exit(failures === 0 ? 0 : 1);
