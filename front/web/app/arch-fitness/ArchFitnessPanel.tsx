"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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
 * ArchFitnessPanel makes the /arch-fitness route action-capable (ui-completeness, CLAUDE.md §7):
 * the S102 STRUCTURAL RATCHET (§47) has controls bound to the REAL pure twin (lib/arch-fitness),
 * reachable AND executable from the screen.
 *
 * Action-capable surfaces (the done-criterion + §47):
 *  1. MEASURE — the four "lower-is-better" arch-fitness metrics of the clean federation cut.
 *  2. RATCHET — the clean cut against itself HOLDS (the ratchet holds when nothing climbs).
 *  3. GATE (fault-injection) — inject a NEW boundary violation OR a NEW inter-cell cycle: the
 *     structural ratchet REDDENS (BROKEN) and BLOCKS THE CUT, independent of behavioural mirrors
 *     (the done-criterion).
 *  4. PROPOSE — move the structural baseline THE ONLY LEGAL WAY: a DRAFT ChangeSet (propose →
 *     ChangeSet → approval). The screen NEVER writes truth directly (the wall).
 *
 * DETERMINISM-FIRST (§6/§8): the twin is PURE, never an LLM. THE WALL (§2/§9). Themed (ADR 0010),
 * bilingual (ADR 0011).
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
				<h4 className="text-xs font-semibold text-muted-foreground uppercase">
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

export function ArchFitnessPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("archFitness");
	const project = activeProjectId ?? "shop";

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
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

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

			{/* 1 · Measure the clean cut's arch-fitness metrics */}
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

			{/* 2 · Ratchet the clean cut against itself → HELD */}
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

			{/* 3 · Gate a candidate cut with an injected fault (the done-criterion) */}
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

			{/* 4 · Propose the structural baseline as a DRAFT ChangeSet (the wall) */}
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
