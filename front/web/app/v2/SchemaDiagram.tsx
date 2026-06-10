"use client";

import {
	Background,
	type Edge,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useMemo } from "react";
import { def, type Locale } from "@/lib/v2/glossary";
import {
	nodeLabel,
	nodePosition,
	SCHEMA_EDGES,
	SCHEMA_NODES,
} from "@/lib/v2/schema";

/**
 * WB2-02 — LE schéma KRD interactif (React Flow, LECTURE SEULE) sur la page d'accueil /v2.
 *
 * Rend le schéma complet projeté DÉTERMINISTIQUEMENT depuis lib/v2/schema.ts : idée (entrée)
 * → MUR (/goal) → la verticale + le kernel → la facette + les paires-miroir → les liens §17
 * → les arbres → les cellules. CHAQUE BLOC est cliquable : il navigue vers son écran /v2/<slug>
 * (le critère de done « chaque bloc du schéma navigue vers son écran »). AUCUNE chaîne en dur :
 * les libellés viennent du glossaire via nodeLabel ; les positions de nodePosition (pur).
 *
 * LE MUR (CLAUDE.md §2) : diagramme PROPOSE / NAVIGUE, jamais une écriture. React Flow est en
 * lecture seule (pas de drag, pas de connexion, pas de sélection) — c'est un schéma, pas un
 * éditeur de vérité.
 */

/** Données portées par un nœud du schéma (le slug + son libellé localisé). */
type SchemaNodeData = {
	slug: string;
	label: string;
};

/**
 * Le nœud-bloc : un <Link> Next (vraie ancre <a href>) menant à /v2/<slug>. Étant une vraie
 * ancre, il navigue même AVANT l'hydratation (pas de course au clic), et après hydratation Next
 * fait la navigation client. La classe `nopan` empêche React Flow de happer le clic du nœud.
 * data-testid `v2-schema-node-<slug>` pour l'e2e (action-capable, pas un affichage mort).
 */
function ConceptBlock({ data }: NodeProps<Node<SchemaNodeData>>) {
	return (
		<>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
				isConnectable={false}
			/>
			<Link
				href={`/v2/${data.slug}`}
				data-testid={`v2-schema-node-${data.slug}`}
				className="nopan block cursor-pointer rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
			>
				{data.label}
			</Link>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-transparent !border-0"
				isConnectable={false}
			/>
		</>
	);
}

const nodeTypes = { concept: ConceptBlock };

export function SchemaDiagram() {
	const locale = useLocale() as Locale;

	const nodes = useMemo<Node<SchemaNodeData>[]>(
		() =>
			SCHEMA_NODES.map((n) => ({
				id: n.slug,
				type: "concept",
				position: nodePosition(n.slug),
				data: {
					slug: n.slug,
					label: nodeLabel(n.slug, locale),
				},
				// le bloc « mur » est mis en avant (la frontière) via une classe utilitaire.
				className: n.slug === "mur" ? "ring-1 ring-primary/40 rounded-lg" : "",
				selectable: false,
				draggable: false,
				connectable: false,
			})),
		[locale],
	);

	const edges = useMemo<Edge[]>(
		() =>
			SCHEMA_EDGES.map((e) => ({
				id: `${e.from}->${e.to}`,
				source: e.from,
				target: e.to,
				animated: false,
				selectable: false,
				className: "text-border",
			})),
		[],
	);

	return (
		<div
			data-testid="v2-schema-diagram"
			style={{ height: 620 }}
			className="v2-schema-canvas w-full overflow-hidden rounded-xl border border-border bg-muted/20"
		>
			{/*
			 * Schéma LECTURE SEULE : le pane React Flow ne capture aucun clic (pointer-events:none),
			 * pour que chaque bloc-<Link> reçoive le clic et navigue. Style scoped au canvas V2.
			 */}
			<style>{`
				.v2-schema-canvas .react-flow__pane,
				.v2-schema-canvas .react-flow__renderer,
				.v2-schema-canvas .react-flow__viewport,
				.v2-schema-canvas .react-flow__nodes { pointer-events: none; cursor: default; }
				.v2-schema-canvas .react-flow__node,
				.v2-schema-canvas .react-flow__node a { pointer-events: all; }
			`}</style>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.2 }}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				panOnDrag={false}
				panOnScroll={false}
				zoomOnScroll={false}
				zoomOnPinch={false}
				zoomOnDoubleClick={false}
				preventScrolling={false}
				proOptions={{ hideAttribution: true }}
				// libellé accessible : la définition du concept en infobulle au survol du nœud
				// est portée par le <Link> via title plus bas si besoin ; ici on garde le canvas sobre.
				aria-label={def("idee", locale)}
			>
				<Background />
			</ReactFlow>
		</div>
	);
}
