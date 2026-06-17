"use client";

import { useState } from "react";
import { FACETS } from "@/lib/facets";
import type { Source } from "@/lib/gateway-sdk";
import type { Grid, GridCell } from "@/lib/v2/grid";

/**
 * GrilleClient — LA GRILLE niveau × facette (FKE-1.4 « les deux axes ») portée EN PROPRE dans le
 * shell V3 (parcours « Comprendre », ADR 0060). La donnée — la matrice + les Σ comptées — vient du
 * MOTEUR Go LIVE par la passerelle (le serveur MCP `grid`, dispatché : grid.Build est autoritatif),
 * lue côté serveur dans actions.ts (`gridLive` → `readVia(scope, "grid_build", …)`) et passée ici en
 * props. Ce composant ne RÉIMPLÉMENTE aucune logique : il REND la matrice que le moteur calcule.
 *
 * S59 CUTOVER (ADR 0092 — le moteur Go est l'UNIQUE source vivante). Avant, cette lentille composait
 * la grille depuis le TWIN PUR lib/v2/grid (buildGrid) directement — le twin ÉTAIT la source. Le
 * cutover route la lecture par le moteur Go via la passerelle ; lib/v2/grid reste UNIQUEMENT le repli
 * démo déterministe (lib/v2/grid-data, source:"live"|"demo"). La §2 ne couvre que les vraies
 * logiques client (éditeurs live, aperçu optimiste, extracteur d'AST) — JAMAIS un calcul pur que le
 * moteur fait : composer la grille EN était un, donc un twin flippé.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on lit le total + les sommes Σ par ligne / par colonne (COHÉRENTES : Σ = total) ;
 *   - on SÉLECTIONNE une cellule (niveau, facette) → le panneau détail affiche SES kernels/specs ;
 *   - une cellule vide reste légale (zéro spec) — jamais un lien mort.
 *
 * DÉTERMINISME-FIRST : composer la grille est PUR & TOTAL (mêmes coordonnées → même matrice, Σ
 * comptées, jamais estimées) — c'est pourquoi c'est le moteur (code), jamais un agent. Ce composant
 * ne fait que du RENDU ; il ne juge rien.
 *
 * LE MUR (§2) : projection de LECTURE below-the-line — aucune écriture kernel/mirrors/fitness. Geler
 * une vérité passe par idée → miroir → /goal → approbation, jamais depuis cet écran.
 */

interface Labels {
	total: string;
	levelAxis: string;
	facetAxis: string;
	specsHere: string;
	emptyCell: string;
	cellHeading: string;
	cellHint: string;
	noSelection: string;
	sourceLabel: string;
	sourceLive: string;
	sourceDemo: string;
	sourceTitle: string;
	wallNote: string;
}

/** Le libellé d'une facette (FKE-1.3), pour l'infobulle d'en-tête de colonne. */
const FACET_NAME = new Map(FACETS.map((f) => [f.letter, f.name] as const));

export function GrilleClient({
	grid,
	source,
	labels,
}: {
	grid: Grid | null;
	source: Source;
	labels: Labels;
}) {
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
		<div className="space-y-6" data-testid="v3-grille-lens">
			{/* LA MATRICE niveau × facette : la table + les sommes Σ + sa source honnête (live|démo). */}
			<section
				data-testid="v3-grille-grid"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p
						data-testid="v3-grille-total"
						className="font-mono text-xs text-muted-foreground"
					>
						{labels.total} : {grid.total}
					</p>
					<span
						data-testid="v3-grille-source"
						data-source={source}
						title={labels.sourceTitle}
						className={[
							"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
							source === "live"
								? "bg-primary/10 text-primary"
								: "bg-muted text-muted-foreground",
						].join(" ")}
					>
						<span
							aria-hidden="true"
							className={[
								"size-1.5 rounded-full",
								source === "live" ? "bg-primary" : "bg-muted-foreground",
							].join(" ")}
						/>
						{labels.sourceLabel}:{" "}
						{source === "live" ? labels.sourceLive : labels.sourceDemo}
					</span>
				</div>

				<div className="overflow-x-auto rounded-lg border border-border bg-background p-2">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr>
								<th className="p-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{labels.levelAxis} \ {labels.facetAxis}
								</th>
								{grid.facets.map((f) => (
									<th
										key={f}
										title={FACET_NAME.get(f as never) ?? f}
										data-testid={`v3-grille-colhead-${f}`}
										className="p-2 text-center font-mono text-xs font-semibold text-foreground"
									>
										{f}
									</th>
								))}
								<th className="p-2 text-center text-xs font-semibold uppercase tracking-wide text-primary">
									Σ
								</th>
							</tr>
						</thead>
						<tbody>
							{grid.levels.map((level, li) => (
								<tr key={level} className="border-t border-border">
									<th
										scope="row"
										data-testid={`v3-grille-rowhead-${level}`}
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
													data-testid={`v3-grille-cell-${level}-${facet}`}
													data-count={cell.count}
													aria-pressed={active}
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
										data-testid={`v3-grille-rowtotal-${level}`}
										className="p-2 text-center font-mono text-xs font-semibold text-primary"
									>
										{grid.rowTotals[li]}
									</td>
								</tr>
							))}
							<tr className="border-t-2 border-primary/40">
								<th
									scope="row"
									className="p-2 text-left text-xs font-semibold uppercase tracking-wide text-primary"
								>
									Σ
								</th>
								{grid.facets.map((facet, fi) => (
									<td
										key={facet}
										data-testid={`v3-grille-coltotal-${facet}`}
										className="p-2 text-center font-mono text-xs font-semibold text-primary"
									>
										{grid.colTotals[fi]}
									</td>
								))}
								<td
									data-testid="v3-grille-grandtotal"
									className="p-2 text-center font-mono text-xs font-bold text-primary"
								>
									{grid.total}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			{/* LE DÉTAIL d'une cellule : ses kernels/specs (ou « cellule vide légale »). */}
			<section
				aria-label={labels.cellHeading}
				data-testid="v3-grille-cell-section"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.cellHeading}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.cellHint}
				</p>
				{selectedCell === null ? (
					<p
						data-testid="v3-grille-no-selection"
						className="text-sm text-muted-foreground"
					>
						{labels.noSelection}
					</p>
				) : (
					<div
						data-testid="v3-grille-cell-detail"
						className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
					>
						<p className="text-foreground">
							<span className="font-mono text-primary">
								{selectedCell.level} × {selectedCell.facet}
							</span>{" "}
							—{" "}
							<span data-testid="v3-grille-cell-count">
								{selectedCell.count}
							</span>{" "}
							{labels.specsHere}
						</p>
						{selectedCell.count === 0 ? (
							<p
								data-testid="v3-grille-cell-empty"
								className="text-xs text-muted-foreground"
							>
								{labels.emptyCell}
							</p>
						) : (
							<ul
								data-testid="v3-grille-cell-list"
								className="flex flex-wrap gap-2"
							>
								{selectedCell.kernelIds.map((id) => (
									<li key={id}>
										<span
											data-testid={`v3-grille-spec-${id}`}
											className="inline-flex rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-medium text-primary-foreground"
										>
											{id}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</section>

			{/* LE MUR (§2) : la grille est une projection de lecture — aucune écriture-vérité. */}
			<section
				data-testid="v3-grille-wall-section"
				className="rounded-xl border border-primary/30 bg-primary/5 p-5"
			>
				<p className="text-sm text-primary" data-testid="v3-grille-wall-note">
					{labels.wallNote}
				</p>
			</section>
		</div>
	);
}
