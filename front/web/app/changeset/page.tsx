import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangeSetPanel } from "@/components/ChangeSetPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the ChangeSet lifecycle (open/apply/edit/revert) is a pure projection in
// lib/changeset.ts (mirroring back/archive/changeset), covered by lib/changeset.test.ts (fast-check).
// This Server Component renders the intro + tutorial + example; the envelope card, the lifecycle
// table and the revert lineage run the pure functions per row — no I/O, no clock, no rng — so each
// verdict shown is computed exactly as the Go Apply/Edit/Revert compute them.

export const metadata: Metadata = {
	title: "ChangeSet — AIDOS Workbench",
	description:
		"Panneau en lecture seule du ChangeSet d'AIDOS (KRD §44, §98) : l'enveloppe transactionnelle atomique et réversible qui déplace le noyau d'une phase stable à la suivante, enveloppant spec (Kernel) et miroir (Mirror) ensemble pour qu'ils ne dérivent jamais. États DRAFT | APPLIED | REVERTED uniquement (pas de FAILED). Un ChangeSet APPLIED est immuable ; un revert est un nouveau ChangeSet inverse ajouté au journal (append-only).",
};

/**
 * /changeset — the ChangeSet lifecycle panel (S20). It renders the KRD §98 "add order discount"
 * envelope: the atomic spec_delta + mirror_delta shown together (so they cannot drift), a status
 * badge (DRAFT/APPLIED/REVERTED), applied_at, the lifecycle table (open → apply → blocked-incomplete
 * → blocked-immutable → revert → apply-inverse → discard), and the revert lineage (source cs-A
 * stamped REVERTED but still present, linked to inverse cs-B via reverts).
 *
 * The done criteria, rendered: apply of the complete envelope is APPLIED with applied_at; the
 * incomplete-apply row is RED with INCOMPLETE_CHANGESET + how_to_fix; the edit-after-apply row is
 * RED with APPLIED_IS_IMMUTABLE; the revert lineage shows cs-A REVERTED (still present) linked to
 * the inverse cs-B.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): a real apply/revert goes through the changeset
 * MCP / the commit-gate (propose → ChangeSet → approval), never a direct write from the screen. No
 * headless capability. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function ChangeSetPage() {
	const t = await getTranslations("changeset");

	const labels = {
		envelopeHeading: t("envelopeHeading"),
		envelopeIntro: t("envelopeIntro"),
		specDeltaLabel: t("specDeltaLabel"),
		mirrorDeltaLabel: t("mirrorDeltaLabel"),
		atomicNote: t("atomicNote"),
		parentPhaseLabel: t("parentPhaseLabel"),
		appliedAtLabel: t("appliedAtLabel"),
		lifecycleHeading: t("lifecycleHeading"),
		stepLabel: t("stepLabel"),
		commandLabel: t("commandLabel"),
		resultLabel: t("resultLabel"),
		rowOpen: t("rowOpen"),
		rowApply: t("rowApply"),
		rowApplyIncomplete: t("rowApplyIncomplete"),
		rowEdit: t("rowEdit"),
		rowRevert: t("rowRevert"),
		rowApplyInverse: t("rowApplyInverse"),
		rowDiscard: t("rowDiscard"),
		lineageHeading: t("lineageHeading"),
		lineageIntro: t("lineageIntro"),
		sourceLabel: t("sourceLabel"),
		inverseLabel: t("inverseLabel"),
		revertsLabel: t("revertsLabel"),
		stillPresentNote: t("stillPresentNote"),
		statusDraft: t("statusDraft"),
		statusApplied: t("statusApplied"),
		statusReverted: t("statusReverted"),
		blocked: t("blocked"),
		howToFixLabel: t("howToFixLabel"),
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

				<div className="mt-10">
					<ChangeSetPanel labels={labels} />
				</div>

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
