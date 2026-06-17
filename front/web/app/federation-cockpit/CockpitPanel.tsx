"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assembleAction } from "./actions";
import { COCKPIT_INITIAL } from "./view";

/**
 * CockpitPanel makes the /federation-cockpit route action-capable (ui-completeness law, CLAUDE.md
 * §7): S105 has ONE control bound to the REAL cockpit assembler, with TWO toggles that drive the
 * §50 done-criterion from the screen —
 *
 *   - ASSEMBLE THE COCKPIT over the two REAL cells order + payment (one honored contract): each
 *     cell shows BOTH ratchets (S100 behavioural + S102 structural), the cells that ship right
 *     now, and whether the federation is globally stable.
 *   - FIRE THE TRANSVERSE RED WAVE: a global policy expressed ONCE reddens ONLY payment — order
 *     shows a green local cut and SHIPS while payment is still red (the §43 fractal).
 *   - BREAK THE STRUCTURE: feed a regressed cut (a new un-contracted inter-cell edge) → the
 *     SECOND ratchet goes BROKEN and the federation is NOT globally stable, even with green cells.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/federation-cockpit,
 * never an LLM — same input → identical snapshot. THE WALL (§2): it WRITES NOTHING — the snapshot
 * is a value (the structural baseline moves via a ChangeSet, the per-cell INSERT is the S22
 * hook's job). Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("federationCockpit");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function CockpitPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("federationCockpit");
	const [view, dispatch] = useActionState(assembleAction, COCKPIT_INITIAL);
	const snap = view.snapshot;

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">
					{t("activeProjectLabel")}:
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			{/* ── The cockpit control: assemble + toggles ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("assembleHeading")}
					</h2>
					{view.ok && view.source ? (
						<span
							data-testid="cockpit-source"
							data-source={view.source}
							className={
								view.source === "live"
									? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
									: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
							}
							title={
								view.source === "live"
									? t("sourceLiveTitle")
									: t("sourceDemoTitle")
							}
						>
							<span
								aria-hidden="true"
								className={
									view.source === "live"
										? "size-1.5 rounded-full bg-primary"
										: "size-1.5 rounded-full bg-muted-foreground"
								}
							/>
							{view.source === "live" ? t("sourceLive") : t("sourceDemo")}
						</span>
					) : null}
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("assembleBody")}
				</p>
				<form action={dispatch} className="space-y-4">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="fireWave"
							data-testid="fire-wave"
							className="h-4 w-4 rounded border-border"
						/>
						{t("fireWaveLabel")}
					</label>
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="breakStructure"
							data-testid="break-structure"
							className="h-4 w-4 rounded border-border"
						/>
						{t("breakStructureLabel")}
					</label>
					<Submit label={t("assemble")} testId="assemble-cockpit" />
				</form>

				{view.error ? (
					<p data-testid="cockpit-error" className="text-sm text-destructive">
						{view.error}
					</p>
				) : null}
			</section>

			{snap ? (
				<div data-testid="cockpit-result" className="space-y-8">
					{/* ── Federation-level status: both ratchets + global stability ── */}
					<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("structuralRatchet")}
							</div>
							<div
								data-testid="structural-state"
								className={
									snap.structural.state === "HELD"
										? "mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
										: "mt-1 inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-xs text-destructive"
								}
							>
								{snap.structural.state}
							</div>
						</div>
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("globalStability")}
							</div>
							<div
								data-testid="globally-stable"
								className={
									snap.globallyStable
										? "mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
										: "mt-1 inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-600 dark:text-amber-400"
								}
							>
								{snap.globallyStable ? t("stable") : t("inFlux")}
							</div>
						</div>
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("shipsNow")}
							</div>
							<div
								data-testid="shippable-cells"
								className="mt-1 font-mono text-xs text-foreground"
							>
								{snap.shippableCells.join(", ") || "—"}
							</div>
						</div>
					</section>

					{/* ── The cell graph: each cell with BOTH ratchets ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("cellGraphHeading")}
						</h3>
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
									<th className="pb-2">{t("cellColumn")}</th>
									<th className="pb-2">{t("behaviouralColumn")}</th>
									<th className="pb-2">{t("shipsColumn")}</th>
									<th className="pb-2">{t("queueColumn")}</th>
								</tr>
							</thead>
							<tbody>
								{snap.cells.map((c) => (
									<tr
										key={c.cell}
										data-testid={`cell-row-${c.cell}`}
										className="border-t border-border"
									>
										<td className="py-2 font-mono text-foreground">{c.cell}</td>
										<td className="py-2">
											<span
												data-testid={`cell-status-${c.cell}`}
												className={
													c.reddened || c.behavioural === "red"
														? "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-xs text-destructive"
														: "inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
												}
											>
												{c.reddened || c.behavioural === "red"
													? t("reddened")
													: t("green")}
											</span>
										</td>
										<td className="py-2">
											<span
												data-testid={`cell-ships-${c.cell}`}
												className="font-mono text-xs text-muted-foreground"
											>
												{c.ships ? t("shipsYes") : t("shipsNo")}
											</span>
										</td>
										<td className="py-2 font-mono text-xs text-muted-foreground">
											{c.queue.length > 0 ? c.queue.join(", ") : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>

					{/* ── The contracts (graph edges) ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("contractsHeading")}
						</h3>
						<ul data-testid="contracts" className="space-y-1">
							{snap.contracts.map((edge) => (
								<li
									key={`${edge.a}-${edge.b}`}
									data-testid={`contract-${edge.a}-${edge.b}`}
									className="font-mono text-xs text-muted-foreground"
								>
									{edge.a} ⇄ {edge.b}{" "}
									<span
										className={
											edge.honored
												? "text-emerald-600 dark:text-emerald-400"
												: "text-destructive"
										}
									>
										({edge.honored ? t("honored") : t("broken")})
									</span>
								</li>
							))}
						</ul>
					</section>
				</div>
			) : null}
		</div>
	);
}
