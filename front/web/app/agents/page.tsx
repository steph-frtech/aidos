import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgentsPanel } from "@/components/AgentsPanel";
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
