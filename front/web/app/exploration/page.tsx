import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExplorationPanel } from "@/components/ExplorationPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the three §75 gestures + the spike-confinement / harvest verdicts are pure
// projections in lib/exploration.ts (the twin of back/runtime/exploration), covered by
// lib/exploration.test.ts (fast-check). This Server Component renders the intro + tutorial + example;
// the action-capable panel runs the SAME pure routeVerdict/checkSpikeWrite/harvest the Go engine runs
// — no I/O, no clock, no rng — so the verdicts on screen match the engine. READ-ONLY (the wall):
// recording a transition rides the idea-intake MCP (ideas schema, above the wall); promotion of a
// DRAFT Truth writes the kernel via /goal under the aidos writer role.

export const metadata: Metadata = {
	title: "Exploration — Grill & Spike Lab (AIDOS Workbench)",
	description:
		"Le laboratoire d'exploration d'AIDOS (KRD §75/§84/§118/§132) : les trois gestes /grill, /spike, /harvest sur le cycle de vie d'une Idea. /grill challenge l'intention AU-DESSUS du mur et la route sur un verdict clos (sharp → grilled, saute le spike ; fuzzy → spiking, la branche floue ; bad → rejected, tracée). /spike est la zone cliquet OFF, T0, JETABLE dont les écritures sont confinées à /spike (une écriture qui s'échappe ⇒ SPIKE_WRITE_ESCAPES_ZONE). /harvest extrait l'intention découverte et PROPOSE une DRAFT Truth — un delta-noyau candidat SANS version gelée ni miroir (le gel est un /goal ultérieur séparé ; une écriture directe du noyau par harvest ⇒ HARVEST_CANNOT_FREEZE). Lecture seule (le mur).",
};

/**
 * /exploration — the "Grill & Spike Lab" (S28). It renders an Idea travelling the lifecycle (draft →
 * grilled → spiking → harvested, with rejected as a traced off-ramp), the ratchet-OFF / T0 badge on
 * the spike zone, the spike-write list with the /spike write allowed and the /kernel write rendered
 * RED (SPIKE_WRITE_ESCAPES_ZONE + how_to_fix), and the harvested DRAFT-Truth proposal card labelled
 * "DRAFT — no frozen version, no mirror; promotion needs /goal". The human RUNS each gesture from the
 * screen, calling the SAME pure deciders the Go engine computes.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the gesture machine + verdicts are RENDERED,
 * never re-implemented as truth here. Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function ExplorationPage() {
	const t = await getTranslations("exploration");

	const labels = {
		statusNames: {
			draft: t("statusDraft"),
			grilled: t("statusGrilled"),
			spiking: t("statusSpiking"),
			harvested: t("statusHarvested"),
			rejected: t("statusRejected"),
		},
		lifecycleHeading: t("lifecycleHeading"),
		grillHeading: t("grillHeading"),
		grillSharp: t("grillSharp"),
		grillFuzzy: t("grillFuzzy"),
		grillBad: t("grillBad"),
		routedTo: t("routedTo"),
		ratchetBadge: t("ratchetBadge"),
		spikeHeading: t("spikeHeading"),
		runSpikeWrites: t("runSpikeWrites"),
		writeAllowed: t("writeAllowed"),
		writeBlocked: t("writeBlocked"),
		howToFixLabel: t("howToFixLabel"),
		harvestHeading: t("harvestHeading"),
		runHarvest: t("runHarvest"),
		draftTruthHeading: t("draftTruthHeading"),
		draftTruthCaveat: t("draftTruthCaveat"),
		proposesLabel: t("proposesLabel"),
		intentLabel: t("intentLabel"),
		noVersionMarker: t("noVersionMarker"),
		noMirrorMarker: t("noMirrorMarker"),
		provenanceLinkLabel: t("provenanceLinkLabel"),
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

				{/* Tutorial — how to read & drive the screen */}
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
					<ExplorationPanel labels={labels} />
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
