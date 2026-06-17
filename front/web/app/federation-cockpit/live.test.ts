import { describe, expect, it } from "vitest";
import { demoWave, gatewayFanOutArgs } from "../../lib/federation-cockpit-data";
import { fanOutDecoder } from "./live";

/**
 * /federation-cockpit live fan-out read — the PARITY MIRROR (Vitest, the frozen front N1 slot;
 * ADR 0092 kill-twins batch).
 *
 * It proves the TS `fanOutDecoder` decodes a SAMPLE of the Go federation `fan_out` tool output
 * (federationsrv.fanOutOutput: `{ waves: CellRedWave[], affected: CellRef[] }`, each wave carrying
 * `cell`/`reddened`/`queue` with snake_case fields) into the front `FanOutSpec` the cockpit
 * overlays — the tool's CONTRACT, NOT a second implementation of the fan-out logic (the Go
 * federation.FanOut is authoritative). This test pins only that the wire shape decodes faithfully
 * (a reddened cell → violates:true with its wave id; a non-reddened cell → violates:false; the
 * absence of a wave) and that a malformed payload deterministically falls back to the demo wave.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("federation-cockpit live — fan_out decoder parity", () => {
	it("decodes a Go-sample fanOutOutput (one reddened cell + one green neighbor)", () => {
		const goSample = {
			waves: [
				{
					cell: "payment",
					reddened: true,
					queue: [
						{
							target: "payment::pii-aggregate",
							reason: "version_stale",
							dependencies: [],
							layer: "projection",
							wave_id: "wave-pii-1",
						},
					],
				},
				{ cell: "order", reddened: false, queue: [] },
			],
			affected: ["payment"],
		};
		const decoded = fanOutDecoder(goSample);
		expect(decoded).toEqual({
			policyWaveId: "wave-pii-1",
			cells: [
				{ cell: "payment", violates: true },
				{ cell: "order", violates: false },
			],
		});
	});

	it("decodes an EMPTY fan-out (no active wave) — policyWaveId falls to ''", () => {
		const decoded = fanOutDecoder({ waves: [], affected: [] });
		expect(decoded).toEqual({ policyWaveId: "", cells: [] });
	});

	it("rejects a malformed payload (→ demo wave fallback)", () => {
		expect(fanOutDecoder(null)).toBeNull();
		expect(fanOutDecoder({})).toBeNull(); // no `waves` list
		// a wave cell missing `cell` → null.
		expect(
			fanOutDecoder({ waves: [{ reddened: true, queue: [] }], affected: [] }),
		).toBeNull();
		// a wave cell with a non-boolean `reddened` → null.
		expect(
			fanOutDecoder({
				waves: [{ cell: "payment", reddened: "yes", queue: [] }],
				affected: [],
			}),
		).toBeNull();
	});

	it("the demo wave matches the gateway-arg projection (twin ≡ the live contract shape)", () => {
		// The fired demo wave reddens ONLY payment; the gateway-arg projection of the SAME wave
		// carries that violation as the fan_out tool's `cells[]` input → the decoded live output
		// (when the engine runs) yields the SAME FanOutSpec the demo falls back to.
		const wave = demoWave(true);
		expect(wave.policyWaveId).toBe("wave-pii-1");
		expect(wave.cells).toEqual([
			{ cell: "order", violates: false },
			{ cell: "payment", violates: true },
		]);
		const args = gatewayFanOutArgs(true);
		expect(args.policy_wave_id).toBe("wave-pii-1");
		expect(args.violated_cell).toBe("payment");
		const cells = args.cells as Array<{ cell: string; violates: boolean }>;
		expect(cells.map((c) => ({ cell: c.cell, violates: c.violates }))).toEqual([
			{ cell: "order", violates: false },
			{ cell: "payment", violates: true },
		]);
		// the empty wave carries no cells (no active transverse wave).
		expect(demoWave(false).cells).toEqual([]);
	});
});
