import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinGrammarPanel } from "@/components/BesoinGrammarPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the closed BesoinLevel grammar (the 7 §23 SOURCE rungs + the 2 transversal
// bands, total order, hard refusal of out-of-grammar) is a pure projection in lib/besoin-grammar.ts
// (the twin of back/runtime/besoin/grammar.go), covered by lib/besoin-grammar.test.ts
// (vitest + fast-check). This Server Component renders the intro + tutorial; the action-capable panel
// RUNS the SAME pure functions the Go authority runs — no I/O, no clock, no LLM. ABOVE the wall and
// read-only against truth: EL02 fixes the grammar shape, it writes no kernel/mirror/fitness.

export const metadata: Metadata = {
	title:
		"Grammaire du besoin — les 7 rungs SOURCE + bandes transversales (AIDOS Workbench)",
	description:
		"EL02 : la grammaire CLOSE BesoinLevel. Les 7 rungs SOURCE de la verticale KRD §23 (product→journey→view→control→action→operation→entity) en ordre total, plus les 2 bandes transversales (invariant ∀, policy attachée à operation/entity). Chaque rung nomme ses champs requis + sa référence sortante (control.triggers→action, action.invoke→operation, operation.mutate→entity). saga/temporal/globalinvariant sont DÉLIBÉRÉMENT hors-grammaire-v1 (OpenQuestion déclarée), refusés durement, jamais aliasés. Tout est fonction pure (déterminisme), au-dessus du mur (aucune écriture vérité).",
};

/**
 * /compound-besoin-grammar — the EL02 grammar panel. The human EXECUTES the closed grammar FROM THE
 * SCREEN: "Lister la grammaire" renders the total order + bands + out-of-scope layers; "Analyser le
 * niveau" parses an input, refusing anything out of grammar HARD. ui-completeness (CLAUDE.md §7): no
 * headless capability. ABOVE the wall, read-only. Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinGrammarPage() {
	const t = await getTranslations("besoinGrammar");

	const labels = {
		listCta: t("listCta"),
		parseCta: t("parseCta"),
		parsePlaceholder: t("parsePlaceholder"),
		pending: t("pending"),
		orderHeading: t("orderHeading"),
		bandsHeading: t("bandsHeading"),
		oosHeading: t("oosHeading"),
		colRung: t("colRung"),
		colNext: t("colNext"),
		colRef: t("colRef"),
		colFields: t("colFields"),
		leaf: t("leaf"),
		none: t("none"),
		parseHeading: t("parseHeading"),
		parseOk: t("parseOk"),
		parseUnknown: t("parseUnknown"),
		parseOutOfScope: t("parseOutOfScope"),
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
					<BesoinGrammarPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
