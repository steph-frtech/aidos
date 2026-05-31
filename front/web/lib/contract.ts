/**
 * Pure parse + validate for the S00 step-execution contract.
 *
 * THE WALL (CLAUDE.md §2): the contract is TRUTH-ish data (a versioned law file).
 * Nothing here writes it; this module only PARSES and VALIDATES the embedded YAML
 * block of docs/implementation_contract.md and projects it to a typed structure.
 *
 * DETERMINISM-FIRST (the determinism-first law): contract parsing + validation are
 * deterministic-able capabilities, so they MUST be authoritative pure functions —
 * `parseContract(raw)` is a total function of its single string input (no I/O, no
 * clock, no rng, no hidden state). The file read stays at the I/O boundary in the
 * Server Component (app/contract/page.tsx); the parse it calls is this pure core,
 * covered by the reproducibility mirror lib/contract.test.ts. Same input → same
 * output, always.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface Phase {
	id: string;
	label: string;
	description: string;
	gate: "computational" | "human";
}

export interface GranularityProp {
	id: string;
	label: string;
	description: string;
}

export interface Contract {
	version: string;
	kind: string;
	description: string;
	phases: Phase[];
	granularity: GranularityProp[];
}

// ── Parser — no runtime dep, just targeted regexes ───────────────────────────
// The front block is a YAML-ish block delimited by --- lines. We parse it with
// targeted regexes since we control the file format. parseContract is a PURE
// function of `raw`: given the same file content it always returns the same
// structure (no I/O, no clock, no rng, no hidden state).

export function parseContract(raw: string): Contract {
	const frontMatch = raw.match(/^---\n([\s\S]*?)\n---/);
	if (!frontMatch)
		throw new Error("No front block found in implementation_contract.md");
	const yaml = frontMatch[1];

	const versionMatch = yaml.match(/^\s{2}version:\s*"([^"]+)"/m);
	const kindMatch = yaml.match(/^\s{2}kind:\s*(\S+)/m);
	const descMatch = yaml.match(
		/^\s{2}description:\s*>\n([\s\S]*?)(?=\n\s{2}\w)/m,
	);

	const version = versionMatch?.[1] ?? "unknown";
	const kind = kindMatch?.[1] ?? "unknown";
	const description = descMatch
		? descMatch[1]
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.join(" ")
		: "";

	// Parse phases
	const phasesSection = yaml.match(
		/\s{2}phases:\n([\s\S]*?)\n\s{2}granularity:/,
	);
	const phasesText = phasesSection?.[1] ?? "";
	const phases = parseItems(phasesText) as unknown as Phase[];

	// Parse granularity
	const granularitySection = yaml.match(/\s{2}granularity:\n([\s\S]*)$/);
	const granularityText = granularitySection?.[1] ?? "";
	const granularity = parseItems(
		granularityText,
	) as unknown as GranularityProp[];

	return { version, kind, description, phases, granularity };
}

export function parseItems(block: string): Record<string, string>[] {
	// Split on "    - id:" entry points
	const entries = block.split(/(?=\s{4}-\s+id:)/g).filter((s) => s.trim());
	return entries.map((entry) => {
		const fields: Record<string, string> = {};
		const idM = entry.match(/\s{4}-\s+id:\s+(\S+)/);
		const labelM = entry.match(/\s{6}label:\s+"?([^"\n]+)"?/);
		const gateM = entry.match(/\s{6}gate:\s+(\S+)/);
		const descM = entry.match(
			/\s{6}description:\s*>\n([\s\S]*?)(?=\s{6}\w|\s{4}-|\s{2}\w|$)/,
		);
		if (idM) fields.id = idM[1];
		if (labelM) fields.label = labelM[1].trim();
		if (gateM) fields.gate = gateM[1];
		if (descM) {
			fields.description = descM[1]
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.join(" ");
		}
		return fields;
	});
}

// ── Validation — deterministic, total ────────────────────────────────────────
// validateContract checks the S00 law shape: a semver version, kind=step-contract,
// nine phases each with a unique id + a gate ∈ {computational,human}, and five
// granularity props. It is a PURE function of the parsed Contract (same input →
// same list of issues). An empty issue list means the contract is well-formed.

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const EXPECTED_PHASE_COUNT = 9;
const EXPECTED_GRANULARITY_COUNT = 5;
const VALID_GATES = new Set(["computational", "human"]);

export function validateContract(contract: Contract): string[] {
	const issues: string[] = [];

	if (!SEMVER_RE.test(contract.version))
		issues.push(`version "${contract.version}" is not a semver`);

	if (contract.kind !== "step-contract")
		issues.push(`kind "${contract.kind}" is not "step-contract"`);

	if (contract.phases.length !== EXPECTED_PHASE_COUNT)
		issues.push(
			`expected ${EXPECTED_PHASE_COUNT} phases, got ${contract.phases.length}`,
		);

	if (contract.granularity.length !== EXPECTED_GRANULARITY_COUNT)
		issues.push(
			`expected ${EXPECTED_GRANULARITY_COUNT} granularity props, got ${contract.granularity.length}`,
		);

	for (const phase of contract.phases) {
		if (!phase.id) issues.push("a phase is missing its id");
		if (!VALID_GATES.has(phase.gate))
			issues.push(`phase "${phase.id}" has an invalid gate "${phase.gate}"`);
	}

	// Every id is unique across phases AND granularity props (the §6 completeness
	// of the checklist — no duplicate handle).
	const ids = [
		...contract.phases.map((p) => p.id),
		...contract.granularity.map((g) => g.id),
	].filter(Boolean);
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) issues.push(`duplicate checklist id "${id}"`);
		seen.add(id);
	}

	return issues;
}

/** isValidContract is the boolean projection of validateContract (no issues). */
export function isValidContract(contract: Contract): boolean {
	return validateContract(contract).length === 0;
}
