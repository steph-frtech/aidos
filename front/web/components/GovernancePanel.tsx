"use client";

import { useState } from "react";
import {
	type AdoptionVerdict,
	type AdrRow,
	type AdrSummary,
	adrParity,
	adrSummary,
	type ComplianceAudit,
	type Coverage,
	complianceAudit,
	count,
	coverages,
	type LedgerAudit,
	ledgerAudit,
	type PillarVerdict,
	type PolicyAudit,
	type PolicyDecision,
	type PolicyEquivRow,
	pillarVerdicts,
	policyAudit,
	residuals,
	type SREAudit,
	sreAudit,
	type Tally,
	verdict,
} from "@/lib/governance";

// GovernancePanel — GV01 ACTION-CAPABLE cross-check panel (CLAUDE.md §7). The "Run the
// cross-check" control EXECUTES the pure, deterministic report functions (coverages /
// count / verdict / pillarVerdicts / residuals) — the SAME twin the Vitest mirror pins —
// and renders the OWASP coverage matrix, the AGT adoption table, the residual gaps and
// the computed adoption verdict. No backend round-trip, no I/O, no Date.now()/random:
// the audit is a pure derivation of a declared table (the wall stays authoritative — a
// read-only report writes no truth).

interface Labels {
	runButton: string;
	verdictHeading: string;
	coverageHeading: string;
	pillarsHeading: string;
	residualsHeading: string;
	statusCovered: string;
	statusPartial: string;
	statusUncovered: string;
	coveredByLabel: string;
	residualLabel: string;
	augmentedByLabel: string;
	decisionAdopt: string;
	decisionCovered: string;
	decisionReject: string;
	tallyCovered: string;
	tallyPartial: string;
	tallyUncovered: string;
	stopLabel: string;
	toAdoptLabel: string;
	residualRisksLabel: string;
	wallNote: string;
	stopYes: string;
	stopNo: string;
	adrButton: string;
	adrHeading: string;
	adrStatusLabel: string;
	adrAdoptLabel: string;
	adrCoveredLabel: string;
	adrRejectedLabel: string;
	adrWallGarant: string;
	adrWallNotGarant: string;
	ledgerButton: string;
	ledgerHeading: string;
	ledgerRootLabel: string;
	ledgerIntactLabel: string;
	ledgerIntactYes: string;
	ledgerIntactNo: string;
	ledgerBomLabel: string;
	ledgerTamperHeading: string;
	ledgerAlterLabel: string;
	ledgerDeleteLabel: string;
	ledgerReorderLabel: string;
	ledgerRedBadge: string;
	ledgerRootChanged: string;
	ledgerNote: string;
	complianceButton: string;
	complianceHeading: string;
	complianceAllGreen: string;
	complianceGovernedLabel: string;
	complianceInjectedLabel: string;
	complianceGreenBadge: string;
	complianceRedBadge: string;
	complianceAnchorLabel: string;
	complianceNote: string;
	policyButton: string;
	policyHeading: string;
	policyEquivLabel: string;
	policyTightenLabel: string;
	policyWidenLabel: string;
	policyReferenceCol: string;
	policyTighterCol: string;
	policyAllowed: string;
	policyDenied: string;
	policyNeverWidens: string;
	policyRejected: string;
	policyNote: string;
	sreButton: string;
	sreHeading: string;
	sreBreakerLabel: string;
	sreBreakerClosed: string;
	sreBreakerOpen: string;
	sreBudgetLabel: string;
	sreErrorRateLabel: string;
	sreTargetLabel: string;
	sreTrustHeading: string;
	sreTrustRunCol: string;
	sreTrustAgentCol: string;
	sreTrustImplCol: string;
	sreTrustRootCol: string;
	sreTrustRootLabel: string;
	sreNote: string;
}

interface Report {
	rows: Coverage[];
	tally: Tally;
	pillars: PillarVerdict[];
	gaps: Coverage[];
	v: AdoptionVerdict;
}

function statusLabel(s: Coverage["status"], l: Labels): string {
	if (s === "covered") return l.statusCovered;
	if (s === "partial") return l.statusPartial;
	return l.statusUncovered;
}

function statusClass(s: Coverage["status"]): string {
	if (s === "covered")
		return "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400";
	if (s === "partial")
		return "border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400";
	return "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400";
}

function decisionLabel(d: PillarVerdict["decision"], l: Labels): string {
	if (d === "adopt_augment") return l.decisionAdopt;
	if (d === "already_covered") return l.decisionCovered;
	return l.decisionReject;
}

interface Adr {
	summary: AdrSummary;
	rows: AdrRow[];
}

export function GovernancePanel({ labels }: { labels: Labels }) {
	const [report, setReport] = useState<Report | null>(null);
	const [adr, setAdr] = useState<Adr | null>(null);
	const [ledger, setLedger] = useState<LedgerAudit | null>(null);
	const [compliance, setCompliance] = useState<ComplianceAudit | null>(null);
	const [policy, setPolicy] = useState<PolicyAudit | null>(null);
	const [sre, setSre] = useState<SREAudit | null>(null);

	function run() {
		// Execute the pure deterministic cross-check — the control's bound operation.
		setReport({
			rows: coverages(),
			tally: count(),
			pillars: pillarVerdicts(),
			gaps: residuals(),
			v: verdict(),
		});
	}

	function showAdr() {
		// GV02 — execute the pure ADR adoption projection (adrParity/adrSummary), the SAME
		// twin the Vitest mirror pins and the accepted ADR 0037 documents. Read-only above
		// the line: the screen renders the decision, it writes no truth (the wall holds).
		setAdr({ summary: adrSummary(), rows: adrParity() });
	}

	function verifyLedgerNow() {
		// GV03 — execute the pure, deterministic Merkle ledger audit (buildLedger/verifyLedger,
		// the SAME twin the Vitest mirror pins and the Go ledger.go authority). The control
		// BUILDS the demo ledger, shows its root + intact verification, then demonstrates that
		// each tamper (alter / delete / reorder) turns the verification red / changes the root.
		// Below the line: it writes no truth (the wall stays authoritative).
		setLedger(ledgerAudit());
	}

	function verifyComplianceNow() {
		// GV04 — execute the pure, deterministic OWASP compliance suite (complianceAudit, the
		// SAME twin the Vitest mirror pins and the Go back/runtime/governance/compliance.go
		// authority). The control RUNS the ten compliance mirrors: each is GREEN on the current
		// (governed) state, and goes RED under its fault-injection — proving the enforcer is
		// load-bearing. Below the line: it writes no truth (the wall stays authoritative).
		setCompliance(complianceAudit());
	}

	function compilePolicyNow() {
		// GV05 — execute the pure, deterministic policy.yaml → GateAction compiler (policyAudit,
		// the SAME twin the Vitest mirror pins and the Go back/runtime/governance/policy.go
		// authority). The control COMPILES the reference + a tighter policy, gates a probe set
		// under both (proving the tighter NEVER widens the reference — every reference-denied
		// action stays denied), and compiles each widening policy (proving every one is REJECTED
		// — the YAML can only equal or tighten the wall). Below the line: it writes no truth.
		setPolicy(policyAudit());
	}

	function alignSRENow() {
		// GV06 — execute the pure, deterministic SRE alignment + identity/trust audit (sreAudit,
		// the SAME twin the Vitest mirror pins and the Go back/runtime/governance/sre.go
		// authority). The control EVALUATES the error-budget / circuit-breaker over the demo run
		// stream against the declared SLO (fail-closed: a failure never improves the budget) and
		// BUILDS the trust chain binding each run's identity (agent + impl) to the GV03 Merkle
		// root. Below the line: it writes no truth (the structural wall stays authoritative).
		setSre(sreAudit());
	}

	return (
		<div>
			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					onClick={run}
					data-testid="run-crosscheck"
					className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					{labels.runButton}
				</button>
				<button
					type="button"
					onClick={showAdr}
					data-testid="show-adr"
					className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					{labels.adrButton}
				</button>
				<button
					type="button"
					onClick={verifyLedgerNow}
					data-testid="verify-ledger"
					className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					{labels.ledgerButton}
				</button>
				<button
					type="button"
					onClick={verifyComplianceNow}
					data-testid="verify-compliance"
					className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					{labels.complianceButton}
				</button>
				<button
					type="button"
					onClick={compilePolicyNow}
					data-testid="compile-policy"
					className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					{labels.policyButton}
				</button>
				<button
					type="button"
					onClick={alignSRENow}
					data-testid="align-sre"
					className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				>
					{labels.sreButton}
				</button>
			</div>

			{sre && (
				<section
					data-testid="sre-audit"
					className="mt-8 rounded-lg border border-border bg-card p-6 shadow-sm"
				>
					<h3 className="text-lg font-semibold text-foreground">
						{labels.sreHeading}
					</h3>
					<div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
						<div className="rounded-md border border-border bg-muted/40 p-3">
							<div className="text-xs text-muted-foreground">
								{labels.sreBreakerLabel}
							</div>
							<div
								data-testid="sre-breaker"
								className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-sm font-semibold ${
									sre.sre.breaker === "open"
										? "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400"
										: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
								}`}
							>
								{sre.sre.breaker === "open"
									? labels.sreBreakerOpen
									: labels.sreBreakerClosed}
							</div>
						</div>
						<div className="rounded-md border border-border bg-muted/40 p-3">
							<div className="text-xs text-muted-foreground">
								{labels.sreBudgetLabel}
							</div>
							<div
								data-testid="sre-budget"
								className="mt-1 text-sm font-semibold text-foreground"
							>
								{sre.sre.remainingBudget} / {sre.sre.totalBudget}
							</div>
						</div>
						<div className="rounded-md border border-border bg-muted/40 p-3">
							<div className="text-xs text-muted-foreground">
								{labels.sreErrorRateLabel}
							</div>
							<div className="mt-1 text-sm font-semibold text-foreground">
								{(sre.sre.errorRate * 100).toFixed(0)}%
							</div>
						</div>
						<div className="rounded-md border border-border bg-muted/40 p-3">
							<div className="text-xs text-muted-foreground">
								{labels.sreTargetLabel}
							</div>
							<div className="mt-1 text-sm font-semibold text-foreground">
								{(sre.sre.target * 100).toFixed(0)}%
							</div>
						</div>
					</div>

					<h4 className="mt-6 text-sm font-semibold text-foreground">
						{labels.sreTrustHeading}
					</h4>
					<div
						data-testid="sre-trust-root"
						className="mt-2 font-mono text-xs text-muted-foreground"
					>
						{labels.sreTrustRootLabel}: {sre.trust.root}
					</div>
					<div className="mt-3 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="text-xs text-muted-foreground">
									<th className="py-1 pr-4">{labels.sreTrustRunCol}</th>
									<th className="py-1 pr-4">{labels.sreTrustAgentCol}</th>
									<th className="py-1 pr-4">{labels.sreTrustImplCol}</th>
									<th className="py-1 pr-4">{labels.sreTrustRootCol}</th>
								</tr>
							</thead>
							<tbody>
								{sre.trust.rows.map((row) => (
									<tr
										key={row.index}
										data-testid={`sre-trust-row-${row.index}`}
										className="border-t border-border"
									>
										<td className="py-1 pr-4 font-mono text-xs">{row.run}</td>
										<td className="py-1 pr-4 font-mono text-xs">{row.agent}</td>
										<td className="py-1 pr-4 font-mono text-xs">{row.impl}</td>
										<td className="py-1 pr-4 font-mono text-xs text-muted-foreground">
											{row.entryRoot}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-4 text-xs text-muted-foreground">{labels.sreNote}</p>
				</section>
			)}

			{policy && (
				<section
					data-testid="policy-compiler"
					className="mt-8 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.policyHeading}
						</h2>
						<span className="flex flex-wrap gap-2">
							<span
								data-testid="policy-all-tighten"
								className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
									policy.allTighten
										? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
										: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400"
								}`}
							>
								{labels.policyTightenLabel}
							</span>
							<span
								data-testid="policy-all-widen-rejected"
								className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
									policy.allWidenRejected
										? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
										: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400"
								}`}
							>
								{labels.policyWidenLabel}: {policy.widenRows.length}/
								{policy.widenRows.length}
							</span>
						</span>
					</div>
					<p className="mt-4 rounded-md border border-blue-600/30 bg-blue-600/5 p-3 text-xs leading-relaxed text-muted-foreground">
						{labels.policyNote}
					</p>

					<h3 className="mt-5 text-sm font-semibold text-foreground">
						{labels.policyEquivLabel}
					</h3>
					<div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-2 text-xs">
						<span className="text-muted-foreground" />
						<span className="text-right font-medium text-muted-foreground">
							{labels.policyReferenceCol}
						</span>
						<span className="text-right font-medium text-muted-foreground">
							{labels.policyTighterCol}
						</span>
						<span />
						{policy.rows.map((r) => (
							<PolicyRow
								key={r.label}
								row={r}
								allowed={labels.policyAllowed}
								denied={labels.policyDenied}
								neverWidens={labels.policyNeverWidens}
							/>
						))}
					</div>

					<h3 className="mt-6 text-sm font-semibold text-foreground">
						{labels.policyWidenLabel}
					</h3>
					<ul className="mt-3 space-y-2">
						{policy.widenRows.map((w) => (
							<li
								key={w.axis}
								data-testid={`policy-widen-${w.axis}`}
								className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3"
							>
								<span className="font-mono text-xs text-foreground">
									{w.axis}
								</span>
								<span className="inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
									{labels.policyRejected}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{compliance && (
				<section
					data-testid="owasp-compliance"
					className="mt-8 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.complianceHeading}
						</h2>
						<span
							data-testid="compliance-all-green"
							className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
								compliance.governed.allCompliant
									? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
									: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400"
							}`}
						>
							{labels.complianceAllGreen}: {compliance.governed.compliant}/
							{compliance.governed.total}
						</span>
					</div>
					<p className="mt-4 rounded-md border border-blue-600/30 bg-blue-600/5 p-3 text-xs leading-relaxed text-muted-foreground">
						{labels.complianceNote}
					</p>
					<ul className="mt-4 space-y-2">
						{compliance.mirrors.map((m) => (
							<li
								key={m.risk}
								data-testid={`compliance-${m.risk}`}
								className="rounded-lg border border-border p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-sm font-medium text-foreground">
										{m.risk} · {m.title}
									</span>
									<span className="flex flex-wrap gap-2">
										<span
											data-testid={`compliance-governed-${m.risk}`}
											className="inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
										>
											{labels.complianceGovernedLabel}:{" "}
											{labels.complianceGreenBadge}
										</span>
										<span
											data-testid={`compliance-injected-${m.risk}`}
											className="inline-flex items-center rounded-full border border-red-600/40 bg-red-600/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
										>
											{labels.complianceInjectedLabel}:{" "}
											{labels.complianceRedBadge}
										</span>
									</span>
								</div>
								<p className="mt-1 font-mono text-[11px] text-muted-foreground">
									{labels.complianceAnchorLabel}: {m.anchor}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{m.governed.evidence} · {m.injected.detail}
								</p>
							</li>
						))}
					</ul>
				</section>
			)}

			{ledger && (
				<section
					data-testid="merkle-ledger"
					className="mt-8 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.ledgerHeading}
						</h2>
						<span
							data-testid="ledger-intact"
							className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
								ledger.intact.ok
									? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
									: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400"
							}`}
						>
							{labels.ledgerIntactLabel}:{" "}
							{ledger.intact.ok
								? labels.ledgerIntactYes
								: labels.ledgerIntactNo}
						</span>
					</div>
					<p className="mt-3 text-xs text-muted-foreground">
						{labels.ledgerRootLabel}
					</p>
					<p
						data-testid="ledger-root"
						className="mt-1 break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-xs text-foreground"
					>
						{ledger.root}
					</p>
					<ul className="mt-4 space-y-2">
						{ledger.entries.map((e) => (
							<li
								key={e.index}
								data-testid={`ledger-entry-${e.index}`}
								className="rounded-lg border border-border p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-sm font-medium text-foreground">
										#{e.index} · {e.bom.agent} — {e.bom.goal}
									</span>
									<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
										{e.bom.result}
									</span>
								</div>
								<p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
									{labels.ledgerBomLabel}: {e.bom.run} · root{" "}
									{e.root.slice(0, 16)}…
								</p>
							</li>
						))}
					</ul>

					<h3 className="mt-6 text-sm font-semibold text-foreground">
						{labels.ledgerTamperHeading}
					</h3>
					<ul className="mt-3 space-y-2">
						<li
							data-testid="tamper-alter"
							className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-600/30 bg-red-600/5 p-3"
						>
							<span className="text-sm text-foreground">
								{labels.ledgerAlterLabel}
							</span>
							<span className="inline-flex items-center rounded-full border border-red-600/40 bg-red-600/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
								{labels.ledgerRedBadge} · {ledger.altered.tamper}
							</span>
						</li>
						<li
							data-testid="tamper-delete"
							className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-600/30 bg-red-600/5 p-3"
						>
							<span className="text-sm text-foreground">
								{labels.ledgerDeleteLabel}
							</span>
							<span className="inline-flex items-center rounded-full border border-red-600/40 bg-red-600/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
								{labels.ledgerRootChanged}
							</span>
						</li>
						<li
							data-testid="tamper-reorder"
							className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-600/30 bg-red-600/5 p-3"
						>
							<span className="text-sm text-foreground">
								{labels.ledgerReorderLabel}
							</span>
							<span className="inline-flex items-center rounded-full border border-red-600/40 bg-red-600/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
								{labels.ledgerRedBadge} · {ledger.reordered.tamper}
							</span>
						</li>
					</ul>
					<p className="mt-4 rounded-md border border-blue-600/30 bg-blue-600/5 p-3 text-xs leading-relaxed text-muted-foreground">
						{labels.ledgerNote}
					</p>
				</section>
			)}

			{adr && (
				<section
					data-testid="adr-adoption"
					className="mt-8 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.adrHeading}
						</h2>
						<span
							data-testid="adr-status"
							className="inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
						>
							ADR {adr.summary.number} — {labels.adrStatusLabel}:{" "}
							{adr.summary.status}
						</span>
					</div>
					<div className="mt-3 grid grid-cols-3 gap-3">
						<Stat
							label={labels.adrAdoptLabel}
							value={adr.summary.adopt}
							testid="adr-adopt"
						/>
						<Stat
							label={labels.adrCoveredLabel}
							value={adr.summary.alreadyCovered}
							testid="adr-covered"
						/>
						<Stat
							label={labels.adrRejectedLabel}
							value={adr.summary.rejected}
							testid="adr-rejected"
						/>
					</div>
					<p className="mt-4 text-sm leading-relaxed text-foreground">
						{adr.summary.line}
					</p>
					<ul className="mt-4 space-y-2">
						{adr.rows.map((r) => (
							<li
								key={r.pillar}
								data-testid={`adr-row-${r.pillar}`}
								className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
							>
								<span className="text-sm font-medium text-foreground">
									{r.title}
									{r.step ? ` — ${r.step}` : ""}
								</span>
								<span
									data-testid={`adr-garant-${r.pillar}`}
									className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
										r.wallIsGarant
											? "border-blue-600/40 bg-blue-600/10 text-blue-700 dark:text-blue-400"
											: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400"
									}`}
								>
									{r.wallIsGarant
										? labels.adrWallGarant
										: labels.adrWallNotGarant}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{report && (
				<div data-testid="crosscheck-report" className="mt-8 space-y-8">
					{/* Adoption verdict */}
					<section className="rounded-xl border border-border bg-card p-5">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.verdictHeading}
						</h2>
						<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
							<Stat
								label={labels.tallyCovered}
								value={report.tally.covered}
								testid="tally-covered"
							/>
							<Stat
								label={labels.tallyPartial}
								value={report.tally.partial}
								testid="tally-partial"
							/>
							<Stat
								label={labels.tallyUncovered}
								value={report.tally.uncovered}
								testid="tally-uncovered"
							/>
							<Stat
								label={labels.toAdoptLabel}
								value={report.v.toAdopt}
								testid="to-adopt"
							/>
						</div>
						<dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">{labels.stopLabel}</dt>
								<dd
									data-testid="verdict-stop"
									className="font-semibold text-foreground"
								>
									{report.v.stop ? labels.stopYes : labels.stopNo}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">
									{labels.residualRisksLabel}
								</dt>
								<dd
									data-testid="residual-risks"
									className="font-semibold text-foreground"
								>
									{report.v.residualRisks}
								</dd>
							</div>
						</dl>
						<p className="mt-4 text-sm leading-relaxed text-foreground">
							{report.v.summary}
						</p>
						<p className="mt-3 rounded-md border border-blue-600/30 bg-blue-600/5 p-3 text-xs leading-relaxed text-muted-foreground">
							{labels.wallNote}
						</p>
					</section>

					{/* OWASP coverage matrix */}
					<section className="rounded-xl border border-border bg-card p-5">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.coverageHeading}
						</h2>
						<ul className="mt-4 space-y-3">
							{report.rows.map((c) => (
								<li
									key={c.risk}
									data-testid={`coverage-${c.risk}`}
									className="rounded-lg border border-border p-4"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="font-medium text-foreground">
											{c.title}
										</span>
										<span
											className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass(c.status)}`}
											data-testid={`status-${c.risk}`}
										>
											{statusLabel(c.status, labels)}
										</span>
									</div>
									<p className="mt-1 text-xs font-mono text-muted-foreground">
										{c.risk}
									</p>
									<p className="mt-2 text-xs font-medium text-muted-foreground">
										{labels.coveredByLabel}
									</p>
									<ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-foreground">
										{c.coveredBy.map((e) => (
											<li key={e}>{e}</li>
										))}
									</ul>
									{c.residual && (
										<p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
											<span className="font-semibold">
												{labels.residualLabel}:{" "}
											</span>
											{c.residual}
										</p>
									)}
									{c.augmentedBy && (
										<p className="mt-1 text-xs text-muted-foreground">
											<span className="font-semibold">
												{labels.augmentedByLabel}:{" "}
											</span>
											{c.augmentedBy}
										</p>
									)}
								</li>
							))}
						</ul>
					</section>

					{/* AGT pillar adoption */}
					<section className="rounded-xl border border-border bg-card p-5">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.pillarsHeading}
						</h2>
						<ul className="mt-4 space-y-3">
							{report.pillars.map((p) => (
								<li
									key={p.pillar}
									data-testid={`pillar-${p.pillar}`}
									className="rounded-lg border border-border p-4"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="font-medium text-foreground">
											{p.title}
										</span>
										<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
											{decisionLabel(p.decision, labels)}
											{p.step ? ` — ${p.step}` : ""}
										</span>
									</div>
									<p className="mt-2 text-xs leading-relaxed text-foreground">
										{p.rationale}
									</p>
								</li>
							))}
						</ul>
					</section>

					{/* Residual gaps */}
					<section className="rounded-xl border border-border bg-card p-5">
						<h2 className="text-lg font-semibold text-foreground">
							{labels.residualsHeading}
						</h2>
						<ul className="mt-4 space-y-2">
							{report.gaps.map((c) => (
								<li
									key={c.risk}
									data-testid={`residual-${c.risk}`}
									className="text-sm text-foreground"
								>
									<span className="font-medium">{c.title}</span> — {c.residual}{" "}
									<span className="text-muted-foreground">
										→ {c.augmentedBy}
									</span>
								</li>
							))}
						</ul>
					</section>
				</div>
			)}
		</div>
	);
}

function verdictBadge(d: PolicyDecision, allowed: string, denied: string) {
	return d.allowed ? (
		<span className="inline-flex items-center justify-end rounded-full border border-amber-600/40 bg-amber-600/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
			{allowed}
		</span>
	) : (
		<span className="inline-flex items-center justify-end rounded-full border border-red-600/40 bg-red-600/10 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">
			{denied}: {d.deniedAxis}
		</span>
	);
}

function PolicyRow({
	row,
	allowed,
	denied,
	neverWidens,
}: {
	row: PolicyEquivRow;
	allowed: string;
	denied: string;
	neverWidens: string;
}) {
	return (
		<>
			<span
				data-testid={`policy-row-${row.label}`}
				className="self-center font-mono text-[11px] text-foreground"
			>
				{row.label}
			</span>
			<span className="self-center justify-self-end">
				{verdictBadge(row.reference, allowed, denied)}
			</span>
			<span className="self-center justify-self-end">
				{verdictBadge(row.tighter, allowed, denied)}
			</span>
			<span
				data-testid={`policy-neverwidens-${row.label}`}
				className="self-center justify-self-end text-[11px] text-emerald-700 dark:text-emerald-400"
				title={neverWidens}
			>
				{row.neverWidens ? "✓" : "✗"}
			</span>
		</>
	);
}

function Stat({
	label,
	value,
	testid,
}: {
	label: string;
	value: number;
	testid: string;
}) {
	return (
		<div className="rounded-lg border border-border bg-muted/40 p-3">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p
				data-testid={testid}
				className="mt-1 text-2xl font-bold text-foreground"
			>
				{value}
			</p>
		</div>
	);
}
