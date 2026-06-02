import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScopesTable } from "@/components/ScopesTable";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { CANDIDATE_RECORDS } from "@/lib/scope-data";

// Determinism-first: the TruthScope guard is a pure projection in lib/scope.ts
// (mirroring back/kernel/scope), covered by lib/scope.test.ts. This Server Component
// renders the intro + the candidate records; the table runs the pure guard per row in
// the client component — no I/O, no clock, no rng — so the verdict each record shows is
// computed exactly as the Go guard verdicts it.

export const metadata: Metadata = {
	title: "Scope des vérités — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS TruthScope guard (KRD §13.7): for each candidate truth, its lifecycle status, its scope dimensions (region/target/user_segment/environment/time_window/tenant), and the computed verdict — ACCEPTED (scoped), GLOBAL (explicit, region '*'), or REJECTED — active truth without a scope. Aucune vérité n'est universelle par défaut.",
};

/**
 * /scopes — the TruthScope panel (S15). It enforces "aucune vérité n'est universelle par
 * défaut" (KRD §13.7): an active truth must carry a scope (region/target/segment/env/
 * time_window/tenant), unless it is explicitly global (region "*"). Each candidate record
 * shows its scope dimensions and the guard's verdict.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the guard's verdict via
 * lib/scope.ts; it never writes truth (the wall — truth-writes / rescopes go via propose →
 * ChangeSet → approval, SemanticDiff change_type `rescope`). No headless capability here.
 * Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function ScopesPage() {
	const t = await getTranslations("scopes");

	const labels = {
		truthLabel: t("truthLabel"),
		statusLabel: t("statusLabel"),
		scopeLabel: t("scopeLabel"),
		verdictLabel: t("verdictLabel"),
		reasonLabel: t("reasonLabel"),
		badgeAccepted: t("badgeAccepted"),
		badgeGlobal: t("badgeGlobal"),
		badgeRejected: t("badgeRejected"),
		noScope: t("noScope"),
		authority: t("authority"),
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

				{/* The scopes table — the guard's verdict per candidate record */}
				<section aria-label={t("tableHeading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tableHeading")}
					</h2>
					<ScopesTable rows={CANDIDATE_RECORDS} labels={labels} />
				</section>

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
