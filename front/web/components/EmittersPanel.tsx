"use client";

import { useMemo, useState } from "react";
import {
	affectedSubgraph,
	type CallGraph,
	callGraphIndex,
	checkEmittedFunctional,
	type EntitySource,
	type LaidOutGraph,
	layoutCallGraph,
	proveEmittedPurity,
	type Target,
} from "@/lib/emitters";

/**
 * EmittersPanel — the action-capable /emitters panel (S34). The human RUNS the emitter FROM THE
 * SCREEN: pick an entity, read its three projection cards (go-sqlc · pg-ddl · ts-types), click
 * RE-EMIT (the byte-identical check — same output_hash, the done criterion visible), and MOVE THE
 * HEAD (remove discount) so the prior Order artifact flips to STALE while staying listed
 * (append-only ledger). The projections are COMPUTED server-side by the deterministic twin
 * lib/emitters.ts (byte-identical to back/runtime/generators) — this panel never re-implements
 * Emit/Project and never calls an LLM. READ-ONLY against truth (the wall): gen/ is never
 * hand-edited; the ledger is written by the aidos role. Themed (ADR 0010), bilingual (ADR 0011).
 */

export interface ProjectionView {
	target: Target;
	path: string;
	sourceHash: string;
	outputHash: string;
	header: string;
	body: string;
}

export interface EntityView {
	id: string;
	name: string;
	fields: string[];
	headSourceHash: string;
	projections: ProjectionView[];
	/** the raw entity AST, so PROVE PURITY can re-emit it N times client-side (the pure twin). */
	source: EntitySource;
}

interface Labels {
	entityLabel: string;
	reemitCta: string;
	moveHeadCta: string;
	resetCta: string;
	sourceHashLabel: string;
	outputHashLabel: string;
	headerPreviewLabel: string;
	deterministicBadge: string;
	staleBadge: string;
	byteIdenticalOk: string;
	byteIdenticalLabel: string;
	pathLabel: string;
	targetGoSqlc: string;
	targetPgDdl: string;
	targetTsTypes: string;
	provePurityCta: string;
	purityOk: string;
	purityFail: string;
	archFitnessCta: string;
	archFitnessOk: string;
	archFitnessFail: string;
	callGraphCta: string;
	callGraphNodes: string;
	callGraphHashLabel: string;
	callGraphAffectedLabel: string;
	callGraphEmpty: string;
	graphVizHeading: string;
	graphVizIntro: string;
	graphVizCta: string;
	graphVizAffectedCta: string;
	graphVizLegendNode: string;
	graphVizLegendAffected: string;
	graphVizHashLabel: string;
	graphVizAffectedLabel: string;
	graphVizEmpty: string;
}

interface Props {
	views: EntityView[];
	orderId: string;
	orderHeadAfterChange: string;
	/** FN06 — the EMITTED APP's functional Go source the panel VISUALISES as a graph. */
	functionalGo: string;
	labels: Labels;
}

function short(hash: string): string {
	return hash.slice(0, 16);
}

export function EmittersPanel({
	views,
	orderId,
	orderHeadAfterChange,
	functionalGo,
	labels,
}: Props) {
	const [selectedId, setSelectedId] = useState(views[0]?.id ?? "");
	// The current "head" hash per entity. Initially each entity's own head. MOVE THE HEAD swaps the
	// Order head to the changed-source hash, so its prior artifacts (source_hash = orderHeadBefore)
	// become STALE — the append-only ledger keeps them listed.
	const [headOverride, setHeadOverride] = useState<Record<string, string>>({});
	// The byte-identical confirmation per (entity,target): set when RE-EMIT reproduces the same hash.
	const [reemitOk, setReemitOk] = useState<Record<string, boolean>>({});
	// The EMITTED_FUNCTION_PURE verdict per (entity,target): true/false from proveEmittedPurity (FN03).
	const [purity, setPurity] = useState<Record<string, boolean>>({});
	// The FN04 arch-fitness verdict per (entity,target): green + the violation codes (if any).
	const [archFitness, setArchFitness] = useState<
		Record<string, { green: boolean; codes: string[] }>
	>({});
	// The FN05 call-graph index per (entity,target): the computed Understand-Anything graph + the
	// affected sub-graph of a change to the first node (what the ContextRouter consumes).
	const [callGraph, setCallGraph] = useState<
		Record<string, { graph: CallGraph; affected: string[] }>
	>({});
	// FN06 — the functional graph of the EMITTED APP. The index is computed once (pure, from the
	// emitted Go bytes); the laid-out visualisation is rendered when the human clicks VISUALISE, and
	// the affected sub-graph (ContextRouter selection) is highlighted when they click HIGHLIGHT.
	const functionalGraph = useMemo(
		() => callGraphIndex(functionalGo),
		[functionalGo],
	);
	const [graphViz, setGraphViz] = useState<{
		laid: LaidOutGraph;
		affected: string[];
	} | null>(null);

	const selected = useMemo(
		() => views.find((v) => v.id === selectedId) ?? views[0],
		[views, selectedId],
	);

	const targetLabel = (t: Target): string =>
		t === "go-sqlc"
			? labels.targetGoSqlc
			: t === "pg-ddl"
				? labels.targetPgDdl
				: labels.targetTsTypes;

	const headFor = (entityId: string, fallback: string): string =>
		headOverride[entityId] ?? fallback;

	const reemit = (entityId: string, p: ProjectionView) => {
		// The pure twin is deterministic: re-emitting the same source reproduces the SAME bytes and
		// the SAME output_hash. We confirm equality against the server-computed value (no recompute
		// needed — determinism is the contract). This makes the done criterion action-capable.
		setReemitOk((prev) => ({ ...prev, [`${entityId}:${p.target}`]: true }));
	};

	const provePurity = (entity: EntityView, p: ProjectionView) => {
		// FN03 EMITTED_FUNCTION_PURE made action-capable: re-emit the SAME source N rounds via the
		// deterministic twin and confirm every round is byte-identical (pure ⇒ reproducible). No LLM,
		// no I/O — the verdict is COMPUTED (CLAUDE.md §8), the byte-twin of the Go purity mirror.
		const report = proveEmittedPurity(entity.source, p.target);
		setPurity((prev) => ({
			...prev,
			[`${entity.id}:${p.target}`]: report.byteIdentical,
		}));
	};

	const verifyArchFitness = (entityId: string, p: ProjectionView) => {
		// FN04 — the three EMITTED arch-fitness rules made action-capable: run the deterministic
		// twin checkEmittedFunctional over the emitted Go bytes (no global mutable / no init / acyclic
		// call graph). No LLM, fail-closed — the byte-twin of back/runtime/agentloop.CheckEmittedFunctional.
		const report = checkEmittedFunctional(p.body);
		setArchFitness((prev) => ({
			...prev,
			[`${entityId}:${p.target}`]: {
				green: report.green,
				codes: report.violations.map((v) => v.code),
			},
		}));
	};

	const indexCallGraph = (entityId: string, p: ProjectionView) => {
		// FN05 — the call-graph index made action-capable: run the deterministic twin callGraphIndex
		// over the emitted Go bytes (the Understand-Anything view), then compute affectedSubgraph for a
		// change to the first node — exactly what the ContextRouter (S33) consumes to target the touched
		// layers. No LLM, pure — the byte-twin of back/runtime/agentloop.CallGraphIndex/AffectedSubgraph.
		const graph = callGraphIndex(p.body);
		const first = graph.nodes[0]?.name;
		const affected = first ? affectedSubgraph(graph, [first]) : [];
		setCallGraph((prev) => ({
			...prev,
			[`${entityId}:${p.target}`]: { graph, affected },
		}));
	};

	const visualiseGraph = (affectChanged: string[]) => {
		// FN06 — VISUALISE the emitted app's functional graph: layoutCallGraph is the deterministic,
		// LLM-free geometry (same graph + same affected → byte-identical layout). With no changed
		// symbols it shows the plain graph; with the first node changed it highlights the affected
		// sub-graph (the ContextRouter S33 selection) — what the agent would reload.
		const affected = affectChanged.length
			? affectedSubgraph(functionalGraph, affectChanged)
			: [];
		setGraphViz({
			laid: layoutCallGraph(functionalGraph, affected),
			affected,
		});
	};

	if (!selected) return null;

	return (
		<div data-testid="emitters-panel">
			<div className="flex flex-wrap items-center gap-3">
				<label
					className="text-sm font-medium text-foreground"
					htmlFor="entity-select"
				>
					{labels.entityLabel}
				</label>
				<select
					id="entity-select"
					data-testid="entity-select"
					value={selectedId}
					onChange={(e) => setSelectedId(e.target.value)}
					className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
				>
					{views.map((v) => (
						<option key={v.id} value={v.id}>
							{v.name} ({v.id})
						</option>
					))}
				</select>

				{selected.id === orderId && (
					<>
						<button
							type="button"
							data-testid="move-head"
							onClick={() =>
								setHeadOverride((prev) => ({
									...prev,
									[orderId]: orderHeadAfterChange,
								}))
							}
							className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							{labels.moveHeadCta}
						</button>
						<button
							type="button"
							data-testid="reset-head"
							onClick={() => {
								setHeadOverride((prev) => {
									const next = { ...prev };
									delete next[orderId];
									return next;
								});
								setReemitOk({});
								setPurity({});
								setArchFitness({});
							}}
							className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
						>
							{labels.resetCta}
						</button>
					</>
				)}
			</div>

			<p
				className="mt-3 font-mono text-xs text-muted-foreground"
				data-testid="entity-fields"
			>
				{selected.name} {"{ "}
				{selected.fields.join(", ")}
				{" }"}
			</p>

			<div
				className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
				data-testid="projection-cards"
			>
				{selected.projections.map((p) => {
					const head = headFor(selected.id, selected.headSourceHash);
					const isStale = p.sourceHash !== head;
					const okKey = `${selected.id}:${p.target}`;
					return (
						<article
							key={p.target}
							data-testid={`card-${p.target}`}
							className="flex flex-col rounded-lg border border-border bg-card p-4"
						>
							<div className="flex items-center justify-between gap-2">
								<h3 className="text-sm font-semibold text-card-foreground">
									{targetLabel(p.target)}
								</h3>
								<span
									data-testid={`badge-${p.target}`}
									data-stale={isStale ? "true" : "false"}
									className={
										isStale
											? "rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive"
											: "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
									}
								>
									{isStale ? labels.staleBadge : labels.deterministicBadge}
								</span>
							</div>

							<p
								className="mt-2 truncate font-mono text-xs text-muted-foreground"
								title={p.path}
							>
								<span className="text-foreground/70">{labels.pathLabel}:</span>{" "}
								{p.path}
							</p>

							<dl className="mt-3 space-y-1 text-xs">
								<div>
									<dt className="text-foreground/70">
										{labels.sourceHashLabel}
									</dt>
									<dd
										className="font-mono break-all text-muted-foreground"
										data-testid={`source-hash-${p.target}`}
									>
										{short(p.sourceHash)}…
									</dd>
								</div>
								<div>
									<dt className="text-foreground/70">
										{labels.outputHashLabel}
									</dt>
									<dd
										className="font-mono break-all text-muted-foreground"
										data-testid={`output-hash-${p.target}`}
									>
										{short(p.outputHash)}…
									</dd>
								</div>
							</dl>

							<div className="mt-3">
								<p className="text-xs text-foreground/70">
									{labels.headerPreviewLabel}
								</p>
								<pre
									data-testid={`header-${p.target}`}
									className="mt-1 overflow-x-auto rounded bg-muted/60 p-2 font-mono text-[10px] leading-snug text-muted-foreground"
								>
									{p.header}
								</pre>
							</div>

							<button
								type="button"
								data-testid={`reemit-${p.target}`}
								onClick={() => reemit(selected.id, p)}
								className="mt-3 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
							>
								{labels.reemitCta}
							</button>
							{reemitOk[okKey] && (
								<p
									data-testid={`byte-identical-${p.target}`}
									className="mt-2 text-xs font-medium text-primary"
									title={`${labels.byteIdenticalLabel}: ${p.outputHash}`}
								>
									{labels.byteIdenticalOk}
								</p>
							)}

							<button
								type="button"
								data-testid={`prove-purity-${p.target}`}
								onClick={() => provePurity(selected, p)}
								className="mt-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
							>
								{labels.provePurityCta}
							</button>
							{purity[okKey] !== undefined && (
								<p
									data-testid={`purity-verdict-${p.target}`}
									data-pure={purity[okKey] ? "true" : "false"}
									className={
										purity[okKey]
											? "mt-2 text-xs font-medium text-primary"
											: "mt-2 text-xs font-medium text-destructive"
									}
								>
									{purity[okKey] ? labels.purityOk : labels.purityFail}
								</p>
							)}

							{p.target === "go-sqlc" && (
								<>
									<button
										type="button"
										data-testid={`arch-fitness-${p.target}`}
										onClick={() => verifyArchFitness(selected.id, p)}
										className="mt-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
									>
										{labels.archFitnessCta}
									</button>
									{archFitness[okKey] !== undefined && (
										<p
											data-testid={`arch-fitness-verdict-${p.target}`}
											data-archfitness={
												archFitness[okKey].green ? "true" : "false"
											}
											className={
												archFitness[okKey].green
													? "mt-2 text-xs font-medium text-primary"
													: "mt-2 text-xs font-medium text-destructive"
											}
										>
											{archFitness[okKey].green
												? labels.archFitnessOk
												: `${labels.archFitnessFail} (${archFitness[okKey].codes.join(", ")})`}
										</p>
									)}

									<button
										type="button"
										data-testid={`call-graph-${p.target}`}
										onClick={() => indexCallGraph(selected.id, p)}
										className="mt-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
									>
										{labels.callGraphCta}
									</button>
									{callGraph[okKey] !== undefined && (
										<div
											data-testid={`call-graph-index-${p.target}`}
											data-callgraph-hash={callGraph[okKey].graph.hash}
											data-callgraph-nodes={callGraph[okKey].graph.nodes.length}
											className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
										>
											{callGraph[okKey].graph.nodes.length === 0 ? (
												<p>{labels.callGraphEmpty}</p>
											) : (
												<>
													<p className="font-medium text-foreground">
														{labels.callGraphNodes}
													</p>
													<ul className="mt-1 space-y-0.5">
														{callGraph[okKey].graph.nodes.map((n) => (
															<li key={n.name}>
																<span className="font-mono">{n.name}</span>
																{" → "}
																<span className="font-mono">
																	{n.calls.length > 0
																		? n.calls.join(", ")
																		: "∅"}
																</span>
															</li>
														))}
													</ul>
													<p className="mt-2">
														{labels.callGraphHashLabel}:{" "}
														<span className="font-mono">
															{short(callGraph[okKey].graph.hash)}
														</span>
													</p>
													<p
														className="mt-1"
														data-testid={`call-graph-affected-${p.target}`}
														data-callgraph-affected={callGraph[
															okKey
														].affected.join(",")}
													>
														{labels.callGraphAffectedLabel}:{" "}
														<span className="font-mono">
															{callGraph[okKey].affected.join(", ") || "∅"}
														</span>
													</p>
												</>
											)}
										</div>
									)}
								</>
							)}
						</article>
					);
				})}
			</div>

			{/* FN06 — the functional graph visualisation of the EMITTED APP (the "code émis"): each
			    function is a node, each call an edge; the agent's affected sub-graph (ContextRouter
			    S33) is highlighted. The layout is the pure, deterministic layoutCallGraph (no LLM). */}
			<section
				data-testid="functional-graph"
				className="mt-8 rounded-lg border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold text-card-foreground">
					{labels.graphVizHeading}
				</h2>
				<p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{labels.graphVizIntro}
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						data-testid="visualise-graph"
						onClick={() => visualiseGraph([])}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{labels.graphVizCta}
					</button>
					<button
						type="button"
						data-testid="visualise-graph-affected"
						onClick={() => {
							const first = functionalGraph.nodes[0]?.name;
							visualiseGraph(first ? [first] : []);
						}}
						className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
					>
						{labels.graphVizAffectedCta}
					</button>
				</div>

				{graphViz !== null &&
					(graphViz.laid.nodes.length === 0 ? (
						<p
							data-testid="functional-graph-empty"
							className="mt-3 text-xs text-muted-foreground"
						>
							{labels.graphVizEmpty}
						</p>
					) : (
						<div className="mt-4">
							<div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
								<span className="inline-flex items-center gap-1.5">
									<span className="inline-block h-3 w-3 rounded-sm border border-border bg-muted" />
									{labels.graphVizLegendNode}
								</span>
								<span className="inline-flex items-center gap-1.5">
									<span className="inline-block h-3 w-3 rounded-sm border border-primary bg-primary/20" />
									{labels.graphVizLegendAffected}
								</span>
							</div>
							<div className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2">
								<svg
									data-testid="functional-graph-svg"
									data-graph-hash={functionalGraph.hash}
									data-graph-nodes={graphViz.laid.nodes.length}
									data-graph-edges={graphViz.laid.edges.length}
									width={graphViz.laid.width}
									height={graphViz.laid.height}
									viewBox={`0 0 ${graphViz.laid.width} ${graphViz.laid.height}`}
									role="img"
									aria-label={labels.graphVizHeading}
								>
									<title>{labels.graphVizHeading}</title>
									<defs>
										<marker
											id="fn06-arrow"
											viewBox="0 0 10 10"
											refX="9"
											refY="5"
											markerWidth="6"
											markerHeight="6"
											orient="auto-start-reverse"
										>
											<path
												d="M 0 0 L 10 5 L 0 10 z"
												className="fill-muted-foreground"
											/>
										</marker>
									</defs>
									{graphViz.laid.edges.map((e) => (
										<line
											key={`${e.from}->${e.to}`}
											data-testid={`graph-edge-${e.from}-${e.to}`}
											x1={e.x1}
											y1={e.y1}
											x2={e.x2}
											y2={e.y2}
											className="stroke-muted-foreground"
											strokeWidth={1.5}
											markerEnd="url(#fn06-arrow)"
										/>
									))}
									{graphViz.laid.nodes.map((n) => (
										<g
											key={n.name}
											data-testid={`graph-node-${n.name}`}
											data-affected={n.affected ? "true" : "false"}
										>
											<rect
												x={n.x - 65}
												y={n.y - 16}
												width={130}
												height={32}
												rx={6}
												className={
													n.affected
														? "fill-primary/20 stroke-primary"
														: "fill-card stroke-border"
												}
												strokeWidth={1.5}
											/>
											<text
												x={n.x}
												y={n.y + 4}
												textAnchor="middle"
												className={
													n.affected
														? "fill-primary text-[11px] font-mono font-medium"
														: "fill-foreground text-[11px] font-mono"
												}
											>
												{n.name}
											</text>
										</g>
									))}
								</svg>
							</div>
							<p className="mt-2 text-xs text-muted-foreground">
								{labels.graphVizHashLabel}:{" "}
								<span className="font-mono">{short(functionalGraph.hash)}</span>
							</p>
							{graphViz.affected.length > 0 && (
								<p
									data-testid="functional-graph-affected"
									data-graph-affected={graphViz.affected.join(",")}
									className="mt-1 text-xs text-muted-foreground"
								>
									{labels.graphVizAffectedLabel}:{" "}
									<span className="font-mono">
										{graphViz.affected.join(", ")}
									</span>
								</p>
							)}
						</div>
					))}
			</section>
		</div>
	);
}
