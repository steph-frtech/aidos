import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { captureIdea, PROPOSES_KINDS } from "./capture-idea";
import { verdicts } from "./exploration";
import {
	type Intention,
	MAX_SCENARIOS,
	route,
	validateIntention,
	verifyLlmVerdict,
} from "./grilling-loop";

/**
 * Reproducibility mirror (Vitest + fast-check) for the S65 grilling-loop twin.
 *
 * Pins the twin to the Go authority (back/runtime/grillingloop): the SAME ≤ 5 bound,
 * the SAME deterministic routing, the SAME content-addressed id, the SAME closed
 * verdict-schema gate. Same input → same output (determinism-first, CLAUDE.md §6/§8).
 */

const sample: Intention = {
	intent: "finalement je veux un code promo pour les habitués",
	scenarios: [
		"Given a regular When they checkout Then a 10% promo applies",
		"Given a first-timer When they checkout Then no promo applies",
	],
};

describe("grilling-loop — verdict branches (the S65 done-criterion)", () => {
	it("sharp routes the intention to grilled", () => {
		const rec = route(
			"policy",
			sample,
			"sharp",
			"finalement je veux un code promo",
			"",
		);
		expect(rec.idea.status).toBe("grilled");
		expect(rec.verdict).toBe("sharp");
		expect(rec.idea.provenance.source).toBe("human");
		expect(rec.idea.intent).toBe(sample.intent);
	});

	it("fuzzy routes the intention to spiking", () => {
		const rec = route("policy", sample, "fuzzy", "", "");
		expect(rec.idea.status).toBe("spiking");
		expect(rec.verdict).toBe("fuzzy");
	});

	it("bad routes the intention to rejected, traced with the reason", () => {
		const rec = route(
			"policy",
			sample,
			"bad",
			"",
			"duplicate of an existing promo",
		);
		expect(rec.idea.status).toBe("rejected");
		expect(rec.verdict).toBe("bad");
		expect(rec.reason).toBe("duplicate of an existing promo");
		expect(rec.idea.rejectReason).toBe("duplicate of an existing promo");
	});
});

describe("grilling-loop — the ≤ 5 scenarios bound", () => {
	it("refuses a sixth scenario", () => {
		const six: Intention = {
			intent: "x",
			scenarios: ["a", "b", "c", "d", "e", "f"],
		};
		expect(validateIntention(six)).toBe("too-many-scenarios");
		expect(() => route("policy", six, "sharp", "", "")).toThrow();
	});

	it("accepts exactly five scenarios", () => {
		const five: Intention = {
			intent: "x",
			scenarios: ["a", "b", "c", "d", "e"],
		};
		expect(validateIntention(five)).toBeNull();
		expect(route("policy", five, "sharp", "", "").idea.status).toBe("grilled");
	});

	it("refuses an empty intent", () => {
		expect(validateIntention({ intent: "   ", scenarios: [] })).toBe(
			"intent-empty",
		);
	});
});

describe("grilling-loop — the barricaded LLM exception", () => {
	it("accepts exactly the three schema verdicts", () => {
		for (const v of ["sharp", "fuzzy", "bad"]) {
			expect(verifyLlmVerdict(v)).toBe(v);
		}
	});

	it("refuses every off-schema verdict (no fourth verdict)", () => {
		for (const raw of ["Sharp", "approved", "yes", "", "good idea"]) {
			expect(verifyLlmVerdict(raw)).toBeNull();
		}
	});
});

describe("grilling-loop — id agrees with the Go authority (S64 twin)", () => {
	it("the routed idea carries the content-address id of its sketch", () => {
		const rec = route(
			"policy",
			sample,
			"sharp",
			"finalement je veux un code promo",
			"",
		);
		const draft = captureIdea("policy", sample.intent, {
			source: "human",
			detail: "finalement je veux un code promo",
		});
		expect(rec.idea.id).toBe(draft.id);
	});
});

describe("grilling-loop — determinism (property)", () => {
	it("same intention + verdict → identical record", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 40 }),
				fc.array(fc.string({ maxLength: 20 }), { maxLength: MAX_SCENARIOS }),
				fc.constantFrom(...verdicts()),
				fc.constantFrom(...PROPOSES_KINDS),
				(intent, scenarios, verdict, proposes) => {
					const it: Intention = { intent, scenarios };
					if (validateIntention(it)) return;
					const a = route(proposes, it, verdict, "", "traced");
					const b = route(proposes, it, verdict, "", "traced");
					expect(a.idea.id).toBe(b.idea.id);
					expect(a.idea.status).toBe(b.idea.status);
					expect(a.verdict).toBe(b.verdict);
					expect(a.reason).toBe(b.reason);
					// status is always in the closed routed set; provenance is human.
					expect(["grilled", "spiking", "rejected"]).toContain(a.idea.status);
					expect(a.idea.provenance.source).toBe("human");
				},
			),
		);
	});

	it("verifyLlmVerdict is closed: exactly the three literals", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 12 }), (raw) => {
				const valid = ["sharp", "fuzzy", "bad"].includes(raw);
				expect(verifyLlmVerdict(raw) !== null).toBe(valid);
			}),
		);
	});
});
