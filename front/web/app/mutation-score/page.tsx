import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MutationScorePanel } from "@/components/MutationScorePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { LiveThreshold } from "./LiveThreshold";
import { liveThreshold } from "./liveActions";

// Determinism-first: the mutation-gate verdict is computed by a PURE twin of
// back/runtime/sensors/mutation.Gate (lib/mutation.ts), covered by fast-check
// (lib/mutation.test.ts) anchored on the Go fixtures (ADR 0030 score denominator).
// The action-capable panel re-runs the SAME twin on a selected scenario and renders
// the score gauge against the DECLARED threshold bar (read-only, above the line),
// the pass/block verdict, and the surviving-mutant list. READ-ONLY on the
// threshold (the wall, §2/§8): the bar is read from fitness, never authored — the
// agent is graded by it. Themed (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Score de mutation — le densimètre du serrage du noyau | AIDOS Workbench",
	description:
		"Le densimètre de tightness du noyau d'AIDOS (S40, KRD §19/§43/§59.8) : gremlins (Go) et StrykerJS (front) calculent un score de mutation post-intégration, comparé au seuil DÉCLARÉ lu en lecture seule dans la fitness. 40 % bloque, 80 % passe contre la barre à 0,80. Un mutant survivant = un trou à combler. Le seuil est au-dessus de la ligne : aucune boucle ne l'édite.",
};

// Read the live declared mutation-score bar on every request (the S59 cutover): the bar
// is read through the gateway (read_threshold, SELECT-only on fitness), never baked in.
export const dynamic = "force-dynamic";

export default async function MutationScorePage() {
	const t = await getTranslations("mutationScore");
	const tc = await getTranslations("common");
	const live = await liveThreshold();
	const labels = {
		scenarioLabel: t("scenarioLabel"),
		verdictLabel: t("verdictLabel"),
		verdictPass: t("verdictPass"),
		verdictBlock: t("verdictBlock"),
		scoreLabel: t("scoreLabel"),
		thresholdLabel: t("thresholdLabel"),
		readOnlyBadge: t("readOnlyBadge"),
		survivingTitle: t("survivingTitle"),
		survivingEmpty: t("survivingEmpty"),
		blockReasonLabel: t("blockReasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		historyTitle: t("historyTitle"),
		colScope: t("colScope"),
		colScore: t("colScore"),
		colThreshold: t("colThreshold"),
		colVerdict: t("colVerdict"),
		colStarted: t("colStarted"),
		scenarioBelow: t("scenarioBelow"),
		scenarioAtBar: t("scenarioAtBar"),
		scenarioWeakened: t("scenarioWeakened"),
		scenarioMissingThreshold: t("scenarioMissingThreshold"),
	};

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{t("title")}
				</h1>
				<p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>

				{/* Tutorial — how to read this panel. */}
				<section className="mt-6 rounded-lg border border-border bg-card p-5">
					<h2 className="text-base font-semibold text-foreground">
						{t("tutorialTitle")}
					</h2>
					<ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
						<li>{t("tutorialStep1")}</li>
						<li>{t("tutorialStep2")}</li>
						<li>{t("tutorialStep3")}</li>
						<li>{t("tutorialStep4")}</li>
					</ol>
				</section>

				{/* Worked example — re-run the gate on a chosen scenario. */}
				<section className="mt-6">
					<h2 className="mb-3 text-base font-semibold text-foreground">
						{t("exampleTitle")}
					</h2>
					<MutationScorePanel labels={labels} />
				</section>

				{/* Live declared bar — read through the gateway (read_threshold), demo fallback. */}
				<LiveThreshold
					view={live}
					labels={{
						heading: t("liveHeading"),
						intro: t("liveIntro"),
						live: tc("live"),
						demo: tc("demo"),
						liveTitle: t("liveTitle"),
						demoTitle: t("liveDemoTitle"),
						scopeLabel: t("liveScopeLabel"),
						thresholdLabel: t("thresholdLabel"),
						declaredYes: t("liveDeclaredYes"),
						declaredNo: t("liveDeclaredNo"),
					}}
				/>
			</main>
		</div>
	);
}
