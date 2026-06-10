"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FACETS } from "@/lib/facets";
import { buildGrid, type Grid, type GridCell } from "@/lib/v2/grid";
import { type KernelNode, syntheticComposes } from "@/lib/v2/kernel-tree";

/**
 * WB2-05 — la GRILLE niveau × facette (FKE-1.4 « les deux axes »), client-only.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — CLIQUER une
 * cellule (niveau, facette) descend vers SES kernels/specs (la liste des ids, chacun → son anatomie
 * WB2-06). Les sommes Σ par ligne / colonne / total sont affichées et COHÉRENTES (Σ = total).
 * Aucune écriture-vérité (le mur, §2) : la grille est une projection de lecture.
 *
 * DÉTERMINISME-FIRST : la donnée de la grille est figée par le twin pur lib/v2/grid.ts (buildGrid,
 * sommes comptées). La relation des kernels est ici synthétique (240 kernels, partagés avec l'arbre
 * WB2-04) — la projection réelle arrivera quand le store de kernels exposera ses coordonnées
 * (OpenQuestion documentée). Le composant ne fait que rendre ; il ne juge rien.
 */

type Strings = Record<string, string>;

/** Le libellé d'une facette (FKE-1.3), pour l'infobulle d'en-tête de colonne. */
const FACET_NAME = new Map(FACETS.map((f) => [f.letter, f.name] as const));

export function GridClient({ t }: { t: Strings }) {
	// La liste plate des kernels (mêmes 240 que l'arbre WB2-04), figée par le twin → grille + Σ.
	const grid: Grid | null = useMemo(() => {
		const composes: KernelNode[] = syntheticComposes(240);
		const res = buildGrid(composes);
		return res.ok ? res.grid : null;
	}, []);

	const [selected, setSelected] = useState<{
		level: string;
		facet: string;
	} | null>(null);

	if (!grid) return null;

	const selectedCell: GridCell | null = selected
		? (grid.cells[grid.levels.indexOf(selected.level as never)]?.[
				grid.facets.indexOf(selected.facet)
			] ?? null)
		: null;

	return (
		<div data-testid="v2-grille-grid" className="space-y-4">
			<p
				data-testid="v2-grille-total"
				className="font-mono text-xs text-muted-foreground"
			>
				{t.total} : {grid.total}
			</p>

			<div className="overflow-x-auto rounded-xl border border-border bg-card p-2">
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr>
							<th className="p-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{t.levelAxis} \ {t.facetAxis}
							</th>
							{grid.facets.map((f) => (
								<th
									key={f}
									title={FACET_NAME.get(f as never) ?? f}
									data-testid={`v2-grille-colhead-${f}`}
									className="p-2 text-center font-mono text-xs font-semibold text-foreground"
								>
									{f}
								</th>
							))}
							<th className="p-2 text-center text-xs font-semibold tracking-wide text-primary uppercase">
								Σ
							</th>
						</tr>
					</thead>
					<tbody>
						{grid.levels.map((level, li) => (
							<tr key={level} className="border-t border-border">
								<th
									scope="row"
									data-testid={`v2-grille-rowhead-${level}`}
									className="p-2 text-left font-mono text-xs font-medium text-foreground"
								>
									{level}
								</th>
								{grid.facets.map((facet, fi) => {
									const cell = grid.cells[li][fi];
									const active =
										selected?.level === level && selected?.facet === facet;
									return (
										<td key={facet} className="p-1 text-center">
											<button
												type="button"
												data-testid={`v2-grille-cell-${level}-${facet}`}
												data-count={cell.count}
												onClick={() => setSelected({ level, facet })}
												className={[
													"min-w-[2.25rem] rounded-md px-2 py-1.5 font-mono text-xs transition-colors",
													active
														? "bg-primary text-primary-foreground"
														: cell.count > 0
															? "bg-muted text-foreground hover:bg-primary/15"
															: "text-muted-foreground/40 hover:bg-muted",
												].join(" ")}
											>
												{cell.count}
											</button>
										</td>
									);
								})}
								<td
									data-testid={`v2-grille-rowtotal-${level}`}
									className="p-2 text-center font-mono text-xs font-semibold text-primary"
								>
									{grid.rowTotals[li]}
								</td>
							</tr>
						))}
						<tr className="border-t-2 border-primary/40">
							<th
								scope="row"
								className="p-2 text-left text-xs font-semibold tracking-wide text-primary uppercase"
							>
								Σ
							</th>
							{grid.facets.map((facet, fi) => (
								<td
									key={facet}
									data-testid={`v2-grille-coltotal-${facet}`}
									className="p-2 text-center font-mono text-xs font-semibold text-primary"
								>
									{grid.colTotals[fi]}
								</td>
							))}
							<td
								data-testid="v2-grille-grandtotal"
								className="p-2 text-center font-mono text-xs font-bold text-primary"
							>
								{grid.total}
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			{selectedCell && (
				<div
					data-testid="v2-grille-cell-detail"
					className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
				>
					<p className="text-foreground">
						<span className="font-mono text-primary">
							{selectedCell.level} × {selectedCell.facet}
						</span>{" "}
						—{" "}
						<span data-testid="v2-grille-cell-count">{selectedCell.count}</span>{" "}
						{t.specsHere}
					</p>
					{selectedCell.count === 0 ? (
						<p
							data-testid="v2-grille-cell-empty"
							className="text-xs text-muted-foreground"
						>
							{t.emptyCell}
						</p>
					) : (
						<ul
							data-testid="v2-grille-cell-list"
							className="flex flex-wrap gap-2"
						>
							{selectedCell.kernelIds.map((id) => (
								<li key={id}>
									<Link
										href={`/v2/anatomie/${id}`}
										data-testid={`v2-grille-spec-${id}`}
										className="inline-flex rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
									>
										{id} →
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
