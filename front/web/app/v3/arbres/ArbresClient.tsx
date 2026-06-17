"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type NodeApi, Tree } from "react-arborist";
import type { ArbreNodeDTO, ArbresSnapshot } from "./actions";

/**
 * /v3/arbres — L'ARBRE DE COMPOSITION des kernels, client-only (React Arborist, virtualisé).
 *
 * S59 CUTOVER (ADR 0092 — le moteur Go est l'UNIQUE source vivante). Ce composant ne calcule PLUS
 * rien : il REÇOIT le snapshot déjà résolu (la STRUCTURE de l'arbre composée par le calcul pur (repli démo) côté
 * serveur + le VERDICT §109 LU LIVE depuis le moteur Go via la passerelle — Server Action
 * `arbresSnapshot`) et ne fait que le RENDRE (React Arborist n'est QUE du rendu virtualisé, il ne
 * juge rien). Il n'importe AUCUNE logique twin (seulement les TYPES de actions, type-only) → le
 * cliquet T5 (NO_TWIN_AS_LIVE_PATH) reste vert : le twin lib/v2/kernel-tree ne sert plus de source
 * d'affichage live, il vit derrière la frontière readVia dans actions.ts (repli-démo).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on DÉPLIE / REPLIE chaque nœud (le drill-down fractal §49) ;
 *   - un CLIC sur un kernel RÉVÈLE ses coordonnées (niveau, facette, profondeur, voyant) ;
 *   - un lien OUVRE son anatomie (l'écran /v2/anatomie/[kernel], réel et atteignable).
 *
 * LE BADGE source "live"|"demo" (JAMAIS « calcul pur (repli démo) ») dit l'origine du verdict : le moteur Go
 * (live) ou le repli-démo déterministe (la même loi §109 pure reproduite localement).
 *
 * LE MUR (CLAUDE.md §2) : l'arbre + le verdict sont des projections de lecture ; l'écran n'écrit
 * AUCUNE vérité. Recomposer/geler un kernel passe par idée → miroir → /goal → approbation.
 * Themed (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (libellés passés par le serveur).
 */

interface ArbresLabels {
	treeHeading: string;
	treeIntro: string;
	nodeCount: string;
	empty: string;
	expand: string;
	collapse: string;
	selectedHeading: string;
	selectHint: string;
	levelLabel: string;
	facetLabel: string;
	depthLabel: string;
	openAnatomy: string;
	wallNote: string;
	verdictHeading: string;
	verdictGreen: string;
	verdictRed: string;
	drillDownHint: string;
	cycleRefused: string;
	weightsLegend: string;
	sourceLive: string;
	sourceDemo: string;
}

/** L'adaptateur Arborist : ArbreNodeDTO (serveur) → la forme { id, name, children } de la lib. */
interface ArboristNode {
	id: string;
	name: string;
	level: string;
	facet: string;
	depth: number;
	verdict: "GREEN" | "RED";
	children: ArboristNode[];
}

function toArborist(n: ArbreNodeDTO): ArboristNode {
	return {
		id: n.id,
		name: n.label,
		level: n.level,
		facet: n.facet,
		depth: n.depth,
		verdict: n.verdict,
		children: n.children.map(toArborist),
	};
}

export function ArbresClient({
	snapshot,
	labels,
}: {
	snapshot: ArbresSnapshot;
	labels: ArbresLabels;
}) {
	// le snapshot est déjà résolu côté serveur ; on n'adapte que la forme pour la lib de rendu.
	const roots = useMemo(() => snapshot.roots.map(toArborist), [snapshot.roots]);
	const [selected, setSelected] = useState<ArboristNode | null>(null);

	const isLive = snapshot.source === "live";
	const rootGreen = snapshot.rootVerdict === "GREEN";

	return (
		<div className="space-y-6">
			{/* Le VERDICT §109 + le badge source + la légende des poids. */}
			<section data-testid="v3-arbres-verdict" className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-base font-semibold text-foreground">
						{labels.verdictHeading}
					</h2>
					<span
						data-testid="v3-arbres-source"
						data-source={snapshot.source}
						className={[
							"rounded-full px-2.5 py-0.5 font-mono text-[11px]",
							isLive
								? "bg-primary/10 text-primary"
								: "bg-muted text-muted-foreground",
						].join(" ")}
					>
						{isLive ? labels.sourceLive : labels.sourceDemo}
					</span>
				</div>

				<div
					data-testid="v3-arbres-root-verdict"
					data-verdict={snapshot.rootVerdict}
					className={[
						"flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
						rootGreen
							? "border-primary/30 bg-primary/5 text-primary"
							: "border-destructive/40 bg-destructive/5 text-destructive",
					].join(" ")}
				>
					<span className="font-mono text-xs">●</span>
					<span>{rootGreen ? labels.verdictGreen : labels.verdictRed}</span>
				</div>

				{snapshot.cycle.length > 0 ? (
					<p
						data-testid="v3-arbres-cycle"
						className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive"
					>
						{labels.cycleRefused} : {snapshot.cycle.join(" → ")}
					</p>
				) : null}

				{snapshot.drillDown.length > 1 && !rootGreen ? (
					<div data-testid="v3-arbres-drilldown" className="space-y-1">
						<p className="text-xs text-muted-foreground">
							{labels.drillDownHint}
						</p>
						<ol className="flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-xs">
							{snapshot.drillDown.map((step, i) => (
								<li
									key={step.layerId}
									className="flex items-center gap-1"
									data-testid={`v3-arbres-drill-${step.layerId}`}
								>
									{i > 0 ? (
										<span className="text-muted-foreground">→</span>
									) : null}
									<span
										className={[
											"rounded px-1.5 py-0.5",
											step.aggregate === "RED"
												? "bg-destructive/10 text-destructive"
												: "bg-muted text-muted-foreground",
										].join(" ")}
									>
										{step.layerId}
									</span>
								</li>
							))}
						</ol>
					</div>
				) : null}

				<p
					data-testid="v3-arbres-weights"
					className="font-mono text-[11px] text-muted-foreground"
				>
					{labels.weightsLegend} : {snapshot.weights.join(" · ")}
				</p>
			</section>

			{/* L'arbre fractal virtualisé. */}
			<section data-testid="v3-arbres-tree" className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{labels.treeHeading}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{labels.treeIntro}
					</p>
				</div>

				<p
					data-testid="v3-arbres-count"
					className="font-mono text-xs text-muted-foreground"
				>
					{labels.nodeCount} : {snapshot.total}
				</p>

				{roots.length === 0 ? (
					<p
						data-testid="v3-arbres-empty"
						className="rounded-lg border border-border bg-muted px-4 py-6 text-center text-sm text-muted-foreground"
					>
						{labels.empty}
					</p>
				) : (
					<div className="rounded-xl border border-border bg-card p-2">
						<Tree<ArboristNode>
							data={roots}
							idAccessor="id"
							childrenAccessor="children"
							openByDefault={false}
							width="100%"
							height={520}
							indent={18}
							rowHeight={32}
							overscanCount={8}
						>
							{({ node, style, dragHandle }) => (
								<ArbreRow
									node={node}
									style={style}
									dragHandle={dragHandle}
									expand={labels.expand}
									collapse={labels.collapse}
									onSelect={() => setSelected(node.data)}
								/>
							)}
						</Tree>
					</div>
				)}
			</section>

			<section data-testid="v3-arbres-selected" className="space-y-2">
				<h2 className="text-base font-semibold text-foreground">
					{labels.selectedHeading}
				</h2>
				{selected === null ? (
					<p className="text-sm text-muted-foreground">{labels.selectHint}</p>
				) : (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
						<div className="flex min-w-0 flex-col gap-1">
							<span className="font-mono text-primary">{selected.id}</span>
							<span className="text-foreground">{selected.name}</span>
							<span className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
								<span>
									{labels.levelLabel} : {selected.level}
								</span>
								<span>
									{labels.facetLabel} : {selected.facet}
								</span>
								<span>
									{labels.depthLabel} : {selected.depth}
								</span>
							</span>
						</div>
						<Link
							href={`/v2/anatomie/${selected.id}`}
							data-testid="v3-arbres-open-anatomy"
							className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						>
							{labels.openAnatomy} →
						</Link>
					</div>
				)}
			</section>

			<p
				data-testid="v3-arbres-wall-note"
				className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
			>
				{labels.wallNote}
			</p>
		</div>
	);
}

function ArbreRow({
	node,
	style,
	dragHandle,
	expand,
	collapse,
	onSelect,
}: {
	node: NodeApi<ArboristNode>;
	style: React.CSSProperties;
	dragHandle?: (el: HTMLDivElement | null) => void;
	expand: string;
	collapse: string;
	onSelect: () => void;
}) {
	const caret = node.isLeaf ? "•" : node.isOpen ? "▾" : "▸";
	const red = node.data.verdict === "RED";
	return (
		<div
			style={style}
			ref={dragHandle}
			data-testid={`v3-arbres-node-${node.data.id}`}
			data-open={node.isOpen}
			data-verdict={node.data.verdict}
			className={[
				"flex items-center gap-2 rounded-md px-2 text-sm transition-colors",
				node.isSelected
					? "bg-primary/10 text-primary"
					: "text-foreground hover:bg-muted",
			].join(" ")}
		>
			<button
				type="button"
				aria-label={node.isOpen ? collapse : expand}
				data-testid={`v3-arbres-toggle-${node.data.id}`}
				onClick={(e) => {
					e.stopPropagation();
					node.toggle();
				}}
				className="w-4 shrink-0 text-muted-foreground"
			>
				{caret}
			</button>
			<button
				type="button"
				data-testid={`v3-arbres-select-${node.data.id}`}
				onClick={onSelect}
				className="flex flex-1 items-center gap-2 truncate text-left"
			>
				<span
					aria-hidden
					className={[
						"shrink-0 font-mono text-[10px]",
						red ? "text-destructive" : "text-primary",
					].join(" ")}
				>
					●
				</span>
				<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
					{node.data.facet}
				</span>
				<span className="truncate">{node.data.name}</span>
				<span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
					{node.data.level}
				</span>
			</button>
		</div>
	);
}
