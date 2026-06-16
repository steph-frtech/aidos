"use client";

import { useMemo, useState } from "react";
import {
	type BenchRow,
	CANONICAL_CANDIDATES,
	CANONICAL_SPEC,
	kindLabelKey,
	type ModelDiff,
	projectBenchRow,
	roleLabelKey,
} from "@/lib/v3/bench-view";
import type { Strings } from "../friendly";
import { useV3Session } from "../V3Session";

/**
 * /v3/bench — LE BENCH DE COMPLÉTUDE (DG06, ADR 0079 / 0088) : sur la spec canonique
 * hermétique, le `match%` (barre de progression), les TYPES de requirement manquants
 * (propositions de trous — jamais des vérités), et le différentiel par modèle (single
 * vs A∪B) — le GAIN du bench différentiel multi-LLM (ADR 0079). Tout est PROJETÉ du
 * twin pur projectBenchRow/deriveBenchReport/deriveModelDiffs — byte-cohérent avec le
 * Go back/runtime/requirementbench, miroir fast-check bench-view.test.ts. Aucune
 * logique re-implémentée ici.
 *
 * UI-COMPLETENESS (§6/§7) : le bouton « Lancer le bench » ENVOIE le geste canonique
 * au chat via send() (le tour repasse par le réducteur, la loi — exactement comme les
 * autres lentilles). Le bouton n'est jamais headless. Un indicateur local confirme
 * l'envoi.
 *
 * DÉTERMINISME-FIRST (§6/§8) : le run est PUR/HERMÉTIQUE (aucun réseau, l'IA reste
 * côté Go derrière le port). LE MUR (§2) : lecture + projection + un geste de chat —
 * aucune écriture de vérité. Les trous proposés passent par idea → mirror → /goal.
 */

// ─── Sous-composants ─────────────────────────────────────────────────────────────────

/** La barre de match% — tokens ADR 0010 (primary pour le rempli, muted pour le fond). */
function MatchBar({ pct }: { pct: number }) {
	const pctPx = Math.round(pct * 100);
	return (
		<div className="flex items-center gap-2">
			<div
				role="progressbar"
				aria-valuenow={pctPx}
				aria-valuemin={0}
				aria-valuemax={100}
				className="h-2 w-32 overflow-hidden rounded-full bg-muted"
			>
				<div
					className={[
						"h-full rounded-full transition-all",
						pct >= 1.0
							? "bg-primary"
							: pct >= 0.5
								? "bg-amber-500"
								: "bg-destructive",
					].join(" ")}
					style={{ width: `${pctPx}%` }}
				/>
			</div>
			<span className="font-mono text-sm tabular-nums text-foreground">
				{pctPx}%
			</span>
		</div>
	);
}

/** Un badge de type de requirement (présent vs manquant). */
function KindBadge({
	kind,
	missing,
	t,
}: {
	kind: string;
	missing: boolean;
	t: Strings;
}) {
	const label =
		t[kindLabelKey(kind as Parameters<typeof kindLabelKey>[0])] ?? kind;
	return (
		<span
			data-testid={missing ? "v3-bench-missing-kind" : "v3-bench-present-kind"}
			data-kind={kind}
			className={[
				"inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium",
				missing
					? "border-destructive/40 bg-destructive/10 text-destructive"
					: "border-primary/40 bg-primary/10 text-primary",
			].join(" ")}
		>
			{label}
		</span>
	);
}

/** Le différentiel d'UN modèle. */
function ModelDiffRow({ diff, t }: { diff: ModelDiff; t: Strings }) {
	const label = t[roleLabelKey(diff.role)] ?? diff.role;
	const pct = Math.round(diff.ownMatchPct * 100);
	return (
		<tr
			data-testid="v3-bench-model-diff"
			data-role={diff.role}
			className="border-t border-border"
		>
			<td className="px-3 py-2 text-sm font-medium text-foreground">{label}</td>
			<td className="px-3 py-2">
				<MatchBar pct={diff.ownMatchPct} />
			</td>
			<td className="px-3 py-2">
				<span className="font-mono text-sm tabular-nums text-foreground">
					{pct}%
				</span>
			</td>
			<td className="px-3 py-2">
				{diff.missedByThisModel.length === 0 ? (
					<span className="text-[11px] text-muted-foreground">—</span>
				) : (
					<span
						data-testid="v3-bench-model-missed"
						className="font-mono text-[11px] text-destructive"
					>
						{diff.missedByThisModel.join(", ")}
					</span>
				)}
			</td>
		</tr>
	);
}

// ─── Le composant principal ───────────────────────────────────────────────────────────

export function BenchClient() {
	const { strings: t, send } = useV3Session();

	// L'indicateur local de bench lancé (le geste a été ENVOYÉ au chat).
	const [launched, setLaunched] = useState(false);

	// LA PROJECTION PURE : le row canonique — jamais stocké, re-dérivé à chaque render.
	const row: BenchRow = useMemo(
		() => projectBenchRow(CANONICAL_SPEC, CANONICAL_CANDIDATES),
		[],
	);

	// Le geste canonique envoyé au chat (ui-completeness) — le tour repasse par le réducteur.
	const onRun = (): void => {
		void send(`lance le bench de complétude sur la spec ${CANONICAL_SPEC.id}`);
		setLaunched(true);
	};

	return (
		<div className="space-y-8">
			{/* ── LE RÉSULTAT DE LA SPEC CANONIQUE ── */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{t.benchSpecHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.benchSpecHint}
					</p>
				</div>
				<div
					data-testid="v3-bench-spec"
					data-spec-id={row.specId}
					className="space-y-4 rounded-xl border border-border bg-card px-4 py-4 shadow-sm"
				>
					{/* En-tête : spec ID + match% */}
					<div className="flex flex-wrap items-center gap-4">
						<span className="font-mono text-sm font-semibold text-foreground">
							{row.specId}
						</span>
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">
								{t.benchMatchLabel}
							</span>
							<MatchBar pct={row.report.matchPct} />
						</div>
						<span
							data-testid="v3-bench-match-pct"
							data-pct={row.report.matchPct.toFixed(2)}
							className="font-mono text-xs text-muted-foreground"
						>
							{row.report.presentCount}/{row.report.expectedCount}{" "}
							{t.benchMatchCountLabel}
						</span>
					</div>

					{/* Les types MANQUANTS (trous proposés) */}
					{row.report.missingTypes.length > 0 ? (
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground">
								{t.benchMissingHeading}
							</p>
							<ul
								data-testid="v3-bench-missing-list"
								className="flex flex-wrap gap-1.5"
							>
								{row.report.missingTypes.map((kind) => (
									<li key={kind}>
										<KindBadge kind={kind} missing t={t} />
									</li>
								))}
							</ul>
						</div>
					) : (
						<p
							data-testid="v3-bench-no-missing"
							className="text-xs font-medium text-primary"
						>
							{t.benchNoMissing}
						</p>
					)}

					{/* Les types PRÉSENTS */}
					{row.report.presentTypes.length > 0 && (
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground">
								{t.benchPresentHeading}
							</p>
							<ul className="flex flex-wrap gap-1.5">
								{row.report.presentTypes.map((kind) => (
									<li key={kind}>
										<KindBadge kind={kind} missing={false} t={t} />
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</section>

			{/* ── LE DIFFÉRENTIEL PAR MODÈLE ── */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{t.benchDiffHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.benchDiffHint}
					</p>
				</div>
				<div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
					<table
						data-testid="v3-bench-diff-table"
						className="w-full min-w-[36rem] text-left text-sm"
					>
						<thead>
							<tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
								<th className="px-3 py-2 font-medium">{t.benchColModel}</th>
								<th className="px-3 py-2 font-medium">{t.benchColMatch}</th>
								<th className="px-3 py-2 font-medium">{t.benchColPct}</th>
								<th className="px-3 py-2 font-medium">{t.benchColMissed}</th>
							</tr>
						</thead>
						<tbody>
							{row.diffs.map((diff) => (
								<ModelDiffRow key={diff.role} diff={diff} t={t} />
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* ── LE BOUTON (ui-completeness §6/§7) ── */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{t.benchRunHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.benchRunHint}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-testid="v3-bench-run"
						onClick={onRun}
						className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
					>
						{t.benchRunBtn}
					</button>
					{launched && (
						<span
							data-testid="v3-bench-launched"
							role="status"
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
						>
							{t.benchRunSent}
						</span>
					)}
				</div>
			</section>

			{/* ── LE MUR : la note d'honnêteté ── */}
			<p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
				{t.benchWallNote}
			</p>
		</div>
	);
}
