import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VersionDagPanel } from "@/components/VersionDagPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { liveHeads } from "./actions";
import { LiveHeads } from "./LiveHeads";

// Read the live DAG heads of the active project on every request (the S59 cutover): the
// heads are read through the gateway (dag_heads), never baked into a static page.
export const dynamic = "force-dynamic";

// Determinism-first: the three §121 moves are pure projections in lib/version-dag.ts (mirroring
// back/archive/dag), covered by lib/version-dag.test.ts (fast-check). This Server Component renders
// the intro + tutorial + example; the action-capable panel runs the same pure branch /
// checkoutAncestor / rebranch the Go dag package / the dag MCP run — no I/O, no clock, no rng — so
// the navigation animated on screen matches the engine. READ-ONLY (the wall): the moves mutate local
// panel state to animate; recording a node/edge into dag.node/dag.edge goes via the `aidos` writer
// role through the dag MCP, never a write here.

export const metadata: Metadata = {
	title: "DAG de versions — AIDOS Workbench",
	description:
		"Panneau du DAG de versions d'AIDOS (KRD §120–§125) : l'espace des versions est un DAG, pas une ligne — les phases stables sont des nœuds, les ChangeSets des arêtes. Les trois mouvements §121 — brancher, checkout d'un ancêtre (retour en arrière), rebrancher — font croître le DAG en ajout-seul, à tête mutable. Rien n'est jamais détruit : une ligne abandonnée reste dans le DAG comme stepping stone. Stratifié par la ligne de flottaison (§124) : vérité humaine au-dessus, variantes évolutives en dessous.",
};

/**
 * /version-dag — the version-DAG panel (S24). It renders the §120 graph as two waterline bands
 * (above = human truth, below = evolutionary, §124), the head(s) HIGHLIGHTED, the abandoned-but-
 * present line DIMMED (append-only made visible), and the ChangeSet edges. It EXECUTES the three
 * §121 moves from the screen: branch a line off v1, checkout the ancestor v1 (the head jumps back,
 * v2/w1 stay), rebranch v2a off v1 (a new reachable line, the abandoned line stays). The done
 * criteria, executable: you can branch, checkout an ancestor, and rebranch all work — and the
 * abandoned line is never destroyed.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the moves animate local state; recording goes
 * via the `aidos` writer role through the dag MCP. Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function VersionDagPage() {
	const t = await getTranslations("versionDag");
	const tc = await getTranslations("common");
	const live = await liveHeads();

	const labels = {
		branchLabel: t("branchLabel"),
		checkoutLabel: t("checkoutLabel"),
		rebranchLabel: t("rebranchLabel"),
		resetLabel: t("resetLabel"),
		aboveBand: t("aboveBand"),
		belowBand: t("belowBand"),
		headBadge: t("headBadge"),
		abandonedBadge: t("abandonedBadge"),
		lastEventLabel: t("lastEventLabel"),
		noEvent: t("noEvent"),
		headsLabel: t("headsLabel"),
		reachableLabel: t("reachableLabel"),
		edgesHeading: t("edgesHeading"),
		events: {
			Branched: t("eventBranched"),
			HeadMoved: t("eventHeadMoved"),
			Rebranched: t("eventRebranched"),
		},
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
					<VersionDagPanel labels={labels} />
				</div>

				{/* Live DAG heads — read through the gateway (dag_heads), demo fallback */}
				<div className="mt-10">
					<LiveHeads
						view={live}
						labels={{
							heading: t("liveHeading"),
							intro: t("liveIntro"),
							empty: t("liveEmpty"),
							live: tc("live"),
							demo: tc("demo"),
							liveTitle: t("liveTitle"),
							demoTitle: t("demoTitle"),
						}}
					/>
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
