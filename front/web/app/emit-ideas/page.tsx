import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmitIdeasPanel } from "@/components/EmitIdeasPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL16 is the deterministic emitter EmitIdeas(graph) → []Idea (back/runtime/besoin/
// emit_ideas.go + the besoin_emit_ideas MCP tool), GOVERNED by the closed table LevelToProposes (EL05).
// Its decision is a PURE function of the graph + the mapping — no LLM enters. This panel runs the
// byte-identical twin lib/emit-ideas.ts (covered by lib/emit-ideas.test.ts, vitest + fast-check) so the
// emitter is action-capable from the screen. ABOVE the wall: every emitted Idea is a DRAFT candidate
// with no version and no mirror (HasMirror always false); promotion is /goal (hand-off S64).

export const metadata: Metadata = {
	title:
		"emit-ideas — l'émetteur déterministe EmitIdeas(graph) → []Idea (AIDOS Workbench)",
	description:
		"EL16 : l'émetteur déterministe EmitIdeas(graph) → []Idea, via la porte idea-intake, gouverné par la table LevelToProposes (EL05). Pour chaque nœud RESOLVED dont le rung MAPPE, une Idea draft est émise (proposes = LevelToProposes(level), intent = l'utterance verbatim, provenance humaine) ; les rungs NoEmit (journey/view/invariant) n'émettent rien (pas de cast silencieux). Ré-émission idempotente (content-adressée). Above le mur : aucune écriture kernel/mirror, HasMirror toujours false ; la promotion = écrire le miroir via /goal (hand-off S64).",
};

/**
 * /emit-ideas — the EL16 emitter panel. The human EXECUTES the emitter FROM THE SCREEN
 * (ui-completeness, CLAUDE.md §7 — no headless capability): shape the already-decided graph (toggle
 * each rung's status), then "Émettre les Ideas" runs emitIdeas(nodes) — the besoin_emit_ideas tool:
 * one draft Idea per RESOLVED MAPPING rung, NoEmit rungs excluded (no silent cast). Every verdict is
 * COMPUTED by the deterministic twin, never an LLM. ABOVE the wall, writes no truth. Themed (ADR 0010),
 * bilingual (ADR 0011).
 */
export default async function EmitIdeasPage() {
	const t = await getTranslations("emitIdeas");

	const labels = {
		intro: t("panelIntro"),
		rungsHeading: t("rungsHeading"),
		statusEmpty: t("statusEmpty"),
		statusDrafting: t("statusDrafting"),
		statusResolved: t("statusResolved"),
		mapsLabel: t("mapsLabel"),
		noEmitLabel: t("noEmitLabel"),
		emitCta: t("emitCta"),
		resetCta: t("resetCta"),
		backlogHeading: t("backlogHeading"),
		countLabel: t("countLabel"),
		proposesLabel: t("proposesLabel"),
		intentLabel: t("intentLabel"),
		provenanceLabel: t("provenanceLabel"),
		statusLabel: t("statusLabel"),
		emptyBacklog: t("emptyBacklog"),
		wallNote: t("wallNote"),
		handoffNote: t("handoffNote"),
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
					<EmitIdeasPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
