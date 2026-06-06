"use client";

import { useMemo, useState } from "react";
import {
	anchorsAbove,
	type CascadeNode,
	type CascadeShrink,
	type DescendResult,
	descend,
	type ReopenResult,
	reopenAnchor,
	shrinkOptionSpaceCascade,
} from "@/lib/besoin-cascade";

/**
 * BesoinCascadePanel — the action-capable /compound-besoin-cascade panel (EL08). The human EXECUTES
 * the cascade FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless capability):
 *  - "Lister les ancres" runs anchorsAbove → the frozen grounding strictly above the level;
 *  - "Descendre" runs descend → opens the next rung when right-sized, REFUSED (CANNOT_DESCEND) when
 *    not (the done-criterion: premature descent refused);
 *  - "Mesurer le rétrécissement" runs shrinkOptionSpaceCascade → Before vs After (the compound
 *    measured: strictly smaller under a frozen anchor);
 *  - "Rouvrir l'ancre" runs reopenAnchor → refused without a ChangeSet (BESOIN_ANCHOR_OVERWRITE),
 *    allowed with one (anti-overwrite §9).
 *
 * Every verdict is COMPUTED by the deterministic twin (lib/besoin-cascade.ts), never an LLM, never
 * re-implemented here. ABOVE the wall: reads only the node set, writes no truth. Themed (ADR 0010),
 * bilingual (ADR 0011).
 */

interface Labels {
	anchorsCta: string;
	descendCta: string;
	shrinkCta: string;
	reopenCta: string;
	resetCta: string;
	caseLabel: string;
	caseFrozenNarrowing: string;
	caseFrozenVacant: string;
	caseDraftingProduct: string;
	caseOperationLeaf: string;
	anchorsHeading: string;
	descendHeading: string;
	descendOk: string;
	descendRefused: string;
	openedLabel: string;
	shrinkHeading: string;
	beforeLabel: string;
	afterLabel: string;
	shrinkLabel: string;
	shrinkStrict: string;
	shrinkNone: string;
	shrinkSentinel: string;
	reopenHeading: string;
	changeSetLabel: string;
	reopenOk: string;
	reopenRefused: string;
	none: string;
	pending: string;
}

type CaseId =
	| "frozenNarrowing"
	| "frozenVacant"
	| "draftingProduct"
	| "operationLeaf";

interface Fixture {
	id: CaseId;
	level: "product" | "operation";
	nodes: CascadeNode[];
}

// FIXTURES are the declared node sets the screen exercises — closed, deterministic inputs to the twin
// (no rng/clock). They mirror the Go fixture-table cases (cascade_fixture_test.go).
const FIXTURES: Record<CaseId, Fixture> = {
	frozenNarrowing: {
		id: "frozenNarrowing",
		level: "product",
		nodes: [
			{
				level: "product",
				body: {
					intent: "suivi de tâches",
					scenarios: ["créer", "cocher"],
					selects: ["onboarding", "core-task"],
				},
				status: "resolved",
				refsTo: ["journey"],
			},
		],
	},
	frozenVacant: {
		id: "frozenVacant",
		level: "product",
		nodes: [
			{
				level: "product",
				body: {
					intent: "suivi de tâches",
					scenarios: ["créer"],
					selects: [],
				},
				status: "resolved",
				refsTo: ["journey"],
			},
		],
	},
	draftingProduct: {
		id: "draftingProduct",
		level: "product",
		nodes: [
			{
				level: "product",
				body: {
					intent: "x",
					scenarios: ["a"],
					selects: ["onboarding"],
				},
				status: "drafting",
				refsTo: ["journey"],
			},
		],
	},
	operationLeaf: {
		id: "operationLeaf",
		level: "operation",
		nodes: [
			{
				level: "operation",
				body: { steps: ["valider"], fixture: "f", selects: ["create"] },
				status: "resolved",
				refsTo: [],
			},
		],
	},
};

export function BesoinCascadePanel({ labels }: { labels: Labels }) {
	const caseLabels = useMemo<Record<CaseId, string>>(
		() => ({
			frozenNarrowing: labels.caseFrozenNarrowing,
			frozenVacant: labels.caseFrozenVacant,
			draftingProduct: labels.caseDraftingProduct,
			operationLeaf: labels.caseOperationLeaf,
		}),
		[labels],
	);

	const [choice, setChoice] = useState<CaseId>("frozenNarrowing");
	const [changeSet, setChangeSet] = useState("");
	const [anchors, setAnchors] = useState<string[] | null>(null);
	const [descendRes, setDescendRes] = useState<DescendResult | null>(null);
	const [shrink, setShrink] = useState<CascadeShrink | null>(null);
	const [reopen, setReopen] = useState<ReopenResult | null>(null);

	function runAnchors() {
		const f = FIXTURES[choice];
		setAnchors(anchorsAbove(f.nodes, f.level).map((a) => a.level));
	}
	function runDescend() {
		const f = FIXTURES[choice];
		setDescendRes(descend(f.nodes, f.level, true));
	}
	function runShrink() {
		const f = FIXTURES[choice];
		setShrink(shrinkOptionSpaceCascade(f.nodes, f.level));
	}
	function runReopen() {
		const f = FIXTURES[choice];
		const node = f.nodes.find((n) => n.level === f.level);
		setReopen(reopenAnchor(node, changeSet));
	}
	function reset() {
		setAnchors(null);
		setDescendRes(null);
		setShrink(null);
		setReopen(null);
		setChangeSet("");
		setChoice("frozenNarrowing");
	}

	return (
		<div className="space-y-8">
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-end gap-4">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.caseLabel}
						</span>
						<select
							data-testid="case-select"
							value={choice}
							onChange={(e) => setChoice(e.target.value as CaseId)}
							className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
						>
							{(Object.keys(FIXTURES) as CaseId[]).map((id) => (
								<option key={id} value={id}>
									{caseLabels[id]}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						data-testid="anchors-cta"
						onClick={runAnchors}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.anchorsCta}
					</button>
					<button
						type="button"
						data-testid="descend-cta"
						onClick={runDescend}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.descendCta}
					</button>
					<button
						type="button"
						data-testid="shrink-cta"
						onClick={runShrink}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.shrinkCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={reset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
			</section>

			{/* AnchorsAbove */}
			<section
				aria-label={labels.anchorsHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.anchorsHeading}
				</h2>
				{anchors === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="anchors-pending"
					>
						{labels.pending}
					</p>
				) : (
					<p className="text-sm text-foreground" data-testid="anchors-value">
						{anchors.length === 0 ? labels.none : anchors.join(" → ")}
					</p>
				)}
			</section>

			{/* Descend */}
			<section
				aria-label={labels.descendHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.descendHeading}
				</h2>
				{descendRes === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="descend-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-2" data-testid="descend-verdict">
						<p
							data-testid="descend-ok"
							data-ok={descendRes.ok ? "true" : "false"}
							className={
								descendRes.ok
									? "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
									: "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
							}
						>
							{descendRes.ok ? labels.descendOk : labels.descendRefused}
						</p>
						{descendRes.ok && descendRes.opened && (
							<p
								className="text-sm text-foreground"
								data-testid="descend-opened"
							>
								{labels.openedLabel}: {descendRes.opened}
							</p>
						)}
						{!descendRes.ok && descendRes.refusal && (
							<ul data-testid="descend-blockreasons" className="space-y-2">
								{descendRes.refusal.blockReasons.map((br) => (
									<li
										key={br.code}
										data-testid={`block-${br.code}`}
										className="rounded-md border border-border bg-muted/40 p-3"
									>
										<p className="font-mono text-xs text-foreground">
											{br.code}
										</p>
										<p className="mt-1 text-sm text-muted-foreground">
											{br.explanation}
										</p>
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</section>

			{/* ShrinkOptionSpaceCascade */}
			<section
				aria-label={labels.shrinkHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.shrinkHeading}
				</h2>
				{shrink === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="shrink-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-1" data-testid="shrink-verdict">
						<p
							className="font-mono text-sm text-foreground"
							data-testid="shrink-before"
						>
							{labels.beforeLabel} = {shrink.before}
						</p>
						<p
							className="font-mono text-sm text-foreground"
							data-testid="shrink-after"
						>
							{labels.afterLabel} = {shrink.after}
						</p>
						<p
							className="font-mono text-sm text-foreground"
							data-testid="shrink-value"
						>
							{labels.shrinkLabel} = {shrink.shrink}
						</p>
						<p
							className="text-sm text-muted-foreground"
							data-testid="shrink-meaning"
						>
							{!shrink.enumerable
								? labels.shrinkSentinel
								: shrink.shrink > 0
									? labels.shrinkStrict
									: labels.shrinkNone}
						</p>
					</div>
				)}
			</section>

			{/* ReopenAnchor */}
			<section
				aria-label={labels.reopenHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.reopenHeading}
				</h2>
				<div className="mb-3 flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.changeSetLabel}
						</span>
						<input
							data-testid="changeset-input"
							value={changeSet}
							onChange={(e) => setChangeSet(e.target.value)}
							placeholder="cs-…"
							className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
						/>
					</label>
					<button
						type="button"
						data-testid="reopen-cta"
						onClick={runReopen}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.reopenCta}
					</button>
				</div>
				{reopen === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="reopen-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-2" data-testid="reopen-verdict">
						<p
							data-testid="reopen-ok"
							data-ok={reopen.ok ? "true" : "false"}
							className={
								reopen.ok
									? "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
									: "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
							}
						>
							{reopen.ok ? labels.reopenOk : labels.reopenRefused}
						</p>
						{!reopen.ok && reopen.code && (
							<div
								data-testid={`block-${reopen.code}`}
								className="rounded-md border border-border bg-muted/40 p-3"
							>
								<p className="font-mono text-xs text-foreground">
									{reopen.code}
								</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{reopen.explanation}
								</p>
							</div>
						)}
					</div>
				)}
			</section>
		</div>
	);
}
