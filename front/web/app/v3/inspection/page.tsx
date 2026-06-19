import { getTranslations } from "next-intl/server";
import { inspectionLive } from "./actions";
import { InspectionClient } from "./InspectionClient";

/**
 * /v3/inspection — LA VUE D'INSPECTION DU BACKLOG GOUVERNÉ (ADR 0073 Plan B), portée EN PROPRE dans
 * le shell V3 (parcours « Comprendre »). Le SHELL V3 (V3Nav + V3SessionProvider, via app/v3/layout)
 * enveloppe la route ; on ne rend ICI que l'intro + la lentille.
 *
 * L'écran montre la PROJECTION TRUTH-STORE du projet actif : les idées capturées (`idea_list`) + la
 * topologie du DAG (`dag_get`), lues LIVE par la passerelle (ADR 0092) côté serveur, avec un repli
 * démo honnête. C'est l'INVERSE GOUVERNÉ d'ADR 0073 (Plan B) — une vue STRUCTURELLE d'inspection en
 * LECTURE SEULE : la conversation et la reprise du projet vivent dans le TRANSCRIPT (Plan A, le
 * porteur de fidélité), jamais dans cette vue lossy.
 *
 * LE MUR (CLAUDE.md §2) : lectures below-the-line — aucune écriture. Thémé (tokens ADR 0010) ;
 * bilingue (next-intl, FR par défaut, ADR 0011).
 */
export default async function V3InspectionScreen() {
	const t = await getTranslations("v3");
	const view = await inspectionLive();

	return (
		<div
			data-testid="v3-inspection"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("inspectionTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("inspectionIntro")}
				</p>
			</div>
			<InspectionClient
				view={view}
				labels={{
					ideasHeading: t("inspectionIdeasHeading"),
					dagHeading: t("inspectionDagHeading"),
					emptyIdeas: t("inspectionEmptyIdeas"),
					dagNodes: t("inspectionDagNodes"),
					dagEdges: t("inspectionDagEdges"),
					dagHeads: t("inspectionDagHeads"),
					sourceLabel: t("inspectionSourceLabel"),
					sourceLive: t("inspectionSourceLive"),
					sourceDemo: t("inspectionSourceDemo"),
					sourceTitle: t("inspectionSourceTitle"),
					honestNote: t("inspectionHonestNote"),
					wallNote: t("inspectionWallNote"),
					colProposes: t("inspectionColProposes"),
					colIntent: t("inspectionColIntent"),
					colStatus: t("inspectionColStatus"),
				}}
			/>
		</div>
	);
}
