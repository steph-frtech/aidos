import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type Contract,
	isValidContract,
	type Phase,
	parseContract,
	validateContract,
} from "./contract";

/**
 * S00 reproducibility mirror (determinism-first law).
 *
 * The contract parse + validate are deterministic-able capabilities, so they are
 * authoritative PURE functions. This mirror proves it: same input → same output,
 * no hidden state, no clock/rng. It also pins the S00 law shape (semver, kind,
 * 9 phases with unique ids + valid gate, 5 granularity props) directly against
 * the pure function — not only via the rendered DOM (tests/e2e/contract.spec.ts).
 */

// The canonical contract file on disk — read once, fed to the pure parser.
const RAW = readFileSync(
	resolve(__dirname, "../../../docs/implementation_contract.md"),
	"utf8",
);

const PHASE_IDS = [
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

const GRANULARITY_IDS = [
	"minimal",
	"autonomous",
	"visualizable",
	"non-destructive",
	"chainable",
];

describe("parseContract — determinism (same input → same output)", () => {
	it("is reproducible: two parses of the same input deep-equal", () => {
		const a = parseContract(RAW);
		const b = parseContract(RAW);
		expect(b).toStrictEqual(a);
	});

	it("is idempotent across many runs (no hidden state, no rng/clock)", () => {
		const first = JSON.stringify(parseContract(RAW));
		for (let i = 0; i < 50; i++) {
			expect(JSON.stringify(parseContract(RAW))).toBe(first);
		}
	});

	it("does not mutate or depend on the input string identity", () => {
		// Parsing a fresh copy of the same content yields the same structure.
		const copy = `${RAW}`;
		expect(parseContract(copy)).toStrictEqual(parseContract(RAW));
	});
});

describe("parseContract — the parsed S00 law shape", () => {
	const contract: Contract = parseContract(RAW);

	it("carries a semver version and kind step-contract", () => {
		expect(contract.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(contract.kind).toBe("step-contract");
	});

	it("lists the nine §6 phases in order", () => {
		expect(contract.phases.map((p) => p.id)).toEqual(PHASE_IDS);
	});

	it("gives every phase a gate ∈ {computational, human}", () => {
		for (const phase of contract.phases) {
			expect(["computational", "human"]).toContain(phase.gate);
		}
	});

	it("lists the five granularity properties", () => {
		expect(contract.granularity.map((g) => g.id)).toEqual(GRANULARITY_IDS);
	});

	it("has unique ids across phases and granularity props", () => {
		const ids = [
			...contract.phases.map((p) => p.id),
			...contract.granularity.map((g) => g.id),
		];
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("validateContract — deterministic + total", () => {
	it("accepts the canonical contract (no issues)", () => {
		expect(validateContract(parseContract(RAW))).toEqual([]);
		expect(isValidContract(parseContract(RAW))).toBe(true);
	});

	it("is reproducible: same contract → same issue list", () => {
		const c = parseContract(RAW);
		expect(validateContract(c)).toEqual(validateContract(c));
	});

	it("flags a bad semver", () => {
		const c = { ...parseContract(RAW), version: "1.0" };
		expect(validateContract(c)).toContain('version "1.0" is not a semver');
	});

	it("flags the wrong kind", () => {
		const c = { ...parseContract(RAW), kind: "not-a-contract" };
		expect(validateContract(c)).toContain(
			'kind "not-a-contract" is not "step-contract"',
		);
	});

	it("flags a wrong phase count", () => {
		const base = parseContract(RAW);
		const c = { ...base, phases: base.phases.slice(0, 8) };
		expect(validateContract(c)).toContain("expected 9 phases, got 8");
	});

	it("flags a wrong granularity count", () => {
		const base = parseContract(RAW);
		const c = { ...base, granularity: base.granularity.slice(0, 4) };
		expect(validateContract(c)).toContain(
			"expected 5 granularity props, got 4",
		);
	});

	it("flags an invalid gate", () => {
		const base = parseContract(RAW);
		const phases = base.phases.map((p, i) =>
			i === 0 ? { ...p, gate: "magic" as Phase["gate"] } : p,
		);
		const c = { ...base, phases };
		expect(validateContract(c).some((m) => m.includes("invalid gate"))).toBe(
			true,
		);
	});

	it("flags a duplicate checklist id", () => {
		const base = parseContract(RAW);
		// Force a collision: reuse a phase id as a granularity id.
		const granularity = base.granularity.map((g, i) =>
			i === 0 ? { ...g, id: "tdd" } : g,
		);
		const c = { ...base, granularity };
		expect(validateContract(c)).toContain('duplicate checklist id "tdd"');
	});
});

describe("parseContract — total on degenerate input", () => {
	it("throws a clear error when no front block is present", () => {
		expect(() => parseContract("no front matter here")).toThrow(
			/No front block/,
		);
	});

	it("returns unknown sentinels (never throws) on an empty front block", () => {
		const c = parseContract("---\n\n---\n");
		expect(c.version).toBe("unknown");
		expect(c.kind).toBe("unknown");
		expect(c.phases).toEqual([]);
		expect(c.granularity).toEqual([]);
	});
});
