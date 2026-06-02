import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	checkHarvestWrite,
	checkSpikeWrite,
	confined,
	HARVEST_CANNOT_FREEZE,
	harvest,
	KIND_DRAFT_TRUTH,
	routeVerdict,
	SPIKE_PREFIX,
	SPIKE_WRITE_ESCAPES_ZONE,
	verdicts,
} from "./exploration";
import type { Idea, Proposes, ProvenanceSource, Status } from "./ideas";

// Reproducibility mirror (fast-check) for the /exploration twin — pins the SAME invariants the Go
// rapid property test back/runtime/exploration/exploration_property_test.go pins, so the front-end
// twin never drifts from the engine:
//   - the closed verdict set {sharp,fuzzy,bad} routes to {grilled,spiking,rejected};
//   - while spiking, every write under /spike is allowed and every escaping write is refused with
//     SPIKE_WRITE_ESCAPES_ZONE (a non-empty how_to_fix — never a prison);
//   - harvest always yields a DRAFT proposal with hasFrozenVersion=false and hasMirror=false, and
//     never writes a truth schema (kernel/mirrors/fitness ⇒ HARVEST_CANNOT_FREEZE);
//   - the predicates are deterministic.

const proposesKinds: Proposes[] = [
	"control",
	"policy",
	"operation",
	"action",
	"entity",
	"product",
];
const sources: ProvenanceSource[] = ["human", "incident"];

const arbIdea = (status: Status): fc.Arbitrary<Idea> =>
	fc.record({
		id: fc.string({ minLength: 4, maxLength: 12 }),
		proposes: fc.constantFrom(...proposesKinds),
		intent: fc.string({ minLength: 1, maxLength: 40 }),
		provenance: fc.record({
			source: fc.constantFrom(...sources),
			detail: fc.string({ minLength: 1, maxLength: 40 }),
		}),
		status: fc.constant(status),
	});

describe("grill verdict routing (the closed three-value set)", () => {
	it("routes exactly {sharp→grilled, fuzzy→spiking, bad→rejected}", () => {
		expect(verdicts()).toEqual(["sharp", "fuzzy", "bad"]);
		expect(routeVerdict("sharp")).toBe("grilled");
		expect(routeVerdict("fuzzy")).toBe("spiking");
		expect(routeVerdict("bad")).toBe("rejected");
	});
});

describe("spike confinement holds for all paths", () => {
	it("allows a write under /spike, refuses any escaping path with SPIKE_WRITE_ESCAPES_ZONE", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 30 }).map((s) => `/${s}`),
				(path) => {
					const br = checkSpikeWrite({ path });
					const isConfined =
						path === SPIKE_PREFIX || path.startsWith(`${SPIKE_PREFIX}/`);
					expect(confined({ path })).toBe(isConfined);
					if (isConfined) {
						expect(br).toBeNull();
					} else {
						expect(br?.code).toBe("SPIKE_WRITE_ESCAPES_ZONE");
						expect(br?.howToFix.length ?? 0).toBeGreaterThan(0);
					}
				},
			),
		);
	});

	it("the SPIKE_WRITE_ESCAPES_ZONE fix path names confine_write_to_/spike", () => {
		expect(
			SPIKE_WRITE_ESCAPES_ZONE.howToFix.some((f) =>
				f.includes("confine_write_to_/spike"),
			),
		).toBe(true);
	});
});

describe("harvest always yields a DRAFT proposal and never writes truth", () => {
	it("produces a draft-truth proposal with no frozen version and no mirror", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<Status>("grilled", "spiking"),
				fc.string({ maxLength: 30 }),
				(from, discovered) => {
					const idea = {
						id: "abc123",
						proposes: "policy" as Proposes,
						intent: "sketched intent",
						provenance: { source: "human" as ProvenanceSource, detail: "x" },
						status: from,
					};
					const { harvested, proposal } = harvest(idea, discovered);
					expect(harvested.status).toBe("harvested");
					expect(proposal.kind).toBe(KIND_DRAFT_TRUTH);
					expect(proposal.hasFrozenVersion).toBe(false);
					expect(proposal.hasMirror).toBe(false);
					expect(proposal.ideaId).toBe(harvested.id);
					expect(proposal.intent).toBe(
						discovered.trim() === "" ? idea.intent : discovered.trim(),
					);
				},
			),
		);
	});

	it("refuses a direct write to any truth schema with HARVEST_CANNOT_FREEZE", () => {
		for (const schema of ["kernel", "mirrors", "fitness"]) {
			const br = checkHarvestWrite(schema);
			expect(br?.code).toBe("HARVEST_CANNOT_FREEZE");
		}
		expect(checkHarvestWrite("ideas")).toBeNull();
		expect(
			HARVEST_CANNOT_FREEZE.howToFix.some((f) =>
				f.includes("write_mirror_run_goal_freeze"),
			),
		).toBe(true);
	});
});

describe("determinism", () => {
	it("checkSpikeWrite is a pure function of the path", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 20 }), (s) => {
				const a = checkSpikeWrite({ path: `/${s}` });
				const b = checkSpikeWrite({ path: `/${s}` });
				expect(a?.code).toBe(b?.code);
			}),
		);
	});

	it("an idea never carries a version or a mirror (the type makes it unrepresentable)", () => {
		fc.assert(
			fc.property(arbIdea("spiking"), (idea) => {
				// The Idea shape has no version/mirror field — assert at the type+runtime level.
				expect("version" in idea).toBe(false);
				expect("mirror" in idea).toBe(false);
			}),
		);
	});
});
