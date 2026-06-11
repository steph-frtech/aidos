"use client";

import { useMachine } from "@xstate/react";
import { useId } from "react";
import { type MirrorForm, mirrorForms } from "@/lib/besoin-completeness";
import type { PromoteError } from "@/lib/v2/goal";
import { GOAL_STEPS, goalWizardMachine } from "./GoalWizardMachine";

/**
 * WB2-11 — le WIZARD /goal, client-only (XState + le twin pur + stepper shadcn).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — il CONDUIT la
 * transition idée → ÉCRIRE LE MIROIR → /goal → GEL :
 *   - ÉCRIRE LE MIROIR (forme + texte) → HasMirror false → true (le mur franchi) ;
 *   - OUVRIR LE /goal → l'idée descend à sa coordonnée + reçoit une version gelée (ChangeSet DRAFT) ;
 *   - TENTER UNE ÉCRITURE DIRECTE → REFUSÉE (un BlockReason actionnable — le mur, §2).
 * Chaque champ patche la machine ; les gestes appellent le twin pur ; aucune écriture-vérité.
 *
 * DÉTERMINISME-FIRST : la validation, la promotion et le refus-du-mur sont DÉLÉGUÉS au twin
 * lib/v2/goal.ts ; XState n'orchestre que l'état d'écran.
 */

type Strings = Record<string, string>;

const STATE_LABELS: Record<(typeof GOAL_STEPS)[number], string> = {
	idea: "stepIdea",
	mirror_written: "stepMirror",
	frozen: "stepFrozen",
};

const ISSUE_KEYS: Record<PromoteError, string> = {
	mirror_form_unknown: "errFormUnknown",
	mirror_text_empty: "errTextEmpty",
	mirror_form_mismatch: "errMismatch",
};

export function GoalWizardClient({ t }: { t: Strings }) {
	const [state, send] = useMachine(goalWizardMachine);
	const step = String(state.value) as (typeof GOAL_STEPS)[number];
	const { idea, mirror, proposed, errors, block } = state.context;
	const textId = useId();
	const formId = useId();

	const coord = `${idea.coordinate.level} × ${idea.coordinate.facet} × ${idea.coordinate.scale}`;

	return (
		<div data-testid="v2-goal-wizard" className="space-y-6">
			{/* le stepper — stades VISIBLES (XState) */}
			<ol
				data-testid="v2-goal-stepper"
				data-state={step}
				className="flex flex-wrap gap-2 text-xs"
			>
				{GOAL_STEPS.map((s) => (
					<li
						key={s}
						data-active={s === step}
						className={
							s === step
								? "rounded-full border border-primary bg-primary/10 px-3 py-1 font-medium text-primary"
								: "rounded-full border border-border bg-muted px-3 py-1 text-muted-foreground"
						}
					>
						{t[STATE_LABELS[s]]}
					</li>
				))}
			</ol>

			<p
				data-testid="v2-goal-state"
				className="font-mono text-xs text-muted-foreground"
			>
				{t.stateLabel} : {step}
			</p>

			{/* L'IDÉE — toujours visible (la provenance de la promotion) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.ideaHeading}
				</h3>
				<div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground text-xs">{t.ideaIntent}</dt>
						<dd data-testid="v2-goal-idea-intent" className="text-foreground">
							{idea.intent}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">
							{t.ideaCoordinate}
						</dt>
						<dd
							data-testid="v2-goal-idea-coordinate"
							className="font-mono text-foreground"
						>
							{coord}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">{t.ideaHasMirror}</dt>
						<dd
							data-testid="v2-goal-idea-has-mirror"
							className="font-mono text-foreground"
						>
							{String(idea.hasMirror)} ({t.no})
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">
							{t.expectedFormLabel}
						</dt>
						<dd className="font-mono text-foreground">
							{idea.expectedMirrorForm ?? "—"}
						</dd>
					</div>
				</div>
			</div>

			{/* ÉTAPE idée → ÉCRIRE LE MIROIR */}
			{step === "idea" && (
				<div className="rounded-xl border border-border bg-card p-6 space-y-4">
					<h3 className="text-sm font-semibold text-foreground">
						{t.mirrorHeading}
					</h3>
					<div className="space-y-2">
						<label
							htmlFor={formId}
							className="block text-sm font-medium text-foreground"
						>
							{t.mirrorFormLabel}
						</label>
						<select
							id={formId}
							data-testid="v2-goal-mirror-form"
							value={mirror.form}
							onChange={(e) =>
								send({ type: "SET_FORM", form: e.target.value as MirrorForm })
							}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
						>
							{mirrorForms().map((f) => (
								<option key={f} value={f}>
									{f}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<label
							htmlFor={textId}
							className="block text-sm font-medium text-foreground"
						>
							{t.mirrorTextLabel}
						</label>
						<textarea
							id={textId}
							data-testid="v2-goal-mirror-text"
							value={mirror.text}
							onChange={(e) =>
								send({ type: "SET_MIRROR_TEXT", text: e.target.value })
							}
							placeholder={t.mirrorTextPlaceholder}
							className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
						/>
						<p className="text-xs text-muted-foreground">{t.mirrorHint}</p>
					</div>
					{errors.length > 0 && (
						<ul
							data-testid="v2-goal-errors"
							className="space-y-1 text-sm text-destructive"
						>
							{errors.map((e) => (
								<li key={e}>{t[ISSUE_KEYS[e]] ?? e}</li>
							))}
						</ul>
					)}
				</div>
			)}

			{/* ÉTAPE mirror_written : le mur franchi, prêt pour /goal */}
			{step === "mirror_written" && (
				<div
					data-testid="v2-goal-mirror-written"
					className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-6 space-y-2"
				>
					<h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
						{t.mirrorHeading} — {t.stepMirror}
					</h3>
					<p className="font-mono text-xs text-foreground">
						{mirror.form} · {mirror.text}
					</p>
					<p
						data-testid="v2-goal-mirror-flipped"
						className="text-sm text-foreground"
					>
						{t.hasMirrorLabel} : false → true
					</p>
				</div>
			)}

			{/* ÉTAPE frozen : le kernel proposé (version gelée + ChangeSet DRAFT) */}
			{step === "frozen" && proposed && (
				<div
					data-testid="v2-goal-frozen"
					className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 space-y-4"
				>
					<h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
						{t.frozenHeading}
					</h3>
					<div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground text-xs">
								{t.versionLabel}
							</dt>
							<dd
								data-testid="v2-goal-version"
								className="font-mono text-foreground"
							>
								{proposed.version}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">
								{t.changeSetLabel} ({t.changeSetStatus})
							</dt>
							<dd
								data-testid="v2-goal-changeset"
								className="font-mono text-foreground"
							>
								{proposed.changeSet.id} · {proposed.changeSet.status}
							</dd>
						</div>
						<div className="sm:col-span-2">
							<dt className="text-muted-foreground text-xs">
								{t.coordinateHeading}
							</dt>
							<dd
								data-testid="v2-goal-frozen-coordinate"
								className="font-mono text-foreground"
							>
								{proposed.coordinate.level} × {proposed.coordinate.facet} ×{" "}
								{proposed.coordinate.scale}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">
								{t.hasMirrorLabel}
							</dt>
							<dd
								data-testid="v2-goal-has-mirror"
								className="font-mono text-foreground"
							>
								{String(proposed.hasMirror)} ({t.yes})
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">
								{t.wroteKernelLabel}
							</dt>
							<dd
								data-testid="v2-goal-wrote-kernel"
								className="font-mono text-foreground"
							>
								{String(proposed.wroteKernel)} ({t.no})
							</dd>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">{t.frozenNote}</p>
				</div>
			)}

			{/* LE MUR : le refus d'une écriture-vérité directe — un COMPORTEMENT ATTENDU, pas une panne.
			    Encadré en ambre (protection), badge « attendu » + une phrase qui lève l'ambiguïté ;
			    le BlockReason actionnable (code + comment-faire) reste affiché. */}
			{block && (
				<div
					data-testid="v2-goal-block"
					className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-6 space-y-3"
				>
					<div className="flex flex-wrap items-center gap-2">
						<span aria-hidden className="text-base">
							🛡️
						</span>
						<h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
							{t.blockHeading}
						</h3>
						<span
							data-testid="v2-goal-block-expected"
							className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
						>
							✓ {t.blockExpected}
						</span>
					</div>
					<p className="text-sm text-foreground">{t.blockIntro}</p>
					<p className="font-mono text-xs text-amber-700 dark:text-amber-400">
						{t.blockCode} : {block.code}
					</p>
					<p className="text-sm text-muted-foreground">{block.explanation}</p>
					<div>
						<p className="text-xs text-muted-foreground">{t.blockFix}</p>
						<ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
							{block.howToFix.map((h) => (
								<li key={h}>{h}</li>
							))}
						</ol>
					</div>
				</div>
			)}

			{/* les commandes — transitions XState bound à des contrôles */}
			<div className="flex flex-wrap gap-3">
				{step === "idea" && (
					<button
						type="button"
						data-testid="v2-goal-write-mirror"
						onClick={() => send({ type: "ECRIRE_MIROIR" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.writeMirror}
					</button>
				)}
				{step === "mirror_written" && (
					<button
						type="button"
						data-testid="v2-goal-open-goal"
						onClick={() => send({ type: "GOAL" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.openGoal}
					</button>
				)}
				{step === "frozen" && (
					<button
						type="button"
						data-testid="v2-goal-restart"
						onClick={() => send({ type: "RECOMMENCER" })}
						className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
					>
						{t.restart}
					</button>
				)}
				{/* Le geste du MUR : DÉMONTRER que tenter une écriture directe est toujours refusée
				    (un comportement attendu, pas une panne) — accent ambre, pas destructive. */}
				<button
					type="button"
					data-testid="v2-goal-direct-write"
					onClick={() => send({ type: "ECRIRE_DIRECT" })}
					className="rounded-md border border-amber-500/40 bg-card px-4 py-2 text-sm text-amber-700 hover:bg-amber-500/5 dark:text-amber-400"
				>
					{t.directWrite}
				</button>
			</div>
		</div>
	);
}
