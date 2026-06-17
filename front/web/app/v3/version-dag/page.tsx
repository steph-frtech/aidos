import { getTranslations } from "next-intl/server";
import { liveGraph, liveHeads } from "./actions";
import { VersionDagLens } from "./VersionDagLens";

/**
 * /v3/version-dag — LA LENTILLE DAG DE VERSIONS (portée EN PROPRE dans le shell V3,
 * groupe « Comprendre » de la nav coordonnée — ADR 0060/0092). Le SHELL V3 (V3Nav +
 * V3SessionProvider) enveloppe automatiquement cette route ; on ne rend ICI que l'intro +
 * la lentille.
 *
 * L'écran montre, EN DIRECT, l'espace des versions du projet actif : les têtes courantes
 * (dag_heads) et le DAG entier — nœuds, arêtes (ChangeSets), stratifiés par la ligne de
 * flottaison (§124, vérité humaine au-dessus / variantes évolutives en dessous), les têtes
 * surlignées, les nœuds hors-tête estompés (l'ajout-seul rendu visible). Chaque bloc porte un
 * badge de source honnête (en direct / démo, ADR 0074).
 *
 * LECTURE LIVE DU MOTEUR, JAMAIS UN JUMEAU (ADR 0092) : les deux lectures passent par la
 * passerelle (`dag_get` / `dag_heads`, le serveur dag dispatché) via le SDK S59 ; le décodeur
 * + le graphe de démo sont RÉUTILISÉS depuis le module pur `app/version-dag/live.ts` (prouvé
 * par son miroir de parité), aucune logique Go ré-implémentée. La vérité de l'espace des
 * versions vit dans `back/archive/dag` (autoritaire).
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — enregistrer un nœud/une arête passe par le rôle
 * `aidos` via le MCP dag, jamais une écriture depuis l'écran. Thémé (tokens ADR 0010, 0
 * hex/zinc) ; bilingue (next-intl, FR par défaut, ADR 0011).
 */

// Lit l'espace des versions du projet actif à CHAQUE requête (lecture en direct via la
// passerelle) — jamais figé dans une page statique.
export const dynamic = "force-dynamic";

export default async function V3VersionDagScreen() {
	const t = await getTranslations("v3");
	const heads = await liveHeads();
	const graph = await liveGraph();

	return (
		<div
			data-testid="v3-version-dag"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("versionDagTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("versionDagIntro")}
				</p>
			</div>
			<VersionDagLens
				heads={heads}
				graph={graph}
				labels={{
					headsHeading: t("versionDagHeadsHeading"),
					headsIntro: t("versionDagHeadsIntro"),
					headsEmpty: t("versionDagHeadsEmpty"),
					graphHeading: t("versionDagGraphHeading"),
					graphIntro: t("versionDagGraphIntro"),
					graphEmpty: t("versionDagGraphEmpty"),
					aboveBand: t("versionDagAboveBand"),
					belowBand: t("versionDagBelowBand"),
					headBadge: t("versionDagHeadBadge"),
					edgesHeading: t("versionDagEdgesHeading"),
					live: t("versionDagLive"),
					demo: t("versionDagDemo"),
					liveHeadsTitle: t("versionDagLiveHeadsTitle"),
					demoHeadsTitle: t("versionDagDemoHeadsTitle"),
					liveGraphTitle: t("versionDagLiveGraphTitle"),
					demoGraphTitle: t("versionDagDemoGraphTitle"),
				}}
			/>
		</div>
	);
}
