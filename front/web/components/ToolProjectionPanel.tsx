"use client";

import { useState } from "react";
import {
	type Drift,
	detectDrift,
	emit,
	sourceHash,
	TARGETS,
	type Target,
} from "@/lib/tool-projection";
import { aidosTooling } from "@/lib/tool-projection-data";

/**
 * ToolProjectionPanel — the action-capable /tool-projection panel (FK15, the tooling projections). It
 * lets the human PICK a target (CLAUDE.md / AGENTS.md / .cursorrules / memory-bank.md), RUN the emit
 * (the action, executable from the screen — not a static display): it calls the same pure `emit` the
 * Go toolproject.Emit computes, renders the byte-identical file + its source-hash; then RUN the
 * drift check on the clean file (no drift) or on a HAND-EDITED file (the FK15 fault-injection →
 * HAND_EDITED drift).
 *
 * THE DONE CRITERIA, visible & executable: emitting a target twice yields the SAME bytes (same kernel
 * → byte-identical); a hand-edit of the emitted file is DETECTED (HAND_EDITED); the file is a derived
 * view of the kernel sources, never the truth (no double-typing).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action emits + drift-checks; it NEVER writes
 * truth — freezing/updating a ToolingKernel goes via propose → /goal → approval. The emit is RENDERED,
 * never re-implemented here. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	pickLabel: string;
	awaiting: string;
	emitLabel: string;
	checkCleanLabel: string;
	checkEditedLabel: string;
	sourceHashLabel: string;
	fileLabel: string;
	driftHeading: string;
	noDrift: string;
	expectedLabel: string;
	targetNames: Record<string, string>;
	driftNames: Record<string, string>;
}

type Mode = "clean" | "edited";

export function ToolProjectionPanel({ labels }: { labels: Labels }) {
	const [target, setTarget] = useState<Target>("CLAUDE.md");
	const [emitted, setEmitted] = useState<string | null>(null);
	const [drift, setDrift] = useState<Drift | null | undefined>(undefined);

	const hash = sourceHash(aidosTooling);

	function runEmit() {
		setEmitted(emit(aidosTooling, target));
		setDrift(undefined);
	}

	function runCheck(mode: Mode) {
		const clean = emit(aidosTooling, target);
		if (clean === null) return;
		const onDisk =
			mode === "clean"
				? clean
				: clean
						.replace("L'agent n'écrit jamais", "L'agent peut écrire")
						.replace("Agent Contract", "Agent Contract (édité à la main)");
		setEmitted(onDisk);
		setDrift(detectDrift(aidosTooling, target, onDisk));
	}

	return (
		<div className="space-y-6">
			{/* The action: pick a target, emit / drift-check */}
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickLabel}
					</span>
					<select
						aria-label={labels.pickLabel}
						value={target}
						onChange={(ev) => setTarget(ev.target.value as Target)}
						className="min-w-72 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
					>
						{TARGETS.map((t) => (
							<option key={t} value={t}>
								{labels.targetNames[t] ?? t}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					data-testid="emit-btn"
					onClick={runEmit}
					className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
				>
					{labels.emitLabel}
				</button>
				<button
					type="button"
					data-testid="check-clean-btn"
					onClick={() => runCheck("clean")}
					className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					{labels.checkCleanLabel}
				</button>
				<button
					type="button"
					data-testid="check-edited-btn"
					onClick={() => runCheck("edited")}
					className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					{labels.checkEditedLabel}
				</button>
			</div>

			{emitted !== null ? (
				<section
					aria-label="tool-projection-result"
					data-testid="tool-projection-result"
					className="space-y-4 rounded-lg border border-border bg-card p-5"
				>
					<p className="text-sm text-muted-foreground">
						<span className="font-medium text-foreground">
							{labels.sourceHashLabel}:{" "}
						</span>
						<code
							data-testid="source-hash"
							className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
						>
							{hash}
						</code>
					</p>

					{drift !== undefined ? (
						drift === null ? (
							<p
								data-testid="no-drift"
								className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
							>
								{labels.noDrift}
							</p>
						) : (
							<div
								data-testid="drift"
								data-kind={drift.kind}
								className="space-y-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2"
							>
								<h3 className="text-sm font-semibold tracking-tight text-foreground">
									{labels.driftHeading}
								</h3>
								<span className="inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">
									{labels.driftNames[drift.kind] ?? drift.kind}
								</span>
								{drift.expected ? (
									<p className="text-xs text-muted-foreground">
										{labels.expectedLabel}:{" "}
										<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
											{drift.expected}
										</code>
									</p>
								) : null}
							</div>
						)
					) : null}

					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							{labels.fileLabel}
						</p>
						<pre
							data-testid="emitted-file"
							className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground"
						>
							{emitted}
						</pre>
					</div>
				</section>
			) : null}
		</div>
	);
}
