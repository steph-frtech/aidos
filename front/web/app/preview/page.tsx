import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { PreviewPanel } from "./PreviewPanel";

export const metadata: Metadata = {
	title: "Preview éphémère — AIDOS Workbench",
	description:
		"S94 : environnement de preview éphémère par app — démarre serveur+datastore+UI émis de la phase stable active à une URL de preview, keyée sur une phase content-adressée, démontée déterministiquement, via `pulumi up` du programme émis (ADR 0043 / DP25). Le serveur est un process Hono Node/Bun/edge, pas un binaire Go (ADR 0040). Done-criterion : le hash de l'app servie égale le hash émis de la phase ; cliquer un bouton émis exécute l'operation liée contre le datastore. LE MUR : planifier n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /preview — « environnement de preview éphémère par app » (S94, app-builder EPIC 10,
 * ADR 0043 / DP25). Pour la phase stable active (content-adressée), preview calcule un
 * PreviewPlan DÉTERMINISTE : une URL de preview keyée sur la phase, le `pulumi up` qui démarre
 * l'app émise (un process Hono Node/Bun/edge — ADR 0040, JAMAIS un binaire Go), le
 * `pulumi destroy` qui la démonte déterministiquement, et le hash de l'app émise de la phase.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : TROIS surfaces exécutables depuis l'écran —
 * (1) CONSTRUIRE le plan de preview (URL + boot + teardown + hash, content-adressé) ;
 * (2) PROBE le done-criterion (le hash servi == le hash émis, jugé par le CODE) ;
 * (3) SOUMETTRE le formulaire servi par le preview (texte + checkbox + upload de fichier)
 * contre le datastore — un bouton émis exécute l'operation liée (upload blob inclus). THE WALL
 * (§2) : planifier n'écrit AUCUNE vérité — le preview est un environnement éphémère sur une
 * surface déjà émise ; la soumission écrit dans un datastore sous la ligne (jamais le kernel).
 * Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function PreviewPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("preview");

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
					<PreviewPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
