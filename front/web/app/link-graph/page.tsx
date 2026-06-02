import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LinkGraph } from "@/components/LinkGraph";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import {
	EXAMPLE_LINKS,
	HEADS_ABSENT_TARGET,
	HEADS_ALL_GREEN,
} from "@/lib/links-data";

// Determinism-first: the versioned-links staleness check is a pure projection in lib/links.ts
// (mirroring back/kernel/links), covered by lib/links.test.ts. This Server Component renders
// the intro + tutorial + example; the link graph runs the pure resolver per edge in the
// client component — no I/O, no clock, no rng — so each status shown is computed exactly as
// the Go Resolve resolves it.

export const metadata: Metadata = {
	title: "Versioned links — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS versioned-links resolver (KRD §41): the six link kinds (projects_to / derives_from / contracts_with / triggers / binds / mirrors) rendered as a graph, each edge coloured by its resolved status against the current heads — green pinned-to-head, red stale or absent. A link to an absent version is red.",
};

/**
 * /link-graph — the versioned-links panel (S17). It renders the six KRD §41 link kinds as a
 * graph, each edge pinned to a target VERSION (id@version), coloured by its resolved status:
 * green = pinned-to-head, red = stale (non-head) or absent (no head). A heads toggle shows the
 * head-pinned binds edge green and the same edge RED when its target version is absent — the
 * done criterion (a link to an absent version is red), visible in the UI.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the resolver's verdict via lib/links.ts;
 * it never writes truth (the wall — truth-writes go via propose → ChangeSet → approval). No
 * headless capability here. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function LinkGraphPage() {
	const t = await getTranslations("linkGraph");

	const graphLabels = {
		kindLabel: t("kindLabel"),
		fromLabel: t("fromLabel"),
		toLabel: t("toLabel"),
		statusLabel: t("statusLabel"),
		badgeGreen: t("badgeGreen"),
		badgeStale: t("badgeStale"),
		badgeAbsent: t("badgeAbsent"),
		headsHeading: t("headsHeading"),
		toggleAllGreen: t("toggleAllGreen"),
		toggleAbsent: t("toggleAbsent"),
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

				{/* The link graph — the resolver's status per edge against the toggled heads */}
				<section aria-label={t("graphHeading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("graphHeading")}
					</h2>
					<LinkGraph
						links={EXAMPLE_LINKS}
						headsAllGreen={HEADS_ALL_GREEN}
						headsAbsent={HEADS_ABSENT_TARGET}
						labels={graphLabels}
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
