"use client";

import { useState } from "react";
import {
	assemble,
	assembledRefs,
	type Drift,
	declaredRefs,
	detectDrift,
	PROJECTIONS,
	type Projection,
	sourceHash,
	type TechKernel,
} from "@/lib/tech-spec";
import { techSpecScenarios } from "@/lib/tech-spec-data";

/**
 * TechSpecPanel — the action-capable /tech-spec panel (FK15 part (b), the TWO assembled projections).
 * It lets the human PICK a kernel scenario (a networked CheckoutAPI / a pure-function Scorer) + a
 * projection (Fiche de Spécification Technique / Suite de Tests Techniques), RUN the assembly (the
 * action, executable from the screen — not a static display): it calls the same pure `assemble` the
 * Go techspec.Assemble computes, renders the byte-identical file + its source-hash + the ZERO-NEW-TRUTH
 * verdict (declaredRefs === assembledRefs); then RUN the drift check on the clean file (no drift) or on
 * a HAND-EDITED file (the FK15 fault-injection → HAND_EDITED).
 *
 * THE DONE CRITERIA, visible & executable: assembling twice yields the SAME bytes (same kernel →
 * byte-identical); the projection assembles EXACTLY the declared technical elements (zero new truth);
 * a hand-edit of the assembled file is DETECTED (HAND_EDITED).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action assembles + drift-checks; it NEVER
 * writes truth — freezing a projection goes via propose → /goal → approval. The assembly is RENDERED,
 * never re-implemented here. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	pickKernelLabel: string;
	pickProjLabel: string;
	assembleLabel: string;
	checkCleanLabel: string;
	checkEditedLabel: string;
	sourceHashLabel: string;
	fileLabel: string;
	driftHeading: string;
	noDrift: string;
	expectedLabel: string;
	zeroTruthHeading: string;
	zeroTruthOk: string;
	zeroTruthBroken: string;
	declaredLabel: string;
	assembledLabel: string;
	projNames: Record<string, string>;
	driftNames: Record<string, string>;
}

type Mode = "clean" | "edited";

export function TechSpecPanel({ labels }: { labels: Labels }) {
	const [scenarioId, setScenarioId] = useState<string>(techSpecScenarios[0].id);
	const [projection, setProjection] = useState<Projection>(PROJECTIONS[0]);
	const [assembled, setAssembled] = useState<string | null>(null);
	const [drift, setDrift] = useState<Drift | null | undefined>(undefined);

	const kernel: TechKernel =
		techSpecScenarios.find((s) => s.id === scenarioId)?.kernel ??
		techSpecScenarios[0].kernel;
	const hash = sourceHash(kernel);
	const declared = declaredRefs(kernel);
	const assembledR = assembledRefs(kernel);
	const zeroTruthOk = declared.join("|") === assembledR.join("|");

	function runAssemble() {
		setAssembled(assemble(kernel, projection));
		setDrift(undefined);
	}

	function runCheck(mode: Mode) {
		const clean = assemble(kernel, projection);
		if (clean === null) return;
		const onDisk =
			mode === "clean"
				? clean
				: clean.replace("FKE-20.1", "FKE-20.1 (édité à la main)");
		setAssembled(onDisk);
		setDrift(detectDrift(kernel, projection, onDisk));
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickKernelLabel}
					</span>
					<select
						aria-label={labels.pickKernelLabel}
						value={scenarioId}
						onChange={(ev) => {
							setScenarioId(ev.target.value);
							setAssembled(null);
							setDrift(undefined);
						}}
						className="min-w-64 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
					>
						{techSpecScenarios.map((s) => (
							<option key={s.id} value={s.id}>
								{s.label}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickProjLabel}
					</span>
					<select
						aria-label={labels.pickProjLabel}
						value={projection}
						onChange={(ev) => setProjection(ev.target.value as Projection)}
						className="min-w-72 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
					>
						{PROJECTIONS.map((p) => (
							<option key={p} value={p}>
								{labels.projNames[p] ?? p}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					data-testid="assemble-btn"
					onClick={runAssemble}
					className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
				>
					{labels.assembleLabel}
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

			{/* Zero-new-truth verdict — always visible (the load-bearing done-criterion) */}
			<section
				aria-label="zero-new-truth"
				data-testid="zero-new-truth"
				data-ok={zeroTruthOk ? "true" : "false"}
				className="space-y-2 rounded-lg border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.zeroTruthHeading}
				</h2>
				<p
					className={
						zeroTruthOk
							? "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
							: "rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-400"
					}
				>
					{zeroTruthOk ? labels.zeroTruthOk : labels.zeroTruthBroken}
				</p>
				<div className="grid gap-3 sm:grid-cols-2">
					<div>
						<p className="text-xs font-medium text-muted-foreground">
							{labels.declaredLabel}
						</p>
						<pre
							data-testid="declared-refs"
							className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-[11px] text-foreground"
						>
							{declared.join("\n")}
						</pre>
					</div>
					<div>
						<p className="text-xs font-medium text-muted-foreground">
							{labels.assembledLabel}
						</p>
						<pre
							data-testid="assembled-refs"
							className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-[11px] text-foreground"
						>
							{assembledR.join("\n")}
						</pre>
					</div>
				</div>
			</section>

			{assembled !== null ? (
				<section
					aria-label="tech-spec-result"
					data-testid="tech-spec-result"
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
							data-testid="assembled-file"
							className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground"
						>
							{assembled}
						</pre>
					</div>
				</section>
			) : null}
		</div>
	);
}
