import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BRAIN_DECISIONS } from "@/lib/workbench-graph-data";
import { liveBrain } from "./actions";
import { LiveBrain } from "./LiveBrain";

// Read the live brain MemoryItems of the active project on every request (the S59 cutover):
// the live memory is read through the gateway (memory_recall), never baked into a static page.
export const dynamic = "force-dynamic";

/**
 * /brain — the brain cockpit (AIDOS step S44). A READ-ONLY projection over the `brain`
 * (MemoryItem, episodic/semantic/procedural, S30/S31) + `context` (ContextGraph +
 * ContextGraphDecision, S32/S33) schemas: memory items with their firewall taint, and the
 * context-graph reuse-allowed / reuse-denied decisions (the memory-firewall's verdicts,
 * S30). It RENDERS the verdicts; it NEVER writes memory (the wall — CLAUDE.md §2). Themed on
 * ADR 0010 tokens, bilingual via next-intl (ADR 0011).
 */

export const metadata: Metadata = {
	title: "Brain cockpit — AIDOS Workbench",
	description:
		"Read-only projection of the AIDOS brain (MemoryItem — episodic/semantic/procedural, pgvector, S30/S31) and the context graph (reuse-allowed/-denied decisions, S32/S33). It renders the memory-firewall's verdicts; it never writes memory.",
};

const verdictClass: Record<string, string> = {
	allowed:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	denied: "border-destructive/40 bg-destructive/10 text-destructive",
};

export default async function BrainPage() {
	const t = await getTranslations("brain");
	const tc = await getTranslations("common");
	const live = await liveBrain();

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
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Tutorial */}
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

				{/* Memory items — read live through the gateway (memory_recall), demo fallback */}
				<LiveBrain
					view={live}
					labels={{
						heading: t("memoryHeading"),
						intro: t("liveIntro"),
						empty: t("liveEmpty"),
						live: tc("live"),
						demo: tc("demo"),
						liveTitle: t("liveTitle"),
						demoTitle: t("demoTitle"),
						kindNames: {
							episodic: t("kind_episodic"),
							semantic: t("kind_semantic"),
							procedural: t("kind_procedural"),
						},
					}}
				/>

				{/* Reuse decisions / firewall verdicts */}
				<section
					aria-label={t("decisionsHeading")}
					data-testid="brain-decisions"
					className="mt-10 space-y-4"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("decisionsHeading")}
					</h2>
					<ul className="divide-y divide-border rounded-xl border border-border bg-card">
						{BRAIN_DECISIONS.map((d) => (
							<li
								key={d.id}
								data-testid={`decision-${d.id}`}
								data-verdict={d.verdict}
								className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
							>
								<span className="font-mono text-card-foreground">
									{d.target}
								</span>
								<span
									className={`inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${verdictClass[d.verdict]}`}
								>
									{t(`verdict_${d.verdict}` as "verdict_allowed")}
								</span>
								<span className="text-muted-foreground">{d.reason}</span>
							</li>
						))}
					</ul>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
