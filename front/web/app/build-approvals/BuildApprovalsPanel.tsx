"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AgentTruthProposal } from "@/lib/build-approval";
import {
	type ApproveActionResult,
	approveProposalAction,
	type ProposeActionResult,
	proposeTruthAction,
} from "./actions";

/**
 * BuildApprovalsPanel makes the /build-approvals route action-capable (ui-completeness §7): the two
 * ops this step develops — PROPOSE a truth the loop implied, and APPROVE a pending proposal — each
 * have a control bound to the deterministic twin (byte-identical to back/runtime/buildloop/approval),
 * reachable AND executable from the screen.
 *
 * THE WALL (§2): the propose control never writes a truth — it yields a `proposed` proposal (or the
 * wall refusal); the approve control admits ONLY on a real human holding the scope authority. The
 * judge is the deterministic authority graph, never an LLM. Themed on ADR 0010; strings via
 * next-intl (ADR 0011).
 */

const proposeInitial: ProposeActionResult = { ok: false };
const approveInitial: ApproveActionResult = { ok: false };

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("buildApprovals");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function BuildApprovalsPanel() {
	const t = useTranslations("buildApprovals");

	// The local inbox of proposals (the per-project pending list). Proposing appends; approving
	// transitions a row's status (admitted = landed, leaves the pending list).
	const [proposals, setProposals] = useState<AgentTruthProposal[]>([]);
	const [lastBlock, setLastBlock] = useState<{
		code: string;
		explanation: string;
	} | null>(null);
	const [lastDecision, setLastDecision] = useState<{
		id: string;
		admitted: boolean;
		code?: string;
		explanation?: string;
	} | null>(null);

	const [proposeResult, proposeAction] = useActionState(
		async (prev: ProposeActionResult, fd: FormData) => {
			const res = await proposeTruthAction(prev, fd);
			if (res.ok && res.proposal) {
				setProposals((cur) => {
					if (cur.some((p) => p.id === res.proposal?.id)) return cur;
					return [...cur, res.proposal as AgentTruthProposal];
				});
				setLastBlock(null);
			} else if (!res.ok && res.blockCode) {
				setLastBlock({
					code: res.blockCode,
					explanation: res.blockExplanation ?? "",
				});
			}
			return res;
		},
		proposeInitial,
	);

	const [, approveAction] = useActionState(
		async (prev: ApproveActionResult, fd: FormData) => {
			const res = await approveProposalAction(prev, fd);
			if (res.ok && res.decision && res.proposalId) {
				if (res.decision.admitted) {
					// The truth lands — the proposal transitions to admitted and leaves the inbox.
					setProposals((cur) =>
						cur.map((p) =>
							p.id === res.proposalId
								? { ...p, status: "admitted" as const }
								: p,
						),
					);
				}
				setLastDecision({
					id: res.proposalId,
					admitted: res.decision.admitted,
					code: res.blockCode,
					explanation: res.blockExplanation,
				});
			}
			return res;
		},
		approveInitial,
	);

	const inputClass =
		"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

	const pending = proposals.filter((p) => p.status === "proposed");

	return (
		<div className="space-y-8">
			{/* ── OP 1 — PROPOSE a truth the loop implied ── */}
			<form
				action={proposeAction}
				data-testid="propose-form"
				className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="text-base font-semibold tracking-tight text-foreground">
					{t("proposeHeading")}
				</h2>
				<p className="text-sm text-muted-foreground">{t("proposeHint")}</p>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("project")}</span>
						<input
							name="project"
							data-testid="f-project"
							defaultValue="proj-A"
							className={inputClass}
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("target")}</span>
						<input
							name="target"
							data-testid="f-target"
							defaultValue="kernel.operation"
							className={inputClass}
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("domain")}</span>
						<input
							name="domain"
							data-testid="f-domain"
							defaultValue="checkout"
							className={inputClass}
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="text-muted-foreground">{t("truthKind")}</span>
						<input
							name="truth_kind"
							data-testid="f-truthkind"
							defaultValue="journey"
							className={inputClass}
						/>
					</label>
					<label className="space-y-1 text-sm sm:col-span-2">
						<span className="text-muted-foreground">{t("mirror")}</span>
						<input
							name="mirror"
							data-testid="f-mirror"
							defaultValue="mirror://checkout-happy-path"
							className={inputClass}
						/>
					</label>
					<input
						type="hidden"
						name="agent_id"
						defaultValue="buildloop-agent-v1"
					/>
					<input type="hidden" name="agent_run" defaultValue="run-42" />
				</div>

				<Submit label={t("propose")} testid="propose-submit" />
			</form>

			{lastBlock && (
				<div
					data-testid="propose-block"
					data-code={lastBlock.code}
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
				>
					<span
						data-testid="propose-block-code"
						className="font-mono font-semibold text-destructive"
					>
						{lastBlock.code}
					</span>
					<p className="mt-1 text-muted-foreground">{lastBlock.explanation}</p>
				</div>
			)}

			{proposeResult.ok && proposeResult.proposal && (
				<p data-testid="propose-ok" className="text-sm text-primary">
					{t("proposedOk", { status: proposeResult.proposal.status })}
				</p>
			)}

			{/* ── THE INBOX — pending proposals awaiting human approval, each with its mirror ── */}
			<section
				data-testid="inbox"
				aria-label={t("inboxHeading")}
				className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="text-base font-semibold tracking-tight text-foreground">
					{t("inboxHeading")}
				</h2>
				<p className="text-sm text-muted-foreground">{t("inboxHint")}</p>

				{pending.length === 0 ? (
					<p
						data-testid="inbox-empty"
						className="text-sm text-muted-foreground"
					>
						{t("inboxEmpty")}
					</p>
				) : (
					<ul className="space-y-4">
						{pending.map((p) => (
							<li
								key={p.id}
								data-testid={`proposal-${p.id}`}
								className="space-y-3 rounded-lg border border-border bg-muted/30 p-4"
							>
								<div className="flex flex-wrap items-center gap-2 text-sm">
									<span
										data-testid="proposal-status"
										className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
									>
										{t("statusProposed")}
									</span>
									<span className="font-mono text-foreground">
										{p.truth.target}
									</span>
									<span className="text-muted-foreground">
										· {p.truth.domain} / {p.truth.truthKind}
									</span>
								</div>
								<p className="text-xs text-muted-foreground">
									<span className="font-medium">{t("mirror")}:</span>{" "}
									<span data-testid="proposal-mirror" className="font-mono">
										{p.truth.mirror}
									</span>
								</p>
								<p className="text-xs text-muted-foreground">
									{t("proposedBy")}:{" "}
									<span className="font-mono">{p.proposedByAgent}</span>
								</p>

								{/* OP 2 — APPROVE the proposal (the human-approval gate) */}
								<form
									action={approveAction}
									data-testid={`approve-form-${p.id}`}
									className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
								>
									<input type="hidden" name="proposal_id" value={p.id} />
									<input type="hidden" name="domain" value={p.truth.domain} />
									<label className="space-y-1 text-xs">
										<span className="text-muted-foreground">
											{t("actorIdentity")}
										</span>
										<input
											name="actor_identity"
											data-testid={`actor-identity-${p.id}`}
											defaultValue="u-owner"
											className={inputClass}
										/>
									</label>
									<label className="space-y-1 text-xs">
										<span className="text-muted-foreground">
											{t("memberRole")}
										</span>
										<select
											name="member_role"
											data-testid={`member-role-${p.id}`}
											defaultValue="owner"
											className={inputClass}
										>
											<option value="owner">owner</option>
											<option value="editor">editor</option>
											<option value="viewer">viewer</option>
										</select>
									</label>
									<input
										type="hidden"
										name="actor_display"
										value="Olga Owner"
									/>
									<Submit
										label={t("approve")}
										testid={`approve-submit-${p.id}`}
									/>
								</form>
							</li>
						))}
					</ul>
				)}
			</section>

			{lastDecision && (
				<div
					data-testid="decision"
					data-admitted={lastDecision.admitted ? "true" : "false"}
					className={`rounded-xl border p-4 text-sm ${
						lastDecision.admitted
							? "border-primary/40 bg-primary/10"
							: "border-destructive/40 bg-destructive/10"
					}`}
				>
					{lastDecision.admitted ? (
						<p
							data-testid="decision-admitted"
							className="font-semibold text-primary"
						>
							{t("admittedMsg")}
						</p>
					) : (
						<>
							<span
								data-testid="decision-block-code"
								className="font-mono font-semibold text-destructive"
							>
								{lastDecision.code}
							</span>
							<p className="mt-1 text-muted-foreground">
								{lastDecision.explanation}
							</p>
						</>
					)}
				</div>
			)}
		</div>
	);
}
