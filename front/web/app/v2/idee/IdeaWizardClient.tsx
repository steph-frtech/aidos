"use client";

import { useMachine } from "@xstate/react";
import { useId } from "react";
import {
	type Besoin,
	type BesoinError,
	FACET_LETTERS,
	FRACTAL_SCALES,
	PROVENANCES,
	selectableLevels,
} from "@/lib/v2/idea";
import { ideaWizardMachine, WIZARD_STEPS } from "./IdeaWizardMachine";

/**
 * WB2-03 — le WIZARD d'idée, client-only (XState + RHF/Zod via le twin + stepper shadcn).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — il CAPTURE
 * un besoin et le PROPOSE comme idée (le seul geste de cet étage). Chaque champ patche la
 * machine ; PROPOSER appelle le twin pur (composeIdea) ; aucune écriture-vérité (le mur, §2).
 *
 * DÉTERMINISME-FIRST : la validation et la composition sont DÉLÉGUÉES au twin lib/v2/idea.ts ;
 * XState n'orchestre que l'état d'écran. Les jeux clos (niveaux, facettes, échelles, provenances)
 * viennent des sources, jamais de chaînes en dur.
 */

type Strings = Record<string, string>;

const STATE_LABELS: Record<(typeof WIZARD_STEPS)[number], string> = {
	intention: "stepIntent",
	coordonnee: "stepCoordinate",
	provenance: "stepProvenance",
	revue: "stepReview",
	proposee: "stepProposed",
};

const ERROR_KEYS: Record<BesoinError, string> = {
	intent_too_short: "errIntent",
	level_unknown: "errLevel",
	facet_unknown: "errFacet",
	scale_unknown: "errScale",
	provenance_unknown: "errProvenance",
};

const SCALE_KEYS: Record<string, string> = {
	cellule: "scaleCellule",
	kernel: "scaleKernel",
	feuille: "scaleFeuille",
};

const PROVENANCE_KEYS: Record<string, string> = {
	humain: "provenanceHumain",
	incident: "provenanceIncident",
};

export function IdeaWizardClient({ t }: { t: Strings }) {
	const [state, send] = useMachine(ideaWizardMachine);
	const step = String(state.value) as (typeof WIZARD_STEPS)[number];
	const { besoin, idea, errors } = state.context;
	const intentId = useId();
	const levelId = useId();
	const facetId = useId();
	const scaleId = useId();

	const patch = (p: Partial<Besoin>) => send({ type: "PATCH", patch: p });

	return (
		<div data-testid="v2-idee-wizard" className="space-y-6">
			{/* le stepper — états VISIBLES (XState) */}
			<ol
				data-testid="v2-idee-stepper"
				data-state={step}
				className="flex flex-wrap gap-2 text-xs"
			>
				{WIZARD_STEPS.map((s) => (
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
				data-testid="v2-idee-state"
				className="font-mono text-xs text-muted-foreground"
			>
				{t.stateLabel} : {step}
			</p>

			<div className="rounded-xl border border-border bg-card p-6">
				{step === "intention" && (
					<div className="space-y-3">
						<label
							htmlFor={intentId}
							className="block text-sm font-medium text-foreground"
						>
							{t.intentLabel}
						</label>
						<textarea
							id={intentId}
							data-testid="v2-idee-intent"
							value={besoin.intent}
							onChange={(e) => patch({ intent: e.target.value })}
							placeholder={t.intentPlaceholder}
							className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
						/>
						<p className="text-xs text-muted-foreground">{t.intentHint}</p>
					</div>
				)}

				{step === "coordonnee" && (
					<div className="space-y-4">
						<div className="space-y-2">
							<label
								htmlFor={levelId}
								className="block text-sm font-medium text-foreground"
							>
								{t.levelLabel}
							</label>
							<select
								id={levelId}
								data-testid="v2-idee-level"
								value={besoin.level}
								onChange={(e) => patch({ level: e.target.value })}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
							>
								<option value="">—</option>
								{selectableLevels().map((l) => (
									<option key={l} value={l}>
										{l}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<label
								htmlFor={facetId}
								className="block text-sm font-medium text-foreground"
							>
								{t.facetLabel}
							</label>
							<select
								id={facetId}
								data-testid="v2-idee-facet"
								value={besoin.facet}
								onChange={(e) => patch({ facet: e.target.value })}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
							>
								<option value="">—</option>
								{FACET_LETTERS.map((f) => (
									<option key={f} value={f}>
										{f}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<label
								htmlFor={scaleId}
								className="block text-sm font-medium text-foreground"
							>
								{t.scaleLabel}
							</label>
							<select
								id={scaleId}
								data-testid="v2-idee-scale"
								value={besoin.scale}
								onChange={(e) => patch({ scale: e.target.value })}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
							>
								<option value="">—</option>
								{FRACTAL_SCALES.map((s) => (
									<option key={s} value={s}>
										{t[SCALE_KEYS[s]] ?? s}
									</option>
								))}
							</select>
						</div>
					</div>
				)}

				{step === "provenance" && (
					<fieldset className="space-y-3">
						<legend className="text-sm font-medium text-foreground">
							{t.provenanceLabel}
						</legend>
						{PROVENANCES.map((p) => (
							<label
								key={p}
								data-testid={`v2-idee-provenance-${p}`}
								className="flex items-center gap-2 text-sm text-foreground"
							>
								<input
									type="radio"
									name="provenance"
									value={p}
									checked={besoin.provenance === p}
									onChange={() => patch({ provenance: p })}
								/>
								{t[PROVENANCE_KEYS[p]] ?? p}
							</label>
						))}
					</fieldset>
				)}

				{step === "revue" && (
					<dl
						data-testid="v2-idee-review"
						className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"
					>
						<div>
							<dt className="text-muted-foreground">{t.reviewHeading}</dt>
							<dd className="text-foreground">{besoin.intent}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t.coordinateHeading}</dt>
							<dd className="font-mono text-foreground">
								{besoin.level} × {besoin.facet} × {besoin.scale}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t.provenanceLabel}</dt>
							<dd className="text-foreground">
								{t[PROVENANCE_KEYS[besoin.provenance]] ?? besoin.provenance}
							</dd>
						</div>
						{errors.length > 0 && (
							<ul
								data-testid="v2-idee-errors"
								className="col-span-full space-y-1 text-destructive"
							>
								{errors.map((e) => (
									<li key={e}>{t[ERROR_KEYS[e as BesoinError]] ?? e}</li>
								))}
							</ul>
						)}
					</dl>
				)}

				{step === "proposee" && idea && (
					<div
						data-testid="v2-idee-proposed"
						className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
					>
						<h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
							{t.proposedHeading}
						</h3>
						<p
							data-testid="v2-idee-proposed-intent"
							className="text-foreground"
						>
							{idea.intent}
						</p>
						<dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t.ideaId}</dt>
								<dd
									data-testid="v2-idee-hash"
									className="font-mono text-foreground"
								>
									{idea.id}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.coordinateHeading}</dt>
								<dd className="font-mono text-foreground">
									{idea.coordinate.level} × {idea.coordinate.facet} ×{" "}
									{idea.coordinate.scale}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.mirrorFormHeading}</dt>
								<dd
									data-testid="v2-idee-mirror-form"
									className="font-mono text-foreground"
								>
									{idea.expectedMirrorForm ?? "—"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.hasMirrorLabel}</dt>
								<dd
									data-testid="v2-idee-has-mirror"
									className="text-foreground"
								>
									{String(idea.hasMirror)} ({t.no})
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.wroteKernelLabel}</dt>
								<dd
									data-testid="v2-idee-wrote-kernel"
									className="text-foreground"
								>
									{String(idea.wroteKernel)} ({t.no})
								</dd>
							</div>
						</dl>
						<p className="text-xs text-muted-foreground">{t.proposedNote}</p>
					</div>
				)}
			</div>

			{/* les commandes de navigation — transitions XState bound à des contrôles */}
			<div className="flex flex-wrap gap-3">
				{step !== "intention" && step !== "proposee" && (
					<button
						type="button"
						data-testid="v2-idee-back"
						onClick={() => send({ type: "PRECEDENT" })}
						className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
					>
						{t.back}
					</button>
				)}
				{(step === "intention" ||
					step === "coordonnee" ||
					step === "provenance") && (
					<button
						type="button"
						data-testid="v2-idee-next"
						onClick={() => send({ type: "SUIVANT" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.next}
					</button>
				)}
				{step === "revue" && (
					<button
						type="button"
						data-testid="v2-idee-propose"
						onClick={() => send({ type: "PROPOSER" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.propose}
					</button>
				)}
				{step === "proposee" && (
					<button
						type="button"
						data-testid="v2-idee-restart"
						onClick={() => send({ type: "RECOMMENCER" })}
						className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
					>
						{t.restart}
					</button>
				)}
			</div>
		</div>
	);
}
