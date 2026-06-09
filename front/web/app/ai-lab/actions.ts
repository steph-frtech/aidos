"use server";

import {
	applyCardValidation,
	buildCockpit,
	buildGrid,
	type CockpitNode,
	generateSpecs,
	type Mode,
	proposeSlot,
	scopeForPair,
} from "@/lib/ai-lab";
import type { Facet } from "@/lib/facetwire";
import {
	type CockpitView,
	DEFAULT_MODE,
	emptyView,
	GRID_FACETS,
	type LabView,
	SAMPLE_GATE,
	SEEDED_DIVERGENT,
	scenario,
} from "./fixtures";

/**
 * Server Actions for the /ai-lab Workbench cockpit (FK11 — the trialogue).
 *
 * THE STEP (ROADMAP-fke FK11, FKE-38): the AI Lab is the trialogue cockpit composing the EXISTING
 * truths — the FK09 conscience report, the FK08 facet skeleton, S58/S60 graph nav — into one
 * zoomable screen: GAUCHE the chat that PROPOSES slots (never a truth), CENTRE the navigable
 * layer with a 🟢/🔴/🟡 voyant per pair of every facet and the WALL drawn, DROITE the decision
 * cards + blast radius + red wave + promotion gate. Two modes (conversational/navigational) =
 * the same screen at a different zoom.
 *
 * Action-capable (CLAUDE.md §7 ui-completeness): every cockpit op has a control bound to a Server
 * Action running the pure twin lib/ai-lab — load a cockpit (buildCockpit), chat a slot
 * (proposeSlot), click a pair to scope (scopeForPair), validate a card to flip a pair
 * (applyCardValidation). THE WALL (§2): the actions WRITE NOTHING — a direct truth-write from the
 * chat is REFUSED; an above-the-wall card option opens a /goal; the cockpit is a projection.
 * DETERMINISM-FIRST (§8): no LLM enters — the gaps are SemanticDiff/blast, the judge is a calc.
 */

export async function loadCockpitAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const mode =
		(String(formData.get("mode") ?? DEFAULT_MODE) as Mode) ?? DEFAULT_MODE;
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const args = { report: sc.report, mode, gate: SAMPLE_GATE };
	const a = buildCockpit(args);
	const b = buildCockpit(args);
	return {
		ok: true,
		state: a,
		deterministic: JSON.stringify(a) === JSON.stringify(b),
	};
}

export async function chatAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const message = String(formData.get("message") ?? "");
	const facet = (String(formData.get("facet") ?? "F") as Facet) ?? "F";
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const node: CockpitNode = {
		id: `${sc.report.kernel_id}-${facet}`,
		kind: "operation",
		facet,
	};
	const res = proposeSlot(node, message);
	const state = buildCockpit({ report: sc.report, gate: SAMPLE_GATE });
	if ("refused" in res) {
		return { ok: true, state, refusal: res };
	}
	return { ok: true, state, slot: res };
}

export async function scopePairAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const pairKey = String(formData.get("pairKey") ?? "");
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const scope = scopeForPair(sc.report, pairKey);
	const state = buildCockpit({ report: sc.report, gate: SAMPLE_GATE });
	return { ok: true, state, scope };
}

export async function validateCardAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const cardId = String(formData.get("cardId") ?? "");
	const option = String(formData.get("option") ?? "fix_below_wall");
	const sc = scenario(scenarioId);
	if (!sc) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const res = applyCardValidation(sc.report, cardId, option);
	const state = buildCockpit({ report: res.report, gate: SAMPLE_GATE });
	return {
		ok: true,
		state,
		flippedPair: res.flippedPair,
		openedGoal: res.openedGoal,
	};
}

/**
 * generateSpecsAction — the LEFT (chat) gesture of the corrected FKE-38 lab: a natural-language
 * message GENERATES the specs across the 6 mirror-pairs of the selected facet (a column of the
 * 6×6), ABOVE the wall, then rebuilds the grid so the RIGHT shows the machines that changed. A
 * direct truth-write is REFUSED at the wall (§2) — it generates nothing, only records the attempt.
 * State accumulates via `prev` (useActionState). Pure twin: lib/ai-lab generateSpecs + buildGrid.
 */
export async function generateSpecsAction(
	prev: LabView,
	formData: FormData,
): Promise<LabView> {
	const message = String(formData.get("message") ?? "").trim();
	const facet =
		(String(formData.get("facet") ?? prev.selectedFacet ?? "F") as Facet) ??
		"F";
	if (!message) {
		return { ...prev, refusal: undefined, error: "message vide" };
	}
	const res = generateSpecs(facet, message);
	if ("refused" in res) {
		return {
			...prev,
			selectedFacet: facet,
			transcript: [
				...prev.transcript,
				{ id: `MSG-${prev.transcript.length}`, text: message },
			],
			refusal: res,
			error: undefined,
		};
	}
	const byId = new Map(prev.specs.map((s) => [s.id, s]));
	for (const s of res) byId.set(s.id, s);
	const specs = [...byId.values()];
	return {
		ok: true,
		selectedFacet: facet,
		transcript: [
			...prev.transcript,
			{ id: `MSG-${prev.transcript.length}`, text: message },
		],
		specs,
		cells: buildGrid({
			facets: GRID_FACETS,
			specs,
			divergent: SEEDED_DIVERGENT,
		}),
		refusal: undefined,
		error: undefined,
	};
}
