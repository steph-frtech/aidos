import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GoalPanel } from "@/components/GoalPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the goal engine (OpenGoal + the four-condition non-gameable stop) is a pure
// projection in lib/goal.ts (the twin of back/runtime/goal), covered by lib/goal.test.ts (fast-check).
// This Server Component renders the intro + tutorial + example; the action-capable panel runs the SAME
// pure stopConditions/isClosed the Go engine runs — no I/O, no clock, no rng — so the verdict on screen
// matches the engine. READ-ONLY (the wall): opening a goal and stamping it CLOSED are TRUTH writes
// owned by the aidos CLI role via the /goal flow + S20's commit-gate; the agent is SELECT-only on
// ideas.goal — never a write (and never a CLOSED stamp) from this screen.

export const metadata: Metadata = {
	title: "Goal — moteur de goal (AIDOS Workbench)",
	description:
		"Le moteur de goal d'AIDOS (KRD §56–§59, §63 ①, LIVRE XX) : la seule porte légitime d'une idée vers la vérité — idea → mirror → /goal. Un goal est un ChangeSet DRAFT (S20) portant le spec_delta + mirror_delta de l'idée PLUS le SET ROUGE — les miroirs qui échouent et QUI SONT le goal (§56 : « le set rouge EST la todo-list »). Le stop est NON-GAMEABLE (§57 ①/§8) : un goal se ferme SEULEMENT quand set rouge→vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ aucun monstre — jamais sur la déclaration de l'agent. « Done » est calculé, jamais déclaré. Lecture seule (le mur).",
};

/**
 * /goal — the goal-engine panel (S29). It renders the current goal: the source idea, the DRAFT
 * ChangeSet badge, the red set (each failing mirror red → green), the live non-gameable stop indicator
 * with its four computed conditions (red set→green · prior green intact · mutation ≥ threshold · no
 * monster), and the budgets burndown. A fresh goal shows a DRAFT ChangeSet + ≥1 red mirror with the
 * stop NOT satisfied; once the red set is green and prior green is intact the stop flips to satisfied.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the goal + stop verdict are RENDERED, never
 * re-implemented as truth here. Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function GoalPage() {
	const t = await getTranslations("goal");

	const labels = {
		openGoalCta: t("openGoalCta"),
		checkStopRedCta: t("checkStopRedCta"),
		checkStopGreenCta: t("checkStopGreenCta"),
		sourceIdeaLabel: t("sourceIdeaLabel"),
		changeSetLabel: t("changeSetLabel"),
		draftBadge: t("draftBadge"),
		redSetHeading: t("redSetHeading"),
		redMirrorRed: t("redMirrorRed"),
		redMirrorGreen: t("redMirrorGreen"),
		statusLabel: t("statusLabel"),
		stopHeading: t("stopHeading"),
		stopSatisfied: t("stopSatisfied"),
		stopNotSatisfied: t("stopNotSatisfied"),
		condRedSetGreen: t("condRedSetGreen"),
		condPriorGreen: t("condPriorGreen"),
		condMutation: t("condMutation"),
		condNoMonster: t("condNoMonster"),
		budgetsHeading: t("budgetsHeading"),
		budgetTime: t("budgetTime"),
		budgetTurns: t("budgetTurns"),
		budgetTokens: t("budgetTokens"),
		closeNote: t("closeNote"),
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

				{/* Tutorial — how to read & drive the screen */}
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
					<GoalPanel labels={labels} />
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
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
