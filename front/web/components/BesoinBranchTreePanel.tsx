"use client";

import { useState } from "react";
import {
	type Altitude,
	antiVacuitySatisfied,
	branchTree,
	classifyAltitude,
	isOffAltitude,
	isResolved,
	type LevelBody,
	type OpenBranch,
} from "@/lib/besoin-branchtree";
import type { Level } from "@/lib/besoin-grammar";

/**
 * BesoinBranchTreePanel — the action-capable /compound-besoin-branchtree panel (EL12). The human
 * EXECUTES the deterministic decision tree + the altitude classification FROM THE SCREEN
 * (ui-completeness, CLAUDE.md §7, no headless capability):
 *  - "Construire l'arbre" runs branchTree(level, body) + isResolved — the byte-equivalent twin of
 *    back/runtime/besoin/branchtree.go — showing the Example-Map cells (open vs closed), the resolved
 *    verdict (COMPUTED, never declared), and the anti-vacuity flag;
 *  - "Classer l'altitude" runs classifyAltitude(body) + isOffAltitude(claimedLevel, body) — the
 *    schema-mismatch altitude classifier: an entity `attributes` body submitted at product FAILS the
 *    product schema (a declared field-set mismatch, never an LLM opinion).
 *
 * Every verdict is COMPUTED by the deterministic twin, the LLM excluded, never re-implemented here.
 * ABOVE the wall: BranchTree feeds Idea.Intent / the /grill triage, writes no truth (the wall, §2).
 * Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	treeCta: string;
	altitudeCta: string;
	resetCta: string;
	caseLabel: string;
	caseProductComplete: string;
	caseProductMissing: string;
	caseProductVacant: string;
	caseEntityAtProduct: string;
	caseOperationForwardDep: string;
	treeHeading: string;
	resolvedTrue: string;
	resolvedFalse: string;
	antiVacuityHeading: string;
	antiVacuityTrue: string;
	antiVacuityFalse: string;
	branchClosed: string;
	branchOpen: string;
	altitudeHeading: string;
	bestLabel: string;
	offAltitudeTrue: string;
	offAltitudeFalse: string;
	unmatched: string;
	scoresLabel: string;
	pending: string;
}

type CaseId =
	| "productComplete"
	| "productMissing"
	| "productVacant"
	| "entityAtProduct"
	| "operationForwardDep";

interface Fixture {
	id: CaseId;
	// claimed is the altitude the body is SUBMITTED at (for off-altitude / branchTree).
	claimed: Level;
	body: LevelBody;
}

// FIXTURES are the declared (level, body) inputs the screen exercises — closed, deterministic, no rng
// / no clock. They mirror the Go fixture-table cases (branchtree_fixture_test.go).
const FIXTURES: Record<CaseId, Fixture> = {
	productComplete: {
		id: "productComplete",
		claimed: "product",
		body: {
			intent: "suivi de tâches",
			scenarios: ["créer", "cocher"],
			selects: ["onboarding", "core-task"],
		},
	},
	productMissing: {
		id: "productMissing",
		claimed: "product",
		body: { intent: "suivi de tâches" }, // scenarios missing
	},
	productVacant: {
		id: "productVacant",
		claimed: "product",
		body: { intent: "x", scenarios: ["créer"], selects: [] }, // parses but narrows nothing
	},
	entityAtProduct: {
		id: "entityAtProduct",
		claimed: "product",
		body: { attributes: ["id", "title", "done"] }, // off-altitude: entity body at product
	},
	operationForwardDep: {
		id: "operationForwardDep",
		claimed: "operation",
		body: { steps: ["valider", "persister"], fixture: { state: "s" } }, // operation→entity carried
	},
};

const CASE_ORDER: CaseId[] = [
	"productComplete",
	"productMissing",
	"productVacant",
	"entityAtProduct",
	"operationForwardDep",
];

export function BesoinBranchTreePanel({ labels }: { labels: Labels }) {
	const caseLabels: Record<CaseId, string> = {
		productComplete: labels.caseProductComplete,
		productMissing: labels.caseProductMissing,
		productVacant: labels.caseProductVacant,
		entityAtProduct: labels.caseEntityAtProduct,
		operationForwardDep: labels.caseOperationForwardDep,
	};

	const [choice, setChoice] = useState<CaseId>("productComplete");
	const [tree, setTree] = useState<OpenBranch[] | null>(null);
	const [altitude, setAltitude] = useState<Altitude | null>(null);
	const [offAltitude, setOffAltitude] = useState<boolean | null>(null);

	function runTree() {
		const f = FIXTURES[choice];
		setTree(branchTree(f.claimed, f.body));
	}

	function runAltitude() {
		const f = FIXTURES[choice];
		setAltitude(classifyAltitude(f.body));
		setOffAltitude(isOffAltitude(f.claimed, f.body));
	}

	function reset() {
		setTree(null);
		setAltitude(null);
		setOffAltitude(null);
		setChoice("productComplete");
	}

	const resolved = tree !== null ? isResolved(tree) : null;
	const antiVacuity = tree !== null ? antiVacuitySatisfied(tree) : null;

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
						data-testid="tree-cta"
						onClick={runTree}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{labels.treeCta}
					</button>
					<button
						type="button"
						data-testid="altitude-cta"
						onClick={runAltitude}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						{labels.altitudeCta}
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

			{/* Decision tree + resolved verdict */}
			<section
				aria-label={labels.treeHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.treeHeading}
				</h2>
				{tree === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="tree-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-4" data-testid="tree">
						<p
							data-testid="resolved"
							data-resolved={resolved ? "true" : "false"}
							className={
								resolved
									? "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
									: "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
							}
						>
							{resolved ? labels.resolvedTrue : labels.resolvedFalse}
						</p>

						<div>
							<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{labels.antiVacuityHeading}
							</h3>
							<p
								className="text-sm text-foreground"
								data-testid="anti-vacuity"
								data-satisfied={antiVacuity ? "true" : "false"}
							>
								{antiVacuity ? labels.antiVacuityTrue : labels.antiVacuityFalse}
							</p>
						</div>

						<ul data-testid="branches" className="space-y-2">
							{tree.map((b) => (
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
										<span
											className={
												b.closed
													? "rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-600"
													: "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
											}
										>
											{b.closed ? labels.branchClosed : labels.branchOpen}
										</span>
									</div>
									<p className="mt-1 text-sm text-muted-foreground">
										{b.question}
									</p>
									{!b.closed && b.howToFix.length > 0 ? (
										<ul className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
											{b.howToFix.map((f) => (
												<li key={f}>{f}</li>
											))}
										</ul>
									) : null}
								</li>
							))}
						</ul>
					</div>
				)}
			</section>

			{/* Altitude classification (schema-mismatch) */}
			<section
				aria-label={labels.altitudeHeading}
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{labels.altitudeHeading}
				</h2>
				{altitude === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="altitude-pending"
					>
						{labels.pending}
					</p>
				) : (
					<div className="space-y-3" data-testid="altitude">
						<p
							data-testid="off-altitude"
							data-off={offAltitude ? "true" : "false"}
							className={
								offAltitude
									? "inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
									: "inline-flex items-center rounded-full bg-blue-600/10 px-3 py-1 text-sm font-medium text-blue-600"
							}
						>
							{offAltitude ? labels.offAltitudeTrue : labels.offAltitudeFalse}
						</p>
						<p className="text-sm text-foreground" data-testid="altitude-best">
							{labels.bestLabel} :{" "}
							<span className="font-mono">
								{altitude.matched ? altitude.best : labels.unmatched}
							</span>
						</p>
						<div>
							<h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{labels.scoresLabel}
							</h3>
							<ul
								data-testid="altitude-scores"
								className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3"
							>
								{Object.entries(altitude.scores).map(([lvl, score]) => (
									<li key={lvl} className="font-mono">
										{lvl}: {score}
									</li>
								))}
							</ul>
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
