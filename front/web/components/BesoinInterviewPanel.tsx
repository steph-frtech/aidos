"use client";

import { useState } from "react";
import type { LevelBody } from "@/lib/besoin-branchtree";
import type { NodeInput } from "@/lib/besoin-candescend";
import type { Level } from "@/lib/besoin-grammar";
import {
	dispatchableLevels,
	dispatchOf,
	enterableLevel,
	type InterviewResult,
	recordAnswer,
} from "@/lib/besoin-interview";

/**
 * BesoinInterviewPanel — the action-capable /compound-besoin panel (EL13). The human DRIVES the
 * level-by-level forced interview FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless
 * capability): pick a (level, answer) fixture and EXECUTE recordAnswer — the deterministic recorder
 * (the byte-equivalent twin of back/runtime/besoin/interview.go). The CODE JUDGES:
 *  - "Enregistrer la réponse" runs recordAnswer → the routing (record / off_altitude / spike), the
 *    COMPUTED resolved verdict (never declared by the LLM), the open branches, and the legal /spike
 *    three-hop gate when the answer is fuzzy;
 *  - "Niveau entrable" runs enterableLevel + dispatchOf → the level the interview may currently work
 *    (the forcing: a level opens only when its parent is enough) + the gesture it dispatches to.
 *
 * The LLM only LEADS the dialogue (phrases the question, paraphrases the utterance); every verdict is
 * COMPUTED here, the LLM excluded. ABOVE the wall: the interview writes no truth — its output is the
 * BesoinGraph to be appended via the EL15 MCP. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	recordCta: string;
	enterableCta: string;
	resetCta: string;
	caseLabel: string;
	caseProductSharp: string;
	caseProductFuzzy: string;
	caseEntityAtProduct: string;
	caseProductVacant: string;
	routingHeading: string;
	routingRecord: string;
	routingOffAltitude: string;
	routingSpike: string;
	resolvedTrue: string;
	resolvedFalse: string;
	spikeRouteHeading: string;
	blockReasonHeading: string;
	openBranchesHeading: string;
	branchClosed: string;
	branchOpen: string;
	enterableHeading: string;
	enterableLabel: string;
	gestureLabel: string;
	dispatchHeading: string;
	pending: string;
}

type CaseId =
	| "productSharp"
	| "productFuzzy"
	| "entityAtProduct"
	| "productVacant";

interface Fixture {
	id: CaseId;
	level: Level;
	body: LevelBody;
	// metaComplete / routeToSpike are the EL04 metadata verdict the screen passes (computed by
	// certifyMetadata in the real flow; declared here as the fixture's typed metadata stance).
	metaComplete: boolean;
	routeToSpike: boolean;
}

// FIXTURES are the declared (level, answer) inputs the screen exercises — closed, deterministic, no rng
// / no clock. They mirror the Go BDD scenarios (compound-besoin.feature).
const FIXTURES: Record<CaseId, Fixture> = {
	productSharp: {
		id: "productSharp",
		level: "product",
		body: {
			intent: "Un suivi de tâches simple",
			scenarios: ["créer une tâche", "cocher une tâche"],
			selects: ["onboarding", "core-task"],
		},
		metaComplete: true,
		routeToSpike: false,
	},
	productFuzzy: {
		id: "productFuzzy",
		level: "product",
		body: {
			intent: "Une app qui rend les gens heureux",
			scenarios: ["être heureux"],
			selects: ["onboarding"],
		},
		metaComplete: true,
		routeToSpike: true, // unverifiable → /spike
	},
	entityAtProduct: {
		id: "entityAtProduct",
		level: "product",
		body: { attributes: ["id", "title", "done"] }, // off-altitude: entity body at product
		metaComplete: true,
		routeToSpike: false,
	},
	productVacant: {
		id: "productVacant",
		level: "product",
		body: { intent: "x", scenarios: ["créer"], selects: [] }, // parses but narrows nothing
		metaComplete: true,
		routeToSpike: false,
	},
};

const CASE_ORDER: CaseId[] = [
	"productSharp",
	"productFuzzy",
	"entityAtProduct",
	"productVacant",
];

// emptyNode is an absent node (every level not-enough) so enterableLevel returns the first SOURCE rung.
const emptyNode = (l: Level): NodeInput => ({
	level: l,
	body: {},
	refsTo: [],
	present: false,
});

export function BesoinInterviewPanel({ labels }: { labels: Labels }) {
	const caseLabels: Record<CaseId, string> = {
		productSharp: labels.caseProductSharp,
		productFuzzy: labels.caseProductFuzzy,
		entityAtProduct: labels.caseEntityAtProduct,
		productVacant: labels.caseProductVacant,
	};

	const [choice, setChoice] = useState<CaseId>("productSharp");
	const [result, setResult] = useState<InterviewResult | null>(null);
	const [enterable, setEnterable] = useState<{
		level: Level | null;
		gesture: string;
	} | null>(null);

	function runRecord() {
		const f = FIXTURES[choice];
		setResult(recordAnswer(f.level, f.body, f.metaComplete, f.routeToSpike));
	}

	function runEnterable() {
		const level = enterableLevel(emptyNode, () => true);
		setEnterable({
			level,
			gesture: level ? dispatchOf(level).gesture : "",
		});
	}

	function reset() {
		setResult(null);
		setEnterable(null);
		setChoice("productSharp");
	}

	const routingLabel = (r: string) =>
		r === "record"
			? labels.routingRecord
			: r === "off_altitude"
				? labels.routingOffAltitude
				: labels.routingSpike;

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
							{CASE_ORDER.map((id) => (
								<option key={id} value={id}>
									{caseLabels[id]}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						data-testid="record-cta"
						onClick={runRecord}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.recordCta}
					</button>
					<button
						type="button"
						data-testid="enterable-cta"
						onClick={runEnterable}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.enterableCta}
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

			{/* The recorded turn (routing + computed resolved verdict) */}
			<section
				aria-label={labels.routingHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.routingHeading}
				</h2>
				{result === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="result-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-4" data-testid="result">
						<div className="flex flex-wrap items-center gap-3">
							<span
								data-testid="routing"
								data-routing={result.routing}
								className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground"
							>
								{routingLabel(result.routing)}
							</span>
							<span
								data-testid="resolved"
								data-resolved={result.resolved ? "true" : "false"}
								className={
									result.resolved
										? "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
										: "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
								}
							>
								{result.resolved ? labels.resolvedTrue : labels.resolvedFalse}
							</span>
						</div>

						{result.spikeRoute.length > 0 ? (
							<div data-testid="spike-route">
								<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									{labels.spikeRouteHeading}
								</h3>
								<ol className="flex flex-wrap gap-2 text-xs text-muted-foreground">
									{result.spikeRoute.map((hop) => (
										<li
											key={hop}
											className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono"
										>
											{hop}
										</li>
									))}
								</ol>
							</div>
						) : null}

						{result.blockReason ? (
							<div data-testid="block-reason">
								<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									{labels.blockReasonHeading}
								</h3>
								<p className="font-mono text-xs text-foreground">
									{result.blockReason.code}
								</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{result.blockReason.explanation}
								</p>
								<ul className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
									{result.blockReason.howToFix.map((f) => (
										<li key={f}>{f}</li>
									))}
								</ul>
							</div>
						) : null}

						<div>
							<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{labels.openBranchesHeading}
							</h3>
							<ul data-testid="open-branches" className="space-y-2">
								{result.openBranches.map((b) => (
									<li
										key={`${b.kind}:${b.field}`}
										data-testid={`branch-${b.kind}-${b.field}`}
										data-closed={b.closed ? "true" : "false"}
										className="rounded-md border border-border bg-muted/40 p-3"
									>
										<div className="flex items-center justify-between gap-3">
											<p className="font-mono text-xs text-foreground">
												{b.kind} · {b.field}
											</p>
											<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
												{b.closed ? labels.branchClosed : labels.branchOpen}
											</span>
										</div>
										<p className="mt-1 text-sm text-muted-foreground">
											{b.question}
										</p>
									</li>
								))}
							</ul>
						</div>
					</div>
				)}
			</section>

			{/* The enterable level + the dispatched gesture (the forcing made visible) */}
			<section
				aria-label={labels.enterableHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.enterableHeading}
				</h2>
				{enterable === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="enterable-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-2" data-testid="enterable">
						<p
							className="text-sm text-foreground"
							data-testid="enterable-level"
						>
							{labels.enterableLabel} :{" "}
							<span className="font-mono">{enterable.level ?? "—"}</span>
						</p>
						<p
							className="text-sm text-foreground"
							data-testid="enterable-gesture"
						>
							{labels.gestureLabel} :{" "}
							<span className="font-mono">{enterable.gesture}</span>
						</p>
					</div>
				)}
			</section>

			{/* The declared dispatch table (which gesture each rung dispatches to) */}
			<section
				aria-label={labels.dispatchHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.dispatchHeading}
				</h2>
				<ul
					data-testid="dispatch-table"
					className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3"
				>
					{dispatchableLevels().map(({ level, gesture }) => (
						<li key={level} className="font-mono">
							{level} → {gesture}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
