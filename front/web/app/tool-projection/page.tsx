import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ToolProjectionPanel } from "@/components/ToolProjectionPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the emit + drift detection are a pure projection in lib/tool-projection.ts
// (mirroring back/kernel/toolproject), covered by lib/tool-projection.test.ts (fast-check). This
// Server Component renders the intro + tutorial; the action-capable panel runs the same pure `emit`
// the Go toolproject.Emit emits — no I/O, no clock, no rng, NO LLM — so the file shown is computed
// exactly as Go computes it (the judge is a deterministic render + a byte comparison, never a prompt).
// READ-ONLY (the wall): the screen emits + drift-checks; freezing/updating a ToolingKernel goes via
// propose → /goal → approval, never a write here.

export const metadata: Metadata = {
	title:
		"Projections d'outillage — CLAUDE.md/AGENTS.md émis des kernels — AIDOS Workbench",
	description:
		"Panneau des projections d'outillage d'AIDOS (FKE-20, FK15) : CLAUDE.md / AGENTS.md / .cursorrules / memory-bank ÉMIS depuis les kernels (policy/memory/style/architecture/agent-profile), jamais hand-édités (hash-protégés, drift par source-hash). Mêmes kernels → mêmes fichiers byte-identiques ; un hand-edit détecté (HAND_EDITED).",
};

/**
 * /tool-projection — the tooling-projection panel (FK15). It emits the tooling files from the kernel
 * sources: pick a target (CLAUDE.md / AGENTS.md / .cursorrules / memory-bank.md), RUN the emit (the
 * action), then RUN the drift check on the clean file (no drift) or on a HAND-EDITED file (the FK15
 * fault-injection → HAND_EDITED).
 *
 * THE DONE CRITERIA, executable from the screen: emitting a target twice yields the SAME bytes (same
 * kernel → byte-identical); a hand-edit of the emitted file is DETECTED (HAND_EDITED).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function ToolProjectionPage() {
	const t = await getTranslations("toolProjection");

	const labels = {
		pickLabel: t("pickLabel"),
		awaiting: t("awaiting"),
		emitLabel: t("emitLabel"),
		checkCleanLabel: t("checkCleanLabel"),
		checkEditedLabel: t("checkEditedLabel"),
		sourceHashLabel: t("sourceHashLabel"),
		fileLabel: t("fileLabel"),
		driftHeading: t("driftHeading"),
		noDrift: t("noDrift"),
		expectedLabel: t("expectedLabel"),
		targetNames: {
			"CLAUDE.md": t("targetClaude"),
			"AGENTS.md": t("targetAgents"),
			".cursorrules": t("targetCursor"),
			"memory-bank.md": t("targetMemory"),
		},
		driftNames: {
			HAND_EDITED: t("driftHandEdited"),
			MISSING_MARKER: t("driftMissingMarker"),
			STALE_HASH: t("driftStaleHash"),
		},
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
					<ToolProjectionPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
