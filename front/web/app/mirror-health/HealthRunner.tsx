"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { type CompletenessActionResult, computeHealth } from "./actions";

/**
 * HealthRunner makes the /mirror-health panel ACTION-CAPABLE (ui-completeness
 * law, CLAUDE.md §6): the capability the step develops — compute the completeness
 * law over mirrors ⋈ kernel and surface the monster set + verdict — is reachable
 * AND executable from the screen, not just displayed. Two controls run the law
 * over a declared cut:
 *
 *   - "Compute — monster cut"  → RED — MONSTER (a truth without a mirror + an orphan)
 *   - "Compute — complete cut" → COMPLETE (every layer has its living mirror)
 *
 * Each calls the computeHealth Server Action (app/mirror-health/actions.ts), which
 * runs the PURE completeness core and writes NOTHING (mirrors/kernel are above the
 * wall — the law is a read-only verdict). The panel then renders the typed mirror
 * inventory (reflects, test_kind, cert_language, authority, liveness), the monster
 * set highlighted by reason, and the completeness verdict.
 *
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */
export function HealthRunner() {
	const t = useTranslations("mirrorHealth");
	const [pending, startTransition] = useTransition();
	const [result, setResult] = useState<CompletenessActionResult | null>(null);

	function run(scenario: "monster" | "complete") {
		startTransition(async () => {
			setResult(await computeHealth(scenario));
		});
	}

	const verdict = result?.completeness.verdict ?? null;
	const monsters = result?.completeness.monsters ?? [];
	const inventory = result?.inventory ?? [];
	// Which orphan mirrors are flagged, for row highlighting.
	const monsterMirrors = new Set(
		monsters
			.filter((m) => m.reason === "no_orphan_mirror")
			.map((m) => m.mirrorId),
	);

	return (
		<section
			data-testid="health-runner"
			className="mt-10 space-y-6 rounded-2xl border border-border bg-card p-6 sm:p-8"
		>
			<div className="space-y-2">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t("runner.heading")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("runner.lead")}
				</p>
			</div>

			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="run-monster"
					disabled={pending}
					onClick={() => run("monster")}
					className="inline-flex items-center rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{pending ? t("runner.working") : t("runner.runMonster")}
				</button>
				<button
					type="button"
					data-testid="run-complete"
					disabled={pending}
					onClick={() => run("complete")}
					className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{pending ? t("runner.working") : t("runner.runComplete")}
				</button>
			</div>

			{/* The completeness verdict for the current cut. */}
			{verdict && (
				<div
					data-testid="completeness-verdict"
					data-verdict={verdict}
					className={`rounded-xl border p-4 text-sm font-medium ${
						verdict === "COMPLETE"
							? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
							: "border-destructive/30 bg-destructive/10 text-destructive"
					}`}
				>
					{verdict === "COMPLETE"
						? t("verdict.complete")
						: t("verdict.redMonster")}
				</div>
			)}

			{/* The typed mirror inventory: the five §34 fields as columns. */}
			{inventory.length > 0 && (
				<div className="overflow-x-auto rounded-xl border border-border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
							<tr>
								<th className="px-3 py-2">{t("table.mirror")}</th>
								<th className="px-3 py-2">{t("table.reflects")}</th>
								<th className="px-3 py-2">{t("table.testKind")}</th>
								<th className="px-3 py-2">{t("table.certLanguage")}</th>
								<th className="px-3 py-2">{t("table.authority")}</th>
								<th className="px-3 py-2">{t("table.liveness")}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{inventory.map((m) => {
								const orphan = monsterMirrors.has(m.mirrorId);
								return (
									<tr
										key={m.mirrorId}
										data-testid={`mirror-row-${m.mirrorId}`}
										data-living={m.living ? "true" : "false"}
										data-orphan={orphan ? "true" : "false"}
										className={orphan ? "bg-destructive/5" : undefined}
									>
										<td className="px-3 py-2 font-medium text-foreground">
											{m.mirrorId}
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{m.reflects.layerId}@{m.reflects.version}
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{m.testKind}
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{m.certLanguage}
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{m.authority}
										</td>
										<td className="px-3 py-2">
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
													m.living
														? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
														: "bg-destructive/10 text-destructive"
												}`}
											>
												{m.living ? t("liveness.alive") : t("liveness.dead")}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* The monster set highlighted by reason. */}
			{monsters.length > 0 && (
				<div data-testid="monster-set" className="space-y-3">
					<h3 className="text-sm font-semibold text-foreground">
						{t("monsters.heading")}
					</h3>
					<ul className="space-y-2">
						{monsters.map((m) => (
							<li
								key={`${m.reason}-${m.layerId ?? ""}-${m.mirrorId ?? ""}-${m.missingTestKind ?? ""}`}
								data-testid={`monster-${m.reason}`}
								data-reason={m.reason}
								className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
							>
								<span className="font-mono text-xs font-semibold">
									{m.reason}
								</span>
								{" — "}
								{m.reason === "no_truth_without_mirror"
									? t("monsters.noTruth", {
											layer: `${m.layerId}@${m.version}`,
											kind: m.kind ?? "",
											testKind: m.missingTestKind ?? "",
										})
									: t("monsters.orphan", {
											mirror: m.mirrorId ?? "",
											target: `${m.layerId}@${m.version}`,
										})}
							</li>
						))}
					</ul>
				</div>
			)}

			{!verdict && (
				<p data-testid="health-idle" className="text-sm text-muted-foreground">
					{t("runner.idle")}
				</p>
			)}
		</section>
	);
}
