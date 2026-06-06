"use client";

import { useMemo, useState } from "react";
import {
	allGrammarLevels,
	derivedMirrorCovers,
	levelMirrorForm,
	type SchemaResult,
	validateJourneySchema,
	validateViewSchema,
} from "@/lib/besoin-completeness";

/**
 * BesoinMirrorformPanel — the action-capable /compound-besoin-mirrorform panel (EL10). The human
 * EXECUTES the new mirror-form table + the view/journey validators FROM THE SCREEN (ui-completeness,
 * CLAUDE.md §7, no headless capability):
 *  - the LevelMirrorForm table renders the expected form for every grammar rung, marking the 5 rungs
 *    derive-mirror covers (it delegates) vs the 3 freshly-declared above-the-wall rungs;
 *  - "Valider la vue" runs validateViewSchema on the view body;
 *  - "Valider le journey" runs validateJourneySchema on the journey body;
 *  - "Casser les zones" / "Casser le Gherkin" fault-inject (the validator goes RED);
 *  - "Réinitialiser" restores a well-formed body.
 *
 * The forms + verdicts are COMPUTED by the deterministic twin (lib/besoin-completeness.ts), never an
 * LLM, never re-implemented here. ABOVE the wall: annexes a form / reads a body, writes NO mirror and no
 * truth (§2). Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	tableHeading: string;
	rungCol: string;
	formCol: string;
	sourceCol: string;
	derived: string;
	declared: string;
	viewHeading: string;
	journeyHeading: string;
	validateViewCta: string;
	validateJourneyCta: string;
	breakZonesCta: string;
	breakGherkinCta: string;
	resetCta: string;
	valid: string;
	invalid: string;
	pending: string;
}

const GOOD_VIEW =
	'{"goal":"voir le panier","zones":["entête","liste"],"data":["total"]}';
const BAD_VIEW = '{"goal":"voir le panier","zones":[],"data":["total"]}';
const GOOD_JOURNEY =
	'{"gherkin":"Given un panier\\nWhen je paie\\nThen la commande existe"}';
const BAD_JOURNEY = '{"gherkin":"je veux juste payer le panier sans étapes"}';

function parseBody(raw: string): Record<string, unknown> {
	try {
		const v = JSON.parse(raw);
		return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export function BesoinMirrorformPanel({ labels }: { labels: Labels }) {
	const [viewBody, setViewBody] = useState(GOOD_VIEW);
	const [journeyBody, setJourneyBody] = useState(GOOD_JOURNEY);
	const [viewResult, setViewResult] = useState<SchemaResult | null>(null);
	const [journeyResult, setJourneyResult] = useState<SchemaResult | null>(null);

	const rows = useMemo(
		() =>
			allGrammarLevels().map((l) => ({
				level: l,
				form: levelMirrorForm(l),
				derived: derivedMirrorCovers(l),
			})),
		[],
	);

	function validateView(body: string) {
		setViewResult(validateViewSchema(parseBody(body)));
	}
	function validateJourney(body: string) {
		setJourneyResult(validateJourneySchema(parseBody(body)));
	}

	return (
		<div className="space-y-8">
			{/* The LevelMirrorForm table (the 9 grammar rungs) */}
			<section
				aria-label={labels.tableHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.tableHeading}
				</h2>
				<table className="w-full text-sm" data-testid="mirrorform-table">
					<thead>
						<tr className="text-left text-xs text-muted-foreground uppercase">
							<th className="py-1 pr-4 font-medium">{labels.rungCol}</th>
							<th className="py-1 pr-4 font-medium">{labels.formCol}</th>
							<th className="py-1 font-medium">{labels.sourceCol}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={r.level}
								data-testid={`mirrorform-row-${r.level}`}
								className="border-t border-border"
							>
								<td className="py-2 pr-4 font-mono text-foreground">
									{r.level}
								</td>
								<td
									className="py-2 pr-4 font-mono text-foreground"
									data-testid={`form-${r.level}`}
								>
									{r.form}
								</td>
								<td className="py-2">
									<span
										data-testid={`source-${r.level}`}
										className={
											r.derived
												? "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
												: "inline-flex items-center rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-600"
										}
									>
										{r.derived ? labels.derived : labels.declared}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{/* The new view validator */}
			<section
				aria-label={labels.viewHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.viewHeading}
				</h2>
				<textarea
					data-testid="view-body"
					value={viewBody}
					onChange={(e) => setViewBody(e.target.value)}
					className="mb-3 h-20 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
				/>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="validate-view-cta"
						onClick={() => validateView(viewBody)}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.validateViewCta}
					</button>
					<button
						type="button"
						data-testid="break-zones-cta"
						onClick={() => {
							setViewBody(BAD_VIEW);
							validateView(BAD_VIEW);
						}}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.breakZonesCta}
					</button>
					<button
						type="button"
						data-testid="reset-view-cta"
						onClick={() => {
							setViewBody(GOOD_VIEW);
							setViewResult(null);
						}}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
				<VerdictBadge
					result={viewResult}
					labels={labels}
					testid="view-verdict"
				/>
			</section>

			{/* The new journey validator */}
			<section
				aria-label={labels.journeyHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.journeyHeading}
				</h2>
				<textarea
					data-testid="journey-body"
					value={journeyBody}
					onChange={(e) => setJourneyBody(e.target.value)}
					className="mb-3 h-20 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
				/>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="validate-journey-cta"
						onClick={() => validateJourney(journeyBody)}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.validateJourneyCta}
					</button>
					<button
						type="button"
						data-testid="break-gherkin-cta"
						onClick={() => {
							setJourneyBody(BAD_JOURNEY);
							validateJourney(BAD_JOURNEY);
						}}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.breakGherkinCta}
					</button>
					<button
						type="button"
						data-testid="reset-journey-cta"
						onClick={() => {
							setJourneyBody(GOOD_JOURNEY);
							setJourneyResult(null);
						}}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
				<VerdictBadge
					result={journeyResult}
					labels={labels}
					testid="journey-verdict"
				/>
			</section>
		</div>
	);
}

function VerdictBadge({
	result,
	labels,
	testid,
}: {
	result: SchemaResult | null;
	labels: Labels;
	testid: string;
}) {
	if (result === null) {
		return (
			<p
				className="mt-3 text-sm text-muted-foreground"
				data-testid={`${testid}-pending`}
			>
				{labels.pending}
			</p>
		);
	}
	return (
		<div className="mt-3 space-y-1" data-testid={testid}>
			<p
				data-testid={`${testid}-valid`}
				data-valid={result.valid ? "true" : "false"}
				className={
					result.valid
						? "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
						: "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
				}
			>
				{result.valid ? labels.valid : labels.invalid}
			</p>
			{!result.valid && result.reason && (
				<p className="text-sm text-muted-foreground">{result.reason}</p>
			)}
		</div>
	);
}
