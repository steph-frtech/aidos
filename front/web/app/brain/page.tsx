import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BRAIN_DECISIONS, BRAIN_MEMORY } from "@/lib/workbench-graph-data";

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

				{/* Memory items */}
				<section
					aria-label={t("memoryHeading")}
					data-testid="brain-memory"
					className="mt-10 space-y-4"
				>
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("memoryHeading")}
					</h2>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{BRAIN_MEMORY.map((m) => (
							<div
								key={m.id}
								data-testid={`memory-${m.id}`}
								className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-mono text-xs font-semibold text-card-foreground">
										{m.id}
									</span>
									<span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
										{t(`kind_${m.kind}` as "kind_episodic")}
									</span>
								</div>
								<p className="text-sm leading-relaxed text-muted-foreground">
									{m.summary}
								</p>
								<span className="mt-1 inline-flex w-fit rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
									{m.taint}
								</span>
							</div>
						))}
					</div>
				</section>

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
