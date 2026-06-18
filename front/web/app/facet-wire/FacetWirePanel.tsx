"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { wireAction } from "./actions";
import { emptyView, type FacetWireView, SCENARIOS } from "./fixtures";
import type { LiveColumn, LiveDivergence } from "./live";

/**
 * FacetWirePanel makes the /facet-wire route action-capable (ui-completeness, CLAUDE.md §7):
 * the FK08 judge WireSkeleton has ONE control bound to it — CÂBLER — reachable AND executable
 * from the screen. Pick a scenario, run the judge, and the five non-functional facet columns
 * (S/R/V/M/X) appear with their per-column verdicts, the reused sensor, and the structural rung
 * divergences. Breaking a HARD pair reddens its column; the SOFT X column stays green and
 * surfaces an advisory (§13.6 — it informs, never blocks).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/facetwire, never an
 * LLM — same skeleton → same verdict (the determinism badge). THE WALL (§2): it WRITES NOTHING
 * — the report is a projection. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

function Submit() {
	const t = useTranslations("facetWire");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="wire-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("wireCta")}
		</button>
	);
}

function DivergenceRow({ d }: { d: LiveDivergence }) {
	const t = useTranslations("facetWire");
	return (
		<li
			data-testid="divergence"
			data-facet={d.facet}
			data-rung={d.rung}
			data-kind={d.kind}
			data-advisory={d.advisory ? "true" : "false"}
			className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
		>
			<span className="font-mono text-[11px] text-muted-foreground">
				{d.rung}
			</span>{" "}
			<span
				className={
					d.advisory
						? "inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
						: "inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive"
				}
			>
				{d.kind === "pair_broken" ? t("kindBroken") : t("kindUndeclared")}
				{d.advisory ? ` · ${t("advisoryTag")}` : ""}
			</span>
		</li>
	);
}

function ColumnCard({ col }: { col: LiveColumn }) {
	const t = useTranslations("facetWire");
	const divs = col.soft ? col.advisories : col.divergences;
	return (
		<div
			data-testid="column"
			data-facet={col.facet}
			data-verdict={col.verdict}
			data-soft={col.soft ? "true" : "false"}
			className="space-y-2 rounded-xl border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted font-mono text-sm font-bold text-foreground">
					{col.facet}
				</span>
				<span
					data-testid="column-verdict"
					className={
						col.verdict === "green"
							? "inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-300"
							: "inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive"
					}
				>
					{col.verdict === "green" ? t("verdictGreen") : t("verdictRed")}
				</span>
				{col.soft ? (
					<span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
						{t("softTag")}
					</span>
				) : null}
			</div>
			<p className="font-mono text-[11px] text-muted-foreground">
				{t("sensorLabel")}: {col.sensor}
			</p>
			{divs.length === 0 ? (
				<p className="text-xs text-muted-foreground">{t("columnClean")}</p>
			) : (
				<ul className="space-y-1">
					{divs.map((d) => (
						<DivergenceRow key={`${d.rung}:${d.kind}`} d={d} />
					))}
				</ul>
			)}
		</div>
	);
}

export function FacetWirePanel() {
	const t = useTranslations("facetWire");
	const [state, formAction] = useActionState<FacetWireView, FormData>(
		wireAction,
		emptyView,
	);

	return (
		<section
			aria-label={t("panelHeading")}
			data-testid="facet-wire-panel"
			className="mt-10 space-y-6"
		>
			<form action={formAction} className="space-y-4">
				<label
					htmlFor="scenarioId"
					className="block text-sm font-medium text-foreground"
				>
					{t("scenarioLabel")}
				</label>
				<select
					id="scenarioId"
					name="scenarioId"
					data-testid="scenario-select"
					defaultValue={SCENARIOS[0]?.id}
					className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{SCENARIOS.map((s) => (
						<option key={s.id} value={s.id}>
							{s.label}
						</option>
					))}
				</select>
				<Submit />
			</form>

			{state.error ? (
				<p data-testid="wire-error" className="text-sm text-destructive">
					{state.error}
				</p>
			) : null}

			{state.ok ? (
				<div data-testid="report" className="space-y-6">
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-sm text-muted-foreground">
							{t("kernelIdLabel")}
						</span>
						<code
							data-testid="kernel-id"
							className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
						>
							{state.kernelId}
						</code>
						<span
							data-testid="verdict-badge"
							data-verdict={state.verdict}
							className={
								state.verdict === "green"
									? "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
									: "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
							}
						>
							{state.verdict === "green" ? t("verdictGreen") : t("verdictRed")}
						</span>
						<span
							data-testid="determinism-badge"
							data-deterministic={state.deterministic ? "true" : "false"}
							className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						>
							{state.deterministic
								? t("deterministicYes")
								: t("deterministicNo")}
						</span>
						{state.source ? (
							<span
								data-testid="source-badge"
								data-source={state.source}
								className={
									state.source === "live"
										? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
										: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
								}
							>
								<span
									aria-hidden="true"
									className={
										state.source === "live"
											? "size-1.5 rounded-full bg-primary"
											: "size-1.5 rounded-full bg-muted-foreground"
									}
								/>
								{state.source === "live" ? t("sourceLive") : t("sourceDemo")}
							</span>
						) : null}
					</div>

					<div
						data-testid="columns"
						className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
					>
						{state.columns.map((c) => (
							<ColumnCard key={c.facet} col={c} />
						))}
					</div>
				</div>
			) : null}
		</section>
	);
}
