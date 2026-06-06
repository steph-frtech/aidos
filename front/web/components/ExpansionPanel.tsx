"use client";

import { useState } from "react";
import {
	ATTACHMENT,
	type Attachment,
	BEHAVIOR_CATALOGUE,
	type BehaviorKind,
	type Expansion,
	expand,
} from "@/lib/compound";

/**
 * ExpansionPanel — the action-capable behavior-macro EXPANSION control (CE04, §24.6). The human
 * picks a behavior, picks an entity, and RUNS the expansion FROM THE SCREEN, calling the SAME pure
 * twin the Go expander computes (back/kernel/behavior.Expand / lib/compound.expand): click EXPANSER
 * and the dry-run pieces appear — the attributes / relations / operations / policies / fixtures the
 * behavior implies — with a re-run "EXPANSER À NOUVEAU (idempotent)" control proving idempotence
 * (zero new pieces on a re-attach).
 *
 * THE WALL (CLAUDE.md §2/§7): the expansion is a DRY-RUN — it writes NOTHING above the line; the
 * "AUCUNE écriture kernel — figer via /goal" badge is the computed proof (Expansion.wroteKernel is
 * always false). Determinism-first: pieces are computed by lib/compound.ts (no LLM, no clock),
 * never re-implemented here. Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	runCta: string;
	rerunCta: string;
	heading: string;
	behaviorLabel: string;
	entityLabel: string;
	attributes: string;
	relations: string;
	operations: string;
	policies: string;
	fixtures: string;
	pieceCount: string;
	idempotentBadge: string;
	noKernelBadge: string;
	pending: string;
	none: string;
}

const ENTITIES = ["Order", "Document", "Invoice"];

export function ExpansionPanel({ labels }: { labels: Labels }) {
	const [behavior, setBehavior] = useState<BehaviorKind>(ATTACHMENT.behavior);
	const [entity, setEntity] = useState<string>(ATTACHMENT.entity);
	const [expansion, setExpansion] = useState<Expansion | null>(null);
	const [reran, setReran] = useState(false);

	function run() {
		setReran(false);
		setExpansion(expand({ behavior, entity }));
	}

	// Re-attach the same behavior to the entity ALREADY carrying the first expansion's pieces.
	function rerun() {
		if (!expansion) return;
		const merged: Attachment = {
			behavior,
			entity,
			existing: {
				attributes: expansion.attributes.map((x) => x.name),
				relations: expansion.relations.map((x) => x.name),
				operations: expansion.operations.map((x) => x.name),
				policies: expansion.policies.map((x) => x.name),
				fixtures: expansion.fixtures.map((x) => x.name),
			},
		};
		setExpansion(expand(merged));
		setReran(true);
	}

	return (
		<div className="space-y-6" data-testid="expansion-panel">
			<div className="flex flex-wrap items-end gap-4">
				<label className="flex flex-col gap-1 text-xs text-muted-foreground">
					{labels.behaviorLabel}
					<select
						data-testid="behavior-select"
						value={behavior}
						onChange={(ev) => {
							setBehavior(ev.target.value as BehaviorKind);
							setExpansion(null);
						}}
						className="rounded-md border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground"
					>
						{BEHAVIOR_CATALOGUE.map((b) => (
							<option key={b} value={b}>
								{b}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1 text-xs text-muted-foreground">
					{labels.entityLabel}
					<select
						data-testid="entity-select"
						value={entity}
						onChange={(ev) => {
							setEntity(ev.target.value);
							setExpansion(null);
						}}
						className="rounded-md border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground"
					>
						{ENTITIES.map((en) => (
							<option key={en} value={en}>
								{en}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					data-testid="run-expand"
					onClick={run}
					className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
				>
					{labels.runCta}
				</button>
			</div>

			{expansion ? (
				<div className="space-y-4" data-testid="expansion-result">
					<div className="flex flex-wrap items-center gap-3">
						<span
							data-testid="no-kernel-badge"
							data-wrote-kernel={String(expansion.wroteKernel)}
							className="inline-flex items-center rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
						>
							{labels.noKernelBadge}
						</span>
						<span
							data-testid="piece-count"
							data-count={String(expansion.pieceCount)}
							className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
						>
							{labels.pieceCount}: {expansion.pieceCount}
						</span>
						{reran ? (
							<span
								data-testid="idempotent-badge"
								className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300"
							>
								{labels.idempotentBadge}
							</span>
						) : null}
						<button
							type="button"
							data-testid="rerun-expand"
							onClick={rerun}
							className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted"
						>
							{labels.rerunCta}
						</button>
					</div>

					<Section
						title={labels.attributes}
						testid="exp-attributes"
						none={labels.none}
						rows={expansion.attributes.map((x) => ({
							key: x.name,
							main: x.name,
							sub: `${x.type}${x.required ? " · required" : ""}`,
						}))}
					/>
					<Section
						title={labels.relations}
						testid="exp-relations"
						none={labels.none}
						rows={expansion.relations.map((x) => ({
							key: x.name,
							main: x.name,
							sub: `→ ${x.target} (${x.cardinality})`,
						}))}
					/>
					<Section
						title={labels.operations}
						testid="exp-operations"
						none={labels.none}
						rows={expansion.operations.map((x) => ({
							key: x.name,
							main: x.name,
						}))}
					/>
					<Section
						title={labels.policies}
						testid="exp-policies"
						none={labels.none}
						rows={expansion.policies.map((x) => ({
							key: x.name,
							main: x.name,
							sub: `${x.scope}:${x.operation} ${x.effect}`,
						}))}
					/>
					<Section
						title={labels.fixtures}
						testid="exp-fixtures"
						none={labels.none}
						rows={expansion.fixtures.map((x) => ({
							key: x.name,
							main: x.name,
						}))}
					/>
				</div>
			) : (
				<p
					className="text-xs italic text-muted-foreground"
					data-testid="expansion-pending"
				>
					{labels.pending}
				</p>
			)}
		</div>
	);
}

function Section({
	title,
	testid,
	none,
	rows,
}: {
	title: string;
	testid: string;
	none: string;
	rows: { key: string; main: string; sub?: string }[];
}) {
	return (
		<article
			data-testid={testid}
			className="rounded-xl border border-border bg-card p-4 shadow-sm"
		>
			<h3 className="text-xs font-semibold tracking-tight text-foreground uppercase">
				{title} <span className="text-muted-foreground">({rows.length})</span>
			</h3>
			{rows.length > 0 ? (
				<ul className="mt-2 space-y-1">
					{rows.map((r) => (
						<li
							key={r.key}
							className="flex flex-wrap items-baseline gap-2 text-sm"
						>
							<span className="font-mono text-xs text-foreground">
								{r.main}
							</span>
							{r.sub ? (
								<span className="font-mono text-xs text-muted-foreground">
									{r.sub}
								</span>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<p className="mt-2 text-xs italic text-muted-foreground">{none}</p>
			)}
		</article>
	);
}
