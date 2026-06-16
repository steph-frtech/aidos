import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MemoryFirewallPanel } from "@/components/MemoryFirewallPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { LiveRecall } from "./LiveRecall";
import { liveRecall } from "./liveActions";

// Read the live recalled memories of the active project on every request (the S59 cutover):
// the recall is read through the gateway (memory_recall), never baked into a static page.
export const dynamic = "force-dynamic";

// Determinism-first: the firewall (the always-blocked Memory → Kernel gate, the six-stage flow)
// is a pure projection in lib/firewall.ts (the twin of back/archive/brain/firewall), covered by
// lib/firewall.test.ts (fast-check). This Server Component renders the intro + tutorial +
// example; the action-capable panel runs the SAME pure toKernel/propose/viaIdea the Go engine
// runs — no I/O, no clock, no rng — so the verdict on screen matches the engine. READ-ONLY (the
// wall): the /brain store is below the waterline (the agent reads/appends memory); the kernel
// write at the far end of the flow is the aidos CLI role via /goal, never this screen.

export const metadata: Metadata = {
	title:
		"MemoryFirewall — la mémoire propose, le noyau déclare (AIDOS Workbench)",
	description:
		"Le MemoryFirewall d'AIDOS (KRD §119.1) : la porte du store /brain qui interdit à tout MemoryItem d'atteindre le noyau autrement que par le flux obligatoire à sens unique Memory → ContextPack → Idea → Mirror → Goal → Kernel. Un MemoryItem est du carburant de contexte, JAMAIS une vérité : pas de version-gel, pas de miroir. L'arête directe Memory → Kernel est TOUJOURS bloquée — quels que soient sa confiance ou son taint. « La mémoire propose ; le noyau déclare le vrai. » Lecture seule (le mur).",
};

/**
 * /memory-firewall — the MemoryFirewall panel (S30). It renders the mandatory flow as a
 * left-to-right pipeline (Memory → ContextPack → Idea → Mirror → Goal → Kernel) with the direct
 * Memory → Kernel shortcut drawn RED and crossed out; a MemoryItem card (content/provenance/
 * taint/confidence/scope/expiry) with the "not truth — no mirror, no freeze" marker; the
 * attempted direct to-kernel rendered RED with MEMORY_CANNOT_DECLARE_TRUTH (code + how_to_fix =
 * the full flow) and NO kernel write; the via-idea path showing the memory becoming a DRAFT idea
 * (link to /ideas, S27) that still has no mirror and so is still short of the kernel.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual
 * (ADR 0011).
 */
export default async function MemoryFirewallPage() {
	const t = await getTranslations("memoryFirewall");
	const tc = await getTranslations("common");
	const recall = await liveRecall();

	const labels = {
		captureCta: t("captureCta"),
		proposeCta: t("proposeCta"),
		toKernelCta: t("toKernelCta"),
		viaIdeaCta: t("viaIdeaCta"),
		flowHeading: t("flowHeading"),
		shortcutLabel: t("shortcutLabel"),
		shortcutBlocked: t("shortcutBlocked"),
		memoryHeading: t("memoryHeading"),
		notTruthMarker: t("notTruthMarker"),
		provenanceLabel: t("provenanceLabel"),
		confidenceLabel: t("confidenceLabel"),
		scopeLabel: t("scopeLabel"),
		expiresLabel: t("expiresLabel"),
		taintLabel: t("taintLabel"),
		contextPackHeading: t("contextPackHeading"),
		taintTravels: t("taintTravels"),
		blockedHeading: t("blockedHeading"),
		noKernelWrite: t("noKernelWrite"),
		howToFixLabel: t("howToFixLabel"),
		viaIdeaHeading: t("viaIdeaHeading"),
		draftIdeaLabel: t("draftIdeaLabel"),
		stillNoMirror: t("stillNoMirror"),
		provenanceBackLabel: t("provenanceBackLabel"),
		ideasLink: t("ideasLink"),
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
					<MemoryFirewallPanel labels={labels} />
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

				{/* Live recalled memories — read through the gateway (memory_recall), demo fallback */}
				<div className="mt-10">
					<LiveRecall
						view={recall}
						labels={{
							heading: t("liveHeading"),
							intro: t("liveIntro"),
							empty: t("liveEmpty"),
							live: tc("live"),
							demo: tc("demo"),
							liveTitle: t("liveTitle"),
							demoTitle: t("liveDemoTitle"),
							kindLabel: t("liveKindLabel"),
							provenanceLabel: t("liveProvenanceLabel"),
							taintLabel: t("liveTaintLabel"),
							scoreLabel: t("liveScoreLabel"),
							noTaint: t("liveNoTaint"),
						}}
					/>
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
