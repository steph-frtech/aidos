import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgentsPanel } from "@/components/AgentsPanel";
import { CompoundingSection } from "@/components/CompoundingSection";
import { SchedulerSection } from "@/components/SchedulerSection";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the agent-layer governance is a pure projection in lib/agentlayer.ts
// (mirroring back/kernel/agentlayer) + lib/agentrun.ts (back/runtime/agentrun), covered by
// lib/agentlayer.test.ts. The panel runs the pure functions per control — no I/O, no
// Date.now() — so each verdict shown (may-write, propose-not-admit, self-approve-refused) is
// computed exactly as the Go evaluator decides it.

export const metadata: Metadata = {
	title: "Agents (couches gouvernées) — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS agent layers (KRD §21/§13.8): one CoucheAgent per modelled agent (agent | equipe_agents | orchestration), its declared rights (peut_modifier_noyau = false, peut_modifier_fitness = false), bindings, AuthorityGraph and TruthScope; a recent AgentRun with the above-waterline write refused (AGENT_WRITE_ABOVE_WATERLINE). En KRD un agent n'est jamais une autorité — il propose, il ne déclare jamais seul ce qui est vrai.",
};

/**
 * /agents — the agent-layer panel (S52, KRD §21/§13.8). A CoucheAgent is a GOVERNED LAYER (a
 * SOURCE above the line): its role / rights / objectif / outils / skills / hooks / limits are
 * modelled and versioned. A single execution is NOT a layer — it is an AgentRun (a runtime
 * event below the line). The done law: an agent-role write above the waterline is refused with
 * AGENT_WRITE_ABOVE_WATERLINE, and a BDD-writer agent can only PROPOSE a scenario — it stays
 * un-admitted until a HUMAN authority approves it. « Un agent n'est jamais une autorité. »
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7): a "Proposer un scénario" control runs the pure
 * propose op — it yields a `proposed` (never `admitted`) proposal routing to idea → mirror →
 * /goal → approbation (truth-writes go propose → ChangeSet → approval, never a direct write).
 * An "Enregistrer un run" control records an AgentRun (a below-the-line write, executed
 * directly). A "self-approve" attempt is shown refused. Themed on ADR 0010; bilingual (ADR 0011).
 */
export default async function AgentsPage() {
	const t = await getTranslations("agents");

	const labels = {
		layersHeading: t("layersHeading"),
		kindLabel: t("kindLabel"),
		roleLabel: t("roleLabel"),
		objectifLabel: t("objectifLabel"),
		modeleLabel: t("modeleLabel"),
		rightsHeading: t("rightsHeading"),
		canPropose: t("canPropose"),
		canModifyKernel: t("canModifyKernel"),
		canModifyMirror: t("canModifyMirror"),
		canModifyFitness: t("canModifyFitness"),
		lockedTag: t("lockedTag"),
		readZones: t("readZones"),
		writeZones: t("writeZones"),
		skillsLabel: t("skillsLabel"),
		mcpLabel: t("mcpLabel"),
		hooksLabel: t("hooksLabel"),
		authorityLabel: t("authorityLabel"),
		scopeLabel: t("scopeLabel"),
		runHeading: t("runHeading"),
		runAgentLabel: t("runAgentLabel"),
		runGoalLabel: t("runGoalLabel"),
		runItemLabel: t("runItemLabel"),
		runResultLabel: t("runResultLabel"),
		actionsHeading: t("actionsHeading"),
		allowedTag: t("allowedTag"),
		refusedTag: t("refusedTag"),
		reasonLabel: t("reasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		proposeHeading: t("proposeHeading"),
		proposeButton: t("proposeButton"),
		proposeScenario: t("proposeScenario"),
		proposedHeading: t("proposedHeading"),
		proposedBody: t("proposedBody"),
		requiresAuthorityLabel: t("requiresAuthorityLabel"),
		routeLabel: t("routeLabel"),
		statusProposed: t("statusProposed"),
		selfApproveHeading: t("selfApproveHeading"),
		selfApproveButton: t("selfApproveButton"),
		selfApproveRefused: t("selfApproveRefused"),
		recordHeading: t("recordHeading"),
		recordButton: t("recordButton"),
		recordDone: t("recordDone"),
		notALayerTag: t("notALayerTag"),
		driveHeading: t("driveHeading"),
		driveBody: t("driveBody"),
		driveFaultLabel: t("driveFaultLabel"),
		driveButton: t("driveButton"),
		driveResultLabel: t("driveResultLabel"),
		driveAllowedTag: t("driveAllowedTag"),
		driveRefusedTag: t("driveRefusedTag"),
		driveComputedNote: t("driveComputedNote"),
		postHeading: t("postHeading"),
		postBody: t("postBody"),
		postFaultLabel: t("postFaultLabel"),
		postButton: t("postButton"),
		postResultLabel: t("postResultLabel"),
		postComputedNote: t("postComputedNote"),
		sandboxHeading: t("sandboxHeading"),
		sandboxBody: t("sandboxBody"),
		sandboxFaultLabel: t("sandboxFaultLabel"),
		sandboxButton: t("sandboxButton"),
		sandboxWriteLabel: t("sandboxWriteLabel"),
		sandboxEgressLabel: t("sandboxEgressLabel"),
		sandboxRoleLabel: t("sandboxRoleLabel"),
		sandboxLevelsLabel: t("sandboxLevelsLabel"),
		sandboxRefusedTag: t("sandboxRefusedTag"),
		sandboxAllowedTag: t("sandboxAllowedTag"),
		knobsHeading: t("knobsHeading"),
		temperatureLabel: t("temperatureLabel"),
		maxTurnsLabel: t("maxTurnsLabel"),
		seedLabel: t("seedLabel"),
		seedDerivedLabel: t("seedDerivedLabel"),
		networkLabel: t("networkLabel"),
		execLabel: t("execLabel"),
		resourceLabel: t("resourceLabel"),
		concurrencyLabel: t("concurrencyLabel"),
		noEgressTag: t("noEgressTag"),
		noExecTag: t("noExecTag"),
		confinementHeading: t("confinementHeading"),
		confinementBody: t("confinementBody"),
		checkEgressButton: t("checkEgressButton"),
		checkExecButton: t("checkExecButton"),
		deniedTag: t("deniedTag"),
		implHeading: t("implHeading"),
		implBody: t("implBody"),
		implLayerRefLabel: t("implLayerRefLabel"),
		implModelLabel: t("implModelLabel"),
		implNotALayerTag: t("implNotALayerTag"),
		implValidateButton: t("implValidateButton"),
		implValidTag: t("implValidTag"),
		implForbiddenLabel: t("implForbiddenLabel"),
		emitterHeading: t("emitterHeading"),
		emitterPureTag: t("emitterPureTag"),
		emitterBody: t("emitterBody"),
		emitterProjectButton: t("emitterProjectButton"),
		emitterHashLabel: t("emitterHashLabel"),
		emitterStableTag: t("emitterStableTag"),
		emitterUnstableTag: t("emitterUnstableTag"),
		emitterCfgIgnoredTag: t("emitterCfgIgnoredTag"),
		emitterCfgLeakTag: t("emitterCfgLeakTag"),
		promptHeading: t("promptHeading"),
		promptPureTag: t("promptPureTag"),
		promptBody: t("promptBody"),
		promptAssembleButton: t("promptAssembleButton"),
		promptStableTag: t("promptStableTag"),
		promptUnstableTag: t("promptUnstableTag"),
		promptNoLeakTag: t("promptNoLeakTag"),
		promptLeakTag: t("promptLeakTag"),
		promptWallTag: t("promptWallTag"),
		promptNoWallTag: t("promptNoWallTag"),
		promptPreviewLabel: t("promptPreviewLabel"),
		bindingsHeading: t("bindingsHeading"),
		bindingsPureTag: t("bindingsPureTag"),
		bindingsBody: t("bindingsBody"),
		bindingsResolveButton: t("bindingsResolveButton"),
		bindingsToolsSubsetTag: t("bindingsToolsSubsetTag"),
		bindingsSkillsSubsetTag: t("bindingsSkillsSubsetTag"),
		bindingsWidenedTag: t("bindingsWidenedTag"),
		bindingsMandatoryTag: t("bindingsMandatoryTag"),
		bindingsMandatoryDroppedTag: t("bindingsMandatoryDroppedTag"),
		bindingsNarrowedTag: t("bindingsNarrowedTag"),
		bindingsNotNarrowedTag: t("bindingsNotNarrowedTag"),
		bindingsToolsLabel: t("bindingsToolsLabel"),
		bindingsSkillsLabel: t("bindingsSkillsLabel"),
		bindingsHooksLabel: t("bindingsHooksLabel"),
		viewerHeading: t("viewerHeading"),
		viewerReadOnlyTag: t("viewerReadOnlyTag"),
		viewerBody: t("viewerBody"),
		viewerSelectLabel: t("viewerSelectLabel"),
		viewerLayerRefLabel: t("viewerLayerRefLabel"),
		viewerProviderLabel: t("viewerProviderLabel"),
		viewerTemperatureLabel: t("viewerTemperatureLabel"),
		viewerMaxTurnsLabel: t("viewerMaxTurnsLabel"),
		viewerSeedLabel: t("viewerSeedLabel"),
		viewerSeedDerivedLabel: t("viewerSeedDerivedLabel"),
		viewerConcurrencyLabel: t("viewerConcurrencyLabel"),
		viewerResourceLabel: t("viewerResourceLabel"),
		viewerToolsLabel: t("viewerToolsLabel"),
		viewerSkillsLabel: t("viewerSkillsLabel"),
		viewerHooksLabel: t("viewerHooksLabel"),
		viewerAllowedPathsLabel: t("viewerAllowedPathsLabel"),
		viewerForbiddenPathsLabel: t("viewerForbiddenPathsLabel"),
		viewerNetworkLabel: t("viewerNetworkLabel"),
		viewerExecLabel: t("viewerExecLabel"),
		viewerNoEgressTag: t("viewerNoEgressTag"),
		viewerNoExecTag: t("viewerNoExecTag"),
		viewerHashLabel: t("viewerHashLabel"),
		viewerDeterministicTag: t("viewerDeterministicTag"),
		viewerNonDeterministicTag: t("viewerNonDeterministicTag"),
		viewerNotALayerTag: t("viewerNotALayerTag"),
		viewerPromptLabel: t("viewerPromptLabel"),
		capProbeHeading: t("capProbeHeading"),
		capProbeBody: t("capProbeBody"),
		capProbeServerLabel: t("capProbeServerLabel"),
		capProbeToolLabel: t("capProbeToolLabel"),
		capProbeButton: t("capProbeButton"),
		capProbeAllowed: t("capProbeAllowed"),
		capProbeDenied: t("capProbeDenied"),
		capProbeBlockReasonLabel: t("capProbeBlockReasonLabel"),
		capProbeHowToFixLabel: t("capProbeHowToFixLabel"),
		skillProbeHeading: t("skillProbeHeading"),
		skillProbeBody: t("skillProbeBody"),
		skillProbeNameLabel: t("skillProbeNameLabel"),
		skillProbeButton: t("skillProbeButton"),
		skillProbeAllowed: t("skillProbeAllowed"),
		skillProbeDenied: t("skillProbeDenied"),
		skillProbeBlockReasonLabel: t("skillProbeBlockReasonLabel"),
		skillProbeHowToFixLabel: t("skillProbeHowToFixLabel"),
		pathProbeHeading: t("pathProbeHeading"),
		pathProbeBody: t("pathProbeBody"),
		pathProbeTargetLabel: t("pathProbeTargetLabel"),
		pathProbeButton: t("pathProbeButton"),
		pathProbeAllowed: t("pathProbeAllowed"),
		pathProbeDenied: t("pathProbeDenied"),
		pathProbeBlockReasonLabel: t("pathProbeBlockReasonLabel"),
		pathProbeHowToFixLabel: t("pathProbeHowToFixLabel"),
		hookGateHeading: t("hookGateHeading"),
		hookGateBody: t("hookGateBody"),
		hookGateFaultLabel: t("hookGateFaultLabel"),
		hookGateFaultNone: t("hookGateFaultNone"),
		hookGateFaultSkipped: t("hookGateFaultSkipped"),
		hookGateFaultRed: t("hookGateFaultRed"),
		hookGateButton: t("hookGateButton"),
		hookGateAccepted: t("hookGateAccepted"),
		hookGateRefused: t("hookGateRefused"),
		hookGateBlockReasonLabel: t("hookGateBlockReasonLabel"),
		hookGateHowToFixLabel: t("hookGateHowToFixLabel"),
		budgetGateHeading: t("budgetGateHeading"),
		budgetGateBody: t("budgetGateBody"),
		budgetGateEffectiveCapLabel: t("budgetGateEffectiveCapLabel"),
		budgetGateFaultLabel: t("budgetGateFaultLabel"),
		budgetGateFaultWithin: t("budgetGateFaultWithin"),
		budgetGateFaultExceeded: t("budgetGateFaultExceeded"),
		budgetGateButton: t("budgetGateButton"),
		budgetGateWithin: t("budgetGateWithin"),
		budgetGateExceeded: t("budgetGateExceeded"),
		budgetGateBlockReasonLabel: t("budgetGateBlockReasonLabel"),
		budgetGateHowToFixLabel: t("budgetGateHowToFixLabel"),
		arbiterGateHeading: t("arbiterGateHeading"),
		arbiterGateBody: t("arbiterGateBody"),
		arbiterGateActionLabel: t("arbiterGateActionLabel"),
		arbiterGateLabelLabel: t("arbiterGateLabelLabel"),
		arbiterGateLabelPlaceholder: t("arbiterGateLabelPlaceholder"),
		arbiterGateRequestedLlmLabel: t("arbiterGateRequestedLlmLabel"),
		arbiterGateButton: t("arbiterGateButton"),
		arbiterGateDeterministic: t("arbiterGateDeterministic"),
		arbiterGateLlmGated: t("arbiterGateLlmGated"),
		arbiterGateBlocked: t("arbiterGateBlocked"),
		arbiterGateComposedAllowed: t("arbiterGateComposedAllowed"),
		llmIsoHeading: t("llmIsoHeading"),
		llmIsoBody: t("llmIsoBody"),
		llmIsoFaultLabel: t("llmIsoFaultLabel"),
		llmIsoButton: t("llmIsoButton"),
		llmIsoGreen: t("llmIsoGreen"),
		llmIsoRed: t("llmIsoRed"),
		identityHeading: t("identityHeading"),
		identityPureTag: t("identityPureTag"),
		identityBody: t("identityBody"),
		identityExpectedLabel: t("identityExpectedLabel"),
		identityFaultLabel: t("identityFaultLabel"),
		identityFaultOwn: t("identityFaultOwn"),
		identityFaultOther: t("identityFaultOther"),
		identityFaultEmpty: t("identityFaultEmpty"),
		identityButton: t("identityButton"),
		identityPresentedLabel: t("identityPresentedLabel"),
		identityVerifiedTag: t("identityVerifiedTag"),
		identityRefusedTag: t("identityRefusedTag"),
		identityBlockReasonLabel: t("identityBlockReasonLabel"),
		identityHowToFixLabel: t("identityHowToFixLabel"),
		runDriveHeading: t("runDriveHeading"),
		runDriveBody: t("runDriveBody"),
		runScenarioLabel: t("runScenarioLabel"),
		runScenarioHappy: t("runScenarioHappy"),
		runScenarioKernelWrite: t("runScenarioKernelWrite"),
		runScenarioOverBudget: t("runScenarioOverBudget"),
		runUnboundLabel: t("runUnboundLabel"),
		runDriveButton: t("runDriveButton"),
		runResultLabel2: t("runResultLabel2"),
		runNoTruthTag: t("runNoTruthTag"),
		runAllowedTag: t("runAllowedTag"),
		runRefusedActionTag: t("runRefusedActionTag"),
		runRefusedTag: t("runRefusedTag"),
		runBlockReasonLabel: t("runBlockReasonLabel"),
		runComputedNote: t("runComputedNote"),
		replayHeading: t("replayHeading"),
		replayBody: t("replayBody"),
		replayModeLegacy: t("replayModeLegacy"),
		replayModeReplay: t("replayModeReplay"),
		replayBuildButton: t("replayBuildButton"),
		replayImplLabel: t("replayImplLabel"),
		replaySeedLabel: t("replaySeedLabel"),
		replaySeedDerivedTag: t("replaySeedDerivedTag"),
		replaySeedDeclaredTag: t("replaySeedDeclaredTag"),
		replayTranscriptLabel: t("replayTranscriptLabel"),
		replayCoherentTag: t("replayCoherentTag"),
		replayIncoherentTag: t("replayIncoherentTag"),
		replayLegacyReadableTag: t("replayLegacyReadableTag"),
		replayNoneTag: t("replayNoneTag"),
		replaySupersedeNote: t("replaySupersedeNote"),
		economicsHeading: t("economicsHeading"),
		economicsBody: t("economicsBody"),
		economicsCapLabel: t("economicsCapLabel"),
		economicsTightTag: t("economicsTightTag"),
		economicsLooseTag: t("economicsLooseTag"),
		economicsDriveButton: t("economicsDriveButton"),
		economicsResultLabel: t("economicsResultLabel"),
		economicsMeterLabel: t("economicsMeterLabel"),
		economicsCostLabel: t("economicsCostLabel"),
		economicsVerdictLabel: t("economicsVerdictLabel"),
		economicsCrossedTag: t("economicsCrossedTag"),
		economicsHeldTag: t("economicsHeldTag"),
		economicsWithinTag: t("economicsWithinTag"),
		economicsFlaggedTag: t("economicsFlaggedTag"),
		economicsAbandonedTag: t("economicsAbandonedTag"),
		economicsPrecallNote: t("economicsPrecallNote"),
		ba28Heading: t("ba28Heading"),
		ba28Body: t("ba28Body"),
		ba28RunButton: t("ba28RunButton"),
		ba28RawLabel: t("ba28RawLabel"),
		ba28RedactedLabel: t("ba28RedactedLabel"),
		ba28ReplayLabel: t("ba28ReplayLabel"),
		ba28MatchTag: t("ba28MatchTag"),
		ba28MismatchTag: t("ba28MismatchTag"),
		ba28NoLeakTag: t("ba28NoLeakTag"),
		ba28LeakTag: t("ba28LeakTag"),
		ba28LedgerNote: t("ba28LedgerNote"),
		ba29Heading: t("ba29Heading"),
		ba29Body: t("ba29Body"),
		ba29RunButton: t("ba29RunButton"),
		ba29RunCol: t("ba29RunCol"),
		ba29VerdictCol: t("ba29VerdictCol"),
		ba29ReplayCol: t("ba29ReplayCol"),
		ba29ReconcileCol: t("ba29ReconcileCol"),
		ba29AuditableTag: t("ba29AuditableTag"),
		ba29NotAuditableTag: t("ba29NotAuditableTag"),
		ba29ReplayOk: t("ba29ReplayOk"),
		ba29ReconciledOk: t("ba29ReconciledOk"),
		ba29DriftLabel: t("ba29DriftLabel"),
		ba29RefusalsHeading: t("ba29RefusalsHeading"),
		ba29NoRefusals: t("ba29NoRefusals"),
		ba29WallNote: t("ba29WallNote"),
		ba30Heading: t("ba30Heading"),
		ba30Body: t("ba30Body"),
		ba30RunButton: t("ba30RunButton"),
		ba30RunCol: t("ba30RunCol"),
		ba30ClassCol: t("ba30ClassCol"),
		ba30SeverityCol: t("ba30SeverityCol"),
		ba30PatternCol: t("ba30PatternCol"),
		ba30NoSignalTag: t("ba30NoSignalTag"),
		ba30RecurrenceHeading: t("ba30RecurrenceHeading"),
		ba30RecurrenceNote: t("ba30RecurrenceNote"),
		ba30HypothesisLabel: t("ba30HypothesisLabel"),
		ba30KernelRefusedLabel: t("ba30KernelRefusedLabel"),
		ba30WallNote: t("ba30WallNote"),
		ba31Heading: t("ba31Heading"),
		ba31Body: t("ba31Body"),
		ba31RunButton: t("ba31RunButton"),
		ba31RunCol: t("ba31RunCol"),
		ba31IdeaCol: t("ba31IdeaCol"),
		ba31HypothesisLabel: t("ba31HypothesisLabel"),
		ba31NoSignalTag: t("ba31NoSignalTag"),
		ba31DraftTag: t("ba31DraftTag"),
		ba31KernelRefusedLabel: t("ba31KernelRefusedLabel"),
		ba31RecurrenceHeading: t("ba31RecurrenceHeading"),
		ba31RecurrenceNote: t("ba31RecurrenceNote"),
		ba31ForgedHeading: t("ba31ForgedHeading"),
		ba31ForgedBody: t("ba31ForgedBody"),
		ba31ForgeButton: t("ba31ForgeButton"),
		ba31AdmitButton: t("ba31AdmitButton"),
		ba31RefusedTag: t("ba31RefusedTag"),
		ba31AdmittedTag: t("ba31AdmittedTag"),
		ba31WallNote: t("ba31WallNote"),
		economyHeading: t("economyHeading"),
		economyBody: t("economyBody"),
		economyButton: t("economyButton"),
		economyRunCol: t("economyRunCol"),
		economyBeforeCol: t("economyBeforeCol"),
		economyAfterCol: t("economyAfterCol"),
		economySavedCol: t("economySavedCol"),
		economyVerdictCol: t("economyVerdictCol"),
		economyInvariantTag: t("economyInvariantTag"),
		economyDivergentTag: t("economyDivergentTag"),
		economyCapNeverRaisedTag: t("economyCapNeverRaisedTag"),
		economyTotalLabel: t("economyTotalLabel"),
		economySavedLabel: t("economySavedLabel"),
		economyWallNote: t("economyWallNote"),
	};

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							{t("title")}
						</h1>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("subtitle")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
					<blockquote
						data-testid="engraved-law"
						className="max-w-2xl border-l-2 border-primary/50 pl-4 text-sm italic leading-relaxed text-foreground"
					>
						{t("engraved")}
					</blockquote>
				</header>

				<section
					aria-label={t("tutorialHeading")}
					data-testid="tutorial"
					className="mt-10 space-y-2 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("tutorialBody")}
					</p>
				</section>

				<div className="mt-10">
					<AgentsPanel labels={labels} />
					<SchedulerSection />
					<CompoundingSection />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
