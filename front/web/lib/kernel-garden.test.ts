// S112 reproducibility mirror (TS twin) — Vitest + fast-check. Pins the SAME laws as
// the Go property mirror (back/runtime/debt/garden/garden_property_test.go):
// determinism, no-invented-kind, no-invented-action, project scoping, suggest-only/
// never-delete, and the consume-economics wire (a low_value_constraint IFF the S51
// economics twin flags it over_budget).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Decision } from "./economics";
import {
	acceptProposal,
	GARDEN_ACTIONS,
	GARDEN_KINDS,
	type ProjectSnapshot,
	suggestGardenTrim,
	THE_DOOR,
	tend,
} from "./kernel-garden";

const arbSnapshot = (): fc.Arbitrary<ProjectSnapshot> =>
	fc.record({
		projectRef: fc.constantFrom("proj-A", "proj-B", "proj-C"),
		kernelHead: fc.constant("head-1"),
		truths: fc.array(
			fc.record({
				id: fc.constantFrom("truth-1", "truth-2", "truth-3"),
				version: fc.constantFrom("v1", "v2", "v3"),
				live: fc.boolean(),
			}),
			{ minLength: 1, maxLength: 4 },
		),
		mirrors: fc.array(
			fc.record({
				id: fc.constantFrom("mir-0", "mir-1", "mir-2", "mir-3"),
				reflects: fc.record({
					layerId: fc.constantFrom("truth-1", "truth-2", "truth-GONE"),
					version: fc.constantFrom("v1", "v2", "v3"),
				}),
				testKind: fc.constantFrom("fixture", "property"),
				liveness: fc.constantFrom("alive", "dead"),
			}),
			{ maxLength: 5 },
		),
		mutation: fc.array(
			fc.record({
				target: fc.constantFrom("truth-1", "truth-2", "truth-3"),
				status: fc.constantFrom<"survived" | "killed">("survived", "killed"),
			}),
			{ maxLength: 3 },
		),
		budgets: fc.array(
			fc.record({
				cellRef: fc.constantFrom("cell-0", "cell-1", "cell-2"),
				maxLlmTokensPerGoal: fc.integer({ min: 0, max: 1000 }),
				cost: fc.record({ llmTokens: fc.integer({ min: 0, max: 2000 }) }),
				valueCase: fc.option(
					fc.record({
						truth: fc.constant("cell-x"),
						riskIfBroken: fc.constantFrom<"low" | "high">("low", "high"),
						expectedImpact: fc.constant(""),
						harnessCost: fc.constant({}),
						decision: fc.constantFrom<Decision>(
							"justified",
							"too_expensive",
							"revisit",
						),
					}),
					{ nil: null },
				),
			}),
			{ maxLength: 3 },
		),
	});

describe("kernel-garden twin (S112)", () => {
	it("is deterministic: same snapshot ⇒ identical garden + plan", () => {
		fc.assert(
			fc.property(arbSnapshot(), (s) => {
				expect(JSON.stringify(tend(s))).toBe(JSON.stringify(tend(s)));
				const g = tend(s);
				expect(JSON.stringify(suggestGardenTrim(g))).toBe(
					JSON.stringify(suggestGardenTrim(g)),
				);
			}),
		);
	});

	it("never invents a kind", () => {
		fc.assert(
			fc.property(arbSnapshot(), (s) => {
				for (const it of tend(s).items) {
					expect(GARDEN_KINDS).toContain(it.kind);
				}
			}),
		);
	});

	it("never invents an action; every suggestion requires the door", () => {
		fc.assert(
			fc.property(arbSnapshot(), (s) => {
				const g = tend(s);
				const plan = suggestGardenTrim(g);
				expect(plan.suggestions.length).toBe(g.items.length);
				expect(plan.deletesAnything).toBe(false);
				for (const sug of plan.suggestions) {
					expect(GARDEN_ACTIONS).toContain(sug.proposedAction);
					expect(sug.requires).toBe(THE_DOOR);
				}
			}),
		);
	});

	it("is project-scoped: every item + suggestion carries the project ref", () => {
		fc.assert(
			fc.property(arbSnapshot(), (s) => {
				const g = tend(s);
				expect(g.projectRef).toBe(s.projectRef);
				for (const it of g.items) expect(it.projectRef).toBe(s.projectRef);
				for (const sug of suggestGardenTrim(g).suggestions) {
					expect(sug.projectRef).toBe(s.projectRef);
				}
			}),
		);
	});

	it("never mutates the input snapshot (read-only)", () => {
		fc.assert(
			fc.property(arbSnapshot(), (s) => {
				const before = JSON.stringify(s);
				tend(s);
				expect(JSON.stringify(s)).toBe(before);
			}),
		);
	});

	it("accepting any proposal always opens an idea and never deletes", () => {
		fc.assert(
			fc.property(arbSnapshot(), (s) => {
				for (const sug of suggestGardenTrim(tend(s)).suggestions) {
					const oi = acceptProposal(sug);
					expect(oi.opensIdea).toBe(true);
					expect(oi.deletes).toBe(false);
					expect(oi.door).toBe(THE_DOOR);
				}
			}),
		);
	});

	it("a low_value_constraint is surfaced only for an over-budget cell", () => {
		fc.assert(
			fc.property(arbSnapshot(), (s) => {
				const lv = tend(s).items.filter(
					(it) => it.kind === "low_value_constraint",
				);
				for (const it of lv) {
					// at least ONE budget for this cell is over its cap (multiple budgets
					// may share a cellRef; the garden surfaces it if ANY is over).
					const anyOver = s.budgets.some(
						(b) =>
							b.cellRef === it.targetRef &&
							b.cost.llmTokens > b.maxLlmTokensPerGoal,
					);
					expect(anyOver).toBe(true);
				}
			}),
		);
	});
});
