import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { DocMirrorPanel } from "./DocMirrorPanel";

export const metadata: Metadata = {
	title: "Le doc-miroir : comparaison structurelle s2↔s9 — AIDOS Workbench",
	description:
		"FK07 : la comparaison STRUCTURELLE ensembliste du doc écrit par l'humain (s2) contre le doc dérivé du code (s9) — concepts/behaviors/erreurs présents ou absents. Une divergence STRUCTURELLE bloque (rouge) ; la PROSE est advisory (le LLM signale, n'arbitre jamais). Le juge est un CALCUL. LE MUR : l'écran compare, il n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /doc-mirror — « le doc-miroir : comparaison structurelle s2↔s9 » (FK07, piste FKE).
 * La comparaison STRUCTURELLE ensembliste (KRD FKE-1.3 décision (a)) du doc écrit par l'humain
 * (s2, la moitié haute) contre le doc dérivé du code (s9, la moitié basse, FK06) : concepts,
 * behaviors et erreurs présents/absents. Une divergence STRUCTURELLE est BLOQUANTE ; la PROSE
 * est ADVISORY (le LLM signale, n'arbitre jamais — §8 « le juge est un calcul »). Le data-miroir
 * s3↔s7 est déclaré (même moteur structurel sur les ensembles entité/champ).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle COMPARER lié au moteur pur
 * lib/docmirror — choisir un scénario, exécuter la comparaison, voir le verdict + les
 * divergences structurelles (bloquantes) et les advisories de prose (non bloquantes). THE WALL
 * (§2) : l'écran n'écrit AUCUNE vérité — le rapport est une projection. Ne touche aucune route
 * existante. Thème ADR 0010, bilingue 0011.
 */
export default async function DocMirrorPage() {
	const t = await getTranslations("docMirror");

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

				<DocMirrorPanel />
			</main>
		</div>
	);
}
