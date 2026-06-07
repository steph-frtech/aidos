import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { streamGoalAction } from "./actions";
import { GoalStreamPanel } from "./GoalStreamPanel";

export const metadata: Metadata = {
	title: "Goal en direct — AIDOS Workbench",
	description:
		"S60 — la passerelle stream le goal ouvert du projet actif : le set rouge (les miroirs encore rouges qui SONT le goal, §56), la RedWorkQueue (§49.4) et l'état réel des senseurs. Le set rouge streamé égale le set rouge calculé pour ce goal connu. Fallback déterministe (live/démo) quand aucune passerelle n'est joignable.",
};

export const dynamic = "force-dynamic";

/**
 * /goal-stream — the S60 live-goal panel (app-builder EPIC 2). It streams the active
 * project's open goal from the gateway (S58) via the typed SDK (S59): the red set, the
 * RedWorkQueue, and the real sensors — tagged live/demo. It is action-capable
 * (ui-completeness): the "refresh the stream" control EXECUTES the typed SDK read. It
 * writes NO truth — opening/closing a goal goes via propose → ChangeSet (CLAUDE.md §2).
 * Touches no existing route. Themed (ADR 0010) + bilingual (ADR 0011).
 */
export default async function GoalStreamPage() {
	const t = await getTranslations("goalStream");
	const initial = await streamGoalAction("alice", "proj-a");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<GoalStreamPanel initial={initial} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
