"use server";

import { cookies } from "next/headers";
import { readVia, type Source } from "../../../lib/gateway-sdk";
import { WORKBENCH_IDENTITY } from "../../../lib/panelScope";
import type { Scope } from "../../../lib/projectWall";
import { genesisProjectIdAction } from "../projects-actions";
import {
	dagDecoder,
	demoDag,
	demoIdeas,
	type InspectionView,
	ideasDecoder,
} from "./live";

/**
 * inspectionLive — la VUE D'INSPECTION du backlog gouverné (ADR 0073 Plan B). Lit la projection
 * truth-store du PROJET V3 ACTIF via la passerelle : `idea_list` (les idées capturées) + `dag_get`
 * (la topologie). Résout l'ANCRE content-adressée du projet (genesisProjectIdAction) depuis le
 * cookie V3 « aidos-v3-project » — la FK projet exige cet id, jamais le slug. Sans ancre (projet
 * pas encore en Postgres / DB injoignable) → projection démo VIDE honnête (source:"demo").
 *
 * LE MUR (§2) : lectures below-the-line — aucune écriture. La projection est une VUE d'inspection
 * (l'inverse gouverné, lossy) ; la reprise du projet reste le transcript (Plan A), pas cette vue.
 */
export async function inspectionLive(): Promise<InspectionView> {
	const slug = (await cookies()).get("aidos-v3-project")?.value ?? "";
	const projectId = slug ? await genesisProjectIdAction(slug) : null;
	if (!projectId) {
		return { ideas: demoIdeas, dag: demoDag, source: "demo", projectId: null };
	}
	const scope: Scope = {
		identity: WORKBENCH_IDENTITY,
		activeProject: projectId,
	};
	const ideasR = await readVia(
		scope,
		"idea_list",
		{ project_id: projectId },
		ideasDecoder,
		demoIdeas,
	);
	const dagR = await readVia(scope, "dag_get", {}, dagDecoder, demoDag);
	// Source HONNÊTE : live seulement si les DEUX lectures routent ; sinon la plus faible (demo).
	const source: Source =
		ideasR.source === "live" && dagR.source === "live" ? "live" : "demo";
	return { ideas: ideasR.data, dag: dagR.data, source, projectId };
}
