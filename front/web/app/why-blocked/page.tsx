import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WhyBlockedExplorer } from "@/components/WhyBlockedExplorer";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the BlockReason registry is a static, declared projection in
// lib/why-blocked.ts (mirroring back/runtime/blockreason), covered by
// lib/why-blocked.test.ts. This Server Component renders the intro + the canonical
// reasons; the interactive code switch lives in the WhyBlockedExplorer client
// component — no I/O, no clock, no rng — so /why-blocked shows exactly the code,
// severity, explanation, and how_to_fix path that `aidos explain <CODE>` prints.
import { BLOCK_REASONS, CANONICAL_CODES } from "@/lib/why-blocked";

export const metadata: Metadata = {
	title: "Pourquoi bloqué — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS BlockReason: every KRD refusal rendered as `aidos explain <CODE>` does — code, severity, explanation, numbered how_to_fix — for the three canonical codes (MISSING_MIRROR, MISSING_AUTHORITY, OUT_OF_SCOPE) plus the inherited AGENT_WRITE_ABOVE_WATERLINE. A wall without a BlockReason becomes a prison.",
};

/**
 * /why-blocked — the BlockReason panel (S13). It makes every refusal actionable
 * (KRD §44.5): a code, a severity, an explanation, and a non-empty how_to_fix
 * resolution path. It renders a BlockReason exactly as `aidos explain <CODE>` does,
 * with a code switcher across the canonical codes.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): a BlockReason is produced at refusal
 * time by sites that already exist (the wall, completeness, scope/authority checks);
 * this panel projects it via lib/why-blocked.ts, it does not erect a wall (S13 is
 * descriptive, not a rule). There is no headless capability hidden here — there is
 * none (live block fetch is OQ-S13-fetch). Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function WhyBlockedPage() {
	const t = await getTranslations("whyBlocked");

	// The canonical three first, then the inherited wall code — same order the CLI
	// enumerates (lib mirrors blockreason.Codes()).
	const canonical = BLOCK_REASONS.filter((r) =>
		CANONICAL_CODES.includes(r.code),
	);
	const rest = BLOCK_REASONS.filter((r) => !CANONICAL_CODES.includes(r.code));
	const ordered = [...canonical, ...rest];

	const labels = {
		codeLabel: t("codeLabel"),
		severityLabel: t("severityLabel"),
		explanationLabel: t("explanationLabel"),
		howToFixLabel: t("howToFixLabel"),
		selectLabel: t("selectLabel"),
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

				{/* The interactive BlockReason explorer (the `aidos explain` view) */}
				<section aria-label={t("reasonsHeading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("reasonsHeading")}
					</h2>
					<WhyBlockedExplorer reasons={ordered} labels={labels} />
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
