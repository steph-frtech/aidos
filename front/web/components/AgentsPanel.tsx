"use client";

import { useState } from "react";
import { approve, type CoucheAgent, propose } from "@/lib/agentlayer";
import { AGENTS, BDD_WRITER, RECENT_RUN } from "@/lib/agentlayer-data";

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
			</div>
		</div>
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

	const run = RECENT_RUN;

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
		</div>
	);
}
