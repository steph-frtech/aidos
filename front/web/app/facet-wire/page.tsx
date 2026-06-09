import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { FacetWirePanel } from "./FacetWirePanel";

export const metadata: Metadata = {
	title: "Câbler les facettes S/R/V/M/X — AIDOS Workbench",
	description:
		"FK08 : réaliser les 6 paires de chaque facette non-fonctionnelle — Sécurité, Fiabilité, Évolutivité, Maintenabilité, Expérience — comme des colonnes parallèles du même squelette 6-paires, chacune réutilisant un senseur existant. Casser une paire rougit la bonne colonne ; X reste advisory (informe, ne bloque pas). Le juge est un CALCUL. LE MUR : l'écran câble, il n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /facet-wire — « câbler les facettes S/R/V/M/X » (FK08, piste FKE).
 * Les cinq facettes non-fonctionnelles (Sécurité, Fiabilité, Évolutivité, Maintenabilité,
 * Expérience) câblées comme des COLONNES PARALLÈLES du même squelette 6-paires (KRD FKE-1.3),
 * chacune réutilisant un senseur existant. Le juge est la même comparaison STRUCTURELLE
 * ensembliste que le doc-miroir (§8) : une paire déclarée-non-prouvée rougit sa colonne. Les
 * facettes sont ORTHOGONALES — casser une paire rougit SA colonne et aucune autre. X est SOFT
 * (§13.6) : ses divergences informent, ne cliquettent jamais dur.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle CÂBLER lié au moteur pur
 * lib/facetwire — choisir un scénario, exécuter le juge, voir le verdict par colonne + le
 * verdict global, plus la preuve de déterminisme. THE WALL (§2) : l'écran n'écrit AUCUNE
 * vérité — le rapport est une projection. Ne touche aucune route existante. Thème ADR 0010,
 * bilingue 0011.
 */
export default async function FacetWirePage() {
	const t = await getTranslations("facetWire");

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

				<FacetWirePanel />
			</main>
		</div>
	);
}
