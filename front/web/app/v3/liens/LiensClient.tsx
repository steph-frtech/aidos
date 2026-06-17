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
import type { Source } from "@/lib/gateway-sdk";
import {
	CANON_KINDS,
	type CanonKind,
	type LinkRow,
	type LinkStatus,
	type LinksView,
	type Ref,
	refStr,
} from "@/lib/v2/links-data";
import { useV3Session } from "../V3Session";

/**
 * /v3/liens — LA LENTILLE DES SIX LIENS (KRD §17/§41), portée EN PROPRE dans la session V3
 * (parcours « Comprendre »). Un kernel ne flotte jamais seul : il est RELIÉ aux autres par six
 * familles de liens TYPÉS (projects_to · derives_from · contracts_with · triggers · binds ·
 * mirrors), et chaque lien pointe une VERSION (`id@version`), JAMAIS une identité nue — c'est
 * l'enjeu §41 (la vague de rouge §42).
 *
 * LENTILLE NATIVE LIVE (ADR 0092 — le moteur Go est la SEULE source live des liens). Le graphe et
 * le STATUT PAR LIEN (green|stale|absent) viennent EN DIRECT du serveur Go `links` (outil
 * `links_graph`, back/kernel/links.Validate/Resolve), lus côté serveur (page.tsx → linksGraphAction)
 * et reçus ici en props. Le calcul des liens (validate/resolve/filter) était un TWIN PUR
 * « byte-identique au Go » (lib/v2/links.ts) — pas du client-UX légitime (§2) ; il est SUPPRIMÉ.
 * Le badge dit HONNÊTEMENT la source : « en direct » (la passerelle a dispatché) ou « démo » (repli
 * déterministe lib/v2/links-data, calculé À PARTIR DU TWIN) — JAMAIS « calcul pur (repli démo) » (ADR 0074).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   1) le FILTRE par famille est une action exécutable : cliquer une famille ne montre QUE ses
 *      arêtes (filtrage CLIENT sur les verdicts live, pas un recalcul du statut) ; « toutes » les
 *      remontre ;
 *   2) cliquer un lien l'OUVRE (son détail : famille, from, cible pinnée @version, statut live) ;
 *   3) PAN/ZOOM activé (React Flow Controls + molette + drag).
 *
 * LE MUR (CLAUDE.md §2) : projection de LECTURE, aucune écriture-vérité — aucun drag de nœud,
 * aucune connexion ; la promotion d'un lien reste idée → miroir → /goal → approbation. Themed
 * (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (next-intl, FR par défaut, ADR 0011 — strings
 * depuis la session V3).
 */

/** La couleur d'arête par STATUT live (tokens ADR 0010, jamais de hex en dur). Le statut prime sur
 * la famille : c'est le verdict §41–§42 (green sain ; stale/absent = rouge) que l'écran doit crier. */
const STATUS_STROKE: Record<LinkStatus, string> = {
	green: "var(--color-primary)",
	stale: "var(--color-chart-3)",
	absent: "var(--color-destructive)",
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

/** L'id stable d'une arête (pour la sélection + la clé React Flow) — depuis les verdicts live. */
function rowEdgeId(r: LinkRow): string {
	return `${r.from}--${r.kind}-->${r.to}`;
}

export function LiensClient({
	view,
	source,
}: {
	view: LinksView;
	source: Source;
}) {
	// Les strings de la session V3 (bilingue, FR par défaut — injectées par le layout).
	const { strings: t } = useV3Session();
	const isLive = source === "live";

	// L'état du filtre : null = toutes les familles ; sinon une famille du jeu clos canonique.
	const [activeKind, setActiveKind] = useState<CanonKind | null>(null);
	const [openEdgeId, setOpenEdgeId] = useState<string | null>(null);

	// Les verdicts live (rows) du moteur Go ; on FILTRE par famille côté client (pas de recalcul du
	// statut — c'est le Go qui a jugé green|stale|absent). « toutes » = tous les verdicts.
	const shownRows = useMemo(
		() =>
			activeKind ? view.rows.filter((r) => r.kind === activeKind) : view.rows,
		[view.rows, activeKind],
	);

	// Le compte par famille (sur les verdicts live), pour le résumé du filtre.
	const counts = useMemo(() => {
		const out = Object.fromEntries(CANON_KINDS.map((k) => [k, 0])) as Record<
			CanonKind,
			number
		>;
		for (const r of view.rows) {
			if ((CANON_KINDS as readonly string[]).includes(r.kind)) {
				out[r.kind as CanonKind] += 1;
			}
		}
		return out;
	}, [view.rows]);

	// Le libellé localisé de chaque famille (le jeu clos canonique CANON_KINDS → liensKind*).
	const kindLabels = useMemo(
		() =>
			Object.fromEntries(
				CANON_KINDS.map((k) => [k, t[`liensKind_${k}`] ?? k]),
			) as Record<CanonKind, string>,
		[t],
	);

	// Le libellé localisé d'un statut live (green|stale|absent → liensStatus*).
	const statusLabel = (s?: LinkStatus): string =>
		s ? (t[`liensStatus_${s}`] ?? s) : (t.liensStatusInvalid ?? "invalid");

	// Position déterministe des nœuds : une grille fixe par index (aucun aléa).
	const positions = useMemo(() => {
		const m = new Map<string, { x: number; y: number }>();
		view.nodes.forEach((n, i) => {
			m.set(refStr(n), {
				x: (i % 4) * 200,
				y: Math.floor(i / 4) * 180,
			});
		});
		return m;
	}, [view.nodes]);

	const nodes = useMemo<Node<KernelNodeData>[]>(
		() =>
			view.nodes.map((n) => ({
				id: refStr(n),
				type: "kernel",
				position: positions.get(refStr(n)) ?? { x: 0, y: 0 },
				data: { ref: n },
				selectable: false,
				draggable: false,
				connectable: false,
			})),
		[view.nodes, positions],
	);

	const edges = useMemo<Edge[]>(
		() =>
			shownRows.map((r) => ({
				id: rowEdgeId(r),
				source: r.from,
				target: r.to,
				label: kindLabels[r.kind as CanonKind] ?? r.kind,
				animated: r.status === "stale" || r.status === "absent",
				selectable: true,
				data: { kind: r.kind, status: r.status },
				style: {
					stroke: r.status
						? STATUS_STROKE[r.status]
						: "var(--color-destructive)",
					strokeWidth: 2,
				},
				labelStyle: { fontSize: 10 },
			})),
		[shownRows, kindLabels],
	);

	const openRow = openEdgeId
		? (shownRows.find((r) => rowEdgeId(r) === openEdgeId) ?? null)
		: null;

	return (
		<div className="space-y-5">
			{/* Le badge de source HONNÊTE (ADR 0074) : en direct (passerelle) ou démo (repli) —
			    JAMAIS « calcul pur (repli démo) ». La logique des liens vient du moteur Go (links_graph). */}
			<div
				data-testid="v3-liens-source"
				data-source={source}
				className={[
					"inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs",
					isLive
						? "border-primary/30 bg-primary/5 text-primary"
						: "border-border bg-muted text-muted-foreground",
				].join(" ")}
				title={isLive ? t.liensSourceLiveTitle : t.liensSourceDemoTitle}
			>
				<span
					className={[
						"h-1.5 w-1.5 rounded-full",
						isLive ? "bg-primary" : "bg-muted-foreground",
					].join(" ")}
					aria-hidden
				/>
				{isLive ? t.liensSourceLive : t.liensSourceDemo}
			</div>

			{/* Le résumé : nombre de kernels, nombre de liens affichés, et les comptes de statut live. */}
			<div
				data-testid="v3-liens-summary"
				data-node-count={view.nodes.length}
				data-link-count={shownRows.length}
				data-green={view.green}
				data-stale={view.stale}
				data-absent={view.absent}
				className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
			>
				<span className="font-medium text-foreground">
					{view.nodes.length} {t.liensKernels}
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{shownRows.length} {t.liensLinks}
				</span>
				<span className="ml-auto flex items-center gap-3 font-mono text-xs">
					<span className="text-primary">
						{view.green} {t.liensStatus_green}
					</span>
					<span className="text-chart-3">
						{view.stale} {t.liensStatus_stale}
					</span>
					<span className="text-destructive">
						{view.absent} {t.liensStatus_absent}
					</span>
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
				{CANON_KINDS.map((k) => (
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

			{/* Le DÉTAIL d'un lien cliqué — read-only, le mur intact. Montre la cible PINNÉE + le statut. */}
			{openRow && (
				<div
					data-testid="v3-liens-edge-detail"
					className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
				>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailKind} :{" "}
						</span>
						<span data-testid="v3-liens-detail-kind" className="font-semibold">
							{kindLabels[openRow.kind as CanonKind] ?? openRow.kind}
						</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailFrom} :{" "}
						</span>
						<span className="font-mono">{openRow.from}</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailTo} :{" "}
						</span>
						<span data-testid="v3-liens-detail-to" className="font-mono">
							{openRow.to}
						</span>
					</p>
					<p className="text-xs text-foreground">
						<span className="font-medium text-muted-foreground">
							{t.liensDetailStatus} :{" "}
						</span>
						<span
							data-testid="v3-liens-detail-status"
							data-status={openRow.status ?? "invalid"}
							className="font-semibold"
						>
							{statusLabel(openRow.status)}
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
