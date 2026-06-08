import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { RelationEmitterPanel } from "./RelationEmitterPanel";

export const metadata: Metadata = {
	title: "Émetteurs relation-aware (+ async + blob) — AIDOS Workbench",
	description:
		"EmitDDL/EmitTS/EmitWorker rendent un schéma MULTI-ENTITÉS (entités + relations S71 + async S73) vers les cibles de l'app émise (ADR 0040, TS/Hono). Un N-N émet une join table ; les FK du DDL référencent de vraies tables ; un nœud async émet un worker + une table outbox. Déterministe : même AST → sortie byte-identique (S74). LE MUR : émettre n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /relation-emitter — « émetteurs relation-aware (+ async + blob) » (S74, app-builder EPIC 6).
 * Les émetteurs cessent de plafonner les apps à une entité synchrone : EmitDDL/EmitTS/EmitWorker
 * rendent un schéma multi-entités — FK (1-1/1-N), JOIN TABLE (N-N), WORKER + OUTBOX (async) —
 * vers les cibles TS/Hono de l'app émise. Tout est déterministe : même AST → octets byte-identiques.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable depuis
 * l'écran (choisir une cible DDL/TS/Worker → émettre → voir le code rendu + l'adresse de contenu),
 * prouvé par l'e2e Playwright. THE WALL (§2) : émettre n'écrit AUCUNE vérité — les octets émis sont
 * une PROJECTION (S78 régénère). Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function RelationEmitterPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("relationEmitter");

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
					<RelationEmitterPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
