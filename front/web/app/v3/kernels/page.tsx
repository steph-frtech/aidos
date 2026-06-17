import { getTranslations } from "next-intl/server";
import type { KernelFacet } from "@/lib/v3/kernels-data";
import { loadKernelsAction } from "./actions";
import { KernelsClient } from "./KernelsClient";

/**
 * /v3/kernels — LA LENTILLE DES VÉRITÉS DU NOYAU (portée EN PROPRE dans le shell V3, groupe
 * « Concevoir » de la nav coordonnée — ADR 0060/0092). Le SHELL V3 (V3Nav + V3SessionProvider)
 * enveloppe automatiquement cette route ; on ne rend ICI que l'intro + la lentille.
 *
 * L'écran montre, EN DIRECT, les vérités du noyau adressées par contenu : chaque `kernel.truth` est
 * rangée par le hash de son corps (S02 — content-addressed, append-only), et lue par son hash via le
 * tool Go `store_get` (le serveur `store` dispatché). Chaque vérité porte sa facette, son énoncé, son
 * corps JSONB et un badge de source honnête (en direct / démo, ADR 0074).
 *
 * LECTURE LIVE DU MOTEUR, JAMAIS UN JUMEAU (ADR 0092) : la lecture passe par la passerelle
 * (`store_get` via le SDK S59, readVia) ; le décodeur (live.ts) + le jeu de vérités-démo
 * (lib/v3/kernels-data) sont purs et pinnés par leur miroir de parité, aucune logique du noyau
 * ré-implémentée. La vérité du noyau vit dans le schéma `kernel` de Postgres (autoritaire).
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — geler une nouvelle vérité passe par propose → ChangeSet →
 * /goal → approbation, jamais une écriture depuis l'écran (le contrôle « proposer » est visible mais
 * désactivé). Thémé (tokens ADR 0010, 0 hex/zinc) ; bilingue (next-intl, FR par défaut, ADR 0011).
 */

// Lit les vérités du noyau du projet actif à CHAQUE requête (lecture en direct via la
// passerelle) — jamais figé dans une page statique.
export const dynamic = "force-dynamic";

/** Les facettes du noyau, dans l'ordre canonique — pour mapper chaque clé i18n de facette. */
const FACETS: readonly KernelFacet[] = [
	"expr",
	"policy",
	"operation",
	"control",
	"action",
	"entity",
	"invariant",
	"budget",
];

/** facetKey mappe une facette à sa clé i18n (kernelsFacetExpr…). */
function facetKey(f: KernelFacet): string {
	return `kernelsFacet${f.charAt(0).toUpperCase()}${f.slice(1)}`;
}

export default async function V3KernelsScreen() {
	const t = await getTranslations("v3");
	const { rows, source } = await loadKernelsAction();
	const facet = Object.fromEntries(
		FACETS.map((f) => [f, t(facetKey(f))]),
	) as Record<KernelFacet, string>;

	return (
		<div
			data-testid="v3-kernels"
			className="mx-auto w-full max-w-5xl space-y-6"
		>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t("kernelsTitle")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("kernelsIntro")}
				</p>
			</div>
			<KernelsClient
				rows={rows}
				source={source}
				labels={{
					listHeading: t("kernelsListHeading"),
					listIntro: t("kernelsListIntro"),
					empty: t("kernelsEmpty"),
					bodyHeading: t("kernelsBodyHeading"),
					bodyIntro: t("kernelsBodyIntro"),
					bodyEmpty: t("kernelsBodyEmpty"),
					hashLabel: t("kernelsHashLabel"),
					facetLabel: t("kernelsFacetLabel"),
					select: t("kernelsSelect"),
					selected: t("kernelsSelected"),
					matchOk: t("kernelsMatchOk"),
					matchOff: t("kernelsMatchOff"),
					live: t("kernelsLive"),
					demo: t("kernelsDemo"),
					liveTitle: t("kernelsLiveTitle"),
					demoTitle: t("kernelsDemoTitle"),
					wallNote: t("kernelsWallNote"),
					proposeBtn: t("kernelsProposeBtn"),
					proposeHint: t("kernelsProposeHint"),
					facet,
				}}
			/>
		</div>
	);
}
