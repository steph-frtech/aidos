import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EvolutionSandboxPanel } from "@/components/EvolutionSandboxPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { liveRuns } from "./actions";
import { LiveRuns } from "./LiveRuns";

// Read the live recorded EvolutionRuns of the active project on every request (the S59
// cutover): the run-id list is read through the gateway (evolve_run_list), never baked in.
export const dynamic = "force-dynamic";

// Determinism-first: the quarantine write ledger + the promotion gate are computed by
// a PURE twin of back/runtime/evolve.Confine + Promote (lib/evolution-sandbox.ts),
// covered by fast-check (lib/evolution-sandbox.test.ts) anchored on the Go fixtures.
// The action-capable panel re-runs the SAME twin live: toggling the /evolve run
// confines writes (a /kernel write renders RED with SANDBOX_WRITE_ESCAPES_ZONE), and
// each candidate's three-pill gate (mirror_green / out_of_sample_green /
// authority_approval) decides promotability — a candidate promotable only when all
// three are lit, labelled PROPOSAL (promotion to truth needs /goal). The sandbox
// reads/classifies; it writes no truth (the wall, §2). Themed (ADR 0010), bilingual
// (ADR 0011).

export const metadata: Metadata = {
	title:
		"Evolution Sandbox — /evolve explore, il ne gouverne pas | AIDOS Workbench",
	description:
		"EvolutionSandbox (S42, KRD §66.1) : la quarantaine où toute boucle /evolve tourne — elle peut écrire uniquement /branches/evolution, /reports, /ideas/proposed et jamais /kernel, /mirrors/above, /authority, /fitness. Une variante n'est promue dans une niche qu'avec mirror_green ∧ out_of_sample_green ∧ authority_approval — une porte binaire (le miroir déterministe), jamais un score que la boucle se note elle-même ; out-of-sample, jamais in-sample. L'évolution explore, elle ne gouverne pas : la promotion est une PROPOSITION que le /goal humain gèle.",
};

export default async function EvolutionSandboxPage() {
	const t = await getTranslations("evolutionSandbox");
	const tc = await getTranslations("common");
	const live = await liveRuns();
	const labels = {
		ledgerTitle: t("ledgerTitle"),
		ledgerAllowed: t("ledgerAllowed"),
		ledgerBlocked: t("ledgerBlocked"),
		zoneBranch: t("zoneBranch"),
		zoneReport: t("zoneReport"),
		zoneIdea: t("zoneIdea"),
		zoneGoverning: t("zoneGoverning"),
		nicheTitle: t("nicheTitle"),
		gateTitle: t("gateTitle"),
		pillMirror: t("pillMirror"),
		pillOutOfSample: t("pillOutOfSample"),
		pillAuthority: t("pillAuthority"),
		promotableYes: t("promotableYes"),
		promotableNo: t("promotableNo"),
		proposalLabel: t("proposalLabel"),
		scoreLabel: t("scoreLabel"),
		notPromotableNote: t("notPromotableNote"),
		runActiveLabel: t("runActiveLabel"),
		runStartLabel: t("runStartLabel"),
		runStopLabel: t("runStopLabel"),
	};

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{t("title")}
				</h1>
				<p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>

				<section className="mt-8 rounded-xl border border-border bg-card p-5">
					<h2 className="text-sm font-semibold text-foreground">
						{t("tutorialTitle")}
					</h2>
					<ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
						<li>{t("tutorialStep1")}</li>
						<li>{t("tutorialStep2")}</li>
						<li>{t("tutorialStep3")}</li>
						<li>{t("tutorialStep4")}</li>
					</ol>
				</section>

				<h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{t("exampleTitle")}
				</h2>

				<EvolutionSandboxPanel labels={labels} />

				{/* Recorded EvolutionRuns — read through the gateway (evolve_run_list), demo fallback */}
				<LiveRuns
					view={live}
					labels={{
						heading: t("liveHeading"),
						intro: t("liveIntro"),
						empty: t("liveEmpty"),
						live: tc("live"),
						demo: tc("demo"),
						liveTitle: t("liveTitle"),
						demoTitle: t("demoTitle"),
						runIdLabel: t("liveRunIdLabel"),
					}}
				/>
			</main>
		</div>
	);
}
