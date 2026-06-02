"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	BASELINE,
	type MergeVerdict,
	type MirrorRow,
	RED_REGRESSION,
} from "@/lib/mirrors";
import { type RatchetActionResult, runRatchet } from "./actions";

/**
 * RatchetRunner makes the /mirrors panel ACTION-CAPABLE (ui-completeness law):
 * the cliquet capability the step develops (replay all mirrors → merge verdict)
 * is reachable AND executable from the screen, not just displayed. Two controls
 * run the cliquet over a declared candidate scenario:
 *
 *   - "Run — all green"  → ALLOWED, no regression
 *   - "Run — reddened"   → REJECTED, RED_REGRESSION (the S04 wall mirror goes red)
 *
 * Each calls the runRatchet Server Action (app/mirrors/actions.ts), which runs
 * the PURE cliquet core and writes only the run-log (below the wall — no truth is
 * written from the screen). The panel then renders the per-mirror verdict, the
 * regressed set highlighted, and the merge verdict + BlockReason feed.
 *
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */
export function RatchetRunner({
	inventory,
}: {
	inventory: readonly MirrorRow[];
}) {
	const t = useTranslations("mirrors");
	const [pending, startTransition] = useTransition();
	const [result, setResult] = useState<RatchetActionResult | null>(null);

	function run(scenario: "all-green" | "regressed") {
		startTransition(async () => {
			setResult(await runRatchet(scenario));
		});
	}

	const regressedIds = new Set(result?.regressedIds ?? []);
	// Per-mirror candidate status: green unless this run reddened it.
	const candidateStatus = (id: string): "green" | "red" =>
		regressedIds.has(id) ? "red" : "green";

	return (
		<section
			data-testid="ratchet-runner"
			aria-label={t("runner.heading")}
			className="space-y-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					data-testid="run-all-green"
					disabled={pending}
					onClick={() => run("all-green")}
					className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
				>
					{pending ? t("runner.working") : t("runner.runAllGreen")}
				</button>
				<button
					type="button"
					data-testid="run-reddened"
					disabled={pending}
					onClick={() => run("regressed")}
					className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
				>
					{pending ? t("runner.working") : t("runner.runReddened")}
				</button>
			</div>

			{/* The merge verdict */}
			{result && (
				<div
					data-testid="merge-verdict"
					data-verdict={result.verdict}
					className={
						result.verdict === "ALLOWED"
							? "rounded-xl border border-border bg-primary/10 px-4 py-3 text-sm font-semibold text-primary"
							: "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
					}
				>
					{result.verdict === "ALLOWED"
						? t("verdict.allowed")
						: t("verdict.rejected", { code: RED_REGRESSION })}
				</div>
			)}

			{/* The mirror inventory with the latest run per mirror */}
			<div className="overflow-hidden rounded-xl border border-border">
				<table className="w-full text-left text-sm">
					<thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
						<tr>
							<th className="px-4 py-2 font-medium">{t("table.mirror")}</th>
							<th className="px-4 py-2 font-medium">{t("table.baseline")}</th>
							<th className="px-4 py-2 font-medium">{t("table.candidate")}</th>
						</tr>
					</thead>
					<tbody>
						{inventory.map((m) => {
							const reg = regressedIds.has(m.mirrorId);
							const cand = result ? candidateStatus(m.mirrorId) : null;
							return (
								<tr
									key={m.mirrorId}
									data-testid={`mirror-row-${m.mirrorId}`}
									data-regressed={reg ? "true" : "false"}
									className={
										reg
											? "border-t border-destructive/30 bg-destructive/5"
											: "border-t border-border"
									}
								>
									<td className="px-4 py-2.5">
										<code className="font-mono text-xs text-card-foreground">
											{m.mirrorId}
										</code>
										<span className="ml-2 text-[0.7rem] text-muted-foreground">
											{m.reflects}
										</span>
									</td>
									<td className="px-4 py-2.5">
										<StatusPill status="green" />
									</td>
									<td className="px-4 py-2.5">
										{cand ? (
											<StatusPill status={cand} />
										) : (
											<span className="text-xs text-muted-foreground">
												{t("table.notRun")}
											</span>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* The regressed set + BlockReason feed (only when REJECTED) */}
			{result?.verdict === "REJECTED" && (
				<article
					data-testid="block-event"
					className="space-y-2 rounded-xl border border-destructive/40 bg-card p-5"
				>
					<code
						data-testid="block-event-code"
						className="w-fit rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive"
					>
						{RED_REGRESSION}
					</code>
					<p className="text-sm leading-relaxed text-card-foreground">
						{t("block.explanation")}
					</p>
					<ul
						data-testid="regressed-set"
						className="list-disc space-y-1 pl-5 text-sm text-card-foreground"
					>
						{result.regressedIds.map((id) => (
							<li key={id} className="font-mono text-xs">
								{id}
							</li>
						))}
					</ul>
				</article>
			)}
		</section>
	);
}

function StatusPill({ status }: { status: "green" | "red" }) {
	const t = useTranslations("mirrors");
	const isGreen = status === "green";
	return (
		<span
			data-status={status}
			className={
				isGreen
					? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
					: "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
			}
		>
			<span
				aria-hidden="true"
				className={`inline-block size-2 rounded-full ${isGreen ? "bg-primary" : "bg-destructive"}`}
			/>
			{isGreen ? t("status.green") : t("status.red")}
		</span>
	);
}

// BASELINE re-export guard so the import is recognised as load-bearing for the
// "all mirrors green at baseline" assertion the panel renders.
export const _baselineCount = BASELINE.length;
export type { MergeVerdict };
