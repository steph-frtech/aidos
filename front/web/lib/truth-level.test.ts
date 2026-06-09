import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	checkParity,
	compute,
	DEMO_RECORDS,
	LEVELS,
	type Signals,
} from "./truth-level";

/**
 * Reproducibility mirror (∀) for the truth-level twin (FK01). reflects=lib/truth-level,
 * test_kind=property, cert_language=fast-check, liveness=live, authority=below.
 *
 * The invariants are the twin of the Go rapid mirror — same input → same output, the
 * parity mirror, the monotone ladder — proving the twin reproduces the AUTHORITATIVE Go
 * Compute deterministically.
 */

const arbSignals: fc.Arbitrary<Signals> = fc.record({
	hasRawSignal: fc.boolean(),
	hasIdea: fc.boolean(),
	hasProposal: fc.boolean(),
	isAccepted: fc.boolean(),
	hasProjection: fc.boolean(),
	hasObservation: fc.boolean(),
	isReconciled: fc.boolean(),
});

describe("truth-level twin (FK01)", () => {
	it("compute is deterministic and total (same signals → same rung)", () => {
		fc.assert(
			fc.property(arbSignals, (s) => {
				const a = compute(s);
				const b = compute(s);
				expect(a).toEqual(b);
				expect(a.rung).toBeGreaterThanOrEqual(0);
				expect(a.rung).toBeLessThanOrEqual(7);
			}),
		);
	});

	it("parity is GREEN at the computed rung and RED at any other", () => {
		fc.assert(
			fc.property(arbSignals, fc.integer({ min: 0, max: 7 }), (s, stored) => {
				const computed = compute(s);
				const res = checkParity(stored, s);
				expect(res.aligned).toBe(stored === computed.rung);
			}),
		);
	});

	it("the ladder never inverts (raising reconciled never lowers the rung)", () => {
		fc.assert(
			fc.property(arbSignals, (s) => {
				const base = compute(s).rung;
				const raised = compute({ ...s, isReconciled: true }).rung;
				expect(raised).toBeGreaterThanOrEqual(base);
			}),
		);
	});

	it("the floor: empty signals → unknown, lone raw → raw", () => {
		expect(
			compute({
				hasRawSignal: false,
				hasIdea: false,
				hasProposal: false,
				isAccepted: false,
				hasProjection: false,
				hasObservation: false,
				isReconciled: false,
			}).name,
		).toBe("unknown");
		expect(
			compute({
				hasRawSignal: true,
				hasIdea: false,
				hasProposal: false,
				isAccepted: false,
				hasProjection: false,
				hasObservation: false,
				isReconciled: false,
			}).name,
		).toBe("raw");
	});

	it("the seven rungs are exposed in canonical Raw→Reconciled order", () => {
		expect(LEVELS.map((l) => l.name)).toEqual([
			"raw",
			"interpreted",
			"proposed",
			"accepted",
			"projected",
			"observed",
			"reconciled",
		]);
	});

	it("each demo record's stored level (its computed rung) passes parity", () => {
		for (const r of DEMO_RECORDS) {
			const lvl = compute(r.signals);
			const res = checkParity(lvl.rung, r.signals);
			expect(res.aligned).toBe(true);
		}
		// the catalogue covers all seven rungs (one per level for the filter)
		const rungs = new Set(DEMO_RECORDS.map((r) => compute(r.signals).rung));
		expect(rungs).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
	});
});
