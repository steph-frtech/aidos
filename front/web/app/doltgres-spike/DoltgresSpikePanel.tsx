"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEFAULT_THRESHOLDS, MEASURED_SPIKE } from "@/lib/doltgres-spike";
import { decideAction } from "./actions";
import { DECIDE_INITIAL, type DecideView } from "./view";

/**
 * DoltgresSpikePanel makes the /doltgres-spike route action-capable (ui-completeness
 * law, CLAUDE.md §7): the S88 spike verdict has ONE control bound to the REAL pure
 * engine, reachable AND executable from the screen — supply a Measurement (driver, N
 * conns, failed conns, perf ratio, reproducible) and DECIDE. The screen shows the
 * verdict (go/no-go), the default target (always plain-postgres), the opt-in set, the
 * content-address, and the deterministic reasons.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/doltgres-spike,
 * never an LLM — verdict = measure. THE WALL (§2): it WRITES NOTHING — the Decision is a
 * record. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("doltgresSpike");
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

export function DoltgresSpikePanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("doltgresSpike");
	const [state, action] = useActionState<DecideView, FormData>(
		decideAction,
		DECIDE_INITIAL,
	);
	const decided = state.ok && state.decision !== undefined;
	const d = state.decision;

	return (
		<div className="space-y-8">
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

			{/* Declared thresholds — above the line, never learned. */}
			<section
				data-testid="thresholds"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("thresholdsHeading")}
				</h2>
				<div className="flex flex-wrap gap-2 font-mono text-xs">
					<span className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 text-foreground">
						maxPerfRatio = {DEFAULT_THRESHOLDS.maxPerfRatio}×
					</span>
					<span className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 text-foreground">
						maxFailedConns = {DEFAULT_THRESHOLDS.maxFailedConns}
					</span>
				</div>
			</section>

			{/* The action-capable control: supply a measurement → decide. */}
			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("measurementHeading")}
				</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("fieldDriver")}</span>
						<select
							name="driver"
							data-testid="field-driver"
							defaultValue={MEASURED_SPIKE.driver}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="ts-postgres">ts-postgres</option>
							<option value="pgx">pgx</option>
						</select>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("fieldConns")}</span>
						<input
							type="number"
							name="conns"
							data-testid="field-conns"
							min={1}
							max={1024}
							defaultValue={MEASURED_SPIKE.conns}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">
							{t("fieldFailedConns")}
						</span>
						<input
							type="number"
							name="failedConns"
							data-testid="field-failed"
							min={0}
							defaultValue={MEASURED_SPIKE.failedConns}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("fieldPerfRatio")}</span>
						<input
							type="number"
							step="0.1"
							name="perfRatio"
							data-testid="field-ratio"
							min={0}
							defaultValue={MEASURED_SPIKE.perfRatio}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
				</div>
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						name="reproducible"
						data-testid="field-reproducible"
						defaultChecked={MEASURED_SPIKE.reproducible}
						className="size-4 rounded border-border"
					/>
					{t("fieldReproducible")}
				</label>
				<Submit label={t("decide")} testId="decide-submit" />
			</form>

			{decided && d && (
				<section
					data-testid="decision"
					data-verdict={d.verdict}
					className="space-y-3 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center gap-3">
						<span
							data-testid="verdict"
							className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase ${
								d.verdict === "go"
									? "bg-primary/15 text-primary"
									: "bg-destructive/15 text-destructive"
							}`}
						>
							{d.verdict}
						</span>
						<span className="text-sm text-muted-foreground">
							{t("defaultTargetLabel")}:{" "}
							<span
								data-testid="default-target"
								className="font-mono text-foreground"
							>
								{d.defaultTarget}
							</span>
						</span>
					</div>
					<div className="flex flex-wrap gap-2 text-xs">
						<span className="text-muted-foreground">{t("optInLabel")}:</span>
						{d.optInTargets.map((tg) => (
							<span
								key={tg}
								data-optin={tg}
								className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-foreground"
							>
								{tg}
							</span>
						))}
					</div>
					<p className="font-mono text-xs text-muted-foreground">
						{t("contentAddressLabel")}:{" "}
						<span data-testid="decision-id">{d.id.slice(0, 16)}</span>
					</p>
					<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
						{d.reasons.map((r) => (
							<li key={r} data-testid="reason">
								{r}
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
