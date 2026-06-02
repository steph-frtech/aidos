"use client";

import { useMemo, useState } from "react";
import {
	type Artifact,
	type Entity,
	emit,
	entityId,
	isBlocked,
	TARGETS,
	type Target,
} from "@/lib/entity-source";

/**
 * EntityMapPanel — the action-capable /entity-map panel (S35). The human RUNS the
 * entity emitters FROM THE SCREEN: read the Order SOURCE (its ordered attributes with
 * type / required / identifier badges) on the left, read its THREE derived projections
 * (Go struct · TS type · DDL) on the right, click RE-EMIT (the byte-identical check —
 * same output_hash, the done criterion visible), and MOVE THE HEAD (remove discount)
 * so the prior Order artifacts flip to STALE while the head's new projections re-emit
 * (the staleness inequality, S22's red-wave feed). The projections are COMPUTED by the
 * deterministic twin lib/entity-source.ts (byte-identical to back/kernel/entities) —
 * this panel never re-implements EmitGo/EmitTS/EmitDDL and never calls an LLM.
 * READ-ONLY against truth (the wall): the entity AST is a SOURCE above the line; gen/
 * is never hand-edited; truth-writes go via propose → ChangeSet → approval, never a
 * screen. Themed (ADR 0010), bilingual (ADR 0011).
 */

const TARGET_LABEL_KEY: Record<Target, "targetGo" | "targetTs" | "targetDdl"> =
	{
		"go-sqlc": "targetGo",
		"ts-types": "targetTs",
		"pg-ddl": "targetDdl",
	};

interface Labels {
	sourceTitle: string;
	projectionsTitle: string;
	derivedBadge: string;
	requiredBadge: string;
	optionalBadge: string;
	identifierBadge: string;
	reemitCta: string;
	moveHeadCta: string;
	resetCta: string;
	headHashLabel: string;
	sourceHashLabel: string;
	outputHashLabel: string;
	deterministicBadge: string;
	staleBadge: string;
	byteIdenticalOk: string;
	attributesLabel: string;
	pathLabel: string;
	targetGo: string;
	targetTs: string;
	targetDdl: string;
}

interface Props {
	order: Entity;
	orderChanged: Entity;
	labels: Labels;
}

function short(h: string): string {
	return h.slice(0, 16);
}

export function EntityMapPanel({ order, orderChanged, labels }: Props) {
	// The head can MOVE (the discount-less variant) — an append-only head move, not an
	// edit. The originally-emitted artifacts keep their source_hash; the panel computes
	// stale = (artifact.source_hash !== current head id).
	const [headMoved, setHeadMoved] = useState(false);
	// RE-EMIT records the last byte-identical check result per target.
	const [reemitOk, setReemitOk] = useState<Record<string, boolean>>({});

	const head = headMoved ? orderChanged : order;
	const headId = useMemo(() => entityId(head), [head]);

	// The currently-displayed entity SOURCE (attributes) is the head.
	const sourceEntity = head;

	// The displayed projections are emitted from the ORIGINAL order (the artifacts on
	// disk). When the head moves, those artifacts become stale (their source_hash is
	// baseId, the head is now headId).
	const artifacts = useMemo<Artifact[]>(() => {
		const arts = order.attributes.length ? emitAll(order) : [];
		return arts;
	}, [order]);

	function reEmit(target: Target) {
		const original = artifacts.find((a) => a.target === target);
		const fresh = emit(order, target);
		const ok =
			!!original &&
			!isBlocked(fresh) &&
			fresh.output_hash === original.output_hash;
		setReemitOk((prev) => ({ ...prev, [target]: ok }));
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
			{/* ── The SOURCE (left) ──────────────────────────────────────── */}
			<section
				aria-label={labels.sourceTitle}
				className="rounded-lg border border-border bg-card p-5"
			>
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-foreground">
						{labels.sourceTitle}: {sourceEntity.name}
					</h2>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.headHashLabel}:{" "}
					<code className="font-mono text-foreground">{short(headId)}</code>
				</p>
				<p className="mt-3 text-sm font-medium text-foreground">
					{labels.attributesLabel}
				</p>
				<ul className="mt-2 space-y-2">
					{sourceEntity.attributes.map((a) => (
						<li
							key={a.name}
							className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
						>
							<code className="font-mono font-medium text-foreground">
								{a.name}
							</code>
							<span className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
								{a.type}
							</span>
							{a.identifier ? (
								<span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
									{labels.identifierBadge}
								</span>
							) : null}
							<span
								className={`rounded px-1.5 py-0.5 text-xs ${
									a.required
										? "bg-foreground/10 text-foreground"
										: "bg-muted text-muted-foreground"
								}`}
							>
								{a.required ? labels.requiredBadge : labels.optionalBadge}
							</span>
						</li>
					))}
				</ul>
				<div className="mt-5 flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => setHeadMoved(true)}
						disabled={headMoved}
						className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
					>
						{labels.moveHeadCta}
					</button>
					<button
						type="button"
						onClick={() => {
							setHeadMoved(false);
							setReemitOk({});
						}}
						className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
					>
						{labels.resetCta}
					</button>
				</div>
			</section>

			{/* ── The THREE derived projections (right) ──────────────────── */}
			<section aria-label={labels.projectionsTitle} className="space-y-4">
				<h2 className="text-lg font-semibold text-foreground">
					{labels.projectionsTitle}
				</h2>
				{TARGETS.map((target) => {
					const art = artifacts.find((a) => a.target === target);
					if (!art) return null;
					const isStale = art.source_hash !== headId;
					const okFlag = reemitOk[target];
					return (
						<article
							key={target}
							data-target={target}
							className="rounded-lg border border-border bg-card p-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<h3 className="font-medium text-foreground">
										{labels[TARGET_LABEL_KEY[target]]}
									</h3>
									<span className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
										{labels.derivedBadge}
									</span>
									{isStale ? (
										<span
											data-stale="true"
											className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600"
										>
											{labels.staleBadge}
										</span>
									) : (
										<span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
											{labels.deterministicBadge}
										</span>
									)}
								</div>
								<button
									type="button"
									onClick={() => reEmit(target)}
									className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent"
								>
									{labels.reemitCta}
								</button>
							</div>
							<dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
								<div>
									{labels.pathLabel}:{" "}
									<code className="font-mono text-foreground">{art.path}</code>
								</div>
								<div>
									{labels.sourceHashLabel}:{" "}
									<code className="font-mono text-foreground">
										{short(art.source_hash)}
									</code>
								</div>
								<div>
									{labels.outputHashLabel}:{" "}
									<code className="font-mono text-foreground">
										{short(art.output_hash)}
									</code>
								</div>
							</dl>
							{okFlag !== undefined ? (
								<p
									data-reemit-result={target}
									className={`mt-2 text-xs font-medium ${okFlag ? "text-emerald-600" : "text-red-600"}`}
								>
									{okFlag ? labels.byteIdenticalOk : "—"}
								</p>
							) : null}
							<pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 text-xs leading-relaxed text-foreground">
								<code>{art.bytes}</code>
							</pre>
						</article>
					);
				})}
			</section>
		</div>
	);
}

function emitAll(e: Entity): Artifact[] {
	const out: Artifact[] = [];
	for (const t of TARGETS) {
		const a = emit(e, t);
		if (!isBlocked(a)) out.push(a);
	}
	return out;
}
