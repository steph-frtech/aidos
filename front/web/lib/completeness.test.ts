import { describe, expect, it } from "vitest";
import {
	gateVerdict,
	INCOMPLETE,
	MONSTER,
	type Monster,
	SAMPLE_BLOCK_EVENTS,
	SAMPLE_BLOCKED_CUT,
	SAMPLE_COMPLETE_CUT,
} from "./completeness";

/**
 * Reproducibility mirror for the /completeness projection (S12). It pins the front
 * gate aggregator against the Go gate (back/kernel/mirror/completeness,
 * back/hooks/stop): block iff the monster set is non-empty; the codes (MONSTER,
 * INCOMPLETE); the two monster reasons; and the shape of the sample cuts the panel
 * renders. Determinism-first (CLAUDE.md §6/§8): same input ⇒ same output, no third
 * verdict.
 */

describe("the gate aggregator (mirrors Go Gate)", () => {
	it("passes on an empty monster set", () => {
		expect(gateVerdict([])).toBe("pass");
	});

	it("blocks on any non-empty monster set", () => {
		const m: Monster = {
			reason: "no_orphan_mirror",
			ref: "x",
			kind: "control",
			howToFix: "fix",
		};
		expect(gateVerdict([m])).toBe("block");
	});

	it("has no third verdict — block | pass only", () => {
		for (const n of [0, 1, 2, 5]) {
			const monsters: Monster[] = Array.from({ length: n }, (_, i) => ({
				reason: "no_truth_without_mirror",
				ref: `l-${i}`,
				kind: "control",
				howToFix: "fix",
			}));
			const v = gateVerdict(monsters);
			expect(v === "block" || v === "pass").toBe(true);
			expect(v).toBe(n > 0 ? "block" : "pass");
		}
	});
});

describe("the canonical block codes (match completeness.go)", () => {
	it("emits MONSTER and INCOMPLETE", () => {
		expect(MONSTER).toBe("MONSTER");
		expect(INCOMPLETE).toBe("INCOMPLETE");
	});
});

describe("the sample BLOCKED cut", () => {
	it("blocks with a MONSTER BlockReason and matching monster count", () => {
		expect(SAMPLE_BLOCKED_CUT.verdict).toBe("block");
		expect(SAMPLE_BLOCKED_CUT.blockReason?.code).toBe(MONSTER);
		expect(SAMPLE_BLOCKED_CUT.monsterCount).toBe(
			SAMPLE_BLOCKED_CUT.monsters.length,
		);
		expect(gateVerdict(SAMPLE_BLOCKED_CUT.monsters)).toBe("block");
	});

	it("carries one monster of each reason with a how_to_fix", () => {
		const reasons = SAMPLE_BLOCKED_CUT.monsters.map((m) => m.reason).sort();
		expect(reasons).toEqual(["no_orphan_mirror", "no_truth_without_mirror"]);
		for (const m of SAMPLE_BLOCKED_CUT.monsters) {
			expect(m.howToFix.length).toBeGreaterThan(0);
		}
		const orphan = SAMPLE_BLOCKED_CUT.monsters.find(
			(m) => m.reason === "no_orphan_mirror",
		);
		expect(orphan?.liveness).toBe("dead");
	});

	it("the BlockReason carries a non-empty how_to_fix path", () => {
		expect(SAMPLE_BLOCKED_CUT.blockReason?.howToFix.length).toBeGreaterThan(0);
	});
});

describe("the sample COMPLETE cut", () => {
	it("passes with an empty monster set", () => {
		expect(SAMPLE_COMPLETE_CUT.verdict).toBe("pass");
		expect(SAMPLE_COMPLETE_CUT.monsters).toHaveLength(0);
		expect(SAMPLE_COMPLETE_CUT.monsterCount).toBe(0);
		expect(SAMPLE_COMPLETE_CUT.blockReason).toBeUndefined();
		expect(gateVerdict(SAMPLE_COMPLETE_CUT.monsters)).toBe("pass");
	});
});

describe("the block-event feed", () => {
	it("contains only block verdicts (it is the block feed)", () => {
		for (const ev of SAMPLE_BLOCK_EVENTS) {
			expect(ev.verdict).toBe("block");
			expect(ev.monsterCount).toBeGreaterThan(0);
		}
	});
});
