import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { HonoEmitterPanel } from "./HonoEmitterPanel";

export const metadata: Metadata = {
	title: "Scaffold serveur Hono/TS + émetteur Pulumi — AIDOS Workbench",
	description:
		"S87 : émetteur déterministe produisant un service Hono/TS bootable par projet (main+router+middleware+/healthz+handlers d'operation sync ET async/workers S73) câblé sur TOUTES les operations du Kernel ; + le target TargetPulumiProgram (StackManifest → programme Pulumi/TS, ADR 0043). Même Kernel → scaffold byte-identique qui compile ; le programme Pulumi est FN02-pur. LE MUR : émettre n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /hono-emitter — « scaffold serveur de l'app émise (Hono/TS) + émetteur IaC Pulumi » (S87,
 * app-builder EPIC 9). L'app émise cesse d'être un modèle sans serveur : EmitServer rend un
 * service Hono/TS BOOTABLE (main+router+middleware+/healthz+un handler par operation SYNC,
 * délégant au callback de l'interpréteur Go) ; EmitWorker rend le worker async (S73/S74) ;
 * EmitPulumiProgram rend le programme Pulumi/TS de l'infra (ADR 0043, un docker.Container par
 * service sur le réseau Traefik partagé). Tout est déterministe : même Kernel → octets identiques.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : DEUX contrôles liés au moteur, exécutables
 * depuis l'écran (émettre le serveur/worker ; émettre le programme Pulumi → voir le code rendu
 * + son adresse de contenu), prouvés par l'e2e Playwright. THE WALL (§2) : émettre n'écrit
 * AUCUNE vérité — les octets émis sont une PROJECTION (S78 régénère). Ne touche aucune route
 * existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function HonoEmitterPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("honoEmitter");

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
					<HonoEmitterPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
