// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then), la langue ubiquitaire KRD.
"use client";

import { useMachine } from "@xstate/react";
import { useId } from "react";
import { type GrillIssue, MAX_SCENARIOS } from "@/lib/v2/grill";
import { GRILL_STEPS, grillWizardMachine } from "./GrillWizardMachine";

/**
 * WB2-10 — le WIZARD /grill, client-only (XState + RHF/Zod via le twin + stepper shadcn).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — il CONDUIT le
 * geste grill-with-docs : capturer une intention, borner ses scénarios (≤ 5), AFFÛTER le langage,
 * et PROPOSER une intention affûtée + des ADRs candidats (le seul geste de cet étage). Chaque
 * champ patche la machine ; AFFÛTER appelle le twin pur (runGrill) ; aucune écriture-vérité (le
 * mur, §2).
 *
 * DÉTERMINISME-FIRST : le diagnostic, l'affûtage et le verdict sont DÉLÉGUÉS au twin lib/v2/grill.ts ;
 * XState n'orchestre que l'état d'écran.
 */

type Strings = Record<string, string>;

const STATE_LABELS: Record<(typeof GRILL_STEPS)[number], string> = {
	intention: "stepIntention",
	scenarios: "stepScenarios",
	revue: "stepReview",
	affutee: "stepSharpened",
};

const ISSUE_KEYS: Record<GrillIssue, string> = {
	intent_too_short: "errIntent",
	no_scenario: "errNoScenario",
	too_many_scenarios: "errTooMany",
	scenario_incomplete: "errIncomplete",
};

export function GrillWizardClient({ t }: { t: Strings }) {
	const [state, send] = useMachine(grillWizardMachine);
	const step = String(state.value) as (typeof GRILL_STEPS)[number];
	const { draft, intention, issues } = state.context;
	const intentId = useId();

	return (
		<div data-testid="v2-grill-wizard" className="space-y-6">
			{/* le stepper — états VISIBLES (XState) */}
			<ol
				data-testid="v2-grill-stepper"
				data-state={step}
				className="flex flex-wrap gap-2 text-xs"
			>
				{GRILL_STEPS.map((s) => (
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
				data-testid="v2-grill-state"
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
							data-testid="v2-grill-intent"
							value={draft.intent}
							onChange={(e) =>
								send({ type: "SET_INTENT", intent: e.target.value })
							}
							placeholder={t.intentPlaceholder}
							className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
						/>
						<p className="text-xs text-muted-foreground">{t.intentHint}</p>
					</div>
				)}

				{step === "scenarios" && (
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<p className="text-sm font-medium text-foreground">
								{t.scenariosLabel}
							</p>
							<span
								data-testid="v2-grill-scenario-count"
								className="font-mono text-xs text-muted-foreground"
							>
								{draft.scenarios.length} / {MAX_SCENARIOS} {t.scenarioCount}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">{t.scenariosHint}</p>
						<ul className="space-y-4">
							{draft.scenarios.map((sc, i) => (
								<li
									// biome-ignore lint/suspicious/noArrayIndexKey: les scénarios sont positionnels (pas d'id stable au brouillon)
									key={i}
									data-testid={`v2-grill-scenario-${i}`}
									className="space-y-2 rounded-lg border border-border bg-background p-3"
								>
									<input
										data-testid={`v2-grill-given-${i}`}
										value={sc.given}
										placeholder={t.givenLabel}
										onChange={(e) =>
											send({
												type: "PATCH_SCENARIO",
												index: i,
												patch: { given: e.target.value },
											})
										}
										className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
									/>
									<input
										data-testid={`v2-grill-when-${i}`}
										value={sc.when}
										placeholder={t.whenLabel}
										onChange={(e) =>
											send({
												type: "PATCH_SCENARIO",
												index: i,
												patch: { when: e.target.value },
											})
										}
										className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
									/>
									<input
										data-testid={`v2-grill-then-${i}`}
										value={sc.then}
										placeholder={t.thenLabel}
										onChange={(e) =>
											send({
												type: "PATCH_SCENARIO",
												index: i,
												patch: { then: e.target.value },
											})
										}
										className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
									/>
									<button
										type="button"
										data-testid={`v2-grill-remove-${i}`}
										onClick={() => send({ type: "REMOVE_SCENARIO", index: i })}
										className="text-xs font-medium text-destructive hover:underline"
									>
										{t.removeScenario}
									</button>
								</li>
							))}
						</ul>
						<button
							type="button"
							data-testid="v2-grill-add-scenario"
							onClick={() => send({ type: "ADD_SCENARIO" })}
							className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
						>
							{t.addScenario}
						</button>
					</div>
				)}

				{step === "revue" && (
					<dl data-testid="v2-grill-review" className="space-y-3 text-sm">
						<div>
							<dt className="text-muted-foreground">{t.reviewIntent}</dt>
							<dd className="text-foreground">{draft.intent}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t.reviewScenarios}</dt>
							<dd className="space-y-1 text-foreground">
								{draft.scenarios.map((sc, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: positionnel
									<p key={i} className="font-mono text-xs">
										{sc.given} → {sc.when} → {sc.then}
									</p>
								))}
							</dd>
						</div>
						{issues.length > 0 && (
							<ul
								data-testid="v2-grill-errors"
								className="space-y-1 text-destructive"
							>
								{issues.map((e) => (
									<li key={e}>{t[ISSUE_KEYS[e]] ?? e}</li>
								))}
							</ul>
						)}
					</dl>
				)}

				{step === "affutee" && intention && (
					<div
						data-testid="v2-grill-sharpened"
						data-verdict={intention.verdict}
						className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
					>
						<h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
							{t.sharpenedHeading}
						</h3>
						<div>
							<p className="text-muted-foreground text-xs">
								{t.sharpenedIntentHeading}
							</p>
							<p
								data-testid="v2-grill-sharpened-intent"
								className="text-foreground"
							>
								{intention.sharpenedIntent}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">
								{t.verdictHeading}
							</p>
							<p
								data-testid="v2-grill-verdict"
								className="font-mono text-foreground"
							>
								{intention.verdict === "sharp"
									? t.verdictSharp
									: t.verdictFuzzy}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">{t.adrsHeading}</p>
							{intention.candidateAdrs.length === 0 ? (
								<p className="text-sm text-muted-foreground">{t.noAdrs}</p>
							) : (
								<ul data-testid="v2-grill-adrs" className="space-y-1">
									{intention.candidateAdrs.map((adr) => (
										<li
											key={adr.slug}
											data-testid={`v2-grill-adr-${adr.slug}`}
											className="text-sm text-foreground"
										>
											<span className="font-mono text-xs text-muted-foreground">
												{adr.slug}
											</span>{" "}
											· {adr.title}
										</li>
									))}
								</ul>
							)}
						</div>
						<div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground text-xs">
									{t.docSeedHeading}
								</dt>
								<dd
									data-testid="v2-grill-doc-seed"
									className="font-mono text-xs text-foreground"
								>
									{intention.docSeed.conceptPath}
									<br />
									{intention.docSeed.internalsPath}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">{t.idHeading}</dt>
								<dd
									data-testid="v2-grill-hash"
									className="font-mono text-foreground"
								>
									{intention.id}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t.hasMirrorLabel}
								</dt>
								<dd
									data-testid="v2-grill-has-mirror"
									className="text-foreground"
								>
									{String(intention.hasMirror)} ({t.no})
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">
									{t.wroteKernelLabel}
								</dt>
								<dd
									data-testid="v2-grill-wrote-kernel"
									className="text-foreground"
								>
									{String(intention.wroteKernel)} ({t.no})
								</dd>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">{t.sharpenedNote}</p>
					</div>
				)}
			</div>

			{/* les commandes de navigation — transitions XState bound à des contrôles */}
			<div className="flex flex-wrap gap-3">
				{step !== "intention" && step !== "affutee" && (
					<button
						type="button"
						data-testid="v2-grill-back"
						onClick={() => send({ type: "PRECEDENT" })}
						className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
					>
						{t.back}
					</button>
				)}
				{(step === "intention" || step === "scenarios") && (
					<button
						type="button"
						data-testid="v2-grill-next"
						onClick={() => send({ type: "SUIVANT" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.next}
					</button>
				)}
				{step === "revue" && (
					<button
						type="button"
						data-testid="v2-grill-sharpen"
						onClick={() => send({ type: "AFFUTER" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.sharpen}
					</button>
				)}
				{step === "affutee" && (
					<button
						type="button"
						data-testid="v2-grill-restart"
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
