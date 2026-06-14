"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Resolution } from "@/lib/connections";
import { RULE } from "@/lib/endpoint-fitness";
import { senseAction } from "./actions";
import type { SensorView } from "./view";

/**
 * EndpointsFitnessPanel — the DP08 Workbench panel: the resolved DP07
 * endpoints (references only) + the EMITTED_NO_HARDCODED_ENDPOINT sensor,
 * ACTION-CAPABLE (ui-completeness, CLAUDE.md §7):
 *
 *   - « injecter un endpoint en dur » — the fault-injection control: adds
 *     the canonical leak (gen/app/leak.ts, https://1.2.3.4:5432) to the
 *     sandbox emitted tree → the sensor goes RED and the cut is blocked;
 *   - « retirer le littéral » — removes it → GREEN again;
 *   - « mesurer le verdict » — replays the scan: same tree → same verdict →
 *     same address (the reproducibility mirror, Go-parity-pinned).
 *
 * THE WALL (CLAUDE.md §2): every control is a sandboxed MEASURE — nothing is
 * written; the declared rule is above-the-line (arch-fitness.json).
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */

const MODE_STYLE: Record<string, string> = {
	docker_internal:
		"bg-primary/10 text-primary border border-primary/30 dark:bg-primary/15",
	traefik_url:
		"bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400",
	managed_url:
		"bg-amber-500/10 text-amber-700 border border-amber-500/30 dark:text-amber-400",
};

function ActionButton({
	op,
	testid,
	label,
	tone,
}: {
	op: string;
	testid: string;
	label: string;
	tone: "primary" | "outline";
}) {
	const t = useTranslations("endpointsFitness");
	const { pending } = useFormStatus();
	const cls =
		tone === "primary"
			? "bg-primary text-primary-foreground hover:bg-primary/90"
			: "border border-border bg-card text-foreground hover:bg-muted";
	return (
		<button
			type="submit"
			name="op"
			value={op}
			data-testid={testid}
			disabled={pending}
			className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${cls}`}
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function EndpointsFitnessPanel({
	rows,
	initial,
}: {
	rows: Resolution[];
	initial: SensorView;
}) {
	const t = useTranslations("endpointsFitness");
	const [view, action] = useActionState<SensorView, FormData>(
		senseAction,
		initial,
	);

	return (
		<div className="space-y-8">
			{/* The resolved endpoints — DP07 references only. */}
			<section
				data-testid="endpoints-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("endpointsHeading")}
					</h2>
					<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						DP07 → DP08
					</span>
				</div>
				<div className="mt-4 overflow-x-auto">
					<table data-testid="endpoints-table" className="w-full text-sm">
						<thead>
							<tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
								<th className="py-2 pr-4">{t("serviceCol")}</th>
								<th className="py-2 pr-4">{t("modeCol")}</th>
								<th className="py-2 pr-4">{t("endpointCol")}</th>
								<th className="py-2">{t("envVarsCol")}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr
									key={r.service}
									data-testid={`endpoint-row-${r.service}`}
									className="border-b border-border/60 last:border-0"
								>
									<td className="py-2 pr-4 font-medium text-foreground">
										{r.service}
									</td>
									<td className="py-2 pr-4">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${MODE_STYLE[r.mode] ?? "bg-muted text-muted-foreground"}`}
										>
											{r.mode}
										</span>
									</td>
									<td className="py-2 pr-4 font-mono text-xs text-foreground">
										{r.endpoint_pattern}
									</td>
									<td className="py-2 font-mono text-xs text-muted-foreground">
										{r.env_vars}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* The sensor — action-capable fault-injection sandbox. */}
			<section
				data-testid="sensor-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("sensorHeading")}
					</h2>
					<span
						data-testid="sensor-state"
						data-state={view.state}
						className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
							view.state === "green"
								? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400"
								: "bg-destructive/10 text-destructive border border-destructive/30"
						}`}
					>
						{view.state === "green" ? t("stateGreen") : t("stateRed")}
					</span>
				</div>

				{view.injected ? (
					<p
						data-testid="injected-badge"
						className="mt-3 inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-xs text-destructive"
					>
						{t("injectedBadge")}
					</p>
				) : null}

				<dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground">{t("addressLabel")}</dt>
						<dd
							data-testid="sensor-address"
							className="mt-0.5 break-all font-mono text-foreground"
						>
							{view.address}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{t("treeLabel")}</dt>
						<dd
							data-testid="tree-address"
							className="mt-0.5 break-all font-mono text-muted-foreground"
						>
							{view.treeAddress}
						</dd>
					</div>
				</dl>

				<h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t("findingsHeading")}
				</h3>
				{view.findings.length === 0 ? (
					<p
						data-testid="no-findings"
						className="mt-2 text-sm text-muted-foreground"
					>
						{t("noFindings")}
					</p>
				) : (
					<ul data-testid="findings" className="mt-2 space-y-1">
						{view.findings.map((f) => (
							<li
								key={`${f.file}:${f.line}:${f.literal}`}
								data-testid="finding"
								className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive"
							>
								{f.file}:{f.line} — {f.literal} — {f.reason}
							</li>
						))}
					</ul>
				)}

				{view.state === "red" ? (
					<div
						data-testid="sensor-block"
						className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
					>
						<p className="font-mono text-xs font-semibold text-destructive">
							{RULE}
						</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							{t("blockHeading")} — {t("blockBody")}
						</p>
					</div>
				) : null}

				<form
					action={action}
					className="mt-5 flex flex-wrap items-center gap-3"
				>
					{view.injected ? (
						<ActionButton
							op="remove"
							testid="remove-leak"
							label={t("remove")}
							tone="primary"
						/>
					) : (
						<ActionButton
							op="inject"
							testid="inject-leak"
							label={t("inject")}
							tone="primary"
						/>
					)}
					<ActionButton
						op="measure"
						testid="measure-verdict"
						label={t("measure")}
						tone="outline"
					/>
					<span className="text-xs text-muted-foreground">
						{t("measuresLabel")}{" "}
						<span data-testid="measure-count" className="font-mono">
							{view.measures}
						</span>
					</span>
				</form>

				<p className="mt-4 text-xs leading-relaxed text-muted-foreground">
					{t("wallNote")}
				</p>
			</section>
		</div>
	);
}
