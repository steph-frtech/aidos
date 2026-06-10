"use client";

import {
	Background,
	type Edge,
	type Node,
	type NodeChange,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import type { OperationFixture } from "@/lib/v2/operations";
import {
	moveNode,
	type NodePos,
	nodeKindCounts,
	type WorkflowGraph,
	type WorkflowNodeKind,
	workflowGraph,
} from "@/lib/v2/workflows";

/**
 * WB2-13 — l'affichage + l'édition PROPOSÉE d'un PIPELINE FKE-3, client-only (React Flow + le twin pur).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on DÉPLACE un nœud (à la souris OU via le bouton « proposer un déplacement ») : l'édition PROPOSÉE.
 *     Elle passe par le twin pur `moveNode` (immuable) ; la nouvelle position s'affiche — RIEN n'est écrit ;
 *   - on RÉINITIALISE le layout (revenir au graphe content-adressé d'origine).
 * Les nœuds custom (étape/gate/décision/borne) sont stylés par token (ADR 0010). Pan/zoom natif React Flow.
 *
 * LE MUR (§2) : afficher et déplacer n'écrit AUCUNE vérité — l'édition est un layout local, jamais appliqué.
 */

type Strings = Record<string, string>;

/** Le style d'un nœud custom selon son type (thème ADR 0010, tokens CSS jamais de hex en dur). */
function nodeStyle(kind: WorkflowNodeKind): React.CSSProperties {
	const base: React.CSSProperties = {
		borderRadius: 10,
		padding: "8px 12px",
		fontSize: 11,
		fontFamily: "var(--font-geist-mono, monospace)",
		border: "1px solid var(--border)",
		background: "var(--card)",
		color: "var(--card-foreground)",
		minWidth: 120,
		textAlign: "center",
	};
	if (kind === "gate") {
		base.border = "2px solid var(--primary)";
		base.background = "color-mix(in oklab, var(--primary) 10%, transparent)";
		base.color = "var(--primary)";
	} else if (kind === "decision") {
		base.borderRadius = 4;
		base.border = "2px dashed var(--primary)";
	} else if (kind === "start" || kind === "end") {
		base.borderRadius = 999;
		base.fontWeight = 600;
	}
	return base;
}

/** La projection des nœuds/arêtes du twin pur vers les formes React Flow (déterministe). */
function toFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
	const nodes: Node[] = graph.nodes.map((n) => ({
		id: n.id,
		data: { label: n.label },
		position: { x: n.position.x, y: n.position.y },
		style: nodeStyle(n.kind),
		type: "default",
	}));
	const edges: Edge[] = graph.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		label: e.label,
		animated: e.branch === "deny",
		style: {
			stroke: e.branch === "deny" ? "var(--destructive)" : "var(--border)",
		},
	}));
	return { nodes, edges };
}

export function WorkflowClient({
	fixture,
	t,
}: {
	fixture: OperationFixture;
	t: Strings;
}) {
	// le graphe content-adressé d'origine (le twin pur) — la VÉRITÉ du layout par défaut.
	const base: WorkflowGraph = useMemo(() => workflowGraph(fixture), [fixture]);
	const counts = useMemo(() => nodeKindCounts(base), [base]);

	// le LAYOUT PROPOSÉ (édition non écrite) : une carte id→position OVERRIDE, découplée du store de React Flow.
	const [proposed, setProposed] = useState<Record<string, NodePos>>({});
	const [flowKey, setFlowKey] = useState(0);

	const onMoved = useCallback(
		(id: string, pos: NodePos) =>
			setProposed((prev) => ({ ...prev, [id]: pos })),
		[],
	);
	// RÉINITIALISER : vider les override + remonter React Flow (nouvelle key) pour reprendre le layout d'origine.
	const reset = useCallback(() => {
		setProposed({});
		setFlowKey((k) => k + 1);
	}, []);

	// l'indicateur d'ÉDITION PROPOSÉE : un nœud a-t-il bougé par rapport au layout content-adressé d'origine ?
	// On le calcule via le twin pur `moveNode` (immuable) appliqué aux override — RIEN n'est écrit (le mur §2).
	const graph: WorkflowGraph = useMemo(() => {
		let g = base;
		for (const [id, pos] of Object.entries(proposed)) g = moveNode(g, id, pos);
		return g;
	}, [base, proposed]);
	const movedNode = graph.nodes.find((n) => {
		const orig = base.nodes.find((o) => o.id === n.id);
		return (
			orig &&
			(orig.position.x !== n.position.x || orig.position.y !== n.position.y)
		);
	});
	const moved = movedNode !== undefined;
	const startPos = movedNode?.position;

	return (
		<div data-testid="v2-wf-view" className="space-y-6">
			{/* la composition du pipeline (les comptes par type de nœud) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.countsHeading}
				</h3>
				<dl data-testid="v2-wf-counts" className="flex flex-wrap gap-4 text-sm">
					<div className="flex items-baseline gap-1.5">
						<dd
							data-testid="v2-wf-count-step"
							className="font-mono font-semibold text-foreground"
						>
							{counts.step}
						</dd>
						<dt className="text-xs text-muted-foreground">{t.stepsLabel}</dt>
					</div>
					<div className="flex items-baseline gap-1.5">
						<dd
							data-testid="v2-wf-count-gate"
							className="font-mono font-semibold text-primary"
						>
							{counts.gate}
						</dd>
						<dt className="text-xs text-muted-foreground">{t.gateLabel}</dt>
					</div>
					<div className="flex items-baseline gap-1.5">
						<dd
							data-testid="v2-wf-count-decision"
							className="font-mono font-semibold text-primary"
						>
							{counts.decision}
						</dd>
						<dt className="text-xs text-muted-foreground">{t.decisionLabel}</dt>
					</div>
					<div className="flex items-baseline gap-1.5">
						<dd className="font-mono font-semibold text-foreground">
							{counts.end}
						</dd>
						<dt className="text-xs text-muted-foreground">{t.endLabel}</dt>
					</div>
				</dl>
			</div>

			{/* le PIPELINE (React Flow) — nœuds custom (étape/gate/décision), pan/zoom, nœuds déplaçables */}
			<ReactFlowProvider>
				<PipelineControls
					graph={base}
					flowKey={flowKey}
					onMoved={onMoved}
					proposeLabel={t.proposeMoveBtn}
				/>
			</ReactFlowProvider>

			{/* la LÉGENDE des nœuds custom */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-2">
				<h3 className="text-sm font-semibold text-foreground">
					{t.legendHeading}
				</h3>
				<ul className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
					<li>● {t.legendStep}</li>
					<li className="text-primary">◆ {t.legendGate}</li>
					<li className="text-primary">◇ {t.legendDecision}</li>
					<li>○ {t.legendEnd}</li>
				</ul>
			</div>

			{/* l'ÉDITION PROPOSÉE — l'état (le mur intact : on n'écrit jamais) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<p className="text-xs text-muted-foreground">{t.moveHint}</p>
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-testid="v2-wf-reset-move"
						onClick={reset}
						className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
					>
						{t.resetMoveBtn}
					</button>
				</div>
				<p className="text-sm">
					<span className="text-xs text-muted-foreground">
						{t.proposedAt} :{" "}
					</span>
					<code
						data-testid="v2-wf-proposed-pos"
						data-moved={moved ? "true" : "false"}
						className="font-mono text-foreground"
					>
						{moved ? `x=${startPos?.x}, y=${startPos?.y}` : t.notProposed}
					</code>
				</p>
			</div>
		</div>
	);
}

/**
 * Le pipeline + le bouton « proposer un déplacement » — DANS le provider React Flow (pour l'API impérative
 * setNodes). Séparé pour que `useReactFlow` ait son contexte. Le bouton porte son vrai libellé bilingue.
 */
function PipelineControls({
	graph,
	flowKey,
	onMoved,
	proposeLabel,
}: {
	graph: WorkflowGraph;
	flowKey: number;
	onMoved: (id: string, pos: NodePos) => void;
	proposeLabel: string;
}) {
	const { nodes, edges } = useMemo(() => toFlow(graph), [graph]);
	const rf = useReactFlow();

	const onNodesChange = useCallback(
		(changes: NodeChange[]) => {
			for (const c of changes) {
				if (c.type === "position" && c.dragging === false && c.position) {
					onMoved(c.id, { x: c.position.x, y: c.position.y });
				}
			}
		},
		[onMoved],
	);

	const proposeMove = useCallback(() => {
		const pos: NodePos = { x: 160, y: 0 };
		rf.setNodes((nds) =>
			nds.map((n) => (n.id === "w0" ? { ...n, position: pos } : n)),
		);
		onMoved("w0", pos);
	}, [rf, onMoved]);

	return (
		<div className="space-y-3">
			<div className="rounded-xl border border-border bg-card p-2">
				<div data-testid="v2-wf-graph" style={{ height: 480, width: "100%" }}>
					<ReactFlow
						key={flowKey}
						defaultNodes={nodes}
						defaultEdges={edges}
						onNodesChange={onNodesChange}
						fitView
						proOptions={{ hideAttribution: true }}
						nodesDraggable
						nodesConnectable={false}
						elementsSelectable
					>
						<Background />
					</ReactFlow>
				</div>
			</div>
			<button
				type="button"
				data-testid="v2-wf-propose-move"
				onClick={proposeMove}
				className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				{proposeLabel}
			</button>
		</div>
	);
}
