/**
 * lib/besoin-invariant.test.ts — EL14 reproducibility mirror (Vitest + fast-check): the TS twin of the
 * lateral band is DETERMINISTIC and code-authoritative (CLAUDE.md §6/§8), byte-equivalent to the Go
 * authority. The properties pin the EL14 done-criteria:
 *   - an invariant attached at L constrains L and every SOURCE rung above (lateral constraint);
 *   - an ∃ (a single example) is refused, a ∀ accepted;
 *   - recordInvariant is deterministic; the circularity ban always refuses; a policy band emits AT
 *     MOST ONE Idea{Proposes:policy}; a path-independent invariant emits NONE;
 *   - bandCompleteness flags the missing crossing invariant.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Level, SOURCE_ORDER } from "./besoin-grammar";
import {
	type BandNodeInput,
	bandCompleteness,
	CODE_INVARIANT_BAD_ATTACHMENT,
	CODE_INVARIANT_CIRCULAR,
	CODE_INVARIANT_IS_EXAMPLE,
	CODE_LEVEL_MISSING_INVARIANT,
	constrainsLevel,
	crossedLevels,
	type InvariantBand,
	isForallStatement,
	parseInvariantBand,
	recordInvariant,
} from "./besoin-invariant";
import type { Metadata } from "./besoin-metadata";

const META: Metadata = {
	truthKind: "behavioral",
	verifiability: "deterministic",
	scope: { region: "*" },
};

function band(attached: Level[]): InvariantBand {
	return {
		statement: "pour tout chemin, P implique Q",
		attachedLevels: attached,
		kind: "path_independent",
	};
}

describe("crossedLevels — the lateral constraint reaches every rung above", () => {
	it("constrains L and every SOURCE rung above L, none below", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: SOURCE_ORDER.length - 1 }),
				(idx) => {
					const attached = SOURCE_ORDER[idx];
					const b = band([attached]);
					for (let i = 0; i <= idx; i++) {
						expect(constrainsLevel(b, SOURCE_ORDER[i])).toBe(true);
					}
					for (let i = idx + 1; i < SOURCE_ORDER.length; i++) {
						expect(constrainsLevel(b, SOURCE_ORDER[i])).toBe(false);
					}
				},
			),
		);
	});

	it("an invariant on operation also constrains product (true on all paths)", () => {
		const b = band(["operation"]);
		expect(constrainsLevel(b, "product")).toBe(true);
		expect(constrainsLevel(b, "operation")).toBe(true);
		expect(constrainsLevel(b, "entity")).toBe(false);
	});

	it("crossedLevels is deterministic, sorted and de-duplicated", () => {
		const b = {
			statement: "toujours P",
			attachedLevels: ["operation", "view"] as Level[],
			kind: "path_independent" as const,
		};
		const a1 = crossedLevels(b);
		const a2 = crossedLevels(b);
		expect(a1).toEqual(a2);
		expect(new Set(a1).size).toBe(a1.length);
	});
});

describe("isForallStatement — ∀ accepted, ∃ refused", () => {
	it("accepts universal-marked statements", () => {
		for (const s of [
			"pour tout utilisateur, le solde reste positif",
			"toujours, P implique Q",
			"the total is never negative",
			"∀ x, f(x) > 0",
			"every order has a customer",
		]) {
			expect(isForallStatement(s)).toBe(true);
		}
	});

	it("refuses example-marked statements (∃)", () => {
		for (const s of [
			"par exemple, la commande #12 est payée",
			"for example, order 7 is shipped",
			"une fois, le paiement a échoué",
			"the cart had 3 items",
			"toujours par exemple ce cas-ci",
		]) {
			expect(isForallStatement(s)).toBe(false);
		}
	});
});

describe("parseInvariantBand — refuses ∃ and bad attachment", () => {
	it("refuses an ∃ with INVARIANT_IS_EXAMPLE_NOT_FORALL", () => {
		const r = parseInvariantBand({
			statement: "par exemple la commande #3 est payée",
			attached_levels: ["operation"],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe(CODE_INVARIANT_IS_EXAMPLE);
	});

	it("accepts a ∀ attached to a valid rung", () => {
		const r = parseInvariantBand({
			statement: "pour tout paiement, le solde reste positif",
			attached_levels: ["operation"],
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.band.kind).toBe("path_independent");
	});

	it("refuses a policy attaching to product (AttachableTo)", () => {
		const r = parseInvariantBand({
			statement: "pour tout, P",
			attached_levels: ["product"],
			kind: "policy",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe(CODE_INVARIANT_BAD_ATTACHMENT);
	});
});

describe("recordInvariant — circularity ban, at-most-one policy idea, determinism", () => {
	it("circularity ban always refuses and never records", () => {
		const r = recordInvariant(
			{ statement: "pour tout P, Q", attached_levels: ["operation"] },
			"v",
			true,
			"drafting",
			META,
		);
		expect(r.recorded).toBe(false);
		expect(r.routing).toBe("off_altitude");
		expect(r.blockReason?.code).toBe(CODE_INVARIANT_CIRCULAR);
	});

	it("a policy band emits exactly ONE Idea{Proposes:policy}, provenance human, verbatim", () => {
		const r = recordInvariant(
			{
				statement: "pour tout non-admin, le remboursement est interdit",
				attached_levels: ["operation"],
				kind: "policy",
				rule: "non-admin ne peut pas rembourser",
			},
			"je veux que seuls les admins remboursent",
			false,
			"drafting",
			META,
		);
		expect(r.recorded).toBe(true);
		expect(r.policyIdea).not.toBeNull();
		expect(r.policyIdea?.proposes).toBe("policy");
		expect(r.policyIdea?.provenance.source).toBe("human");
		expect(r.policyIdea?.provenance.detail).toBe(
			"je veux que seuls les admins remboursent",
		);
	});

	it("a path-independent invariant emits NO Idea (NoEmit)", () => {
		const r = recordInvariant(
			{
				statement: "pour tout chemin, le solde reste ≥ 0",
				attached_levels: ["operation"],
				kind: "path_independent",
			},
			"v",
			false,
			"drafting",
			META,
		);
		expect(r.recorded).toBe(true);
		expect(r.policyIdea).toBeNull();
	});

	it("recordInvariant is deterministic (same args → same result)", () => {
		const body = {
			statement: "toujours non négatif",
			attached_levels: ["operation"],
		};
		const a = recordInvariant(body, "v", false, "drafting", META);
		const b = recordInvariant(body, "v", false, "drafting", META);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe("bandCompleteness — flags the missing crossing invariant", () => {
	it("flags a resolved rung that requires an invariant but is crossed by none", () => {
		const nodes: BandNodeInput[] = [
			{
				level: "operation",
				status: "resolved",
				body: { requires_invariant: true },
			},
		];
		const report = bandCompleteness(nodes);
		expect(report.complete).toBe(false);
		expect(report.monsters[0].code).toBe(CODE_LEVEL_MISSING_INVARIANT);
		expect(report.monsters[0].level).toBe("operation");
	});

	it("clears once a crossing invariant is recorded (covered from below too)", () => {
		const nodes: BandNodeInput[] = [
			{ level: "view", status: "resolved", body: { requires_invariant: true } },
			{
				level: "invariant",
				status: "drafting",
				body: {
					statement: "toujours P sur tout chemin",
					attached_levels: ["operation"],
					kind: "path_independent",
				},
			},
		];
		const report = bandCompleteness(nodes);
		expect(report.complete).toBe(true);
	});
});
