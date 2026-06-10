"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	graphTally,
	type NeedSample,
	needGraph,
	type SpecGraphNode,
} from "@/lib/v2/ai-lab";

// react-force-graph-3d uses WebGL/window → client-only, no SSR.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
	ssr: false,
	// biome-ignore lint/suspicious/noExplicitAny: react-force-graph-3d's prop types are loose.
}) as any;

/**
 * WB2-18 — le GRAPHE 3D façon Obsidian, côté écran (client-only, le twin pur). Chaque spec (placée) +
 * chaque spec du DAG existant est un NŒUD posé sur 3 axes (x = niveau, y = facette, z = profondeur).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on CHOISIT un BESOIN D'EXEMPLE → son graphe monte (specs placées + DAG existant + vague de rouge) ;
 *   - on clique « Valider tout » → la vague de rouge se RÉSOUT (les nœuds DAG impactés passent rouge → vert) ;
 *   - on clique « Réinitialiser » → la vague de rouge revient.
 * Tout délégué au twin pur lib/v2/ai-lab.ts (needGraph / graphTally — buildSpecGraph réutilisé de v1).
 *
 * LE MUR (§2) : le graphe LIT ; il n'écrit AUCUNE vérité — c'est une vue de lab (proposition). La
 * promotion passe par idée → miroir → /goal.
 */

type Strings = Record<string, string>;

/** La couleur d'un nœud — l'état porté visuellement (déterministe, pure). */
function nodeColor(n: SpecGraphNode): string {
	if (n.kind === "dag") {
		if (n.resolved) return "#22c55e"; // impacté mais résolu → vert (la vague de rouge est levée)
		return n.impacted ? "#ef4444" : "#9ca3af"; // impacté → rouge ; sinon DAG existant → gris
	}
	if (n.status === "realized") return "#2563eb"; // réalisé → bleu
	if (n.status === "validated") return "#22c55e"; // validé → vert
	return "#f59e0b"; // proposé → ambre
}

export function GrapheClient({
	samples,
	t,
}: {
	samples: readonly NeedSample[];
	t: Strings;
}) {
	const [sampleId, setSampleId] = useState<string>(samples[0]?.id ?? "");
	const [validated, setValidated] = useState(false);

	const sample = useMemo(
		() => samples.find((s) => s.id === sampleId) ?? samples[0],
		[samples, sampleId],
	);
	const graph = useMemo(
		() => (sample ? needGraph(sample, validated) : { nodes: [], links: [] }),
		[sample, validated],
	);
	const tally = useMemo(() => graphTally(graph), [graph]);

	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(800);
	const height = 520;

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => setWidth(el.clientWidth);
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Fixe chaque nœud à sa coordonnée 3-axes (layout déterministe, pas une force aléatoire).
	const data = useMemo(
		() => ({
			nodes: graph.nodes.map((n) => ({ ...n, fx: n.x, fy: n.y, fz: n.z })),
			links: graph.links.map((l) => ({ ...l })),
		}),
		[graph],
	);

	const allGreen = tally.impacted > 0 && tally.resolved === tally.impacted;

	return (
		<div
			data-testid="v2-graphe"
			data-all-green={allGreen}
			className="space-y-4"
		>
			{/* le sélecteur de besoin + les actions */}
			<section className="space-y-3 rounded-lg border border-border bg-card p-4">
				<div className="space-y-1">
					<h2 className="text-sm font-semibold text-foreground">
						{t.samplesHeading}
					</h2>
					<p className="text-xs text-muted-foreground">{t.samplesHint}</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{samples.map((s) => {
						const active = s.id === sampleId;
						return (
							<button
								key={s.id}
								type="button"
								data-testid={`v2-graphe-sample-${s.id}`}
								aria-pressed={active}
								onClick={() => {
									setSampleId(s.id);
									setValidated(false);
								}}
								className={[
									"rounded-md border px-3 py-1.5 text-left text-xs transition-colors",
									active
										? "border-primary bg-primary/10 font-semibold text-primary"
										: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
								].join(" ")}
							>
								{s.role}
							</button>
						);
					})}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="v2-graphe-validate-all"
						disabled={validated || tally.impacted === 0}
						onClick={() => setValidated(true)}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{t.validateAllBtn}
					</button>
					<button
						type="button"
						data-testid="v2-graphe-reset"
						disabled={!validated}
						onClick={() => setValidated(false)}
						className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
					>
						{t.resetBtn}
					</button>
				</div>
			</section>

			{/* le résumé (tally) */}
			<section
				data-testid="v2-graphe-tally"
				data-specs={tally.specs}
				data-dag={tally.dag}
				data-impacted={tally.impacted}
				data-resolved={tally.resolved}
				data-links={tally.links}
				className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs"
			>
				<span className="font-semibold text-amber-600">
					{tally.specs} {t.tallySpecs}
				</span>
				<span className="text-muted-foreground">
					{tally.dag} {t.tallyDag}
				</span>
				<span className="font-semibold text-red-600">
					{tally.impacted} {t.tallyImpacted}
				</span>
				<span className="font-semibold text-green-600">
					{tally.resolved} {t.tallyResolved}
				</span>
				<span className="text-muted-foreground">
					{tally.links} {t.tallyLinks}
				</span>
			</section>

			{/* le graphe 3D */}
			<div
				ref={ref}
				data-testid="v2-graphe-3d"
				data-node-count={graph.nodes.length}
				className="relative overflow-hidden rounded-lg border border-border bg-background"
				style={{ height }}
			>
				{graph.nodes.length === 0 ? (
					<div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
						{t.graphEmpty}
					</div>
				) : (
					<ForceGraph3D
						graphData={data}
						width={width}
						height={height}
						backgroundColor="rgba(0,0,0,0)"
						nodeLabel={(n: SpecGraphNode) =>
							`${n.facet} · ${n.level} · ${n.label}`
						}
						nodeColor={(n: SpecGraphNode) => nodeColor(n)}
						nodeOpacity={0.95}
						nodeRelSize={5}
						linkColor={(l: { kind: string }) =>
							l.kind === "impact" ? "#ef4444" : "#6b7280"
						}
						linkWidth={(l: { kind: string }) =>
							l.kind === "impact" ? 1.5 : 0.8
						}
						linkDirectionalArrowLength={3}
						linkDirectionalArrowRelPos={1}
						cooldownTicks={0}
						enableNodeDrag={false}
					/>
				)}
				{/* la légende des 3 axes */}
				<div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-card/80 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
					<div>{t.axisX}</div>
					<div>{t.axisY}</div>
					<div>{t.axisZ}</div>
				</div>
			</div>

			<p className="text-xs text-muted-foreground">{t.graphHint}</p>

			{/* la légende des couleurs + des liens */}
			<section className="space-y-2 rounded-lg border border-border bg-card p-4 text-xs">
				<h2 className="font-semibold text-foreground">{t.legendHeading}</h2>
				<div className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground">
					<Swatch color="#f59e0b" label={t.legendProposed} />
					<Swatch color="#22c55e" label={t.legendValidated} />
					<Swatch color="#2563eb" label={t.legendRealized} />
					<Swatch color="#9ca3af" label={t.legendDag} />
					<Swatch color="#ef4444" label={t.legendImpacted} />
					<Swatch color="#22c55e" label={t.legendResolved} />
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-muted-foreground">
					<Swatch color="#6b7280" label={t.linkDescent} />
					<Swatch color="#ef4444" label={t.linkImpact} />
				</div>
			</section>
		</div>
	);
}

function Swatch({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				aria-hidden
				className="inline-block size-2.5 rounded-full"
				style={{ backgroundColor: color }}
			/>
			{label}
		</span>
	);
}
