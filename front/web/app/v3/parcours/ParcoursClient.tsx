"use client";

import {
	Background,
	Controls,
	type Edge,
	Handle,
	MiniMap,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { nodePath, positionOf } from "@/lib/v2/composition";
import { composesToFlow, type FlowNode } from "@/lib/v3/flow";
import { useV3Session } from "../V3Session";

/**
 * /v3/parcours — « Parcours produit » : l'arbre composes de la session partagée rendu
 * en GRAPHE (React Flow). La DONNÉE vient du twin pur lib/v3/flow (composesToFlow —
 * positions calculées, déterministes) ; React Flow ne fait que RENDRE (ADR 0053).
 *
 * END-USER FRIENDLY TOTAL : copie en français simple (cartes, parcours, étapes) ; le
 * détail technique (chemin, id, niveau brut, profondeur) vit TOUJOURS replié dans
 * « Détails techniques ». Cliquer une carte ouvre un panneau amical : la position
 * (racine / feuille · nN / nN — positionOf, calculée jamais stockée), les idées
 * rattachées à ce chemin, et « En parler dans le chat » qui ENVOIE la phrase canonique
 * d'impact à la session puis ramène au chat (/v3/lab).
 *
 * LE MUR (§2) : lentille de lecture — aucune écriture-vérité ; le bouton chat PROPOSE
 * un tour de session (re-jugé par le réducteur, la loi), rien d'autre.
 */

type Strings = Record<string, string>;

/** Le nom de niveau AMICAL (clé i18n « v3 ») — le niveau brut reste dans les détails. */
const LEVEL_KEYS: Record<string, string> = {
	product: "levelProduct",
	journey: "levelJourney",
	view: "levelView",
	control: "levelControl",
	action: "levelAction",
	operation: "levelOperation",
	entity: "levelEntity",
};

function friendlyLevel(t: Strings, level: string): string {
	const key = LEVEL_KEYS[level];
	return key !== undefined ? (t[key] ?? level) : level;
}

/** La donnée d'une carte du graphe (type alias — l'index implicite requis par React Flow). */
type ParcoursNodeData = {
	flowNode: FlowNode;
	levelLabel: string;
	isSelected: boolean;
};

/** La CARTE d'une étape : libellé + nom de niveau amical ; ancres gauche → droite. */
function ParcoursNode({ data }: NodeProps<Node<ParcoursNodeData>>) {
	return (
		<div
			data-level={data.flowNode.level}
			className={[
				"nopan w-52 rounded-xl border bg-card px-3 py-2 text-left shadow-sm transition-colors",
				data.isSelected
					? "border-primary ring-2 ring-primary/40"
					: "border-border hover:border-primary/40",
			].join(" ")}
		>
			<Handle
				type="target"
				position={Position.Left}
				className="!border-0 !bg-transparent"
				isConnectable={false}
			/>
			<span className="block truncate text-sm font-medium text-foreground">
				{data.flowNode.label}
			</span>
			<span className="block text-[0.65rem] text-muted-foreground">
				{data.levelLabel}
			</span>
			<Handle
				type="source"
				position={Position.Right}
				className="!border-0 !bg-transparent"
				isConnectable={false}
			/>
		</div>
	);
}

const nodeTypes = { parcours: ParcoursNode };

/** Le style d'une chip de sélection de parcours (active = le focus courant). */
function chipCls(active: boolean): string {
	return [
		"rounded-full border px-3 py-1 text-xs font-medium transition-colors",
		active
			? "border-primary bg-primary/10 text-primary"
			: "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5",
	].join(" ");
}

export function ParcoursClient() {
	const { state, send, strings: t } = useV3Session();
	const router = useRouter();
	const [focusPath, setFocusPath] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Les PARCOURS sélectionnables = les branches de profondeur 1 (les enfants des racines) —
	// l'ordre append-only de l'arbre (déterministe ; une greffe du chat apparaît en direct).
	const branches = useMemo(() => {
		const rootIds = new Set(
			state.tree.filter((n) => n.parentId === null).map((n) => n.id),
		);
		return state.tree
			.filter((n) => n.parentId !== null && rootIds.has(n.parentId))
			.map((n) => ({
				id: n.id,
				label: n.label,
				path: nodePath(state.tree, n.id).join("/"),
			}));
	}, [state.tree]);

	// La PROJECTION PURE arbre → graphe positionné (le twin lib/v3/flow) — jamais recalculée ici.
	const flow = useMemo(
		() => composesToFlow(state.tree, focusPath),
		[state.tree, focusPath],
	);

	const rfNodes = useMemo<Node<ParcoursNodeData>[]>(
		() =>
			flow.nodes.map((n) => ({
				id: n.id,
				type: "parcours",
				position: { x: n.x, y: n.y },
				data: {
					flowNode: n,
					levelLabel: friendlyLevel(t, n.level),
					isSelected: n.id === selectedId,
				},
				draggable: false,
				connectable: false,
				selectable: true,
			})),
		[flow, t, selectedId],
	);

	const rfEdges = useMemo<Edge[]>(
		() =>
			flow.edges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				selectable: false,
			})),
		[flow],
	);

	// Le PANNEAU latéral : tout est DÉRIVÉ du nœud sélectionné (position calculée par
	// positionOf — jamais stockée ; les idées rattachées = préfixe de chemin, motif spec).
	const panel = useMemo(() => {
		if (selectedId === null) return null;
		const node = state.tree.find((n) => n.id === selectedId);
		if (node === undefined) return null;
		const path = nodePath(state.tree, node.id).join("/");
		const pos = positionOf(state.tree, node.id);
		const posLabel = pos.isRoot
			? t.parcoursRoot
			: pos.isLeaf
				? `${t.parcoursLeaf} · n${pos.depth}`
				: `n${pos.depth}`;
		const ideas = state.ideas.filter((i) =>
			i.coordinate.scale.startsWith(path),
		);
		return {
			node,
			path,
			pos,
			posLabel,
			levelLabel: friendlyLevel(t, node.level),
			ideas,
		};
	}, [selectedId, state.tree, state.ideas, t]);

	/** « En parler dans le chat » : la phrase canonique d'impact part dans la session
	 *  partagée (re-jugée par le réducteur), puis on ramène l'utilisateur au chat. */
	const talkInChat = (path: string) => {
		void send(`quel impact si je modifie ${path}`);
		router.push("/v3/lab");
	};

	const pick = (path: string | null) => {
		setFocusPath(path);
		setSelectedId(null);
	};

	return (
		<div className="mx-auto w-full max-w-6xl space-y-5">
			{/* ── l'intro amicale ── */}
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold text-foreground">
					{t.parcoursTitle}
				</h1>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t.parcoursIntro}
				</p>
			</header>

			{/* ── le sélecteur de parcours (les branches de profondeur 1 + tout l'arbre) ── */}
			<div className="space-y-1.5">
				<p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
					{t.parcoursPickLabel}
				</p>
				<div className="flex flex-wrap gap-1.5">
					<button
						type="button"
						data-testid="v3-parcours-pick"
						data-path=""
						onClick={() => pick(null)}
						className={chipCls(focusPath === null)}
					>
						{t.parcoursAll}
					</button>
					{branches.map((b) => (
						<button
							key={b.id}
							type="button"
							data-testid="v3-parcours-pick"
							data-path={b.path}
							onClick={() => pick(b.path)}
							className={chipCls(focusPath === b.path)}
						>
							{b.label}
						</button>
					))}
				</div>
			</div>

			{/* ── le graphe + le panneau latéral ── */}
			<div className="flex flex-col gap-4 lg:flex-row">
				<div
					data-testid="v3-parcours-graph"
					data-node-count={flow.nodes.length}
					className="h-[30rem] min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/20"
				>
					{flow.nodes.length === 0 ? (
						/* · l'état vide accueillant (fail-closed du twin : focus inconnu → graphe vide) */
						<div className="flex h-full items-center justify-center p-6 text-center text-sm leading-relaxed text-muted-foreground">
							{t.parcoursEmpty}
						</div>
					) : (
						<ReactFlow
							nodes={rfNodes}
							edges={rfEdges}
							nodeTypes={nodeTypes}
							fitView
							fitViewOptions={{ padding: 0.2 }}
							nodesDraggable={false}
							nodesConnectable={false}
							elementsSelectable
							onNodeClick={(_e, node) => setSelectedId(node.id)}
							onPaneClick={() => setSelectedId(null)}
							panOnDrag
							zoomOnScroll
							zoomOnPinch
							minZoom={0.3}
							maxZoom={2}
							proOptions={{ hideAttribution: true }}
							aria-label={t.parcoursTitle}
						>
							<Background />
							<Controls showInteractive={false} />
							<MiniMap pannable zoomable className="!bg-card" />
						</ReactFlow>
					)}
				</div>

				{/* · le panneau amical du nœud cliqué */}
				<aside
					data-testid="v3-parcours-panel"
					className="w-full shrink-0 self-start rounded-xl border border-border bg-card p-4 lg:w-80"
				>
					{panel === null ? (
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t.parcoursPanelHint}
						</p>
					) : (
						<div className="space-y-4">
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="truncate text-base font-semibold text-foreground">
										{panel.node.label}
									</p>
									<p className="text-xs text-muted-foreground">
										{panel.levelLabel}
									</p>
								</div>
								<button
									type="button"
									onClick={() => setSelectedId(null)}
									aria-label={t.parcoursPanelClose}
									className="rounded-md px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								>
									×
								</button>
							</div>

							{/* · la position dérivée (racine / feuille · nN / nN — positionOf) */}
							<p className="text-sm text-foreground">
								<span className="font-medium">{t.parcoursPanelPosition}</span> :{" "}
								<span data-testid="v3-parcours-position">{panel.posLabel}</span>
							</p>

							{/* · les idées rattachées à ce chemin */}
							<div className="space-y-1.5">
								<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									{t.parcoursPanelIdeas} ({panel.ideas.length})
								</p>
								{panel.ideas.length === 0 ? (
									<p className="text-xs leading-relaxed text-muted-foreground italic">
										{t.parcoursPanelNoIdeas}
									</p>
								) : (
									<ul className="space-y-1.5">
										{panel.ideas.map((i) => (
											<li
												key={i.id}
												data-testid="v3-parcours-idea"
												className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs leading-relaxed text-foreground"
											>
												{i.intent}
											</li>
										))}
									</ul>
								)}
							</div>

							{/* · en parler dans le chat — la phrase canonique d'impact, puis retour au lab */}
							<button
								type="button"
								data-testid="v3-parcours-chat"
								onClick={() => talkInChat(panel.path)}
								className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							>
								{t.parcoursPanelChat}
							</button>

							{/* · le DÉTAIL TECHNIQUE — toujours replié, jamais imposé */}
							<details
								data-testid="v3-details"
								className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
							>
								<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
									{t.detailsLabel}
								</summary>
								<dl className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
									<div>id — {panel.node.id}</div>
									<div>path — {panel.path}</div>
									<div>level — {panel.node.level}</div>
									<div>
										depth — {panel.pos.depth} · root={String(panel.pos.isRoot)}{" "}
										· leaf={String(panel.pos.isLeaf)}
									</div>
								</dl>
							</details>
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}
