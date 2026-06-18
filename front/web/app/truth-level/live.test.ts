import { describe, expect, it } from "vitest";
import {
	DEMO_RECORDS,
	demoCompute,
	demoLevels,
	demoParity,
	gatewayComputeArgs,
	gatewayLevelsArgs,
	gatewayParityArgs,
	LEVELS,
} from "../../lib/truth-level-data";
import { computeDecoder, levelsDecoder, parityDecoder } from "./live";

/**
 * /truth-level live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `computeDecoder` / `parityDecoder` / `levelsDecoder` decode a SAMPLE of the Go
 * truth-level tools' output (truthlevelsrv.computeOutput `{ ok, level, name }`, parityOutput
 * `{ ok, aligned, stored, computed, reason? }`, levelsOutput `{ ok, levels:[{level,name}] }`) into
 * the front verdicts the panel renders — the tools' CONTRACT, NOT a second implementation of the
 * FKE-5 transition (back/kernel/truthlevel is authoritative). It also proves the demo fixtures
 * (lib/truth-level-data) are byte-identical to what those decoders accept (the twin ≡ the live
 * contract shape), and that a malformed payload deterministically falls back to the demo.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("truth-level live — compute decoder parity", () => {
	it("decodes a Go-sample computeOutput ({ ok, level, name })", () => {
		const goSample = { ok: true, level: 4, name: "accepted" };
		expect(computeDecoder(goSample)).toEqual({
			ok: true,
			level: 4,
			name: "accepted",
		});
	});

	it("decodes the all-false (unknown) rung", () => {
		const goSample = { ok: true, level: 0, name: "unknown" };
		expect(computeDecoder(goSample)).toEqual({
			ok: true,
			level: 0,
			name: "unknown",
		});
	});

	it("rejects a malformed compute payload (→ demo fallback)", () => {
		expect(computeDecoder(null)).toBeNull();
		expect(computeDecoder({})).toBeNull(); // no ok
		expect(computeDecoder({ ok: "yes", level: 1, name: "raw" })).toBeNull(); // non-boolean ok
		expect(computeDecoder({ ok: true, name: "raw" })).toBeNull(); // no level
		expect(computeDecoder({ ok: true, level: 1 })).toBeNull(); // no name
		expect(computeDecoder({ ok: true, level: "1", name: "raw" })).toBeNull(); // level wrong type
	});
});

describe("truth-level live — check_parity decoder parity", () => {
	it("decodes a Go-sample parityOutput (aligned)", () => {
		const goSample = {
			ok: true,
			aligned: true,
			stored: 4,
			computed: 4,
		};
		expect(parityDecoder(goSample)).toEqual({
			ok: true,
			aligned: true,
			stored: 4,
			computed: 4,
		});
	});

	it("decodes a Go-sample parityOutput (divergent, with a reason — reason ignored)", () => {
		const goSample = {
			ok: true,
			aligned: false,
			stored: 2,
			computed: 4,
			reason: "stored != computed",
		};
		expect(parityDecoder(goSample)).toEqual({
			ok: true,
			aligned: false,
			stored: 2,
			computed: 4,
		});
	});

	it("rejects a malformed parity payload (→ demo fallback)", () => {
		expect(parityDecoder(null)).toBeNull();
		expect(parityDecoder({})).toBeNull(); // no ok
		expect(parityDecoder({ ok: true, stored: 1, computed: 1 })).toBeNull(); // no aligned
		expect(parityDecoder({ ok: true, aligned: true, computed: 1 })).toBeNull(); // no stored
		expect(parityDecoder({ ok: true, aligned: true, stored: 1 })).toBeNull(); // no computed
	});
});

describe("truth-level live — levels decoder parity", () => {
	it("decodes a Go-sample levelsOutput ({ ok, levels:[{level,name}] })", () => {
		const goSample = {
			ok: true,
			levels: [
				{ level: 1, name: "raw" },
				{ level: 7, name: "reconciled" },
			],
		};
		expect(levelsDecoder(goSample)).toEqual([
			{ level: 1, name: "raw" },
			{ level: 7, name: "reconciled" },
		]);
	});

	it("rejects a malformed levels payload (→ demo fallback)", () => {
		expect(levelsDecoder(null)).toBeNull();
		expect(levelsDecoder({})).toBeNull(); // no ok
		expect(levelsDecoder({ ok: true })).toBeNull(); // no levels array
		expect(levelsDecoder({ ok: true, levels: [{ level: 1 }] })).toBeNull(); // a row missing name
		expect(levelsDecoder({ ok: true, levels: [{ name: "raw" }] })).toBeNull(); // a row missing level
	});
});

describe("truth-level — demo fixtures ≡ the live contract shape", () => {
	it("demoCompute decodes through computeDecoder unchanged (twin ≡ live)", () => {
		for (const r of DEMO_RECORDS) {
			const demo = demoCompute(r.signals);
			// the demo verdict is itself a valid computeOutput the decoder round-trips.
			expect(
				computeDecoder({
					ok: demo.ok,
					level: demo.level,
					name: demo.name,
				}),
			).toEqual(demo);
		}
	});

	it("demoParity yields aligned for every stored=computed record (twin ≡ live)", () => {
		for (const r of DEMO_RECORDS) {
			const lvl = demoCompute(r.signals);
			const demo = demoParity(lvl.level, r.signals);
			expect(demo.aligned).toBe(true);
			expect(demo.stored).toBe(demo.computed);
			expect(
				parityDecoder({
					ok: demo.ok,
					aligned: demo.aligned,
					stored: demo.stored,
					computed: demo.computed,
				}),
			).toEqual(demo);
		}
	});

	it("demoParity surfaces a divergence when the stored rung is hand-posed wrong (RED)", () => {
		const r = DEMO_RECORDS[3]; // rec-accepted → computed rung 4
		const demo = demoParity(99, r.signals);
		expect(demo.aligned).toBe(false);
		expect(demo.stored).toBe(99);
		expect(demo.computed).not.toBe(99);
		expect(
			parityDecoder({
				ok: demo.ok,
				aligned: demo.aligned,
				stored: demo.stored,
				computed: demo.computed,
			}),
		).toEqual(demo);
	});

	it("demoLevels yields the 7 canonical rungs and decodes unchanged (twin ≡ live)", () => {
		const demo = demoLevels();
		expect(demo).toEqual(LEVELS.map((l) => ({ level: l.rung, name: l.name })));
		expect(levelsDecoder({ ok: true, levels: demo })).toEqual(demo);
	});

	it("the gateway-arg projections carry the inputs the tools expect", () => {
		const r = DEMO_RECORDS[0];
		expect(gatewayComputeArgs(r.signals)).toEqual({ signals: r.signals });
		expect(gatewayParityArgs(1, r.signals)).toEqual({
			stored: 1,
			signals: r.signals,
		});
		expect(gatewayLevelsArgs()).toEqual({});
	});
});
