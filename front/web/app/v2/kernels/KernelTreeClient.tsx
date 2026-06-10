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
 * WB2-04 — l'ARBRE DE COMPOSITION des kernels, client-only (React Arborist, virtualisé).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — on DÉPLIE /
 * REPLIE chaque nœud (drill-down fractal) et un CLIC sur un kernel OUVRE son anatomie (WB2-06,
 * /v2/anatomie/[kernel]). Aucune écriture-vérité (le mur, §2) : l'arbre est une projection.
 *
 * DÉTERMINISME-FIRST : la donnée de l'arbre est figée par le twin pur lib/v2/kernel-tree.ts
 * (buildKernelTree, ordonné, sans orphelin). React Arborist n'est QUE du rendu virtualisé ; il ne
 * juge rien. La relation `composes` est ici synthétique (240 kernels) — la projection réelle
 * arrivera quand le store de kernels exposera ses composes (OpenQuestion documentée).
 */

type Strings = Record<string, string>;

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

export function KernelTreeClient({ t }: { t: Strings }) {
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
		<div data-testid="v2-kernels-tree" className="space-y-4">
			<p
				data-testid="v2-kernels-count"
				className="font-mono text-xs text-muted-foreground"
			>
				{t.nodeCount} : {total}
			</p>

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
						<KernelRow
							node={node}
							style={style}
							dragHandle={dragHandle}
							onSelect={() => setSelected(node.data)}
						/>
					)}
				</Tree>
			</div>

			{selected && (
				<div
					data-testid="v2-kernels-selected"
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
				>
					<span className="text-foreground">
						<span className="font-mono text-primary">{selected.id}</span> ·{" "}
						{selected.level} · {selected.facet} — {selected.name}
					</span>
					<Link
						href={`/v2/anatomie/${selected.id}`}
						data-testid="v2-kernels-open-anatomy"
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{t.openAnatomy} →
					</Link>
				</div>
			)}
		</div>
	);
}

function KernelRow({
	node,
	style,
	dragHandle,
	onSelect,
}: {
	node: NodeApi<ArboristNode>;
	style: React.CSSProperties;
	dragHandle?: (el: HTMLDivElement | null) => void;
	onSelect: () => void;
}) {
	const caret = node.isLeaf ? "•" : node.isOpen ? "▾" : "▸";
	return (
		<div
			style={style}
			ref={dragHandle}
			data-testid={`v2-kernels-node-${node.data.id}`}
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
				aria-label={node.isOpen ? "replier" : "déplier"}
				data-testid={`v2-kernels-toggle-${node.data.id}`}
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
				data-testid={`v2-kernels-select-${node.data.id}`}
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
