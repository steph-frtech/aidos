import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinProposesPanel } from "@/components/BesoinProposesPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL05 declares the table LevelToProposes(level) → ProposesKind | NoEmit — the
// honest join between the BesoinGraph grammar (9 levels) and the EXISTING closed set
// ideas.ProposesKinds() (6 kinds). The verdict is computed by lib/besoin-proposes.ts (the
// byte-for-byte twin of back/runtime/besoin/proposes.go), covered by lib/besoin-proposes.test.ts
// (vitest + fast-check). This Server Component renders intro + tutorial; the action-capable panel
// RUNS the SAME pure mapping the Go authority runs — no I/O, no clock, no LLM. ABOVE the wall: the
// table decides only the Proposes target, it writes no Idea and no truth.

export const metadata: Metadata = {
	title:
		"LevelToProposes — la table déclarée niveau → ProposesKind | NoEmit (AIDOS Workbench)",
	description:
		"EL05 : la jointure honnête entre la grammaire du BesoinGraph (9 niveaux) et le closed set existant ideas.ProposesKinds() (control|policy|operation|action|entity|product). control/action/operation/entity/product et la bande policy se mappent vers eux-mêmes (self-map, la seule émission légale) ; journey/view/invariant sont NoEmit (aucune cible Proposes légale, ils seedent les ancres). Aucun alias silencieux (journey→product interdit) ; un mapping hors closed set est une erreur dure. Table close = fonction pure déterministe, jamais un choix LLM, au-dessus du mur (aucune écriture vérité).",
};

/**
 * /compound-besoin-proposes — the EL05 LevelToProposes table panel. The human EXECUTES the mapping
 * FROM THE SCREEN: see the full declared table, map one level (Emit<kind> | NoEmit), prove the honest
 * join (every Emit ∈ closed set, no alias), and prove an out-of-grammar level is a hard error.
 * ui-completeness (CLAUDE.md §7): no headless capability. ABOVE the wall, read-only. Themed (ADR
 * 0010), bilingual (ADR 0011).
 */
export default async function BesoinProposesPage() {
	const t = await getTranslations("besoinProposes");

	const labels = {
		levelLabel: t("levelLabel"),
		mapCta: t("mapCta"),
		joinCta: t("joinCta"),
		checkCta: t("checkCta"),
		rawLabel: t("rawLabel"),
		resetCta: t("resetCta"),
		tableHeading: t("tableHeading"),
		colLevel: t("colLevel"),
		colMapping: t("colMapping"),
		emit: t("emit"),
		noEmit: t("noEmit"),
		verdictHeading: t("verdictHeading"),
		joinHeading: t("joinHeading"),
		joinOk: t("joinOk"),
		joinFail: t("joinFail"),
		checkHeading: t("checkHeading"),
		checkHardError: t("checkHardError"),
		checkValid: t("checkValid"),
		pending: t("pending"),
		closedSetHeading: t("closedSetHeading"),
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
					<BesoinProposesPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
