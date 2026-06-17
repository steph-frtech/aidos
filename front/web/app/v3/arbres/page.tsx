import { getTranslations } from "next-intl/server";
import { ArbresClient } from "./ArbresClient";

/**
 * /v3/arbres — LA LENTILLE DES ARBRES (l'écran conceptuel KRD « Arbres » porté EN PROPRE
 * dans la session V3, parcours « Comprendre ») : l'ARBRE DE COMPOSITION des kernels
 * (§17 `composes`, §49 fractale). Le SHELL V3 (V3Nav + V3SessionProvider, app/v3/layout.tsx)
 * enveloppe automatiquement cette route ; on ne rend ICI que l'intro + la lentille.
 *
 * L'écran montre l'arbre fractal des kernels : produit → parcours → … → entité, chaque nœud
 * = un kernel à son niveau, dépliable/repliable (virtualisé, React Arborist), cliquable
 * (→ ses coordonnées + son anatomie). C'est la projection de la relation `composes`.
 *
 * MODE CLIENT (ADR 0092 §2, déterminisme-first §8) : il N'EXISTE PAS de serveur MCP
 * dispatché par la passerelle qui exposerait la relation `composes` d'un projet (le store
 * de kernels n'expose pas encore ses liens de composition — OpenQuestion documentée). La
 * LOGIQUE de l'arbre — la validation (aucun orphelin, aucun cycle), l'ordre canonique
 * (verticale §23 puis id), le calcul de profondeur — est un TWIN PUR AUTORITATIF
 * (lib/v2/kernel-tree.ts), couvert par son miroir de reproductibilité (fast-check)
 * lib/v2/kernel-tree.test.ts. On PORTE donc cette logique UX pure (légitime, ADR 0092 §2),
 * thémée V3, SANS ré-implémenter le Go ni inventer une lecture « live » fantôme : un
 * branchement live deviendra possible le jour où le store de kernels exposera ses composes.
 *
 * Le cliquet T5 (NO_TWIN_AS_LIVE_PATH) ne classe PAS lib/v2/kernel-tree comme un twin :
 * c'est un import PROFOND (`@/lib/v2/kernel-tree`), jamais un `@/lib/<x>` à un seul segment —
 * la lentille reste verte (lib/twin-as-live-fitness.test.ts L6).
 *
 * Le serveur ne porte que le titre + l'intro ; tout le contenu (l'arbre, le compteur, le
 * panneau de sélection) est projeté côté client (ArbresClient), avec les libellés résolus
 * ici et passés en `labels` (le motif de /v3/kernels — on n'élargit pas le bundle de session).
 * Themed (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (next-intl, FR par défaut, ADR 0011).
 *
 * LE MUR (CLAUDE.md §2) : l'écran PROJETTE une lecture (l'arbre est une projection) ; il
 * n'écrit AUCUNE vérité. Geler/recomposer un kernel passe par idée → miroir → /goal →
 * approbation, jamais une écriture depuis cette lentille.
 */
export default async function V3ArbresScreen() {
	const t = await getTranslations("v3");
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
				}}
			/>
		</div>
	);
}
