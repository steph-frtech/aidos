import { getTranslations } from "next-intl/server";
import { CellulesClient } from "./CellulesClient";

/**
 * WB2-09 — /v2/cellules : LES CELLULES (bounded contexts, KRD §49) + Pact. Une grosse app n'est
 * jamais un seul Kernel indivis : c'est une FÉDÉRATION délibérée de petites cellules (features =
 * kernels grossiers). Par cellule : sa GRILLE niveau × facette (rollup Σ — réutilise WB2-05), ses
 * LIENS INTERNES `composes ↓` (la verticale dedans), et ses CONTRATS `depends_on`/Pact → vers les
 * autres cellules. Cliquer une cellule descend (drill-down) ; cliquer une case ouvre ses specs.
 *
 * ACTION-CAPABLE (ui-completeness) : choisir une cellule (clic) descend vers sa grille + ses liens +
 * ses contrats ; cliquer une case (niveau, facette) ouvre SES specs (→ anatomie de chaque kernel).
 * Themed + bilingue (FR d'abord, ADR 0010/0011, namespace v2Cellules). Le mur intact : projection de
 * lecture, aucune écriture-vérité — la promotion d'un contrat reste idée → miroir → /goal.
 */
export default async function V2CellulesPage() {
	const t = await getTranslations("v2Cellules");

	const strings: Record<string, string> = {
		cells: t("cells"),
		kernels: t("kernels"),
		contracts: t("contracts"),
		total: t("total"),
		selectCell: t("selectCell"),
		federationHeading: t("federationHeading"),
		cellHeading: t("cellHeading"),
		gridHeading: t("gridHeading"),
		internalHeading: t("internalHeading"),
		contractsHeading: t("contractsHeading"),
		noInternal: t("noInternal"),
		noContracts: t("noContracts"),
		specsHere: t("specsHere"),
		emptyCell: t("emptyCell"),
		levelAxis: t("levelAxis"),
		facetAxis: t("facetAxis"),
		contractOut: t("contractOut"),
		contractIn: t("contractIn"),
		openSpecs: t("openSpecs"),
	};

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6">
			<section className="space-y-3">
				<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</p>
				<h1
					data-testid="v2-cellules-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-cellules-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<CellulesClient t={strings} />
		</div>
	);
}
