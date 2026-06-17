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
	countByKind,
	filterByKind,
	kindToCanon,
	LINK_KINDS,
	type Link,
	type LinkKind,
	type Ref,
	refString,
	syntheticLinkGraph,
} from "@/lib/v2/links";
import { useV3Session } from "../V3Session";

/**
 * /v3/liens — LA LENTILLE DES SIX LIENS (KRD §17/§41), portée EN PROPRE dans la session
 * V3 (parcours « Comprendre »). Un kernel ne flotte jamais seul : il est RELIÉ aux autres
 * par six familles de liens TYPÉS (composes verticaux · depends_on horizontaux · supersedes
 * généalogiques · provenance · triggers/binds · mirrors), et chaque lien pointe une VERSION
 * (`id@version`), JAMAIS une identité nue — c'est l'enjeu §41 (la vague de rouge §42).
 *
 * MODE CLIENT (ADR 0092 §2, déterminisme-first §8) : il N'EXISTE PAS de serveur MCP des
 * liens dispatché par la passerelle. La logique — le jeu CLOS des familles, le graphe
 * synthétique canonique, le filtre par type, le pinning §41, le mapping vers le jeu
 * canonique S17 — est un TWIN PUR AUTORITATIF (lib/v2/links.ts), couvert par son miroir de
 * parité lib/v2/links.test.ts. On PORTE cette logique UX pure (légitime, ADR 0092 §2),
 * thémée V3, SANS ré-implémenter le Go ; un branchement live deviendra possible le jour où
 * un outil de lecture des liens sera dispatché.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   1) le FILTRE par famille est une action exécutable : cliquer une famille ne montre QUE
 *      ses arêtes (filterByKind, twin pur) ; « toutes » les remontre ;
 *   2) cliquer un lien l'OUVRE (son détail : famille, from, cible pinnée @version, canonique) ;
 *   3) PAN/ZOOM activé (React Flow Controls + molette + drag).
 *
 * LE MUR (CLAUDE.md §2) : projection de LECTURE, aucune écriture-vérité — aucun drag de
 * nœud, aucune connexion ; la promotion d'un lien reste idée → miroir → /goal → approbation.
 * Themed (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (next-intl, FR par défaut, ADR
 * 0011 — strings depuis la session V3).
 */

/** La couleur d'arête par famille de lien (tokens ADR 0010, jamais de hex en dur). */
const KIND_STROKE: Record<LinkKind, string> = {
	composes: "var(--color-primary)",
	depends_on: "var(--color-chart-2)",
	supersedes: "var(--color-chart-3)",
	provenance: "var(--color-chart-4)",
	triggers_binds: "var(--color-chart-5)",
	mirrors: "var(--color-chart-1)",
};

type KernelNodeData = { ref: Ref };

/** Le nœud-kernel : id + sa version pinnée. data-testid pour l'e2e. */
function KernelNode({ data }: NodeProps<Node<KernelNodeData>>) {
	const { ref } = data;
	return (
		<div
			data-testid={`v3-liens-node-${ref.id}-${ref.version}`}
			className="nopan rounded-lg border border-border bg-card px-3 py-2 text-center shadow-sm"
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
				isConnectable={false}
			/>
			<span className="block text-sm font-semibold text-foreground">
				{ref.id}
			</span>
			<span className="block font-mono text-[0.6rem] text-muted-foreground">
				@{ref.version}
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

const nodeTypes = { kernel: KernelNode };

/** L'id stable d'une arête (pour la sélection + la clé React Flow). */
function edgeId(l: Link): string {
	return `${refString(l.from)}--${l.kind}-->${refString(l.to)}`;
}

export function LiensClient() {
	// Les strings de la session V3 (bilingue, FR par défaut — injectées par le layout).
	const { strings: t } = useV3Session();

	// La donnée vient du twin PUR (déterministe) — le graphe canonique des six liens.
	const graph = useMemo(() => syntheticLinkGraph(), []);
	const counts = useMemo(() => countByKind(graph), [graph]);

	// L'état du filtre : null = toutes les familles ; sinon une famille du jeu clos.
	const [activeKind, setActiveKind] = useState<LinkKind | null>(null);
	const [openEdgeId, setOpenEdgeId] = useState<string | null>(null);

	// Le sous-graphe filtré (filterByKind, twin pur) — c'est ce que React Flow rend.
	const shown = useMemo(
		() => (activeKind ? filterByKind(graph, activeKind) : graph),
		[graph, activeKind],
	);

	// Le libellé localisé de chaque famille (le jeu clos LINK_KINDS → liensKind*).
	const kindLabels = useMemo(
		() =>
			Object.fromEntries(
				LINK_KINDS.map((k) => [k, t[`liensKind_${k}`] ?? k]),
			) as Record<LinkKind, string>,
		[t],
	);

	// Position déterministe des nœuds : une grille fixe par index (aucun aléa).
	const positions = useMemo(() => {
		const m = new Map<string, { x: number; y: number }>();
		graph.nodes.forEach((n, i) => {
			m.set(refString(n), {
				x: (i % 4) * 200,
				y: Math.floor(i / 4) * 180,
			});
		});
		return m;
	}, [graph]);

	const nodes = useMemo<Node<KernelNodeData>[]>(
		() =>
			graph.nodes.map((n) => ({
				id: refString(n),
				type: "kernel",
				position: positions.get(refString(n)) ?? { x: 0, y: 0 },
				data: { ref: n },
				selectable: false,
				draggable: false,
				connectable: false,
			})),
		[graph, positions],
	);

	const edges = useMemo<Edge[]>(
		() =>
			shown.links.map((l) => ({
				id: edgeId(l),
				source: refString(l.from),
				target: refString(l.to),
				label: kindLabels[l.kind as LinkKind] ?? l.kind,
				animated: false,
				selectable: true,
				data: { kind: l.kind },
				style: {
					stroke: KIND_STROKE[l.kind as LinkKind] ?? "var(--color-border)",
					strokeWidth: 2,
				},
				labelStyle: { fontSize: 10 },
			})),
		[shown, kindLabels],
	);

	const openLink = openEdgeId
		? (shown.links.find((l) => edgeId(l) === openEdgeId) ?? null)
		: null;

	return (
		<div className="space-y-5">
			{/* Le badge de source HONNÊTE (ADR 0074) : twin pur autoritatif, pas un live fantôme. */}
			<div
				data-testid="v3-liens-source"
				className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"
				title={t.liensSourceTitle}
			>
				<span
					className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
					aria-hidden
				/>
				{t.liensSource}
			</div>

			{/* Le résumé : nombre de kernels, nombre de liens affichés. */}
			<div
				data-testid="v3-liens-summary"
				data-node-count={graph.nodes.length}
				data-link-count={shown.links.length}
				className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
			>
				<span className="font-medium text-foreground">
					{graph.nodes.length} {t.liensKernels}
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{shown.links.length} {t.liensLinks}
				</span>
			</div>

			{/* LE FILTRE par famille (le critère de done : filtrer par type d'arête) — action-capable. */}
			<fieldset
				data-testid="v3-liens-filter"
				aria-label={t.liensFilterLabel}
				className="flex flex-wrap gap-2 border-0 p-0"
			>
				<button
					type="button"
					data-testid="v3-liens-filter-all"
					aria-pressed={activeKind === null}
					onClick={() => {
						setActiveKind(null);
						setOpenEdgeId(null);
					}}
					className={[
						"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
						activeKind === null
							? "border-primary bg-primary/10 text-primary"
							: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
					].join(" ")}
				>
					{t.liensAll}
				</button>
				{LINK_KINDS.map((k) => (
					<button
						key={k}
						type="button"
						data-testid={`v3-liens-filter-${k}`}
						aria-pressed={activeKind === k}
						onClick={() => {
							setActiveKind(k);
							setOpenEdgeId(null);
						}}
						className={[
							"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
							activeKind === k
								? "border-primary bg-primary/10 text-primary"
								: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
						].join(" ")}
					>
						{kindLabels[k]}{" "}
						<span className="font-mono opacity-60">({counts[k]})</span>
					</button>
				))}
			</fieldset>

			{/* LE GRAPHE : React Flow, PAN/ZOOM activé. Cliquer une arête l'ouvre. Action-capable. */}
			<div
				data-testid="v3-liens-canvas"
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
					onEdgeClick={(_e, edge) => setOpenEdgeId(edge.id)}
					panOnDrag
					zoomOnScroll
					zoomOnPinch
					minZoom={0.3}
					maxZoom={2}
					proOptions={{ hideAttribution: true }}
					aria-label={t.liensCanvasLabel}
				>
					<Background />
					<Controls data-testid="v3-liens-controls" showInteractive={false} />
				</ReactFlow>
			</div>

			{/* Le DÉTAIL d'un lien cliqué — read-only, le mur intact. Montre la cible PINNÉE @version. */}
			{openLink && (
				<div
					data-testid="v3-liens-edge-detail"
					className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
				>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailKind} :{" "}
						</span>
						<span data-testid="v3-liens-detail-kind" className="font-semibold">
							{kindLabels[openLink.kind as LinkKind] ?? openLink.kind}
						</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailFrom} :{" "}
						</span>
						<span className="font-mono">{refString(openLink.from)}</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailTo} :{" "}
						</span>
						<span data-testid="v3-liens-detail-to" className="font-mono">
							{refString(openLink.to)}
						</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailCanon} :{" "}
						</span>
						<span className="font-mono">
							{kindToCanon(openLink.kind as LinkKind).join(" + ")}
						</span>
					</p>
					<p
						data-testid="v3-liens-detail-pinned"
						className="text-[0.7rem] text-muted-foreground"
					>
						{t.liensPinnedNote}
					</p>
					<p
						data-testid="v3-liens-detail-readonly"
						className="text-[0.7rem] text-muted-foreground"
					>
						{t.liensReadOnlyNote}
					</p>
				</div>
			)}
		</div>
	);
}
