import { describe, expect, it } from "vitest";
import {
	type Column,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
} from "../../lib/facetwire";
import { demoSkeleton, gatewaySkeletonArgs } from "../../lib/facetwire-data";
import { skeletonDecoder } from "./live";

/**
 * /facet-wire live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 kill-twins
 * batch).
 *
 * It proves the TS `skeletonDecoder` decodes a SAMPLE of the Go facet-wire tool's output
 * (facetwiresrv.skeletonReportOut `{ ok, kernel_id?, verdict, green, columns, hash }`, each column
 * `{ facet, sensor, soft, verdict, divergences, advisories? }`, each divergence
 * `{ facet, rung, kind, advisory }`) into the front verdict the panel renders — the tool's CONTRACT,
 * NOT a second implementation of the wire logic (back/kernel/mirror/facetwire is authoritative). It
 * also proves the demo fixture (lib/facetwire-data demoSkeleton) is byte-identical to what the
 * decoder accepts (the twin ≡ the live contract shape), and that a malformed payload deterministically
 * falls back (the decoder returns null → readVia uses the demo).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

/** A full six-rung column (all declared, all proven) — the green case. */
function fullColumn(facet: string): Column {
	return {
		kernel_id: "checkout",
		facet: facet as Column["facet"],
		rungs: RUNGS.map((rung) => ({ rung, declared: true, proven: true })),
	};
}

/** The same column with its 6-evidence pair broken (declared, not proven). */
function brokenColumn(facet: string): Column {
	const c = fullColumn(facet);
	return {
		...c,
		rungs: c.rungs.map((r) =>
			r.rung === "6-evidence" ? { ...r, proven: false } : r,
		),
	};
}

describe("facet-wire live — skeleton decoder parity", () => {
	it("decodes a Go-sample skeletonReportOut (all aligned → green, no divergences)", () => {
		const goSample = {
			ok: true,
			kernel_id: "checkout",
			verdict: "green",
			green: true,
			columns: [
				{
					facet: "S",
					sensor: "gv-gosec-gitleaks-policy",
					soft: false,
					verdict: "green",
					green: true,
					divergences: [],
				},
			],
			hash: "abc123",
		};
		const decoded = skeletonDecoder(goSample);
		expect(decoded?.verdict).toBe("green");
		expect(decoded?.kernelId).toBe("checkout");
		expect(decoded?.columns).toHaveLength(1);
		expect(decoded?.columns[0]?.facet).toBe("S");
		expect(decoded?.columns[0]?.divergences).toEqual([]);
		// omitempty advisories → decodes to [].
		expect(decoded?.columns[0]?.advisories).toEqual([]);
	});

	it("decodes a Go-sample with a broken HARD column (red + the structural divergence)", () => {
		const goSample = {
			ok: true,
			kernel_id: "checkout",
			verdict: "red",
			green: false,
			columns: [
				{
					facet: "S",
					sensor: "gv-gosec-gitleaks-policy",
					soft: false,
					verdict: "red",
					green: false,
					divergences: [
						{
							facet: "S",
							rung: "6-evidence",
							kind: "pair_broken",
							advisory: false,
						},
					],
				},
			],
			hash: "def456",
		};
		const decoded = skeletonDecoder(goSample);
		expect(decoded?.verdict).toBe("red");
		expect(decoded?.columns[0]?.verdict).toBe("red");
		expect(decoded?.columns[0]?.divergences[0]?.kind).toBe("pair_broken");
		expect(decoded?.columns[0]?.divergences[0]?.advisory).toBe(false);
	});

	it("decodes a Go-sample with a SOFT X advisory (verdict stays green)", () => {
		const goSample = {
			ok: true,
			kernel_id: "checkout",
			verdict: "green",
			green: true,
			columns: [
				{
					facet: "X",
					sensor: "experience-claim",
					soft: true,
					verdict: "green",
					green: true,
					divergences: [],
					advisories: [
						{
							facet: "X",
							rung: "6-evidence",
							kind: "pair_broken",
							advisory: true,
						},
					],
				},
			],
			hash: "ghi789",
		};
		const decoded = skeletonDecoder(goSample);
		expect(decoded?.verdict).toBe("green");
		expect(decoded?.columns[0]?.soft).toBe(true);
		expect(decoded?.columns[0]?.advisories[0]?.advisory).toBe(true);
	});

	it("rejects a malformed payload (out-of-set verdict → null → demo fallback)", () => {
		expect(skeletonDecoder({ verdict: "maybe", columns: [] })).toBeNull();
		expect(skeletonDecoder({ columns: [] })).toBeNull();
		expect(skeletonDecoder(null)).toBeNull();
		// a column with an out-of-set divergence kind rejects the whole read.
		expect(
			skeletonDecoder({
				verdict: "green",
				columns: [
					{
						facet: "S",
						sensor: "x",
						soft: false,
						verdict: "green",
						divergences: [
							{ facet: "S", rung: "6-evidence", kind: "wat", advisory: false },
						],
					},
				],
			}),
		).toBeNull();
	});
});

describe("facet-wire live — demo fixture ≡ the live contract shape", () => {
	it("demoSkeleton produces exactly what skeletonDecoder accepts (twin ≡ live)", () => {
		const columns = NON_FUNCTIONAL_COLUMNS.map(fullColumn);
		const demo = demoSkeleton("checkout", columns);
		// round-trip: the demo value, re-encoded as the Go would, decodes identically.
		const reencoded = {
			ok: true,
			kernel_id: demo.kernelId,
			verdict: demo.verdict,
			green: demo.verdict === "green",
			columns: demo.columns.map((c) => ({
				facet: c.facet,
				sensor: c.sensor,
				soft: c.soft,
				verdict: c.verdict,
				green: c.verdict === "green",
				divergences: c.divergences,
				advisories: c.advisories,
			})),
			hash: "x",
		};
		expect(skeletonDecoder(reencoded)).toEqual(demo);
	});

	it("a broken HARD pair reddens its column and the overall verdict (demo)", () => {
		const columns = NON_FUNCTIONAL_COLUMNS.map((f) =>
			f === "S" ? brokenColumn(f) : fullColumn(f),
		);
		const demo = demoSkeleton("checkout", columns);
		expect(demo.verdict).toBe("red");
		const s = demo.columns.find((c) => c.facet === "S");
		expect(s?.verdict).toBe("red");
		expect(s?.divergences.some((d) => d.kind === "pair_broken")).toBe(true);
	});

	it("a broken SOFT X pair stays green with an advisory (the §13.6 asymmetry, demo)", () => {
		const columns = NON_FUNCTIONAL_COLUMNS.map((f) =>
			f === "X" ? brokenColumn(f) : fullColumn(f),
		);
		const demo = demoSkeleton("checkout", columns);
		expect(demo.verdict).toBe("green");
		const x = demo.columns.find((c) => c.facet === "X");
		expect(x?.verdict).toBe("green");
		expect(x?.advisories.length).toBeGreaterThan(0);
	});

	it("gatewaySkeletonArgs carries the kernel id + columns (the dispatched args)", () => {
		const columns = NON_FUNCTIONAL_COLUMNS.map(fullColumn);
		const args = gatewaySkeletonArgs("checkout", columns);
		expect(args.kernel_id).toBe("checkout");
		expect(args.columns).toEqual(columns);
	});
});
