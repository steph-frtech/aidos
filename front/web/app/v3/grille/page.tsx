import { getTranslations } from "next-intl/server";
import { gridLive } from "./actions";
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
 * S59 CUTOVER (ADR 0092 — le moteur Go est l'UNIQUE source vivante). La donnée vient du MOTEUR Go
 * LIVE par la passerelle (`gridLive` → `readVia(scope, "grid_build", …)`, le serveur MCP `grid`
 * dispatché — grid.Build est autoritatif), lue ICI côté serveur et passée à la lentille. Le twin
 * lib/v2/grid (buildGrid, Σ comptées) reste UNIQUEMENT le repli démo déterministe (lib/v2/grid-data,
 * source:"live"|"demo"), byte-identique au calcul Go que le décodeur reconstruit. La §2 ne couvre que
 * les vraies logiques client — JAMAIS un calcul pur que le moteur fait : composer la grille EN était
 * un, donc un twin flippé (plus de mode client fantôme).
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule below-the-line — la grille est une projection ; geler une
 * vérité passe par idée → miroir → /goal → approbation, jamais une écriture depuis l'écran. Thémé
 * (tokens ADR 0010, 0 hex/zinc) ; bilingue (next-intl, FR par défaut, ADR 0011).
 */

export default async function V3GrilleScreen() {
	const t = await getTranslations("v3");
	const { grid, source } = await gridLive();

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
				grid={grid}
				source={source}
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
					sourceLive: t("grilleSourceLive"),
					sourceDemo: t("grilleSourceDemo"),
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
