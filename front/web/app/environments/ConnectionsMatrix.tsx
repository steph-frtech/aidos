"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Environment, Resolution } from "@/lib/connections";
import { ENVIRONMENTS, isConnRefusal, resolveFor } from "@/lib/connections";
import { measureMatrixAction } from "./connections-actions";
import {
	MATRIX_MEASURE_INITIAL,
	type MatrixMeasureView,
} from "./connections-view";

/**
 * ConnectionsMatrix — the DP07 extension of the /environments panel: the
 * service × environment → connection-mode matrix, recomputed ON SCREEN by the
 * PURE TS twin resolveConnection (lib/connections, byte-parity-pinned to the
 * authoritative Go back/runtime/connresolve).
 *
 * TWO controls (ui-completeness, CLAUDE.md §7):
 *   - the ENVIRONMENT SWITCH (one button per closed environment) re-runs the
 *     resolution for the picked environment — the modes recalculate live
 *     (docker_internal / traefik_url / managed_url), never an estimation;
 *   - « mesurer la matrice » re-measures the content address of the WHOLE
 *     matrix against the seeded Go-authoritative one (the reproducibility
 *     law — measure twice, same address).
 *
 * THE WALL (CLAUDE.md §2): both are PURE MEASURES — nothing is written.
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

function MeasureSubmit() {
	const t = useTranslations("environments");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="matrix-measure"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("matrixMeasure")}
		</button>
	);
}

export function ConnectionsMatrix({ seededHash }: { seededHash: string }) {
	const t = useTranslations("environments");
	const [env, setEnv] = useState<Environment>("prod");
	const [state, action] = useActionState<MatrixMeasureView, FormData>(
		measureMatrixAction,
		MATRIX_MEASURE_INITIAL,
	);

	const rows = resolveFor(env).filter(
		(r): r is Resolution => !isConnRefusal(r),
	);

	return (
		<section
			data-testid="connections-card"
			className="rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("matrixHeading")}
				</h2>
				<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
					DP07
				</span>
			</div>
			<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
				{t("matrixBody")}
			</p>

			{/* the environment switch — the resolution recomputes live */}
			<fieldset
				className="mt-4 flex flex-wrap gap-2 border-0 p-0"
				aria-label={t("matrixEnvLabel")}
			>
				{ENVIRONMENTS.map((e) => (
					<button
						key={e}
						type="button"
						data-testid={`matrix-env-${e}`}
						aria-pressed={env === e}
						onClick={() => setEnv(e)}
						className={`inline-flex items-center rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
							env === e
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-background text-muted-foreground hover:bg-muted"
						}`}
					>
						{e}
					</button>
				))}
			</fieldset>

			<div className="mt-4 overflow-x-auto">
				<table
					data-testid="connections-table"
					data-environment={env}
					className="w-full border-collapse text-left"
				>
					<thead>
						<tr className="border-b border-border text-xs font-medium text-muted-foreground">
							<th className="px-3 py-2">{t("matrixServiceCol")}</th>
							<th className="px-3 py-2">{t("matrixRoleCol")}</th>
							<th className="px-3 py-2">{t("matrixModeCol")}</th>
							<th className="px-3 py-2">{t("matrixEndpointCol")}</th>
							<th className="px-3 py-2">{t("matrixEnvVarsCol")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={r.service}
								data-testid={`conn-row-${r.service}`}
								className="border-b border-border last:border-b-0"
							>
								<td className="px-3 py-2 font-mono text-xs font-medium text-foreground">
									{r.service}
								</td>
								<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
									{r.role}
								</td>
								<td className="px-3 py-2">
									<span
										data-testid={`mode-${r.service}`}
										className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ${MODE_STYLE[r.mode] ?? "bg-muted text-muted-foreground"}`}
									>
										{r.mode}
									</span>
								</td>
								<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
									{r.endpoint_pattern}
								</td>
								<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
									{r.env_vars}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* the reproducibility control — measure twice, same address */}
			<div className="mt-4 flex flex-wrap items-center gap-3">
				<form action={action} className="flex items-center gap-3">
					<input type="hidden" name="seededHash" value={seededHash} />
					<MeasureSubmit />
				</form>
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="font-medium text-muted-foreground">
						{t("matrixHashLabel")}:
					</span>
					<code
						data-testid="matrix-hash"
						className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground"
					>
						{state.measured ? state.hash : seededHash}
					</code>
					{state.measured ? (
						<span
							data-testid="matrix-same"
							className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono font-medium text-muted-foreground"
						>
							{state.sameAsSeeded ? t("sameYes") : t("sameNo")}
						</span>
					) : null}
				</div>
			</div>
			<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
				{t("matrixWallNote")}
			</p>
		</section>
	);
}
