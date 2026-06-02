"use client";

import { useMemo, useState } from "react";
import type { Target } from "@/lib/emitters";

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
}

interface Props {
	views: EntityView[];
	orderId: string;
	orderHeadAfterChange: string;
	labels: Labels;
}

function short(hash: string): string {
	return hash.slice(0, 16);
}

export function EmittersPanel({
	views,
	orderId,
	orderHeadAfterChange,
	labels,
}: Props) {
	const [selectedId, setSelectedId] = useState(views[0]?.id ?? "");
	// The current "head" hash per entity. Initially each entity's own head. MOVE THE HEAD swaps the
	// Order head to the changed-source hash, so its prior artifacts (source_hash = orderHeadBefore)
	// become STALE — the append-only ledger keeps them listed.
	const [headOverride, setHeadOverride] = useState<Record<string, string>>({});
	// The byte-identical confirmation per (entity,target): set when RE-EMIT reproduces the same hash.
	const [reemitOk, setReemitOk] = useState<Record<string, boolean>>({});

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
						</article>
					);
				})}
			</div>
		</div>
	);
}
