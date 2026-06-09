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
	assistantReply,
	buildCockpit,
	buildGrid,
	cellKey,
	cellPlacements,
	EXISTING_DAG,
	generateSpecs,
	isTruthWriteRequest,
	MIRROR_PAIRS,
	mergeImpacts,
	mergePlacements,
	nextPairId,
	pairKey,
	pairTier,
	placementsByLevel,
	proposeSlot,
	scopeForPair,
	VERTICAL_LEVELS,
	validateAndDescend,
	validateImpacts,
	validatePlacements,
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

describe("FK11 — the 6×6 generative grid (FKE-38, corrected)", () => {
	const facetArb = fc.constantFrom<Facet>("F", "S", "B", "R", "V", "M");
	// a non-empty message that is NOT a truth-write phrasing.
	const msgArb = fc
		.string({ minLength: 1, maxLength: 40 })
		.filter((m) => m.trim() !== "" && !isTruthWriteRequest(m));

	it("a chat message GENERATES one spec per mirror-pair (a column of the 6×6)", () => {
		const out = generateSpecs("F", "un panier qui retient un article 30 min");
		expect(Array.isArray(out)).toBe(true);
		if (Array.isArray(out)) {
			expect(out).toHaveLength(MIRROR_PAIRS.length); // 6 pairs → 6 specs
			expect(out.map((s) => s.pairId).sort()).toEqual(
				MIRROR_PAIRS.map((p) => p.id).sort(),
			);
			for (const s of out) {
				expect(s.facet).toBe("F");
				expect(s.status).toBe("proposed"); // amber, above the wall — never a truth
			}
		}
	});

	it("a direct truth-write message is REFUSED at the wall — generates nothing (§2)", () => {
		const out = generateSpecs("S", "écris le kernel maintenant");
		expect(Array.isArray(out)).toBe(false);
		if (!Array.isArray(out)) {
			expect(out.refused).toBe(true);
			expect(out.code).toBe("AI_LAB_DIRECT_TRUTH_WRITE");
		}
	});

	it("generateSpecs is content-addressed — same (facet,message) → same spec ids", () => {
		fc.assert(
			fc.property(facetArb, msgArb, (facet, msg) => {
				const a = generateSpecs(facet, msg);
				const b = generateSpecs(facet, msg);
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("buildGrid is the 6 pairs × N facets, deterministic & fully covered", () => {
		const facets: Facet[] = ["F", "S", "B", "R", "V", "M"];
		const cells = buildGrid({ facets, specs: [], divergent: [] });
		expect(cells).toHaveLength(MIRROR_PAIRS.length * facets.length); // 6×6 = 36
		// every (pair,facet) appears exactly once
		const keys = new Set(cells.map((c) => c.key));
		expect(keys.size).toBe(cells.length);
		const again = buildGrid({ facets, specs: [], divergent: [] });
		expect(JSON.stringify(cells)).toBe(JSON.stringify(again));
	});

	it("a generated spec turns its cell's machine 🟢; a divergent cell stays 🔴 even with a spec", () => {
		const specs = generateSpecs("S", "exiger une authentification");
		if (!Array.isArray(specs)) throw new Error("expected specs");
		const divergent = [cellKey("contract", "S")]; // the machine diverges from the spec
		const cells = buildGrid({ facets: ["S"], specs, divergent });
		const contract = cells.find((c) => c.key === cellKey("contract", "S"));
		const spec = cells.find((c) => c.key === cellKey("spec", "S"));
		expect(spec?.voyant).toBe("green"); // spec generated, machine aligned
		expect(contract?.spec).toBeDefined(); // a spec WAS generated here…
		expect(contract?.voyant).toBe("red"); // …but the machine still diverges (the conscience)
	});

	it("a cell with no generated spec is 🟡 (declared, not yet proven)", () => {
		const cells = buildGrid({ facets: ["B"], specs: [], divergent: [] });
		for (const c of cells) expect(c.voyant).toBe("amber");
	});

	it("assistantReply: a normal message → a 'generated' turn counting specs + divergent machines", () => {
		const specs = generateSpecs("S", "exiger une authentification");
		if (!Array.isArray(specs)) throw new Error("expected specs");
		const cells = buildGrid({
			facets: ["S"],
			specs,
			divergent: [cellKey("contract", "S")],
		});
		const reply = assistantReply("S", "exiger une authentification", cells);
		expect(reply.kind).toBe("generated");
		if (reply.kind === "generated") {
			expect(reply.facet).toBe("S");
			expect(reply.specs).toBe(MIRROR_PAIRS.length); // 6 posted above the wall
			expect(reply.divergent).toBe(1); // contract@S machine still diverges
		}
	});

	it("assistantReply: a truth-write message → a 'refused' turn (the wall §2)", () => {
		const reply = assistantReply("F", "écris le kernel", []);
		expect(reply.kind).toBe("refused");
	});

	it("assistantReply is deterministic — same (facet,message,grid) → same reply", () => {
		const cells = buildGrid({ facets: ["F"], specs: [], divergent: [] });
		const a = assistantReply("F", "un panier", cells);
		const b = assistantReply("F", "un panier", cells);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe("FK11 — placement GATE (the chat acts on all levels; the LLM is verified)", () => {
	it("validatePlacements keeps only declared (level × facet × pair), drops invented ones", () => {
		const kept = validatePlacements([
			{ level: "opération", facet: "F", pairId: "contract", spec: "ok" },
			{ level: "INVENTÉ", facet: "F", pairId: "spec", spec: "bad level" },
			{ level: "vue", facet: "ZZ", pairId: "spec", spec: "bad facet" },
			{ level: "vue", facet: "S", pairId: "not-a-pair", spec: "bad pair" },
			{ level: "vue", facet: "S", pairId: "spec", spec: "  " }, // empty spec dropped
		]);
		expect(kept).toHaveLength(1);
		expect(kept[0]).toMatchObject({
			level: "opération",
			facet: "F",
			pairId: "contract",
		});
	});

	it("validatePlacements is deterministic + canonically ordered (level, facet, pair)", () => {
		const raw = [
			{ level: "entité", facet: "S", pairId: "model", spec: "a" },
			{ level: "produit", facet: "F", pairId: "spec", spec: "b" },
		];
		const a = validatePlacements(raw);
		const b = validatePlacements([...raw].reverse());
		expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // order-invariant
		expect(a[0].level).toBe("produit"); // produit sorts before entité
	});

	it("validatePlacements caps spec length + tolerates garbage input", () => {
		expect(validatePlacements(null)).toEqual([]);
		expect(validatePlacements("nope")).toEqual([]);
		const long = validatePlacements([
			{ level: "vue", facet: "X", pairId: "spec", spec: "x".repeat(500) },
		]);
		expect(long[0].spec.length).toBeLessThanOrEqual(280);
	});

	it("mergePlacements: a later spec for the same cell OVERRIDES; others kept", () => {
		const prev = validatePlacements([
			{ level: "vue", facet: "F", pairId: "spec", spec: "v1" },
			{ level: "action", facet: "S", pairId: "contract", spec: "keep" },
		]);
		const next = validatePlacements([
			{ level: "vue", facet: "F", pairId: "spec", spec: "v2" },
		]);
		const merged = mergePlacements(prev, next);
		expect(merged).toHaveLength(2);
		expect(merged.find((p) => p.level === "vue")?.spec).toBe("v2"); // overridden
		expect(merged.find((p) => p.level === "action")?.spec).toBe("keep");
	});

	it("placementsByLevel covers all 7 verticale levels in order", () => {
		const grouped = placementsByLevel([
			{ level: "entité", facet: "F", pairId: "model", spec: "x" },
		]);
		expect(grouped.map((g) => g.level)).toEqual([...VERTICAL_LEVELS]);
		expect(grouped.find((g) => g.level === "entité")?.items).toHaveLength(1);
		expect(grouped.find((g) => g.level === "produit")?.items).toHaveLength(0);
	});

	it("validateImpacts keeps only REAL existing-DAG ids, drops invented ones + dedupes", () => {
		const real = EXISTING_DAG[0].id;
		const kept = validateImpacts([
			{ specId: real, reason: "touché" },
			{ specId: "d-INVENTÉ", reason: "fantôme" },
			{ specId: real, reason: "doublon" }, // deduped
			{ specId: EXISTING_DAG[2].id, reason: "x".repeat(400) }, // capped
		]);
		expect(kept).toHaveLength(2);
		expect(kept.every((i) => EXISTING_DAG.some((s) => s.id === i.specId))).toBe(
			true,
		);
		expect(
			kept.find((i) => i.specId === EXISTING_DAG[2].id)?.reason.length,
		).toBeLessThanOrEqual(200);
	});

	it("validateImpacts is deterministic + ordered by the DAG order; tolerates garbage", () => {
		expect(validateImpacts(null)).toEqual([]);
		const a = validateImpacts([
			{ specId: EXISTING_DAG[3].id, reason: "b" },
			{ specId: EXISTING_DAG[1].id, reason: "a" },
		]);
		expect(a[0].specId).toBe(EXISTING_DAG[1].id); // earlier in the DAG sorts first
	});

	it("mergeImpacts: a later reason for the same spec OVERRIDES; others kept", () => {
		const prev = validateImpacts([
			{ specId: EXISTING_DAG[0].id, reason: "v1" },
		]);
		const next = validateImpacts([
			{ specId: EXISTING_DAG[0].id, reason: "v2" },
			{ specId: EXISTING_DAG[1].id, reason: "new" },
		]);
		const merged = mergeImpacts(prev, next);
		expect(merged).toHaveLength(2);
		expect(merged.find((i) => i.specId === EXISTING_DAG[0].id)?.reason).toBe(
			"v2",
		);
	});
});

describe("FK11 — the anatomy DESCENT (validate a pair → generate the next, per facet)", () => {
	it("nextPairId walks Spec→Comportement→Scénarios→Modèle→Contrat→Evidence then stops", () => {
		expect(nextPairId("spec")).toBe("behavior");
		expect(nextPairId("behavior")).toBe("scenarios");
		expect(nextPairId("scenarios")).toBe("model");
		expect(nextPairId("model")).toBe("contract");
		expect(nextPairId("contract")).toBe("evidence");
		expect(nextPairId("evidence")).toBeUndefined(); // the last pair
	});

	it("validate the spec → it becomes validated AND generates the comportement (the descent)", () => {
		const start = validatePlacements([
			{
				level: "opération",
				facet: "F",
				pairId: "spec",
				spec: "le panier expire à 30 min",
			},
		]);
		const after = validateAndDescend(start, "opération", "F", "spec");
		expect(after.find((p) => p.pairId === "spec")?.status).toBe("validated");
		const behavior = after.find((p) => p.pairId === "behavior");
		expect(behavior).toBeDefined(); // the next pair was generated
		expect(behavior?.spec).toContain("le panier expire à 30 min"); // derived from parent
	});

	it("the descent chains: validate behavior → generates scenarios", () => {
		let p = validatePlacements([
			{ level: "vue", facet: "S", pairId: "spec", spec: "auth forte" },
		]);
		p = validateAndDescend(p, "vue", "S", "spec"); // → behavior
		p = validateAndDescend(p, "vue", "S", "behavior"); // → scenarios
		expect(p.find((x) => x.pairId === "scenarios")).toBeDefined();
		expect(p.find((x) => x.pairId === "behavior")?.status).toBe("validated");
	});

	it("validating the LAST pair (evidence) marks it realized — no further descent", () => {
		const p = validateAndDescend(
			validatePlacements([
				{
					level: "entité",
					facet: "F",
					pairId: "evidence",
					spec: "evidence attendue",
				},
			]),
			"entité",
			"F",
			"evidence",
		);
		expect(p.find((x) => x.pairId === "evidence")?.status).toBe("realized");
		expect(p).toHaveLength(1); // nothing generated below the last pair
	});

	it("validateAndDescend is a no-op on an unknown cell; works per facet independently", () => {
		const start = validatePlacements([
			{ level: "action", facet: "S", pairId: "spec", spec: "s" },
		]);
		expect(validateAndDescend(start, "action", "B", "spec")).toEqual(start);
		const afterS = validateAndDescend(start, "action", "S", "spec");
		expect(
			afterS.find((p) => p.facet === "S" && p.pairId === "behavior"),
		).toBeDefined();
		expect(afterS.find((p) => p.facet === "B")).toBeUndefined();
	});

	it("cellPlacements returns one cell's pairs in anatomy order", () => {
		const all = validatePlacements([
			{ level: "vue", facet: "F", pairId: "scenarios", spec: "c" },
			{ level: "vue", facet: "F", pairId: "spec", spec: "a" },
			{ level: "vue", facet: "S", pairId: "spec", spec: "other cell" },
		]);
		const cell = cellPlacements(all, "vue", "F");
		expect(cell.map((p) => p.pairId)).toEqual(["spec", "scenarios"]);
	});
});
