import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthoritiesTable } from "@/components/AuthoritiesTable";
import { AuthorityGraphCard } from "@/components/AuthorityGraphCard";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { ADMISSION_ROWS, CHECKOUT_REGULATORY } from "@/lib/authority-data";

// Determinism-first: the AuthorityGraph decider is a pure projection in lib/authority.ts
// (mirroring back/kernel/authority), covered by lib/authority.test.ts. This Server
// Component renders the graph card + the intro; the admission table runs the pure decider
// per row in the client component — no I/O, no clock, no rng — so each decision shown is
// computed exactly as the Go decider decides it.

export const metadata: Metadata = {
	title: "Autorités — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS AuthorityGraph decider (KRD §13.8): the checkout-regulatory graph (domain / truth_kind / approvers / veto / escalation) and a live admission table — for each candidate, the computed decision ADMITTED / BLOCKED (MISSING_AUTHORITY_APPROVAL or VETOED) / ESCALATED. Toute vérité above-the-line doit avoir un propriétaire d'autorité explicite.",
};

/**
 * /authorities — the AuthorityGraph panel (S16). It enforces "toute vérité above-the-line
 * doit avoir un propriétaire d'autorité explicite" (KRD §13.8): a {domain, truth_kind} is
 * bound to named authorities (approvers / veto / escalation), and admission is decided —
 * a regulatory truth without its required (legal) approval is BLOCKED, not silently admitted.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the decider's verdict via
 * lib/authority.ts; it never writes truth (the wall — truth-writes / reauthorizes go via
 * propose → ChangeSet → approval, SemanticDiff change_type `reauthorize`). No headless
 * capability here. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function AuthoritiesPage() {
	const t = await getTranslations("authorities");

	const graphLabels = {
		domainLabel: t("domainLabel"),
		truthKindLabel: t("truthKindLabel"),
		approversLabel: t("approversLabel"),
		vetoLabel: t("vetoLabel"),
		escalationLabel: t("escalationLabel"),
	};

	const tableLabels = {
		admissionLabel: t("admissionLabel"),
		grantedLabel: t("grantedLabel"),
		decisionLabel: t("decisionLabel"),
		reasonLabel: t("reasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		escalatedToLabel: t("escalatedToLabel"),
		badgeAdmitted: t("badgeAdmitted"),
		badgeBlocked: t("badgeBlocked"),
		badgeEscalated: t("badgeEscalated"),
		noGranted: t("noGranted"),
	};

	const truth = {
		domain: CHECKOUT_REGULATORY.domain,
		truthKind: CHECKOUT_REGULATORY.truthKind,
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

				{/* The authority graph card */}
				<section aria-label={t("graphHeading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("graphHeading")}
					</h2>
					<AuthorityGraphCard
						graph={CHECKOUT_REGULATORY}
						labels={graphLabels}
					/>
				</section>

				{/* The admission table — the decider's verdict per candidate row */}
				<section aria-label={t("tableHeading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tableHeading")}
					</h2>
					<AuthoritiesTable
						graph={CHECKOUT_REGULATORY}
						truth={truth}
						rows={ADMISSION_ROWS}
						labels={tableLabels}
					/>
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
