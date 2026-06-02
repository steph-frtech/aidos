// fast-check + Vitest mirror of the adoption twin (KRD §S47), anchored on the Go
// fixtures (back/runtime/adoption). The invariants: only the five declared tiers;
// T1.requires never contains quality_diversity (T1 ↛ QD); any view without a live
// RealityMirror ⇒ T2 not satisfiable + RealityMirror gap; any view without an
// EvolutionSandbox ⇒ T4 not satisfiable + EvolutionSandbox gap; the proposed next tier
// is the smallest unsatisfied tier whose lower tiers are all satisfied (monotone
// ladder); plan/assemble are deterministic and never mutate the input; assemble invents
// no content; an empty view ⇒ an empty-but-valid pack.

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	assemble,
	type Capability,
	isStage,
	plan,
	requires,
	STAGES,
	type View,
} from "./adoption";
import { SCENARIOS } from "./adoption-data";

const ALL_CAPS: Capability[] = [
	"tests",
	"mutation",
	"one_krd_cell",
	"kernel",
	"mirror",
	"reality_mirror_live",
	"context_graph",
	"memory",
	"evolution_sandbox",
	"evolve",
	"quality_diversity",
];

const arbCaps: fc.Arbitrary<Capability[]> = fc.uniqueArray(
	fc.constantFrom(...ALL_CAPS),
	{ maxLength: ALL_CAPS.length },
);

const arbView: fc.Arbitrary<View> = fc.record({
	kernelHead: fc.constantFrom("head-1", "head-2", ""),
	cliCommands: fc.array(fc.record({ name: fc.string() }), { maxLength: 4 }),
	workbenchRoutes: fc.array(fc.record({ path: fc.string() }), { maxLength: 4 }),
	demo: fc.constant({}),
	docs: fc.array(fc.record({ slug: fc.string() }), { maxLength: 3 }),
	mirrors: fc.array(fc.record({ id: fc.string() }), { maxLength: 4 }),
	changesets: fc.array(fc.record({ ref: fc.string() }), { maxLength: 4 }),
	declaredLimits: fc.array(fc.record({ ref: fc.string() }), { maxLength: 3 }),
});

const tier = (caps: Capability[], s: (typeof STAGES)[number]) =>
	plan(caps).tiers.find((t) => t.stage === s)!;

describe("adoption.plan — the ladder", () => {
	it("T1.requires never contains quality_diversity (T1 ↛ QD, §82.6)", () => {
		expect(requires("T1")).not.toContain("quality_diversity");
		fc.assert(
			fc.property(arbCaps, (caps) => {
				const t1 = tier(caps, "T1");
				expect(t1.gaps.every((g) => g.missing !== "quality_diversity")).toBe(
					true,
				);
			}),
		);
	});

	it("any view without a live RealityMirror ⇒ T2 not satisfiable + RealityMirror gap", () => {
		fc.assert(
			fc.property(arbCaps, (caps) => {
				if (caps.includes("reality_mirror_live")) return;
				const t2 = tier(caps, "T2");
				expect(t2.satisfiable).toBe(false);
				expect(t2.gaps.some((g) => g.missing === "reality_mirror_live")).toBe(
					true,
				);
			}),
		);
	});

	it("any view without an EvolutionSandbox ⇒ T4 not satisfiable + EvolutionSandbox gap", () => {
		fc.assert(
			fc.property(arbCaps, (caps) => {
				if (caps.includes("evolution_sandbox")) return;
				const t4 = tier(caps, "T4");
				expect(t4.satisfiable).toBe(false);
				expect(t4.gaps.some((g) => g.missing === "evolution_sandbox")).toBe(
					true,
				);
			}),
		);
	});

	it("the proposed next tier is the smallest unsatisfied tier (monotone ladder)", () => {
		fc.assert(
			fc.property(arbCaps, (caps) => {
				const p = plan(caps);
				const firstUnsat = p.tiers.findIndex((t) => !t.satisfiable);
				if (firstUnsat === -1) {
					expect(p.allSatisfied).toBe(true);
					expect(p.next).toBe("");
				} else {
					expect(p.next).toBe(STAGES[firstUnsat]);
					for (let i = 0; i < firstUnsat; i++) {
						expect(p.tiers[i].satisfiable).toBe(true);
					}
				}
			}),
		);
	});

	it("only the five declared tiers exist; plan is deterministic", () => {
		fc.assert(
			fc.property(arbCaps, (caps) => {
				const p = plan(caps);
				expect(p.tiers).toHaveLength(5);
				for (const t of p.tiers) expect(isStage(t.stage)).toBe(true);
				expect(plan(caps)).toEqual(p);
			}),
		);
	});

	it("the worked example: floor T0 ⇒ next ratchet is T1 (one_krd_cell)", () => {
		const p = plan(["tests", "mutation"]);
		expect(p.current).toBe("T0");
		expect(p.next).toBe("T1");
		expect(p.nextGaps).toHaveLength(1);
		expect(p.nextGaps[0].missing).toBe("one_krd_cell");
	});
});

describe("adoption.assemble — the release pack", () => {
	it("is deterministic and never mutates the input view", () => {
		fc.assert(
			fc.property(arbView, arbCaps, fc.integer(), (view, caps, now) => {
				const snapshot = JSON.parse(JSON.stringify(view));
				const a = assemble(view, caps, now);
				const b = assemble(view, caps, now);
				expect(a).toEqual(b);
				expect(view).toEqual(snapshot);
			}),
		);
	});

	it("invents no content — every pack entry count matches the view", () => {
		fc.assert(
			fc.property(arbView, arbCaps, (view, caps) => {
				const pack = assemble(view, caps, 0);
				expect(pack.cliSurface).toHaveLength(view.cliCommands.length);
				expect(pack.workbenchRoutes).toHaveLength(view.workbenchRoutes.length);
				expect(pack.testInventory).toHaveLength(view.mirrors.length);
				expect(pack.changelog).toHaveLength(view.changesets.length);
				expect(pack.knownLimits).toHaveLength(view.declaredLimits.length);
			}),
		);
	});

	it("an empty view yields an empty-but-valid pack (no fabricated content)", () => {
		const empty = SCENARIOS.find((s) => s.id === "empty")!;
		const pack = assemble(empty.view, empty.capabilities, 0);
		expect(pack.cliSurface).toHaveLength(0);
		expect(pack.workbenchRoutes).toHaveLength(0);
		expect(pack.testInventory).toHaveLength(0);
		expect(pack.changelog).toHaveLength(0);
		expect(pack.knownLimits).toHaveLength(0);
		expect(pack.id).not.toBe("");
	});

	it("the worked example assembles the live CLI surface + routes + inventory", () => {
		const ex = SCENARIOS.find((s) => s.id === "floor-t0")!;
		const pack = assemble(ex.view, ex.capabilities, 1_700_000_000);
		expect(pack.cliSurface.length).toBeGreaterThan(0);
		expect(pack.workbenchRoutes.some((r) => r.path === "/adoption")).toBe(true);
		expect(pack.demoCell.ref).toBe("examples.checkout.full-loop");
		expect(pack.knownLimits.some((l) => l.ref === "OQ-S47-no-install")).toBe(
			true,
		);
	});
});
