"use client";

import { useState } from "react";
import { enqueue, impact, type Layer } from "@/lib/red-wave";
import { BUMP_CASES, type BumpCase } from "@/lib/red-wave-data";

/**
 * RedWavePanel — the action-capable /red-wave panel (S22). It lets the human PICK one of the
 * canonical §42 bumps (Order entity / load-bearing submit-btn / cosmetic label-btn) and RUN the
 * red wave (the "fire the red wave" action, executable from the screen — not a static display):
 * it calls the same pure `impact` the Go redwave.Impact / `aidos impact` compute, then `enqueue`s
 * the wave into RedWorkItems and renders them ORDERED mirror-first (§42/§98), grouped by layer
 * (mirror → api/db/types → operation/action → button), each RED with its reason + status (open).
 *
 * THE DONE CRITERIA, visible & executable: firing the Order bump shows Order.schema.fixture
 * (mirror) FIRST then api/db/types (part 1); firing the submit-btn bump shows checkout-view red
 * (part 2); firing the cosmetic label-btn bump shows NO view item (the negative — an empty wave).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action computes + projects the wave; it
 * NEVER writes truth and the front-end enqueues into a VALUE, not the base (the real INSERT is the
 * harness-invoked PostKernelChange hook, below the waterline). The wave is RENDERED, never
 * re-implemented in the front-end. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011) —
 * strings are passed in as labels.
 */

interface Labels {
	pickLabel: string;
	fireLabel: string;
	waveIdLabel: string;
	emptyWave: string;
	awaiting: string;
	orderLabel: string; // mirror-first ordering note
	statusOpen: string;
	reasonVersionStale: string;
	bumpNames: Record<string, string>;
	layerNames: Record<Layer, string>;
	deps: string;
}

const layerBadge: Record<Layer, string> = {
	mirror: "border-blue-600/40 bg-blue-600/10 text-blue-600 dark:text-blue-400",
	projection:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	operation_action:
		"border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
	button: "border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

export function RedWavePanel({ labels }: { labels: Labels }) {
	const [selectedId, setSelectedId] = useState<string>("");

	const bump: BumpCase | null =
		BUMP_CASES.find((b) => b.id === selectedId) ?? null;
	const wave = bump ? impact(bump.bumped, bump.edges, bump.heads) : null;
	const rows = bump && wave ? enqueue(wave, bump.waveId) : [];

	return (
		<div className="space-y-6">
			{/* The action: pick a bump, fire the wave */}
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickLabel}
					</span>
					<select
						aria-label={labels.pickLabel}
						value={selectedId}
						onChange={(ev) => setSelectedId(ev.target.value)}
						className="min-w-64 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
					>
						<option value="">{labels.awaiting}</option>
						{BUMP_CASES.map((b) => (
							<option key={b.id} value={b.id}>
								{labels.bumpNames[b.labelKey] ?? b.id}
							</option>
						))}
					</select>
				</label>
				<span className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
					{labels.fireLabel}
				</span>
			</div>

			{/* The wave: the bump (wave_id), then the ordered items mirror-first, grouped by layer */}
			{bump && wave ? (
				<section
					aria-label="red-wave"
					data-testid="red-wave"
					className="space-y-4 rounded-lg border border-border bg-card p-5"
				>
					<p className="text-sm text-muted-foreground">
						<span className="font-medium text-foreground">
							{labels.waveIdLabel}:{" "}
						</span>
						<code className="rounded bg-muted px-1.5 py-0.5 text-xs">
							{bump.waveId}
						</code>
					</p>

					{rows.length === 0 ? (
						<p
							data-testid="empty-wave"
							className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
						>
							{labels.emptyWave}
						</p>
					) : (
						<>
							<p className="text-xs text-muted-foreground">
								{labels.orderLabel}
							</p>
							<ol className="space-y-2">
								{rows.map((it, i) => (
									<li
										key={it.target}
										data-testid={`wave-item-${it.target}`}
										data-layer={it.layer}
										data-order={i}
										className="flex flex-wrap items-center gap-3 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2"
									>
										<span className="font-mono text-xs text-muted-foreground">
											{i + 1}.
										</span>
										<span
											className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${layerBadge[it.layer]}`}
										>
											{labels.layerNames[it.layer] ?? it.layer}
										</span>
										<span className="font-medium text-red-600 dark:text-red-400">
											{it.target}
										</span>
										<span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">
											{labels.reasonVersionStale}
										</span>
										<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
											{labels.statusOpen}
										</span>
										{it.dependencies.length > 0 ? (
											<span className="text-xs text-muted-foreground">
												{labels.deps}: {it.dependencies.join(", ")}
											</span>
										) : null}
									</li>
								))}
							</ol>
						</>
					)}
				</section>
			) : null}
		</div>
	);
}
