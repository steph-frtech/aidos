import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BehaviorsPanel } from "./BehaviorsPanel";

export const metadata: Metadata = {
	title: "Librairie behaviors — AIDOS Workbench",
	description:
		"La librairie behaviors user-facing, project-scopée (S79) : browse / search (match déterministe type-rg, JAMAIS un LLM) / tag / attach / soft-delete / publish / comment. Attacher prévisualise l'expansion (ses policies+fixtures scopées) en appelant l'UNIQUE Expand de S76 et l'atterrit via un ChangeSet APPROUVÉ — jamais une écriture directe du kernel (le mur).",
};

export const dynamic = "force-dynamic";

/**
 * /behaviors — « Librairie behaviors user-facing, CONSOMME l'Expand de S76 » (S79, app-builder EPIC
 * 7). La librairie project-scopée des behaviours réutilisables : browse / search / tag / attach /
 * soft-delete / publish / comment. Attacher PRÉVISUALISE l'expansion (policies+fixtures scopées) en
 * appelant l'UNIQUE Expand/Propose de S76 (jamais une seconde expansion — la loi de la fonction
 * unique, §24.6) et l'ATTERRIT via un ChangeSet APPROUVÉ.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : SEARCH (match déterministe, jamais un LLM) et
 * ATTACH (preview + land) sont liés au moteur réel et exécutables depuis l'écran. Prouvés par l'e2e
 * Playwright. THE WALL (§2) : la recherche est lecture seule ; attacher atterrit une VALEUR de
 * ChangeSet APPLIQUÉ — la porte légale (propose → approve), jamais une écriture directe du kernel. Ne
 * touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function BehaviorsPage() {
	const t = await getTranslations("behaviors");

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
					<BehaviorsPanel />
				</div>
			</main>
		</div>
	);
}
