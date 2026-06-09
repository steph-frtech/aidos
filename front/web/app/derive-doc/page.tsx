import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { DeriveDocPanel } from "./DeriveDocPanel";

export const metadata: Metadata = {
	title:
		"La dérivation déterministe de s9 (le doc dérivé du code) — AIDOS Workbench",
	description:
		"FK06 : l'émetteur pur DeriveDoc(kernel) → s9 depuis les ASTs (operations, controls, routes, noms de tests, erreurs) — la moitié basse du doc-miroir, structurée pour la comparaison structurelle que FK07 fera contre s2. MÊME KERNEL → s9 BYTE-IDENTIQUE (le doc est un calcul, pas un LLM). LE MUR : l'écran dérive le doc, il n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /derive-doc — « la dérivation déterministe de s9 » (FK06, piste FKE).
 * L'émetteur pur DeriveDoc(kernel) → s9 (KRD FKE-1.3 décision (a)) : depuis les ASTs (operations,
 * controls, routes/bindings, noms de tests, erreurs), il dérive la MOITIÉ BASSE du doc-miroir,
 * structurée (concepts du lexique, behaviors, erreurs) pour la comparaison structurelle que FK07
 * fera contre s2 (la moitié haute, écrite par l'humain).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle DÉRIVER S9 lié au moteur pur
 * lib/derivedoc — choisir un kernel, exécuter l'émetteur, voir le s9 structuré + ses octets
 * canoniques + la preuve de byte-identité (exécuté deux fois → identique). THE WALL (§2) :
 * l'écran n'écrit AUCUNE vérité — s9 est une projection régénérable. Ne touche aucune route
 * existante. Thème ADR 0010, bilingue 0011.
 */
export default async function DeriveDocPage() {
	const t = await getTranslations("deriveDoc");

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

				<DeriveDocPanel />
			</main>
		</div>
	);
}
