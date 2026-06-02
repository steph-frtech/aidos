import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TruthTypingTable } from "@/components/TruthTypingTable";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { CANDIDATE_TRUTHS } from "@/lib/truth-typing-data";

// Determinism-first: the truth-typing classifier is a pure projection in
// lib/truth-typing.ts (mirroring back/kernel/truthtyping), covered by
// lib/truth-typing.test.ts. This Server Component renders the intro + the candidate
// truths; the table runs the pure classifier per row in the client component — no
// I/O, no clock, no rng — so the routing badge each truth shows is computed exactly as
// the Go classifier routes it.

export const metadata: Metadata = {
	title: "Typer le vrai — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS truth-typing (KRD §13.4–13.5): every candidate truth's TruthKind, VerifiabilityLevel, and the computed routing verdict — KERNEL (admitted), /SPIKE (non-verifiable, routed away), or REJECTED (no/unknown kind). The ratchet only bites what is certifiable; the rest goes to /spike.",
};

/**
 * /truth-typing — the truth-typing panel (S14). It types the true before the ratchet
 * bites (KRD §13.4–13.5): each candidate truth carries a TruthKind (epistemic type)
 * and a VerifiabilityLevel (can the ratchet bite?), and the classifier routes it —
 * KERNEL, /SPIKE, or REJECTED.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the classifier's verdict via
 * lib/truth-typing.ts; it never writes truth (the wall — truth-writes go via propose →
 * ChangeSet → approval). There is no headless capability here. Themed on ADR 0010
 * tokens; bilingual via next-intl (ADR 0011).
 */
export default async function TruthTypingPage() {
	const t = await getTranslations("truthTyping");

	const labels = {
		truthLabel: t("truthLabel"),
		kindLabel: t("kindLabel"),
		levelLabel: t("levelLabel"),
		routingLabel: t("routingLabel"),
		reasonLabel: t("reasonLabel"),
		badgeKernel: t("badgeKernel"),
		badgeSpike: t("badgeSpike"),
		badgeRejected: t("badgeRejected"),
		none: t("none"),
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

				{/* The truth-typing table — the classifier's verdict per candidate truth */}
				<section aria-label={t("tableHeading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("tableHeading")}
					</h2>
					<TruthTypingTable rows={CANDIDATE_TRUTHS} labels={labels} />
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
