"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { SpecGraph, SpecGraphNode } from "@/lib/ai-lab";

// react-force-graph-3d uses WebGL/window → client-only, no SSR.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
	ssr: false,
});

/**
 * SpecGraph3D — the Obsidian-style 3D graph of every spec & sous-spec, on the 3 FKE axes
 * (x = verticale level, y = facette, z = anatomy depth / sous-spec). Nodes are FIXED at their
 * deterministic coordinate (fx/fy/fz from lib/ai-lab buildSpecGraph) — the layout is the 3-axis
 * grid, not a random force. Color: spec=amber, validated=green, realized=blue, existing DAG=grey,
 * impacted DAG=red. This is the RENDER only; the graph data is the pure twin (determinism-first).
 */
function nodeColor(n: SpecGraphNode): string {
	if (n.kind === "dag") {
		if (n.resolved) return "#22c55e"; // impacted but resolved → green (red wave cleared)
		return n.impacted ? "#ef4444" : "#9ca3af";
	}
	if (n.status === "realized") return "#2563eb";
	if (n.status === "validated") return "#22c55e";
	return "#f59e0b";
}

export function SpecGraph3D({
	graph,
	height = 560,
}: {
	graph: SpecGraph;
	height?: number;
}) {
	const t = useTranslations("aiLab");
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(800);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => setWidth(el.clientWidth);
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Fix every node at its 3-axis coordinate (deterministic layout, not a force sim).
	const data = {
		nodes: graph.nodes.map((n) => ({
			...n,
			fx: n.x,
			fy: n.y,
			fz: n.z,
		})),
		links: graph.links.map((l) => ({ ...l })),
	};

	return (
		<div
			ref={ref}
			data-testid="spec-graph-3d"
			className="relative overflow-hidden rounded-lg border border-border bg-background"
			style={{ height }}
		>
			{graph.nodes.length === 0 ? (
				<div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
					{t("graphEmpty")}
				</div>
			) : (
				// biome-ignore lint/suspicious/noExplicitAny: react-force-graph-3d's prop types are loose.
				<ForceGraph3D
					graphData={data as any}
					width={width}
					height={height}
					backgroundColor="rgba(0,0,0,0)"
					nodeLabel={(n: any) =>
						`${t(`facet_${n.facet}`)} · ${n.level} · ${n.label}`
					}
					nodeColor={(n: any) => nodeColor(n as SpecGraphNode)}
					nodeOpacity={0.95}
					nodeRelSize={5}
					linkColor={(l: any) => (l.kind === "impact" ? "#ef4444" : "#6b7280")}
					linkWidth={(l: any) => (l.kind === "impact" ? 1.5 : 0.8)}
					linkDirectionalArrowLength={3}
					linkDirectionalArrowRelPos={1}
					cooldownTicks={0}
					enableNodeDrag={false}
				/>
			)}
			{/* the 3-axis legend */}
			<div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-card/80 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
				<div>{t("graphAxisX")}</div>
				<div>{t("graphAxisY")}</div>
				<div>{t("graphAxisZ")}</div>
			</div>
		</div>
	);
}
