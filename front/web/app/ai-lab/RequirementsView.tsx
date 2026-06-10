"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	ALL_FACETS,
	type DagImpact,
	EXISTING_DAG,
	type Level,
	type Placement,
	requirementGrid,
	requirementSpecs,
	requirementsRollup,
	VERTICAL_LEVELS,
} from "@/lib/ai-lab";
import type { Facet } from "@/lib/facetwire";

/**
 * RequirementsView — navigate the project BY requirement (a feature = a fractal kernel / bounded
 * context). Per requirement: the SUM of each (a niveau × facette count grid with row/column totals
 * Σ), the LINKS (its dependencies), and its specs. CLICK a grid cell → see the specs in that cell.
 * The 🔴 impacted count is RESOLUTION-aware (clears once the need is validated). Pure projections.
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

export function RequirementsView({
	impacts,
	placements,
}: {
	impacts: DagImpact[];
	placements: Placement[];
}) {
	const t = useTranslations("aiLab");
	const rollups = requirementsRollup(EXISTING_DAG, impacts, placements);
	const [sel, setSel] = useState(rollups[0]?.id ?? "");
	const [selCell, setSelCell] = useState<{ level: Level; facet: Facet } | null>(
		null,
	);
	const pick = (id: string) => {
		setSel(id);
		setSelCell(null);
	};

	const grid = requirementGrid(EXISTING_DAG, sel);
	const allSpecs = requirementSpecs(EXISTING_DAG, sel);
	const selRollup = rollups.find((r) => r.id === sel);
	const titleOf = (id: string) => rollups.find((r) => r.id === id)?.title ?? id;

	const cell = (l: Level, f: string) =>
		grid.find((g) => g.level === l && g.facet === f)?.count ?? 0;
	const rowSum = (l: Level) => ALL_FACETS.reduce((a, f) => a + cell(l, f), 0);
	const colSum = (f: string) =>
		VERTICAL_LEVELS.reduce((a, l) => a + cell(l, f), 0);

	const shownSpecs = selCell
		? allSpecs.filter(
				(s) => s.level === selCell.level && s.facet === selCell.facet,
			)
		: allSpecs;

	return (
		<div className="space-y-3" data-testid="requirements">
			<div>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("reqHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("reqHint")}</p>
			</div>

			{/* the requirements + the SUM of each (🔴 = unresolved impacts) */}
			<div className="flex flex-wrap gap-1.5" data-testid="req-chips">
				{rollups.map((r) => (
					<button
						key={r.id}
						type="button"
						onClick={() => pick(r.id)}
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

			{/* the niveau × facette SUM grid — CLICK a cell to see its specs */}
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
									const active = selCell?.level === l && selCell?.facet === f;
									return (
										<td key={f} className="p-0">
											{c ? (
												<button
													type="button"
													onClick={() => setSelCell({ level: l, facet: f })}
													data-testid={`reqcell-${l}-${f}`}
													title={`${t(LEVEL_KEY[l])} · ${t(`facet_${f}`)}`}
													className={`h-7 w-full rounded text-center text-[10px] font-medium transition-colors ${
														active
															? "bg-primary/25 text-primary ring-1 ring-primary"
															: "bg-amber-500/15 text-foreground hover:bg-amber-500/30"
													}`}
												>
													{c}
												</button>
											) : (
												<span className="block text-center text-[10px] text-muted-foreground/40">
													·
												</span>
											)}
										</td>
									);
								})}
								<th className="p-1 text-center text-[11px] font-bold text-primary">
									{rowSum(l)}
								</th>
							</tr>
						))}
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
								{allSpecs.length}
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
							onClick={() => pick(d)}
							className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-foreground hover:bg-muted"
						>
							→ {titleOf(d)}
						</button>
					))
				) : (
					<span className="text-muted-foreground">{t("reqNoLink")}</span>
				)}
			</div>

			{/* the requirement's specs — filtered to the clicked cell, if any */}
			<div className="space-y-1.5">
				<div className="flex items-center gap-2 text-xs">
					<span className="font-medium text-foreground">
						{selCell
							? t("reqCellSpecs", {
									level: t(LEVEL_KEY[selCell.level]),
									facet: selCell.facet,
								})
							: t("reqAllSpecs", { n: allSpecs.length })}
					</span>
					{selCell ? (
						<button
							type="button"
							onClick={() => setSelCell(null)}
							className="rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted"
						>
							{t("reqShowAll")}
						</button>
					) : null}
				</div>
				<ul className="space-y-1" data-testid="req-specs">
					{shownSpecs.map((s) => {
						const isImpacted = impacts.some((i) => i.specId === s.id);
						return (
							<li
								key={s.id}
								data-testid={`reqspec-${s.id}`}
								className={`rounded-md border p-1.5 text-xs ${
									isImpacted
										? "border-destructive/30 bg-destructive/5"
										: "border-border/60 bg-background"
								}`}
							>
								<span className="font-medium text-foreground">{s.title}</span>
								<span className="text-muted-foreground">
									{" "}
									· {t(LEVEL_KEY[s.level])} · {s.facet}·{s.pairId}
								</span>
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
