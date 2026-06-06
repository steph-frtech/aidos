"use client";

import { useMemo, useState } from "react";
import {
	canDescend,
	type NodeInput,
	shrinkOptionSpace,
	type Verdict,
} from "@/lib/besoin-candescend";
import type { Level } from "@/lib/besoin-grammar";

/**
 * BesoinCanDescendPanel — the action-capable /compound-besoin-candescend panel (EL07). The human
 * EXECUTES the forcing gate FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless capability):
 *  - pick a body fixture, then "Compute the verdict" runs canDescend(node, level, metaComplete) — the
 *    byte-equivalent twin of back/runtime/besoin/candescend.go — showing enough (COMPUTED, never
 *    declared), the missing gates, the carried OpenQuestions (forward deps), and the BlockReasons;
 *  - "Count the shrink" runs shrinkOptionSpace(node, level) — the anti-vacuity count (0 = narrows
 *    nothing → not_enough; > 0 = narrows the lower rung's OptionSpace).
 *
 * Every verdict is COMPUTED by the deterministic twin, never an LLM, never re-implemented here. The
 * screen READS the verdict (it never re-implements the gate). ABOVE the wall: reads only the node
 * body, writes no truth. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	verdictCta: string;
	shrinkCta: string;
	resetCta: string;
	caseLabel: string;
	caseRightSized: string;
	caseVacant: string;
	caseTooMany: string;
	caseMetaIncomplete: string;
	caseForwardDep: string;
	verdictHeading: string;
	enoughTrue: string;
	enoughFalse: string;
	missingHeading: string;
	openQuestionsHeading: string;
	blockReasonsHeading: string;
	shrinkHeading: string;
	shrinkValue: string;
	shrinkZero: string;
	shrinkPositive: string;
	none: string;
	pending: string;
}

type CaseId =
	| "rightSized"
	| "vacant"
	| "tooMany"
	| "metaIncomplete"
	| "forwardDep";

interface Fixture {
	id: CaseId;
	level: Level;
	node: NodeInput;
	metaComplete: boolean;
}

// FIXTURES are the declared body shapes the screen exercises — each a closed, deterministic input to
// the twin (no rng, no clock). They mirror the Go fixture-table cases (candescend_fixture_test.go).
const FIXTURES: Record<CaseId, Fixture> = {
	rightSized: {
		id: "rightSized",
		level: "product",
		node: {
			level: "product",
			body: {
				intent: "suivi de tâches",
				scenarios: ["créer", "cocher"],
				selects: ["onboarding", "core-task"],
			},
			refsTo: ["journey"],
			present: true,
		},
		metaComplete: true,
	},
	vacant: {
		id: "vacant",
		level: "product",
		node: {
			level: "product",
			body: { intent: "suivi de tâches", scenarios: ["créer"], selects: [] },
			refsTo: ["journey"],
			present: true,
		},
		metaComplete: true,
	},
	tooMany: {
		id: "tooMany",
		level: "product",
		node: {
			level: "product",
			body: {
				intent: "x",
				scenarios: ["a", "b", "c", "d", "e", "f"],
				selects: ["onboarding"],
			},
			refsTo: ["journey"],
			present: true,
		},
		metaComplete: true,
	},
	metaIncomplete: {
		id: "metaIncomplete",
		level: "product",
		node: {
			level: "product",
			body: { intent: "x", scenarios: ["créer"], selects: ["onboarding"] },
			refsTo: ["journey"],
			present: true,
		},
		metaComplete: false,
	},
	forwardDep: {
		id: "forwardDep",
		level: "operation",
		node: {
			level: "operation",
			body: {
				steps: ["valider", "persister"],
				fixture: "state→cmd→events",
				selects: ["create"],
			},
			refsTo: [],
			present: true,
		},
		metaComplete: true,
	},
};

export function BesoinCanDescendPanel({ labels }: { labels: Labels }) {
	const caseLabels = useMemo<Record<CaseId, string>>(
		() => ({
			rightSized: labels.caseRightSized,
			vacant: labels.caseVacant,
			tooMany: labels.caseTooMany,
			metaIncomplete: labels.caseMetaIncomplete,
			forwardDep: labels.caseForwardDep,
		}),
		[labels],
	);

	const [choice, setChoice] = useState<CaseId>("rightSized");
	const [verdict, setVerdict] = useState<Verdict | null>(null);
	const [shrink, setShrink] = useState<number | null>(null);

	function runVerdict() {
		const f = FIXTURES[choice];
		setVerdict(canDescend(f.node, f.level, f.metaComplete));
	}

	function runShrink() {
		const f = FIXTURES[choice];
		setShrink(shrinkOptionSpace(f.node, f.level));
	}

	function reset() {
		setVerdict(null);
		setShrink(null);
		setChoice("rightSized");
	}

	return (
		<div className="space-y-8">
			<section className="rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-end gap-4">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.caseLabel}
						</span>
						<select
							data-testid="case-select"
							value={choice}
							onChange={(e) => setChoice(e.target.value as CaseId)}
							className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
						>
							{(Object.keys(FIXTURES) as CaseId[]).map((id) => (
								<option key={id} value={id}>
									{caseLabels[id]}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						data-testid="verdict-cta"
						onClick={runVerdict}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.verdictCta}
					</button>
					<button
						type="button"
						data-testid="shrink-cta"
						onClick={runShrink}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.shrinkCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={reset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
			</section>

			{/* Verdict */}
			<section
				aria-label={labels.verdictHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.verdictHeading}
				</h2>
				{verdict === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="verdict-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-4" data-testid="verdict">
						<p
							data-testid="verdict-enough"
							data-enough={verdict.enough ? "true" : "false"}
							className={
								verdict.enough
									? "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
									: "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
							}
						>
							{verdict.enough ? labels.enoughTrue : labels.enoughFalse}
						</p>

						<div>
							<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{labels.missingHeading}
							</h3>
							<p
								data-testid="verdict-missing"
								className="text-sm text-foreground"
							>
								{verdict.missing.length === 0
									? labels.none
									: verdict.missing.join(", ")}
							</p>
						</div>

						<div>
							<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{labels.openQuestionsHeading}
							</h3>
							{verdict.openQuestions.length === 0 ? (
								<p
									data-testid="verdict-openquestions"
									className="text-sm text-muted-foreground"
								>
									{labels.none}
								</p>
							) : (
								<ul
									data-testid="verdict-openquestions"
									className="list-disc space-y-1 pl-5 text-sm text-foreground"
								>
									{verdict.openQuestions.map((q) => (
										<li key={q}>{q}</li>
									))}
								</ul>
							)}
						</div>

						<div>
							<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{labels.blockReasonsHeading}
							</h3>
							{verdict.blockReasons.length === 0 ? (
								<p
									data-testid="verdict-blockreasons"
									className="text-sm text-muted-foreground"
								>
									{labels.none}
								</p>
							) : (
								<ul data-testid="verdict-blockreasons" className="space-y-2">
									{verdict.blockReasons.map((br) => (
										<li
											key={br.code}
											data-testid={`block-${br.code}`}
											className="rounded-md border border-border bg-muted/40 p-3"
										>
											<p className="font-mono text-xs text-foreground">
												{br.code}
											</p>
											<p className="mt-1 text-sm text-muted-foreground">
												{br.explanation}
											</p>
											<ul className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
												{br.howToFix.map((f) => (
													<li key={f}>{f}</li>
												))}
											</ul>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				)}
			</section>

			{/* ShrinkOptionSpace */}
			<section
				aria-label={labels.shrinkHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.shrinkHeading}
				</h2>
				{shrink === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="shrink-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-1" data-testid="shrink-verdict">
						<p className="text-sm text-foreground">
							<span className="font-mono" data-testid="shrink-value">
								{labels.shrinkValue} = {shrink}
							</span>
						</p>
						<p
							className="text-sm text-muted-foreground"
							data-testid="shrink-meaning"
						>
							{shrink === 0 ? labels.shrinkZero : labels.shrinkPositive}
						</p>
					</div>
				)}
			</section>
		</div>
	);
}
