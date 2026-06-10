"use client";

import { useMemo, useState } from "react";
import { type NodeApi, Tree } from "react-arborist";
import {
	type ArboristNode,
	arboristTree,
	type CtxData,
	type Decision,
	evaluate,
	nodeCounts,
	type Policy,
	type PolicySample,
} from "@/lib/v2/policy";

/**
 * WB2-14 — l'AFFICHAGE + l'ÉVALUATION d'une POLICY (l'arbre récursif ALLOW/DENY), client-only
 * (React Arborist + le twin pur). Là où WB2-13 montre un FLUX, WB2-14 montre une RÈGLE d'autorisation :
 * un arbre `all/any/not` qu'on DÉPLIE et qu'on ÉVALUE.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on DÉPLIE / REPLIE chaque nœud de l'arbre (le drill-down de la règle) ;
 *   - on CHOISIT un contexte d'exemple (un bouton par échantillon) → l'arbre est ÉVALUÉ : chaque nœud
 *     coloré HOLD (tient) / FAIL (échoue), et la DÉCISION §93 (ALLOW/DENY) calculée et affichée.
 * Tout délégué au twin pur lib/v2/policy.ts (evalTree / arboristTree / evaluate).
 *
 * LE MUR (§2) : afficher et ÉVALUER une policy contre un contexte n'écrit AUCUNE vérité — la policy
 * (l'AST) n'est écrite que par le CLI `aidos` via un ChangeSet approuvé. L'écran lit et évalue.
 */

type Strings = Record<string, string>;

export function PolicyClient({
	policy,
	samples,
	t,
}: {
	policy: Policy;
	samples: readonly PolicySample[];
	t: Strings;
}) {
	// le contexte d'exemple sélectionné (null = aucune évaluation, l'arbre structurel seul).
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = useMemo(
		() => samples.find((s) => s.id === selectedId) ?? null,
		[samples, selectedId],
	);

	// l'arbre React Arborist : SANS contexte (structure seule) ou AVEC (chaque nœud tracé HOLD/FAIL).
	const ctx: CtxData | undefined = selected?.ctx;
	const forest = useMemo(
		() => arboristTree(policy.rule, ctx),
		[policy.rule, ctx],
	);
	const counts = useMemo(() => nodeCounts(policy.rule), [policy.rule]);

	// la DÉCISION §93 — calculée par le twin pur (jamais une sémantique parallèle).
	const decision: Decision | null = selected
		? evaluate(policy, selected.ctx)
		: null;

	return (
		<div data-testid="v2-policy-view" className="space-y-6">
			{/* l'EN-TÊTE de la policy : scope, target, effet, composition */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<dl className="flex flex-wrap gap-4 text-sm">
					<div className="flex items-baseline gap-1.5">
						<dt className="text-xs text-muted-foreground">{t.scopeLabel}</dt>
						<dd
							data-testid="v2-policy-scope"
							className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground"
						>
							{policy.scope}
						</dd>
					</div>
					<div className="flex items-baseline gap-1.5">
						<dt className="text-xs text-muted-foreground">{t.targetLabel}</dt>
						<dd
							data-testid="v2-policy-target"
							className="font-mono text-xs font-semibold text-foreground"
						>
							{policy.target}
						</dd>
					</div>
					<div className="flex items-baseline gap-1.5">
						<dt className="text-xs text-muted-foreground">{t.effectLabel}</dt>
						<dd
							data-testid="v2-policy-effect"
							className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
								policy.effect === "ALLOW"
									? "bg-primary/10 text-primary"
									: "bg-destructive/10 text-destructive"
							}`}
						>
							{policy.effect}
						</dd>
					</div>
					<div className="flex items-baseline gap-1.5">
						<dd
							data-testid="v2-policy-count-combinators"
							className="font-mono font-semibold text-primary"
						>
							{counts.combinators}
						</dd>
						<dt className="text-xs text-muted-foreground">
							{t.combinatorsLabel}
						</dt>
					</div>
					<div className="flex items-baseline gap-1.5">
						<dd
							data-testid="v2-policy-count-leaves"
							className="font-mono font-semibold text-foreground"
						>
							{counts.leaves}
						</dd>
						<dt className="text-xs text-muted-foreground">{t.leavesLabel}</dt>
					</div>
				</dl>
			</div>

			{/* l'ÉVALUATION — choisir un contexte d'exemple (l'action de l'écran) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.evalHeading}
				</h3>
				<p className="text-xs text-muted-foreground">{t.evalHint}</p>
				<div data-testid="v2-policy-samples" className="flex flex-col gap-2">
					{samples.map((s) => (
						<button
							key={s.id}
							type="button"
							data-testid={`v2-policy-sample-${s.id}`}
							onClick={() => setSelectedId(s.id)}
							className={[
								"rounded-lg border px-4 py-2 text-left text-sm transition-colors",
								selectedId === s.id
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-card text-foreground hover:bg-muted",
							].join(" ")}
						>
							{s.role}
						</button>
					))}
				</div>
				{decision !== null && (
					<div
						data-testid="v2-policy-decision"
						data-decision={decision}
						className={`mt-2 rounded-lg border px-4 py-2 font-mono text-sm font-semibold ${
							decision === "ALLOW"
								? "border-primary/30 bg-primary/5 text-primary"
								: "border-destructive/30 bg-destructive/5 text-destructive"
						}`}
					>
						{t.decisionLabel} : {decision}
					</div>
				)}
			</div>

			{/* l'ARBRE RÉCURSIF (React Arborist) — déplier/replier, coloré HOLD/FAIL si évalué */}
			<div className="rounded-xl border border-border bg-card p-2">
				<div data-testid="v2-policy-tree">
					<Tree<ArboristNode>
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
							<PolicyRow
								node={node}
								style={style}
								dragHandle={dragHandle}
								evaluated={selected !== null}
								holdLabel={t.holdLabel}
								failLabel={t.failLabel}
							/>
						)}
					</Tree>
				</div>
			</div>

			{/* la LÉGENDE + la note du mur */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-2">
				<h3 className="text-sm font-semibold text-foreground">
					{t.legendHeading}
				</h3>
				<ul className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
					<li className="text-primary">∧ {t.legendAll}</li>
					<li className="text-primary">∨ {t.legendAny}</li>
					<li className="text-primary">¬ {t.legendNot}</li>
					<li>• {t.legendLeaf}</li>
				</ul>
			</div>
		</div>
	);
}

function PolicyRow({
	node,
	style,
	dragHandle,
	evaluated,
	holdLabel,
	failLabel,
}: {
	node: NodeApi<ArboristNode>;
	style: React.CSSProperties;
	dragHandle?: (el: HTMLDivElement | null) => void;
	evaluated: boolean;
	holdLabel: string;
	failLabel: string;
}) {
	const caret = node.isLeaf ? "•" : node.isOpen ? "▾" : "▸";
	const isCombinator =
		node.data.kind === "all" ||
		node.data.kind === "any" ||
		node.data.kind === "not";
	const held = node.data.held;
	// la couleur HOLD/FAIL n'apparaît QUE quand on a évalué (sinon la structure seule, neutre).
	const verdictClass = !evaluated
		? "border-border bg-card text-foreground"
		: held
			? "border-primary/40 bg-primary/5 text-primary"
			: "border-destructive/40 bg-destructive/5 text-destructive";
	return (
		<div
			style={style}
			ref={dragHandle}
			data-testid={`v2-policy-node-${node.data.id}`}
			data-open={node.isOpen}
			data-held={held === undefined ? "" : held ? "true" : "false"}
			className="flex items-center gap-2 px-1"
		>
			<button
				type="button"
				aria-label={node.isOpen ? "replier" : "déplier"}
				data-testid={`v2-policy-toggle-${node.data.id}`}
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
				<span
					className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] ${
						isCombinator
							? "bg-primary/10 text-primary"
							: "bg-muted text-muted-foreground"
					}`}
				>
					{node.data.kind}
				</span>
				<span className="truncate font-mono text-xs">{node.data.name}</span>
				{evaluated && (
					<span
						data-testid={`v2-policy-verdict-${node.data.id}`}
						className="ml-auto shrink-0 font-mono text-[10px] font-semibold"
					>
						{held ? holdLabel : failLabel}
					</span>
				)}
			</span>
		</div>
	);
}
