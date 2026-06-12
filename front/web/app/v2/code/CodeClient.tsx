"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { type NodeApi, Tree } from "react-arborist";
import {
	actionKey,
	anchorSymbols,
	type CodeEdge,
	type CodeNode,
	codePath,
	godNodes,
	type ImpactItem,
	impactOf,
} from "@/lib/v2/code-graph";
import { nodePath, seedComposes } from "@/lib/v2/composition";

// react-force-graph-3d utilise WebGL/window → client-only, jamais de SSR (même motif que SpecGraph3D).
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
	ssr: false,
});

/**
 * WB2-26 — le CLIENT de la descente dans le code (ADR 0056 — graphify + Bazel).
 *
 * ACTION-CAPABLE (ui-completeness) : l'écran NE FAIT PAS qu'afficher — on DESCEND (arbre de
 * contenance virtualisé), on ANCRE (requirement → telle classe, telle fonction), on LIT le code
 * à la ligne (span surligné, version, clé Bazel, « Ouvrir dans VS Code ») et on SIMULE « et si
 * je modifie ? » (impactOf — la vague de rouge au grain code, calculée jamais estimée).
 *
 * DÉTERMINISME-FIRST (§6/§8) : TOUT le calcul est délégué au twin pur client-safe
 * lib/v2/code-graph.ts (impactOf, actionKey, codePath, anchorSymbols, godNodes) ; ce composant
 * n'est QUE du rendu + de l'état d'écran. Il n'importe JAMAIS lib/v2/code-extract (qui importe
 * `typescript` — serveur seulement) : le graphe arrive déjà extrait, sérialisé, du serveur.
 *
 * LE MUR (§2) : lecture + simulation ; aucune écriture kernel/mirrors/fitness.
 */

type Strings = Record<string, string>;

/** L'adaptateur Arborist : CodeNode (plat, parentId) → { id, name, children } que la lib consomme. */
interface ArbNode {
	id: string;
	name: string;
	kind: CodeNode["kind"];
	file: string;
	start: number;
	end: number;
	children: ArbNode[];
}

/** Construit l'arbre de CONTENANCE (fichier → classe/fonction → méthode) depuis parentId. */
function buildContainmentTree(nodes: readonly CodeNode[]): ArbNode[] {
	const arb = new Map<string, ArbNode>();
	for (const n of nodes) {
		arb.set(n.id, {
			id: n.id,
			name: n.name,
			kind: n.kind,
			file: n.file,
			start: n.span.start,
			end: n.span.end,
			children: [],
		});
	}
	const roots: ArbNode[] = [];
	for (const n of nodes) {
		const a = arb.get(n.id);
		if (a === undefined) continue;
		const parent = n.parentId === null ? undefined : arb.get(n.parentId);
		if (parent === undefined) roots.push(a);
		else parent.children.push(a);
	}
	return roots;
}

/** L'adresse lisible d'un symbole — l'attribut data-symbol des testids. */
function symbolOf(n: { file: string; name: string }): string {
	return `${n.file}#${n.name}`;
}

/** La forme des nœuds/arêtes passés au graphe 3D (sérialisée depuis le graphe de code). */
interface Graph3DNode {
	id: string;
	name: string;
	kind: CodeNode["kind"];
	file: string;
}
interface Graph3DLink {
	confidence: CodeEdge["confidence"];
}

/** Les couleurs WebGL par genre (hex requis par three.js — même précédent que SpecGraph3D). */
const KIND_COLORS: Record<CodeNode["kind"], string> = {
	file: "#6b7280",
	class: "#8b5cf6",
	function: "#2563eb",
	method: "#0ea5e9",
};
const IMPACTED_COLOR = "#ef4444";
const SELECTED_COLOR = "#f59e0b";

export function CodeClient({
	nodes,
	edges,
	sources,
	absBase,
	t,
}: {
	nodes: readonly CodeNode[];
	edges: readonly CodeEdge[];
	sources: Record<string, string>;
	absBase: string;
	t: Strings;
}) {
	const byId = useMemo(
		() => new Map(nodes.map((n) => [n.id, n] as const)),
		[nodes],
	);
	const arbRoots = useMemo(() => buildContainmentTree(nodes), [nodes]);

	// ── l'état d'écran : le focus, la vague simulée, le requirement choisi ──────────
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [impact, setImpact] = useState<ImpactItem[] | null>(null);
	const [copied, setCopied] = useState(false);

	const select = (id: string) => {
		setSelectedId(id);
		setImpact(null); // une nouvelle cause → l'ancienne vague est obsolète
		setCopied(false);
	};

	const selected = selectedId === null ? null : (byId.get(selectedId) ?? null);
	const impactedIds = useMemo(
		() => new Set((impact ?? []).map((i) => i.id)),
		[impact],
	);

	// ── le requirement (l'arbre composes) → les ancrages suggérés ──────────────────
	const composes = useMemo(() => seedComposes(), []);
	const reqPaths = useMemo(
		() => composes.map((n) => nodePath(composes, n.id).join("/")),
		[composes],
	);
	const [reqPath, setReqPath] = useState("app/paiement/checkout");
	const anchors = useMemo(
		() => anchorSymbols(composes, nodes, edges, reqPath).slice(0, 8),
		[composes, nodes, edges, reqPath],
	);

	// ── les god nodes (graphify) : les 5 plus forts degrés entrants ────────────────
	const gods = useMemo(() => godNodes(nodes, edges, 5), [nodes, edges]);

	// ── le panneau code : le source du fichier sélectionné, span surligné ──────────
	const paneRef = useRef<HTMLDivElement>(null);
	const fileLines = useMemo(
		() => (selected === null ? [] : (sources[selected.file] ?? "").split("\n")),
		[selected, sources],
	);
	useEffect(() => {
		// Centre la première ligne surlignée dans le panneau (sans déplacer la page).
		const pane = paneRef.current;
		if (pane === null || selected === null) return;
		const target = pane.querySelector<HTMLElement>(
			`[data-line="${selected.span.start}"]`,
		);
		if (target !== null)
			pane.scrollTop = Math.max(
				0,
				target.offsetTop - pane.clientHeight / 2 + target.clientHeight / 2,
			);
	}, [selected]);

	const breadcrumb = selected === null ? [] : codePath(nodes, selected.id);
	const bazelKey =
		selected === null ? "" : actionKey(nodes, edges, selected.id);
	const pathLine =
		selected === null ? "" : `${selected.file}:${selected.span.start}`;

	const copyPath = () => {
		if (selected === null) return;
		navigator.clipboard
			?.writeText(`${absBase}/${selected.file}:${selected.span.start}`)
			.then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			})
			.catch(() => setCopied(false));
	};

	// ── la vague groupée par profondeur (1 = direct, 2 = transitif…) ───────────────
	const wavesByDepth = useMemo(() => {
		const groups = new Map<number, ImpactItem[]>();
		for (const it of impact ?? []) {
			const bucket = groups.get(it.depth);
			if (bucket === undefined) groups.set(it.depth, [it]);
			else bucket.push(it);
		}
		return [...groups.entries()].sort((a, b) => a[0] - b[0]);
	}, [impact]);

	// ── le graphe 3D : monté paresseusement (la page reste légère) ─────────────────
	const [graphMounted, setGraphMounted] = useState(false);
	useEffect(() => setGraphMounted(true), []);
	const graphRef = useRef<HTMLDivElement>(null);
	const [graphWidth, setGraphWidth] = useState(800);
	useEffect(() => {
		const el = graphRef.current;
		if (el === null) return;
		const measure = () => setGraphWidth(el.clientWidth);
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const graphData = useMemo(
		() => ({
			nodes: nodes.map((n) => ({
				id: n.id,
				name: n.name,
				kind: n.kind,
				file: n.file,
			})),
			links: edges.map((e) => ({
				source: e.from,
				target: e.to,
				kind: e.kind,
				confidence: e.confidence,
			})),
		}),
		[nodes, edges],
	);

	const kindLabel: Record<CodeNode["kind"], string> = {
		file: t.kindFile,
		class: t.kindClass,
		function: t.kindFunction,
		method: t.kindMethod,
	};

	// Les accesseurs TYPÉS du graphe 3D (les props de react-force-graph-3d sont lâches : on
	// reçoit `unknown` puis on resserre vers nos formes — jamais de `any`).
	const nodeLabel3D = (n: unknown): string => {
		const g = n as Graph3DNode;
		return `${kindLabel[g.kind]} · ${g.name} · ${g.file}`;
	};
	const nodeColor3D = (n: unknown): string => {
		const g = n as Graph3DNode;
		if (impactedIds.has(g.id)) return IMPACTED_COLOR;
		if (g.id === selectedId) return SELECTED_COLOR;
		return KIND_COLORS[g.kind];
	};
	const linkColor3D = (l: unknown): string =>
		(l as Graph3DLink).confidence === "extracted" ? "#6b7280" : "#cbd5e1";
	const linkWidth3D = (l: unknown): number =>
		(l as Graph3DLink).confidence === "extracted" ? 1.4 : 0.6;
	const onNodeClick3D = (n: unknown): void => select((n as Graph3DNode).id);

	return (
		<div className="space-y-6">
			{/* ── b. LA BARRE REQUIREMENT : tel requirement → telle classe, telle fonction ── */}
			<section className="space-y-3 rounded-xl border border-border bg-card p-4">
				<div>
					<h2 className="text-sm font-semibold text-foreground">
						{t.reqHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.reqHint}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						{t.reqLabel}
						<select
							data-testid="v2-code-req"
							value={reqPath}
							onChange={(e) => setReqPath(e.target.value)}
							className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
						>
							{reqPaths.map((p) => (
								<option key={p} value={p}>
									{p}
								</option>
							))}
						</select>
					</label>
					<span className="text-xs text-muted-foreground">
						{t.anchorsLabel} :
					</span>
					{anchors.length === 0 ? (
						<span className="text-xs text-muted-foreground italic">
							{t.anchorsEmpty}
						</span>
					) : (
						anchors.map((a) => (
							<button
								key={a.nodeId}
								type="button"
								data-testid="v2-code-anchor"
								data-symbol={symbolOf(a)}
								onClick={() => select(a.nodeId)}
								className={[
									"flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
									a.nodeId === selectedId
										? "border-primary/40 bg-primary/10 text-primary"
										: "border-border bg-muted/40 text-foreground hover:bg-muted",
								].join(" ")}
							>
								<span>{a.name}</span>
								<span className="text-muted-foreground">
									{a.file.replace(/^lib\/v2\//, "")}
								</span>
								<span className="rounded bg-primary/10 px-1 text-[10px] text-primary">
									{a.score}
								</span>
							</button>
						))
					)}
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-5">
				{/* ── a. L'ARBRE DE CONTENANCE (React Arborist, virtualisé) ── */}
				<section className="space-y-2 lg:col-span-2">
					<h2 className="text-sm font-semibold text-foreground">
						{t.treeHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.treeHint}
					</p>
					<p className="font-mono text-xs text-muted-foreground">
						{t.nodeCount} : {nodes.length}
					</p>
					<div
						data-testid="v2-code-tree"
						className="rounded-xl border border-border bg-card p-2"
					>
						<Tree<ArbNode>
							data={arbRoots}
							idAccessor="id"
							childrenAccessor="children"
							openByDefault={false}
							width="100%"
							height={520}
							indent={16}
							rowHeight={30}
							overscanCount={8}
						>
							{({ node, style, dragHandle }) => (
								<CodeRow
									node={node}
									style={style}
									dragHandle={dragHandle}
									selectedId={selectedId}
									impacted={impactedIds.has(node.data.id)}
									kindLabel={kindLabel}
									onSelect={() => select(node.data.id)}
								/>
							)}
						</Tree>
					</div>
				</section>

				{/* ── c. LE PANNEAU CODE : la descente jusqu'à la LIGNE ── */}
				<section className="space-y-2 lg:col-span-3">
					<h2 className="text-sm font-semibold text-foreground">
						{t.paneHeading}
					</h2>
					{selected === null ? (
						<div
							data-testid="v2-code-pane"
							className="flex h-[520px] items-center justify-center rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
						>
							{t.paneEmpty}
						</div>
					) : (
						<div className="space-y-2">
							{/* l'en-tête : fil de contenance + version + lignes + clé Bazel + VS Code */}
							<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
								<span className="font-mono text-foreground">
									{breadcrumb.map((b, i) => (
										<span key={b.id}>
											{i > 0 && (
												<span className="text-muted-foreground"> → </span>
											)}
											{b.kind === "file"
												? b.name.replace(/^lib\/v2\//, "")
												: b.name}
										</span>
									))}
								</span>
								<span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
									v:{selected.version}
								</span>
								<span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
									{t.linesLabel} L{selected.span.start}–L{selected.span.end}
								</span>
								<span className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] text-primary">
									{t.actionKeyLabel} : {bazelKey}
								</span>
								<a
									data-testid="v2-code-vscode"
									href={`vscode://file${absBase}/${selected.file}:${selected.span.start}:1`}
									className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									{t.openVsCode}
								</a>
								<button
									type="button"
									onClick={copyPath}
									title={t.copyPath}
									className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-muted"
								>
									{copied ? t.copied : pathLine}
								</button>
							</div>

							{/* le source numéroté, le span du symbole surligné */}
							<div
								ref={paneRef}
								data-testid="v2-code-pane"
								className="max-h-[440px] overflow-auto rounded-xl border border-border bg-card py-1"
							>
								{fileLines.map((line, i) => {
									const ln = i + 1;
									const hit =
										ln >= selected.span.start && ln <= selected.span.end;
									return (
										<div
											key={ln}
											data-line={ln}
											className={[
												"flex font-mono text-[11px] leading-5",
												hit ? "bg-primary/10" : "",
											].join(" ")}
										>
											<span className="w-12 shrink-0 pr-3 text-right text-muted-foreground/60 select-none">
												{ln}
											</span>
											<span className="whitespace-pre pr-4 text-foreground">
												{line}
											</span>
										</div>
									);
								})}
							</div>
						</div>
					)}

					{/* ── d. L'IMPACT — l'ACTION « et si je modifie ? » ── */}
					<div className="space-y-3 rounded-xl border border-border bg-card p-4">
						<div className="flex flex-wrap items-center gap-3">
							<button
								type="button"
								data-testid="v2-code-impact-btn"
								disabled={selected === null}
								onClick={() => {
									if (selectedId !== null)
										setImpact(impactOf(nodes, edges, selectedId));
								}}
								className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{t.impactBtn}
							</button>
							{impact !== null && (
								<button
									type="button"
									data-testid="v2-code-impact-reset"
									onClick={() => setImpact(null)}
									className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
								>
									{t.resetBtn}
								</button>
							)}
							<span className="text-xs text-muted-foreground">
								{t.impactHint}
							</span>
						</div>
						{impact !== null &&
							(impact.length === 0 ? (
								<p
									data-testid="v2-code-impact"
									className="text-sm text-muted-foreground"
								>
									{t.impactEmpty}
								</p>
							) : (
								<div data-testid="v2-code-impact" className="space-y-3">
									<h3 className="text-sm font-semibold text-destructive">
										{t.impactHeading} — {impact.length}
									</h3>
									{wavesByDepth.map(([depth, items]) => (
										<div key={depth} className="space-y-1">
											<h4 className="text-xs font-medium text-muted-foreground">
												{t.depthLabel} {depth} (
												{depth === 1 ? t.depthDirect : t.depthTransitive})
											</h4>
											<ul className="space-y-1">
												{items.map((it) => {
													const n = byId.get(it.id);
													if (n === undefined) return null;
													return (
														<li
															key={it.id}
															data-testid="v2-code-impact-item"
															data-symbol={symbolOf(n)}
														>
															<button
																type="button"
																onClick={() => setSelectedId(n.id)}
																className="flex w-full flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-left font-mono text-[11px] text-foreground transition-colors hover:bg-destructive/10"
															>
																<span className="font-medium text-destructive">
																	{n.kind === "file"
																		? n.name.replace(/^lib\/v2\//, "")
																		: n.name}
																</span>
																<span className="text-muted-foreground">
																	{n.file}
																</span>
																<span className="ml-auto rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
																	{kindLabel[n.kind]}
																</span>
															</button>
														</li>
													);
												})}
											</ul>
										</div>
									))}
								</div>
							))}
					</div>
				</section>
			</div>

			{/* ── f. LES GOD NODES (graphify) : les points de couplage ── */}
			<section className="space-y-2 rounded-xl border border-border bg-card p-4">
				<h2 className="text-sm font-semibold text-foreground">
					{t.godHeading}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t.godHint}
				</p>
				<div className="flex flex-wrap gap-2">
					{gods.map((g) => {
						const n = byId.get(g.id);
						if (n === undefined) return null;
						return (
							<button
								key={g.id}
								type="button"
								data-testid="v2-code-god"
								data-symbol={symbolOf(n)}
								onClick={() => select(g.id)}
								className={[
									"flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs transition-colors",
									g.id === selectedId
										? "border-primary/40 bg-primary/10 text-primary"
										: "border-border bg-muted/40 text-foreground hover:bg-muted",
								].join(" ")}
							>
								<span>
									{n.kind === "file"
										? n.name.replace(/^lib\/v2\//, "")
										: n.name}
								</span>
								<span
									title={t.inDegreeLabel}
									className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
								>
									{g.inDegree}
								</span>
							</button>
						);
					})}
				</div>
			</section>

			{/* ── e. LE GRAPHE 3D (graphify) : monté paresseusement, pleine largeur ── */}
			<section className="space-y-2">
				<h2 className="text-sm font-semibold text-foreground">
					{t.graphHeading}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t.graphHint}
				</p>
				<div
					ref={graphRef}
					data-testid="v2-code-graph-3d"
					className="relative overflow-hidden rounded-xl border border-border bg-background"
					style={{ height: 480 }}
				>
					{graphMounted && (
						<ForceGraph3D
							graphData={graphData}
							width={graphWidth}
							height={480}
							backgroundColor="rgba(0,0,0,0)"
							nodeLabel={nodeLabel3D}
							nodeColor={nodeColor3D}
							nodeOpacity={0.95}
							nodeRelSize={4}
							linkColor={linkColor3D}
							linkWidth={linkWidth3D}
							linkOpacity={0.5}
							linkDirectionalArrowLength={3}
							linkDirectionalArrowRelPos={1}
							onNodeClick={onNodeClick3D}
						/>
					)}
					{/* la légende : genres + états + confiance des arêtes */}
					<div className="pointer-events-none absolute bottom-2 left-2 space-y-0.5 rounded-md bg-card/80 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
						<div>
							{(["file", "class", "function", "method"] as const).map((k) => (
								<span key={k} className="mr-2 inline-flex items-center gap-1">
									<span
										className="inline-block h-2 w-2 rounded-full"
										style={{ backgroundColor: KIND_COLORS[k] }}
									/>
									{kindLabel[k]}
								</span>
							))}
						</div>
						<div>
							<span className="mr-2 inline-flex items-center gap-1">
								<span
									className="inline-block h-2 w-2 rounded-full"
									style={{ backgroundColor: IMPACTED_COLOR }}
								/>
								{t.legendImpacted}
							</span>
							<span className="mr-2 inline-flex items-center gap-1">
								<span
									className="inline-block h-2 w-2 rounded-full"
									style={{ backgroundColor: SELECTED_COLOR }}
								/>
								{t.legendSelected}
							</span>
							<span className="mr-2">— {t.legendExtracted}</span>
							<span>·· {t.legendInferred}</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

/** Une ligne de l'arbre : caret + badge de genre + nom + L<début>-<fin> ; rouge si impactée. */
function CodeRow({
	node,
	style,
	dragHandle,
	selectedId,
	impacted,
	kindLabel,
	onSelect,
}: {
	node: NodeApi<ArbNode>;
	style: React.CSSProperties;
	dragHandle?: (el: HTMLDivElement | null) => void;
	selectedId: string | null;
	impacted: boolean;
	kindLabel: Record<CodeNode["kind"], string>;
	onSelect: () => void;
}) {
	const caret = node.isLeaf ? "•" : node.isOpen ? "▾" : "▸";
	const isSelected = node.data.id === selectedId;
	const display =
		node.data.kind === "file"
			? node.data.name.replace(/^lib\/v2\//, "")
			: node.data.name;
	return (
		<div
			style={style}
			ref={dragHandle}
			data-testid="v2-code-node"
			data-symbol={symbolOf(node.data)}
			data-impacted={impacted || undefined}
			className={[
				"flex items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
				isSelected
					? "bg-primary/10 text-primary"
					: impacted
						? "bg-destructive/10 text-destructive"
						: "text-foreground hover:bg-muted",
			].join(" ")}
		>
			<button
				type="button"
				aria-label={node.isOpen ? "replier" : "déplier"}
				onClick={(e) => {
					e.stopPropagation();
					node.toggle();
				}}
				className="w-4 shrink-0 text-muted-foreground"
			>
				{caret}
			</button>
			<button
				type="button"
				onClick={onSelect}
				className="flex flex-1 items-center gap-1.5 truncate text-left"
			>
				<span className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
					{kindLabel[node.data.kind]}
				</span>
				<span className="truncate font-mono text-xs">{display}</span>
				<span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
					L{node.data.start}-{node.data.end}
				</span>
			</button>
		</div>
	);
}
