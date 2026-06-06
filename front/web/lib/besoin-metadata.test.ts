import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type AuthorityGraph,
	certifyMetadata,
	type Metadata,
	type NodeStatus,
	REGIONS,
	TRUTH_KINDS,
	type TruthScope,
	truthKindIsCoherent,
	VERIFIABILITY_LEVELS,
} from "./besoin-metadata";

// besoin-metadata.test.ts — the front determinism twin's mirror of EL04 (back/runtime/besoin/
// metadata_property_test.go). Same fixtures (one per missing metadata), same /spike routing, same
// single-enum-source coherence, plus a fast-check reproducibility property. Cross-plane parity: this
// twin produces the SAME complete/incomplete verdict the Go authority produces.

const completeMeta = (): Metadata => ({
	truthKind: "behavioral",
	verifiability: "deterministic",
	scope: { region: "*" },
});

describe("certifyMetadata — fixture table (one red per missing metadata)", () => {
	const cases: Array<{
		name: string;
		meta: Metadata;
		status?: NodeStatus;
		complete: boolean;
		code?: string;
	}> = [
		{ name: "baseline complete", meta: completeMeta(), complete: true },
		{
			name: "missing truth_kind",
			meta: { ...completeMeta(), truthKind: "" },
			complete: false,
			code: "missing-truth-kind",
		},
		{
			name: "unknown truth_kind",
			meta: { ...completeMeta(), truthKind: "derived" },
			complete: false,
			code: "unknown-truth-kind",
		},
		{
			name: "missing verifiability",
			meta: { ...completeMeta(), verifiability: "" },
			complete: false,
			code: "missing-verifiability",
		},
		{
			name: "unknown verifiability",
			meta: { ...completeMeta(), verifiability: "magic" },
			complete: false,
			code: "unknown-verifiability",
		},
		{
			name: "active node without scope (not global)",
			meta: { ...completeMeta(), scope: {} },
			complete: false,
			code: "missing-scope",
		},
		{
			name: "malformed scope",
			meta: { ...completeMeta(), scope: { region: "MARS" } as TruthScope },
			complete: false,
			code: "malformed-scope",
		},
		{
			name: "regulatory without legal authority",
			meta: { ...completeMeta(), truthKind: "regulatory" },
			complete: false,
			code: "missing-authority-approval",
		},
		{
			name: "regulatory with authority but no grant",
			meta: {
				...completeMeta(),
				truthKind: "regulatory",
				authority: {
					domain: "gdpr",
					truthKind: "regulatory",
					approvers: ["legal"],
				} as AuthorityGraph,
				granted: [],
			},
			complete: false,
			code: "missing-authority-approval",
		},
		{
			name: "regulatory with legal grant (complete)",
			meta: {
				...completeMeta(),
				truthKind: "regulatory",
				authority: {
					domain: "gdpr",
					truthKind: "regulatory",
					approvers: ["legal"],
				} as AuthorityGraph,
				granted: ["legal"],
			},
			complete: true,
		},
	];

	for (const c of cases) {
		it(c.name, () => {
			const v = certifyMetadata(c.status ?? "resolved", c.meta);
			expect(v.complete).toBe(c.complete);
			if (c.code) {
				const g = v.gaps.find((x) => x.code === c.code);
				expect(g).toBeDefined();
				expect(g?.howToFix.length).toBeGreaterThan(0);
			} else {
				expect(v.gaps).toHaveLength(0);
			}
		});
	}
});

describe("certifyMetadata — /spike routing", () => {
	it("an unverifiable node routes to /spike", () => {
		const v = certifyMetadata("resolved", {
			truthKind: "exploratory",
			verifiability: "unverifiable",
			scope: { region: "*" },
		});
		expect(v.routeToSpike).toBe(true);
		expect(v.routing).toBe("/spike");
	});
	it("a deterministic node routes to the kernel zone", () => {
		const v = certifyMetadata("resolved", completeMeta());
		expect(v.routeToSpike).toBe(false);
		expect(v.routing).toBe("kernel");
	});
});

describe("truth_kind single enum source", () => {
	it("the twin's TRUTH_KINDS equals the canonical seven (no fork)", () => {
		const canonical = [
			"behavioral",
			"structural",
			"experiential",
			"economic",
			"regulatory",
			"statistical",
			"exploratory",
		];
		expect(truthKindIsCoherent(canonical)).toBe(true);
		expect(TRUTH_KINDS.length).toBe(7);
	});
});

describe("certifyMetadata — reproducible (determinism-first)", () => {
	it("same node + metadata → same verdict", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<NodeStatus>("empty", "drafting", "resolved"),
				fc.constantFrom("", ...TRUTH_KINDS, "bogus"),
				fc.constantFrom("", ...VERIFIABILITY_LEVELS, "bogus"),
				fc.constantFrom("", ...REGIONS, "MARS"),
				(status, kind, verif, region) => {
					const m: Metadata = {
						truthKind: kind,
						verifiability: verif,
						scope: { region },
					};
					const a = certifyMetadata(status, m);
					const b = certifyMetadata(status, m);
					expect(a.complete).toBe(b.complete);
					expect(a.routing).toBe(b.routing);
					expect(a.routeToSpike).toBe(b.routeToSpike);
					expect(a.gaps.map((g) => g.code)).toEqual(b.gaps.map((g) => g.code));
					// complete ⇔ no gaps.
					expect(a.complete).toBe(a.gaps.length === 0);
				},
			),
		);
	});
});
