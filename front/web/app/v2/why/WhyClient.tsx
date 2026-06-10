"use client";

import { useMemo, useState } from "react";
import { type NodeApi, Tree } from "react-arborist";
import {
	type ArboristWhyNode,
	arboristWhyTree,
	caseWhyTree,
	ERR_CYCLE,
	verdictLabel,
	WHYTREE_NO_MIRROR,
	type WhyCase,
	whyTally,
} from "@/lib/v2/why";

/**
 * WB2-19 — l'AFFICHAGE + la CONSTRUCTION d'un WhyTree (l'arbre caused_by), client-only (React Arborist
 * + le twin pur). D'un SYMPTÔME, la remontée caused_by MONTE en arbre fishbone jusqu'à la cause RACINE.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on CHOISIT un symptôme (un bouton par cas) puis on CONSTRUIT le WhyTree (v2-why-build) ;
 *   - on DÉPLIE / REPLIE chaque cause de l'arbre (le drill-down du pourquoi) ;
 *   - un cas CYCLIQUE → refus CAUSED_BY_CYCLE ; un cas SANS miroir terminal → refus WHYTREE_NO_MIRROR ;
 *   - on RÉINITIALISE (v2-why-reset).
 * Tout délégué au twin pur lib/v2/why.ts (caseWhyTree / arboristWhyTree / whyTally).
 *
 * LE MUR (§2) : le WhyTree LIT le graphe caused_by ; il n'écrit AUCUNE vérité. La terminaison en miroir
 * est une exigence de forme — promouvoir le miroir d'anti-récurrence passe par /learn → idée → /goal.
 */

type Strings = Record<string, string>;

export function WhyClient({
	cases,
	t,
}: {
	cases: readonly WhyCase[];
	t: Strings;
}) {
	// le cas SÉLECTIONNÉ (le symptôme choisi) ; null = rien construit encore.
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = useMemo(
		() => cases.find((c) => c.id === selectedId) ?? null,
		[cases, selectedId],
	);

	// le résultat du twin pur (arbre | refus cycle | refus pas-de-miroir).
	const result = useMemo(
		() => (selected ? caseWhyTree(selected) : null),
		[selected],
	);

	const forest: ArboristWhyNode[] = useMemo(
		() => (result?.ok ? arboristWhyTree(result.root) : []),
		[result],
	);
	const tally = useMemo(
		() => (result?.ok ? whyTally(result.root) : null),
		[result],
	);

	const refusalText =
		result && !result.ok
			? result.error === ERR_CYCLE
				? t.refusedCycle
				: t.refusedNoMirror
			: null;
	const refusalCode =
		result && !result.ok
			? result.error === ERR_CYCLE
				? ERR_CYCLE
				: WHYTREE_NO_MIRROR
			: "";

	return (
		<div data-testid="v2-why-view" className="space-y-6">
			{/* CHOISIR un symptôme + CONSTRUIRE (l'action de l'écran) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.samplesHeading}
				</h3>
				<p className="text-xs text-muted-foreground">{t.samplesHint}</p>
				<div data-testid="v2-why-samples" className="flex flex-col gap-2">
					{cases.map((c) => (
						<button
							key={c.id}
							type="button"
							data-testid={`v2-why-sample-${c.id}`}
							onClick={() => setSelectedId(c.id)}
							className={[
								"rounded-lg border px-4 py-2 text-left text-sm transition-colors",
								selectedId === c.id
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-card text-foreground hover:bg-muted",
							].join(" ")}
						>
							<span className="font-mono text-xs font-semibold">
								{c.symptom}
							</span>
						</button>
					))}
				</div>
				<div className="flex flex-wrap gap-2 pt-1">
					<span
						data-testid="v2-why-build"
						aria-disabled={selected === null}
						className={[
							"inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium",
							selected === null
								? "bg-muted text-muted-foreground"
								: "bg-primary text-primary-foreground",
						].join(" ")}
					>
						{t.buildBtn}
					</span>
					<button
						type="button"
						data-testid="v2-why-reset"
						onClick={() => setSelectedId(null)}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
					>
						{t.resetBtn}
					</button>
				</div>
			</div>

			{/* le REFUS (cycle | pas de miroir terminal) — jamais un arbre partiel */}
			{refusalText !== null && (
				<div
					data-testid="v2-why-refused"
					data-refusal={refusalCode}
					className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
				>
					{refusalText}
				</div>
			)}

			{/* le RÉSUMÉ (tally) */}
			{tally !== null && (
				<div
					data-testid="v2-why-tally"
					data-nodes={tally.nodes}
					data-leaves={tally.leaves}
					data-offgraph={tally.offGraph}
					data-depth={tally.maxDepth}
					className="flex flex-wrap gap-4 rounded-xl border border-border bg-card px-6 py-3 text-sm"
				>
					<Stat value={tally.nodes} label={t.tallyNodes} />
					<Stat value={tally.leaves} label={t.tallyLeaves} />
					<Stat value={tally.offGraph} label={t.tallyOffGraph} />
					<Stat value={tally.maxDepth} label={t.tallyDepth} />
				</div>
			)}

			{/* l'ARBRE fishbone (React Arborist) — déplier/replier, du symptôme à la racine */}
			<div className="rounded-xl border border-border bg-card p-2">
				{result?.ok ? (
					<div data-testid="v2-why-tree">
						<p className="px-2 py-1 text-[11px] text-muted-foreground">
							{t.treeHint}
						</p>
						<Tree<ArboristWhyNode>
							data={forest}
							idAccessor="id"
							childrenAccessor="children"
							openByDefault={true}
							width="100%"
							height={360}
							indent={20}
							rowHeight={34}
							overscanCount={8}
						>
							{({ node, style, dragHandle }) => (
								<WhyRow node={node} style={style} dragHandle={dragHandle} />
							)}
						</Tree>
					</div>
				) : (
					<p
						data-testid="v2-why-empty"
						className="px-4 py-8 text-center text-sm text-muted-foreground"
					>
						{t.treeEmpty}
					</p>
				)}
			</div>

			{/* le MIROIR TERMINAL (la terminaison obligatoire) */}
			{result?.ok && (
				<div
					data-testid="v2-why-terminal"
					data-mirror={result.terminal.mirrorId}
					className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-3 space-y-1"
				>
					<h3 className="text-sm font-semibold text-primary">
						{t.terminalHeading}
					</h3>
					<p className="font-mono text-xs text-foreground">
						{result.terminal.mirrorId}
					</p>
					<p className="text-xs text-muted-foreground">
						{t.terminalCovers} :{" "}
						<span className="font-mono text-foreground">
							{result.terminal.covers}
						</span>
					</p>
				</div>
			)}

			{/* les causes hors-graphe ÉLAGUÉES (non reproduites) — transparence anti-confabulation */}
			{result?.ok && result.pruned.length > 0 && (
				<div
					data-testid="v2-why-pruned"
					data-pruned-count={result.pruned.length}
					className="rounded-xl border border-border bg-muted/40 px-6 py-3 space-y-1"
				>
					<h3 className="text-sm font-semibold text-foreground">
						{t.prunedHeading}
					</h3>
					<ul className="flex flex-wrap gap-2">
						{result.pruned.map((p) => (
							<li
								key={p}
								className="rounded border border-destructive/30 bg-destructive/5 px-2 py-0.5 font-mono text-xs text-destructive line-through"
							>
								{p}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* la LÉGENDE des statuts */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-2">
				<h3 className="text-sm font-semibold text-foreground">
					{t.legendHeading}
				</h3>
				<ul className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground sm:grid-cols-3">
					<li className="text-foreground">● {t.legendInGraph}</li>
					<li className="text-primary">◆ {t.legendReproduced}</li>
					<li>• {t.legendLeaf}</li>
				</ul>
			</div>
		</div>
	);
}

function Stat({ value, label }: { value: number; label: string }) {
	return (
		<div className="flex items-baseline gap-1.5">
			<span className="font-mono font-semibold text-foreground">{value}</span>
			<span className="text-xs text-muted-foreground">{label}</span>
		</div>
	);
}

function WhyRow({
	node,
	style,
	dragHandle,
}: {
	node: NodeApi<ArboristWhyNode>;
	style: React.CSSProperties;
	dragHandle?: (el: HTMLDivElement | null) => void;
}) {
	const caret = node.isLeaf ? "•" : node.isOpen ? "▾" : "▸";
	const v = node.data.verdict;
	// la couleur porte le statut : dans le graphe (neutre) / hors-graphe reproduite (primary).
	const verdictClass =
		v === "reproduced"
			? "border-primary/40 bg-primary/5 text-primary"
			: "border-border bg-card text-foreground";
	return (
		<div
			style={style}
			ref={dragHandle}
			data-testid={`v2-why-node-${node.data.id}`}
			data-open={node.isOpen}
			data-verdict={v}
			data-depth={node.data.depth}
			className="flex items-center gap-2 px-1"
		>
			<button
				type="button"
				aria-label={node.isOpen ? "replier" : "déplier"}
				data-testid={`v2-why-toggle-${node.data.id}`}
				onClick={(e) => {
					e.stopPropagation();
					node.toggle();
				}}
				className="w-4 shrink-0 text-muted-foreground"
			>
				{caret}
			</button>
			<span
				className={[
					"flex flex-1 items-center gap-2 truncate rounded-md border px-2 py-1 text-sm transition-colors",
					verdictClass,
				].join(" ")}
			>
				<span className="truncate font-mono text-xs">{node.data.cause}</span>
				<span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
					{verdictLabel(v)}
				</span>
			</span>
		</div>
	);
}
