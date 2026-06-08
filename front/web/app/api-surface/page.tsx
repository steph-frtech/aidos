import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { ApiSurfacePanel } from "./ApiSurfacePanel";

export const metadata: Metadata = {
	title: "Surface API émise — AIDOS Workbench",
	description:
		"S90 : émission déterministe de la surface API complète de l'app émise — routage CRUD + operation (sync), OpenAPI per-app byte-stable, UN contrat Pact par operation (généralisant createOrder.pact.json), avec provider-verification. Les handlers Hono/TS délèguent à l'interpréteur Operation-DSL via callback au service-interpréteur Go sidecar (ADR 0040 Déc.7) ; policies enforced (un DENY → HTTP 403). Déterministe : la surface est une projection. LE MUR : émettre n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /api-surface — « surface API émise complète » (S90, app-builder EPIC 9, ADR 0040).
 * L'émetteur PROJETTE la surface API de l'app émise : le routage CRUD + operation (sync),
 * l'OpenAPI 3.1 per-app (byte-stable), et UN contrat Pact par operation (généralisant le
 * seul createOrder.pact.json), avec provider-verification sur TOUS les endpoints. Les
 * handlers Hono/TS délèguent à l'interpréteur Operation-DSL via un CALLBACK au service-
 * interpréteur Go sidecar (ADR 0040 Déc.7) ; la policy est enforced (un DENY → HTTP 403).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur d'émission
 * PUR, exécutable depuis l'écran (basculer la policy + l'endpoint de lecture → émettre +
 * vérifier → voir l'OpenAPI, le router, la suite Pact et le verdict de provider-verification,
 * OU le BlockReason). THE WALL (§2) : émettre n'écrit AUCUNE vérité — la surface est une
 * projection. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function ApiSurfacePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("apiSurface");

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
					<ApiSurfacePanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
