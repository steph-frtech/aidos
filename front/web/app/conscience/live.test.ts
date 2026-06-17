import { describe, expect, it } from "vitest";
import {
	demoReport,
	findScenario,
	gatewayReconcileArgs,
} from "../../lib/conscience-data";
import { reportDecoder } from "./live";

/**
 * /conscience live reconcile read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `reportDecoder` decodes a SAMPLE of the Go conscience `reconcile` tool output
 * (consciencesrv.reportOut: `{ ok, kernel_id, verdict, aligned, pairs, cards, green, red, advisory,
 * hash }`, the pairs/cards being snake_case `pairOut`/`cardOut`) — the tool's CONTRACT, NOT a second
 * implementation of the aggregation logic (the Go conscience.Reconcile is authoritative — AUCUN
 * NOUVEAU JUGE). This test pins only that the wire shape decodes faithfully (the overall
 * verdict aligned/drift, the counts, the sourced pairs, the §FKE-31 cards with their options +
 * recommendation, the advisory flag, the omitempty drift/detail/blast) and that a malformed payload
 * deterministically falls back to the demo report.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("conscience live — reconcile decoder parity", () => {
	it("decodes a Go-sample reportOut (aligned kernel, no card)", () => {
		const goSample = {
			ok: true,
			kernel_id: "checkout",
			verdict: "aligned",
			aligned: true,
			pairs: [
				{
					source: "runner",
					facet: "F",
					pair: "s2↔s9",
					verdict: "green",
					soft: false,
				},
			],
			cards: [],
			green: 1,
			red: 0,
			advisory: 0,
			hash: "deadbeef",
		};
		const decoded = reportDecoder(goSample);
		expect(decoded).toEqual({
			kernel_id: "checkout",
			verdict: "aligned",
			pairs: [
				{
					source: "runner",
					facet: "F",
					pair: "s2↔s9",
					verdict: "green",
					drift: undefined,
					detail: undefined,
					blast: undefined,
					soft: false,
				},
			],
			cards: [],
			green: 1,
			red: 0,
			advisory: 0,
		});
	});

	it("decodes a reportOut carrying a drift pair + its decision card", () => {
		const decoded = reportDecoder({
			ok: true,
			kernel_id: "checkout",
			verdict: "drift",
			aligned: false,
			pairs: [
				{
					source: "runner",
					facet: "F",
					pair: "s2↔s9",
					verdict: "red",
					drift: "semantic_drift",
					detail: "le code accepte 31 jours ; le contrat dit 30",
					blast: "medium",
					soft: false,
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
			green: 0,
			red: 1,
			advisory: 0,
			hash: "cafef00d",
		});
		expect(decoded?.verdict).toBe("drift");
		expect(decoded?.pairs[0]).toEqual({
			source: "runner",
			facet: "F",
			pair: "s2↔s9",
			verdict: "red",
			drift: "semantic_drift",
			detail: "le code accepte 31 jours ; le contrat dit 30",
			blast: "medium",
			soft: false,
		});
		expect(decoded?.cards).toHaveLength(1);
		expect(decoded?.cards[0]?.recommendation).toBe("ask_user_decision");
		expect(decoded?.cards[0]?.options).toEqual([
			"fix_below_wall",
			"change_above_wall",
			"ask_user_decision",
		]);
		expect(decoded?.cards[0]?.advisory).toBe(false);
	});

	it("decodes an advisory (soft X) card — informs, stays aligned (§13.6)", () => {
		const decoded = reportDecoder({
			ok: true,
			kernel_id: "checkout",
			verdict: "aligned",
			aligned: true,
			pairs: [
				{
					source: "facet",
					facet: "X",
					pair: "6-evidence",
					verdict: "advisory",
					drift: "experience_advisory",
					detail: "pair_broken",
					soft: true,
				},
			],
			cards: [
				{
					id: "DC-99887766",
					kernel_id: "checkout",
					source: "facet",
					facet: "X",
					pair: "6-evidence",
					drift: "experience_advisory",
					blast: "low",
					options: [
						"keep_experimental",
						"change_above_wall",
						"ask_user_decision",
					],
					recommendation: "keep_experimental",
					advisory: true,
				},
			],
			green: 0,
			red: 0,
			advisory: 1,
			hash: "abad1dea",
		});
		expect(decoded?.verdict).toBe("aligned");
		expect(decoded?.advisory).toBe(1);
		expect(decoded?.cards[0]?.advisory).toBe(true);
		// drift/detail/blast that are absent on the card decode to undefined (omitempty).
		expect(decoded?.cards[0]?.detail).toBeUndefined();
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(reportDecoder(null)).toBeNull();
		expect(reportDecoder({})).toBeNull(); // no kernel_id / verdict / counts.
		// an unknown overall verdict → null.
		expect(
			reportDecoder({
				kernel_id: "checkout",
				verdict: "maybe",
				green: 0,
				red: 0,
				advisory: 0,
				pairs: [],
				cards: [],
			}),
		).toBeNull();
		// a missing required count → null.
		expect(
			reportDecoder({
				kernel_id: "checkout",
				verdict: "aligned",
				green: 0,
				red: 0,
				// advisory missing
				pairs: [],
				cards: [],
			}),
		).toBeNull();
		// a malformed pair (missing soft bool) → null (the whole report).
		expect(
			reportDecoder({
				kernel_id: "checkout",
				verdict: "aligned",
				green: 1,
				red: 0,
				advisory: 0,
				pairs: [{ source: "runner", facet: "F", pair: "x", verdict: "green" }],
				cards: [],
			}),
		).toBeNull();
	});

	it("the demo report matches the decoded shape (twin ≡ the live contract shape)", () => {
		// The demo fixture is the twin reconcile() of the scenario; its shape is identical to what
		// the live decoder returns — the twin sits behind source:"demo", same shape as the
		// Go-authoritative live report.
		const aligned = findScenario("aligned");
		expect(aligned).toBeDefined();
		if (!aligned) return;
		const demo = demoReport(aligned);
		expect(demo.kernel_id).toBe("checkout");
		expect(demo.verdict).toBe("aligned");
		expect(demo.cards).toHaveLength(0);
		// the gateway args carry the RAW facet columns (the Go server wires them itself).
		const args = gatewayReconcileArgs(aligned) as {
			kernel_id: string;
			columns: { facet: string; rungs: unknown[] }[];
			verdicts: unknown[];
		};
		expect(args.kernel_id).toBe("checkout");
		expect(args.columns.length).toBe(5); // S/R/V/M/X
		expect(args.columns[0]?.rungs.length).toBe(6); // the six pairs

		// a drift scenario produces ≥1 card in the demo twin (the same the live read returns).
		const drift = findScenario("runner-drift");
		expect(drift).toBeDefined();
		if (!drift) return;
		const demoDrift = demoReport(drift);
		expect(demoDrift.verdict).toBe("drift");
		expect(demoDrift.cards.length).toBeGreaterThan(0);
	});
});
