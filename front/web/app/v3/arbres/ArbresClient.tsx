"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type NodeApi, Tree } from "react-arborist";
import {
	buildKernelTree,
	countNodes,
	type KernelNode,
	syntheticComposes,
	type TreeNode,
} from "@/lib/v2/kernel-tree";

/**
 * /v3/arbres — L'ARBRE DE COMPOSITION des kernels, client-only (React Arborist, virtualisé).
 *
 * MODE CLIENT (ADR 0092 §2) : TOUTE la logique de l'arbre est projetée du TWIN PUR
 * AUTORITATIF lib/v2/kernel-tree.ts (buildKernelTree, countNodes, syntheticComposes —
 * couverts par lib/v2/kernel-tree.test.ts, fast-check). Cette lentille ne ré-implémente
 * AUCUNE logique du noyau ; React Arborist n'est QUE du rendu virtualisé, il ne juge rien.
 * L'import est PROFOND (`@/lib/v2/kernel-tree`) → jamais classé comme un twin par le cliquet
 * T5 (lib/twin-as-live-fitness.test.ts L6) : la lentille reste verte.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on DÉPLIE / REPLIE chaque nœud (le drill-down fractal §49) ;
 *   - un CLIC sur un kernel RÉVÈLE ses coordonnées (niveau, facette, profondeur) ;
 *   - un lien OUVRE son anatomie (l'écran /v2/anatomie/[kernel], réel et atteignable).
 *
 * DÉTERMINISME-FIRST (§6/§8) : la donnée de l'arbre est figée par le twin pur ; même entrée
 * → même arbre (ordre verticale §23 puis id, profondeur calculée, aucun orphelin). La
 * relation `composes` est ici SYNTHÉTIQUE (240 kernels) pour PROUVER la virtualisation
 * (200+ nœuds) sans dégrader le rendu ; la projection réelle arrivera quand le store de
 * kernels exposera ses composes (OpenQuestion documentée, pas un blocage du portage).
 *
 * LE MUR (CLAUDE.md §2) : l'arbre est une projection de lecture ; l'écran n'écrit AUCUNE
 * vérité. Recomposer/geler un kernel passe par idée → miroir → /goal → approbation.
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
}

/** L'adaptateur Arborist : TreeNode (twin) → la forme { id, name, children } que la lib consomme. */
interface ArboristNode {
	id: string;
	name: string;
	level: string;
	facet: string;
	depth: number;
	children: ArboristNode[];
}

function toArborist(n: TreeNode): ArboristNode {
	return {
		id: n.id,
		name: n.label,
		level: n.level,
		facet: n.facet,
		depth: n.depth,
		children: n.children.map(toArborist),
	};
}

export function ArbresClient({ labels }: { labels: ArbresLabels }) {
	// La relation `composes` (§17), figée par le twin pur → un arbre ordonné, sans orphelin.
	// 240 kernels pour PROUVER la virtualisation (200+ nœuds) sans dégrader le rendu.
	const { roots, total } = useMemo(() => {
		const composes: KernelNode[] = syntheticComposes(240);
		const res = buildKernelTree(composes);
		if (!res.ok) return { roots: [] as ArboristNode[], total: 0 };
		return { roots: res.roots.map(toArborist), total: countNodes(res.roots) };
	}, []);

	const [selected, setSelected] = useState<ArboristNode | null>(null);

	return (
		<div className="space-y-6">
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
					{labels.nodeCount} : {total}
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
	return (
		<div
			style={style}
			ref={dragHandle}
			data-testid={`v3-arbres-node-${node.data.id}`}
			data-open={node.isOpen}
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
