"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FACETS } from "@/lib/facets";
import {
	buildFederation,
	type Cell,
	cellContracts,
	type Federation,
	findCell,
	internalComposes,
	syntheticFederation,
	withContracts,
} from "@/lib/v2/cellules";
import { type Link as KLink, refString } from "@/lib/v2/links";

/**
 * WB2-09 — LES CELLULES (bounded contexts §49) + Pact, client-only.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   1) CHOISIR une cellule (clic) DESCEND (drill-down) vers sa grille niveau × facette (rollup Σ),
 *      ses liens internes `composes ↓` et ses contrats `depends_on`/Pact → autres cellules ;
 *   2) CLIQUER une case (niveau, facette) OUVRE SES specs (la liste des kernels → leur anatomie) ;
 *   3) les sommes Σ par cellule / ligne / colonne sont affichées et COHÉRENTES (Σ = total cellule).
 * Le MUR (CLAUDE.md §2) : aucune écriture-vérité ; la fédération est une projection de lecture ; la
 * promotion d'un contrat reste idée → miroir → /goal.
 *
 * DÉTERMINISME-FIRST : la donnée vient du twin pur (lib/v2/cellules) — la fédération, les rollups,
 * le classement interne/contrat sont COMPUTÉS, jamais ici. Le composant ne fait que rendre.
 */

type Strings = Record<string, string>;

/** Le libellé d'une facette (FKE-1.3), pour l'infobulle d'en-tête de colonne. */
const FACET_NAME = new Map(FACETS.map((f) => [f.letter, f.name] as const));

export function CellulesClient({ t }: { t: Strings }) {
	// La donnée vient du twin PUR (déterministe) — la fédération canonique des cellules + contrats.
	const { federation, links } = useMemo(() => {
		const { kernels, links } = syntheticFederation();
		const res = buildFederation(kernels);
		const fed: Federation | null = res.ok
			? withContracts(res.federation, links)
			: null;
		return { federation: fed, links };
	}, []);

	const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
	const [selectedCase, setSelectedCase] = useState<{
		level: string;
		facet: string;
	} | null>(null);

	if (!federation) return null;

	const cell: Cell | null = selectedCellId
		? findCell(federation, selectedCellId)
		: null;

	const internal: readonly KLink[] = cell
		? internalComposes(cell.id, cell.kernelIds, links)
		: [];
	const contracts = cell ? cellContracts(federation, cell.id) : [];

	const selectedCaseCell =
		cell && selectedCase
			? (cell.grid.cells[
					cell.grid.levels.indexOf(selectedCase.level as never)
				]?.[cell.grid.facets.indexOf(selectedCase.facet)] ?? null)
			: null;

	return (
		<div className="space-y-6">
			{/* Le résumé de la fédération : nombre de cellules, kernels, contrats, total. */}
			<div
				data-testid="v2-cellules-summary"
				data-cell-count={federation.cells.length}
				data-contract-count={federation.contracts.length}
				data-total={federation.total}
				className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
			>
				<span className="font-medium text-foreground">
					{federation.cells.length} {t.cells}
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{federation.total} {t.kernels}
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{federation.contracts.length} {t.contracts}
				</span>
			</div>

			{/* La FÉDÉRATION : choisir une cellule (drill-down). Action-capable. */}
			<section className="space-y-3">
				<h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
					{t.federationHeading}
				</h2>
				<fieldset
					data-testid="v2-cellules-picker"
					aria-label={t.selectCell}
					className="flex flex-wrap gap-2 border-0 p-0"
				>
					{federation.cells.map((c) => (
						<button
							key={c.id}
							type="button"
							data-testid={`v2-cellules-cell-${c.id}`}
							data-count={c.count}
							aria-pressed={selectedCellId === c.id}
							onClick={() => {
								setSelectedCellId(c.id);
								setSelectedCase(null);
							}}
							className={[
								"rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
								selectedCellId === c.id
									? "border-primary bg-primary/10 text-primary"
									: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
							].join(" ")}
						>
							{c.id}{" "}
							<span className="font-mono text-xs opacity-60">({c.count})</span>
						</button>
					))}
				</fieldset>
			</section>

			{/* LE DRILL-DOWN d'une cellule : sa grille, ses liens internes, ses contrats. */}
			{cell && (
				<section
					data-testid="v2-cellules-drilldown"
					data-cell-id={cell.id}
					className="space-y-5 rounded-xl border border-border bg-card p-4"
				>
					<h3 className="text-base font-bold text-foreground">
						{t.cellHeading} :{" "}
						<span data-testid="v2-cellules-drill-id" className="font-mono">
							{cell.id}
						</span>{" "}
						<span className="font-mono text-xs text-muted-foreground">
							({cell.count} {t.kernels})
						</span>
					</h3>

					{/* La GRILLE niveau × facette de la cellule (rollup Σ — réutilise WB2-05). */}
					<div className="space-y-2">
						<h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{t.gridHeading}
						</h4>
						<div className="overflow-x-auto rounded-lg border border-border bg-background p-2">
							<table className="w-full border-collapse text-sm">
								<thead>
									<tr>
										<th className="p-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
											{t.levelAxis} \ {t.facetAxis}
										</th>
										{cell.grid.facets.map((f) => (
											<th
												key={f}
												title={FACET_NAME.get(f as never) ?? f}
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
									{cell.grid.levels.map((level, li) => (
										<tr key={level} className="border-t border-border">
											<th
												scope="row"
												className="p-2 text-left font-mono text-xs font-medium text-foreground"
											>
												{level}
											</th>
											{cell.grid.facets.map((facet, fi) => {
												const gc = cell.grid.cells[li][fi];
												const active =
													selectedCase?.level === level &&
													selectedCase?.facet === facet;
												return (
													<td key={facet} className="p-1 text-center">
														<button
															type="button"
															data-testid={`v2-cellules-case-${level}-${facet}`}
															data-count={gc.count}
															aria-label={t.openSpecs}
															onClick={() => setSelectedCase({ level, facet })}
															className={[
																"min-w-[2.25rem] rounded-md px-2 py-1.5 font-mono text-xs transition-colors",
																active
																	? "bg-primary text-primary-foreground"
																	: gc.count > 0
																		? "bg-muted text-foreground hover:bg-primary/15"
																		: "text-muted-foreground/40 hover:bg-muted",
															].join(" ")}
														>
															{gc.count}
														</button>
													</td>
												);
											})}
											<td className="p-2 text-center font-mono text-xs font-semibold text-primary">
												{cell.grid.rowTotals[li]}
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
										{cell.grid.facets.map((facet, fi) => (
											<td
												key={facet}
												className="p-2 text-center font-mono text-xs font-semibold text-primary"
											>
												{cell.grid.colTotals[fi]}
											</td>
										))}
										<td
											data-testid="v2-cellules-grid-total"
											className="p-2 text-center font-mono text-xs font-bold text-primary"
										>
											{cell.grid.total}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					{/* Clic case → SES specs (la liste des kernels → leur anatomie). Action-capable. */}
					{selectedCaseCell && (
						<div
							data-testid="v2-cellules-case-detail"
							className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
						>
							<p className="text-foreground">
								<span className="font-mono text-primary">
									{selectedCaseCell.level} × {selectedCaseCell.facet}
								</span>{" "}
								—{" "}
								<span data-testid="v2-cellules-case-count">
									{selectedCaseCell.count}
								</span>{" "}
								{t.specsHere}
							</p>
							{selectedCaseCell.count === 0 ? (
								<p
									data-testid="v2-cellules-case-empty"
									className="text-xs text-muted-foreground"
								>
									{t.emptyCell}
								</p>
							) : (
								<ul
									data-testid="v2-cellules-case-list"
									className="flex flex-wrap gap-2"
								>
									{selectedCaseCell.kernelIds.map((id) => (
										<li key={id}>
											<Link
												href={`/v2/anatomie/${id}`}
												data-testid={`v2-cellules-spec-${id}`}
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

					{/* Les LIENS INTERNES composes ↓ (la verticale §23 dedans). */}
					<div className="space-y-2">
						<h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{t.internalHeading}
						</h4>
						{internal.length === 0 ? (
							<p
								data-testid="v2-cellules-no-internal"
								className="text-xs text-muted-foreground"
							>
								{t.noInternal}
							</p>
						) : (
							<ul
								data-testid="v2-cellules-internal"
								className="space-y-1 font-mono text-xs"
							>
								{internal.map((l) => (
									<li
										key={`${refString(l.from)}->${refString(l.to)}`}
										className="text-foreground"
									>
										<span className="text-muted-foreground">
											{refString(l.from)}
										</span>{" "}
										<span className="text-primary">composes ↓</span>{" "}
										<span className="text-muted-foreground">
											{refString(l.to)}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>

					{/* Les CONTRATS depends_on/Pact → autres cellules (§49). */}
					<div className="space-y-2">
						<h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{t.contractsHeading}
						</h4>
						{contracts.length === 0 ? (
							<p
								data-testid="v2-cellules-no-contracts"
								className="text-xs text-muted-foreground"
							>
								{t.noContracts}
							</p>
						) : (
							<ul
								data-testid="v2-cellules-contracts"
								className="space-y-1 font-mono text-xs"
							>
								{contracts.map((c) => {
									const outgoing = c.fromCell === cell.id;
									return (
										<li
											key={`${c.fromCell}->${c.toCell}:${refString(c.from)}->${refString(c.to)}`}
											data-testid={`v2-cellules-contract-${c.fromCell}-${c.toCell}`}
											className="text-foreground"
										>
											<span
												className={
													outgoing ? "text-primary" : "text-muted-foreground"
												}
											>
												{outgoing ? t.contractOut : t.contractIn}
											</span>{" "}
											<span className="text-muted-foreground">
												{c.fromCell}
											</span>
											<span className="text-primary"> ⇄ </span>
											<span className="text-muted-foreground">{c.toCell}</span>{" "}
											<span className="opacity-60">
												({refString(c.from)} → {refString(c.to)})
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</section>
			)}
		</div>
	);
}
