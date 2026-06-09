/**
 * FK11 reproducibility mirror — the AI Lab COCKPIT deterministic core (lib/ai-lab).
 * mirror record: reflects=FK11-ai-lab, test_kind=property, cert_language=fast-check, liveness=live
 *
 * The done-criteria of FK11 (ROADMAP-fke) live here as executable invariants:
 *   - PROPERTY « écarts = déterministes » — buildCockpit/scopeForPair/applyCardValidation are
 *     PURE + TOTAL: same input ⇒ byte-identical output (the headline FK11 property);
 *   - a chat message demanding a DIRECT TRUTH WRITE is REFUSED at the wall (proposeSlot →
 *     WallRefusal), never a slot — the only door is idea → mirror → /goal (§2);
 *   - a normal chat message PROPOSES an amber slot, status="proposed", never a truth;
 *   - validating a card with `fix_below_wall` flips the addressed pair 🔴→🟢 (re-reconciled);
 *   - an above-the-wall option does NOT flip a pair — it opens a goal (the wall §2);
 *   - clicking a pair resolves the SAME left+right scope every time (scopeForPair determinism);
 *   - below the wall is read-only from the cockpit (PairCell.readOnly).
 *
 * THE WALL (§2): the cockpit core writes nothing — every output is a projection. DETERMINISM-FIRST
 * (§8): no LLM enters; the gaps are SemanticDiff/blast, the judge is a calculation.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyCardValidation,
	buildCockpit,
	isTruthWriteRequest,
	pairKey,
	pairTier,
	proposeSlot,
	scopeForPair,
	voyantFor,
} from "./ai-lab";
import { reconcile, type SourcedVerdict } from "./conscience";
import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
	wireSkeleton,
} from "./facetwire";

function skeleton(broken: Facet | null) {
	const cols: Column[] = NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({
			rung,
			declared: true,
			proven: !(facet === broken && rung === "6-evidence"),
		})),
	}));
	return wireSkeleton({ kernel_id: "checkout", columns: cols });
}

const runnerRed: SourcedVerdict = {
	source: "runner",
	facet: "F",
	pair: "s2↔s9",
	verdict: "red",
	drift: "semantic_drift",
	detail: "le code accepte 31 jours ; le contrat dit 30",
	blast: "medium",
};

/** a below-the-line sensor verdict (green) — so the cockpit's wall is genuinely drawn (both tiers). */
const sensorGreen: SourcedVerdict = {
	source: "sensor",
	facet: "F",
	pair: "latency-meter",
	verdict: "green",
};

function driftReport() {
	return reconcile({
		kernel_id: "checkout",
		skeleton: skeleton("S"),
		verdicts: [runnerRed, sensorGreen],
	});
}

describe("FK11 — the AI Lab cockpit deterministic core", () => {
	it("buildCockpit is deterministic — same input → byte-identical state (écarts déterministes)", () => {
		const r = driftReport();
		const a = buildCockpit({ report: r, mode: "navigational" });
		const b = buildCockpit({ report: r, mode: "navigational" });
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it("buildCockpit cells are stably ordered by pair key (invariant under report-pair order)", () => {
		const r = driftReport();
		const a = buildCockpit({ report: r });
		const shuffled = { ...r, pairs: [...r.pairs].reverse() };
		const b = buildCockpit({ report: shuffled });
		expect(a.cells.map((c) => c.key)).toEqual(b.cells.map((c) => c.key));
	});

	it("a chat message demanding a direct truth write is REFUSED at the wall (§2)", () => {
		const node = { id: "op-checkout", kind: "operation", facet: "F" as Facet };
		const res = proposeSlot(node, "écris la vérité dans le kernel maintenant");
		expect("refused" in res && res.refused).toBe(true);
		if ("refused" in res) {
			expect(res.code).toBe("AI_LAB_DIRECT_TRUTH_WRITE");
			expect(res.howToFix.length).toBeGreaterThan(0);
		}
	});

	it("a normal chat message PROPOSES an amber slot, never a truth", () => {
		const node = { id: "op-checkout", kind: "operation", facet: "F" as Facet };
		const res = proposeSlot(node, "et si on ajoutait une limite à 30 jours ?");
		expect("refused" in res).toBe(false);
		if (!("refused" in res)) {
			expect(res.status).toBe("proposed");
			expect(res.voyant).toBe("amber");
			expect(res.nodeId).toBe("op-checkout");
		}
	});

	it("proposeSlot is content-addressed — same message + node → same slot ID", () => {
		fc.assert(
			fc.property(fc.string(), (msg) => {
				const node = { id: "n1", kind: "operation", facet: "F" as Facet };
				const a = proposeSlot(node, msg);
				const b = proposeSlot(node, msg);
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("validating a card with fix_below_wall flips the addressed pair 🔴→🟢", () => {
		const r = driftReport();
		const redCard = r.cards.find((c) => !c.advisory);
		expect(redCard).toBeDefined();
		if (!redCard) return;
		const res = applyCardValidation(r, redCard.id, "fix_below_wall");
		expect(res.applied).toBe(true);
		expect(res.flippedPair).toBeDefined();
		// the flipped pair is now green in the re-reconciled report.
		const flipped = res.report.pairs.find(
			(p) => pairKey(p) === res.flippedPair,
		);
		expect(flipped?.verdict).toBe("green");
		// and the card it addressed is gone.
		expect(res.report.cards.find((c) => c.id === redCard.id)).toBeUndefined();
	});

	it("an above-the-wall option does NOT flip a pair — it opens a goal (§2)", () => {
		const r = driftReport();
		const redCard = r.cards.find((c) => !c.advisory);
		if (!redCard) return;
		const res = applyCardValidation(r, redCard.id, "change_above_wall");
		expect(res.applied).toBe(false);
		expect(res.openedGoal).toBe(true);
		// the report is unchanged (no truth written from the cockpit).
		expect(JSON.stringify(res.report)).toBe(JSON.stringify(r));
	});

	it("applyCardValidation is deterministic", () => {
		const r = driftReport();
		const redCard = r.cards.find((c) => !c.advisory);
		if (!redCard) return;
		const a = applyCardValidation(r, redCard.id, "fix_below_wall");
		const b = applyCardValidation(r, redCard.id, "fix_below_wall");
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it("clicking a pair resolves the SAME left+right scope every time", () => {
		const r = driftReport();
		const key = pairKey(r.pairs[0]);
		const a = scopeForPair(r, key);
		const b = scopeForPair(r, key);
		expect(a).toBeDefined();
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		expect(a?.chatScope.facet).toBe(r.pairs[0].facet);
	});

	it("a clicked red pair scope carries the cards addressing it", () => {
		const r = driftReport();
		const redPair = r.pairs.find((p) => p.verdict === "red");
		expect(redPair).toBeDefined();
		if (!redPair) return;
		const scope = scopeForPair(r, pairKey(redPair));
		expect(scope?.cardIds.length).toBeGreaterThan(0);
		expect(scope?.voyant).toBe("red");
	});

	it("below the wall is read-only from the cockpit; the wall is drawn per cell by source", () => {
		const r = driftReport();
		const state = buildCockpit({ report: r });
		for (const cell of state.cells) {
			expect(cell.tier).toBe(pairTier(cell.source));
			expect(cell.readOnly).toBe(cell.tier === "below");
		}
		// the wall is genuinely DRAWN: both tiers are present (above truths + below evidence).
		const tiers = new Set(state.cells.map((c) => c.tier));
		expect(tiers.has("above")).toBe(true);
		expect(tiers.has("below")).toBe(true);
	});

	it("voyantFor maps verdicts: green→green, advisory→amber, red→red", () => {
		expect(
			voyantFor({
				source: "runner",
				facet: "F",
				pair: "p",
				verdict: "green",
				soft: false,
			}),
		).toBe("green");
		expect(
			voyantFor({
				source: "facet",
				facet: "X",
				pair: "p",
				verdict: "advisory",
				soft: true,
			}),
		).toBe("amber");
		expect(
			voyantFor({
				source: "runner",
				facet: "F",
				pair: "p",
				verdict: "red",
				soft: false,
			}),
		).toBe("red");
	});

	it("isTruthWriteRequest is a pure declared matcher (no LLM)", () => {
		expect(isTruthWriteRequest("modifie le kernel")).toBe(true);
		expect(isTruthWriteRequest("write the kernel now")).toBe(true);
		expect(isTruthWriteRequest("ajoute une limite à 30 jours")).toBe(false);
	});
});
