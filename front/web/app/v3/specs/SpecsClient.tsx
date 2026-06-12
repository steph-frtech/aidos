"use client";

import { Fragment, useMemo, useState } from "react";
import type { MirrorForm } from "@/lib/besoin-completeness";
import { SOURCE_ORDER } from "@/lib/besoin-grammar";
import { FACET_NAME, FACETS, type FacetLetter } from "@/lib/grid";
import { gridOf, type SpecRow, specsOf } from "@/lib/v3/specs";
import type { Strings } from "../friendly";
import { useV3Session } from "../V3Session";

/**
 * /v3/specs — LA LENTILLE SPÉCIFICATIONS (ADR 0062) : LA GRILLE niveau × facette en
 * haut (les 7 niveaux SOURCE_ORDER × les 8 facettes — chaque case COMPTE les specs du
 * twin specsOf/gridOf, comptes conservés), la LISTE en bas (une ligne par spec : badge
 * de statut amical, intention, coordonnée, scénario replié).
 *
 * « Quand le chat propose un changement, je VOIS dans la grille les impacts » : les
 * cases touchées par le DERNIER tour (turns[dernier].impacts type idee/kernel, mappés
 * vers leur SpecRow) s'allument en ambre (data-impacted="true"). Cliquer une case
 * FILTRE la liste — « contrôler, voir les scénarios ».
 *
 * DÉTERMINISME-FIRST (§6/§8) : tout est PROJETÉ du rejeu (specsOf, gridOf — purs,
 * comptes conservés), jamais stocké ici. LE MUR (§2) : lecture seule, aucune écriture.
 */

/** La clé i18n du libellé amical par niveau (réutilise les clés du parcours). */
const LEVEL_KEYS: Record<string, string> = {
	product: "levelProduct",
	journey: "levelJourney",
	view: "levelView",
	control: "levelControl",
	action: "levelAction",
	operation: "levelOperation",
	entity: "levelEntity",
};

/** Le libellé AMICAL de la forme de miroir attendue (clé i18n) — jeu clos (EL10). */
const MIRROR_KEYS: Record<MirrorForm, string> = {
	gherkin_n0: "specsMirrorGherkin",
	property_n1: "specsMirrorProperty",
	fixture_n2: "specsMirrorFixture",
	screen_fixture: "specsMirrorScreen",
};

/** Le filtre de statut de la liste — jeu clos, déclaré. */
type StatusFilter = "tous" | "idees" | "versions" | "deployees";

const FILTERS: readonly { id: StatusFilter; labelKey: string }[] = [
	{ id: "tous", labelKey: "specsFilterAll" },
	{ id: "idees", labelKey: "specsFilterIdeas" },
	{ id: "versions", labelKey: "specsFilterVersions" },
	{ id: "deployees", labelKey: "specsFilterDeployed" },
];

/**
 * Une spec passe-t-elle le filtre de statut ? « Déployée » = le statut est un
 * barreau de l'ÉCHELLE COURANTE (state.ladder — paramétrable, jamais une
 * constante de code). PURE & TOTALE.
 */
function matchesFilter(
	row: SpecRow,
	filter: StatusFilter,
	ladder: readonly string[],
): boolean {
	if (filter === "tous") return true;
	if (filter === "idees") return row.status === "idee";
	if (filter === "versions") return row.status === "kernel";
	return ladder.includes(row.status);
}

/** Le badge de statut AMICAL : 💡 idée · 🧊 version figée · 🚀 <env>. */
function badge(t: Strings, status: SpecRow["status"]): string {
	if (status === "idee") return t.specsBadgeIdee;
	if (status === "kernel") return t.specsBadgeKernel;
	return (t.specsBadgeEnv ?? "🚀 %env%").replace("%env%", status);
}

/** Une ligne de la liste : badge, intention, coordonnée, scénario replié. */
function SpecRowCard({ row, t }: { row: SpecRow; t: Strings }) {
	return (
		<div
			data-testid="v3-specs-row"
			data-status={row.status}
			className="space-y-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
		>
			{/* · le statut amical + l'intention */}
			<div className="flex flex-wrap items-center gap-2">
				<span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
					{badge(t, row.status)}
				</span>
				<p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
					{row.intent}
				</p>
			</div>

			{/* · la coordonnée entière : niveau amical, facette, échelle */}
			<div className="flex flex-wrap gap-1.5">
				<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
					{t[LEVEL_KEYS[row.level]] ?? row.level}
				</span>
				<span
					title={FACET_NAME[row.facet as FacetLetter] ?? row.facet}
					className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
				>
					{row.facet}
				</span>
				<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
					{row.scale}
				</span>
			</div>

			{/* · le SCÉNARIO replié — la forme de preuve attendue + le miroir auto + la version */}
			<details
				data-testid="v3-specs-scenario"
				className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
			>
				<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
					{t.specsScenarioLabel}
				</summary>
				<div className="mt-2 space-y-1.5 text-xs">
					<p className="text-muted-foreground">
						<span className="font-semibold">{t.specsScenarioFormLabel}</span> :{" "}
						{row.mirrorForm !== null
							? (t[MIRROR_KEYS[row.mirrorForm]] ?? row.mirrorForm)
							: t.specsMirrorNone}
					</p>
					{row.version !== null && (
						<>
							<p className="text-muted-foreground">
								<span className="font-semibold">
									{t.specsScenarioAutoLabel}
								</span>{" "}
								:{" "}
								<span className="font-mono text-[11px]">
									auto : {row.intent}
								</span>
							</p>
							<p className="text-muted-foreground">
								<span className="font-semibold">{t.specsVersionLabel}</span> :{" "}
								<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
									{row.version}
								</span>
							</p>
						</>
					)}
				</div>
			</details>
		</div>
	);
}

export function SpecsClient() {
	const { state, turns, strings: t } = useV3Session();
	const [cell, setCell] = useState<{ level: string; facet: string } | null>(
		null,
	);
	const [filter, setFilter] = useState<StatusFilter>("tous");

	// LA PROJECTION PURE : les specs + la grille (comptes conservés) — jamais stockées.
	const rows = useMemo(() => specsOf(state), [state]);
	const counts = useMemo(() => {
		const m = new Map<string, number>();
		for (const c of gridOf(rows))
			m.set(`${c.level}×${c.facet}`, c.specIds.length);
		return m;
	}, [rows]);

	// LES IMPACTS DU DERNIER TOUR : chaque cible idee/kernel mappée à sa SpecRow → sa
	// case — « quand le chat propose un changement, je VOIS dans la grille les impacts ».
	const impacted = useMemo(() => {
		const set = new Set<string>();
		const last = turns.length > 0 ? turns[turns.length - 1] : undefined;
		if (last === undefined) return set;
		for (const imp of last.impacts) {
			const row =
				imp.type === "idee"
					? rows.find((r) => r.id === imp.cible)
					: imp.type === "kernel"
						? rows.find((r) => r.version === imp.cible)
						: undefined;
			if (row !== undefined) set.add(`${row.level}×${row.facet}`);
		}
		return set;
	}, [turns, rows]);

	// La liste visible : le filtre de statut × la case sélectionnée (si une l'est).
	const visible = rows.filter(
		(r) =>
			matchesFilter(r, filter, state.ladder) &&
			(cell === null || (r.level === cell.level && r.facet === cell.facet)),
	);

	return (
		<div className="space-y-8">
			{/* ── LA GRILLE niveau × facette ── */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{t.specsGridHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.specsGridHint}
					</p>
				</div>
				<div data-testid="v3-specs-grid" className="overflow-x-auto pb-1">
					<div className="grid min-w-[34rem] grid-cols-[6.5rem_repeat(8,minmax(2.25rem,1fr))] gap-1">
						{/* · l'en-tête : le coin vide + les 8 lettres de facette */}
						<div />
						{FACETS.map((f) => (
							<div
								key={f}
								title={FACET_NAME[f]}
								className="pb-0.5 text-center font-mono text-[11px] font-semibold text-muted-foreground"
							>
								{f}
							</div>
						))}
						{/* · une ligne par niveau de la verticale (SOURCE_ORDER, 7 barreaux) */}
						{SOURCE_ORDER.map((level) => (
							<Fragment key={level}>
								<div className="flex items-center text-[11px] font-medium text-muted-foreground">
									{t[LEVEL_KEYS[level]] ?? level}
								</div>
								{FACETS.map((facet) => {
									const key = `${level}×${facet}`;
									const count = counts.get(key) ?? 0;
									const isImpacted = impacted.has(key);
									const isSelected =
										cell !== null &&
										cell.level === level &&
										cell.facet === facet;
									return (
										<button
											key={facet}
											type="button"
											data-testid="v3-specs-cell"
											data-level={level}
											data-facet={facet}
											data-impacted={isImpacted ? "true" : undefined}
											onClick={() =>
												setCell(isSelected ? null : { level, facet })
											}
											className={[
												"flex h-9 items-center justify-center rounded-md border text-sm tabular-nums transition-colors",
												count === 0
													? "border-border/60 text-muted-foreground/40"
													: "border-border bg-card font-medium text-foreground hover:border-primary/40 hover:bg-primary/5",
												isImpacted ? "ring-2 ring-amber-500/70" : "",
												isSelected
													? "border-primary bg-primary/10 text-primary"
													: "",
											]
												.filter((c) => c !== "")
												.join(" ")}
										>
											{count}
										</button>
									);
								})}
							</Fragment>
						))}
					</div>
				</div>
				{/* · la case sélectionnée filtre la liste — effaçable d'un clic */}
				{cell !== null && (
					<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<span>
							{(t.specsCellSelected ?? "")
								.replace("%level%", t[LEVEL_KEYS[cell.level]] ?? cell.level)
								.replace("%facet%", cell.facet)}
						</span>
						<button
							type="button"
							data-testid="v3-specs-clear"
							onClick={() => setCell(null)}
							className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
						>
							{t.specsCellClear}
						</button>
					</div>
				)}
			</section>

			{/* ── LA LISTE des spécifications ── */}
			<section className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-base font-semibold text-foreground">
						{t.specsListHeading}
					</h2>
					{/* · la barre de filtre par statut (jeu clos) */}
					<div className="flex flex-wrap gap-1.5">
						{FILTERS.map((f) => (
							<button
								key={f.id}
								type="button"
								data-testid="v3-specs-filter"
								data-filter={f.id}
								aria-pressed={filter === f.id}
								onClick={() => setFilter(f.id)}
								className={[
									"rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
									filter === f.id
										? "border-primary/40 bg-primary/10 text-primary"
										: "border-border bg-muted/40 text-foreground hover:border-primary/40 hover:bg-primary/5",
								].join(" ")}
							>
								{t[f.labelKey]}
							</button>
						))}
					</div>
				</div>
				<div data-testid="v3-specs-list" className="space-y-2">
					{rows.length === 0 ? (
						<p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
							{t.specsEmpty}
						</p>
					) : visible.length === 0 ? (
						<p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
							{t.specsEmptyFiltered}
						</p>
					) : (
						visible.map((row) => <SpecRowCard key={row.id} row={row} t={t} />)
					)}
				</div>
			</section>
		</div>
	);
}
