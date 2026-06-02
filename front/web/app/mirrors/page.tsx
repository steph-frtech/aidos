import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the mirror inventory + the two candidate scenarios are a
// static, declared dataset in lib/mirrors.ts (a pure port of the Go cliquet core
// back/mcp/mirror-runner/regression.go), covered by lib/mirrors.test.ts. This
// Server Component renders the inventory and tutorial; the RatchetRunner client
// island runs the cliquet over a declared candidate via the runRatchet Server
// Action — so /mirrors computes exactly what the Go runner computes. One decision,
// no drift.
import { MIRROR_INVENTORY } from "@/lib/mirrors";
import { RatchetRunner } from "./RatchetRunner";

export const metadata: Metadata = {
	title: "Le cliquet — AIDOS Workbench",
	description:
		"Action-capable panel of the ratchet (cliquet): replay every materialized mirror, compare each verdict to the recorded green baseline, and reject the merge the moment a baseline-green mirror turns red (RED_REGRESSION). Writes only the run-log, never truth.",
};

/**
 * /mirrors — the cliquet (ratchet) panel (S05). The ratchet is KRD iteration 3
 * made mechanical: it replays every materialized mirror, compares each verdict to
 * the recorded green baseline, and rejects a merge the moment a baseline-green
 * mirror turns red (RED_REGRESSION) — before the merge, never after.
 *
 * ACTION-CAPABLE (ui-completeness, CLAUDE.md §6): the capability the step develops
 * (replay-all → merge verdict) is reachable AND executable from the screen via the
 * RatchetRunner controls, not just displayed. THE WALL (§2): running the cliquet
 * reads the mirror set and writes only the run-log (runtime.mirror_runs, below the
 * waterline) — no truth is written from the screen, so the action is legal. Themed
 * on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function MirrorsPage() {
	const t = await getTranslations("mirrors");

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
						<span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
							{t("guardBadge")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("badge")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Self-teaching tutorial: the concepts before the jargon */}
				<section
					data-testid="mirrors-tutorial"
					aria-label={t("tutorial.heading")}
					className="mt-10 space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-8"
				>
					<div className="space-y-2">
						<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
							{t("tutorial.badge")}
						</span>
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("tutorial.heading")}
						</h2>
						<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
							{t("tutorial.lead")}
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{(["t1", "t2", "t3", "t4"] as const).map((k) => (
							<article
								key={k}
								className="space-y-1.5 rounded-xl border border-border bg-background p-4"
							>
								<h3 className="text-sm font-semibold text-foreground">
									{t(`tutorial.${k}.title`)}
								</h3>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{t(`tutorial.${k}.body`)}
								</p>
							</article>
						))}
					</div>
				</section>

				{/* The action-capable cliquet runner: replay + merge verdict */}
				<section aria-label={t("runner.heading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("inventoryHeading")}
					</h2>
					<RatchetRunner inventory={MIRROR_INVENTORY} />
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
