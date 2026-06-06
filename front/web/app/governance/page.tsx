import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GovernancePanel } from "@/components/GovernancePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the OWASP Agentic Top-10 cross-check + the AGT adoption verdict are
// a PURE twin of back/runtime/governance (lib/governance.ts) — a DECLARED coverage matrix
// and adoption table, never an LLM auditor — covered by lib/governance.test.ts (fast-check,
// anchored on the Go property mirror). The panel re-runs the SAME twin on a click and
// renders the matrix, the residual gaps and the computed adoption verdict. The report
// writes no truth (the wall stays authoritative; the AGT augments, never replaces it).
// Themed (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Gouvernance — cross-check OWASP Agentic Top-10 + verdict d'adoption AGT | AIDOS Workbench",
	description:
		"GV01 : audit déterministe de la gouvernance d'agents d'AIDOS (S52 agentlayer ; BA13 GateAction + enforcers ; BA29 ledger) contre les 10 risques OWASP Agentic et les piliers du Microsoft agent-governance-toolkit. 8/10 risques déjà couverts fail-closed par le mur structurel ; écarts réels sur AAI09 (ledger non Merkle) et AAI10 (sans error-budget/circuit-breaker) → augmentés par GV03..GV06. Le mur reste autoritaire : l'AGT l'augmente, ne le remplace jamais.",
};

export default async function GovernancePage() {
	const t = await getTranslations("governance");

	const labels = {
		runButton: t("runButton"),
		verdictHeading: t("verdictHeading"),
		coverageHeading: t("coverageHeading"),
		pillarsHeading: t("pillarsHeading"),
		residualsHeading: t("residualsHeading"),
		statusCovered: t("statusCovered"),
		statusPartial: t("statusPartial"),
		statusUncovered: t("statusUncovered"),
		coveredByLabel: t("coveredByLabel"),
		residualLabel: t("residualLabel"),
		augmentedByLabel: t("augmentedByLabel"),
		decisionAdopt: t("decisionAdopt"),
		decisionCovered: t("decisionCovered"),
		decisionReject: t("decisionReject"),
		tallyCovered: t("tallyCovered"),
		tallyPartial: t("tallyPartial"),
		tallyUncovered: t("tallyUncovered"),
		stopLabel: t("stopLabel"),
		toAdoptLabel: t("toAdoptLabel"),
		residualRisksLabel: t("residualRisksLabel"),
		wallNote: t("wallNote"),
		stopYes: t("stopYes"),
		stopNo: t("stopNo"),
		adrButton: t("adrButton"),
		adrHeading: t("adrHeading"),
		adrStatusLabel: t("adrStatusLabel"),
		adrAdoptLabel: t("adrAdoptLabel"),
		adrCoveredLabel: t("adrCoveredLabel"),
		adrRejectedLabel: t("adrRejectedLabel"),
		adrWallGarant: t("adrWallGarant"),
		adrWallNotGarant: t("adrWallNotGarant"),
		ledgerButton: t("ledgerButton"),
		ledgerHeading: t("ledgerHeading"),
		ledgerRootLabel: t("ledgerRootLabel"),
		ledgerIntactLabel: t("ledgerIntactLabel"),
		ledgerIntactYes: t("ledgerIntactYes"),
		ledgerIntactNo: t("ledgerIntactNo"),
		ledgerBomLabel: t("ledgerBomLabel"),
		ledgerTamperHeading: t("ledgerTamperHeading"),
		ledgerAlterLabel: t("ledgerAlterLabel"),
		ledgerDeleteLabel: t("ledgerDeleteLabel"),
		ledgerReorderLabel: t("ledgerReorderLabel"),
		ledgerRedBadge: t("ledgerRedBadge"),
		ledgerRootChanged: t("ledgerRootChanged"),
		ledgerNote: t("ledgerNote"),
		complianceButton: t("complianceButton"),
		complianceHeading: t("complianceHeading"),
		complianceAllGreen: t("complianceAllGreen"),
		complianceGovernedLabel: t("complianceGovernedLabel"),
		complianceInjectedLabel: t("complianceInjectedLabel"),
		complianceGreenBadge: t("complianceGreenBadge"),
		complianceRedBadge: t("complianceRedBadge"),
		complianceAnchorLabel: t("complianceAnchorLabel"),
		complianceNote: t("complianceNote"),
		policyButton: t("policyButton"),
		policyHeading: t("policyHeading"),
		policyEquivLabel: t("policyEquivLabel"),
		policyTightenLabel: t("policyTightenLabel"),
		policyWidenLabel: t("policyWidenLabel"),
		policyReferenceCol: t("policyReferenceCol"),
		policyTighterCol: t("policyTighterCol"),
		policyAllowed: t("policyAllowed"),
		policyDenied: t("policyDenied"),
		policyNeverWidens: t("policyNeverWidens"),
		policyRejected: t("policyRejected"),
		policyNote: t("policyNote"),
		sreButton: t("sreButton"),
		sreHeading: t("sreHeading"),
		sreBreakerLabel: t("sreBreakerLabel"),
		sreBreakerClosed: t("sreBreakerClosed"),
		sreBreakerOpen: t("sreBreakerOpen"),
		sreBudgetLabel: t("sreBudgetLabel"),
		sreErrorRateLabel: t("sreErrorRateLabel"),
		sreTargetLabel: t("sreTargetLabel"),
		sreTrustHeading: t("sreTrustHeading"),
		sreTrustRunCol: t("sreTrustRunCol"),
		sreTrustAgentCol: t("sreTrustAgentCol"),
		sreTrustImplCol: t("sreTrustImplCol"),
		sreTrustRootCol: t("sreTrustRootCol"),
		sreTrustRootLabel: t("sreTrustRootLabel"),
		sreNote: t("sreNote"),
	};

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
				<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{t("title")}
				</h1>
				<p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>
				<div className="mt-8">
					<GovernancePanel labels={labels} />
				</div>
			</main>
		</div>
	);
}
