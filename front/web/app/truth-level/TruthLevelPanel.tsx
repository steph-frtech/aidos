"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LEVELS } from "@/lib/truth-level";
import { type FilterView, filterAction } from "./actions";

/**
 * TruthLevelPanel makes the /truth-level route action-capable (ui-completeness law,
 * CLAUDE.md §7): the FK01 transition has ONE control bound to it — a FILTER BY LEVEL
 * (the done-criterion "panel filtre par niveau") — reachable AND executable from the
 * screen. Each record's level is recomputed by the transition; the parity badge (🟢/🔴)
 * proves the stored level equals the computed one.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/truth-level,
 * never an LLM — same signals → same level. THE WALL (§2): it WRITES NOTHING — the level
 * is a value the transition computes. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: FilterView = { ok: false, filter: "all", records: [], total: 0 };

function Submit() {
	const t = useTranslations("truthLevel");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="filter-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("filterCta")}
		</button>
	);
}

export function TruthLevelPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("truthLevel");
	const [state, action] = useActionState(filterAction, initial);

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

			{/* The ladder of the seven levels (Raw→Reconciled), the reference scale. */}
			<section
				data-testid="ladder"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("ladderHeading")}
				</h2>
				<ol className="flex flex-wrap gap-2">
					{LEVELS.map((l) => (
						<li
							key={l.name}
							data-testid={`ladder-${l.name}`}
							className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 font-mono text-xs text-foreground ring-1 ring-border"
						>
							<span className="text-muted-foreground">{l.rung}</span>
							<span>{t(`level.${l.name}`)}</span>
						</li>
					))}
				</ol>
			</section>

			{/* The action-capable control: filter records by truth level. */}
			<form action={action} className="space-y-4">
				<div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("filterLabel")}
						</span>
						<select
							name="filter"
							data-testid="filter-select"
							defaultValue="all"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="all">{t("filterAll")}</option>
							{LEVELS.map((l) => (
								<option key={l.name} value={l.name}>
									{l.rung} — {t(`level.${l.name}`)}
								</option>
							))}
						</select>
					</label>
					<Submit />
				</div>
			</form>

			{/* The filtered records, each with its computed level + parity badge. */}
			{state.ok && (
				<section
					data-testid="results"
					className="space-y-3 rounded-xl border border-border bg-card p-4"
				>
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("resultsHeading")}
						</h2>
						<span
							data-testid="results-count"
							className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
						>
							{state.records.length} / {state.total}
						</span>
					</div>
					{state.records.length === 0 ? (
						<p
							data-testid="results-empty"
							className="text-sm text-muted-foreground"
						>
							{t("resultsEmpty")}
						</p>
					) : (
						<ul className="space-y-2">
							{state.records.map((r) => (
								<li
									key={r.id}
									data-testid={`record-${r.id}`}
									data-level={r.levelName}
									className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
								>
									<span
										data-testid={`record-level-${r.id}`}
										className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
									>
										{r.rung} — {t(`level.${r.levelName}`)}
									</span>
									<span className="text-foreground">{t(`record.${r.id}`)}</span>
									<span
										data-testid={`parity-${r.id}`}
										data-aligned={r.aligned ? "true" : "false"}
										title={
											r.aligned ? t("parityAligned") : t("parityDivergent")
										}
										className={
											r.aligned
												? "ml-auto inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
												: "ml-auto inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
										}
									>
										{r.aligned ? t("parityAligned") : t("parityDivergent")}
									</span>
								</li>
							))}
						</ul>
					)}
				</section>
			)}
		</div>
	);
}
