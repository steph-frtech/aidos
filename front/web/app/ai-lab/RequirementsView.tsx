"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	ALL_FACETS,
	type DagImpact,
	EXISTING_DAG,
	type Level,
	requirementGrid,
	requirementSpecs,
	requirementsRollup,
	VERTICAL_LEVELS,
} from "@/lib/ai-lab";

/**
 * RequirementsView — navigate the project BY requirement (feature). Each requirement is a fractal
 * kernel carrying the full niveau × facette anatomy ; this view shows, per requirement, the SUM of
 * each (a niveau × facette count grid with row/column totals Σ), the LINKS (its dependencies) and
 * its specs. Pure projections of the deterministic lib (requirementsRollup / requirementGrid).
 */

const LEVEL_KEY: Record<Level, string> = {
	produit: "level_produit",
	parcours: "level_parcours",
	vue: "level_vue",
	contrôle: "level_controle",
	action: "level_action",
	opération: "level_operation",
	entité: "level_entite",
};

export function RequirementsView({ impacts }: { impacts: DagImpact[] }) {
	const t = useTranslations("aiLab");
	const rollups = requirementsRollup(EXISTING_DAG, impacts);
	const [sel, setSel] = useState(rollups[0]?.id ?? "");

	const grid = requirementGrid(EXISTING_DAG, sel);
	const specs = requirementSpecs(EXISTING_DAG, sel);
	const selRollup = rollups.find((r) => r.id === sel);
	const titleOf = (id: string) => rollups.find((r) => r.id === id)?.title ?? id;

	const cell = (l: Level, f: string) =>
		grid.find((g) => g.level === l && g.facet === f)?.count ?? 0;
	const rowSum = (l: Level) => ALL_FACETS.reduce((a, f) => a + cell(l, f), 0);
	const colSum = (f: string) =>
		VERTICAL_LEVELS.reduce((a, l) => a + cell(l, f), 0);

	return (
		<div className="space-y-3" data-testid="requirements">
			<div>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("reqHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("reqHint")}</p>
			</div>

			{/* the requirements + the SUM of each */}
			<div className="flex flex-wrap gap-1.5" data-testid="req-chips">
				{rollups.map((r) => (
					<button
						key={r.id}
						type="button"
						onClick={() => setSel(r.id)}
						data-testid={`req-${r.id}`}
						className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
							sel === r.id
								? "border-primary bg-primary/15 font-semibold text-primary"
								: "border-border bg-background text-foreground hover:bg-muted"
						}`}
					>
						<span>{r.title}</span>
						<span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
							{r.total}
						</span>
						{r.impacted > 0 ? (
							<span className="text-[10px] text-destructive">
								🔴{r.impacted}
							</span>
						) : null}
					</button>
				))}
			</div>

			{/* the niveau × facette SUM grid of the selected requirement (row/col totals Σ) */}
			<div className="overflow-x-auto rounded-lg border border-border p-2">
				<table className="w-full border-separate border-spacing-1 text-xs">
					<thead>
						<tr>
							<th className="p-1" />
							{ALL_FACETS.map((f) => (
								<th
									key={f}
									title={t(`facet_${f}`)}
									className="p-1 text-center font-semibold text-foreground"
								>
									{f}
								</th>
							))}
							<th className="p-1 text-center font-bold text-primary">Σ</th>
						</tr>
					</thead>
					<tbody>
						{VERTICAL_LEVELS.map((l) => (
							<tr key={l}>
								<th className="whitespace-nowrap p-1 text-right text-[11px] font-medium text-muted-foreground">
									{t(LEVEL_KEY[l])}
								</th>
								{ALL_FACETS.map((f) => {
									const c = cell(l, f);
									return (
										<td
											key={f}
											data-testid={`reqcell-${l}-${f}`}
											className={`h-7 text-center text-[10px] ${
												c
													? "rounded bg-amber-500/15 font-medium text-foreground"
													: "text-muted-foreground/40"
											}`}
										>
											{c || "·"}
										</td>
									);
								})}
								<th className="p-1 text-center text-[11px] font-bold text-primary">
									{rowSum(l)}
								</th>
							</tr>
						))}
						{/* the column sums Σ */}
						<tr>
							<th className="p-1 text-right text-[11px] font-bold text-primary">
								Σ
							</th>
							{ALL_FACETS.map((f) => (
								<th
									key={f}
									className="p-1 text-center text-[11px] font-bold text-primary"
								>
									{colSum(f)}
								</th>
							))}
							<th
								data-testid="req-total"
								className="p-1 text-center text-[11px] font-bold text-primary"
							>
								{specs.length}
							</th>
						</tr>
					</tbody>
				</table>
			</div>

			{/* the LINKS (dependencies) of the requirement */}
			<div
				className="flex flex-wrap items-center gap-1.5 text-xs"
				data-testid="req-links"
			>
				<span className="text-muted-foreground">{t("reqLinks")} :</span>
				{selRollup && selRollup.deps.length > 0 ? (
					selRollup.deps.map((d) => (
						<button
							key={d}
							type="button"
							onClick={() => setSel(d)}
							className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-foreground hover:bg-muted"
						>
							→ {titleOf(d)}
						</button>
					))
				) : (
					<span className="text-muted-foreground">{t("reqNoLink")}</span>
				)}
			</div>

			{/* the requirement's specs */}
			<ul className="space-y-1" data-testid="req-specs">
				{specs.map((s) => (
					<li
						key={s.id}
						className="rounded-md border border-border/60 bg-background p-1.5 text-xs"
					>
						<span className="font-medium text-foreground">{s.title}</span>
						<span className="text-muted-foreground">
							{" "}
							· {t(LEVEL_KEY[s.level])} · {s.facet}·{s.pairId}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
