"use client";

import { useMemo, useState } from "react";
import {
	type AxisLight,
	axisLights,
	type ConscienceCase,
	caseReport,
	type DecisionCardV2,
	decisionCardsV2,
	type Light,
	type PairLight,
	pairLights,
	type V2Option,
} from "@/lib/v2/conscience";

/**
 * WB2-20 — l'AFFICHAGE + la RÉCONCILIATION de la conscience (l'agrégateur déterministe), client-only
 * (le twin pur). On compare VOULU / CONSTRUIT / PROUVÉ / AUTORISÉ, on allume un voyant par paire, et chaque
 * divergence produit sa decision card actionnable (accept / amend / reject / defer).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on CHOISIT un kernel (un bouton par cas) puis on RÉCONCILIE (v2-conscience-reconcile) ;
 *   - le rapport montre le verdict global, le tally, les quatre voyants d'axe, et les paires par axe ;
 *   - chaque divergence rend sa decision card, chaque card a ses options accept/amend/reject/defer ;
 *   - on RÉINITIALISE (v2-conscience-reset).
 * Tout délégué au twin pur lib/v2/conscience.ts (caseReport / axisLights / pairLights / decisionCardsV2).
 *
 * LE MUR (§2) : la conscience LIT des verdicts sourcés ; elle n'écrit AUCUNE vérité. Le rapport et les
 * cards sont des PROJECTIONS. Agir sur une option PROPOSE → /goal (idée → miroir → /goal → approbation),
 * jamais une écriture directe — chaque bouton d'option déclare data-proposes pour le marquer.
 */

type Strings = Record<string, string>;

const LIGHT_DOT: Record<Light, string> = {
	green: "🟢",
	red: "🔴",
	amber: "🟡",
};
const LIGHT_CLASS: Record<Light, string> = {
	green: "border-emerald-500/40 bg-emerald-500/5 text-emerald-600",
	red: "border-destructive/40 bg-destructive/5 text-destructive",
	amber: "border-amber-500/40 bg-amber-500/5 text-amber-600",
};

const AXIS_KEY: Record<string, { label: string; hint: string }> = {
	voulu: { label: "axisVoulu", hint: "axisVouluHint" },
	construit: { label: "axisConstruit", hint: "axisConstruitHint" },
	prouvé: { label: "axisProuve", hint: "axisProuveHint" },
	autorisé: { label: "axisAutorise", hint: "axisAutoriseHint" },
};

const OPT_KEY: Record<V2Option, string> = {
	accept: "optAccept",
	amend: "optAmend",
	reject: "optReject",
	defer: "optDefer",
};

export function ConscienceClient({
	cases,
	t,
}: {
	cases: readonly ConscienceCase[];
	t: Strings;
}) {
	// le cas SÉLECTIONNÉ (le kernel choisi) ; null = rien réconcilié encore.
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = useMemo(
		() => cases.find((c) => c.id === selectedId) ?? null,
		[cases, selectedId],
	);

	// le rapport du twin pur (réutilise reconcile FK09) + ses projections V2.
	const report = useMemo(
		() => (selected ? caseReport(selected) : null),
		[selected],
	);
	const lights: AxisLight[] = useMemo(
		() => (report ? axisLights(report) : []),
		[report],
	);
	const pairs: PairLight[] = useMemo(
		() => (report ? pairLights(report) : []),
		[report],
	);
	const cards: DecisionCardV2[] = useMemo(
		() => (report ? decisionCardsV2(report) : []),
		[report],
	);

	return (
		<div data-testid="v2-conscience-view" className="space-y-6">
			{/* CHOISIR un kernel + RÉCONCILIER (l'action de l'écran) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.samplesHeading}
				</h3>
				<p className="text-xs text-muted-foreground">{t.samplesHint}</p>
				<div
					data-testid="v2-conscience-samples"
					className="flex flex-col gap-2"
				>
					{cases.map((c) => (
						<button
							key={c.id}
							type="button"
							data-testid={`v2-conscience-sample-${c.id}`}
							onClick={() => setSelectedId(c.id)}
							className={[
								"rounded-lg border px-4 py-2 text-left text-sm transition-colors",
								selectedId === c.id
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-card text-foreground hover:bg-muted",
							].join(" ")}
						>
							{t[c.labelKey] ?? c.id}
						</button>
					))}
				</div>
				<div className="flex flex-wrap gap-2 pt-1">
					<span
						data-testid="v2-conscience-reconcile"
						aria-disabled={selected === null}
						className={[
							"inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium",
							selected === null
								? "bg-muted text-muted-foreground"
								: "bg-primary text-primary-foreground",
						].join(" ")}
					>
						{t.reconcileBtn}
					</span>
					<button
						type="button"
						data-testid="v2-conscience-reset"
						onClick={() => setSelectedId(null)}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
					>
						{t.resetBtn}
					</button>
				</div>
			</div>

			{report === null ? (
				<p
					data-testid="v2-conscience-empty"
					className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
				>
					{t.pairsEmpty}
				</p>
			) : (
				<div data-testid="v2-conscience-report" className="space-y-6">
					{/* le VERDICT GLOBAL + le tally + le voyant déterminisme */}
					<div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-6 py-4">
						<span
							data-testid="v2-conscience-verdict"
							data-verdict={report.verdict}
							className={[
								"inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold",
								report.verdict === "drift"
									? "border-destructive/40 bg-destructive/5 text-destructive"
									: "border-emerald-500/40 bg-emerald-500/5 text-emerald-600",
							].join(" ")}
						>
							{report.verdict === "drift"
								? `🔴 ${t.verdictDrift}`
								: `🟢 ${t.verdictAligned}`}
						</span>
						<span className="text-xs text-muted-foreground">
							{t.verdictLabel}
						</span>
						<div className="ml-auto flex flex-wrap gap-4 text-sm">
							<Stat
								testid="v2-conscience-tally-green"
								value={report.green}
								label={t.tallyGreen}
							/>
							<Stat
								testid="v2-conscience-tally-red"
								value={report.red}
								label={t.tallyRed}
							/>
							<Stat
								testid="v2-conscience-tally-advisory"
								value={report.advisory}
								label={t.tallyAdvisory}
							/>
						</div>
						<span
							data-testid="v2-conscience-determinism"
							data-deterministic="true"
							className="rounded border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
						>
							✓ {t.determinismLabel}
						</span>
					</div>

					{/* les QUATRE VOYANTS D'AXE (voulu · construit · prouvé · autorisé) */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.axesHeading}
						</h3>
						<div
							data-testid="v2-conscience-axes"
							className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
						>
							{lights.map((l) => {
								const k = AXIS_KEY[l.axis];
								return (
									<div
										key={l.axis}
										data-testid={`v2-conscience-axis-${l.axis}`}
										data-light={l.light}
										className={[
											"rounded-xl border px-4 py-3 space-y-1",
											LIGHT_CLASS[l.light],
										].join(" ")}
									>
										<div className="flex items-center justify-between">
											<span className="text-sm font-semibold">
												{t[k?.label ?? ""] ?? l.axis}
											</span>
											<span className="text-lg">{LIGHT_DOT[l.light]}</span>
										</div>
										<p className="text-[11px] text-muted-foreground">
											{t[k?.hint ?? ""] ?? ""}
										</p>
										<p className="font-mono text-[10px] text-muted-foreground">
											🟢{l.green} 🔴{l.red} 🟡{l.amber}
										</p>
									</div>
								);
							})}
						</div>
					</div>

					{/* les PAIRES par axe (chaque verdict, son juge-source, son voyant) */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.pairsHeading}
						</h3>
						<div className="overflow-x-auto rounded-xl border border-border">
							<table className="w-full text-left text-xs">
								<thead className="bg-muted/50 text-muted-foreground">
									<tr>
										<th className="px-3 py-2 font-medium">{t.colVerdict}</th>
										<th className="px-3 py-2 font-medium">{t.colAxis}</th>
										<th className="px-3 py-2 font-medium">{t.colSource}</th>
										<th className="px-3 py-2 font-medium">{t.colFacet}</th>
										<th className="px-3 py-2 font-medium">{t.colPair}</th>
										<th className="px-3 py-2 font-medium">{t.colDetail}</th>
									</tr>
								</thead>
								<tbody data-testid="v2-conscience-pairs">
									{pairs.map((pl) => (
										<tr
											key={`${pl.pair.source}-${pl.pair.facet}-${pl.pair.pair}-${pl.pair.verdict}-${pl.pair.detail ?? ""}`}
											data-testid="v2-conscience-pair"
											data-source={pl.pair.source}
											data-facet={pl.pair.facet}
											data-axis={pl.axis}
											data-light={pl.light}
											className="border-t border-border"
										>
											<td className="px-3 py-2">{LIGHT_DOT[pl.light]}</td>
											<td className="px-3 py-2 text-muted-foreground">
												{t[AXIS_KEY[pl.axis]?.label ?? ""] ?? pl.axis}
											</td>
											<td className="px-3 py-2 font-mono text-foreground">
												{pl.pair.source}
											</td>
											<td className="px-3 py-2 font-mono">{pl.pair.facet}</td>
											<td className="px-3 py-2 font-mono">{pl.pair.pair}</td>
											<td className="px-3 py-2 text-muted-foreground">
												{pl.pair.detail ?? ""}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					{/* les DECISION CARDS (une par divergence) + leurs options accept/amend/reject/defer */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.cardsHeading}
						</h3>
						{cards.length === 0 ? (
							<p
								data-testid="v2-conscience-no-cards"
								className="rounded-xl border border-border bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600"
							>
								{t.noCards}
							</p>
						) : (
							<div data-testid="v2-conscience-cards" className="space-y-3">
								{cards.map((c) => (
									<div
										key={c.card.id}
										data-testid="v2-conscience-card"
										data-source={c.card.source}
										data-facet={c.card.facet}
										data-axis={c.axis}
										data-advisory={c.card.advisory ? "true" : "false"}
										className={[
											"rounded-xl border px-5 py-4 space-y-3",
											c.card.advisory
												? "border-amber-500/40 bg-amber-500/5"
												: "border-destructive/40 bg-destructive/5",
										].join(" ")}
									>
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-mono text-xs font-semibold text-foreground">
												{c.card.id}
											</span>
											<span className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
												{c.card.source} · {c.card.facet} · {c.card.pair}
											</span>
											{c.card.advisory && (
												<span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
													{t.cardAdvisory}
												</span>
											)}
										</div>
										{c.card.detail && (
											<p className="text-sm text-foreground">{c.card.detail}</p>
										)}
										<div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
											<span data-testid="v2-conscience-card-blast">
												{t.cardBlast} :{" "}
												<span className="font-mono text-foreground">
													{c.card.blast}
												</span>
											</span>
											{c.card.drift && (
												<span>
													{t.cardDrift} :{" "}
													<span className="font-mono text-foreground">
														{c.card.drift}
													</span>
												</span>
											)}
										</div>
										{/* les OPTIONS accept/amend/reject/defer — chacune PROPOSE → /goal */}
										<div className="space-y-1.5">
											<p className="text-[11px] font-medium text-muted-foreground">
												{t.cardOptions}
											</p>
											<div
												data-testid="v2-conscience-card-options"
												className="flex flex-wrap gap-2"
											>
												{c.options.map((o) => {
													const recommended = o === c.recommendation;
													return (
														<button
															key={o}
															type="button"
															data-testid={`v2-conscience-card-option-${o}`}
															data-option={o}
															data-proposes="goal"
															data-recommended={recommended}
															className={[
																"inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
																recommended
																	? "border-primary bg-primary/10 text-primary"
																	: "border-border bg-card text-foreground hover:bg-muted",
															].join(" ")}
														>
															{t[OPT_KEY[o]] ?? o}
															{recommended ? " ★" : ""}
														</button>
													);
												})}
											</div>
											<p className="text-[10px] text-muted-foreground">
												{t.cardRecommendation} :{" "}
												<span className="font-medium text-foreground">
													{t[OPT_KEY[c.recommendation]] ?? c.recommendation}
												</span>
											</p>
										</div>
									</div>
								))}
							</div>
						)}
						<p
							data-testid="v2-conscience-propose-note"
							className="text-[11px] leading-relaxed text-muted-foreground"
						>
							{t.proposeNote}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}

function Stat({
	value,
	label,
	testid,
}: {
	value: number;
	label: string;
	testid: string;
}) {
	return (
		<div data-testid={testid} className="flex items-baseline gap-1.5">
			<span className="font-mono font-semibold text-foreground">{value}</span>
			<span className="text-xs text-muted-foreground">{label}</span>
		</div>
	);
}
