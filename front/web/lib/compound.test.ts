import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Attachment,
	BEHAVIOR_CATALOGUE,
	boundary,
	COMPOUND_CORPUS,
	capture,
	compound,
	costOf,
	DISSIMILAR_CEIL,
	DISSIMILAR_GOAL,
	DISSIMILAR_NEXT_GOAL,
	decide,
	EmptyGoalError,
	expand,
	GOAL_CLOSE,
	GOAL1,
	GOAL2,
	type GoalClose,
	measureDelta,
	type NextGoal,
	REDUCTION_FLOOR,
	reuse,
	SIMILAR_NEXT_GOAL,
} from "./compound";

/**
 * compound.test.ts — the determinism-first reproducibility mirror for the CE01 spike TS twin.
 * Same input → same output (no LLM, no clock, no rng), and the front twin agrees with the Go
 * probe's GO verdict (75.1% similar reduction, 16.6% dissimilar, reproducible).
 */
describe("compound spike twin (CE01)", () => {
	it("captures the first goal's shareable motif, splitting spec vs gesture units", () => {
		const m = capture(GOAL1);
		// 7 shareable units (write_operation is intrinsic, excluded).
		expect(m.size).toBe(7);
		// derive_mirror + write_fixture → behavior expansion; the rest → procedural recall.
		expect(m.get("derive_mirror")).toBe("reused_behavior");
		expect(m.get("write_fixture")).toBe("reused_behavior");
		expect(m.get("load_context_pack")).toBe("reused_procedural");
		expect(m.has("write_operation")).toBe(false);
	});

	it("reduces a similar goal's cost above the declared floor", () => {
		const d = measureDelta("similar", GOAL1, GOAL2);
		expect(d.goal2WithCap).toBeLessThan(d.goal2WithoutCap);
		expect(d.savedTokens).toBeGreaterThan(0);
		expect(d.reductionFrac).toBeGreaterThanOrEqual(REDUCTION_FLOOR);
		// The exact numbers the Go probe reports.
		expect(d.goal2WithoutCap).toBe(7800);
		expect(d.goal2WithCap).toBe(1940);
		expect(d.reusedBehavior).toBe(2);
		expect(d.reusedProcedural).toBe(5);
	});

	it("never reuses the intrinsic (non-shareable) unit — no fabricated reuse", () => {
		const cost = costOf(GOAL2, capture(GOAL1));
		const op = cost.perUnit.find((u) => u.name === "write_operation");
		expect(op?.origin).toBe("derived");
		expect(op?.tokens).toBe(1800);
	});

	it("does NOT manufacture a saving on a dissimilar goal (false-positive guard)", () => {
		const d = measureDelta("dissimilar", GOAL1, DISSIMILAR_GOAL);
		expect(d.reductionFrac).toBeLessThanOrEqual(DISSIMILAR_CEIL);
	});

	it("computes a GO verdict, reproducibly", () => {
		const v = decide();
		expect(v.go).toBe(true);
		expect(v.reproducible).toBe(true);
		expect(v.rationale).toContain("GO");
	});

	it("is a pure function — same input → same output (replayed)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 50 }), () => {
				const a = decide();
				const b = decide();
				return (
					a.go === b.go &&
					a.similar.reductionFrac === b.similar.reductionFrac &&
					a.dissimilar.reductionFrac === b.dissimilar.reductionFrac
				);
			}),
		);
	});
});

/**
 * CE02 — the capitalisation-BOUNDARY twin mirror. The on-screen frontier (BoundaryPanel) runs
 * the same pure boundary() that mirrors back/runtime/compound.Compute: 2 capitalise / 3 forbidden,
 * every capitalise row via the wall, none touching the fitness — and reproducibly (no LLM, no clock).
 */
describe("compound capitalisation boundary (CE02)", () => {
	it("has the declared CE02 shape: 2 capitalise, 3 forbidden", () => {
		const b = boundary();
		expect(b.rows.length).toBe(5);
		expect(b.capitalise).toBe(2);
		expect(b.forbidden).toBe(3);
	});

	it("capitalises exactly the gesture and spec patterns, onto their channels", () => {
		const b = boundary();
		const cap = b.rows.filter((r) => r.disposition === "capitalise");
		expect(cap.map((r) => r.subject).sort()).toEqual([
			"gesture_pattern",
			"spec_pattern",
		]);
		const byName = Object.fromEntries(b.rows.map((r) => [r.subject, r]));
		expect(byName.gesture_pattern.channel).toBe("procedural_memory");
		expect(byName.spec_pattern.channel).toBe("behavior_macro");
	});

	it("enforces the frontier: every capitalise row crosses the wall and none touches the fitness", () => {
		const b = boundary();
		expect(b.allCapitaliseViaWall).toBe(true);
		expect(b.noCapitaliseTouchesFitness).toBe(true);
		for (const r of b.rows) {
			if (r.disposition === "capitalise") {
				expect(r.viaWall).toBe(true);
				expect(r.touchesFitness).toBe(false);
			}
		}
	});

	it("forbidden frontiers have no channel and never cross the wall", () => {
		for (const r of boundary().rows) {
			if (r.disposition === "forbidden") {
				expect(r.channel).toBe("");
				expect(r.viaWall).toBe(false);
			}
		}
	});

	it("is reproducible — same table → same boundary (replayed)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 50 }), () => {
				const a = boundary();
				const c = boundary();
				return (
					a.capitalise === c.capitalise &&
					a.forbidden === c.forbidden &&
					a.allCapitaliseViaWall === c.allCapitaliseViaWall &&
					a.noCapitaliseTouchesFitness === c.noCapitaliseTouchesFitness &&
					JSON.stringify(a.rows) === JSON.stringify(c.rows)
				);
			}),
		);
	});
});

// CE03 — the /compound gesture twin (mirror of back/runtime/compound/compound.go).
describe("compound — /compound gesture (CE03)", () => {
	it("a green goal captures ONE procedural entry + proposes ONE draft behavior candidate", () => {
		const out = compound(GOAL_CLOSE);
		expect(out.proceduralWrites).toHaveLength(1);
		expect(out.proceduralWrites[0].kind).toBe("procedural");
		expect(out.proceduralWrites[0].branch).toBe("main");
		expect(out.behaviorCandidates).toHaveLength(1);
		expect(out.behaviorCandidates[0].status).toBe("draft");
	});

	it("writes NO kernel truth — the wall (every candidate WroteKernel=false)", () => {
		const out = compound(GOAL_CLOSE);
		expect(out.wroteKernel).toBe(false);
		for (const c of out.behaviorCandidates) {
			expect(c.wroteKernel).toBe(false);
		}
	});

	it("a non-green goal capitalises NOTHING (capitalisation is a close event)", () => {
		const out = compound({ ...GOAL_CLOSE, green: false });
		expect(out.proceduralWrites).toHaveLength(0);
		expect(out.behaviorCandidates).toHaveLength(0);
		expect(out.wroteKernel).toBe(false);
	});

	it("an empty gesture pattern yields no procedural write but still proposes the behavior", () => {
		const out = compound({ ...GOAL_CLOSE, gesturePattern: [] });
		expect(out.proceduralWrites).toHaveLength(0);
		expect(out.behaviorCandidates).toHaveLength(1);
	});

	it("carries provenance back to the goal in both events", () => {
		const out = compound(GOAL_CLOSE);
		expect(out.proceduralWrites[0].provenance).toBe(
			"compound:goal-order-archive",
		);
		expect(out.behaviorCandidates[0].provenance).toBe(
			"compound:goal-order-archive",
		);
	});

	it("is reproducible — same goal → same events (no LLM, no clock)", () => {
		fc.assert(
			fc.property(
				fc.record({
					goalId: fc.stringMatching(/^goal-[a-z]{3,8}$/),
					branch: fc.constantFrom("main", "feat-x"),
					green: fc.boolean(),
					gesturePattern: fc.array(fc.stringMatching(/^[a-z_]{3,12}$/), {
						maxLength: 5,
					}),
					specPattern: fc.array(fc.stringMatching(/^[a-z_]{3,12}$/), {
						maxLength: 4,
					}),
				}),
				(g: GoalClose) => {
					const a = compound(g);
					const b = compound(g);
					expect(a.wroteKernel).toBe(false);
					return JSON.stringify(a) === JSON.stringify(b);
				},
			),
		);
	});
});

/**
 * CE04 — the behavior-macro EXPANSION twin reproducibility + idempotence mirror. Same input →
 * same expansion ∧ idempotent ∧ writes no truth — the exact §24.6 done-criteria, matching the Go
 * behavior.Expand expander.
 */
describe("behavior-macro expansion twin (CE04, §24.6)", () => {
	it("expands ownable on Order into the owner-scoping boilerplate", () => {
		const e = expand({ behavior: "ownable", entity: "Order" });
		expect(e.attributes).toEqual([
			{ name: "owner_id", type: "string", required: true },
		]);
		expect(e.relations[0].target).toBe("User");
		expect(e.policies[0].name).toBe("owner-scoping");
		expect(e.fixtures.length).toBe(2);
		expect(e.wroteKernel).toBe(false);
	});

	it("is idempotent — re-attaching to the already-expanded shape emits nothing new", () => {
		const a: Attachment = { behavior: "ownable", entity: "Order" };
		const first = expand(a);
		const merged: Attachment = {
			...a,
			existing: {
				attributes: first.attributes.map((x) => x.name),
				relations: first.relations.map((x) => x.name),
				operations: first.operations.map((x) => x.name),
				policies: first.policies.map((x) => x.name),
				fixtures: first.fixtures.map((x) => x.name),
			},
		};
		expect(expand(merged).pieceCount).toBe(0);
	});

	it("is reproducible — same attachment → same expansion (no LLM, no clock)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...BEHAVIOR_CATALOGUE),
				fc.stringMatching(/^[A-Z][a-z]{0,8}$/),
				fc.array(fc.stringMatching(/^[a-z_]{1,10}$/), { maxLength: 6 }),
				(behavior, entity, names) => {
					const a: Attachment = {
						behavior,
						entity,
						existing: {
							attributes: names,
							relations: names,
							operations: names,
							policies: names,
							fixtures: names,
						},
					};
					const x = expand(a);
					const y = expand(a);
					expect(x.wroteKernel).toBe(false);
					return JSON.stringify(x) === JSON.stringify(y);
				},
			),
		);
	});
});

describe("CE05 — the reuse router (the compound payoff)", () => {
	it("a SIMILAR next goal reuses captured units → effort drops", () => {
		const plan = reuse(COMPOUND_CORPUS, SIMILAR_NEXT_GOAL);
		expect(plan.effortAfter).toBeLessThan(plan.effortBefore);
		expect(plan.savedTokens).toBeGreaterThan(0);
		expect(plan.reusedProcedural).toBe(5);
		expect(plan.reusedBehavior).toBe(3);
		expect(plan.derivedFresh).toBe(1);
		expect(plan.wroteKernel).toBe(false);
		expect(plan.routes).toHaveLength(9);
		expect(plan.routes[0].origin).toBe("reused_procedural");
		expect(plan.routes[8].name).toBe("invoice_specific_rule");
		expect(plan.routes[8].origin).toBe("derived_fresh");
	});

	it("a DISSIMILAR next goal reuses nothing (no false positive)", () => {
		const plan = reuse(COMPOUND_CORPUS, DISSIMILAR_NEXT_GOAL);
		expect(plan.effortAfter).toBe(plan.effortBefore);
		expect(plan.reusedProcedural).toBe(0);
		expect(plan.reusedBehavior).toBe(0);
		expect(plan.derivedFresh).toBe(3);
	});

	it("behavior reuse is viaWall, procedural recall is below the line", () => {
		const plan = reuse(COMPOUND_CORPUS, SIMILAR_NEXT_GOAL);
		for (const r of plan.routes) {
			if (r.origin === "reused_behavior") expect(r.viaWall).toBe(true);
			if (r.origin === "reused_procedural") expect(r.viaWall).toBe(false);
		}
	});

	it("an empty next goal is rejected (no guessed plan)", () => {
		expect(() => reuse(COMPOUND_CORPUS, { goalId: "", required: [] })).toThrow(
			EmptyGoalError,
		);
	});

	it("reproducibility: same (corpus, goal) → identical plan (fast-check)", () => {
		fc.assert(
			fc.property(
				fc.array(fc.stringMatching(/^[a-z_]{3,16}$/), {
					minLength: 1,
					maxLength: 10,
				}),
				(required) => {
					const next: NextGoal = { goalId: "goal-rand", required };
					const a = reuse(COMPOUND_CORPUS, next);
					const b = reuse(COMPOUND_CORPUS, next);
					expect(JSON.stringify(a)).toBe(JSON.stringify(b));
					// conservation + wall
					expect(a.reusedProcedural + a.reusedBehavior + a.derivedFresh).toBe(
						required.length,
					);
					expect(a.wroteKernel).toBe(false);
					expect(a.savedTokens).toBeGreaterThanOrEqual(0);
				},
			),
		);
	});
});
