import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RedWavePanel } from "@/components/RedWavePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import type { Layer } from "@/lib/red-wave";

// Determinism-first: the red wave is a pure projection in lib/red-wave.ts (mirroring
// back/runtime/redwave), covered by lib/red-wave.test.ts (fast-check). This Server Component
// renders the intro + tutorial + example; the action-capable panel runs the same pure `impact` the
// Go redwave.Impact / `aidos impact` emit — no I/O, no clock, no rng — so the ordered wave shown is
// computed exactly as Go Impact computes it. READ-ONLY (the wall): the screen projects the wave; the
// real enqueue is the harness-invoked PostKernelChange hook below the waterline, never a write here.

export const metadata: Metadata = {
	title: "Vague de rouge — AIDOS Workbench",
	description:
		"Panneau en lecture seule de la vague de rouge d'AIDOS (KRD §42/§98) : après un bump de noyau, la vague EST exactement l'ensemble des liens périmés — calculée, jamais traquée. Elle PART du miroir puis cascade vers les projections (api/db/types/operation/action/button), et se déverse dans la RedWorkQueue. Un changement d'entité rougit api/db/types ; un changement de bouton rougit sa vue ssi le bouton est load-bearing.",
};

/**
 * /red-wave — the red-wave panel (S22). It renders the KRD §42 impact engine: pick one of the
 * canonical bumps (Order entity / load-bearing submit-btn / cosmetic label-btn) and FIRE the wave
 * (the action), then read the RedWorkItems ordered mirror-first, grouped by layer, each red with its
 * reason + status (open). The done criteria, executable from the screen: an Order bump reddens
 * Order.schema.fixture (mirror) FIRST then api/db/types; a load-bearing submit-btn bump reddens
 * checkout-view; a cosmetic label-btn bump shows NO view item (empty wave).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the wave is computed + projected; the real
 * enqueue is the PostKernelChange hook. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function RedWavePage() {
	const t = await getTranslations("redWave");

	const layerNames: Record<Layer, string> = {
		mirror: t("layerMirror"),
		projection: t("layerProjection"),
		operation_action: t("layerOperationAction"),
		button: t("layerButton"),
	};

	const labels = {
		pickLabel: t("pickLabel"),
		fireLabel: t("fireLabel"),
		waveIdLabel: t("waveIdLabel"),
		emptyWave: t("emptyWave"),
		awaiting: t("awaiting"),
		orderLabel: t("orderLabel"),
		statusOpen: t("statusOpen"),
		reasonVersionStale: t("reasonVersionStale"),
		deps: t("deps"),
		bumpNames: {
			bumpEntity: t("bumpEntity"),
			bumpLoadBearing: t("bumpLoadBearing"),
			bumpCosmetic: t("bumpCosmetic"),
		},
		layerNames,
	};

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
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Tutorial — how to read the screen */}
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
					<RedWavePanel labels={labels} />
				</div>

				{/* Worked example */}
				<section
					aria-label={t("exampleHeading")}
					data-testid="example"
					className="mt-10 space-y-2 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("exampleHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("exampleBody")}
					</p>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
