"use client";

import { useMemo, useState } from "react";
import {
	type BandCompletenessReport,
	type BandNodeInput,
	bandCompleteness,
	crossedLevels,
	type InvariantResult,
	recordInvariant,
} from "@/lib/besoin-invariant";
import type { Metadata } from "@/lib/besoin-metadata";

/**
 * BesoinInvariantPanel — the action-capable /besoin-invariant panel (EL14). The human EXECUTES the
 * lateral band FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless capability):
 *  - "Record the invariant" runs recordInvariant(...) — the byte-for-byte twin of
 *    back/runtime/besoin/invariant.go — and surfaces the routing, the crossed levels, and (for a
 *    policy band) the single Idea{Proposes:policy};
 *  - "Crossed levels" runs crossedLevels(band) — the lateral constraint set;
 *  - "Band completeness" runs bandCompleteness(nodes) — flags the missing crossing invariant.
 *
 * Every verdict is COMPUTED by the deterministic twin, never an LLM, never re-implemented here. The
 * circularity ban (§8) refuses a self-authored invariant. ABOVE the wall: the band writes no truth;
 * the policy idea is GUIDANCE for the legal idea_capture door (EL15 MCP). Themed (ADR 0010), bilingual
 * (ADR 0011) — labels passed in.
 */

interface Labels {
	recordCta: string;
	crossedCta: string;
	completenessCta: string;
	resetCta: string;
	caseLabel: string;
	caseInvariantForall: string;
	caseInvariantExample: string;
	casePolicyBand: string;
	caseSelfAuthored: string;
	selfAuthoredLabel: string;
	routingHeading: string;
	routingRecord: string;
	routingOffAltitude: string;
	routingSpike: string;
	crossedHeading: string;
	policyIdeaHeading: string;
	policyIdeaNone: string;
	blockReasonHeading: string;
	completenessHeading: string;
	completenessComplete: string;
	completenessMonster: string;
	pending: string;
}

type CaseKey = "forall" | "example" | "policy" | "self";

const FIXED_META: Metadata = {
	truthKind: "behavioral",
	verifiability: "deterministic",
	scope: { region: "*" },
};

interface CaseDef {
	body: Record<string, unknown>;
	utterance: string;
	selfAuthored: boolean;
}

const CASES: Record<CaseKey, CaseDef> = {
	forall: {
		body: {
			statement: "pour tout chemin, le solde reste ≥ 0",
			attached_levels: ["operation"],
			kind: "path_independent",
		},
		utterance: "le solde ne descend jamais sous zéro",
		selfAuthored: false,
	},
	example: {
		body: {
			statement: "par exemple, la commande #3 est payée",
			attached_levels: ["operation"],
		},
		utterance: "la commande #3 est payée",
		selfAuthored: false,
	},
	policy: {
		body: {
			statement:
				"pour tout utilisateur non-admin, le remboursement est interdit",
			attached_levels: ["operation"],
			kind: "policy",
			rule: "seul un admin peut rembourser",
		},
		utterance: "je veux que seuls les admins remboursent",
		selfAuthored: false,
	},
	self: {
		body: {
			statement: "pour tout P, Q",
			attached_levels: ["operation"],
		},
		utterance: "(la skill tente d'auteurer un invariant)",
		selfAuthored: true,
	},
};

export function BesoinInvariantPanel({ labels }: { labels: Labels }) {
	const [caseKey, setCaseKey] = useState<CaseKey>("forall");
	const [result, setResult] = useState<InvariantResult | null>(null);
	const [crossed, setCrossed] = useState<string[] | null>(null);
	const [completeness, setCompleteness] =
		useState<BandCompletenessReport | null>(null);

	const selectedCase = useMemo(() => CASES[caseKey], [caseKey]);

	function runRecord() {
		const r = recordInvariant(
			selectedCase.body,
			selectedCase.utterance,
			selectedCase.selfAuthored,
			"drafting",
			FIXED_META,
		);
		setResult(r);
		setCrossed(r.crossedLevels);
	}

	function runCrossed() {
		// Crossed levels are only meaningful for a parseable ∀; reuse recordInvariant's parsed band.
		const r = recordInvariant(
			selectedCase.body,
			selectedCase.utterance,
			false,
			"drafting",
			FIXED_META,
		);
		setCrossed(r.band ? crossedLevels(r.band) : []);
	}

	function runCompleteness() {
		// A resolved operation node that requires a crossing invariant, plus whatever band the chosen
		// case records — so the human SEES the missing-invariant monster appear and clear.
		const nodes: BandNodeInput[] = [
			{
				level: "operation",
				status: "resolved",
				body: { requires_invariant: true },
			},
		];
		const r = recordInvariant(
			selectedCase.body,
			selectedCase.utterance,
			selectedCase.selfAuthored,
			"drafting",
			FIXED_META,
		);
		if (r.recorded && r.band) {
			nodes.push({
				level: r.band.kind === "policy" ? "policy" : "invariant",
				status: "drafting",
				body: selectedCase.body,
			});
		}
		setCompleteness(bandCompleteness(nodes));
	}

	function reset() {
		setResult(null);
		setCrossed(null);
		setCompleteness(null);
	}

	const routingLabel = (routing: string): string => {
		switch (routing) {
			case "record":
				return labels.routingRecord;
			case "off_altitude":
				return labels.routingOffAltitude;
			case "spike":
				return labels.routingSpike;
			default:
				return routing;
		}
	};

	return (
		<section className="mt-10 space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
			<div className="space-y-3">
				<label
					htmlFor="band-case"
					className="block text-sm font-medium text-foreground"
				>
					{labels.caseLabel}
				</label>
				<select
					id="band-case"
					data-testid="band-case-select"
					value={caseKey}
					onChange={(e) => setCaseKey(e.target.value as CaseKey)}
					className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
				>
					<option value="forall">{labels.caseInvariantForall}</option>
					<option value="example">{labels.caseInvariantExample}</option>
					<option value="policy">{labels.casePolicyBand}</option>
					<option value="self">{labels.caseSelfAuthored}</option>
				</select>
				{caseKey === "self" ? (
					<p className="text-xs text-muted-foreground">
						{labels.selfAuthoredLabel}
					</p>
				) : null}
			</div>

			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="record-cta"
					onClick={runRecord}
					className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.recordCta}
				</button>
				<button
					type="button"
					data-testid="crossed-cta"
					onClick={runCrossed}
					className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					{labels.crossedCta}
				</button>
				<button
					type="button"
					data-testid="completeness-cta"
					onClick={runCompleteness}
					className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					{labels.completenessCta}
				</button>
				<button
					type="button"
					data-testid="reset-cta"
					onClick={reset}
					className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
				>
					{labels.resetCta}
				</button>
			</div>

			{result ? (
				<div className="space-y-4" data-testid="result">
					<div className="space-y-1">
						<h3 className="text-sm font-semibold text-foreground">
							{labels.routingHeading}
						</h3>
						<p data-testid="routing" className="text-sm text-muted-foreground">
							{routingLabel(result.routing)}
						</p>
					</div>

					{result.blockReason ? (
						<div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
							<h3 className="text-sm font-semibold text-foreground">
								{labels.blockReasonHeading}
							</h3>
							<p
								data-testid="block-code"
								className="font-mono text-xs text-foreground"
							>
								{result.blockReason.code}
							</p>
							<p className="text-xs text-muted-foreground">
								{result.blockReason.explanation}
							</p>
						</div>
					) : null}

					<div className="space-y-1">
						<h3 className="text-sm font-semibold text-foreground">
							{labels.policyIdeaHeading}
						</h3>
						{result.policyIdea ? (
							<p
								data-testid="policy-idea"
								className="font-mono text-xs text-foreground"
							>
								Idea&#123;proposes: {result.policyIdea.proposes}, source:{" "}
								{result.policyIdea.provenance.source}&#125; —{" "}
								{result.policyIdea.intent}
							</p>
						) : (
							<p
								data-testid="policy-idea-none"
								className="text-xs text-muted-foreground"
							>
								{labels.policyIdeaNone}
							</p>
						)}
					</div>
				</div>
			) : null}

			{crossed ? (
				<div className="space-y-1" data-testid="crossed">
					<h3 className="text-sm font-semibold text-foreground">
						{labels.crossedHeading}
					</h3>
					<p
						data-testid="crossed-levels"
						className="font-mono text-xs text-foreground"
					>
						{crossed.length > 0 ? crossed.join(" · ") : "—"}
					</p>
				</div>
			) : null}

			{completeness ? (
				<div className="space-y-1" data-testid="completeness">
					<h3 className="text-sm font-semibold text-foreground">
						{labels.completenessHeading}
					</h3>
					{completeness.complete ? (
						<p
							data-testid="completeness-complete"
							className="text-sm text-emerald-600 dark:text-emerald-400"
						>
							{labels.completenessComplete}
						</p>
					) : (
						<p
							data-testid="completeness-monster"
							className="text-sm text-destructive"
						>
							{labels.completenessMonster} —{" "}
							{completeness.monsters
								.map((m) => `${m.code}@${m.level}`)
								.join(", ")}
						</p>
					)}
				</div>
			) : null}

			{!result && !crossed && !completeness ? (
				<p className="text-sm text-muted-foreground">{labels.pending}</p>
			) : null}
		</section>
	);
}
