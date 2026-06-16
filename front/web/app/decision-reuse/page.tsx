import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DecisionReusePanel } from "@/components/DecisionReusePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import type { Dimension } from "@/lib/contextgraph";
import { LiveContextGraph } from "./LiveContextGraph";
import { liveContextGraph } from "./liveActions";

// Read the live ContextGraph view of the active project on every request (the S59 cutover):
// the view is read through the gateway (context_graph_query), never baked into a static page.
export const dynamic = "force-dynamic";

// Determinism-first: the reuse gate (the deterministic, LLM-free four-dimension verdict) is a
// pure projection in lib/contextgraph.ts (the twin of back/archive/brain/contextgraph), covered
// by lib/contextgraph.test.ts (fast-check). This Server Component renders the intro + tutorial +
// example; the action-capable panel runs the SAME pure decide() the Go engine runs — no I/O, no
// clock (now passed in), no LLM — so the verdict on screen matches the engine. READ-ONLY (the
// wall): `context` is a truth schema above the waterline; a decision is recorded by the aidos
// writer role via a ChangeSet (S20), never this screen.

export const metadata: Metadata = {
	title:
		"ContextGraphDecision — la réutilisation, permise ou bloquée (AIDOS Workbench)",
	description:
		"La porte de réutilisation déterministe d'AIDOS (KRD §119.2) : le ContextGraph décide si une décision passée peut être REUTILISÉE pour une nouvelle requête, en vérifiant EXACTEMENT quatre dimensions déclarées — time / scope / authority / conditions — et en émettant {may_reuse, reason, checked, required_human_review}. Le verdict est FALSE-DOMINANT : un candidat expiré ou hors-scope donne may_reuse=false. « Le LLM ne vit pas dans le ContextGraph » — le graphe permet ou bloque, les agents proposent, l'Execution Layer agit. Lecture seule (le mur).",
};

/**
 * /decision-reuse — the ContextGraphDecision reuse ledger (S32). The human picks a ledger entry
 * and clicks DÉCIDER; the panel runs the pure twin decide(candidate, request, now) and renders an
 * ALLOW/BLOCK badge, the four dimension chips (time/scope/authority/conditions, pass/fail), the
 * reason, and a needs-human-review flag. An EXPIRED candidate ⇒ BLOCK + time chip lit; an
 * OUT-OF-SCOPE candidate ⇒ BLOCK + scope chip lit (the done criterion made visible).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual
 * (ADR 0011).
 */
export default async function DecisionReusePage() {
	const t = await getTranslations("decisionReuse");
	const tc = await getTranslations("common");
	const graph = await liveContextGraph();

	const dim: Record<Dimension, string> = {
		time: t("dimTime"),
		scope: t("dimScope"),
		authority: t("dimAuthority"),
		conditions: t("dimConditions"),
	};

	const rowTitle: Record<string, string> = {
		expired: t("rowExpired"),
		"out-of-scope": t("rowOutOfScope"),
		allowed: t("rowAllowed"),
		"needs-review": t("rowNeedsReview"),
		"failing-condition": t("rowFailingCondition"),
	};

	const labels = {
		decideCta: t("decideCta"),
		allowBadge: t("allowBadge"),
		blockBadge: t("blockBadge"),
		needsReviewFlag: t("needsReviewFlag"),
		candidateLabel: t("candidateLabel"),
		requestLabel: t("requestLabel"),
		reasonLabel: t("reasonLabel"),
		dimensionsLabel: t("dimensionsLabel"),
		verdictPending: t("verdictPending"),
		dim,
		rowTitle,
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
					<DecisionReusePanel labels={labels} />
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

				{/* Live ContextGraph view — read through the gateway (context_graph_query), demo fallback */}
				<div className="mt-10">
					<LiveContextGraph
						view={graph}
						labels={{
							heading: t("liveHeading"),
							intro: t("liveIntro"),
							empty: t("liveEmpty"),
							live: tc("live"),
							demo: tc("demo"),
							liveTitle: t("liveTitle"),
							demoTitle: t("liveDemoTitle"),
							layersLabel: t("liveLayersLabel"),
							mirrorsLabel: t("liveMirrorsLabel"),
							contractsLabel: t("liveContractsLabel"),
							memoryLabel: t("liveMemoryLabel"),
							loadBearing: t("liveLoadBearing"),
							redMirror: t("liveRedMirror"),
							publicContract: t("livePublicContract"),
						}}
					/>
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
