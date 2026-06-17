"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useV3Session } from "../V3Session";
import {
	gateAction,
	measureAction,
	proposeAction,
	ratchetAction,
} from "./actions";
import {
	GATE_INITIAL,
	type GateView,
	MEASURE_INITIAL,
	type MeasureView,
	PROPOSE_INITIAL,
	type ProposeView,
	RATCHET_INITIAL,
	type RatchetView,
} from "./view";

/**
 * V3ArchFitnessClient — la lentille /v3/arch-fitness rendue action-capable (ui-completeness,
 * CLAUDE.md §7) : le CLIQUET STRUCTUREL (§47, S102) avec quatre contrôles liés au moteur, tous
 * atteignables ET exécutables depuis l'écran V3.
 *
 * Surfaces action-capables (la done-criterion + §47) :
 *  1. MESURER — les quatre métriques 'lower-is-better' de la coupe propre. LECTURE LIVE via la
 *     passerelle (measureAction → readVia(scope, "measure", …)) ; le badge source affiche
 *     « en direct » (moteur Go) ou « démo » (repli déterministe du twin) — jamais une mesure
 *     silencieusement fausse (ADR 0074).
 *  2. CLIQUETER — la coupe propre contre elle-même TIENT (le cliquet tient quand rien ne grimpe).
 *  3. LA PORTE (fault-injection) — injecter une NOUVELLE violation de frontière OU un NOUVEAU cycle
 *     inter-cellule : le cliquet structurel ROUGIT (BRISÉ) et BLOQUE LA COUPE, indépendamment des
 *     miroirs comportementaux verts (la done-criterion).
 *  4. PROPOSER — déplacer la base structurelle LE SEUL MOYEN LÉGAL : un ChangeSet DRAFT (propose →
 *     ChangeSet → approbation). L'écran n'écrit JAMAIS la vérité directement (le mur).
 *
 * Le PROJET ACTIF vient de la SESSION V3 (useV3Session) — la même session rejouable que toutes les
 * lentilles ; à défaut, « shop » (la fédération de démo). DÉTERMINISME-FIRST (§6/§8) : le twin de
 * repli est PUR, jamais un LLM. LE MUR (§2/§9). Thémé (tokens ADR 0010, zéro hex/zinc), bilingue
 * (namespace i18n `archFitness`, FR par défaut, ADR 0011).
 */

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("archFitness");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

function MetricGrid({
	metric,
}: {
	metric: {
		boundaryViolations: number;
		interCellCycles: number;
		interBcEdges: number;
		maxCellComplexity: number;
	};
}) {
	const t = useTranslations("archFitness");
	const cells: Array<[string, number, string]> = [
		["boundary_violations", metric.boundaryViolations, t("mBoundary")],
		["inter_cell_cycles", metric.interCellCycles, t("mCycles")],
		["inter_bc_edges", metric.interBcEdges, t("mEdges")],
		["max_cell_complexity", metric.maxCellComplexity, t("mComplexity")],
	];
	return (
		<dl className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
			{cells.map(([key, value, label]) => (
				<div
					key={key}
					data-testid={`metric-${key}`}
					data-value={String(value)}
					className="rounded-lg border border-border bg-muted/40 p-3"
				>
					<dt className="text-xs text-muted-foreground">{label}</dt>
					<dd className="font-mono text-lg font-semibold text-foreground">
						{value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function VerdictBlock({
	verdict,
}: {
	verdict: NonNullable<RatchetView["verdict"]>;
}) {
	const t = useTranslations("archFitness");
	if (verdict.state === "HELD") {
		return (
			<section
				data-testid="ratchet-verdict"
				data-state="HELD"
				className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-5"
			>
				<h3 className="text-sm font-semibold text-primary">{t("held")}</h3>
				<p className="text-sm text-muted-foreground">{t("heldBody")}</p>
			</section>
		);
	}
	return (
		<section
			data-testid="ratchet-verdict"
			data-state="BROKEN"
			data-code={verdict.block?.code}
			className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
		>
			<h3 className="text-sm font-semibold text-destructive">
				{t("broken")} · {verdict.block?.code}
			</h3>
			<ul className="space-y-1 pt-1" data-testid="climbs">
				{verdict.climbs.map((c) => (
					<li
						key={c.metric}
						data-testid={`climb-${c.metric}`}
						className="font-mono text-xs text-destructive"
					>
						{c.metric}: {c.baseline} → {c.candidate}
					</li>
				))}
			</ul>
			<p className="text-sm leading-relaxed text-muted-foreground">
				{verdict.block?.explanation}
			</p>
			<div className="pt-1">
				<h4 className="text-xs font-semibold uppercase text-muted-foreground">
					{t("howToFixLabel")}
				</h4>
				<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
					{(verdict.block?.howToFix ?? []).map((h) => (
						<li key={h}>{h}</li>
					))}
				</ul>
			</div>
		</section>
	);
}

export function V3ArchFitnessClient() {
	const t = useTranslations("archFitness");
	// LE PROJET ACTIF : la session V3 rejouable — la même que toutes les lentilles V3 ; à défaut,
	// « shop » (la fédération de démo checkout · billing · catalog).
	const { projectId } = useV3Session();
	const project = projectId ?? "shop";

	const [measureState, measureFormAction] = useActionState<
		MeasureView,
		FormData
	>(measureAction, MEASURE_INITIAL);
	const [ratchetState, ratchetFormAction] = useActionState<
		RatchetView,
		FormData
	>(ratchetAction, RATCHET_INITIAL);
	const [gateState, gateFormAction] = useActionState<GateView, FormData>(
		gateAction,
		GATE_INITIAL,
	);
	const [proposeState, proposeFormAction] = useActionState<
		ProposeView,
		FormData
	>(proposeAction, PROPOSE_INITIAL);

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span>{t("activeProjectLabel")}:</span>
				<span
					data-testid="active-project"
					className="rounded-md bg-muted px-2 py-0.5 font-mono text-foreground"
				>
					{projectId ?? t("noProject")}
				</span>
			</div>

			<section
				aria-label={t("tutorialHeading")}
				data-testid="tutorial"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("tutorialHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("tutorialBody")}
				</p>
			</section>

			<section
				data-testid="scenario"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("scenarioHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("scenarioBody")}
				</p>
			</section>

			{/* 1 · Mesurer les métriques arch-fitness de la coupe propre — LECTURE LIVE */}
			<form
				action={measureFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("measureHeading")}
					</h2>
					{measureState.ok && measureState.source ? (
						<span
							data-testid="measure-source"
							data-source={measureState.source}
							className={
								measureState.source === "live"
									? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
									: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
							}
							title={
								measureState.source === "live"
									? t("sourceLiveTitle")
									: t("sourceDemoTitle")
							}
						>
							<span
								aria-hidden="true"
								className={
									measureState.source === "live"
										? "size-1.5 rounded-full bg-primary"
										: "size-1.5 rounded-full bg-muted-foreground"
								}
							/>
							{measureState.source === "live"
								? t("sourceLive")
								: t("sourceDemo")}
						</span>
					) : null}
				</div>
				<input type="hidden" name="projectId" value={project} />
				<Submit label={t("measureLabel")} testid="measure-submit" />
				{measureState.ok && measureState.metric ? (
					<div data-testid="measure-metric">
						<MetricGrid metric={measureState.metric} />
					</div>
				) : null}
			</form>

			{/* 2 · Cliqueter la coupe propre contre elle-même → TENU */}
			<form
				action={ratchetFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("ratchetHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<Submit label={t("ratchetLabel")} testid="ratchet-submit" />
				{ratchetState.ok && ratchetState.verdict ? (
					<VerdictBlock verdict={ratchetState.verdict} />
				) : null}
			</form>

			{/* 3 · La porte : une coupe candidate avec une faute injectée (la done-criterion) */}
			<form
				action={gateFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("gateHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<div className="space-y-1 text-sm">
					<label
						htmlFor="gate-scenario"
						className="block text-muted-foreground"
					>
						{t("scenarioLabel")}
					</label>
					<select
						id="gate-scenario"
						name="scenario"
						data-testid="gate-scenario"
						defaultValue="violation"
						className="block rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="violation">{t("scenarioViolation")}</option>
						<option value="cycle">{t("scenarioCycle")}</option>
						<option value="clean">{t("scenarioClean")}</option>
					</select>
				</div>
				<Submit label={t("gateLabel")} testid="gate-submit" />
				{gateState.ok && gateState.verdict ? (
					<div className="space-y-3">
						{gateState.metric ? <MetricGrid metric={gateState.metric} /> : null}
						<VerdictBlock verdict={gateState.verdict} />
					</div>
				) : null}
			</form>

			{/* 4 · Proposer la base structurelle en ChangeSet DRAFT (le mur) */}
			<form
				action={proposeFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("proposeHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<Submit label={t("proposeLabel")} testid="propose-submit" />
				{proposeState.ok && proposeState.changeset ? (
					<section
						data-testid="proposed-changeset"
						data-status={proposeState.changeset.status}
						className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-5"
					>
						<h3 className="text-sm font-semibold text-primary">
							{t("proposedHeading")} · {proposeState.changeset.status}
						</h3>
						<p className="text-sm text-muted-foreground">
							{proposeState.changeset.label}
						</p>
						<p
							data-testid="proposed-target"
							className="break-all font-mono text-xs text-muted-foreground"
						>
							{proposeState.changeset.specTarget}
						</p>
						<p className="text-xs text-muted-foreground">{t("wallNote")}</p>
					</section>
				) : null}
			</form>
		</div>
	);
}
