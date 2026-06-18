import { describe, expect, it } from "vitest";
import {
	demoCockpit,
	findCockpitScenario,
	gatewayBuildCockpitArgs,
	SAMPLE_GATE,
} from "../../lib/ai-lab-data";
import { cockpitDecoder } from "./live";

/**
 * /ai-lab live build_cockpit read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `cockpitDecoder` decodes a SAMPLE of the Go ai-lab `build_cockpit` tool output
 * (ailab.CockpitState: `{ kernel_id, mode, cells, cards, red_wave, blast, gate?, verdict, green,
 * red, amber }`, the cells being snake-cased `PairCell` with `read_only`, the gate `next_level` /
 * `can_promote`) — the tool's CONTRACT, NOT a second implementation of the composition (the Go
 * ailab.BuildCockpit over conscience.Reconcile is authoritative — AUCUN NOUVEAU JUGE). This test
 * pins only that the wire shape decodes faithfully (the CENTRE cells with voyant + wall tier +
 * read-only, the DROITE cards, the red_wave → redWave rename, the blast map, the FK10 gate, the
 * counts) and that a malformed payload deterministically falls back to the demo cockpit.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same cockpit, zero LLM.
 */

describe("ai-lab live — build_cockpit decoder parity", () => {
	it("decodes a Go-sample CockpitState (aligned cockpit, no card)", () => {
		const goSample = {
			kernel_id: "checkout",
			mode: "navigational",
			cells: [
				{
					key: "F:s2↔s9:runner",
					facet: "F",
					pair: "s2↔s9",
					source: "runner",
					voyant: "green",
					tier: "above",
					read_only: false,
				},
				{
					key: "F:latency-meter:sensor",
					facet: "F",
					pair: "latency-meter",
					source: "sensor",
					voyant: "green",
					tier: "below",
					read_only: true,
				},
			],
			cards: [],
			red_wave: [],
			blast: {},
			gate: { level: 2, can_promote: false, next_level: 3 },
			verdict: "aligned",
			green: 2,
			red: 0,
			amber: 0,
		};
		const decoded = cockpitDecoder(goSample);
		expect(decoded).toEqual({
			kernel_id: "checkout",
			mode: "navigational",
			cells: [
				{
					key: "F:s2↔s9:runner",
					facet: "F",
					pair: "s2↔s9",
					source: "runner",
					voyant: "green",
					tier: "above",
					readOnly: false,
				},
				{
					key: "F:latency-meter:sensor",
					facet: "F",
					pair: "latency-meter",
					source: "sensor",
					voyant: "green",
					tier: "below",
					readOnly: true,
				},
			],
			cards: [],
			redWave: [],
			blast: {},
			gate: { level: 2, canPromote: false, nextLevel: 3 },
			verdict: "aligned",
			green: 2,
			red: 0,
			amber: 0,
		});
	});

	it("decodes a CockpitState carrying a drift cell + its decision card + red wave + blast", () => {
		const decoded = cockpitDecoder({
			kernel_id: "checkout",
			mode: "navigational",
			cells: [
				{
					key: "F:s2↔s9:runner",
					facet: "F",
					pair: "s2↔s9",
					source: "runner",
					voyant: "red",
					tier: "above",
					read_only: false,
				},
			],
			cards: [
				{
					id: "DC-12ab34cd",
					kernel_id: "checkout",
					source: "runner",
					facet: "F",
					pair: "s2↔s9",
					drift: "semantic_drift",
					detail: "le code accepte 31 jours ; le contrat dit 30",
					blast: "medium",
					options: ["fix_below_wall", "change_above_wall", "ask_user_decision"],
					recommendation: "ask_user_decision",
					advisory: false,
				},
			],
			red_wave: ["F:s2↔s9:runner"],
			blast: { "DC-12ab34cd": "medium" },
			gate: { level: 2, can_promote: false, next_level: 3 },
			verdict: "drift",
			green: 0,
			red: 1,
			amber: 0,
		});
		expect(decoded?.verdict).toBe("drift");
		expect(decoded?.redWave).toEqual(["F:s2↔s9:runner"]);
		expect(decoded?.cells[0]?.voyant).toBe("red");
		expect(decoded?.blast).toEqual({ "DC-12ab34cd": "medium" });
		expect(decoded?.cards).toHaveLength(1);
		expect(decoded?.cards[0]?.recommendation).toBe("ask_user_decision");
		expect(decoded?.cards[0]?.options).toEqual([
			"fix_below_wall",
			"change_above_wall",
			"ask_user_decision",
		]);
	});

	it("decodes a cockpit with no gate (omitempty → undefined)", () => {
		const decoded = cockpitDecoder({
			kernel_id: "checkout",
			mode: "conversational",
			cells: [],
			cards: [],
			red_wave: [],
			blast: {},
			verdict: "aligned",
			green: 0,
			red: 0,
			amber: 0,
		});
		expect(decoded?.gate).toBeUndefined();
		expect(decoded?.mode).toBe("conversational");
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(cockpitDecoder(null)).toBeNull();
		expect(cockpitDecoder({})).toBeNull(); // no kernel_id / mode / counts.
		// an unknown overall verdict → null.
		expect(
			cockpitDecoder({
				kernel_id: "checkout",
				mode: "navigational",
				verdict: "maybe",
				green: 0,
				red: 0,
				amber: 0,
				cells: [],
				cards: [],
				red_wave: [],
				blast: {},
			}),
		).toBeNull();
		// an unknown mode → null.
		expect(
			cockpitDecoder({
				kernel_id: "checkout",
				mode: "freeform",
				verdict: "aligned",
				green: 0,
				red: 0,
				amber: 0,
				cells: [],
				cards: [],
				red_wave: [],
				blast: {},
			}),
		).toBeNull();
		// a missing required count → null.
		expect(
			cockpitDecoder({
				kernel_id: "checkout",
				mode: "navigational",
				verdict: "aligned",
				green: 0,
				red: 0,
				// amber missing
				cells: [],
				cards: [],
				red_wave: [],
				blast: {},
			}),
		).toBeNull();
		// a malformed cell (missing read_only bool) → null (the whole cockpit).
		expect(
			cockpitDecoder({
				kernel_id: "checkout",
				mode: "navigational",
				verdict: "aligned",
				green: 1,
				red: 0,
				amber: 0,
				cells: [
					{
						key: "k",
						facet: "F",
						pair: "x",
						source: "runner",
						voyant: "green",
						tier: "above",
					},
				],
				cards: [],
				red_wave: [],
				blast: {},
			}),
		).toBeNull();
		// an unknown voyant string → null.
		expect(
			cockpitDecoder({
				kernel_id: "checkout",
				mode: "navigational",
				verdict: "aligned",
				green: 1,
				red: 0,
				amber: 0,
				cells: [
					{
						key: "k",
						facet: "F",
						pair: "x",
						source: "runner",
						voyant: "blue",
						tier: "above",
						read_only: false,
					},
				],
				cards: [],
				red_wave: [],
				blast: {},
			}),
		).toBeNull();
	});

	it("the demo cockpit matches the decoded shape (twin ≡ the live contract shape)", () => {
		// The demo fixture is the twin buildCockpit(reconcile(scenario)); its shape is identical to
		// what the live decoder returns — the twin sits behind source:"demo", same shape as the
		// Go-authoritative live cockpit.
		const aligned = findCockpitScenario("aligned");
		expect(aligned).toBeDefined();
		if (!aligned) return;
		const demo = demoCockpit(aligned, "navigational");
		expect(demo.kernel_id).toBe("checkout");
		expect(demo.verdict).toBe("aligned");
		expect(demo.mode).toBe("navigational");
		expect(demo.cards).toHaveLength(0);
		expect(demo.gate).toEqual(SAMPLE_GATE);
		// every cell carries a read-only flag consistent with its wall tier.
		for (const cell of demo.cells) {
			expect(cell.readOnly).toBe(cell.tier === "below");
		}

		// the gateway args carry the RAW facet columns + verdicts + the autonomy level (the Go server
		// re-reconciles + composes them itself).
		const args = gatewayBuildCockpitArgs(aligned, "navigational") as {
			kernel_id: string;
			mode: string;
			autonomy_level: number;
			columns: { facet: string; rungs: unknown[] }[];
			verdicts: unknown[];
		};
		expect(args.kernel_id).toBe("checkout");
		expect(args.mode).toBe("navigational");
		expect(args.autonomy_level).toBe(SAMPLE_GATE.level);
		expect(args.columns.length).toBe(5); // S/R/V/M/X
		expect(args.columns[0]?.rungs.length).toBe(6); // the six pairs

		// a drift scenario produces a red wave + ≥1 card in the demo twin (same the live read returns).
		const drift = findCockpitScenario("runner-drift");
		expect(drift).toBeDefined();
		if (!drift) return;
		const demoDrift = demoCockpit(drift, "navigational");
		expect(demoDrift.verdict).toBe("drift");
		expect(demoDrift.redWave.length).toBeGreaterThan(0);
		expect(demoDrift.cards.length).toBeGreaterThan(0);
	});
});
