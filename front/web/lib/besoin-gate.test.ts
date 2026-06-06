import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NodeInput } from "./besoin-candescend";
import type {
	BesoinLevelMirror,
	CompletenessNode,
} from "./besoin-completeness";
import { levelMirrorForm } from "./besoin-completeness";
import { decide, EL11_HOW_TO_FIX, type GateSession } from "./besoin-gate";

// besoin-gate.test.ts — the EL11 TS mirror, the byte-equivalent of the Go gate_bdd_test.go +
// gate_property_test.go. It proves the OU (not the ET), the no-op scoping, and determinism.

// a right-sized product node: ≤maxScenarios, intent, narrows the journey OptionSpace.
function rightSizedProductNode(): NodeInput {
	return {
		level: "product",
		body: {
			intent: "Un suivi de tâches simple",
			scenarios: ["créer une tâche", "cocher une tâche"],
			selects: ["onboarding", "core-task"],
		},
		refsTo: ["journey"],
		present: true,
	};
}

function productMirror(): BesoinLevelMirror {
	const form = levelMirrorForm("product");
	if (form === null) throw new Error("product must have a mirror form");
	return { reflects: "product", form };
}

function baseSession(over: Partial<GateSession> = {}): GateSession {
	const nodes: CompletenessNode[] = [{ level: "product", status: "resolved" }];
	return {
		project: "demo",
		level: "product",
		node: rightSizedProductNode(),
		metaComplete: true,
		nodes,
		mirrors: [productMirror()],
		metaCompleteByLevel: { product: true },
		...over,
	};
}

describe("EL11 besoin-gate — the OU, not the ET", () => {
	it("suppressing the metadata of the current level BLOCKS (¬enough, disjunct 1)", () => {
		const d = decide(
			baseSession({
				metaComplete: false,
				metaCompleteByLevel: { product: false },
			}),
		);
		expect(d.verdict).toBe("block");
		expect(d.notEnough).toBe(true);
	});

	it("a not_enough level WITHOUT a monster STILL blocks (the OU)", () => {
		// drafting product that narrows nothing → not_enough; drafting → no completeness monster.
		const node: NodeInput = {
			level: "product",
			body: { intent: "x", scenarios: ["créer"], selects: [] },
			refsTo: ["journey"],
			present: true,
		};
		const d = decide(
			baseSession({
				node,
				nodes: [{ level: "product", status: "drafting" }],
				mirrors: [],
				metaCompleteByLevel: { product: true },
			}),
		);
		expect(d.verdict).toBe("block");
		expect(d.notEnough).toBe(true);
		expect(d.hasMonster).toBe(false);
	});

	it("a monster WITHOUT not_enough STILL blocks (the OR's other half)", () => {
		// right-sized resolved product but its level-mirror is MISSING → monster.
		const d = decide(baseSession({ mirrors: [] }));
		expect(d.verdict).toBe("block");
		expect(d.hasMonster).toBe(true);
		expect(d.notEnough).toBe(false);
	});

	it("no BesoinGraph session is a NO-OP (no over-firing, §5)", () => {
		const d = decide(null);
		expect(d.verdict).toBe("no_op");
		expect(d.blockReasons).toHaveLength(0);
	});

	it("a right-sized, monster-free rung ALLOWS", () => {
		const d = decide(baseSession());
		expect(d.verdict).toBe("allow");
		expect(d.notEnough).toBe(false);
		expect(d.hasMonster).toBe(false);
	});

	it("a block carries the declared EL11 how_to_fix umbrella path", () => {
		const d = decide(baseSession({ mirrors: [] }));
		const umbrella = d.blockReasons.find(
			(r) => r.code === "BESOIN_GATE_BLOCKED",
		);
		expect(umbrella).toBeDefined();
		expect(umbrella?.howToFix).toEqual(EL11_HOW_TO_FIX);
	});
});

describe("EL11 besoin-gate — determinism (reproducibility mirror)", () => {
	it("same input → same decision (the verdict is computed, never declared)", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				(metaComplete, withMirror, resolved) => {
					const session = baseSession({
						metaComplete,
						metaCompleteByLevel: { product: metaComplete },
						mirrors: withMirror ? [productMirror()] : [],
						nodes: [
							{ level: "product", status: resolved ? "resolved" : "drafting" },
						],
					});
					const a = decide(session);
					const b = decide(session);
					expect(a.verdict).toBe(b.verdict);
					expect(a.notEnough).toBe(b.notEnough);
					expect(a.hasMonster).toBe(b.hasMonster);
					// The OR invariant: block iff a disjunct fired.
					if (a.verdict === "block")
						expect(a.notEnough || a.hasMonster).toBe(true);
					if (a.verdict === "allow")
						expect(a.notEnough || a.hasMonster).toBe(false);
				},
			),
		);
	});
});
