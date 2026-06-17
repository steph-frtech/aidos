"use server";

import { type DepGraph, measure, propose, ratchet } from "@/lib/arch-fitness";
import {
	cleanCut,
	demoMeasure,
	gatewayGraphArgs,
} from "@/lib/arch-fitness-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { metricDecoder } from "./live";
import type { GateView, MeasureView, ProposeView, RatchetView } from "./view";

/**
 * Server Actions de la lentille V3 /v3/arch-fitness (le cliquet structurel §47, S102).
 *
 * LENTILLE NATIVE LIVE (ADR 0092 — le moteur Go est la SEULE source live) : `measureAction`
 * lit la métrique LIVE depuis le serveur Go arch-fitness à travers la passerelle
 * (`readVia(scope, "measure", …)`, la lecture below-the-line dispatchée), le twin pur
 * `lib/arch-fitness.measure()` n'étant conservé QUE comme repli déterministe de démo
 * (`source:"live"|"demo"`). ratchet/gate/propose restent sur le compute du twin comme chemin de
 * démo (une proposition/comparaison que le front montre localement) ; l'import de la frontière
 * `readVia` garde le cliquet T5 (twin-as-live-fitness) VERT (le twin est derrière le repli de
 * démo, jamais comme source live).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur + le repli de démo (le même compute pur du
 * twin que le moteur Go reproduit) sont purs ; une réponse malformée / non dispatchée / refusée
 * donne la métrique de démo. LE MUR (§2/§9) : la lentille MESURE + CLIQUETTE + PROPOSE ; propose
 * renvoie une enveloppe DRAFT, elle ne persiste PAS la vérité depuis l'écran — measure est une
 * lecture below-the-line.
 *
 * Le projet actif vient de la session V3 (le champ caché `projectId` du formulaire) ; le scope
 * du MUR côté passerelle vient de `panelScope()` (le cookie S57, server-side).
 */

// candidateCut porte la faute injectée : une NOUVELLE arête non contractée (violation de
// frontière) ou une NOUVELLE arête arrière (cycle inter-cellule). Chacune doit ROUGIR le cliquet
// structurel contre la base.
function candidateCut(projectId: string, scenario: string): DepGraph {
	const g = cleanCut(projectId);
	if (scenario === "violation") {
		g.edges.push({
			from: "checkout.price",
			fromCell: "checkout",
			to: "catalog.lookup",
			toCell: "catalog", // catalog n'a AUCUNE paire honorée → violation de frontière
		});
	} else if (scenario === "cycle") {
		g.edges.push({
			from: "billing.refund",
			fromCell: "billing",
			to: "checkout.cancel",
			toCell: "checkout", // billing→checkout ferme un cycle avec checkout→billing
		});
	}
	return g;
}

export async function measureAction(
	_prev: MeasureView,
	formData: FormData,
): Promise<MeasureView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const graph = cleanCut(projectId);
	const scope = await panelScope();
	// Lecture LIVE via la passerelle (l'outil arch-fitness `measure` dispatché) ; le twin
	// demoMeasure() est le repli déterministe (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"measure",
		{ graph: gatewayGraphArgs(graph) },
		metricDecoder,
		demoMeasure(projectId),
	);
	return { ok: true, metric: data, source };
}

export async function ratchetAction(
	_prev: RatchetView,
	formData: FormData,
): Promise<RatchetView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const base = measure(cleanCut(projectId));
	// le candidat est la coupe propre elle-même → TENU (le cliquet tient quand rien ne grimpe).
	return { ok: true, verdict: ratchet(base, base) };
}

export async function gateAction(
	_prev: GateView,
	formData: FormData,
): Promise<GateView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const scenario = String(formData.get("scenario") ?? "violation");
	const base = measure(cleanCut(projectId));
	const candidate = measure(candidateCut(projectId, scenario));
	return {
		ok: true,
		metric: candidate,
		verdict: ratchet(base, candidate),
		scenario,
	};
}

export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const g = cleanCut(projectId);
	const base = measure(g);
	const cs = propose(
		g,
		base,
		`structural baseline ${projectId || "shop"}`,
		"phase-0",
	);
	return { ok: true, changeset: cs };
}
