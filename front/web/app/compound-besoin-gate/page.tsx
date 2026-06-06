import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinGatePanel } from "@/components/BesoinGatePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// /compound-besoin-gate — EL11. The Stop:besoin-gate (a SEPARATE hook binary from back/hooks/stop):
// at Stop it refuses a level's descent iff the current rung is ¬enough (EL07) OR carries a
// need-completeness monster (EL09) — the OU, not the ET. Scoped to sessions with an OPEN BesoinGraph
// (no-op otherwise — §5, no over-firing). The verdict is COMPUTED by lib/besoin-gate.ts (the
// byte-equivalent twin composing the EL07 + EL09 twins), never an LLM. ABOVE the wall: reads the
// BesoinGraph, writes no truth and no mirror — the hook REINFORCES the wall (§2).

export const metadata: Metadata = {
	title: "Porte Stop:besoin-gate — le forçage de descente (AIDOS Workbench)",
	description:
		"EL11 : le hook Stop:besoin-gate (binaire distinct, scopé aux sessions BesoinGraph) refuse la descente d'un niveau ssi le rung courant n'est PAS right-sized (¬CanDescend.enough, EL07) OU porte un monstre de complétude-du-besoin (EL09) — un OU, pas un ET. Sans BesoinGraph : no-op (pas de sur-tirage). Verdict calculé, jamais LLM ; la porte renforce le mur.",
};

/**
 * /compound-besoin-gate — the EL11 panel. The human EXECUTES the gate decision FROM THE SCREEN:
 * "Évaluer la porte", "Casser le right-sizing" (disjunct 1), "Casser le miroir-de-niveau"
 * (disjunct 2), "Détacher le BesoinGraph" (the §5 no-op), "Réinitialiser". ui-completeness
 * (CLAUDE.md §7): no headless capability. ABOVE the wall: writes no truth. Themed (ADR 0010),
 * bilingual (ADR 0011).
 */
export default async function BesoinGatePage() {
	const t = await getTranslations("besoinGate");

	const labels = {
		stateHeading: t("stateHeading"),
		sessionAttached: t("sessionAttached"),
		sessionDetached: t("sessionDetached"),
		currentLevel: t("currentLevel"),
		metaComplete: t("metaComplete"),
		mirrorPresent: t("mirrorPresent"),
		yes: t("yes"),
		no: t("no"),
		evaluateCta: t("evaluateCta"),
		breakRightSizingCta: t("breakRightSizingCta"),
		breakMirrorCta: t("breakMirrorCta"),
		detachCta: t("detachCta"),
		resetCta: t("resetCta"),
		verdictHeading: t("verdictHeading"),
		verdictNoOp: t("verdictNoOp"),
		verdictAllow: t("verdictAllow"),
		verdictBlock: t("verdictBlock"),
		notEnoughLabel: t("notEnoughLabel"),
		hasMonsterLabel: t("hasMonsterLabel"),
		reasonsHeading: t("reasonsHeading"),
		pending: t("pending"),
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
					<BesoinGatePanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
