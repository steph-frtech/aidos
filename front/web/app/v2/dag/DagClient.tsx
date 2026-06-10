"use client";

import {
	Background,
	Controls,
	type Edge,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import {
	type DagNode,
	heads,
	isReachable,
	type Stratum,
	syntheticDag,
	topoSort,
} from "@/lib/v2/version-dag";

/**
 * WB2-07 — le VERSION DAG (S24) rendu en React Flow (ADR 0053 : React Flow pour le visuel). Les
 * NŒUDS = des versions (phases stables, identité = hash content-addressé), les ARÊTES = des ChangeSets.
 * Le DAG est APPEND-ONLY : la ligne abandonnée (v2) reste DESSINÉE (dimmée, jamais supprimée) ; la
 * STRATIFICATION de la ligne de flottaison (§124) est dessinée en deux bandes (above = vérité humaine,
 * en haut ; below = évolutionnaire, en bas). La tête courante est mise en avant.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — PAN/ZOOM est
 * activé (React Flow Controls + molette + drag), et CLIQUER un nœud-version l'OUVRE (descend dans son
 * détail : son hash, ses parents, sa strate, sa tête, son atteignabilité depuis la racine). Le MUR
 * (CLAUDE.md §2) : projection de lecture, aucune écriture-vérité — aucun drag de nœud, aucune
 * connexion, aucune requête d'écriture ; la promotion reste idée → miroir → /goal.
 *
 * DÉTERMINISME-FIRST : la donnée vient du twin pur (lib/v2/version-dag) — le DAG canonique §120, son
 * tri topologique et son atteignabilité sont COMPUTÉS, jamais ici. React Flow n'est que du rendu.
 */

type Strings = Record<string, string>;

/** La position d'un nœud, déterministe : x par ligne topologique, y par bande de strate. */
type DagNodeData = {
	node: DagNode;
	headLabel: string;
};

const STRATUM_RING: Record<Stratum, string> = {
	above: "border-blue-500/50 bg-blue-500/5",
	below: "border-violet-500/50 bg-violet-500/5",
};

/** Le nœud-version : un bouton (action-capable) menant au détail. data-testid pour l'e2e. */
function VersionNode({ data }: NodeProps<Node<DagNodeData>>) {
	const { node } = data;
	return (
		<div
			data-testid={`v2-dag-node-${node.label}`}
			data-head={node.head ? "true" : "false"}
			data-stratum={node.stratum}
			className={[
				"nopan rounded-lg border px-3 py-2 text-center shadow-sm transition-colors",
				STRATUM_RING[node.stratum],
				node.head ? "ring-2 ring-primary" : "opacity-70",
			].join(" ")}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
				isConnectable={false}
			/>
			<span className="block text-sm font-semibold text-foreground">
				{node.label}
				{node.head ? <span className="ml-1 text-primary">●</span> : null}
			</span>
			<span className="block font-mono text-[0.6rem] text-muted-foreground">
				{node.id}
			</span>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-transparent !border-0"
				isConnectable={false}
			/>
		</div>
	);
}

const nodeTypes = { version: VersionNode };

export function DagClient({ t }: { t: Strings }) {
	// La donnée vient du twin PUR (déterministe) — le DAG canonique §120 + son atlas label→id.
	const { dag, sorted, rootId } = useMemo(() => {
		const built = syntheticDag();
		const sorted = topoSort(built.dag);
		const root = built.dag.nodes.find((n) => n.parentIds.length === 0);
		return {
			dag: built.dag,
			sorted,
			rootId: root?.id ?? built.dag.nodes[0]?.id ?? "",
		};
	}, []);

	const [openId, setOpenId] = useState<string | null>(null);

	// Position déterministe : x = rang topologique, y = bande de strate (above en haut, below en bas).
	const topoRank = useMemo(() => {
		const m = new Map<string, number>();
		sorted.forEach((n, i) => {
			m.set(n.id, i);
		});
		return m;
	}, [sorted]);

	const headLabel = heads(dag)[0]?.label ?? "";

	const nodes = useMemo<Node<DagNodeData>[]>(
		() =>
			dag.nodes.map((n) => {
				const rank = topoRank.get(n.id) ?? 0;
				return {
					id: n.id,
					type: "version",
					position: {
						x: rank * 190,
						y: n.stratum === "above" ? 40 : 240,
					},
					data: { node: n, headLabel },
					selectable: true,
					draggable: false,
					connectable: false,
				};
			}),
		[dag, topoRank, headLabel],
	);

	const edges = useMemo<Edge[]>(
		() =>
			dag.edges.map((e) => ({
				id: `${e.from}->${e.to}`,
				source: e.from,
				target: e.to,
				label: e.changeset,
				animated: false,
				selectable: false,
				className: "text-border",
			})),
		[dag],
	);

	const openNode = openId
		? (dag.nodes.find((n) => n.id === openId) ?? null)
		: null;

	return (
		<div className="space-y-5">
			{/* Le résumé : nombre de versions, d'arêtes (ChangeSets), la tête courante, les bandes. */}
			<div
				data-testid="v2-dag-summary"
				data-node-count={dag.nodes.length}
				data-edge-count={dag.edges.length}
				className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
			>
				<span className="font-medium text-foreground">
					{dag.nodes.length} {t.versions}
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{dag.edges.length} {t.changesets}
				</span>
				<span
					data-testid="v2-dag-head"
					className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
				>
					{t.head} : {headLabel}
				</span>
			</div>

			{/* Les deux bandes de la ligne de flottaison (§124) — légende above / below. */}
			<div className="flex flex-wrap gap-3 text-xs">
				<span
					data-testid="v2-dag-band-above"
					className="rounded-md border border-blue-500/40 bg-blue-500/5 px-2 py-1 text-foreground"
				>
					{t.bandAbove}
				</span>
				<span
					data-testid="v2-dag-band-below"
					className="rounded-md border border-violet-500/40 bg-violet-500/5 px-2 py-1 text-foreground"
				>
					{t.bandBelow}
				</span>
			</div>

			{/* LE DAG : React Flow, PAN/ZOOM activé (Controls + molette + drag du fond). Action-capable. */}
			<div
				data-testid="v2-dag-canvas"
				style={{ height: 460 }}
				className="w-full overflow-hidden rounded-xl border border-border bg-muted/20"
			>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					fitView
					fitViewOptions={{ padding: 0.2 }}
					nodesDraggable={false}
					nodesConnectable={false}
					elementsSelectable
					onNodeClick={(_e, node) => setOpenId(node.id)}
					panOnDrag
					zoomOnScroll
					zoomOnPinch
					minZoom={0.3}
					maxZoom={2}
					proOptions={{ hideAttribution: true }}
					aria-label={t.canvasLabel}
				>
					<Background />
					{/* Controls = zoom in / zoom out / fit — le pan/zoom action-capable. */}
					<Controls data-testid="v2-dag-controls" showInteractive={false} />
				</ReactFlow>
			</div>

			{/* Le DÉTAIL d'une version cliquée (le clic descend) — read-only, le mur intact. */}
			{openNode && (
				<div
					data-testid="v2-dag-node-detail"
					className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
				>
					<p className="font-semibold text-foreground">
						{openNode.label}
						{openNode.head ? (
							<span
								data-testid="v2-dag-detail-head"
								className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
							>
								{t.head}
							</span>
						) : null}
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.hash} :{" "}
						</span>
						<span data-testid="v2-dag-detail-hash" className="font-mono">
							{openNode.id}
						</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.parents} :{" "}
						</span>
						<span className="font-mono">
							{openNode.parentIds.length > 0
								? openNode.parentIds.join(", ")
								: t.root}
						</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.stratum} :{" "}
						</span>
						{openNode.stratum === "above" ? t.bandAbove : t.bandBelow}
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.reachableFromRoot} :{" "}
						</span>
						<span data-testid="v2-dag-detail-reachable" className="font-mono">
							{openNode.id === rootId || isReachable(dag, rootId, openNode.id)
								? t.yes
								: t.no}
						</span>
					</p>
					<p
						data-testid="v2-dag-detail-readonly"
						className="text-[0.7rem] text-muted-foreground"
					>
						{t.readOnlyNote}
					</p>
				</div>
			)}
		</div>
	);
}
