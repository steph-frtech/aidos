import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinIntakePanel } from "@/components/BesoinIntakePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL15 is the besoin-intake MCP — the capability door over the BesoinGraph (Go MCP
// SDK, ADR 0009). Its read/state/schema decisions are PURE functions of the grammar + the EL05 mapping;
// no LLM enters the server. This panel runs the byte-identical twin lib/besoin-intake.ts (covered by
// lib/besoin-intake.test.ts, vitest + fast-check) so the door is action-capable from the screen. ABOVE
// the wall: the door writes no truth; a capture emits an Idea via the legal idea_capture door (EL05);
// a NoEmit rung (journey/view/invariant) emits none (no silent cast); a kernel write is always refused.

export const metadata: Metadata = {
	title:
		"besoin-intake — la porte MCP capacité au-dessus du BesoinGraph (AIDOS Workbench)",
	description:
		"EL15 : l'MCP besoin-intake (Go MCP SDK, ADR 0009), la porte capacité au-dessus du BesoinGraph. Outils read/state (besoin_graph_state, besoin_level_schema, besoin_list), capture par rung (besoin_capture_product/_journey/_view/_control/_action/_operation/_entity/_invariant), validate (besoin_validate_level, besoin_classify) — déterministes, jamais un LLM. Une capture sur un rung qui mappe émet une Idea (EL05) ; un rung NoEmit n'émet rien (pas de cast silencieux). Above le mur : aucun GRANT kernel/mirrors/fitness, l'écriture kernel toujours refusée ; projets isolés par RLS (S55).",
};

/**
 * /besoin-intake — the EL15 capability-door panel. The human EXECUTES the door FROM THE SCREEN
 * (ui-completeness, CLAUDE.md §7 — no headless capability): pick a level, "Read the level schema"
 * (besoin_level_schema → required fields + EL05 mapping), "Project the capture" (the capture tool +
 * the emit/no-emit decision — no silent cast). Every backend op (ADR 0009) is enumerated in the tool
 * inventory, reachable from a screen. ABOVE the wall, writes no truth. Themed (ADR 0010), bilingual
 * (ADR 0011).
 */
export default async function BesoinIntakePage() {
	const t = await getTranslations("besoinIntake");

	const labels = {
		schemaCta: t("schemaCta"),
		projectCta: t("projectCta"),
		resetCta: t("resetCta"),
		levelLabel: t("levelLabel"),
		schemaHeading: t("schemaHeading"),
		requiredFieldsLabel: t("requiredFieldsLabel"),
		mappingLabel: t("mappingLabel"),
		outgoingRefLabel: t("outgoingRefLabel"),
		projectionHeading: t("projectionHeading"),
		toolLabel: t("toolLabel"),
		emitsLabel: t("emitsLabel"),
		emitsYes: t("emitsYes"),
		emitsNo: t("emitsNo"),
		proposesLabel: t("proposesLabel"),
		toolsHeading: t("toolsHeading"),
		readToolsLabel: t("readToolsLabel"),
		captureToolsLabel: t("captureToolsLabel"),
		validateToolsLabel: t("validateToolsLabel"),
		noEmitNote: t("noEmitNote"),
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
					<BesoinIntakePanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
