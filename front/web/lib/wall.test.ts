import { describe, expect, it } from "vitest";
import {
	ABOVE_ZONES,
	AGENT_WRITE_ABOVE_WATERLINE,
	aboveZones,
	BELOW_ZONES,
	belowZones,
	SAMPLE_BLOCK_EVENT,
} from "./wall";

// Reproducibility mirror (Vitest, front N4) — the /wall projection source is a
// static, deterministic registry mirroring back/hooks/pretooluse/wall.go: the
// three above-the-line truth schemas (kernel/mirrors/fitness), in canonical
// order, the canonical block code, and a verbatim-shaped sample BlockReason whose
// how_to_fix names the only door (idea → mirror → /goal).

describe("wall projection source", () => {
	it("the above-the-line zones are exactly kernel/mirrors/fitness, in order", () => {
		expect(ABOVE_ZONES.map((z) => z.name)).toEqual([
			"kernel",
			"mirrors",
			"fitness",
		]);
		for (const z of ABOVE_ZONES) {
			expect(z.side).toBe("above");
		}
	});

	it("every zone carries a non-empty role", () => {
		for (const z of [...ABOVE_ZONES, ...BELOW_ZONES]) {
			expect(z.role).not.toBe("");
		}
	});

	it("below-the-line zones are all marked below", () => {
		for (const z of BELOW_ZONES) {
			expect(z.side).toBe("below");
		}
	});

	it("the sample block event carries the canonical code and an actionable fix", () => {
		expect(SAMPLE_BLOCK_EVENT.code).toBe(AGENT_WRITE_ABOVE_WATERLINE);
		expect(SAMPLE_BLOCK_EVENT.severity).toBe("error");
		expect(SAMPLE_BLOCK_EVENT.howToFix.length).toBeGreaterThan(0);
		const joined = SAMPLE_BLOCK_EVENT.howToFix.join(" ");
		for (const token of ["idea", "mirror", "/goal"]) {
			expect(joined).toContain(token);
		}
	});

	it("accessors return defensive copies, not the registry", () => {
		const a = aboveZones();
		a[0].role = "MUTATED";
		expect(aboveZones()[0].role).not.toBe("MUTATED");
		const b = belowZones();
		b[0].name = "MUTATED";
		expect(belowZones()[0].name).not.toBe("MUTATED");
	});

	it("is deterministic — two reads are deep-equal", () => {
		expect(aboveZones()).toEqual(aboveZones());
		expect(belowZones()).toEqual(belowZones());
	});
});
