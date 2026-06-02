import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	canPromote,
	hasMirror,
	type Idea,
	lanes,
	legalNext,
	NO_MIRROR_NO_KERNEL,
	type Proposes,
	type ProvenanceSource,
	promote,
	type Status,
} from "./ideas";

// Reproducibility mirror (fast-check) for the /ideas lifecycle twin — pins the SAME invariants the
// Go rapid property test back/kernel/ideas/ideas_property_test.go pins, so the front-end twin never
// drifts from the engine:
//   - Promote succeeds ONLY IF the idea is harvested AND a non-empty mirror is supplied;
//   - no mirror ⇒ NO_MIRROR_NO_KERNEL with the fix path write_mirror_run_goal_freeze, no promotion;
//   - an idea NEVER carries a version or a mirror (the type makes it unrepresentable; hasMirror=false);
//   - a promotion's provenance points back to the idea (KRD §119);
//   - the five statuses are the closed set; the gate is deterministic.

const statuses: Status[] = [
	"draft",
	"grilled",
	"spiking",
	"harvested",
	"rejected",
];
const proposesKinds: Proposes[] = [
	"control",
	"policy",
	"operation",
	"action",
	"entity",
	"product",
];
const sources: ProvenanceSource[] = ["human", "incident"];

const arbIdea: fc.Arbitrary<Idea> = fc.record({
	id: fc.string({ minLength: 4, maxLength: 16 }),
	proposes: fc.constantFrom(...proposesKinds),
	intent: fc.string(),
	provenance: fc.record({
		source: fc.constantFrom(...sources),
		detail: fc.string(),
	}),
	status: fc.constantFrom(...statuses),
});

describe("ideas lifecycle twin", () => {
	it("an idea never carries a mirror (that absence makes it an idea)", () => {
		fc.assert(
			fc.property(arbIdea, (idea) => {
				expect(hasMirror()).toBe(false);
				expect(Object.keys(idea)).not.toContain("mirror");
				expect(Object.keys(idea)).not.toContain("version");
			}),
		);
	});

	it("promote with NO mirror is always blocked with NO_MIRROR_NO_KERNEL (the wall)", () => {
		fc.assert(
			fc.property(arbIdea, (idea) => {
				const r = promote(idea, "");
				expect(r.promotion).toBeUndefined();
				expect(r.block?.code).toBe("NO_MIRROR_NO_KERNEL");
				expect(
					r.block?.howToFix.some((f) =>
						f.includes("write_mirror_run_goal_freeze"),
					),
				).toBe(true);
			}),
		);
	});

	it("promote with a mirror succeeds ONLY when harvested; provenance back-links the idea", () => {
		fc.assert(
			fc.property(
				arbIdea,
				fc.string({ minLength: 1, maxLength: 12 }),
				(idea, ref) => {
					const r = promote(idea, `mirror:${ref}`);
					if (idea.status === "harvested") {
						expect(r.block).toBeUndefined();
						expect(r.promotion?.provenanceIdeaId).toBe(idea.id);
						expect(r.promotion?.mirrorRef).toBe(`mirror:${ref}`);
					} else {
						expect(r.promotion).toBeUndefined();
						expect(r.block?.code).toBe("NO_MIRROR_NO_KERNEL");
					}
				},
			),
		);
	});

	it("canPromote is exactly the harvested predicate", () => {
		fc.assert(
			fc.property(arbIdea, (idea) => {
				expect(canPromote(idea)).toBe(idea.status === "harvested");
			}),
		);
	});

	it("the gate is deterministic (same input ⇒ same verdict)", () => {
		fc.assert(
			fc.property(arbIdea, fc.string(), (idea, ref) => {
				expect(promote(idea, ref)).toEqual(promote(idea, ref));
			}),
		);
	});

	it("legalNext stays within the closed status set; rejected is terminal", () => {
		fc.assert(
			fc.property(arbIdea, (idea) => {
				for (const s of legalNext(idea)) expect(statuses).toContain(s);
				if (idea.status === "rejected") expect(legalNext(idea)).toHaveLength(0);
			}),
		);
	});

	it("the board has exactly the five lanes in canonical order", () => {
		expect(lanes()).toEqual([
			"draft",
			"grilled",
			"spiking",
			"harvested",
			"rejected",
		]);
	});

	it("NO_MIRROR_NO_KERNEL is a non-prison BlockReason (a non-empty fix path)", () => {
		expect(NO_MIRROR_NO_KERNEL.howToFix.length).toBeGreaterThan(0);
	});
});
