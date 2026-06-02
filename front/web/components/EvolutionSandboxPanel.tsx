"use client";

import { useMemo, useState } from "react";
import { confine, gateLit, promote } from "@/lib/evolution-sandbox";
import { CANDIDATES, WRITE_LEDGER } from "@/lib/evolution-sandbox-data";

export interface EvolutionSandboxLabels {
	ledgerTitle: string;
	ledgerAllowed: string;
	ledgerBlocked: string;
	zoneBranch: string;
	zoneReport: string;
	zoneIdea: string;
	zoneGoverning: string;
	nicheTitle: string;
	gateTitle: string;
	pillMirror: string;
	pillOutOfSample: string;
	pillAuthority: string;
	promotableYes: string;
	promotableNo: string;
	proposalLabel: string;
	scoreLabel: string;
	notPromotableNote: string;
	runActiveLabel: string;
	runStartLabel: string;
	runStopLabel: string;
}

function Pill({ lit, label }: { lit: boolean; label: string }) {
	return (
		<span
			data-testid="gate-pill"
			data-lit={lit ? "true" : "false"}
			className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
				lit
					? "border-blue-600/40 bg-blue-600/15 text-blue-600 dark:text-blue-400"
					: "border-border bg-muted text-muted-foreground"
			}`}
		>
			<span aria-hidden>{lit ? "●" : "○"}</span>
			{label}
		</span>
	);
}

export function EvolutionSandboxPanel({
	labels,
}: {
	labels: EvolutionSandboxLabels;
}) {
	// Action: an /evolve run is either active (the sandbox confines writes) or not.
	// Toggling re-runs the SAME pure twin confine() on the ledger, live.
	const [runActive, setRunActive] = useState(true);

	const kindLabel: Record<string, string> = {
		branch: labels.zoneBranch,
		report: labels.zoneReport,
		idea: labels.zoneIdea,
		governing: labels.zoneGoverning,
	};

	const ledger = useMemo(
		() =>
			WRITE_LEDGER.map((entry) => ({
				...entry,
				result: runActive
					? confine(entry.path)
					: ({ verdict: "allowed" } as ReturnType<typeof confine>),
			})),
		[runActive],
	);

	const candidates = useMemo(
		() =>
			CANDIDATES.map((c) => ({
				...c,
				gate: gateLit(c.evidence),
				promotion: promote(c.id, c.niche, c.evidence),
			})),
		[],
	);

	return (
		<div className="mt-8">
			{/* Action control: open / close the /evolve run (the quarantine) */}
			<div className="flex items-center gap-3">
				<button
					type="button"
					data-testid="toggle-run"
					onClick={() => setRunActive((v) => !v)}
					className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					{runActive ? labels.runStopLabel : labels.runStartLabel}
				</button>
				<span
					data-testid="run-state"
					className={`text-sm font-medium ${runActive ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}
				>
					{labels.runActiveLabel}: {runActive ? "ON" : "OFF"}
				</span>
			</div>

			<div className="mt-8 grid gap-8 lg:grid-cols-2">
				{/* Quarantine write ledger */}
				<div data-testid="write-ledger">
					<h2 className="text-lg font-semibold text-foreground">
						{labels.ledgerTitle}
					</h2>
					<ul className="mt-4 space-y-2">
						{ledger.map((row) => {
							const blocked = row.result.verdict === "refused";
							return (
								<li
									key={row.path}
									data-testid={blocked ? "ledger-blocked" : "ledger-allowed"}
									className={`rounded-lg border p-3 ${
										blocked
											? "border-destructive/30 bg-destructive/10"
											: "border-border bg-card"
									}`}
								>
									<div className="flex items-center justify-between gap-2">
										<code className="text-sm font-medium text-foreground">
											{row.path}
										</code>
										<span
											className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
												blocked
													? "border-destructive/30 bg-destructive/15 text-destructive"
													: "border-blue-600/30 bg-blue-600/10 text-blue-600 dark:text-blue-400"
											}`}
										>
											{blocked ? labels.ledgerBlocked : labels.ledgerAllowed}
										</span>
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										{kindLabel[row.kind]}
									</p>
									{blocked && row.result.blockCode ? (
										<div className="mt-2">
											<code
												data-testid="block-code"
												className="text-xs font-semibold text-destructive"
											>
												{row.result.blockCode}
											</code>
											<ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
												{(row.result.howToFix ?? []).map((fix) => (
													<li key={fix} data-testid="how-to-fix">
														{fix}
													</li>
												))}
											</ul>
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
				</div>

				{/* MAP-Elites niche grid + the three-pill promotion gate */}
				<div data-testid="niche-grid">
					<h2 className="text-lg font-semibold text-foreground">
						{labels.nicheTitle}
					</h2>
					<ul className="mt-4 space-y-3">
						{candidates.map((c) => (
							<li
								key={c.id}
								data-testid="candidate-card"
								data-promotable={c.gate.promotable ? "true" : "false"}
								className="rounded-lg border border-border bg-card p-4"
							>
								<div className="flex items-center justify-between gap-2">
									<code className="text-sm font-semibold text-foreground">
										{c.id}
									</code>
									<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
										{c.niche}
									</span>
								</div>
								<p className="mt-1 text-xs text-muted-foreground">
									{labels.scoreLabel}: {c.score.toFixed(2)}
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									<Pill lit={c.gate.mirrorGreen} label={labels.pillMirror} />
									<Pill
										lit={c.gate.outOfSampleGreen}
										label={labels.pillOutOfSample}
									/>
									<Pill
										lit={c.gate.authorityApproval}
										label={labels.pillAuthority}
									/>
								</div>
								{c.gate.promotable ? (
									<div
										data-testid="proposal-card"
										className="mt-3 rounded-md border border-blue-600/30 bg-blue-600/10 p-3"
									>
										<p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
											{labels.promotableYes}
										</p>
										<p className="mt-1 text-xs text-foreground">
											{labels.proposalLabel}
										</p>
										<code className="mt-1 block text-xs text-muted-foreground">
											{c.promotion.proposal?.requiresGoal}
										</code>
									</div>
								) : (
									<p
										data-testid="not-promotable"
										className="mt-3 text-xs font-medium text-muted-foreground"
									>
										{labels.promotableNo}
										{c.promotion.reason ? ` — ${c.promotion.reason}` : ""}
									</p>
								)}
							</li>
						))}
					</ul>
					<p className="mt-4 text-xs text-muted-foreground">
						{labels.notPromotableNote}
					</p>
				</div>
			</div>
		</div>
	);
}
