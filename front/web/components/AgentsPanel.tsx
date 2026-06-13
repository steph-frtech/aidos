"use client";

import { useState } from "react";
import {
	type AgentAction,
	type AgentImplementation,
	approve,
	arbitrate,
	arbitrateGated,
	assembleSystemPrompt,
	type BlockReason,
	type Budgets,
	type BudgetVerdict,
	type CoucheAgent,
	checkBudget,
	checkLlmIsolation,
	DEFAULT_ARCH_FITNESS_POLICY,
	effectiveTokensCap,
	egressAllowed,
	execAllowed,
	type GateActionInput,
	type GateDecision,
	gateAction,
	type HarnessCostBudget,
	type HookVerdict,
	hooksSatisfied,
	type IdentityVerdict,
	type ImportGraph,
	implContentHash,
	type LlmIsolationViolation,
	mintToken,
	type PathDecision,
	type ProviderCfg,
	pathAllowed,
	project,
	propose,
	type RunMeter,
	resolveHooks,
	resolveSkills,
	resolveTools,
	type SkillDecision,
	seedFor,
	skillAllowed,
	type ToolDecision,
	toolAllowed,
	type Verdict,
	validateImpl,
	verifyToken,
	wallForbiddenPaths,
} from "@/lib/agentlayer";
import { AGENTS, BDD_WRITER, RECENT_RUN } from "@/lib/agentlayer-data";
import {
	type ApplyDecision,
	applyGate,
	type LearningView,
	type Proposal,
	runsToLearnings,
} from "@/lib/agentloop-incident-to-idea";
import { type Effect, type Ledger, queryLedger } from "@/lib/agentloop-ledger";
import { runsToSignals, type SignalView } from "@/lib/agentloop-runtosignal";
import {
	type AgentloopDriveResult,
	type AgentloopScenario,
	type AgentRun,
	agentloopWroteNoTruth,
	agentRunReplayCoherent,
	checkGeneratedEgress,
	checkGeneratedWrite,
	type DriveInputTs,
	drive,
	driveAgentloop,
	driveWithEconomics,
	type EgressVerdict,
	evaluateRun,
	POSTGRES_AGENT_ROLE,
	runSeed,
	type ScriptedTurnTs,
	type SensorStateTs,
	type WriteVerdict,
} from "@/lib/agentrun";
import {
	containsSecret,
	redactTranscript,
	replayId,
	replayMatches,
	type TranscriptTs,
} from "@/lib/agentrun-redact";
import type { AuthorityGraph, Role } from "@/lib/authority";
import {
	type PerRunEconomy,
	perRunEconomy,
	type RunPrompts,
} from "@/lib/context-compressor";
import type { EconomicsDecision } from "@/lib/economics";

// BA11 — the demo DECLARED budgets the panel checks a run against. goal.Budgets (S29) and
// economics.HarnessCostBudget (S51) declare the tokens axis TWICE; the effective cap is
// min() — the tightest wins (here S51's 800 < S29's 1000, so 800 is authoritative). The
// rate makes the cost COST-AWARE (tokens × declared rate). These are DECLARED data, never
// authored by the agent (the wall): the panel READS them, the gate enforces min().
const BUDGET_S29: Budgets = { timeSeconds: 600, turns: 40, tokens: 1000 };
const BUDGET_S51: HarnessCostBudget = {
	cellRef: "cell:agents-panel",
	maxCiMinutes: 30,
	maxLlmTokensPerGoal: 800,
};
const BUDGET_RATE = 0.00001; // declared per-token rate (cost-aware unit)

// BA12 — the demo actions the determinism-first ARBITER classifies BY STRUCTURE (tool +
// args), never by label. The first four are deterministic structures (a tool exists); the
// last is a genuine generation (the residual LLMGated case). The operator can re-label any
// of them — the verdict cannot move (gap D1). DECLARED demo data, not authored truth.
const ARBITER_ACTIONS: ReadonlyArray<{ key: string; action: AgentAction }> = [
	{ key: "git-diff", action: { tool: "bash", args: ["git", "diff"] } },
	{ key: "rg-search", action: { tool: "bash", args: ["rg", "Arbitrate"] } },
	{ key: "gofmt", action: { tool: "bash", args: ["gofmt", "-w", "x.go"] } },
	{ key: "aidos-project", action: { tool: "aidos", args: ["project"] } },
	{ key: "aidos-check", action: { tool: "aidos", args: ["check"] } },
	{ key: "llm-prose", action: { tool: "llm", args: ["write", "docs"] } },
];

// BA14 — the demo import graph the arch-fitness rule "one single LLM function" checks.
// Only the provider package imports the SDK; every other package is SDK-free. The
// fault-injection toggle adds an LLM-SDK import to a non-provider package, flipping the
// rule red — proving the invariant is a RULE, not 25 repetitions of prose. DECLARED demo
// data, never authored truth.
const LLM_ISO_CLEAN_GRAPH: ImportGraph = {
	packages: [
		{
			importPath: "back/runtime/agentloop/provider",
			imports: ["context", "github.com/anthropics/anthropic-sdk-go"],
		},
		{
			importPath: "back/runtime/agentloop",
			imports: ["go/parser", "go/token"],
		},
		{
			importPath: "back/runtime/agentimpl",
			imports: ["back/runtime/blockreason"],
		},
	],
};
const LLM_ISO_POLICY = {
	...DEFAULT_ARCH_FITNESS_POLICY,
	allowedImporters: ["back/runtime/agentloop/provider"],
};
// the package the fault-injection toggle would sprinkle a SECOND LLM SDK into.
const LLM_ISO_FAULT_PKG = "back/runtime/agentimpl";
const LLM_ISO_FAULT_IMPORT = "github.com/openai/openai-go";

/**
 * AgentsPanel — the action-capable /agents panel (S52, KRD §21/§13.8). It lists the
 * CoucheAgent layers (kind badge, role, objectif, modele/provider, the rights panel with
 * peut_modifier_noyau / peut_modifier_fitness LOCKED false, read/write zones, bound
 * skills/MCP/hooks, the AuthorityGraph approver and the TruthScope), then a recent AgentRun
 * with each action's wall verdict — the above-waterline write shown RED with its
 * AGENT_WRITE_ABOVE_WATERLINE BlockReason + how_to_fix.
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7): "Proposer un scénario" runs the pure propose op —
 * it yields a `proposed` (never `admitted`) proposal routing to idea → mirror → /goal →
 * approbation (no direct truth-write from the screen). "Tenter de s'auto-approuver" runs the
 * pure approve op with the agent as approver — refused (an agent is never an authority).
 * "Enregistrer un run" records an AgentRun (a below-the-line write, executed directly).
 */

interface Labels {
	layersHeading: string;
	kindLabel: string;
	roleLabel: string;
	objectifLabel: string;
	modeleLabel: string;
	rightsHeading: string;
	canPropose: string;
	canModifyKernel: string;
	canModifyMirror: string;
	canModifyFitness: string;
	lockedTag: string;
	readZones: string;
	writeZones: string;
	skillsLabel: string;
	mcpLabel: string;
	hooksLabel: string;
	authorityLabel: string;
	scopeLabel: string;
	runHeading: string;
	runAgentLabel: string;
	runGoalLabel: string;
	runItemLabel: string;
	runResultLabel: string;
	actionsHeading: string;
	allowedTag: string;
	refusedTag: string;
	reasonLabel: string;
	howToFixLabel: string;
	proposeHeading: string;
	proposeButton: string;
	proposeScenario: string;
	proposedHeading: string;
	proposedBody: string;
	requiresAuthorityLabel: string;
	routeLabel: string;
	statusProposed: string;
	selfApproveHeading: string;
	selfApproveButton: string;
	selfApproveRefused: string;
	recordHeading: string;
	recordButton: string;
	recordDone: string;
	notALayerTag: string;
	// BA15 — the loop shell (Drive) control
	driveHeading: string;
	driveBody: string;
	driveFaultLabel: string;
	driveButton: string;
	driveResultLabel: string;
	driveAllowedTag: string;
	driveRefusedTag: string;
	driveComputedNote: string;
	// BA16 — the deterministic post-check
	postHeading: string;
	postBody: string;
	postFaultLabel: string;
	postButton: string;
	postResultLabel: string;
	postComputedNote: string;
	// BA17 — sandbox binding + the gated LLM exception
	sandboxHeading: string;
	sandboxBody: string;
	sandboxFaultLabel: string;
	sandboxButton: string;
	sandboxWriteLabel: string;
	sandboxEgressLabel: string;
	sandboxRoleLabel: string;
	sandboxLevelsLabel: string;
	sandboxRefusedTag: string;
	sandboxAllowedTag: string;
	// BA01 — governed knobs
	knobsHeading: string;
	temperatureLabel: string;
	maxTurnsLabel: string;
	seedLabel: string;
	seedDerivedLabel: string;
	networkLabel: string;
	execLabel: string;
	resourceLabel: string;
	concurrencyLabel: string;
	noEgressTag: string;
	noExecTag: string;
	confinementHeading: string;
	confinementBody: string;
	checkEgressButton: string;
	checkExecButton: string;
	deniedTag: string;
	// BA02 — AgentImplementation projection
	implHeading: string;
	implBody: string;
	implLayerRefLabel: string;
	implModelLabel: string;
	implNotALayerTag: string;
	implValidateButton: string;
	implValidTag: string;
	implForbiddenLabel: string;
	// BA03 — the deterministic emitter project()
	emitterHeading: string;
	emitterPureTag: string;
	emitterBody: string;
	emitterProjectButton: string;
	emitterHashLabel: string;
	emitterStableTag: string;
	emitterUnstableTag: string;
	emitterCfgIgnoredTag: string;
	emitterCfgLeakTag: string;
	// BA04 — the deterministic SystemPrompt assembly
	promptHeading: string;
	promptPureTag: string;
	promptBody: string;
	promptAssembleButton: string;
	promptStableTag: string;
	promptUnstableTag: string;
	promptNoLeakTag: string;
	promptLeakTag: string;
	promptWallTag: string;
	promptNoWallTag: string;
	promptPreviewLabel: string;
	// BA05 — binding resolution (governance narrows, never widens)
	bindingsHeading: string;
	bindingsPureTag: string;
	bindingsBody: string;
	bindingsResolveButton: string;
	bindingsToolsSubsetTag: string;
	bindingsSkillsSubsetTag: string;
	bindingsWidenedTag: string;
	bindingsMandatoryTag: string;
	bindingsMandatoryDroppedTag: string;
	bindingsNarrowedTag: string;
	bindingsNotNarrowedTag: string;
	bindingsToolsLabel: string;
	bindingsSkillsLabel: string;
	bindingsHooksLabel: string;
	// BA06 — the selectable, read-only AgentImplementation viewer (agentimpl.project)
	viewerHeading: string;
	viewerReadOnlyTag: string;
	viewerBody: string;
	viewerSelectLabel: string;
	viewerLayerRefLabel: string;
	viewerProviderLabel: string;
	viewerTemperatureLabel: string;
	viewerMaxTurnsLabel: string;
	viewerSeedLabel: string;
	viewerSeedDerivedLabel: string;
	viewerConcurrencyLabel: string;
	viewerResourceLabel: string;
	viewerToolsLabel: string;
	viewerSkillsLabel: string;
	viewerHooksLabel: string;
	viewerAllowedPathsLabel: string;
	viewerForbiddenPathsLabel: string;
	viewerNetworkLabel: string;
	viewerExecLabel: string;
	viewerNoEgressTag: string;
	viewerNoExecTag: string;
	viewerHashLabel: string;
	viewerDeterministicTag: string;
	viewerNonDeterministicTag: string;
	viewerNotALayerTag: string;
	viewerPromptLabel: string;
	// BA07 — the CAPACITY-axis probe (action-capable: it EXECUTES toolAllowed)
	capProbeHeading: string;
	capProbeBody: string;
	capProbeServerLabel: string;
	capProbeToolLabel: string;
	capProbeButton: string;
	capProbeAllowed: string;
	capProbeDenied: string;
	capProbeBlockReasonLabel: string;
	capProbeHowToFixLabel: string;
	// BA08 — the SKILL-axis probe (action-capable: it EXECUTES skillAllowed)
	skillProbeHeading: string;
	skillProbeBody: string;
	skillProbeNameLabel: string;
	skillProbeButton: string;
	skillProbeAllowed: string;
	skillProbeDenied: string;
	skillProbeBlockReasonLabel: string;
	skillProbeHowToFixLabel: string;
	// BA09 — the CONFINEMENT-axis path probe (action-capable: it EXECUTES pathAllowed)
	pathProbeHeading: string;
	pathProbeBody: string;
	pathProbeTargetLabel: string;
	pathProbeButton: string;
	pathProbeAllowed: string;
	pathProbeDenied: string;
	pathProbeBlockReasonLabel: string;
	pathProbeHowToFixLabel: string;
	// BA10 — the MANDATORY-HOOK turn-acceptance gate (action-capable: it EXECUTES
	// hooksSatisfied, with a fault-injection toggle proving hook-honesty §5)
	hookGateHeading: string;
	hookGateBody: string;
	hookGateFaultLabel: string;
	hookGateFaultNone: string;
	hookGateFaultSkipped: string;
	hookGateFaultRed: string;
	hookGateButton: string;
	hookGateAccepted: string;
	hookGateRefused: string;
	hookGateBlockReasonLabel: string;
	hookGateHowToFixLabel: string;
	budgetGateHeading: string;
	budgetGateBody: string;
	budgetGateEffectiveCapLabel: string;
	budgetGateFaultLabel: string;
	budgetGateFaultWithin: string;
	budgetGateFaultExceeded: string;
	budgetGateButton: string;
	budgetGateWithin: string;
	budgetGateExceeded: string;
	budgetGateBlockReasonLabel: string;
	budgetGateHowToFixLabel: string;
	arbiterGateHeading: string;
	arbiterGateBody: string;
	arbiterGateActionLabel: string;
	arbiterGateLabelLabel: string;
	arbiterGateLabelPlaceholder: string;
	arbiterGateRequestedLlmLabel: string;
	arbiterGateButton: string;
	arbiterGateDeterministic: string;
	arbiterGateLlmGated: string;
	arbiterGateBlocked: string;
	arbiterGateComposedAllowed: string;
	llmIsoHeading: string;
	llmIsoBody: string;
	llmIsoFaultLabel: string;
	llmIsoButton: string;
	llmIsoGreen: string;
	llmIsoRed: string;
	identityHeading: string;
	identityPureTag: string;
	identityBody: string;
	identityExpectedLabel: string;
	identityFaultLabel: string;
	identityFaultOwn: string;
	identityFaultOther: string;
	identityFaultEmpty: string;
	identityButton: string;
	identityPresentedLabel: string;
	identityVerifiedTag: string;
	identityRefusedTag: string;
	identityBlockReasonLabel: string;
	identityHowToFixLabel: string;
	// BA19 — the agentloop MCP Run controls
	runDriveHeading: string;
	runDriveBody: string;
	runScenarioLabel: string;
	runScenarioHappy: string;
	runScenarioKernelWrite: string;
	runScenarioOverBudget: string;
	runUnboundLabel: string;
	runDriveButton: string;
	runResultLabel2: string;
	runNoTruthTag: string;
	runAllowedTag: string;
	runRefusedActionTag: string;
	runRefusedTag: string;
	runBlockReasonLabel: string;
	runComputedNote: string;
	// BA26 — the replay envelope (Impl + Seed + ProviderTranscript; supersede-via-version)
	replayHeading: string;
	replayBody: string;
	replayModeLegacy: string;
	replayModeReplay: string;
	replayBuildButton: string;
	replayImplLabel: string;
	replaySeedLabel: string;
	replaySeedDerivedTag: string;
	replaySeedDeclaredTag: string;
	replayTranscriptLabel: string;
	replayCoherentTag: string;
	replayIncoherentTag: string;
	replayLegacyReadableTag: string;
	replayNoneTag: string;
	replaySupersedeNote: string;
	// BA27 — the live meter + halt-on-budget wired into the loop + the economics feed
	economicsHeading: string;
	economicsBody: string;
	economicsCapLabel: string;
	economicsTightTag: string;
	economicsLooseTag: string;
	economicsDriveButton: string;
	economicsResultLabel: string;
	economicsMeterLabel: string;
	economicsCostLabel: string;
	economicsVerdictLabel: string;
	economicsCrossedTag: string;
	economicsHeldTag: string;
	economicsWithinTag: string;
	economicsFlaggedTag: string;
	economicsAbandonedTag: string;
	economicsPrecallNote: string;
	// BA28 — replay + reproducibility + redacted transcript
	ba28Heading: string;
	ba28Body: string;
	ba28RunButton: string;
	ba28RawLabel: string;
	ba28RedactedLabel: string;
	ba28ReplayLabel: string;
	ba28MatchTag: string;
	ba28MismatchTag: string;
	ba28NoLeakTag: string;
	ba28LeakTag: string;
	ba28LedgerNote: string;
	// BA29 — the fidelity-to-reality LEDGER subsection.
	ba29Heading: string;
	ba29Body: string;
	ba29RunButton: string;
	ba29RunCol: string;
	ba29VerdictCol: string;
	ba29ReplayCol: string;
	ba29ReconcileCol: string;
	ba29AuditableTag: string;
	ba29NotAuditableTag: string;
	ba29ReplayOk: string;
	ba29ReconciledOk: string;
	ba29DriftLabel: string;
	ba29RefusalsHeading: string;
	ba29NoRefusals: string;
	ba29WallNote: string;
	// BA30 — the RunToSignal gateway (identity-by-pattern) subsection.
	ba30Heading: string;
	ba30Body: string;
	ba30RunButton: string;
	ba30RunCol: string;
	ba30ClassCol: string;
	ba30SeverityCol: string;
	ba30PatternCol: string;
	ba30NoSignalTag: string;
	ba30RecurrenceHeading: string;
	ba30RecurrenceNote: string;
	ba30HypothesisLabel: string;
	ba30KernelRefusedLabel: string;
	ba30WallNote: string;
	ba31Heading: string;
	ba31Body: string;
	ba31RunButton: string;
	ba31RunCol: string;
	ba31IdeaCol: string;
	ba31HypothesisLabel: string;
	ba31NoSignalTag: string;
	ba31DraftTag: string;
	ba31KernelRefusedLabel: string;
	ba31RecurrenceHeading: string;
	ba31RecurrenceNote: string;
	ba31ForgedHeading: string;
	ba31ForgedBody: string;
	ba31ForgeButton: string;
	ba31AdmitButton: string;
	ba31RefusedTag: string;
	ba31AdmittedTag: string;
	ba31WallNote: string;
	// HR05 — « Compression / économie » section (tokens before/after per run)
	economyHeading: string;
	economyBody: string;
	economyButton: string;
	economyRunCol: string;
	economyBeforeCol: string;
	economyAfterCol: string;
	economySavedCol: string;
	economyVerdictCol: string;
	economyInvariantTag: string;
	economyDivergentTag: string;
	economyCapNeverRaisedTag: string;
	economyTotalLabel: string;
	economySavedLabel: string;
	economyWallNote: string;
}

function boolBadge(value: boolean, locked: boolean, lockedTag: string) {
	const cls = value
		? "border-primary/40 bg-primary/10 text-primary"
		: "border-border bg-muted text-muted-foreground";
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${cls}`}
		>
			{value ? "true" : "false"}
			{locked ? <span className="text-[0.65rem]">🔒 {lockedTag}</span> : null}
		</span>
	);
}

function AgentCard({ c, labels }: { c: CoucheAgent; labels: Labels }) {
	return (
		<div
			data-testid={`agent-card-${c.spec.role}`}
			className="rounded-xl border border-border bg-card p-5 shadow-sm"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						data-testid={`agent-kind-${c.spec.role}`}
						className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
					>
						{labels.kindLabel}: {c.kind}
					</span>
					<span className="text-sm font-semibold text-foreground">
						{c.spec.nom}
					</span>
				</div>
				<span className="text-xs text-muted-foreground">
					{labels.modeleLabel}:{" "}
					<code className="font-mono text-foreground">{c.spec.modele}</code> ·{" "}
					{c.spec.provider}
				</span>
			</div>

			<dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
				<div>
					<dt className="text-xs text-muted-foreground">{labels.roleLabel}</dt>
					<dd
						data-testid={`agent-role-${c.spec.role}`}
						className="font-mono text-foreground"
					>
						{c.spec.role}
					</dd>
				</div>
				<div>
					<dt className="text-xs text-muted-foreground">
						{labels.objectifLabel}
					</dt>
					<dd className="text-foreground">{c.spec.objectif}</dd>
				</div>
			</dl>

			{/* Rights panel — the two structural always-false rights are LOCKED */}
			<div
				data-testid={`rights-${c.spec.role}`}
				className="mt-4 rounded-lg border border-border bg-muted/40 p-3"
			>
				<h3 className="text-xs font-semibold tracking-tight text-foreground">
					{labels.rightsHeading}
				</h3>
				<ul className="mt-2 space-y-1.5 text-xs">
					<li className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">{labels.canPropose}</span>
						{boolBadge(c.spec.peutProposerVerite, false, labels.lockedTag)}
					</li>
					<li className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">
							{labels.canModifyKernel}
						</span>
						<span data-testid={`right-noyau-${c.spec.role}`}>
							{boolBadge(c.spec.peutModifierNoyau, true, labels.lockedTag)}
						</span>
					</li>
					<li className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">
							{labels.canModifyMirror}
						</span>
						{boolBadge(c.spec.peutModifierMiroir, false, labels.lockedTag)}
					</li>
					<li className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">
							{labels.canModifyFitness}
						</span>
						<span data-testid={`right-fitness-${c.spec.role}`}>
							{boolBadge(c.spec.peutModifierFitness, true, labels.lockedTag)}
						</span>
					</li>
				</ul>
				<dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground">{labels.readZones}</dt>
						<dd className="font-mono text-foreground">
							{c.spec.zonesLecture.join(", ")}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.writeZones}</dt>
						<dd className="font-mono text-foreground">
							{c.spec.zonesEcriture.join(", ")}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.skillsLabel}</dt>
						<dd className="text-foreground">
							{c.skills.map((s) => s.skillName).join(", ") || "—"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.mcpLabel}</dt>
						<dd className="text-foreground">
							{c.mcp.map((m) => `${m.server}.${m.tool}`).join(", ") || "—"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.hooksLabel}</dt>
						<dd className="text-foreground">
							{c.hooks.map((h) => h.hook).join(", ") || "—"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.authorityLabel}</dt>
						<dd
							data-testid={`authority-${c.spec.role}`}
							className="font-mono text-foreground"
						>
							{c.domain} → {c.approvers.join(", ")}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.scopeLabel}</dt>
						<dd className="font-mono text-foreground">{c.scopeRegion}</dd>
					</div>
				</dl>

				{/* BA01 — the governed behaviour knobs (above the line, never a providerCfg) */}
				<div
					data-testid={`knobs-${c.spec.role}`}
					className="mt-4 rounded-lg border border-border bg-muted/30 p-3"
				>
					<h4 className="text-xs font-semibold tracking-tight text-foreground">
						{labels.knobsHeading}
					</h4>
					<dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
						<div>
							<dt className="text-muted-foreground">
								{labels.temperatureLabel}
							</dt>
							<dd
								data-testid={`knob-temperature-${c.spec.role}`}
								className="font-mono text-foreground"
							>
								{c.spec.temperature}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{labels.maxTurnsLabel}</dt>
							<dd className="font-mono text-foreground">{c.spec.maxTurns}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{labels.seedLabel}</dt>
							<dd
								data-testid={`knob-seed-${c.spec.role}`}
								className="font-mono text-foreground"
							>
								{c.spec.seed !== "" ? (
									c.spec.seed
								) : (
									<span className="text-muted-foreground">
										{labels.seedDerivedLabel} (
										{seedFor(c.spec, c.spec.id, "pack", "rwi")})
									</span>
								)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">
								{labels.concurrencyLabel}
							</dt>
							<dd className="font-mono text-foreground">
								{c.spec.maxConcurrency}
							</dd>
						</div>
						<div className="col-span-2 sm:col-span-1">
							<dt className="text-muted-foreground">{labels.resourceLabel}</dt>
							<dd className="font-mono text-foreground">
								{c.spec.resourceLimits.maxMemoryMb}MB ·{" "}
								{c.spec.resourceLimits.maxCpuMillis}m ·{" "}
								{c.spec.resourceLimits.maxWallSeconds}s
							</dd>
						</div>
					</dl>
					<div className="mt-2 flex flex-col gap-2 text-xs sm:flex-row">
						<div>
							<span className="text-muted-foreground">
								{labels.networkLabel}:{" "}
							</span>
							{c.spec.allowedNetworkHosts.length > 0 ? (
								<code
									data-testid={`knob-network-${c.spec.role}`}
									className="font-mono text-foreground"
								>
									{c.spec.allowedNetworkHosts.join(", ")}
								</code>
							) : (
								<span
									data-testid={`knob-network-${c.spec.role}`}
									className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 font-medium text-muted-foreground"
								>
									{labels.noEgressTag}
								</span>
							)}
						</div>
						<div>
							<span className="text-muted-foreground">
								{labels.execLabel}:{" "}
							</span>
							{c.spec.allowedExec.length > 0 ? (
								<code
									data-testid={`knob-exec-${c.spec.role}`}
									className="font-mono text-foreground"
								>
									{c.spec.allowedExec.join(", ")}
								</code>
							) : (
								<span
									data-testid={`knob-exec-${c.spec.role}`}
									className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 font-medium text-muted-foreground"
								>
									{labels.noExecTag}
								</span>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * ImplementationViewer (BA06) — the selectable, READ-ONLY AgentImplementation view, the
 * front twin of the `agentimpl.project(layerRef)` MCP op. Pick an agent → its governed
 * CoucheAgent is projected (pure `project()`, the BA03 emitter) into its runnable
 * AgentImplementation and DISPLAYED: model, temperature/maxTurns/seed, resolved
 * tools/skills/hooks, allowed/forbidden paths (the wall: kernel/mirrors/fitness), allowed
 * network hosts (« aucun egress » by default), exec, resource limits, budgets, and the
 * assembled system prompt. A DETERMINISM badge re-projects the SAME layer and compares the
 * content-hash (re-project ⇒ same hash). DISPLAY ONLY — no run control: nothing executes
 * until something is applied (the wall). Themed (ADR 0010), bilingual (ADR 0011).
 */
function ImplementationViewer({ labels }: { labels: Labels }) {
	const [selectedRole, setSelectedRole] = useState<string>(AGENTS[0].spec.role);
	const selected =
		AGENTS.find((a) => a.spec.role === selectedRole) ?? AGENTS[0];

	// BA07 — the CAPACITY-axis probe state. The agent picks a (server, tool); the button
	// EXECUTES the pure toolAllowed enforcer against the resolved impl. A below-the-line
	// pure verdict (no truth-write) — it ACTS directly, the wall is respected.
	const [probeServer, setProbeServer] = useState<string>("");
	const [probeTool, setProbeTool] = useState<string>("");
	const [capVerdict, setCapVerdict] = useState<ToolDecision | null>(null);

	// BA08 — the SKILL-axis probe state. The agent picks a skill name; the button
	// EXECUTES the pure skillAllowed enforcer against the resolved impl. A below-the-line
	// pure verdict (no truth-write) — it ACTS directly, the wall is respected. The 3rd axis.
	const [probeSkill, setProbeSkill] = useState<string>("");
	const [skillVerdict, setSkillVerdict] = useState<SkillDecision | null>(null);

	// BA09 — the CONFINEMENT-axis probe state. The agent enters a target path; the button
	// EXECUTES the pure pathAllowed enforcer against the resolved impl. Allowed IFF the path
	// is covered by an AllowedPaths prefix AND outside ForbiddenPaths — the allow-list, DISTINCT
	// from the zone deny-list. A below-the-line pure verdict (no truth-write) — it ACTS directly.
	const [probePath, setProbePath] = useState<string>("");
	const [pathVerdict, setPathVerdict] = useState<PathDecision | null>(null);

	// BA10 — the MANDATORY-HOOK turn-acceptance gate. The button EXECUTES the pure
	// hooksSatisfied enforcer over the resolved impl's mandatory hooks against a per-hook
	// VERDICT (the hook binary's own outcome, never the agent transcript). A fault-injection
	// toggle reddens/removes a mandatory hook's verdict (hook-honesty §5) so the operator can
	// SEE the gate flip from accepted → AGENT_MANDATORY_HOOK_SKIPPED/RED. A below-the-line
	// pure verdict (no truth-write) — it ACTS directly.
	const [hookFault, setHookFault] = useState<"none" | "skipped" | "red">(
		"none",
	);
	const [hookVerdict, setHookVerdict] = useState<BlockReason | null>(null);
	const [hookRan, setHookRan] = useState<boolean>(false);

	// BA11 — the per-run BUDGET gate. The button EXECUTES the pure checkBudget gate over a
	// monotone RunMeter against the two declared budgets (goal.Budgets S29 ∧
	// economics.HarnessCostBudget S51), whose effective per-shared-axis cap is min() — the
	// tightest cap wins (fail-closed). A fault-injection toggle pushes the token tally to
	// the cap (within) or one past it (breach), so the operator SEES the verdict flip at the
	// boundary. A below-the-line pure verdict (no truth-write) — it ACTS directly.
	const [budgetFault, setBudgetFault] = useState<"within" | "exceeded">(
		"within",
	);
	const [budgetVerdict, setBudgetVerdict] = useState<BudgetVerdict | null>(
		null,
	);

	// BA12 — the determinism-first ARBITER gate. The operator selects ONE of the demo
	// actions (a deterministic structure or a genuine generation) and a CLAIMED label, then
	// runs the pure arbitrate gate. The verdict is computed from the action STRUCTURE only —
	// re-labelling cannot move it (gap D1); a deterministic structure is never LLMGated
	// (gap D3). The "Requested LLM" toggle exercises arbitrateGated: a determinism gap (LLM
	// requested where a deterministic tool exists) BLOCKS with AGENT_DETERMINISM_GAP. A
	// below-the-line pure verdict (no truth-write) — it ACTS directly.
	const [arbActionIdx, setArbActionIdx] = useState<number>(0);
	const [arbLabel, setArbLabel] = useState<string>("");
	const [arbRequestedLlm, setArbRequestedLlm] = useState<boolean>(false);
	const [arbVerdict, setArbVerdict] = useState<Verdict | null>(null);
	const [arbGap, setArbGap] = useState<BlockReason | null | undefined>(
		undefined,
	);

	// BA13 — the COMPOSED perimeter gate. The SAME run button that exercises the determinism
	// arbiter also runs gateAction: ALL declared axes folded into ONE verdict, in the explicit
	// precedence (determinism → zone → path → egress → exec → capacity → skill → budget →
	// hook). It renders the live "what would be refused" preview — the FIRST axis that refuses,
	// with its BlockReason. A below-the-line pure verdict (no truth-write) — it ACTS directly.
	const [gateDecision, setGateDecision] = useState<GateDecision | null>(null);

	// BA14 — the arch-fitness invariant "one single LLM function". The toggle injects an
	// LLM-SDK import into a non-provider package; the run computes checkLlmIsolation over the
	// (possibly faulted) graph and shows the LIVE "what would flip red" verdict. A below-the-
	// line PURE verdict (no truth-write) — it ACTS directly. The toggle is the fault injection.
	const [llmIsoFault, setLlmIsoFault] = useState<boolean>(false);
	const [llmIsoViolations, setLlmIsoViolations] = useState<
		LlmIsolationViolation[] | null
	>(null);

	// Project the selected governed layer deterministically. providerCfg carries ONLY the
	// resolved endpoint/credential (gate inputs equal the layer's own provider/model) — never
	// a behaviour knob (the knobs come uniquely from the SOURCE).
	const cfg: ProviderCfg = {
		provider: selected.spec.provider,
		model: selected.spec.modele,
		endpoint: "https://api.example.test/v1",
		apiKey: "sk-resolved-secret",
	};
	const r1 = project(selected, cfg, "pack-readonly");
	// Re-project the SAME layer to prove the determinism badge (same input ⇒ same hash).
	const r2 = project(selected, cfg, "pack-readonly");
	const impl = r1.impl;
	const hash = impl ? implContentHash(impl) : "(error)";
	const hash2 = r2.impl ? implContentHash(r2.impl) : "(error2)";
	const deterministic = impl !== undefined && hash === hash2;
	const prompt = impl ? assembleSystemPrompt(impl) : "";
	const effectiveSeed =
		impl && impl.seed !== ""
			? impl.seed
			: seedFor(selected.spec, selected.spec.id, "pack-readonly", "rwi");

	return (
		<section
			data-testid="impl-viewer"
			className="rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.viewerHeading}
				</h2>
				<span
					data-testid="viewer-readonly-tag"
					className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
				>
					{labels.viewerReadOnlyTag}
				</span>
				<span
					data-testid="viewer-not-a-layer-tag"
					className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
				>
					{labels.viewerNotALayerTag}
				</span>
			</div>
			<p className="mt-1 text-xs text-muted-foreground">{labels.viewerBody}</p>

			{/* Agent selection — pick which governed layer to project */}
			<div className="mt-3 flex flex-wrap items-center gap-2">
				<label
					htmlFor="viewer-agent-select"
					className="text-xs font-medium text-muted-foreground"
				>
					{labels.viewerSelectLabel}
				</label>
				<select
					id="viewer-agent-select"
					data-testid="viewer-agent-select"
					value={selectedRole}
					onChange={(e) => {
						setSelectedRole(e.target.value);
						setCapVerdict(null); // a stale verdict must not survive an impl change
						setSkillVerdict(null); // BA08 — same: drop a stale skill verdict
					}}
					className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground"
				>
					{AGENTS.map((a) => (
						<option key={a.spec.role} value={a.spec.role}>
							{a.spec.role}
						</option>
					))}
				</select>
				{/* Determinism badge — re-project ⇒ same hash */}
				<span
					data-testid="viewer-determinism"
					data-deterministic={deterministic ? "true" : "false"}
					className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-foreground"
				>
					{deterministic
						? labels.viewerDeterministicTag
						: labels.viewerNonDeterministicTag}
				</span>
			</div>

			{impl ? (
				<div data-testid="viewer-impl" className="mt-4 space-y-4">
					<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
						<div data-testid="viewer-layer-ref">
							<dt className="text-muted-foreground">
								{labels.viewerLayerRefLabel}
							</dt>
							<dd className="font-mono text-foreground">{impl.layerRef}</dd>
						</div>
						<div data-testid="viewer-model">
							<dt className="text-muted-foreground">
								{labels.viewerProviderLabel}
							</dt>
							<dd className="font-mono text-foreground">
								{impl.provider} · {impl.model}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">
								{labels.viewerTemperatureLabel}
							</dt>
							<dd className="font-mono text-foreground">{impl.temperature}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">
								{labels.viewerMaxTurnsLabel}
							</dt>
							<dd className="font-mono text-foreground">{impl.maxTurns}</dd>
						</div>
						<div data-testid="viewer-seed">
							<dt className="text-muted-foreground">
								{labels.viewerSeedLabel}
							</dt>
							<dd className="font-mono text-foreground">
								{impl.seed !== "" ? (
									impl.seed
								) : (
									<span className="text-muted-foreground">
										{labels.viewerSeedDerivedLabel} ({effectiveSeed})
									</span>
								)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">
								{labels.viewerConcurrencyLabel}
							</dt>
							<dd className="font-mono text-foreground">
								{impl.maxConcurrency}
							</dd>
						</div>
						<div className="sm:col-span-2">
							<dt className="text-muted-foreground">
								{labels.viewerResourceLabel}
							</dt>
							<dd className="font-mono text-foreground">
								{impl.resourceLimits.maxMemoryMb}MB ·{" "}
								{impl.resourceLimits.maxCpuMillis}m ·{" "}
								{impl.resourceLimits.maxWallSeconds}s
							</dd>
						</div>
					</dl>

					{/* Resolved capability surface */}
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div>
							<span className="text-xs text-muted-foreground">
								{labels.viewerToolsLabel}
							</span>
							<ul
								data-testid="viewer-tools"
								className="mt-1 space-y-0.5 font-mono text-[0.7rem] text-foreground"
							>
								{impl.tools.length > 0 ? (
									impl.tools.map((tl) => (
										<li key={`${tl.server} ${tl.tool}`}>
											{tl.server} · {tl.tool}
										</li>
									))
								) : (
									<li className="text-muted-foreground">—</li>
								)}
							</ul>
						</div>
						<div>
							<span className="text-xs text-muted-foreground">
								{labels.viewerSkillsLabel}
							</span>
							<ul
								data-testid="viewer-skills"
								className="mt-1 space-y-0.5 font-mono text-[0.7rem] text-foreground"
							>
								{impl.skills.length > 0 ? (
									impl.skills.map((s) => <li key={s}>{s}</li>)
								) : (
									<li className="text-muted-foreground">—</li>
								)}
							</ul>
						</div>
						<div>
							<span className="text-xs text-muted-foreground">
								{labels.viewerHooksLabel}
							</span>
							<ul
								data-testid="viewer-hooks"
								className="mt-1 space-y-0.5 font-mono text-[0.7rem] text-foreground"
							>
								{impl.hooks.map((h) => (
									<li key={`${h.phase} ${h.hook}`}>
										{h.phase} · {h.hook}
										{h.mandatory ? " ★" : ""}
									</li>
								))}
							</ul>
						</div>
					</div>

					{/* Confinement — allowed/forbidden paths, network, exec */}
					<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
						<div data-testid="viewer-allowed-paths">
							<dt className="text-muted-foreground">
								{labels.viewerAllowedPathsLabel}
							</dt>
							<dd className="font-mono text-foreground">
								{impl.allowedPaths.join(" · ") || "—"}
							</dd>
						</div>
						<div data-testid="viewer-forbidden-paths">
							<dt className="text-muted-foreground">
								{labels.viewerForbiddenPathsLabel}
							</dt>
							<dd className="font-mono text-foreground">
								{impl.forbiddenPaths.join(" · ")}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">
								{labels.viewerNetworkLabel}
							</dt>
							<dd>
								{impl.allowedNetworkHosts.length > 0 ? (
									<code
										data-testid="viewer-network"
										className="font-mono text-foreground"
									>
										{impl.allowedNetworkHosts.join(", ")}
									</code>
								) : (
									<span
										data-testid="viewer-network"
										className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground"
									>
										{labels.viewerNoEgressTag}
									</span>
								)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">
								{labels.viewerExecLabel}
							</dt>
							<dd>
								{impl.allowedExec.length > 0 ? (
									<code
										data-testid="viewer-exec"
										className="font-mono text-foreground"
									>
										{impl.allowedExec.join(", ")}
									</code>
								) : (
									<span
										data-testid="viewer-exec"
										className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground"
									>
										{labels.viewerNoExecTag}
									</span>
								)}
							</dd>
						</div>
					</dl>

					{/* Content hash (the determinism badge re-projects to compare it) */}
					<div data-testid="viewer-hash" className="text-xs">
						<span className="text-muted-foreground">
							{labels.viewerHashLabel}:{" "}
						</span>
						<span className="font-mono text-foreground">{hash}</span>
					</div>

					{/* The assembled system prompt (display only) */}
					<div>
						<span className="text-xs text-muted-foreground">
							{labels.viewerPromptLabel}
						</span>
						<pre
							data-testid="viewer-prompt"
							className="mt-1 max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap text-foreground"
						>
							{prompt}
						</pre>
					</div>

					{/* BA07 — the CAPACITY-axis probe: ACTION-CAPABLE. Pick a (server, tool) and
					    run the pure toolAllowed enforcer against this resolved impl. Allowed IFF
					    the pair is a bound tool; otherwise the AGENT_TOOL_NOT_BOUND BlockReason
					    (with its how_to_fix) renders. A below-the-line pure verdict — no truth
					    write — so the control ACTS directly (the wall is respected). */}
					<div
						data-testid="cap-probe"
						className="rounded-lg border border-border bg-muted/30 p-4"
					>
						<h3 className="text-xs font-semibold tracking-tight text-foreground">
							{labels.capProbeHeading}
						</h3>
						<p className="mt-1 text-[0.7rem] text-muted-foreground">
							{labels.capProbeBody}
						</p>
						<div className="mt-3 flex flex-wrap items-end gap-2">
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.capProbeServerLabel}
								<input
									type="text"
									data-testid="cap-probe-server"
									value={probeServer}
									onChange={(e) => setProbeServer(e.target.value)}
									className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
								/>
							</label>
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.capProbeToolLabel}
								<input
									type="text"
									data-testid="cap-probe-tool"
									value={probeTool}
									onChange={(e) => setProbeTool(e.target.value)}
									className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
								/>
							</label>
							<button
								type="button"
								data-testid="cap-probe-run"
								onClick={() =>
									setCapVerdict(toolAllowed(impl, probeServer, probeTool))
								}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								{labels.capProbeButton}
							</button>
						</div>

						{capVerdict !== null ? (
							capVerdict.allowed ? (
								<div
									data-testid="cap-probe-verdict"
									data-allowed="true"
									className="mt-3 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
								>
									{labels.capProbeAllowed}
								</div>
							) : (
								<div
									data-testid="cap-probe-verdict"
									data-allowed="false"
									className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
								>
									<div className="font-medium text-foreground">
										{labels.capProbeDenied}
									</div>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.capProbeBlockReasonLabel}:{" "}
										</span>
										<code
											data-testid="cap-probe-code"
											className="font-mono text-foreground"
										>
											{capVerdict.blockReason?.code}
										</code>
									</div>
									<p className="mt-1 text-muted-foreground">
										{capVerdict.blockReason?.explanation}
									</p>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.capProbeHowToFixLabel}:
										</span>
										<ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
											{capVerdict.blockReason?.howToFix.map((h) => (
												<li key={h}>{h}</li>
											))}
										</ul>
									</div>
								</div>
							)
						) : null}
					</div>

					{/* BA08 — the SKILL-axis probe: ACTION-CAPABLE. Pick a skill name and run the
					    pure skillAllowed enforcer against this resolved impl. Allowed IFF the skill
					    is a bound (Enabled) skill; otherwise the AGENT_SKILL_NOT_BOUND BlockReason
					    (with its how_to_fix) renders. The 3rd of the four declared axes. A
					    below-the-line pure verdict — no truth write — so the control ACTS directly
					    (the wall is respected). */}
					<div
						data-testid="skill-probe"
						className="rounded-lg border border-border bg-muted/30 p-4"
					>
						<h3 className="text-xs font-semibold tracking-tight text-foreground">
							{labels.skillProbeHeading}
						</h3>
						<p className="mt-1 text-[0.7rem] text-muted-foreground">
							{labels.skillProbeBody}
						</p>
						<div className="mt-3 flex flex-wrap items-end gap-2">
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.skillProbeNameLabel}
								<input
									type="text"
									data-testid="skill-probe-name"
									value={probeSkill}
									onChange={(e) => setProbeSkill(e.target.value)}
									className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
								/>
							</label>
							<button
								type="button"
								data-testid="skill-probe-run"
								onClick={() => setSkillVerdict(skillAllowed(impl, probeSkill))}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								{labels.skillProbeButton}
							</button>
						</div>

						{skillVerdict !== null ? (
							skillVerdict.allowed ? (
								<div
									data-testid="skill-probe-verdict"
									data-allowed="true"
									className="mt-3 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
								>
									{labels.skillProbeAllowed}
								</div>
							) : (
								<div
									data-testid="skill-probe-verdict"
									data-allowed="false"
									className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
								>
									<div className="font-medium text-foreground">
										{labels.skillProbeDenied}
									</div>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.skillProbeBlockReasonLabel}:{" "}
										</span>
										<code
											data-testid="skill-probe-code"
											className="font-mono text-foreground"
										>
											{skillVerdict.blockReason?.code}
										</code>
									</div>
									<p className="mt-1 text-muted-foreground">
										{skillVerdict.blockReason?.explanation}
									</p>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.skillProbeHowToFixLabel}:
										</span>
										<ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
											{skillVerdict.blockReason?.howToFix.map((h) => (
												<li key={h}>{h}</li>
											))}
										</ul>
									</div>
								</div>
							)
						) : null}
					</div>

					{/* BA09 — the CONFINEMENT-axis path probe: ACTION-CAPABLE. Enter a target path
					    and run the pure pathAllowed enforcer against this resolved impl. Allowed IFF
					    the path is covered by an AllowedPaths prefix AND outside ForbiddenPaths —
					    the ALLOW-LIST, DISTINCT from the zone deny-list. Otherwise the
					    AGENT_PATH_NOT_ALLOWED BlockReason (with its how_to_fix) renders. The 4th
					    declared axis. A below-the-line pure verdict — no truth write — so the
					    control ACTS directly (the wall is respected). */}
					<div
						data-testid="path-probe"
						className="rounded-lg border border-border bg-muted/30 p-4"
					>
						<h3 className="text-xs font-semibold tracking-tight text-foreground">
							{labels.pathProbeHeading}
						</h3>
						<p className="mt-1 text-[0.7rem] text-muted-foreground">
							{labels.pathProbeBody}
						</p>
						<div className="mt-3 flex flex-wrap items-end gap-2">
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.pathProbeTargetLabel}
								<input
									type="text"
									data-testid="path-probe-target"
									value={probePath}
									onChange={(e) => setProbePath(e.target.value)}
									className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
								/>
							</label>
							<button
								type="button"
								data-testid="path-probe-run"
								onClick={() => setPathVerdict(pathAllowed(impl, probePath))}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								{labels.pathProbeButton}
							</button>
						</div>

						{pathVerdict !== null ? (
							pathVerdict.allowed ? (
								<div
									data-testid="path-probe-verdict"
									data-allowed="true"
									className="mt-3 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
								>
									{labels.pathProbeAllowed}
								</div>
							) : (
								<div
									data-testid="path-probe-verdict"
									data-allowed="false"
									className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
								>
									<div className="font-medium text-foreground">
										{labels.pathProbeDenied}
									</div>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.pathProbeBlockReasonLabel}:{" "}
										</span>
										<code
											data-testid="path-probe-code"
											className="font-mono text-foreground"
										>
											{pathVerdict.blockReason?.code}
										</code>
									</div>
									<p className="mt-1 text-muted-foreground">
										{pathVerdict.blockReason?.explanation}
									</p>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.pathProbeHowToFixLabel}:
										</span>
										<ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
											{pathVerdict.blockReason?.howToFix.map((h) => (
												<li key={h}>{h}</li>
											))}
										</ul>
									</div>
								</div>
							)
						) : null}
					</div>

					{/* BA10 — the MANDATORY-HOOK turn-acceptance gate: ACTION-CAPABLE. Distinct
					    from the four wall axes (zone/capacity/skill/confinement) that gate what an
					    action may TOUCH, this gates whether a TURN may be ACCEPTED: admissible IFF
					    every HooksObligatoires{"{Mandatory:true}"} actually RAN and is GREEN —
					    presence ≠ green. The VERDICT comes from the hook BINARY (the HookVerdict
					    record), never the agent transcript (§8). The fault toggle injects a fault
					    (remove a mandatory hook's verdict ⇒ SKIPPED; redden a present one ⇒ RED) so
					    the operator SEES the gate flip (hook-honesty §5: a hook that never fires is
					    dead). A below-the-line pure verdict — no truth write — so the control ACTS
					    directly (the wall is respected). */}
					<div
						data-testid="hook-gate"
						className="rounded-lg border border-border bg-muted/30 p-4"
					>
						<h3 className="text-xs font-semibold tracking-tight text-foreground">
							{labels.hookGateHeading}
						</h3>
						<p className="mt-1 text-[0.7rem] text-muted-foreground">
							{labels.hookGateBody}
						</p>
						<div className="mt-3 flex flex-wrap items-end gap-2">
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.hookGateFaultLabel}
								<select
									data-testid="hook-gate-fault"
									value={hookFault}
									onChange={(e) =>
										setHookFault(e.target.value as "none" | "skipped" | "red")
									}
									className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
								>
									<option value="none">{labels.hookGateFaultNone}</option>
									<option value="skipped">{labels.hookGateFaultSkipped}</option>
									<option value="red">{labels.hookGateFaultRed}</option>
								</select>
							</label>
							<button
								type="button"
								data-testid="hook-gate-run"
								onClick={() => {
									// Build per-hook VERDICTS from the hook binary's outcome (here
									// the operator simulates the binary via the fault toggle). Green
									// for every mandatory hook, then inject the fault on the FIRST
									// mandatory one: "skipped" REMOVES its verdict, "red" reddens it.
									const mandatory = impl.hooks.filter((h) => h.mandatory);
									const verdicts: HookVerdict[] = [];
									mandatory.forEach((h, idx) => {
										if (idx === 0 && hookFault === "skipped") {
											return; // remove → never ran → SKIPPED
										}
										verdicts.push({
											phase: h.phase,
											hook: h.hook,
											ran: true,
											green: !(idx === 0 && hookFault === "red"),
										});
									});
									setHookVerdict(hooksSatisfied(impl, verdicts));
									setHookRan(true);
								}}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								{labels.hookGateButton}
							</button>
						</div>

						{hookRan ? (
							hookVerdict === null ? (
								<div
									data-testid="hook-gate-verdict"
									data-accepted="true"
									className="mt-3 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
								>
									{labels.hookGateAccepted}
								</div>
							) : (
								<div
									data-testid="hook-gate-verdict"
									data-accepted="false"
									className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
								>
									<div className="font-medium text-foreground">
										{labels.hookGateRefused}
									</div>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.hookGateBlockReasonLabel}:{" "}
										</span>
										<code
											data-testid="hook-gate-code"
											className="font-mono text-foreground"
										>
											{hookVerdict.code}
										</code>
									</div>
									<p className="mt-1 text-muted-foreground">
										{hookVerdict.explanation}
									</p>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.hookGateHowToFixLabel}:
										</span>
										<ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
											{hookVerdict.howToFix.map((h) => (
												<li key={h}>{h}</li>
											))}
										</ul>
									</div>
								</div>
							)
						) : null}
					</div>

					{/* BA11 — the per-run BUDGET gate: ACTION-CAPABLE. A monotone RunMeter
					    (tokens/turns/ci-minutes/wall-clock) checked against the TWO declared
					    budgets — goal.Budgets (S29) ∧ economics.HarnessCostBudget (S51) — whose
					    effective per-shared-axis cap is min() (the tightest wins, fail-closed).
					    The fault toggle pushes the token tally to the effective cap (within) or
					    one past it (breach) so the operator SEES the verdict flip exactly at the
					    boundary. The min() is the AUTHORITATIVE deterministic rule (§8). A
					    below-the-line pure verdict (no truth write) — it ACTS directly. */}
					<div
						data-testid="budget-gate"
						className="rounded-lg border border-border bg-muted/30 p-4"
					>
						<h3 className="text-xs font-semibold tracking-tight text-foreground">
							{labels.budgetGateHeading}
						</h3>
						<p className="mt-1 text-[0.7rem] text-muted-foreground">
							{labels.budgetGateBody}
						</p>
						<div className="mt-2 text-[0.7rem] text-muted-foreground">
							{labels.budgetGateEffectiveCapLabel}:{" "}
							<code
								data-testid="budget-gate-effcap"
								className="font-mono text-foreground"
							>
								{effectiveTokensCap(BUDGET_S51, BUDGET_S29)}
							</code>{" "}
							= min(S29={BUDGET_S29.tokens}, S51=
							{BUDGET_S51.maxLlmTokensPerGoal})
						</div>
						<div className="mt-3 flex flex-wrap items-end gap-2">
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.budgetGateFaultLabel}
								<select
									data-testid="budget-gate-fault"
									value={budgetFault}
									onChange={(e) =>
										setBudgetFault(e.target.value as "within" | "exceeded")
									}
									className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
								>
									<option value="within">{labels.budgetGateFaultWithin}</option>
									<option value="exceeded">
										{labels.budgetGateFaultExceeded}
									</option>
								</select>
							</label>
							<button
								type="button"
								data-testid="budget-gate-run"
								onClick={() => {
									const eff = effectiveTokensCap(BUDGET_S51, BUDGET_S29);
									const tokens = budgetFault === "exceeded" ? eff + 1 : eff;
									setBudgetVerdict(
										checkBudget(
											{ tokens, turns: 1, ciMinutes: 1, wallClockSecs: 10 },
											BUDGET_S51,
											BUDGET_S29,
											BUDGET_RATE,
										),
									);
								}}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								{labels.budgetGateButton}
							</button>
						</div>

						{budgetVerdict !== null ? (
							budgetVerdict.withinBudget ? (
								<div
									data-testid="budget-gate-verdict"
									data-within="true"
									className="mt-3 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
								>
									{labels.budgetGateWithin} (coût {budgetVerdict.costAware})
								</div>
							) : (
								<div
									data-testid="budget-gate-verdict"
									data-within="false"
									className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
								>
									<div className="font-medium text-foreground">
										{labels.budgetGateExceeded} —{" "}
										<span data-testid="budget-gate-axis">
											{budgetVerdict.breachedAxis}
										</span>
									</div>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.budgetGateBlockReasonLabel}:{" "}
										</span>
										<code
											data-testid="budget-gate-code"
											className="font-mono text-foreground"
										>
											{budgetVerdict.blockReason?.code}
										</code>
									</div>
									<p className="mt-1 text-muted-foreground">
										{budgetVerdict.blockReason?.explanation}
									</p>
									<div className="mt-1">
										<span className="text-muted-foreground">
											{labels.budgetGateHowToFixLabel}:
										</span>
										<ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
											{budgetVerdict.blockReason?.howToFix.map((h) => (
												<li key={h}>{h}</li>
											))}
										</ul>
									</div>
								</div>
							)
						) : null}
					</div>

					{/* BA12 — the determinism-first ARBITER gate. Pick a demo action, optionally
					    RE-LABEL its claimed intent, run the pure arbitrate gate: the verdict is
					    computed from the STRUCTURE (tool + args) only — re-labelling cannot move it
					    (gap D1); a deterministic structure is never LLMGated (gap D3). "Requested
					    LLM" exercises arbitrateGated: a determinism gap BLOCKS with
					    AGENT_DETERMINISM_GAP. A below-the-line pure verdict — it ACTS directly. */}
					<div
						data-testid="arbiter-gate"
						className="rounded-lg border border-border bg-muted/30 p-4"
					>
						<h3 className="text-xs font-semibold tracking-tight text-foreground">
							{labels.arbiterGateHeading}
						</h3>
						<p className="mt-1 text-[0.7rem] text-muted-foreground">
							{labels.arbiterGateBody}
						</p>
						<div className="mt-3 flex flex-wrap items-end gap-2">
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.arbiterGateActionLabel}
								<select
									data-testid="arbiter-gate-action"
									value={String(arbActionIdx)}
									onChange={(e) => setArbActionIdx(Number(e.target.value))}
									className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
								>
									{ARBITER_ACTIONS.map((a, i) => (
										<option key={a.key} value={String(i)}>
											{a.action.tool} {a.action.args.join(" ")}
										</option>
									))}
								</select>
							</label>
							<label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
								{labels.arbiterGateLabelLabel}
								<input
									data-testid="arbiter-gate-label"
									value={arbLabel}
									onChange={(e) => setArbLabel(e.target.value)}
									placeholder={labels.arbiterGateLabelPlaceholder}
									className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
								/>
							</label>
							<label className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
								<input
									type="checkbox"
									data-testid="arbiter-gate-llm"
									checked={arbRequestedLlm}
									onChange={(e) => setArbRequestedLlm(e.target.checked)}
								/>
								{labels.arbiterGateRequestedLlmLabel}
							</label>
							<button
								type="button"
								data-testid="arbiter-gate-run"
								onClick={() => {
									const base = ARBITER_ACTIONS[arbActionIdx].action;
									const action: AgentAction = {
										...base,
										displayedIntent: arbLabel,
										requestedLlm: arbRequestedLlm,
									};
									setArbVerdict(arbitrate(action));
									setArbGap(arbitrateGated(action));
									// BA13 — the SAME button runs the COMPOSED gate over the resolved
									// impl: ALL axes, one verdict, in precedence. The determinism axis is
									// INSIDE the gate (first), not beside it — re-labelling the displayed
									// intent cannot move the verdict (intent by structure). The other axes
									// pass for this below-the-line action, so the gate surfaces the
									// determinism verdict as the live "what would be refused" preview.
									// Target a path inside the resolved impl's OWN allow-list (so the
									// confinement axis passes for the in-bounds demo) — the gate then
									// surfaces the determinism axis as the headline verdict.
									const allow = impl?.allowedPaths[0] ?? "";
									const gateInput: GateActionInput = {
										agentAction: action,
										target: allow ? `${allow}/demo.ts` : undefined,
									};
									setGateDecision(
										impl
											? gateAction(
													impl,
													gateInput,
													{
														tokens: 1,
														turns: 1,
														ciMinutes: 0,
														wallClockSecs: 1,
													},
													BUDGET_S51,
													BUDGET_S29,
													BUDGET_RATE,
													impl.hooks.map((h) => ({
														phase: h.phase,
														hook: h.hook,
														ran: true,
														green: true,
													})),
												)
											: null,
									);
								}}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								{labels.arbiterGateButton}
							</button>
						</div>

						{arbVerdict !== null ? (
							<div className="mt-3 space-y-2">
								<div
									data-testid="arbiter-gate-verdict"
									data-kind={arbVerdict.kind}
									className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground"
								>
									{arbVerdict.kind === "DeterministicTool" ? (
										<span>
											{labels.arbiterGateDeterministic} →{" "}
											<code
												data-testid="arbiter-gate-tool"
												className="font-mono"
											>
												{arbVerdict.tool}
											</code>
										</span>
									) : (
										<span data-testid="arbiter-gate-llmgated">
											{labels.arbiterGateLlmGated}
										</span>
									)}
								</div>
								{arbGap ? (
									<div
										data-testid="arbiter-gate-block"
										className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
									>
										<div className="font-medium text-foreground">
											{labels.arbiterGateBlocked} —{" "}
											<code
												data-testid="arbiter-gate-code"
												className="font-mono text-foreground"
											>
												{arbGap.code}
											</code>
										</div>
										<p className="mt-1 text-muted-foreground">
											{arbGap.explanation}
										</p>
										<div className="mt-1">
											<span className="text-muted-foreground">
												{labels.budgetGateHowToFixLabel}:
											</span>
											<ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
												{arbGap.howToFix.map((h) => (
													<li key={h}>{h}</li>
												))}
											</ul>
										</div>
									</div>
								) : null}

								{/* BA13 — the COMPOSED perimeter verdict: the live "what would be refused"
								    preview from the SINGLE gateAction over ALL declared axes, in precedence.
								    Allowed ⇒ the whole perimeter passes; denied ⇒ the FIRST axis that
								    refused, with its BlockReason. */}
								{gateDecision !== null ? (
									gateDecision.allowed ? (
										<div
											data-testid="gate-decision"
											data-allowed="true"
											className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
										>
											{labels.arbiterGateComposedAllowed}
										</div>
									) : (
										<div
											data-testid="gate-decision"
											data-allowed="false"
											data-axis={gateDecision.deniedAxis}
											className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
										>
											<div className="font-medium text-foreground">
												{labels.arbiterGateBlocked}:{" "}
												<code
													data-testid="gate-decision-axis"
													className="font-mono text-foreground"
												>
													{gateDecision.deniedAxis}
												</code>{" "}
												—{" "}
												<code
													data-testid="gate-decision-code"
													className="font-mono text-foreground"
												>
													{gateDecision.blockReason?.code}
												</code>
											</div>
											<p className="mt-1 text-muted-foreground">
												{gateDecision.blockReason?.explanation}
											</p>
										</div>
									)
								) : null}
							</div>
						) : null}
					</div>
				</div>
			) : null}

			{/* BA14 — the arch-fitness invariant "one single LLM function". A control runs
			    checkLlmIsolation over the demo import graph; the fault-injection toggle
			    sprinkles a SECOND LLM-SDK import into a non-provider package, flipping the
			    rule RED with its LLM_SDK_IMPORT_OUTSIDE_PROVIDER BlockReason. This makes
			    "the LLM is isolated to one gated exception" an ENFORCED rule, not prose. */}
			<div
				data-testid="llm-iso-section"
				className="mt-6 rounded-lg border border-border bg-card p-4"
			>
				<h3 className="text-sm font-semibold text-foreground">
					{labels.llmIsoHeading}
				</h3>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.llmIsoBody}
				</p>
				<label className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
					<input
						type="checkbox"
						data-testid="llm-iso-fault"
						checked={llmIsoFault}
						onChange={(e) => setLlmIsoFault(e.target.checked)}
					/>
					{labels.llmIsoFaultLabel}
				</label>
				<button
					type="button"
					data-testid="llm-iso-run"
					onClick={() => {
						const graph: ImportGraph = llmIsoFault
							? {
									packages: LLM_ISO_CLEAN_GRAPH.packages.map((p) =>
										p.importPath === LLM_ISO_FAULT_PKG
											? { ...p, imports: [...p.imports, LLM_ISO_FAULT_IMPORT] }
											: p,
									),
								}
							: LLM_ISO_CLEAN_GRAPH;
						setLlmIsoViolations(checkLlmIsolation(graph, LLM_ISO_POLICY));
					}}
					className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.llmIsoButton}
				</button>
				{llmIsoViolations !== null ? (
					llmIsoViolations.length === 0 ? (
						<div
							data-testid="llm-iso-verdict"
							data-passed="true"
							className="mt-3 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground"
						>
							{labels.llmIsoGreen}
						</div>
					) : (
						<div
							data-testid="llm-iso-verdict"
							data-passed="false"
							className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
						>
							<div className="font-medium text-foreground">
								{labels.llmIsoRed}:{" "}
								<code
									data-testid="llm-iso-code"
									className="font-mono text-foreground"
								>
									{llmIsoViolations[0].blockReason.code}
								</code>
							</div>
							<p
								data-testid="llm-iso-offender"
								className="mt-1 text-muted-foreground"
							>
								<code className="font-mono">{llmIsoViolations[0].package}</code>{" "}
								→{" "}
								<code className="font-mono">{llmIsoViolations[0].import}</code>
							</p>
							<p className="mt-1 text-muted-foreground">
								{llmIsoViolations[0].blockReason.explanation}
							</p>
						</div>
					)
				) : null}
			</div>
		</section>
	);
}

export function AgentsPanel({ labels }: { labels: Labels }) {
	const [proposal, setProposal] = useState<ReturnType<typeof propose> | null>(
		null,
	);
	const [selfApprove, setSelfApprove] = useState<ReturnType<
		typeof approve
	> | null>(null);
	const [recorded, setRecorded] = useState(false);
	// BA15 — the loop shell (Drive) control: a fault toggle injects an above-the-line write
	// on the first turn; the run computes drive() over the demo script, proving the wall
	// holds (the above-line write is autorisee:false) and the Result is computed by isClosed.
	const [driveFault, setDriveFault] = useState<boolean>(false);
	const [driveRun, setDriveRun] = useState<AgentRun | null>(null);
	// BA19 — the agentloop MCP Run controls: pick a scenario + a tool-binding fault, run
	// driveAgentloop (gate at the transport boundary, then drive), render the live action
	// timeline with per-action wall verdicts (or the boundary refusal) — never writes truth.
	const [runScenario, setRunScenario] = useState<AgentloopScenario>("happy");
	const [runUnbound, setRunUnbound] = useState<boolean>(false);
	const [runResult, setRunResult] = useState<AgentloopDriveResult | null>(null);
	// BA16 — the deterministic POST-CHECK control: after EACH action the loop re-checks per
	// nature (mirror/shape/no-op). The fault toggle makes the agent CLAIM a code flip the
	// sensor DISAGREES with — proving the post-check rejects it (the mirror is the judge, §8)
	// and the goal stays red, invariant to the agent's claimed confidence.
	const [postFault, setPostFault] = useState<boolean>(false);
	const [postRun, setPostRun] = useState<AgentRun | null>(null);
	// BA17 — sandbox defense-in-depth proof
	const [sandboxFault, setSandboxFault] = useState<boolean>(false);
	const [sandboxWrite, setSandboxWrite] = useState<WriteVerdict | null>(null);
	const [sandboxEgress, setSandboxEgress] = useState<EgressVerdict | null>(
		null,
	);
	const [egressVerdict, setEgressVerdict] = useState<boolean | null>(null);
	const [execVerdict, setExecVerdict] = useState<boolean | null>(null);
	const [implVerdict, setImplVerdict] = useState<string | null | undefined>(
		undefined,
	);
	const [projectResult, setProjectResult] = useState<{
		hash: string;
		stable: boolean;
		cfgIgnored: boolean;
	} | null>(null);
	const [promptResult, setPromptResult] = useState<{
		prompt: string;
		stable: boolean;
		noLeak: boolean;
		carriesWall: boolean;
	} | null>(null);
	const [bindingsResult, setBindingsResult] = useState<{
		tools: { server: string; tool: string }[];
		skills: string[];
		hooks: { phase: string; hook: string; mandatory: boolean }[];
		toolsSubset: boolean;
		skillsSubset: boolean;
		mandatorySurvives: boolean;
		narrowed: boolean;
	} | null>(null);
	// BA18 — the identity/auth fault selector (own | other | empty) + the verdict the
	// loop's presented capability token earns against the server's expected identity.
	const [identityFault, setIdentityFault] = useState<"own" | "other" | "empty">(
		"own",
	);
	const [identityResult, setIdentityResult] = useState<{
		presented: string;
		verdict: IdentityVerdict;
	} | null>(null);
	// BA26 — the REPLAY ENVELOPE control: build a recorded run as either a LEGACY (seedless)
	// run — readable, no replay fields — or a REPLAY-bearing run that carries impl + seed +
	// providerTranscript (supersede-via-version, anti-overwrite §9). The panel computes the
	// run-grain seed (runSeed, declared-wins/derive-as-fallback) and the replay-coherence
	// verdict (agentRunReplayCoherent), proving a legacy run stays readable while a new run
	// carries a deterministic seed. No truth write — a run is below the line.
	const [replayMode, setReplayMode] = useState<"legacy" | "replay">("replay");
	const [replayRun, setReplayRun] = useState<AgentRun | null>(null);

	// BA27 — the live meter + halt-on-budget + the economics feed. The "tight" cap forces a
	// pre-call halt (the breaching turn never starts); "loose" runs to completion. The Build
	// control computes (run, meter) BELOW the line then feeds the meter to economics.evaluate.
	const [economicsCap, setEconomicsCap] = useState<"tight" | "loose">("tight");
	const [economicsResult, setEconomicsResult] = useState<{
		run: AgentRun;
		meter: RunMeter;
		decision: EconomicsDecision;
	} | null>(null);

	// BA28 — REPLAY + REDACTED transcript. The control redacts a secret-bearing transcript
	// (gap H1: the ledger is not a secret store) and replays the recorded run, asserting the
	// re-derivation is id-stable (Replay(run).ID == run.ID) and no secret survives verbatim. No
	// truth write — a run is below the line; redaction runs BEFORE the transcript is shown.
	const [ba28Result, setBa28Result] = useState<{
		raw: TranscriptTs;
		redacted: TranscriptTs;
		run: AgentRun;
		replayedId: string;
		matches: boolean;
		leaked: boolean;
	} | null>(null);

	// BA29 — the fidelity-to-reality LEDGER: runs + boundary effect-log reconciled.
	const [ledger, setLedger] = useState<Ledger | null>(null);
	const [signals, setSignals] = useState<SignalView | null>(null);

	// BA31 — the « Learnings » on-ramp: a failed/abandoned/green-hollow run becomes a DRAFT idea
	// (proposed, never applied) via reality.Observe→Learn→ToIdea; and the provenance-verified apply
	// gate (gap J1) — a FORGED Status:"admitted" with no admitting authority record is refused.
	const [learnings, setLearnings] = useState<LearningView | null>(null);
	const [applyVerdict, setApplyVerdict] = useState<ApplyDecision | null>(null);

	// HR05 — the « Compression / économie » section: tokens before/after PER recorded run, computed
	// by the pure perRunEconomy projection (lib/context-compressor) from the SCREEN. null until the
	// human clicks "Mesurer l'économie par run" (action-capable, no headless capability).
	const [economyReport, setEconomyReport] = useState<PerRunEconomy | null>(
		null,
	);

	const run = RECENT_RUN;

	// BA02 — the AgentImplementation PROJECTION of the bdd-writer: a below-the-line,
	// regenerable struct carrying NO truth (no version, no mirror) — a ref back to
	// CoucheAgent@version only. ForbiddenPaths ALWAYS carries the wall. (A preview of the
	// BA03 emitter; here it is hand-assembled from the governed knobs for display.)
	const bddImpl: AgentImplementation = {
		layerRef: `${BDD_WRITER.spec.id}@${BDD_WRITER.spec.id}`,
		role: BDD_WRITER.spec.role,
		objectif: BDD_WRITER.spec.objectif,
		stopConditions: BDD_WRITER.spec.stopConditions,
		provider: BDD_WRITER.spec.provider,
		model: BDD_WRITER.spec.modele,
		temperature: BDD_WRITER.spec.temperature,
		maxTurns: BDD_WRITER.spec.maxTurns,
		seed: seedFor(BDD_WRITER.spec, BDD_WRITER.spec.id, "pack", "item"),
		tools: BDD_WRITER.mcp
			.filter((m) => m.enabled)
			.map((m) => ({ server: m.server, tool: m.tool })),
		skills: BDD_WRITER.skills.filter((s) => s.enabled).map((s) => s.skillName),
		hooks: BDD_WRITER.hooks.map((h) => ({
			phase: h.phase,
			hook: h.hook,
			mandatory: h.mandatory,
		})),
		allowedPaths: ["front/web", "back/gen"],
		forbiddenPaths: wallForbiddenPaths(),
		allowedNetworkHosts: BDD_WRITER.spec.allowedNetworkHosts,
		allowedExec: BDD_WRITER.spec.allowedExec,
		resourceLimits: BDD_WRITER.spec.resourceLimits,
		maxConcurrency: BDD_WRITER.spec.maxConcurrency,
	};

	// BA02 action: run the pure validateImpl on the projection from the screen. The
	// projection is fail-closed valid; egress is denied (max confinement).
	function onValidateImpl() {
		setImplVerdict(validateImpl(bddImpl));
	}

	// BA03 action: run the DETERMINISTIC EMITTER project() from the screen, twice, with
	// the SAME (layer, cfg, pack) and then with a perturbed cfg (different endpoint/key).
	// Proves, executably: (1) byte-stability — same inputs ⇒ identical content-hash;
	// (2) the cfg carries NO behaviour knob — perturbing endpoint/key leaves the hash
	// identical. This is the pure emitter, no I/O, no clock.
	function onProject() {
		const baseCfg: ProviderCfg = {
			provider: BDD_WRITER.spec.provider,
			model: BDD_WRITER.spec.modele,
			endpoint: "https://api.example.test/v1",
			apiKey: "sk-resolved-secret",
		};
		const r1 = project(BDD_WRITER, baseCfg, "pack-1");
		const r2 = project(BDD_WRITER, baseCfg, "pack-1");
		const r3 = project(
			BDD_WRITER,
			{ ...baseCfg, endpoint: "https://OTHER/v2", apiKey: "sk-different" },
			"pack-1",
		);
		if (!r1.impl || !r2.impl || !r3.impl) {
			setProjectResult({ hash: "(error)", stable: false, cfgIgnored: false });
			return;
		}
		const h1 = implContentHash(r1.impl);
		const h2 = implContentHash(r2.impl);
		const h3 = implContentHash(r3.impl);
		setProjectResult({
			hash: h1,
			stable: h1 === h2,
			cfgIgnored: h1 === h3,
		});
	}

	// BA18 action: PRESENT the loop's capability token and have the MCP server VERIFY it,
	// from the screen. The loop presents the content-hash of its OWN identity
	// (mintToken(bddImpl) — derived from its CoucheAgent@version, not chain-declared). The
	// server expects a given identity and accepts ONLY if the token binds the caller to
	// EXACTLY that one (verifyToken). The fault selector forges the three refusal cases:
	// "own" (the right identity ⇒ accepted), "other" (a token for ANOTHER identity ⇒
	// refused — no forgeable owner_agent), "empty" (no token ⇒ refused fail-closed). PURE
	// (mintToken/verifyToken), no I/O, no clock — the verdict is COMPUTED.
	function onVerifyIdentity() {
		const presented =
			identityFault === "empty"
				? ""
				: identityFault === "other"
					? mintToken({ ...bddImpl, layerRef: "agent:other@v9" })
					: mintToken(bddImpl);
		setIdentityResult({
			presented,
			verdict: verifyToken(presented, bddImpl.layerRef),
		});
	}

	// BA04 action: ASSEMBLE the SystemPrompt deterministically from the projection,
	// from the screen. Proves, executably: (1) byte-stability — same projection ⇒
	// identical prompt; (2) no out-of-layer leak — perturbing a NON-declared knob
	// (seed/temperature/model/bindings) leaves the prompt byte-identical; (3) the wall
	// is always carried (every kernel/mirror forbidden zone appears verbatim). PURE
	// template, no I/O, no clock — the prompt is NEVER hand-authored.
	function onAssemblePrompt() {
		const p1 = assembleSystemPrompt(bddImpl);
		const p2 = assembleSystemPrompt(bddImpl);
		const perturbed: AgentImplementation = {
			...bddImpl,
			seed: "a-different-seed-value",
			temperature: 1.9,
			model: "claude-haiku-4-5",
			layerRef: "agentlayer:OTHER",
			tools: [{ server: "leak", tool: "leak" }],
			skills: ["leaked-skill"],
		};
		const p3 = assembleSystemPrompt(perturbed);
		const carriesWall = wallForbiddenPaths().every((w) => p1.includes(w));
		setPromptResult({
			prompt: p1,
			stable: p1 === p2,
			noLeak: p1 === p3,
			carriesWall,
		});
	}

	// BA05 action: RESOLVE the bindings from the screen — tools only from ENABLED MCP
	// bindings, skills only from ENABLED skill bindings, hooks preserving Mandatory.
	// Proves, executably, the one law: GOVERNANCE CAN ONLY NARROW THE CAPABILITY SURFACE,
	// never widen it — (1) ResolvedTools ⊆ enabled declared bindings; (2) ResolvedSkills ⊆
	// enabled skills; (3) a Mandatory hook always survives; (4) the resolved surface is
	// strictly SMALLER than what is declared (a disabled binding/skill was dropped). PURE,
	// no I/O, no clock — same as the Go resolvers.
	function onResolveBindings() {
		const tools = resolveTools(BDD_WRITER.mcp);
		const skills = resolveSkills(BDD_WRITER.skills);
		const hooks = resolveHooks(BDD_WRITER.hooks);
		// (1) ⊆ enabled declared MCP bindings
		const enabledTools = new Set(
			BDD_WRITER.mcp
				.filter((b) => b.enabled)
				.map((b) => `${b.server} ${b.tool}`),
		);
		const toolsSubset = tools.every((t) =>
			enabledTools.has(`${t.server} ${t.tool}`),
		);
		// (2) ⊆ enabled declared skills
		const enabledSkills = new Set(
			BDD_WRITER.skills.filter((b) => b.enabled).map((b) => b.skillName),
		);
		const skillsSubset = skills.every((s) => enabledSkills.has(s));
		// (3) every Mandatory hook survives
		const mandatorySurvives = BDD_WRITER.hooks
			.filter((h) => h.mandatory)
			.every((h) =>
				hooks.some(
					(r) => r.phase === h.phase && r.hook === h.hook && r.mandatory,
				),
			);
		// (4) the surface narrowed: at least one declared binding/skill was dropped
		// (the governed layer carries disabled bindings the projection must exclude).
		const narrowed =
			tools.length < BDD_WRITER.mcp.length ||
			skills.length < BDD_WRITER.skills.length ||
			BDD_WRITER.mcp.some((b) => !b.enabled) ||
			BDD_WRITER.skills.some((b) => !b.enabled);
		setBindingsResult({
			tools,
			skills,
			hooks,
			toolsSubset,
			skillsSubset,
			mandatorySurvives,
			narrowed,
		});
	}

	// BA01 confinement check: the bdd-writer is MAX-confined (empty allow-lists), so
	// these pure ops MUST deny — proving fail-closed defaults from the screen.
	function onCheckEgress() {
		setEgressVerdict(egressAllowed(BDD_WRITER.spec, "api.anthropic.com"));
	}
	function onCheckExec() {
		setExecVerdict(execAllowed(BDD_WRITER.spec, "curl"));
	}

	function onPropose() {
		setProposal(propose(BDD_WRITER, labels.proposeScenario));
	}
	function onSelfApprove() {
		const p = proposal ?? propose(BDD_WRITER, labels.proposeScenario);
		setProposal(p);
		// the agent attempts to approve its OWN proposal — refused (never an authority).
		setSelfApprove(approve(BDD_WRITER, p, BDD_WRITER.spec.role));
	}

	return (
		<div className="space-y-10">
			{/* Agent layers */}
			<section
				data-testid="agent-layers"
				aria-label={labels.layersHeading}
				className="space-y-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.layersHeading}
				</h2>
				<div className="space-y-4">
					{AGENTS.map((c) => (
						<AgentCard key={c.spec.role} c={c} labels={labels} />
					))}
				</div>
			</section>

			{/* Recent AgentRun — a single execution is NOT a layer (a runtime event) */}
			<section
				data-testid="recent-run"
				aria-label={labels.runHeading}
				className="rounded-xl border border-border bg-card p-5 shadow-sm"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.runHeading}
					</h2>
					<span
						data-testid="not-a-layer-tag"
						className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
					>
						{labels.notALayerTag}
					</span>
				</div>
				<dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
					<div>
						<dt className="text-muted-foreground">{labels.runAgentLabel}</dt>
						<dd className="font-mono text-foreground">{run.agent}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.runGoalLabel}</dt>
						<dd className="font-mono text-foreground">{run.goal}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.runItemLabel}</dt>
						<dd className="font-mono text-foreground">{run.redWorkItem}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{labels.runResultLabel}</dt>
						<dd className="font-mono text-foreground">{run.result}</dd>
					</div>
				</dl>

				<h3 className="mt-4 text-xs font-semibold tracking-tight text-foreground">
					{labels.actionsHeading}
				</h3>
				<div className="mt-2 space-y-2">
					{run.actions.map((a, i) => {
						const refused = !a.autorisee;
						return (
							<div
								key={`${a.type}-${a.cible}`}
								data-testid={`run-action-${i}`}
								data-autorisee={a.autorisee ? "true" : "false"}
								className={`rounded-lg border p-3 ${refused ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}
							>
								<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
									<span className="text-foreground">
										<code className="font-mono">{a.type}</code> →{" "}
										<code className="font-mono">{a.cible}</code>
									</span>
									{refused ? (
										<span className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
											{labels.refusedTag}
										</span>
									) : (
										<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
											{labels.allowedTag}
										</span>
									)}
								</div>
								{a.raisonBlocage ? (
									<div className="mt-2 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
										<div className="text-xs font-medium text-destructive">
											{labels.reasonLabel}:{" "}
											<code
												data-testid={`run-action-${i}-code`}
												className="font-mono"
											>
												{a.raisonBlocage.code}
											</code>
										</div>
										<div className="text-xs text-muted-foreground">
											{labels.howToFixLabel}:
										</div>
										<ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
											{a.raisonBlocage.howToFix.map((fix) => (
												<li key={fix}>{fix}</li>
											))}
										</ol>
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</section>

			{/* BA01 — action-capable confinement check (empty defaults = fail-closed) */}
			<section
				data-testid="confinement"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.confinementHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.confinementBody}
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						data-testid="check-egress-button"
						onClick={onCheckEgress}
						className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
					>
						{labels.checkEgressButton}
					</button>
					<button
						type="button"
						data-testid="check-exec-button"
						onClick={onCheckExec}
						className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
					>
						{labels.checkExecButton}
					</button>
				</div>
				{egressVerdict !== null ? (
					<p
						data-testid="egress-verdict"
						data-allowed={egressVerdict ? "true" : "false"}
						className="mt-3 inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
					>
						{labels.networkLabel}:{" "}
						{egressVerdict ? labels.allowedTag : labels.deniedTag}
					</p>
				) : null}
				{execVerdict !== null ? (
					<p
						data-testid="exec-verdict"
						data-allowed={execVerdict ? "true" : "false"}
						className="mt-3 ml-2 inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
					>
						{labels.execLabel}:{" "}
						{execVerdict ? labels.allowedTag : labels.deniedTag}
					</p>
				) : null}
			</section>

			{/* BA02 — the AgentImplementation projection (below the line, no truth) */}
			<section
				data-testid="implementation"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.implHeading}
					</h2>
					<span
						data-testid="impl-not-a-layer-tag"
						className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
					>
						{labels.implNotALayerTag}
					</span>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">{labels.implBody}</p>
				<dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
					<div data-testid="impl-layer-ref">
						<dt className="text-muted-foreground">
							{labels.implLayerRefLabel}
						</dt>
						<dd className="font-mono text-foreground">{bddImpl.layerRef}</dd>
					</div>
					<div data-testid="impl-model">
						<dt className="text-muted-foreground">{labels.implModelLabel}</dt>
						<dd className="font-mono text-foreground">
							{bddImpl.provider} · {bddImpl.model}
						</dd>
					</div>
					<div data-testid="impl-forbidden" className="sm:col-span-2">
						<dt className="text-muted-foreground">
							{labels.implForbiddenLabel}
						</dt>
						<dd className="font-mono text-foreground">
							{bddImpl.forbiddenPaths.join(" · ")}
						</dd>
					</div>
				</dl>
				<button
					type="button"
					data-testid="impl-validate-button"
					onClick={onValidateImpl}
					className="mt-3 inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
				>
					{labels.implValidateButton}
				</button>
				{implVerdict !== undefined ? (
					<p
						data-testid="impl-verdict"
						data-valid={implVerdict === null ? "true" : "false"}
						className="mt-3 inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-foreground"
					>
						{implVerdict === null ? labels.implValidTag : implVerdict}
					</p>
				) : null}
			</section>

			{/* BA03 — the DETERMINISTIC EMITTER project(): byte-stable, cfg without knob */}
			<section
				data-testid="emitter"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.emitterHeading}
					</h2>
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{labels.emitterPureTag}
					</span>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.emitterBody}
				</p>
				<button
					type="button"
					data-testid="emitter-project-button"
					onClick={onProject}
					className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{labels.emitterProjectButton}
				</button>
				{projectResult !== null ? (
					<div data-testid="emitter-result" className="mt-3 space-y-2 text-xs">
						<p data-testid="emitter-hash">
							<span className="text-muted-foreground">
								{labels.emitterHashLabel}:{" "}
							</span>
							<span className="font-mono text-foreground">
								{projectResult.hash}
							</span>
						</p>
						<p
							data-testid="emitter-stable"
							data-stable={projectResult.stable ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{projectResult.stable
								? labels.emitterStableTag
								: labels.emitterUnstableTag}
						</p>{" "}
						<p
							data-testid="emitter-cfg-ignored"
							data-ignored={projectResult.cfgIgnored ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{projectResult.cfgIgnored
								? labels.emitterCfgIgnoredTag
								: labels.emitterCfgLeakTag}
						</p>
					</div>
				) : null}
			</section>

			{/* BA18 — AGENT IDENTITY/AUTH: the loop presents its capability token; the server verifies it */}
			<section
				data-testid="identity"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.identityHeading}
					</h2>
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{labels.identityPureTag}
					</span>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.identityBody}
				</p>
				<p className="mt-2 text-xs text-muted-foreground">
					{labels.identityExpectedLabel}:{" "}
					<span className="font-mono text-foreground">{bddImpl.layerRef}</span>
				</p>
				<label
					htmlFor="identity-fault"
					className="mt-3 block text-xs font-medium text-muted-foreground"
				>
					{labels.identityFaultLabel}
				</label>
				<select
					id="identity-fault"
					data-testid="identity-fault"
					value={identityFault}
					onChange={(e) =>
						setIdentityFault(e.target.value as "own" | "other" | "empty")
					}
					className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
				>
					<option value="own">{labels.identityFaultOwn}</option>
					<option value="other">{labels.identityFaultOther}</option>
					<option value="empty">{labels.identityFaultEmpty}</option>
				</select>
				<button
					type="button"
					data-testid="identity-verify-button"
					onClick={onVerifyIdentity}
					className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{labels.identityButton}
				</button>
				{identityResult !== null ? (
					<div data-testid="identity-result" className="mt-3 space-y-2 text-xs">
						<p data-testid="identity-presented">
							<span className="text-muted-foreground">
								{labels.identityPresentedLabel}:{" "}
							</span>
							<span className="font-mono text-foreground">
								{identityResult.presented === ""
									? "∅"
									: identityResult.presented}
							</span>
						</p>
						<p
							data-testid="identity-verdict"
							data-verified={identityResult.verdict.verified ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{identityResult.verdict.verified
								? labels.identityVerifiedTag
								: labels.identityRefusedTag}
						</p>
						{identityResult.verdict.reason ? (
							<div className="space-y-1">
								<p data-testid="identity-block-reason">
									<span className="text-muted-foreground">
										{labels.identityBlockReasonLabel}:{" "}
									</span>
									<span className="font-mono text-foreground">
										{identityResult.verdict.reason.code}
									</span>
								</p>
								<p className="text-muted-foreground">
									{identityResult.verdict.reason.explanation}
								</p>
								<div>
									<span className="text-muted-foreground">
										{labels.identityHowToFixLabel}:
									</span>
									<ul className="ml-4 list-disc text-muted-foreground">
										{identityResult.verdict.reason.howToFix.map((h) => (
											<li key={h}>{h}</li>
										))}
									</ul>
								</div>
							</div>
						) : null}
					</div>
				) : null}
			</section>

			{/* BA19 — the agentloop MCP Run controls (action-capable, ui-completeness). « Lancer un
			    run » is bound to driveAgentloop (the front twin of the agentloop_drive MCP tool):
			    it GATES at the transport boundary (the run may only call a tool its impl BINDS —
			    the capacity axis), then drives the scenario, rendering the LIVE action timeline with
			    per-action wall verdicts. The wall: launching is BELOW the line; a kernel-write turn
			    is REFUSED in place (AGENT_WRITE_ABOVE_WATERLINE) and the run records NO truth above
			    the waterline; an UNBOUND tool is refused at the boundary (AGENT_TOOL_NOT_BOUND) with
			    no run. Themed (ADR 0010), bilingual (ADR 0011). */}
			<section
				data-testid="agentloop-run"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.runDriveHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.runDriveBody}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-4">
					<label className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
						{labels.runScenarioLabel}:
						<select
							data-testid="agentloop-scenario"
							value={runScenario}
							onChange={(e) =>
								setRunScenario(e.target.value as AgentloopScenario)
							}
							className="rounded border border-border bg-background px-2 py-1 text-foreground"
						>
							<option value="happy">{labels.runScenarioHappy}</option>
							<option value="kernel-write">
								{labels.runScenarioKernelWrite}
							</option>
							<option value="over-budget">
								{labels.runScenarioOverBudget}
							</option>
						</select>
					</label>
					<label className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
						<input
							type="checkbox"
							data-testid="agentloop-unbound"
							checked={runUnbound}
							onChange={(e) => setRunUnbound(e.target.checked)}
						/>
						{labels.runUnboundLabel}
					</label>
				</div>
				<button
					type="button"
					data-testid="agentloop-run-button"
					onClick={() => {
						const runImpl: AgentImplementation = {
							layerRef: "agentlayer:builder@v1",
							role: "builder",
							objectif: "drive a red work item to green in the app tree",
							stopConditions: ["red set still red"],
							provider: "anthropic",
							model: "claude-opus-4-8",
							temperature: 0,
							maxTurns: 80,
							seed: "",
							tools: [{ server: "mirror-runner", tool: "run_mirror" }],
							skills: ["tdd"],
							hooks: [
								{
									phase: "PreToolUse",
									hook: "pretooluse (wall)",
									mandatory: true,
								},
							],
							allowedPaths: ["app"],
							forbiddenPaths: wallForbiddenPaths(),
							allowedNetworkHosts: [],
							allowedExec: ["go"],
							resourceLimits: {
								maxMemoryMb: 4096,
								maxCpuMillis: 8000,
								maxWallSeconds: 1800,
							},
							maxConcurrency: 1,
						};
						// The fault makes the run target a tool its impl does NOT bind, so the
						// transport-boundary capacity check refuses it (AGENT_TOOL_NOT_BOUND).
						const target = runUnbound
							? { server: "some-other-server", tool: "some_other_tool" }
							: { server: "mirror-runner", tool: "run_mirror" };
						setRunResult(
							driveAgentloop(runImpl, runScenario, "redset:checkout#1", target),
						);
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.runDriveButton}
				</button>
				{runResult ? (
					<div className="mt-3 space-y-2 text-xs">
						{runResult.refused ? (
							<div
								data-testid="agentloop-refused"
								className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5"
							>
								<p className="font-medium text-foreground">
									{labels.runRefusedTag}
								</p>
								<p data-testid="agentloop-refused-code">
									<span className="text-muted-foreground">
										{labels.runBlockReasonLabel}:{" "}
									</span>
									<code className="font-mono text-destructive">
										{runResult.blockReason?.code}
									</code>
								</p>
								{runResult.blockReason ? (
									<>
										<p className="text-muted-foreground">
											{runResult.blockReason.explanation}
										</p>
										<ul className="ml-4 list-disc text-muted-foreground">
											{runResult.blockReason.howToFix.map((h) => (
												<li key={h}>{h}</li>
											))}
										</ul>
									</>
								) : null}
							</div>
						) : runResult.run ? (
							<>
								<div
									data-testid="agentloop-result"
									data-result={runResult.run.result}
									className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-medium text-foreground"
								>
									{labels.runResultLabel2}:{" "}
									<code className="font-mono">{runResult.run.result}</code>
								</div>
								<div
									data-testid="agentloop-no-truth"
									data-wrote-truth={
										agentloopWroteNoTruth(runResult.run) ? "false" : "true"
									}
									className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
								>
									{labels.runNoTruthTag}
								</div>
								<ul data-testid="agentloop-timeline" className="space-y-1">
									{runResult.run.actions.map((a, i) => (
										<li
											// The ledger is deterministic; an action's
											// (type, cible, verdict) is its content-stable key.
											key={`${a.type}-${a.cible}-${a.autorisee ? "ok" : (a.raisonBlocage?.code ?? "no")}`}
											data-testid="agentloop-action"
											data-autorisee={a.autorisee ? "true" : "false"}
											className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-2 py-1 text-[0.7rem]"
										>
											<span className="text-muted-foreground">{i + 1}.</span>
											<code className="font-mono text-foreground">
												{a.cible}
											</code>
											<span
												className={
													a.autorisee
														? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
														: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
												}
											>
												{a.autorisee
													? labels.runAllowedTag
													: labels.runRefusedActionTag}
											</span>
											{a.raisonBlocage ? (
												<code
													data-testid="agentloop-action-code"
													className="font-mono text-destructive"
												>
													{a.raisonBlocage.code}
												</code>
											) : null}
										</li>
									))}
								</ul>
								<p className="text-[0.7rem] text-muted-foreground">
									{labels.runComputedNote}
								</p>
							</>
						) : null}
					</div>
				) : null}
			</section>

			{/* BA04 — the DETERMINISTIC SystemPrompt assembly: byte-stable, no leak, wall always present */}
			<section
				data-testid="prompt"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.promptHeading}
					</h2>
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{labels.promptPureTag}
					</span>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.promptBody}
				</p>
				<button
					type="button"
					data-testid="prompt-assemble-button"
					onClick={onAssemblePrompt}
					className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{labels.promptAssembleButton}
				</button>
				{promptResult !== null ? (
					<div data-testid="prompt-result" className="mt-3 space-y-2 text-xs">
						<p
							data-testid="prompt-stable"
							data-stable={promptResult.stable ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{promptResult.stable
								? labels.promptStableTag
								: labels.promptUnstableTag}
						</p>{" "}
						<p
							data-testid="prompt-no-leak"
							data-noleak={promptResult.noLeak ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{promptResult.noLeak
								? labels.promptNoLeakTag
								: labels.promptLeakTag}
						</p>{" "}
						<p
							data-testid="prompt-wall"
							data-wall={promptResult.carriesWall ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{promptResult.carriesWall
								? labels.promptWallTag
								: labels.promptNoWallTag}
						</p>
						<div className="mt-2">
							<span className="text-muted-foreground">
								{labels.promptPreviewLabel}
							</span>
							<pre
								data-testid="prompt-preview"
								className="mt-1 max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap text-foreground"
							>
								{promptResult.prompt}
							</pre>
						</div>
					</div>
				) : null}
			</section>

			{/* BA05 — binding resolution: governance NARROWS, never WIDENS the surface */}
			<section
				data-testid="bindings"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.bindingsHeading}
					</h2>
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{labels.bindingsPureTag}
					</span>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.bindingsBody}
				</p>
				<button
					type="button"
					data-testid="bindings-resolve-button"
					onClick={onResolveBindings}
					className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{labels.bindingsResolveButton}
				</button>
				{bindingsResult !== null ? (
					<div data-testid="bindings-result" className="mt-3 space-y-2 text-xs">
						<p
							data-testid="bindings-tools-subset"
							data-subset={bindingsResult.toolsSubset ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{bindingsResult.toolsSubset
								? labels.bindingsToolsSubsetTag
								: labels.bindingsWidenedTag}
						</p>{" "}
						<p
							data-testid="bindings-skills-subset"
							data-subset={bindingsResult.skillsSubset ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{bindingsResult.skillsSubset
								? labels.bindingsSkillsSubsetTag
								: labels.bindingsWidenedTag}
						</p>{" "}
						<p
							data-testid="bindings-mandatory"
							data-mandatory={
								bindingsResult.mandatorySurvives ? "true" : "false"
							}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{bindingsResult.mandatorySurvives
								? labels.bindingsMandatoryTag
								: labels.bindingsMandatoryDroppedTag}
						</p>{" "}
						<p
							data-testid="bindings-narrowed"
							data-narrowed={bindingsResult.narrowed ? "true" : "false"}
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-medium text-foreground"
						>
							{bindingsResult.narrowed
								? labels.bindingsNarrowedTag
								: labels.bindingsNotNarrowedTag}
						</p>
						<div className="mt-2 grid gap-2 sm:grid-cols-3">
							<div>
								<span className="text-muted-foreground">
									{labels.bindingsToolsLabel}
								</span>
								<ul
									data-testid="bindings-tools"
									className="mt-1 space-y-0.5 font-mono text-[0.7rem] text-foreground"
								>
									{bindingsResult.tools.map((tl) => (
										<li key={`${tl.server} ${tl.tool}`}>
											{tl.server} · {tl.tool}
										</li>
									))}
								</ul>
							</div>
							<div>
								<span className="text-muted-foreground">
									{labels.bindingsSkillsLabel}
								</span>
								<ul
									data-testid="bindings-skills"
									className="mt-1 space-y-0.5 font-mono text-[0.7rem] text-foreground"
								>
									{bindingsResult.skills.map((s) => (
										<li key={s}>{s}</li>
									))}
								</ul>
							</div>
							<div>
								<span className="text-muted-foreground">
									{labels.bindingsHooksLabel}
								</span>
								<ul
									data-testid="bindings-hooks"
									className="mt-1 space-y-0.5 font-mono text-[0.7rem] text-foreground"
								>
									{bindingsResult.hooks.map((h) => (
										<li key={`${h.phase} ${h.hook}`}>
											{h.phase} · {h.hook}
											{h.mandatory ? " ★" : ""}
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				) : null}
			</section>

			{/* BA06 — the selectable, read-only AgentImplementation viewer (no run control) */}
			<ImplementationViewer labels={labels} />

			{/* Action: propose a scenario (it proposes, it never declares) */}
			<section
				data-testid="propose"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.proposeHeading}
				</h2>
				<button
					type="button"
					data-testid="propose-button"
					onClick={onPropose}
					className="mt-3 inline-flex items-center rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{labels.proposeButton}
				</button>
				{proposal ? (
					<div
						data-testid="proposed"
						data-status={proposal.status}
						className="mt-3 space-y-1 rounded-md border border-border bg-muted/40 p-3"
					>
						<p className="text-xs font-medium text-foreground">
							{labels.proposedHeading} ·{" "}
							<code
								data-testid="proposed-status"
								className="font-mono text-primary"
							>
								{labels.statusProposed}
							</code>
						</p>
						<p className="text-xs text-muted-foreground">
							{labels.proposedBody}
						</p>
						<p className="text-xs text-muted-foreground">
							{labels.requiresAuthorityLabel}:{" "}
							<code
								data-testid="proposed-authority"
								className="font-mono text-foreground"
							>
								{proposal.requiresAuthority.join(", ")}
							</code>
						</p>
						<p className="text-xs text-muted-foreground">
							{labels.routeLabel}:{" "}
							<code className="font-mono text-foreground">
								{proposal.route.join(" → ")}
							</code>
						</p>
					</div>
				) : null}
			</section>

			{/* Action: a self-approve attempt — refused (an agent is never an authority) */}
			<section
				data-testid="self-approve"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.selfApproveHeading}
				</h2>
				<button
					type="button"
					data-testid="self-approve-button"
					onClick={onSelfApprove}
					className="mt-3 inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
				>
					{labels.selfApproveButton}
				</button>
				{selfApprove ? (
					<div
						data-testid="self-approve-result"
						data-status={selfApprove.status}
						className="mt-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3"
					>
						<p className="text-xs font-medium text-destructive">
							<code data-testid="self-approve-code" className="font-mono">
								{selfApprove.blockReason?.code}
							</code>
						</p>
						<p className="text-xs text-muted-foreground">
							{labels.selfApproveRefused}
						</p>
					</div>
				) : null}
			</section>

			{/* Action: record an AgentRun (a below-the-line write, executed directly) */}
			<section
				data-testid="record-run"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.recordHeading}
				</h2>
				<button
					type="button"
					data-testid="record-button"
					onClick={() => setRecorded(true)}
					className="mt-3 inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
				>
					{labels.recordButton}
				</button>
				{recorded ? (
					<p
						data-testid="record-done"
						className="mt-3 text-xs text-muted-foreground"
					>
						{labels.recordDone}
					</p>
				) : null}
			</section>

			{/* BA15 — Action: drive the loop shell (a below-the-line run; the LLM is mocked
			    by a deterministic script). The fault toggle injects an above-the-line write
			    on the FIRST turn: the run shows that action autorisee:false (the wall holds,
			    gated BEFORE execution, effect never lands) and the Result is COMPUTED by
			    goal.IsClosed (§8), never self-reported. drive() is the pure front twin of
			    back/runtime/agentloop.Drive. */}
			<section
				data-testid="drive-shell"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.driveHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{labels.driveBody}</p>
				<label className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
					<input
						type="checkbox"
						data-testid="drive-fault"
						checked={driveFault}
						onChange={(e) => setDriveFault(e.target.checked)}
					/>
					{labels.driveFaultLabel}
				</label>
				<button
					type="button"
					data-testid="drive-run"
					onClick={() => {
						const driveImpl: AgentImplementation = {
							layerRef: "couche-agent@deadbeef",
							role: "executor",
							objectif: "drive the loop shell",
							stopConditions: ["red set still red"],
							provider: "anthropic",
							model: "claude-opus-4-8",
							temperature: 0,
							maxTurns: 64,
							seed: "",
							tools: [],
							skills: [],
							hooks: [],
							allowedPaths: ["app/"],
							forbiddenPaths: wallForbiddenPaths(),
							allowedNetworkHosts: [],
							allowedExec: [],
							resourceLimits: {
								maxMemoryMb: 2048,
								maxCpuMillis: 2000,
								maxWallSeconds: 900,
							},
							maxConcurrency: 1,
						};
						const mkTurn = (target: string, flip: string): ScriptedTurnTs => ({
							action: {
								target,
								agentAction: { tool: "write", args: [target] },
							},
							body: { type: "write", cible: target },
							cost: { tokens: 10, turns: 1, ciMinutes: 0, wallClockSecs: 1 },
							effects: [{ mirror: flip, state: "green" as SensorStateTs }],
						});
						// The script: a legal write flips mirror.a, a legal write flips
						// mirror.b. The fault toggle prepends an above-the-line write that
						// CLAIMS to flip mirror.a but is refused — proving the effect never lands.
						const turns: ScriptedTurnTs[] = driveFault
							? [
									mkTurn("back/kernel/expr.go", "mirror.a"),
									mkTurn("app/a.go", "mirror.a"),
									mkTurn("app/b.go", "mirror.b"),
								]
							: [
									mkTurn("app/a.go", "mirror.a"),
									mkTurn("app/b.go", "mirror.b"),
								];
						const input: DriveInputTs = {
							impl: driveImpl,
							goal: {
								id: "goal-ba15",
								redSet: ["mirror.a", "mirror.b"],
								budgets: { timeSeconds: 10000, turns: 10000, tokens: 1000000 },
							},
							redWorkItem: "item-1",
							contextPack: "pack-1",
							sensors: { "mirror.a": "red", "mirror.b": "red" },
							priorGreen: "intact",
							mutation: 1,
							mutationFloor: 0,
							monsters: [],
							harnessBudget: {
								cellRef: "cell-ba15",
								maxCiMinutes: 10000,
								maxLlmTokensPerGoal: 1000000,
							},
							ratePerToken: 0.000001,
							hookVerdicts: [],
							turns,
							startedAt: "2026-06-03T00:00:00Z",
							endedAt: "2026-06-03T00:05:00Z",
						};
						setDriveRun(drive(input));
					}}
					className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.driveButton}
				</button>
				{driveRun ? (
					<div className="mt-3 space-y-2">
						<div
							data-testid="drive-result"
							data-result={driveRun.result}
							className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground"
						>
							{labels.driveResultLabel}:{" "}
							<code className="font-mono">{driveRun.result}</code>
						</div>
						<ul data-testid="drive-actions" className="space-y-1">
							{driveRun.actions.map((a) => (
								<li
									key={`${a.type}-${a.cible}`}
									data-testid="drive-action"
									data-autorisee={a.autorisee ? "true" : "false"}
									className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-2 py-1 text-[0.7rem]"
								>
									<code className="font-mono text-foreground">{a.cible}</code>
									<span
										className={
											a.autorisee
												? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
												: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
										}
									>
										{a.autorisee
											? labels.driveAllowedTag
											: labels.driveRefusedTag}
									</span>
									{a.raisonBlocage ? (
										<code
											data-testid="drive-action-code"
											className="font-mono text-destructive"
										>
											{a.raisonBlocage.code}
										</code>
									) : null}
								</li>
							))}
						</ul>
						<p className="text-[0.7rem] text-muted-foreground">
							{labels.driveComputedNote}
						</p>
					</div>
				) : null}
			</section>

			{/* BA16 — Action: re-check EVERY action with the deterministic POST-CHECK. After
			    each action the loop applies a post-check per NATURE (a code change → the
			    mirror/sensor must agree; a propose → a shape-check; a read → a no-op
			    assertion). The fault toggle makes the agent CLAIM a code flip the sensor
			    DISAGREES with: the post-check REJECTS it (AGENT_POSTCHECK_FAILED), the effect
			    never lands, and the goal stays red — the result is invariant to the agent's
			    claimed confidence (§8: the judge is the mirror). */}
			<section
				data-testid="postcheck-shell"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.postHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{labels.postBody}</p>
				<label className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
					<input
						type="checkbox"
						data-testid="postcheck-fault"
						checked={postFault}
						onChange={(e) => setPostFault(e.target.checked)}
					/>
					{labels.postFaultLabel}
				</label>
				<button
					type="button"
					data-testid="postcheck-run"
					onClick={() => {
						const postImpl: AgentImplementation = {
							layerRef: "couche-agent@deadbeef",
							role: "executor",
							objectif: "re-check every action",
							stopConditions: ["red set still red"],
							provider: "anthropic",
							model: "claude-opus-4-8",
							temperature: 0,
							maxTurns: 64,
							seed: "",
							tools: [],
							skills: [],
							hooks: [],
							allowedPaths: ["app/"],
							forbiddenPaths: wallForbiddenPaths(),
							allowedNetworkHosts: [],
							allowedExec: [],
							resourceLimits: {
								maxMemoryMb: 2048,
								maxCpuMillis: 2000,
								maxWallSeconds: 900,
							},
							maxConcurrency: 1,
						};
						// A code write that CLAIMS to flip `flip` green. When `lying`, the
						// observed sensor reading DISAGREES (still red) → the post-check rejects.
						const mkWrite = (
							target: string,
							flip: string,
							lying: boolean,
						): ScriptedTurnTs => ({
							action: {
								target,
								agentAction: { tool: "write", args: [target] },
							},
							body: { type: "write", cible: target },
							cost: { tokens: 10, turns: 1, ciMinutes: 0, wallClockSecs: 1 },
							effects: [{ mirror: flip, state: "green" as SensorStateTs }],
							observed: lying
								? [{ mirror: flip, state: "red" as SensorStateTs }]
								: undefined,
						});
						const turns: ScriptedTurnTs[] = [
							mkWrite("app/a.go", "mirror.a", postFault),
							mkWrite("app/b.go", "mirror.b", postFault),
						];
						const input: DriveInputTs = {
							impl: postImpl,
							goal: {
								id: "goal-ba16",
								redSet: ["mirror.a", "mirror.b"],
								budgets: { timeSeconds: 10000, turns: 10000, tokens: 1000000 },
							},
							redWorkItem: "item-1",
							contextPack: "pack-1",
							sensors: { "mirror.a": "red", "mirror.b": "red" },
							priorGreen: "intact",
							mutation: 1,
							mutationFloor: 0,
							monsters: [],
							harnessBudget: {
								cellRef: "cell-ba16",
								maxCiMinutes: 10000,
								maxLlmTokensPerGoal: 1000000,
							},
							ratePerToken: 0.000001,
							hookVerdicts: [],
							turns,
							startedAt: "2026-06-03T00:00:00Z",
							endedAt: "2026-06-03T00:05:00Z",
						};
						setPostRun(drive(input));
					}}
					className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.postButton}
				</button>
				{postRun ? (
					<div className="mt-3 space-y-2">
						<div
							data-testid="postcheck-result"
							data-result={postRun.result}
							className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground"
						>
							{labels.postResultLabel}:{" "}
							<code className="font-mono">{postRun.result}</code>
						</div>
						<ul data-testid="postcheck-actions" className="space-y-1">
							{postRun.actions.map((a) => (
								<li
									key={`${a.type}-${a.cible}`}
									data-testid="postcheck-action"
									data-autorisee={a.autorisee ? "true" : "false"}
									className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-2 py-1 text-[0.7rem]"
								>
									<code className="font-mono text-foreground">{a.cible}</code>
									<span
										className={
											a.autorisee
												? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
												: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
										}
									>
										{a.autorisee
											? labels.driveAllowedTag
											: labels.driveRefusedTag}
									</span>
									{a.raisonBlocage ? (
										<code
											data-testid="postcheck-action-code"
											className="font-mono text-destructive"
										>
											{a.raisonBlocage.code}
										</code>
									) : null}
								</li>
							))}
						</ul>
						<p className="text-[0.7rem] text-muted-foreground">
							{labels.postComputedNote}
						</p>
					</div>
				) : null}
			</section>

			{/* BA17 — Action: bind the OS/Postgres sandbox + prove defense in depth. The agent's
			    confined projection (the app tree is the ONLY writable root, fail-closed egress)
			    is bound to a real OS boundary running under the aidos_agent Postgres role. The
			    fault toggle makes the (mocked) model GENERATE a write to a truth zone / an egress
			    to an undeclared host: refused at the FS boundary AND the hook AND the GRANT (a
			    write), the boundary AND the gate (an egress) — the wall holds three times over.
			    The LLM is the single gated exception, isolated behind one ActionGenerator with a
			    deterministic fake; nothing here touches a model. */}
			<section
				data-testid="sandbox-shell"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.sandboxHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.sandboxBody}
				</p>
				<div
					data-testid="sandbox-role"
					className="mt-2 text-[0.7rem] text-muted-foreground"
				>
					{labels.sandboxRoleLabel}:{" "}
					<code className="font-mono text-foreground">
						{POSTGRES_AGENT_ROLE}
					</code>
				</div>
				<label className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
					<input
						type="checkbox"
						data-testid="sandbox-fault"
						checked={sandboxFault}
						onChange={(e) => setSandboxFault(e.target.checked)}
					/>
					{labels.sandboxFaultLabel}
				</label>
				<button
					type="button"
					data-testid="sandbox-run"
					onClick={() => {
						// The confined projection: the app tree is the ONLY writable root, one egress.
						const sbImpl: AgentImplementation = {
							layerRef: "couche-agent@deadbeef",
							role: "executor",
							objectif: "build the user's app, confined",
							stopConditions: ["red set still red"],
							provider: "anthropic",
							model: "claude-opus-4-8",
							temperature: 0,
							maxTurns: 64,
							seed: "",
							tools: [],
							skills: [],
							hooks: [],
							allowedPaths: ["apps/demo/"],
							forbiddenPaths: wallForbiddenPaths(),
							allowedNetworkHosts: ["api.anthropic.com"],
							allowedExec: ["go"],
							resourceLimits: {
								maxMemoryMb: 512,
								maxCpuMillis: 2000,
								maxWallSeconds: 60,
							},
							maxConcurrency: 1,
						};
						// The model GENERATES a write + an egress. The fault toggle aims them OUT of
						// the sandbox (a truth zone / an undeclared host) → refused at every level.
						const writeTarget = sandboxFault
							? "back/kernel/truth.go"
							: "apps/demo/src/main.go";
						const egressHost = sandboxFault
							? "evil.example.com"
							: "api.anthropic.com";
						setSandboxWrite(checkGeneratedWrite(sbImpl, writeTarget));
						setSandboxEgress(checkGeneratedEgress(sbImpl, egressHost));
					}}
					className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.sandboxButton}
				</button>
				{sandboxWrite ? (
					<div
						data-testid="sandbox-write"
						data-allowed={sandboxWrite.allowed ? "true" : "false"}
						className="mt-3 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground"
					>
						<span className="font-medium">{labels.sandboxWriteLabel}: </span>
						<span
							className={
								sandboxWrite.allowed
									? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
									: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
							}
						>
							{sandboxWrite.allowed
								? labels.sandboxAllowedTag
								: labels.sandboxRefusedTag}
						</span>
						{sandboxWrite.deniedLevels.length > 0 ? (
							<span
								data-testid="sandbox-write-levels"
								className="ml-2 font-mono text-[0.7rem] text-destructive"
							>
								{labels.sandboxLevelsLabel}:{" "}
								{sandboxWrite.deniedLevels.join(" · ")}
							</span>
						) : null}
					</div>
				) : null}
				{sandboxEgress ? (
					<div
						data-testid="sandbox-egress"
						data-allowed={sandboxEgress.allowed ? "true" : "false"}
						className="mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground"
					>
						<span className="font-medium">{labels.sandboxEgressLabel}: </span>
						<span
							className={
								sandboxEgress.allowed
									? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
									: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
							}
						>
							{sandboxEgress.allowed
								? labels.sandboxAllowedTag
								: labels.sandboxRefusedTag}
						</span>
						{sandboxEgress.deniedLevels.length > 0 ? (
							<span
								data-testid="sandbox-egress-levels"
								className="ml-2 font-mono text-[0.7rem] text-destructive"
							>
								{labels.sandboxLevelsLabel}:{" "}
								{sandboxEgress.deniedLevels.join(" · ")}
							</span>
						) : null}
					</div>
				) : null}
			</section>

			{/* BA26 — the REPLAY ENVELOPE: a run gains impl + seed + providerTranscript as a
			    NEW @version of the record (supersede-via-version, anti-overwrite §9); a legacy
			    seedless run stays readable. Action-capable: Build computes the run below the line. */}
			<section
				data-testid="replay-envelope"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.replayHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.replayBody}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-3 text-[0.7rem] text-muted-foreground">
					<label className="flex items-center gap-1.5">
						<input
							type="radio"
							name="replay-mode"
							data-testid="replay-mode-legacy"
							checked={replayMode === "legacy"}
							onChange={() => setReplayMode("legacy")}
						/>
						{labels.replayModeLegacy}
					</label>
					<label className="flex items-center gap-1.5">
						<input
							type="radio"
							name="replay-mode"
							data-testid="replay-mode-replay"
							checked={replayMode === "replay"}
							onChange={() => setReplayMode("replay")}
						/>
						{labels.replayModeReplay}
					</label>
				</div>
				<button
					type="button"
					data-testid="replay-build"
					onClick={() => {
						// The recorded run, BELOW the line (no version/mirror — a run is not a layer).
						const implHash = "impl-7f3a2c9e1b4d8f60"; // the AgentImplementation content-hash (agentimpl.Hash)
						const pack = "pack-checkout";
						const item = "redset:checkout.mirror";
						// LEGACY: a seedless run — no impl/seed/transcript. Still readable.
						// REPLAY: a new run carries the trio; the seed is derived (none declared).
						const built: AgentRun =
							replayMode === "legacy"
								? {
										id: "run:legacy",
										agent: BDD_WRITER.spec.id,
										goal: "g-checkout",
										redWorkItem: item,
										contextPack: pack,
										actions: [],
										result: "still_red",
										startedAt: "2026-06-04T18:00:00Z",
										endedAt: "2026-06-04T18:05:00Z",
									}
								: {
										id: "run:replay",
										agent: BDD_WRITER.spec.id,
										goal: "g-checkout",
										redWorkItem: item,
										contextPack: pack,
										actions: [],
										result: "still_red",
										startedAt: "2026-06-04T18:00:00Z",
										endedAt: "2026-06-04T18:05:00Z",
										impl: implHash,
										seed: runSeed("", implHash, pack, item),
										providerTranscript: "transcript:redacted-ref",
									};
						setReplayRun(built);
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.replayBuildButton}
				</button>
				{replayRun ? (
					<div
						data-testid="replay-result"
						data-mode={replayMode}
						className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-foreground"
					>
						<div data-testid="replay-impl">
							<span className="font-medium">{labels.replayImplLabel}: </span>
							<code className="font-mono text-[0.7rem]">
								{replayRun.impl ? replayRun.impl : labels.replayNoneTag}
							</code>
						</div>
						<div
							data-testid="replay-seed"
							data-seeded={replayRun.seed ? "true" : "false"}
						>
							<span className="font-medium">{labels.replaySeedLabel}: </span>
							<code className="font-mono text-[0.7rem]">
								{replayRun.seed ? replayRun.seed : labels.replayNoneTag}
							</code>
							{replayRun.seed ? (
								<span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] text-primary">
									{labels.replaySeedDerivedTag}
								</span>
							) : null}
						</div>
						<div data-testid="replay-transcript">
							<span className="font-medium">
								{labels.replayTranscriptLabel}:{" "}
							</span>
							<code className="font-mono text-[0.7rem]">
								{replayRun.providerTranscript
									? replayRun.providerTranscript
									: labels.replayNoneTag}
							</code>
						</div>
						<div
							data-testid="replay-coherent"
							data-coherent={
								agentRunReplayCoherent(replayRun) ? "true" : "false"
							}
						>
							<span
								className={
									agentRunReplayCoherent(replayRun)
										? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
										: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
								}
							>
								{agentRunReplayCoherent(replayRun)
									? labels.replayCoherentTag
									: labels.replayIncoherentTag}
							</span>
							{replayMode === "legacy" ? (
								<span
									data-testid="replay-legacy-readable"
									className="ml-2 rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
								>
									{labels.replayLegacyReadableTag}
								</span>
							) : null}
						</div>
						<p className="pt-1 text-[0.7rem] text-muted-foreground">
							{labels.replaySupersedeNote}
						</p>
					</div>
				) : null}
			</section>

			{/* BA27 — the live METER + HALT-ON-BUDGET wired into the loop + the ECONOMICS FEED.
			    Action-capable: the Drive control computes (run, meter) BELOW the line via
			    driveWithEconomics, then feeds the measured cost to economics.evaluate. The
			    "tight" cap forces a PRE-CALL HALT (the breaching turn never starts; the meter
			    never crosses the cap); "loose" runs to completion and the cell budget flags
			    the spend. No headless capability — every op is reachable + executable. */}
			<section
				data-testid="economics-loop"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.economicsHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.economicsBody}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-3 text-[0.7rem] text-muted-foreground">
					<span className="font-medium">{labels.economicsCapLabel}:</span>
					<label className="flex items-center gap-1.5">
						<input
							type="radio"
							name="economics-cap"
							data-testid="economics-cap-tight"
							checked={economicsCap === "tight"}
							onChange={() => setEconomicsCap("tight")}
						/>
						{labels.economicsTightTag}
					</label>
					<label className="flex items-center gap-1.5">
						<input
							type="radio"
							name="economics-cap"
							data-testid="economics-cap-loose"
							checked={economicsCap === "loose"}
							onChange={() => setEconomicsCap("loose")}
						/>
						{labels.economicsLooseTag}
					</label>
				</div>
				<button
					type="button"
					data-testid="economics-drive"
					onClick={() => {
						const ecoImpl: AgentImplementation = {
							layerRef: "couche-agent@deadbeef",
							role: "executor",
							objectif: "drive under a live meter",
							stopConditions: ["red set still red"],
							provider: "anthropic",
							model: "claude-opus-4-8",
							temperature: 0,
							maxTurns: 64,
							seed: "",
							tools: [],
							skills: [],
							hooks: [],
							allowedPaths: ["app/"],
							forbiddenPaths: wallForbiddenPaths(),
							allowedNetworkHosts: [],
							allowedExec: [],
							resourceLimits: {
								maxMemoryMb: 2048,
								maxCpuMillis: 2000,
								maxWallSeconds: 900,
							},
							maxConcurrency: 1,
						};
						const mkTurn = (target: string, flip: string): ScriptedTurnTs => ({
							action: {
								target,
								agentAction: { tool: "write", args: [target] },
							},
							body: { type: "write", cible: target },
							cost: { tokens: 10, turns: 1, ciMinutes: 0, wallClockSecs: 1 },
							effects: [{ mirror: flip, state: "green" as SensorStateTs }],
						});
						const turns: ScriptedTurnTs[] = [
							mkTurn("app/a.go", "mirror.a"),
							mkTurn("app/b.go", "mirror.b"),
						];
						// TIGHT: the loop's token cap is 10 — the 2nd turn (cumulative 20) would
						// breach, so it is refused PRE-CALL (the meter stays at 10, never 20).
						// LOOSE: the loop's cap is 1000 — the run completes (meter 20).
						const tokensCap = economicsCap === "tight" ? 10 : 1000;
						const input: DriveInputTs = {
							impl: ecoImpl,
							goal: {
								id: "goal-ba27",
								redSet: ["mirror.a", "mirror.b"],
								budgets: {
									timeSeconds: 10000,
									turns: 10000,
									tokens: tokensCap,
								},
							},
							redWorkItem: "item-1",
							contextPack: "pack-1",
							sensors: { "mirror.a": "red", "mirror.b": "red" },
							priorGreen: "intact",
							mutation: 1,
							mutationFloor: 0,
							monsters: [],
							harnessBudget: {
								cellRef: "cell-ba27",
								maxCiMinutes: 10000,
								maxLlmTokensPerGoal: 1000000,
							},
							ratePerToken: 0.000001,
							hookVerdicts: [],
							turns,
							startedAt: "2026-06-03T00:00:00Z",
							endedAt: "2026-06-03T00:05:00Z",
						};
						const { run, meter } = driveWithEconomics(input);
						// Feed the terminated run's measured cost to the harness economy (§66.3),
						// evaluated against the cell's DECLARED, tighter budget (5 tokens) — a
						// read-only diagnostic. A 20-token (loose) run is flagged; a halted
						// (tight, 10-token) run is within the cell's 5? No — 10 > 5 still flagged.
						const decision = evaluateRun(
							meter,
							{
								cellRef: "cell-ba27",
								maxCiMinutes: 10000,
								maxLlmTokensPerGoal: 5,
								maxMutationRuntimeSeconds: 10000,
								maxHumanReviewMinutes: 10000,
								expectedRiskReduction: "medium",
							},
							null,
						);
						setEconomicsResult({ run, meter, decision });
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.economicsDriveButton}
				</button>
				{economicsResult ? (
					<div
						data-testid="economics-result"
						data-result={economicsResult.run.result}
						data-cap={economicsCap}
						className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-foreground"
					>
						<div data-testid="economics-run-result">
							<span className="font-medium">
								{labels.economicsResultLabel}:{" "}
							</span>
							<code className="font-mono text-[0.7rem]">
								{economicsResult.run.result}
							</code>
							{economicsResult.run.result === "abandoned" ? (
								<span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[0.7rem] text-destructive">
									{labels.economicsAbandonedTag}
								</span>
							) : null}
						</div>
						<div
							data-testid="economics-meter"
							data-tokens={economicsResult.meter.tokens}
						>
							<span className="font-medium">
								{labels.economicsMeterLabel}:{" "}
							</span>
							<code className="font-mono text-[0.7rem]">
								{economicsResult.meter.tokens} tok
							</code>
							{economicsCap === "tight" ? (
								<span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] text-primary">
									{economicsResult.meter.tokens <= 10
										? labels.economicsHeldTag
										: labels.economicsCrossedTag}
								</span>
							) : null}
						</div>
						<div data-testid="economics-cost">
							<span className="font-medium">{labels.economicsCostLabel}: </span>
							<code className="font-mono text-[0.7rem]">
								{economicsResult.meter.tokens} llm_tokens
							</code>
						</div>
						<div
							data-testid="economics-verdict"
							data-verdict={economicsResult.decision.verdict}
						>
							<span className="font-medium">
								{labels.economicsVerdictLabel}:{" "}
							</span>
							<span
								className={
									economicsResult.decision.verdict === "within_budget"
										? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
										: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
								}
							>
								{economicsResult.decision.verdict === "within_budget"
									? labels.economicsWithinTag
									: labels.economicsFlaggedTag}
							</span>
						</div>
						<p className="pt-1 text-[0.7rem] text-muted-foreground">
							{labels.economicsPrecallNote}
						</p>
					</div>
				) : null}
			</section>

			{/* BA28 — REPLAY + REPRODUCIBILITY + REDACTED transcript. Action-capable: the Run
			    control redacts a secret-bearing transcript (gap H1: the ledger is not a secret
			    store) BEFORE it is shown, builds the replay-bearing run, and replays it — asserting
			    the re-derivation is id-stable AND no secret survives verbatim. The wall: a run is
			    below the line; redaction runs before persistence/display. No headless capability. */}
			<section
				data-testid="replay-redact"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.ba28Heading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{labels.ba28Body}</p>
				<button
					type="button"
					data-testid="ba28-run"
					onClick={() => {
						// A transcript carrying secrets (a DB URL + an API key) — exactly what a
						// ContextPack/system-prompt might leak. Redaction scrubs them BEFORE display.
						const raw: TranscriptTs = {
							system:
								"you are a build agent. db=postgres://u:hunter2@db:5432/app",
							turns: [
								"writing app/checkout.go with key sk-ant-0123456789abcdef",
							],
						};
						const redacted = redactTranscript(raw);
						const implHash = "impl-7f3a2c9e1b4d8f60";
						const pack = "pack-checkout";
						const item = "redset:checkout.mirror";
						const built: AgentRun = {
							id: "run:ba28",
							agent: BDD_WRITER.spec.id,
							goal: "g-checkout",
							redWorkItem: item,
							contextPack: pack,
							actions: [],
							result: "green",
							startedAt: "2026-06-04T18:00:00Z",
							endedAt: "2026-06-04T18:05:00Z",
							impl: implHash,
							seed: runSeed("", implHash, pack, item),
							providerTranscript: "transcript:redacted-ref",
						};
						const leaked =
							containsSecret(redacted.system) ||
							redacted.turns.some((t) => containsSecret(t));
						setBa28Result({
							raw,
							redacted,
							run: built,
							replayedId: replayId(built),
							matches: replayMatches(built),
							leaked,
						});
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.ba28RunButton}
				</button>
				{ba28Result ? (
					<div
						data-testid="ba28-result"
						data-matches={ba28Result.matches ? "true" : "false"}
						data-leaked={ba28Result.leaked ? "true" : "false"}
						className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-foreground"
					>
						<div data-testid="ba28-raw">
							<span className="font-medium">{labels.ba28RawLabel}: </span>
							<code className="break-all font-mono text-[0.7rem] text-muted-foreground">
								{ba28Result.raw.system}
							</code>
						</div>
						<div data-testid="ba28-redacted">
							<span className="font-medium">{labels.ba28RedactedLabel}: </span>
							<code className="break-all font-mono text-[0.7rem]">
								{ba28Result.redacted.system}
							</code>
						</div>
						<div data-testid="ba28-replay">
							<span className="font-medium">{labels.ba28ReplayLabel}: </span>
							<code className="font-mono text-[0.7rem]">
								{ba28Result.replayedId}
							</code>
							<span
								data-testid="ba28-match-tag"
								className={
									ba28Result.matches
										? "ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-primary"
										: "ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
								}
							>
								{ba28Result.matches
									? labels.ba28MatchTag
									: labels.ba28MismatchTag}
							</span>
						</div>
						<div data-testid="ba28-leak">
							<span
								data-testid="ba28-leak-tag"
								className={
									ba28Result.leaked
										? "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
										: "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
								}
							>
								{ba28Result.leaked ? labels.ba28LeakTag : labels.ba28NoLeakTag}
							</span>
						</div>
						<p className="pt-1 text-[0.7rem] text-muted-foreground">
							{labels.ba28LedgerNote}
						</p>
					</div>
				) : null}
			</section>

			<section
				data-testid="ledger"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.ba29Heading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{labels.ba29Body}</p>
				<button
					type="button"
					data-testid="ledger-run"
					onClick={() => {
						// Three DECLARED runs + their INDEPENDENT boundary effect-log: a FAITHFUL run
						// (one allowed write, witnessed → auditable), a REFUSED-write run (the wall
						// stopped it → counted, reconciles clean), and a BETRAYED run (the boundary saw
						// a SECOND write the run never recorded → drift, NOT auditable).
						const faithful: AgentRun = {
							id: "run:faithful",
							agent: BDD_WRITER.spec.id,
							goal: "g-checkout",
							redWorkItem: "redset:checkout.mirror",
							contextPack: "pack-checkout",
							actions: [
								{
									type: "write",
									cible: "back/gen/checkout.go",
									autorisee: true,
								},
							],
							result: "green",
							startedAt: "2026-06-04T18:00:00Z",
							endedAt: "2026-06-04T18:05:00Z",
						};
						const refusedRun: AgentRun = {
							id: "run:refused",
							agent: BDD_WRITER.spec.id,
							goal: "g-checkout",
							redWorkItem: "redset:checkout.kernel",
							contextPack: "pack-checkout",
							actions: [
								{
									type: "write",
									cible: "kernel.operation",
									autorisee: false,
									raisonBlocage: {
										code: "AGENT_WRITE_ABOVE_WATERLINE",
										severity: "blocking",
										explanation:
											"un agent ne peut écrire au-dessus de la ligne de flottaison",
										howToFix: [
											"ouvre une idée → miroir → /goal → approbation humaine",
										],
									},
								},
							],
							result: "blocked",
							startedAt: "2026-06-04T18:10:00Z",
							endedAt: "2026-06-04T18:11:00Z",
						};
						const betrayed: AgentRun = {
							id: "run:betrayed",
							agent: BDD_WRITER.spec.id,
							goal: "g-evolve",
							redWorkItem: "redset:evolve.mirror",
							contextPack: "pack-evolve",
							actions: [
								{ type: "write", cible: "back/gen/evolve.go", autorisee: true },
							],
							result: "green",
							startedAt: "2026-06-04T18:20:00Z",
							endedAt: "2026-06-04T18:25:00Z",
						};
						const effects: Effect[] = [
							{
								run: "run:faithful",
								kind: "fs_write",
								target: "back/gen/checkout.go",
							},
							{
								run: "run:betrayed",
								kind: "fs_write",
								target: "back/gen/evolve.go",
							},
							// the BETRAYAL: a write the boundary saw but the run never recorded.
							{
								run: "run:betrayed",
								kind: "fs_write",
								target: "/tmp/exfil.sh",
							},
						];
						setLedger(queryLedger([faithful, refusedRun, betrayed], effects));
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.ba29RunButton}
				</button>
				{ledger ? (
					<div data-testid="ledger-result" className="mt-4 space-y-3">
						<div className="overflow-hidden rounded-md border border-border">
							<table className="w-full text-xs">
								<thead className="bg-muted/40 text-muted-foreground">
									<tr>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba29RunCol}
										</th>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba29ReplayCol}
										</th>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba29ReconcileCol}
										</th>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba29VerdictCol}
										</th>
									</tr>
								</thead>
								<tbody>
									{ledger.entries.map((e) => (
										<tr
											key={e.run.id}
											data-testid={`ledger-row-${e.run.id}`}
											data-auditable={e.auditable ? "true" : "false"}
											data-reconciled={
												e.reconciliation.reconciled ? "true" : "false"
											}
											className="border-t border-border"
										>
											<td className="px-2.5 py-1.5 align-top">
												<code className="font-mono text-[0.7rem]">
													{e.run.id}
												</code>
												<div className="text-[0.65rem] text-muted-foreground">
													{e.run.goal} · {e.run.result}
												</div>
											</td>
											<td className="px-2.5 py-1.5 align-top">
												<span
													className={
														e.replayMatches
															? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
															: "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
													}
												>
													{labels.ba29ReplayOk}
												</span>
											</td>
											<td className="px-2.5 py-1.5 align-top">
												{e.reconciliation.reconciled ? (
													<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
														{labels.ba29ReconciledOk}
													</span>
												) : (
													<div
														data-testid={`ledger-drift-${e.run.id}`}
														className="space-y-0.5"
													>
														{e.reconciliation.drifts.map((d) => (
															<div
																key={`${d.kind}-${d.target}`}
																className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.65rem] text-destructive"
															>
																{labels.ba29DriftLabel}: {d.kind} →{" "}
																<code className="break-all font-mono">
																	{d.target}
																</code>
															</div>
														))}
													</div>
												)}
											</td>
											<td className="px-2.5 py-1.5 align-top">
												<span
													data-testid={`ledger-verdict-${e.run.id}`}
													className={
														e.auditable
															? "rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary"
															: "rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
													}
												>
													{e.auditable
														? labels.ba29AuditableTag
														: labels.ba29NotAuditableTag}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div data-testid="ledger-refusals">
							<h3 className="text-xs font-medium text-foreground">
								{labels.ba29RefusalsHeading}
							</h3>
							{Object.keys(ledger.totalRefusals).length === 0 ? (
								<p className="text-[0.7rem] text-muted-foreground">
									{labels.ba29NoRefusals}
								</p>
							) : (
								<ul className="mt-1 space-y-1">
									{Object.entries(ledger.totalRefusals).map(([code, n]) => (
										<li
											key={code}
											data-testid={`ledger-refusal-${code}`}
											className="flex items-center gap-2 text-[0.7rem]"
										>
											<code className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive">
												{code}
											</code>
											<span className="text-muted-foreground">× {n}</span>
											<span className="text-muted-foreground">
												— ouvre une idée → miroir → /goal → approbation humaine
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
						<p className="text-[0.7rem] text-muted-foreground">
							{labels.ba29WallNote}
						</p>
					</div>
				) : null}
			</section>

			<section
				data-testid="signals"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.ba30Heading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{labels.ba30Body}</p>
				<button
					type="button"
					data-testid="signals-run"
					onClick={() => {
						// Four DECLARED runs the gateway classifies: TWO distinct still_red runs
						// (different goals ⇒ different run ids) thrashing the SAME wall code → ONE
						// recurring pattern (Recurrence 2); an abandoned run → a distinct high
						// signal; an ordinary green run → NO signal. Identity is the PATTERN, not
						// the run id — the two still_red runs collapse.
						const thrashA: AgentRun = {
							id: "run:thrash-a",
							agent: BDD_WRITER.spec.id,
							goal: "g-sig-a",
							redWorkItem: "redset:sig-a",
							contextPack: "pack-a",
							actions: [
								{
									type: "write",
									cible: "kernel.operation",
									autorisee: false,
									raisonBlocage: {
										code: "AGENT_WRITE_ABOVE_WATERLINE",
										severity: "blocking",
										explanation:
											"un agent ne peut écrire au-dessus de la ligne de flottaison",
										howToFix: [
											"ouvre une idée → miroir → /goal → approbation humaine",
										],
									},
								},
							],
							result: "still_red",
							startedAt: "2026-06-04T19:00:00Z",
							endedAt: "2026-06-04T19:05:00Z",
						};
						const thrashB: AgentRun = {
							...thrashA,
							id: "run:thrash-b",
							goal: "g-sig-b",
							redWorkItem: "redset:sig-b",
							actions: [
								{
									type: "write",
									cible: "kernel.entity",
									autorisee: false,
									raisonBlocage: thrashA.actions[0].raisonBlocage,
								},
							],
						};
						const budget: AgentRun = {
							id: "run:budget",
							agent: BDD_WRITER.spec.id,
							goal: "g-sig-budget",
							redWorkItem: "redset:budget",
							contextPack: "pack-b",
							actions: [],
							result: "abandoned",
							startedAt: "2026-06-04T19:10:00Z",
							endedAt: "2026-06-04T19:15:00Z",
						};
						const clean: AgentRun = {
							id: "run:clean",
							agent: BDD_WRITER.spec.id,
							goal: "g-sig-clean",
							redWorkItem: "redset:clean",
							contextPack: "pack-c",
							actions: [
								{ type: "write", cible: "back/gen/ok.go", autorisee: true },
							],
							result: "green",
							startedAt: "2026-06-04T19:20:00Z",
							endedAt: "2026-06-04T19:25:00Z",
						};
						setSignals(runsToSignals([thrashA, thrashB, budget, clean]));
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.ba30RunButton}
				</button>
				{signals ? (
					<div data-testid="signals-result" className="mt-4 space-y-3">
						<div className="overflow-hidden rounded-md border border-border">
							<table className="w-full text-xs">
								<thead className="bg-muted/40 text-muted-foreground">
									<tr>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba30RunCol}
										</th>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba30ClassCol}
										</th>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba30SeverityCol}
										</th>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba30PatternCol}
										</th>
									</tr>
								</thead>
								<tbody>
									{signals.entries.map((e) => (
										<tr
											key={e.run.id}
											data-testid={`signal-row-${e.run.id}`}
											data-signalled={e.signalled ? "true" : "false"}
											data-severity={e.signal?.severity ?? ""}
											className="border-t border-border"
										>
											<td className="px-2.5 py-1.5 align-top">
												<code className="font-mono text-[0.7rem]">
													{e.run.id}
												</code>
												<div className="text-[0.65rem] text-muted-foreground">
													{e.run.goal} · {e.run.result}
												</div>
											</td>
											<td className="px-2.5 py-1.5 align-top">
												{e.signalled && e.signal ? (
													<span
														className={
															e.signal.severity === "high"
																? "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
																: "rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400"
														}
													>
														{e.signal.class}
													</span>
												) : (
													<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
														{labels.ba30NoSignalTag}
													</span>
												)}
											</td>
											<td className="px-2.5 py-1.5 align-top">
												{e.signal ? (
													<span className="text-[0.7rem] text-muted-foreground">
														{e.signal.severity}
													</span>
												) : (
													<span className="text-[0.7rem] text-muted-foreground">
														—
													</span>
												)}
											</td>
											<td className="px-2.5 py-1.5 align-top">
												{e.signal ? (
													<div className="space-y-1">
														<code className="break-all font-mono text-[0.65rem] text-foreground">
															{e.signal.pattern}
														</code>
														<div
															data-testid={`signal-hypothesis-${e.run.id}`}
															className="text-[0.65rem] text-muted-foreground"
														>
															<span className="font-medium">
																{labels.ba30HypothesisLabel}:{" "}
															</span>
															{e.signal.causeSketch}
														</div>
														<div
															data-testid={`signal-kernel-refused-${e.run.id}`}
															className="text-[0.65rem]"
														>
															<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
																{labels.ba30KernelRefusedLabel}
															</span>
														</div>
													</div>
												) : (
													<span className="text-[0.7rem] text-muted-foreground">
														—
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div data-testid="signals-recurrence">
							<h3 className="text-xs font-medium text-foreground">
								{labels.ba30RecurrenceHeading}
							</h3>
							<ul className="mt-1 space-y-1">
								{Object.entries(signals.patternRecurrence).map(
									([pattern, n]) => (
										<li
											key={pattern}
											data-testid={`signal-recurrence-${pattern}`}
											data-count={n}
											className="flex items-center gap-2 text-[0.7rem]"
										>
											<code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
												{pattern}
											</code>
											<span className="text-muted-foreground">× {n}</span>
										</li>
									),
								)}
							</ul>
							<p className="mt-1 text-[0.7rem] text-muted-foreground">
								{labels.ba30RecurrenceNote}
							</p>
						</div>
						<p className="text-[0.7rem] text-muted-foreground">
							{labels.ba30WallNote}
						</p>
					</div>
				) : null}
			</section>

			<section
				data-testid="learnings"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.ba31Heading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{labels.ba31Body}</p>
				<button
					type="button"
					data-testid="learnings-derive"
					onClick={() => {
						// Two distinct still_red runs thrashing the SAME wall code → ONE recurring
						// incident → the SAME draft idea (identity-by-pattern). An ordinary green run
						// → NO draft. The on-ramp PROPOSES a draft idea; it NEVER applies a truth.
						const wall = {
							code: "AGENT_WRITE_ABOVE_WATERLINE" as const,
							severity: "blocking",
							explanation:
								"un agent ne peut écrire au-dessus de la ligne de flottaison",
							howToFix: ["idée → miroir → /goal → approbation humaine"],
						};
						const failA: AgentRun = {
							id: "run:learn-a",
							agent: BDD_WRITER.spec.id,
							goal: "g-learn-a",
							redWorkItem: "redset:learn-a",
							contextPack: "pack-la",
							actions: [
								{
									type: "write",
									cible: "kernel.operation",
									autorisee: false,
									raisonBlocage: { ...wall },
								},
							],
							result: "still_red",
							startedAt: "2026-06-04T20:00:00Z",
							endedAt: "2026-06-04T20:05:00Z",
						};
						const failB: AgentRun = {
							...failA,
							id: "run:learn-b",
							goal: "g-learn-b",
							redWorkItem: "redset:learn-b",
							actions: [
								{
									type: "write",
									cible: "kernel.entity",
									autorisee: false,
									raisonBlocage: { ...wall },
								},
							],
						};
						const clean: AgentRun = {
							id: "run:learn-clean",
							agent: BDD_WRITER.spec.id,
							goal: "g-learn-clean",
							redWorkItem: "redset:learn-clean",
							contextPack: "pack-lc",
							actions: [
								{ type: "write", cible: "back/gen/ok.go", autorisee: true },
							],
							result: "green",
							startedAt: "2026-06-04T20:10:00Z",
							endedAt: "2026-06-04T20:15:00Z",
						};
						setLearnings(runsToLearnings([failA, failB, clean]));
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.ba31RunButton}
				</button>
				{learnings ? (
					<div data-testid="learnings-result" className="mt-4 space-y-3">
						<div className="overflow-hidden rounded-md border border-border">
							<table className="w-full text-xs">
								<thead className="bg-muted/40 text-muted-foreground">
									<tr>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba31RunCol}
										</th>
										<th className="px-2.5 py-1.5 text-left font-medium">
											{labels.ba31IdeaCol}
										</th>
									</tr>
								</thead>
								<tbody>
									{learnings.entries.map((e) => (
										<tr
											key={e.run.id}
											data-testid={`learning-row-${e.run.id}`}
											data-signalled={e.draft.signalled ? "true" : "false"}
											data-idea-status={e.draft.ideaStatus}
											className="border-t border-border"
										>
											<td className="px-2.5 py-1.5 align-top">
												<code className="font-mono text-[0.7rem]">
													{e.run.id}
												</code>
												<div className="text-[0.65rem] text-muted-foreground">
													{e.run.goal} · {e.run.result}
												</div>
											</td>
											<td className="px-2.5 py-1.5 align-top">
												{e.draft.signalled ? (
													<div className="space-y-1">
														<span
															data-testid={`learning-draft-${e.run.id}`}
															className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400"
														>
															{labels.ba31DraftTag} ·{" "}
															{e.draft.pattern?.severity}
														</span>
														<code className="block break-all font-mono text-[0.65rem] text-foreground">
															{e.draft.incidentRef}
														</code>
														<div
															data-testid={`learning-hypothesis-${e.run.id}`}
															className="text-[0.65rem] text-muted-foreground"
														>
															<span className="font-medium">
																{labels.ba31HypothesisLabel}:{" "}
															</span>
															{e.draft.causeSketch}
														</div>
														<div
															data-testid={`learning-kernel-refused-${e.run.id}`}
															className="text-[0.65rem]"
														>
															<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
																{labels.ba31KernelRefusedLabel}
															</span>
														</div>
													</div>
												) : (
													<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
														{labels.ba31NoSignalTag}
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div data-testid="learnings-recurrence">
							<h3 className="text-xs font-medium text-foreground">
								{labels.ba31RecurrenceHeading}
							</h3>
							<ul className="mt-1 space-y-1">
								{Object.entries(learnings.patternRecurrence).map(
									([pattern, n]) => (
										<li
											key={pattern}
											data-testid={`learning-recurrence-${pattern}`}
											data-count={n}
											className="flex items-center gap-2 text-[0.7rem]"
										>
											<code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
												{pattern}
											</code>
											<span className="text-muted-foreground">× {n}</span>
										</li>
									),
								)}
							</ul>
							<p className="mt-1 text-[0.7rem] text-muted-foreground">
								{labels.ba31RecurrenceNote}
							</p>
						</div>
					</div>
				) : null}

				<div
					data-testid="apply-gate"
					className="mt-5 rounded-md border border-border p-3"
				>
					<h3 className="text-xs font-medium text-foreground">
						{labels.ba31ForgedHeading}
					</h3>
					<p className="mt-1 text-[0.7rem] text-muted-foreground">
						{labels.ba31ForgedBody}
					</p>
					<div className="mt-2 flex gap-2">
						<button
							type="button"
							data-testid="apply-gate-forge"
							onClick={() => {
								// A buggy/malicious loop FORGES Status:"admitted" but no approver granted.
								const g: AuthorityGraph = {
									domain: "billing",
									truthKind: "regulatory",
									approvers: ["legal"] as Role[],
									veto: [],
									escalation: [],
								};
								const forged: Proposal = {
									domain: "billing",
									truthKind: "regulatory",
									status: "admitted",
									ideaId: "forged",
								};
								setApplyVerdict(applyGate(g, forged, [])); // no grant
							}}
							className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
						>
							{labels.ba31ForgeButton}
						</button>
						<button
							type="button"
							data-testid="apply-gate-admit"
							onClick={() => {
								// A GENUINE admission: the required approver actually granted.
								const g: AuthorityGraph = {
									domain: "billing",
									truthKind: "regulatory",
									approvers: ["legal"] as Role[],
									veto: [],
									escalation: [],
								};
								const honest: Proposal = {
									domain: "billing",
									truthKind: "regulatory",
									status: "proposed",
								};
								setApplyVerdict(applyGate(g, honest, ["legal"] as Role[]));
							}}
							className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
						>
							{labels.ba31AdmitButton}
						</button>
					</div>
					{applyVerdict ? (
						<div
							data-testid="apply-gate-verdict"
							data-admitted={applyVerdict.admitted ? "true" : "false"}
							className="mt-3 text-[0.7rem]"
						>
							{applyVerdict.admitted ? (
								<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
									{labels.ba31AdmittedTag}
								</span>
							) : (
								<div className="space-y-1">
									<span
										data-testid="apply-gate-refused"
										className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
									>
										{labels.ba31RefusedTag} · {applyVerdict.refusal?.code}
									</span>
									<p className="text-muted-foreground">
										{applyVerdict.refusal?.explanation}
									</p>
								</div>
							)}
						</div>
					) : null}
				</div>
				<p className="mt-3 text-[0.7rem] text-muted-foreground">
					{labels.ba31WallNote}
				</p>
			</section>

			{/* HR05 — « Compression / économie ». Action-capable: the human clicks "Mesurer
			    l'économie par run" and the pure perRunEconomy projection (the HR04 loop-economy twin,
			    fanned per run) renders tokens BEFORE/AFTER for each recorded run + the aggregate. The
			    wall: read-only, below the line — the compressor extends the margin UNDER the cap, it
			    NEVER raises the cap (data-cap-raised=false per row). No headless capability. */}
			<section
				data-testid="compression-economy"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.economyHeading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.economyBody}
				</p>
				<button
					type="button"
					data-testid="economy-measure"
					onClick={() => {
						// Each run's LLM input: a repetition-prone ContextPack (the wall recited, the
						// boundaries) — the shape the reference-compressor collapses. Per-turn prompts +
						// the run's own declared token cap. Same twin the /context-compression panel runs.
						const pack = (target: string): string => {
							const wall =
								"respect the wall respect the wall respect the wall ";
							return `# CONTEXT PACK\n${wall}${wall}${wall}\n## Boundaries (THE WALL)\nallowed_paths: ${target}\nforbidden_paths: /kernel/**, /mirror/**\ntool: store/read\nskill: tdd\n${wall}${wall}${wall}\n`;
						};
						const runs: RunPrompts[] = [
							{
								id: "run:checkout",
								prompts: [pack("app/checkout.go")],
								cap: 60,
							},
							{
								id: "run:promo",
								prompts: [pack("app/promo.go"), pack("app/cart.go")],
								cap: 120,
							},
						];
						setEconomyReport(perRunEconomy(runs));
					}}
					className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.economyButton}
				</button>
				{economyReport ? (
					<div
						data-testid="economy-report"
						data-all-invariant={
							economyReport.allVerdictsSame ? "true" : "false"
						}
						className="mt-3 space-y-3"
					>
						<table className="w-full text-left text-[0.7rem]">
							<thead className="text-muted-foreground">
								<tr className="border-b border-border">
									<th className="py-1 pr-3 font-medium">
										{labels.economyRunCol}
									</th>
									<th className="py-1 pr-3 font-medium">
										{labels.economyBeforeCol}
									</th>
									<th className="py-1 pr-3 font-medium">
										{labels.economyAfterCol}
									</th>
									<th className="py-1 pr-3 font-medium">
										{labels.economySavedCol}
									</th>
									<th className="py-1 font-medium">
										{labels.economyVerdictCol}
									</th>
								</tr>
							</thead>
							<tbody className="text-foreground">
								{economyReport.rows.map((row) => (
									<tr
										key={row.id}
										data-testid={`economy-row-${row.id}`}
										data-cap-raised={row.economy.capRaised ? "true" : "false"}
										data-before={row.economy.tokensPlain}
										data-after={row.economy.tokensCompressed}
										className="border-b border-border/50"
									>
										<td className="py-1 pr-3 font-mono">{row.id}</td>
										<td className="py-1 pr-3 font-mono">
											{row.economy.tokensPlain} tok
										</td>
										<td className="py-1 pr-3 font-mono">
											{row.economy.tokensCompressed} tok
										</td>
										<td className="py-1 pr-3 font-mono text-primary">
											−{row.economy.tokensSaved} tok
										</td>
										<td className="py-1">
											{row.economy.verdictsSame ? (
												<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
													{labels.economyInvariantTag}
												</span>
											) : (
												<span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
													{labels.economyDivergentTag}
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<div
							data-testid="economy-total"
							data-total-before={economyReport.totalPlain}
							data-total-after={economyReport.totalCompressed}
							className="flex flex-wrap items-center gap-2 text-[0.7rem]"
						>
							<span className="font-medium text-foreground">
								{labels.economyTotalLabel}:
							</span>
							<code className="font-mono">
								{economyReport.totalPlain} → {economyReport.totalCompressed} tok
							</code>
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
								{labels.economySavedLabel}: −{economyReport.totalSaved} tok
							</span>
							<span
								data-testid="economy-cap-never-raised"
								className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground"
							>
								{labels.economyCapNeverRaisedTag}
							</span>
						</div>
					</div>
				) : null}
				<p className="mt-3 text-[0.7rem] text-muted-foreground">
					{labels.economyWallNote}
				</p>
			</section>
		</div>
	);
}
