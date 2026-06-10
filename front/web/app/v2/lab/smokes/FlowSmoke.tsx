"use client";

import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

/**
 * WB2-01 sonde @xyflow/react — un diagramme (deux nœuds, une arête) qui monte client-only.
 * Prouve que la lib de graphe (WB2-02 carte des concepts) monte + build OK.
 */
const nodes = [
	{
		id: "idee",
		position: { x: 0, y: 0 },
		data: { label: "Idée" },
	},
	{
		id: "mur",
		position: { x: 160, y: 60 },
		data: { label: "Mur" },
	},
];
const edges = [{ id: "idee-mur", source: "idee", target: "mur" }];

export default function FlowSmoke() {
	return (
		<div
			data-testid="v2-smoke-flow"
			style={{ width: 280, height: 140 }}
			className="overflow-hidden rounded-md border border-border"
		>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				fitView
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				proOptions={{ hideAttribution: true }}
			>
				<Background />
			</ReactFlow>
		</div>
	);
}
