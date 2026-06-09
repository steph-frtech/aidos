import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { mappingTable } from "./actions";
import { ProofTypePanel } from "./ProofTypePanel";

export const metadata: Metadata = {
	title:
		"L'expand E0-E7 (le mapping N→E + les types de preuve) — AIDOS Workbench",
	description:
		"FK05 : la table N0-N5 → E0-E7 déclarée comme fonction pure + le double-étiquetage additif + les types de preuve ajoutés E4 (sécurité : gosec/gitleaks/evals-injection), E6 (runtime + rollback) et E7 (formel). C'est l'étape EXPAND de la migration E0-E7 (FKE-16) : elle ajoute l'étiquetage E À CÔTÉ des niveaux N, sans modifier aucun miroir N existant. E4 ne s'atteint que par la facette S, E6 par R/V, E7 par le bouchon formel. LE MUR : l'écran dérive le contrat, il n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /proof-type — « l'expand E0-E7 » (FK05, piste FKE).
 * La table N0-N5 → E0-E7 (KRD FKE-16) déclarée comme fonction PURE + le double-étiquetage
 * additif (le N préservé, le E dérivé à côté — « zéro miroir N existant modifié ») + les types
 * de preuve AJOUTÉS E4 (sécurité), E6 (runtime + rollback), E7 (formel). C'est l'étape EXPAND,
 * compatible avec le build en cours ; la bascule du schéma est FK16.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle ÉTIQUETER LE KERNEL lié au
 * moteur pur lib/prooftype — choisir un niveau N + les facettes + le bouchon formel, exécuter le
 * mapping, voir le contrat E-typé apparaître. THE WALL (§2) : l'écran n'écrit AUCUNE vérité — il
 * dérive le contrat. Ne touche aucune route existante. Thème ADR 0010, bilingue 0011.
 */
export default async function ProofTypePage() {
	const t = await getTranslations("proofType");
	const mapping = await mappingTable();

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							{t("title")}
						</h1>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("subtitle")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<section
					aria-label={t("tutorialHeading")}
					data-testid="tutorial"
					className="mt-10 space-y-2 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("tutorialBody")}
					</p>
				</section>

				<div className="mt-10">
					<ProofTypePanel mapping={mapping} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
