"use client";

import type { InspectionView } from "./live";

/**
 * InspectionClient — la VUE D'INSPECTION du backlog gouverné (ADR 0073 Plan B), portée EN PROPRE
 * dans le shell V3 (parcours « Comprendre »). Elle RÉVÈLE la PROJECTION truth-store du projet — les
 * idées capturées (idea_list) + la topologie du DAG (dag_get) — lue LIVE par la passerelle (ADR
 * 0092), avec un repli démo honnête. Ce composant ne fait que du RENDU ; il ne juge rien.
 *
 * HONNÊTE SUR SA NATURE : c'est une vue STRUCTURELLE d'inspection (l'inverse gouverné, lossy) —
 * la conversation et la reprise du projet vivent dans le TRANSCRIPT (Plan A), jamais ici. LE MUR
 * (§2) : lecture seule below-the-line — aucune écriture-vérité depuis l'écran.
 */

interface Labels {
	ideasHeading: string;
	dagHeading: string;
	emptyIdeas: string;
	dagNodes: string;
	dagEdges: string;
	dagHeads: string;
	sourceLabel: string;
	sourceLive: string;
	sourceDemo: string;
	sourceTitle: string;
	honestNote: string;
	wallNote: string;
	colProposes: string;
	colIntent: string;
	colStatus: string;
}

export function InspectionClient({
	view,
	labels,
}: {
	view: InspectionView;
	labels: Labels;
}) {
	const live = view.source === "live";
	return (
		<div className="space-y-6" data-testid="v3-inspection-lens">
			{/* La source honnête (live moteur Go / démo). */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.honestNote}
				</p>
				<span
					data-testid="v3-inspection-source"
					data-source={view.source}
					title={labels.sourceTitle}
					className={[
						"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
						live
							? "bg-primary/10 text-primary"
							: "bg-muted text-muted-foreground",
					].join(" ")}
				>
					<span
						aria-hidden="true"
						className={[
							"size-1.5 rounded-full",
							live ? "bg-primary" : "bg-muted-foreground",
						].join(" ")}
					/>
					{labels.sourceLabel}: {live ? labels.sourceLive : labels.sourceDemo}
				</span>
			</div>

			{/* LE DAG — le résumé de la topologie (nœuds / arêtes / têtes). */}
			<section
				data-testid="v3-inspection-dag"
				className="grid grid-cols-3 gap-3"
			>
				{(
					[
						["nodes", labels.dagNodes, view.dag.nodes],
						["edges", labels.dagEdges, view.dag.edges],
						["heads", labels.dagHeads, view.dag.heads],
					] as const
				).map(([key, label, value]) => (
					<div
						key={key}
						data-testid={`v3-inspection-dag-${key}`}
						className="rounded-xl border border-border bg-card p-4 text-center"
					>
						<p className="font-mono text-2xl font-semibold text-foreground">
							{value}
						</p>
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							{label}
						</p>
					</div>
				))}
			</section>

			{/* LES IDÉES capturées (la projection idea_list). */}
			<section
				data-testid="v3-inspection-ideas"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.ideasHeading}{" "}
					<span className="font-mono text-muted-foreground">
						({view.ideas.length})
					</span>
				</h2>
				{view.ideas.length === 0 ? (
					<p
						data-testid="v3-inspection-empty"
						className="text-sm text-muted-foreground"
					>
						{labels.emptyIdeas}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full border-collapse text-sm">
							<thead>
								<tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
									<th className="p-2">{labels.colProposes}</th>
									<th className="p-2">{labels.colIntent}</th>
									<th className="p-2">{labels.colStatus}</th>
								</tr>
							</thead>
							<tbody>
								{view.ideas.map((idea) => (
									<tr
										key={idea.id}
										data-testid={`v3-inspection-idea-${idea.id.slice(0, 8)}`}
										className="border-t border-border"
									>
										<td className="p-2">
											<span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
												{idea.proposes}
											</span>
										</td>
										<td className="p-2 text-foreground">{idea.intent}</td>
										<td className="p-2">
											<span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
												{idea.status}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* LE MUR (§2) : lecture seule. */}
			<section
				data-testid="v3-inspection-wall"
				className="rounded-xl border border-primary/30 bg-primary/5 p-5"
			>
				<p className="text-sm text-primary">{labels.wallNote}</p>
			</section>
		</div>
	);
}
