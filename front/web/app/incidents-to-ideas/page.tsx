import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { IncidentsToIdeasPanel } from "@/components/IncidentsToIdeasPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { liveIncidents } from "./actions";
import { LiveIncidents } from "./LiveIncidents";

// Read the live incidents board of the active project on every request (the S59 cutover):
// the live incident list is read through the gateway (incident_list), never baked into a
// static page.
export const dynamic = "force-dynamic";

// Determinism-first: the RealityMirror (the always-blocked Incident → Kernel gate, the external
// loop, the conservative proposes inference) is a pure projection in lib/reality.ts (the twin of
// back/runtime/reality), covered by lib/reality.test.ts (fast-check). This Server Component
// renders the intro + tutorial + example; the action-capable panel runs the SAME pure
// learn/toKernel the Go engine runs — no I/O, no clock, no rng — so the verdict on screen matches
// the engine. READ-ONLY (the wall): incidents.* is below the waterline (the agent
// observes/appends incidents); the kernel write at the far end is the human's mirror + /goal +
// approval, never this screen.

export const metadata: Metadata = {
	title:
		"RealityMirror — la réalité injecte des idées, pas des vérités (AIDOS Workbench)",
	description:
		"Le RealityMirror d'AIDOS (KRD §53/§67/§117/§1099) : la boucle externe qui transforme un incident de prod / un signal de télémétrie en une idée DRAFT (provenance incident:#NNNN), remise à la porte idea-intake (S27). Un incident est de la RÉALITÉ, jamais une vérité : pas de version-gel, pas de miroir — il PROPOSE un miroir, il n'en est pas un. L'arête directe Incident → Kernel est TOUJOURS bloquée (REALITY_CANNOT_DECLARE_TRUTH). « Le système a appris du MONDE, pas de lui-même. » Lecture seule (le mur).",
};

/**
 * /incidents-to-ideas — the RealityMirror panel (S43). It renders the external loop as a
 * left-to-right pipeline (Incident → Learn → Idea → Mirror → Goal → Kernel) with the direct
 * Incident → Kernel shortcut drawn RED and crossed out; one card per incident
 * (signal/cause_sketch/provenance/taint) with the "reality, not a truth — no mirror, no freeze"
 * marker; the /learn action rendering the incident:#NNNN → draft idea arrow (provenance carried,
 * idea shown draft with no mirror yet, OpenQuestion marker where proposes is unpinned); and the
 * attempted direct to-kernel rendered RED with REALITY_CANNOT_DECLARE_TRUTH (code + how_to_fix)
 * and NO kernel write, the kernel UNCHANGED.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual
 * (ADR 0011).
 */
export default async function IncidentsToIdeasPage() {
	const t = await getTranslations("incidentsToIdeas");
	const tc = await getTranslations("common");
	const live = await liveIncidents();

	const labels = {
		flowHeading: t("flowHeading"),
		shortcutLabel: t("shortcutLabel"),
		shortcutBlocked: t("shortcutBlocked"),
		incidentsHeading: t("incidentsHeading"),
		notTruthMarker: t("notTruthMarker"),
		signalLabel: t("signalLabel"),
		operationLabel: t("operationLabel"),
		errorLabel: t("errorLabel"),
		recurrenceLabel: t("recurrenceLabel"),
		causeSketchLabel: t("causeSketchLabel"),
		provenanceLabel: t("provenanceLabel"),
		taintLabel: t("taintLabel"),
		learnCta: t("learnCta"),
		toKernelCta: t("toKernelCta"),
		learnedHeading: t("learnedHeading"),
		draftIdeaLabel: t("draftIdeaLabel"),
		stillNoMirror: t("stillNoMirror"),
		intentLabel: t("intentLabel"),
		proposesLabel: t("proposesLabel"),
		openQuestionLabel: t("openQuestionLabel"),
		ideasLink: t("ideasLink"),
		blockedHeading: t("blockedHeading"),
		noKernelWrite: t("noKernelWrite"),
		kernelUnchanged: t("kernelUnchanged"),
		howToFixLabel: t("howToFixLabel"),
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
					<IncidentsToIdeasPanel labels={labels} />
				</div>

				{/* Live incidents board — read through the gateway (incident_list), demo fallback */}
				<div className="mt-10">
					<LiveIncidents
						view={live}
						labels={{
							heading: t("liveHeading"),
							intro: t("liveIntro"),
							empty: t("liveEmpty"),
							live: tc("live"),
							demo: tc("demo"),
							liveTitle: t("liveTitle"),
							demoTitle: t("demoTitle"),
							refLabel: t("liveRefLabel"),
							operationLabel: t("operationLabel"),
							errorLabel: t("errorLabel"),
							recurrenceLabel: t("recurrenceLabel"),
							causeSketchLabel: t("causeSketchLabel"),
							taintLabel: t("taintLabel"),
							ideaLabel: t("liveIdeaLabel"),
							notTruthMarker: t("notTruthMarker"),
						}}
					/>
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
