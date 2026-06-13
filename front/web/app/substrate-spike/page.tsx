import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { paletteCounts, SUBSTRATE_PALETTE } from "@/lib/substrate-palette";
import { SubstrateSpikePanel } from "./SubstrateSpikePanel";

export const metadata: Metadata = {
	title: "Spike palette substrat open-source-2026 — AIDOS Workbench",
	description:
		"DP14 : SPIKE-gate (ratchet OFF, T0) — valider PAR MESURE la palette substrat open-source-stack-2026 (12 services × verdict) AVANT de la graver en fragments StackManifest. Chaque verdict = une MESURE (boot + healthcheck vert + joignable), jamais un avis. Un service déjà conteneurisé sur l'hôte compte comme mesure go. LE MUR : le spike n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /substrate-spike — « SPIKE-gate palette substrat open-source-2026 » (DP14,
 * piste DP). READ-ONLY with respect to truth: the page renders the MATRICE the
 * throwaway probe MEASURED — 12 candidate substrate services (Postgres, Valkey,
 * PgBouncer, Windmill, NATS, OTel, SigNoz, GlitchTip, Forgejo, Plane, Better-Auth,
 * Docs) each carried with its MEASURED verdict (boot + healthcheck green + port
 * reachable docker_internal, or already-containerised-on-host = a `docker ps`
 * measure), its proof, its frozen-stack slot, and its compared alternative.
 *
 * HONNÊTETÉ (§8): a `no-go` reduces the subject, it does not guess it. Windmill
 * is `no-go` here for a registry-unavailability (ghcr.io refused in sandbox), NOT
 * a service defect — it stays the validated workflow engine of the slot (Temporal
 * is REFUSED, hard constraint). The matrice is sourced from the spike-graven
 * palette file (lib/substrate-palette), NEVER an opinion hardcoded in the UI.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict was produced by the boot/
 * healthcheck at the spike; this screen renders the graven DATA and re-counts it
 * with the PURE twin (paletteCounts) — it boots nothing (the boot already
 * happened). THE WALL (§2): /spike zone only, ratchet OFF, no kernel/mirrors/
 * fitness write. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011,
 * FR first).
 */
export default async function SubstrateSpikePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("substrateSpike");
	const counts = paletteCounts();

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
					<SubstrateSpikePanel
						activeProjectId={ctx.activeId}
						palette={SUBSTRATE_PALETTE}
						counts={counts}
					/>
				</div>
			</main>
		</div>
	);
}
