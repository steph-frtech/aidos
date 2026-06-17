import { getTranslations } from "next-intl/server";
import { GrilleClient } from "./GrilleClient";

/**
 * /v3/grille — LA LENTILLE DE LA GRILLE niveau × facette (portée EN PROPRE dans le shell V3, groupe
 * « Comprendre » de la nav coordonnée — ADR 0060). Le SHELL V3 (V3Nav + V3SessionProvider) enveloppe
 * automatiquement cette route ; on ne rend ICI que l'intro + la lentille.
 *
 * L'écran montre les DEUX AXES de toute vérité (FKE-1.4) : son NIVEAU (la verticale couplante §23) et
 * sa FACETTE (l'axe orthogonal F·I·S·B·R·V·M·X, FKE-1.3). La matrice 7×8 compte les kernels par
 * cellule ; les sommes Σ par ligne / par colonne / au total sont COHÉRENTES (Σ = total). Sélectionner
 * une cellule (niveau, facette) descend vers SES kernels/specs.
 *
 * MODE CLIENT (ADR 0092 §2, déterminisme-first §8) : il n'existe PAS de serveur MCP « grille »
 * dispatché par la passerelle ; la donnée vient du TWIN PUR AUTORITATIF lib/v2/grid (buildGrid, Σ
 * comptées), byte-identique au Go back/kernel et couvert par son miroir lib/v2/grid.test.ts. On PORTE
 * donc cette logique UX pure (légitime, ADR 0092 §2), thémée V3, SANS ré-implémenter le Go ni inventer
 * une lecture « live » fantôme — un branchement live arrivera quand le store exposera les coordonnées
 * de chaque kernel (OpenQuestion). La relation des kernels est ici synthétique (240, partagés avec
 * l'arbre /v2/kernels).
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — la grille est une projection ; geler une vérité passe par
 * idée → miroir → /goal → approbation, jamais une écriture depuis l'écran. Thémé (tokens ADR 0010,
 * 0 hex/zinc) ; bilingue (next-intl, FR par défaut, ADR 0011).
 */

export default async function V3GrilleScreen() {
	const t = await getTranslations("v3");

	return (
		<div data-testid="v3-grille" className="mx-auto w-full max-w-5xl space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("grilleTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("grilleIntro")}
				</p>
			</div>
			<GrilleClient
				labels={{
					total: t("grilleTotal"),
					levelAxis: t("grilleLevelAxis"),
					facetAxis: t("grilleFacetAxis"),
					specsHere: t("grilleSpecsHere"),
					emptyCell: t("grilleEmptyCell"),
					cellHeading: t("grilleCellHeading"),
					cellHint: t("grilleCellHint"),
					noSelection: t("grilleNoSelection"),
					sourceLabel: t("grilleSourceLabel"),
					sourceTwin: t("grilleSourceTwin"),
					sourceTitle: t("grilleSourceTitle"),
					wallNote: t("grilleWallNote"),
				}}
			/>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{t("grilleFooter")}
			</p>
		</div>
	);
}
