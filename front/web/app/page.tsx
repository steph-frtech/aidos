import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GraphCockpit } from "@/app/_graph/GraphCockpit";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { buildGraph } from "@/lib/workbench-graph";
import { EXAMPLE_HEAD } from "@/lib/workbench-graph-data";

/**
 * / — the full Workbench graph cockpit (AIDOS step S44, ADR 0010 design system + ADR 0011
 * bilingue). It renders the WorkbenchGraph (a deterministic, READ-ONLY projection of prior
 * kernel truth — lib/workbench-graph.ts) as a navigable map: button → view → action →
 * operation → entity → mirror → scope → incident, each node DEEP-LINKING to its per-step
 * panel via its route, under a declared color legend (truth-type / liveness / red-wave).
 * The cockpit LINKS, it never re-renders those panels. Read-only; the wall is untouched.
 *
 * Determinism-first: buildGraph is pure; same head ⇒ byte-identical graph + a content
 * graph_hash, so the UI snapshot is stable. A dangling/unknown ref ⇒ a BlockReason surfaced
 * inline, never a crash.
 */
export default async function Home() {
	const t = await getTranslations("home");
	const built = buildGraph(EXAMPLE_HEAD);

	const labels = {
		nodesHeading: t("nodesHeading"),
		edgesHeading: t("edgesHeading"),
		legendHeading: t("legendHeading"),
		open: t("open"),
		fromLabel: t("fromLabel"),
		toLabel: t("toLabel"),
		relationLabel: t("relationLabel"),
		hashLabel: t("hashLabel"),
		kind: {
			button: t("kindButton"),
			view: t("kindView"),
			action: t("kindAction"),
			operation: t("kindOperation"),
			entity: t("kindEntity"),
			mirror: t("kindMirror"),
			scope: t("kindScope"),
			incident: t("kindIncident"),
		},
		dimension: {
			truth_type: t("dimTruthType"),
			liveness: t("dimLiveness"),
			red_wave: t("dimRedWave"),
		},
	} as const;

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:px-8 sm:py-20">
				{/* Hero */}
				<section className="space-y-5">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<h1 className="max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
						{t("subtitle")}
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
						<Link
							href="/brain"
							data-testid="brain-link"
							className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
						>
							{t("brainLink")}
						</Link>
					</div>
				</section>

				{/* Tutorial — how to read the cockpit */}
				<section
					aria-label={t("tutorialHeading")}
					data-testid="tutorial"
					className="mt-12 space-y-2 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("tutorialBody")}
					</p>
				</section>

				{/* The full graph cockpit */}
				<section aria-label={t("graphHeading")} className="mt-10 space-y-6">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("graphHeading")}
					</h2>
					{built.ok ? (
						<GraphCockpit
							nodes={built.graph.nodes}
							edges={built.graph.edges}
							legend={built.graph.legend}
							graphHash={built.graph.graphHash}
							labels={labels}
						/>
					) : (
						<div
							data-testid="graph-blocked"
							className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
						>
							<p className="font-semibold">{built.block.code}</p>
							<p className="mt-1">{built.block.explanation}</p>
						</div>
					)}
				</section>

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

				{/* Footer */}
				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
