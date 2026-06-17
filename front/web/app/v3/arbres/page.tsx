import { getTranslations } from "next-intl/server";
import { ArbresClient } from "./ArbresClient";
import { arbresSnapshot } from "./actions";

/**
 * /v3/arbres — LA LENTILLE DES ARBRES (l'écran conceptuel KRD « Arbres » porté EN PROPRE dans la
 * session V3, parcours « Comprendre ») : l'ARBRE DE COMPOSITION des kernels (§17 `composes`, §49
 * fractale) ET le VERDICT §109 de vérité compositionnelle récursive. Le SHELL V3 (V3Nav +
 * V3SessionProvider, app/v3/layout.tsx) enveloppe automatiquement cette route ; on ne rend ICI que
 * l'intro + la lentille.
 *
 * L'écran montre l'arbre fractal des kernels : produit → parcours → … → entité, chaque nœud = un
 * kernel à son niveau, dépliable/repliable (virtualisé, React Arborist), cliquable (→ ses
 * coordonnées + son anatomie), COLORÉ par son voyant agrégé (§109), avec le DRILL-DOWN §110 (la
 * chaîne jusqu'à l'enfant rouge) et la légende des deux poids d'arête (§112).
 *
 * S59 CUTOVER (ADR 0092 — le moteur Go est l'UNIQUE source vivante). Le VERDICT §109 + le
 * drill-down §110 sont LUS LIVE depuis le serveur MCP Go `kernel-tree` (`tree_aggregate`) par la
 * passerelle (Server Action `arbresSnapshot` → `readVia`), avec le twin `lib/v2/kernel-tree`
 * préservé UNIQUEMENT comme repli-démo déterministe (badge source "live"|"demo", jamais « twin
 * pur »). La STRUCTURE de l'arbre (libellés, niveaux, facettes, profondeurs) est composée côté
 * serveur par le calcul pur (repli démo) — sa logique UX reste légitime — tandis que le JUGEMENT (le verdict
 * récursif) est délégué au moteur Go. L'import-valeur du twin vit dans actions.ts, derrière la
 * frontière readVia : le composant client ne pulle AUCUNE logique twin (cliquet T5 vert).
 *
 * DÉTERMINISME-FIRST (§6/§8) : la donnée est figée (même entrée → même arbre, même verdict) ; un
 * payload malformé/non-dispatché retombe sur le verdict-démo (la même loi pure reproduite). Themed
 * (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (next-intl, FR par défaut, ADR 0011).
 *
 * LE MUR (CLAUDE.md §2) : l'écran PROJETTE une lecture (l'arbre + le verdict sont des projections) ;
 * il n'écrit AUCUNE vérité. Geler/recomposer un kernel passe par idée → miroir → /goal →
 * approbation, jamais une écriture depuis cette lentille.
 */
export default async function V3ArbresScreen() {
	const t = await getTranslations("v3");
	// 240 kernels synthétiques pour PROUVER la virtualisation (200+ nœuds) sans dégrader le rendu ;
	// la projection réelle arrivera quand le store de kernels exposera ses composes (OpenQuestion).
	const snapshot = await arbresSnapshot();
	return (
		<div data-testid="v3-arbres" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("arbresTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("arbresIntro")}
				</p>
			</div>
			<ArbresClient
				snapshot={snapshot}
				labels={{
					treeHeading: t("arbresTreeHeading"),
					treeIntro: t("arbresTreeIntro"),
					nodeCount: t("arbresNodeCount"),
					empty: t("arbresEmpty"),
					expand: t("arbresExpand"),
					collapse: t("arbresCollapse"),
					selectedHeading: t("arbresSelectedHeading"),
					selectHint: t("arbresSelectHint"),
					levelLabel: t("arbresLevelLabel"),
					facetLabel: t("arbresFacetLabel"),
					depthLabel: t("arbresDepthLabel"),
					openAnatomy: t("arbresOpenAnatomy"),
					wallNote: t("arbresWallNote"),
					verdictHeading: t("arbresVerdictHeading"),
					verdictGreen: t("arbresVerdictGreen"),
					verdictRed: t("arbresVerdictRed"),
					drillDownHint: t("arbresDrillDownHint"),
					cycleRefused: t("arbresCycleRefused"),
					weightsLegend: t("arbresWeightsLegend"),
					sourceLive: t("arbresSourceLive"),
					sourceDemo: t("arbresSourceDemo"),
				}}
			/>
		</div>
	);
}
