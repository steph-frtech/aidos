import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { RealityIngestPanel } from "./RealityIngestPanel";

export const metadata: Metadata = {
	title:
		"Boucle de réalité — divergence télémétrie → RealityMirror → idée draft (AIDOS Workbench)",
	description:
		"S106 (E12) : la production de l'app émise émet de l'OpenTelemetry vers le telemetry-reader ; une divergence/incident (ex. 30 % de createOrder échouent sur rupture de stock) devient un record RealityMirror project-scopé (provenance=incident) → une idée draft. La rédaction du texte de l'idée est une PROJECTION DÉTERMINISTE (template sur le record de divergence), jamais un résumé LLM ; la détection de divergence est une comparaison déterministe. LE MUR : la réalité n'écrit JAMAIS de vérité directement — la seule porte est idée → miroir → /goal → approbation.",
};

export const dynamic = "force-dynamic";

/**
 * /reality-ingest — « boucle de réalité » (S106, app-builder EPIC 12 / E12). La production de
 * l'app DÉPLOYÉE devient un SENSEUR : son OpenTelemetry, lu par le telemetry-reader, est comparé
 * (déterministe) à la promesse d'un miroir ; une divergence devient un RealityMirror project-scopé
 * (provenance=incident) → une idée draft dont le texte est une PROJECTION TEMPLATE déterministe.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : UN contrôle lié au moteur réel, avec un toggle
 * exécutable depuis l'écran — (1) ingérer la divergence out-of-stock (createOrder échoue 30 %) →
 * un RealityMirror + une idée draft (provenance=incident, texte template) ; (2) toggle « healthy »
 * → un rapport dans la promesse → AUCUNE idée (la réalité n'invente pas de vérité). Prouvé par
 * l'e2e Playwright. THE WALL (§2) : la réalité n'écrit AUCUNE vérité — le draft est une valeur
 * (wroteKernel=false ; l'arête directe Reality→Kernel est toujours refusée). Ne touche aucune
 * route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function RealityIngestPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("realityIngest");

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
					<RealityIngestPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
