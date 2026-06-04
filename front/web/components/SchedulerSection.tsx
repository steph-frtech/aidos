"use client";

// SchedulerSection (BA20) — the action-capable Workbench surface for the scheduler
// ROLE + fencing. The scheduler is the distinct role that alone TRANSITIONS a
// RedWorkItem (open→claimed), stamping owner_agent, lease_until and a monotone
// lease_epoch (the fencing token, gap E2); the agent role CANNOT transition (the wall).
//
// ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7): the "Claim (rôle ordonnanceur)" control runs
// the pure lib/scheduler.claim transition (a below-the-line lease write, executed
// directly — no truth touched). A "Tenter le claim côté agent" control shows the agent
// role REFUSED in place (the wall: INSERT+SELECT only). Determinism-first: every verdict
// is computed by the pure claim function, exactly as the Go core + the GRANT decide it.
// Themed on ADR 0010 (design tokens), bilingual on ADR 0011 (next-intl).

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	agentCanTransition,
	type Candidate,
	type ClaimContender,
	type ClaimResult,
	type ConflictResolution,
	claim,
	detectStarvation,
	type FenceVerdict,
	fence,
	headOf,
	type MatchResult,
	matchRole,
	mutationIsForbidden,
	type OrchestrationPolicy,
	pinForRun,
	type QueueEntry,
	resolveConflict,
	type ScheduleResult,
	type StarvationResult,
	schedule,
	scheduleTeam,
	type TeamScheduleResult,
	UPDATE_COLUMNS,
	validatePolicy,
	type WorkItem,
} from "@/lib/scheduler";

const LEASE = "2026-06-03T12:05:00Z";

// BA22 lease/expire engine demo. The tick driver supplies `now`; the queue holds a
// claimed item whose lease has EXPIRED (lease_until < now → reclaimed at the tick, no
// human) and a projection BLOCKED on an unresolved mirror dependency. Running one tick
// (schedule) expires the dead lease, keeps the blocked item blocked, and leases the
// mirror-first head. A second tick after the mirror resolves unblocks + leases it.
const BA22_NOW = "2026-06-03T12:00:00Z";
const BA22_LEASE_UNTIL = "2026-06-03T12:05:00Z";
const BA22_QUEUE: QueueEntry[] = [
	{
		item: {
			itemId: "redset:checkout#mirror",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "mirror",
	},
	{
		item: {
			itemId: "redset:checkout#proj",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "projection",
		dependencies: ["redset:checkout#mirror"], // blocked until the mirror resolves
	},
	{
		item: {
			itemId: "redset:checkout#dead",
			status: "claimed",
			ownerAgent: "executor@v1",
			leaseUntil: "2026-06-03T11:00:00Z", // EXPIRED relative to BA22_NOW
			leaseEpoch: 2,
		},
		layer: "operation_action",
	},
];

// BA21 demo fixture: a mirror-first queue whose HEAD is a mirror item, plus a candidate
// roster. The roster has a FREE bdd-writer (so the mirror head matches) — toggling it
// busy (the starvation control) starves the head: still_red, the team is mis-staffed.
const BA21_QUEUE: QueueEntry[] = [
	{
		item: {
			itemId: "redset:checkout#mirror",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "mirror",
	},
	{
		item: {
			itemId: "redset:checkout#proj",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "projection",
	},
];
const BA21_AGENTS: Candidate[] = [
	{ ref: "bdd-writer@v1", role: "bdd-writer", free: true },
	{ ref: "executor@v1", role: "executor", free: true },
];
const STARVE_THRESHOLD = 3;

// BA23 — the Queue & Dispatch panel fixture. A mirror-first queue carrying a dep-blocked
// projection + a dead-agent (expired) lease, planned over the BA23 roster. Each "Dispatch
// next" runs the pure `schedule` planner and chains the result back into the queue state,
// so the dead lease reclaims at the tick (no human) and the dependent unblocks only after
// its upstream resolves. The same fixture the scheduler MCP server + the e2e drive.
const BA23_NOW = "2026-06-03T12:00:00Z";
const BA23_LEASE_UNTIL = "2026-06-03T12:05:00Z";
const BA23_QUEUE: QueueEntry[] = [
	{
		item: {
			itemId: "redset:checkout#mirror",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "mirror",
	},
	{
		item: {
			itemId: "redset:checkout#proj",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "projection",
		dependencies: ["redset:checkout#mirror"],
	},
	{
		item: {
			itemId: "redset:checkout#dead",
			status: "claimed",
			ownerAgent: "executor@v1",
			leaseUntil: "2026-06-03T11:00:00Z", // EXPIRED relative to BA23_NOW → reclaimed
			leaseEpoch: 2,
		},
		layer: "operation_action",
	},
];
const BA23_AGENTS: Candidate[] = [
	{ ref: "bdd-writer@v1", role: "bdd-writer", free: true },
	{ ref: "executor@v1", role: "executor", free: true },
];

// BA25 — MULTI-AGENT coordination demo. A team of N agents (two roles) under an
// OrchestrationPolicy. The queue holds: a mirror item A (no deps), a projection item B
// that depends on A (hand-off across roles), and two same-target items x1/x2 (a same-file
// conflict the orchestrator must serialise). `scheduleTeam` is the pure planner — it
// enforces MaxConcurrency, serialises the same-target conflict (the loser WAITS), and
// drives the dependency hand-off. Reset re-seeds the queue.
const BA25_NOW = "2026-06-04T12:00:00Z";
const BA25_LEASE = "2026-06-04T13:00:00Z";
const BA25_TEAM: Candidate[] = [
	{ ref: "bdd-writer@v1", role: "bdd-writer", free: true },
	{ ref: "executor@a", role: "executor", free: true },
	{ ref: "executor@b", role: "executor", free: true },
];
const BA25_POLICY: OrchestrationPolicy = {
	claimArbitrage: "serialise_then_merge",
	fanOut: "parallel",
	fanIn: "sequential",
	conflitMemeFichier: "serialise_then_merge",
	maxConcurrency: 2,
	capsParRole: [{ role: "executor", cap: 2 }],
};
const BA25_SEED: QueueEntry[] = [
	{
		item: {
			itemId: "A",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "mirror",
	},
	{
		item: {
			itemId: "B",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "projection",
		dependencies: ["A"],
	},
	{
		item: {
			itemId: "x1",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "projection",
		target: "src/shared.go",
	},
	{
		item: {
			itemId: "x2",
			status: "open",
			ownerAgent: "",
			leaseUntil: "",
			leaseEpoch: 0,
		},
		layer: "operation_action",
		target: "src/shared.go",
	},
];

export function SchedulerSection() {
	const t = useTranslations("scheduler");

	// The seed item starts open with epoch 0 (never leased). A successful claim bumps it.
	const [item, setItem] = useState<WorkItem>({
		itemId: "redset:checkout#1",
		status: "open",
		ownerAgent: "",
		leaseUntil: "",
		leaseEpoch: 0,
	});
	const [result, setResult] = useState<ClaimResult | null>(null);
	const [agentRefused, setAgentRefused] = useState(false);

	// BA21 — role-matching + starvation. The roster's bdd-writer can be made busy to
	// starve the mirror-first head; matchRole + detectStarvation are pure, computed here.
	const [bddWriterFree, setBddWriterFree] = useState(true);
	const [match, setMatch] = useState<MatchResult | null>(null);
	const [starve, setStarve] = useState<StarvationResult | null>(null);

	const roster: Candidate[] = BA21_AGENTS.map((a) =>
		a.role === "bdd-writer" ? { ...a, free: bddWriterFree } : a,
	);
	const head = headOf(BA21_QUEUE);

	// BA22 — the lease/expire ENGINE + write-path FENCING, action-capable. The tick driver
	// re-runs the pure `schedule` planner; the fence control compares a write's epoch to
	// the item's current epoch. Both are computed by the pure lib, never an LLM.
	const [tick, setTick] = useState<ScheduleResult | null>(null);
	const [mirrorResolved, setMirrorResolved] = useState(false);
	const [writeEpoch, setWriteEpoch] = useState(2);
	const [fenceVerdict, setFenceVerdict] = useState<FenceVerdict | null>(null);

	// BA23 — the Queue & Dispatch panel. It owns an EVOLVING queue (so successive ticks
	// chain), the last tick's assignments, and a famine alert. "Dispatch next" runs the pure
	// `schedule` planner and folds the transitioned queue back in; "Reclaim expired" is the
	// same tick (the expire rule reclaims a dead lease with no human action). All below the
	// line — leases/telemetry, never truth. Deterministic: `schedule` is a pure function.
	const [dispatchQueue, setDispatchQueue] = useState<QueueEntry[]>(BA23_QUEUE);
	const [dispatchResult, setDispatchResult] = useState<ScheduleResult | null>(
		null,
	);
	const [mirrorDone, setMirrorDone] = useState(false);

	// BA24 — the OrchestrationPolicy + conflict panel. The policy is a SOURCE field above
	// the line: editing it here PROPOSES a change (idea→mirror→/goal), it is NEVER a live
	// write. A run PINS the policy @version (immutability per-run, gap F3): bumping the
	// version mid-run is flagged as a forbidden live-edit. Two contenders on the SAME
	// target are arbitrated by `resolveConflict` (mirror-first, then content-hash) — the
	// loser WAITS (zero lost update), the orchestrator serialises + merges. All pure.
	const BA24_SPEC_MAX_CONCURRENCY = 2;
	const [policy] = useState<OrchestrationPolicy>({
		claimArbitrage: "serialise_then_merge",
		fanOut: "parallel",
		fanIn: "pipeline",
		conflitMemeFichier: "serialise_then_merge",
		maxConcurrency: 2,
		capsParRole: [
			{ role: "executor", cap: 1 },
			{ role: "reviewer", cap: 1 },
		],
	});
	const policyVerdict = validatePolicy(policy, BA24_SPEC_MAX_CONCURRENCY);
	// the pinned version vs a live one: bumping liveVersion models a mid-run edit attempt.
	const PINNED_VERSION = "policy@v1";
	const [liveVersion, setLiveVersion] = useState(PINNED_VERSION);
	const runPin = pinForRun("run-1", PINNED_VERSION);
	const policyMutationForbidden =
		runPin != null && mutationIsForbidden(runPin, liveVersion);

	const BA24_A: ClaimContender = {
		agent: "executor@v1",
		target: "redset:checkout#mirror",
		layer: "operation_action",
		contentHash: "ab",
	};
	const BA24_B: ClaimContender = {
		agent: "reviewer@v1",
		target: "redset:checkout#mirror",
		layer: "mirror",
		contentHash: "00",
	};
	const [conflict, setConflict] = useState<ConflictResolution | null>(null);

	// BA25 — MULTI-AGENT coordination. A team of N agents under BA25_POLICY contends for an
	// evolving queue. "Tick" runs the pure `scheduleTeam` planner (MaxConcurrency enforced,
	// same-target conflict serialised, dependency hand-off) and folds the queue back in;
	// "Resolve A" lets the dependent B unblock at the next tick (the hand-off). All pure,
	// below the line — leases, never truth.
	const [teamQueue, setTeamQueue] = useState<QueueEntry[]>(BA25_SEED);
	const [teamResult, setTeamResult] = useState<TeamScheduleResult | null>(null);
	const teamLive = teamQueue.filter((e) => e.item.status === "claimed").length;

	const runTeamTick = () => {
		const r = scheduleTeam(
			teamQueue,
			BA25_TEAM,
			BA25_POLICY,
			BA25_NOW,
			BA25_LEASE,
		);
		setTeamResult(r);
		setTeamQueue(r.queue);
	};
	const resolveTeamA = () => {
		setTeamQueue((q) =>
			q.map((e) =>
				e.item.itemId === "A"
					? { ...e, item: { ...e.item, status: "resolved" as const } }
					: e,
			),
		);
	};
	const resetTeam = () => {
		setTeamQueue(BA25_SEED);
		setTeamResult(null);
	};

	const runDispatch = () => {
		// resolving the upstream mirror (a below-the-line worklist signal) lets the dependent
		// unblock at the next tick — modelled by flipping the mirror item to resolved.
		const planned = dispatchQueue.map((e) =>
			mirrorDone && e.item.itemId === "redset:checkout#mirror"
				? { ...e, item: { ...e.item, status: "resolved" as const } }
				: e,
		);
		const r = schedule(planned, BA23_AGENTS, BA23_NOW, BA23_LEASE_UNTIL);
		setDispatchResult(r);
		setDispatchQueue(r.queue);
	};

	const dispatchHead = headOf(
		dispatchQueue.filter((e) => e.item.status === "open"),
	);
	const dispatchStarve =
		dispatchHead != null
			? detectStarvation(dispatchHead, BA23_AGENTS, 1, 1)
			: { starving: false };
	const freeAgents = BA23_AGENTS.filter((a) => a.free);

	const ba22Queue: QueueEntry[] = BA22_QUEUE.map((e) =>
		mirrorResolved && e.item.itemId === "redset:checkout#mirror"
			? { ...e, item: { ...e.item, status: "resolved" } }
			: e,
	);
	// the live epoch of the dead item after a reclaim is still 2 (monotone, not reset).
	const deadCurrentEpoch =
		tick?.queue.find((e) => e.item.itemId === "redset:checkout#dead")?.item
			.leaseEpoch ?? 2;

	return (
		<section
			data-testid="scheduler-fencing"
			className="mt-8 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("heading")}
				</h2>
				<span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
					{t("roleTag")}
				</span>
			</div>
			<p className="mt-1 text-xs text-muted-foreground">{t("body")}</p>

			<dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
				<div>
					<dt className="text-muted-foreground">{t("itemLabel")}</dt>
					<dd className="font-mono text-foreground">{item.itemId}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">{t("statusLabel")}</dt>
					<dd
						data-testid="scheduler-status"
						className="font-mono text-foreground"
					>
						{item.status}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">{t("ownerLabel")}</dt>
					<dd
						data-testid="scheduler-owner"
						className="font-mono text-foreground"
					>
						{item.ownerAgent || "—"}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">{t("epochLabel")}</dt>
					<dd
						data-testid="scheduler-epoch"
						className="font-mono text-foreground"
					>
						{item.leaseEpoch}
					</dd>
				</div>
			</dl>

			<div className="mt-4 flex flex-wrap gap-2">
				<button
					type="button"
					data-testid="scheduler-claim-button"
					onClick={() => {
						const r = claim(item, "bdd-writer@v1", LEASE);
						setResult(r);
						if (r.ok && r.item) {
							setItem(r.item);
						}
					}}
					className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					{t("claimButton")}
				</button>
				<button
					type="button"
					data-testid="scheduler-agent-claim-button"
					onClick={() => setAgentRefused(true)}
					className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
				>
					{t("agentClaimButton")}
				</button>
			</div>

			{result?.ok && result.assignment ? (
				<div
					data-testid="scheduler-claimed"
					className="mt-3 space-y-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs"
				>
					<p className="font-medium text-foreground">{t("claimedHeading")}</p>
					<p className="text-muted-foreground">
						{t("assignmentLine", {
							agent: result.assignment.agent,
							epoch: result.assignment.leaseEpoch,
						})}
					</p>
					<p className="text-muted-foreground">
						{t("columnsLine", { cols: [...UPDATE_COLUMNS].join(", ") })}
					</p>
				</div>
			) : null}

			{agentRefused ? (
				<div
					data-testid="scheduler-agent-refused"
					className="mt-3 space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs"
				>
					<p className="font-medium text-foreground">
						{t("agentRefusedHeading")}
					</p>
					<p className="text-muted-foreground">{t("agentRefusedBody")}</p>
					<p className="font-mono text-[0.7rem] text-destructive">
						agentCanTransition() = {String(agentCanTransition())}
					</p>
				</div>
			) : null}

			{/* BA21 — deterministic role-matching + anti-famine, action-capable. */}
			<div
				data-testid="scheduler-matchrole"
				className="mt-6 border-t border-border pt-4"
			>
				<h3 className="text-xs font-semibold tracking-tight text-foreground">
					{t("matchHeading")}
				</h3>
				<p className="mt-1 text-[0.7rem] text-muted-foreground">
					{t("matchBody")}
				</p>
				<dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
					<div>
						<dt className="text-muted-foreground">{t("headLabel")}</dt>
						<dd
							data-testid="scheduler-head"
							className="font-mono text-foreground"
						>
							{head ? `${head.item.itemId} (${head.layer})` : "—"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{t("rosterLabel")}</dt>
						<dd
							data-testid="scheduler-roster"
							className="font-mono text-foreground"
						>
							{roster
								.map((a) => `${a.ref}:${a.free ? "free" : "busy"}`)
								.join(", ")}
						</dd>
					</div>
				</dl>

				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="scheduler-match-button"
						onClick={() => {
							setMatch(
								head ? matchRole(head.layer, roster) : { ok: false, ref: "" },
							);
						}}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t("matchButton")}
					</button>
					<button
						type="button"
						data-testid="scheduler-toggle-busy-button"
						onClick={() => {
							setBddWriterFree((f) => !f);
							setMatch(null);
							setStarve(null);
						}}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{bddWriterFree ? t("toggleBusyButton") : t("toggleFreeButton")}
					</button>
					<button
						type="button"
						data-testid="scheduler-starve-button"
						onClick={() => {
							setStarve(
								head
									? detectStarvation(
											head,
											roster,
											STARVE_THRESHOLD,
											STARVE_THRESHOLD,
										)
									: { starving: false },
							);
						}}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{t("starveButton")}
					</button>
				</div>

				{match ? (
					<div
						data-testid="scheduler-match-result"
						className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs"
					>
						{match.ok ? (
							<p className="text-muted-foreground">
								{t("matchOk", { ref: match.ref })}
							</p>
						) : (
							<p className="text-muted-foreground">{t("matchNone")}</p>
						)}
					</div>
				) : null}

				{starve ? (
					<div
						data-testid="scheduler-starve-result"
						className={
							starve.starving
								? "mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs"
								: "mt-3 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs"
						}
					>
						{starve.starving && starve.signal ? (
							<>
								<p className="font-medium text-foreground">
									{t("starveHeading")}
								</p>
								<p className="text-muted-foreground">
									{t("starveSignal", {
										item: starve.signal.item,
										role: starve.signal.requiredRole,
										ticks: starve.signal.ticksWaited,
									})}
								</p>
								<p className="font-mono text-[0.7rem] text-destructive">
									class = {starve.signal.class}
								</p>
							</>
						) : (
							<p className="text-muted-foreground">{t("starveNone")}</p>
						)}
					</div>
				) : null}
			</div>

			{/* BA22 — the lease/expire ENGINE (tick driver) + write-path FENCING. */}
			<div
				data-testid="scheduler-lease-engine"
				className="mt-6 border-t border-border pt-4"
			>
				<h3 className="text-xs font-semibold tracking-tight text-foreground">
					{t("engineHeading")}
				</h3>
				<p className="mt-1 text-[0.7rem] text-muted-foreground">
					{t("engineBody")}
				</p>

				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="scheduler-tick-button"
						onClick={() => {
							setTick(schedule(ba22Queue, roster, BA22_NOW, BA22_LEASE_UNTIL));
						}}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t("tickButton")}
					</button>
					<button
						type="button"
						data-testid="scheduler-resolve-mirror-button"
						onClick={() => {
							setMirrorResolved((r) => !r);
							setTick(null);
						}}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{mirrorResolved
							? t("unresolveMirrorButton")
							: t("resolveMirrorButton")}
					</button>
				</div>

				{tick ? (
					<div
						data-testid="scheduler-tick-result"
						className="mt-3 space-y-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs"
					>
						<p className="font-medium text-foreground">{t("tickHeading")}</p>
						<ul className="space-y-0.5 font-mono text-[0.7rem] text-muted-foreground">
							{tick.queue.map((e) => (
								<li
									key={e.item.itemId}
									data-testid={`tick-row-${e.item.itemId}`}
								>
									{e.item.itemId} → {e.item.status}
									{e.item.ownerAgent ? ` (@${e.item.ownerAgent})` : ""} · epoch{" "}
									{e.item.leaseEpoch}
								</li>
							))}
						</ul>
						<p className="text-muted-foreground">
							{t("tickAssignments", { n: tick.assignments.length })}
						</p>
					</div>
				) : null}

				{/* write-path fencing: a stale epoch is refused (AGENT_LEASE_FENCED). */}
				<div className="mt-4">
					<h4 className="text-[0.7rem] font-semibold tracking-tight text-foreground">
						{t("fenceHeading")}
					</h4>
					<p className="mt-1 text-[0.7rem] text-muted-foreground">
						{t("fenceBody", { current: deadCurrentEpoch })}
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<label
							htmlFor="scheduler-fence-epoch"
							className="text-[0.7rem] text-muted-foreground"
						>
							{t("fenceEpochLabel")}
						</label>
						<input
							id="scheduler-fence-epoch"
							data-testid="scheduler-fence-epoch"
							type="number"
							value={writeEpoch}
							onChange={(ev) => setWriteEpoch(Number(ev.target.value))}
							className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
						/>
						<button
							type="button"
							data-testid="scheduler-fence-button"
							onClick={() =>
								setFenceVerdict(fence(writeEpoch, deadCurrentEpoch))
							}
							className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
						>
							{t("fenceButton")}
						</button>
					</div>
					{fenceVerdict ? (
						<div
							data-testid="scheduler-fence-result"
							className={
								fenceVerdict.ok
									? "mt-3 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs"
									: "mt-3 space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs"
							}
						>
							{fenceVerdict.ok ? (
								<p className="text-muted-foreground">{t("fenceOk")}</p>
							) : (
								<>
									<p className="font-medium text-foreground">
										{t("fenceRefusedHeading")}
									</p>
									<p className="font-mono text-[0.7rem] text-destructive">
										{fenceVerdict.code}
									</p>
									{(fenceVerdict.howToFix ?? []).map((h) => (
										<p key={h} className="text-muted-foreground">
											· {h}
										</p>
									))}
								</>
							)}
						</div>
					) : null}
				</div>
			</div>

			{/* BA23 — the Queue & Dispatch panel (scheduler MCP server, below the line). */}
			<div
				data-testid="scheduler-dispatch"
				className="mt-6 border-t border-border pt-4"
			>
				<h3 className="text-xs font-semibold tracking-tight text-foreground">
					{t("dispatchHeading")}
				</h3>
				<p className="mt-1 text-[0.7rem] text-muted-foreground">
					{t("dispatchBody")}
				</p>

				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="dispatch-next-button"
						onClick={runDispatch}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t("dispatchNextButton")}
					</button>
					<button
						type="button"
						data-testid="dispatch-reclaim-button"
						onClick={runDispatch}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{t("reclaimExpiredButton")}
					</button>
					<button
						type="button"
						data-testid="dispatch-resolve-mirror-button"
						onClick={() => setMirrorDone((m) => !m)}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{mirrorDone ? t("unresolveMirrorButton") : t("resolveMirrorButton")}
					</button>
					<button
						type="button"
						data-testid="dispatch-reset-button"
						onClick={() => {
							setDispatchQueue(BA23_QUEUE);
							setDispatchResult(null);
							setMirrorDone(false);
						}}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{t("resetQueueButton")}
					</button>
				</div>

				{/* free agents by role — who the dispatcher may staff the head with. */}
				<div className="mt-3">
					<p className="text-[0.7rem] font-medium text-foreground">
						{t("freeAgentsHeading")}
					</p>
					<p
						data-testid="dispatch-free-agents"
						className="font-mono text-[0.7rem] text-muted-foreground"
					>
						{freeAgents.length > 0
							? freeAgents.map((a) => `${a.ref} (${a.role})`).join(", ")
							: t("freeAgentsNone")}
					</p>
				</div>

				{/* the queue table — mirror-first order, status/owner/lease/epoch/deps per item. */}
				<div className="mt-3 overflow-x-auto">
					<table
						data-testid="dispatch-queue"
						className="w-full text-left text-[0.7rem]"
					>
						<thead>
							<tr className="border-b border-border text-muted-foreground">
								<th className="py-1 pr-3 font-medium">{t("colItem")}</th>
								<th className="py-1 pr-3 font-medium">{t("colLayer")}</th>
								<th className="py-1 pr-3 font-medium">{t("colStatus")}</th>
								<th className="py-1 pr-3 font-medium">{t("colOwner")}</th>
								<th className="py-1 pr-3 font-medium">{t("colEpoch")}</th>
								<th className="py-1 pr-3 font-medium">{t("colDeps")}</th>
							</tr>
						</thead>
						<tbody className="font-mono">
							{dispatchQueue.map((e) => (
								<tr
									key={e.item.itemId}
									data-testid={`dispatch-row-${e.item.itemId}`}
									className="border-b border-border/50"
								>
									<td className="py-1 pr-3 text-foreground">{e.item.itemId}</td>
									<td className="py-1 pr-3 text-muted-foreground">{e.layer}</td>
									<td className="py-1 pr-3 text-foreground">{e.item.status}</td>
									<td className="py-1 pr-3 text-muted-foreground">
										{e.item.ownerAgent || "—"}
									</td>
									<td className="py-1 pr-3 text-muted-foreground">
										{e.item.leaseEpoch}
									</td>
									<td className="py-1 pr-3 text-muted-foreground">
										{(e.dependencies ?? []).join(", ") || "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{dispatchResult ? (
					<p
						data-testid="dispatch-assignments"
						className="mt-2 text-[0.7rem] text-muted-foreground"
					>
						{t("dispatchAssignments", {
							n: dispatchResult.assignments.length,
						})}
					</p>
				) : (
					<p
						data-testid="dispatch-no-tick"
						className="mt-2 text-[0.7rem] text-muted-foreground"
					>
						{t("dispatchNoTick")}
					</p>
				)}

				{dispatchStarve.starving && dispatchStarve.signal ? (
					<div
						data-testid="dispatch-starve-alert"
						className="mt-3 space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs"
					>
						<p className="font-medium text-foreground">
							{t("dispatchStarveHeading")}
						</p>
						<p className="text-muted-foreground">
							{t("dispatchStarveBody", {
								item: dispatchStarve.signal.item,
								role: dispatchStarve.signal.requiredRole,
							})}
						</p>
						<p className="font-mono text-[0.7rem] text-destructive">
							class = {dispatchStarve.signal.class}
						</p>
					</div>
				) : null}
			</div>

			{/* BA24 — OrchestrationPolicy (immutable-per-run) + zero-lost-update conflict. */}
			<div
				data-testid="scheduler-orchestration"
				className="mt-6 border-t border-border pt-4"
			>
				<h3 className="text-xs font-semibold tracking-tight text-foreground">
					{t("orchHeading")}
				</h3>
				<p className="mt-1 text-[0.7rem] text-muted-foreground">
					{t("orchBody")}
				</p>

				{/* the declared policy — proposed via /goal, never live-written. */}
				<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
					<div
						data-testid="orch-policy"
						className="rounded-md border border-border bg-background px-3 py-2 font-mono text-[0.7rem] text-muted-foreground"
					>
						<div>claim_arbitrage = {policy.claimArbitrage}</div>
						<div>fan_out = {policy.fanOut}</div>
						<div>fan_in = {policy.fanIn}</div>
						<div>conflit_meme_fichier = {policy.conflitMemeFichier}</div>
						<div>max_concurrency = {policy.maxConcurrency}</div>
						<div>
							caps ={" "}
							{policy.capsParRole.map((c) => `${c.role}:${c.cap}`).join(", ")}
						</div>
					</div>
					<div className="space-y-2">
						<p
							data-testid="orch-policy-verdict"
							className={`text-[0.7rem] ${policyVerdict.ok ? "text-foreground" : "text-destructive"}`}
						>
							{policyVerdict.ok
								? t("orchPolicyValid")
								: t("orchPolicyInvalid", {
										reason: policyVerdict.reason ?? "",
									})}
						</p>
						<p className="text-[0.7rem] text-muted-foreground">
							{t("orchProposeNote")}
						</p>
					</div>
				</div>

				{/* immutability per-run — pin a version; bumping the live one is a forbidden edit. */}
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="orch-bump-version-button"
						onClick={() =>
							setLiveVersion((v) =>
								v === PINNED_VERSION ? "policy@v2-live-edit" : PINNED_VERSION,
							)
						}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{t("orchBumpVersionButton")}
					</button>
					<span
						data-testid="orch-pin-status"
						className={`text-[0.7rem] ${policyMutationForbidden ? "text-destructive" : "text-muted-foreground"}`}
					>
						{policyMutationForbidden
							? t("orchPinForbidden", { pinned: PINNED_VERSION })
							: t("orchPinFrozen", { pinned: PINNED_VERSION })}
					</span>
				</div>

				{/* same-target conflict arbitration — resolveConflict, zero lost update. */}
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="orch-resolve-conflict-button"
						onClick={() => setConflict(resolveConflict(BA24_A, BA24_B))}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t("orchResolveConflictButton")}
					</button>
					<button
						type="button"
						data-testid="orch-reset-button"
						onClick={() => {
							setConflict(null);
							setLiveVersion(PINNED_VERSION);
						}}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{t("orchResetButton")}
					</button>
				</div>

				{conflict ? (
					<div
						data-testid="orch-conflict-result"
						className="mt-3 space-y-1 rounded-md border border-border bg-background px-2.5 py-2 text-[0.7rem]"
					>
						<p className="text-foreground">
							{t("orchConflictWinner", { agent: conflict.winner.agent })}
						</p>
						<p
							data-testid="orch-conflict-loser"
							className="text-muted-foreground"
						>
							{t("orchConflictLoser", { agent: conflict.loser.agent })}
						</p>
						<p className="font-mono text-destructive">
							next_action = {conflict.nextAction}
						</p>
						<p className="text-muted-foreground">{t("orchConflictNoLost")}</p>
					</div>
				) : (
					<p
						data-testid="orch-no-conflict"
						className="mt-3 text-[0.7rem] text-muted-foreground"
					>
						{t("orchNoConflict")}
					</p>
				)}
			</div>

			{/* BA25 — MULTI-AGENT coordination: fan-out + hand-offs + concurrency-vs-cap. */}
			<div
				data-testid="scheduler-team"
				className="mt-6 border-t border-border pt-4"
			>
				<h3 className="text-xs font-semibold tracking-tight text-foreground">
					{t("teamHeading")}
				</h3>
				<p className="mt-1 text-[0.7rem] text-muted-foreground">
					{t("teamBody")}
				</p>

				{/* the team + the live concurrency vs. the declared cap. */}
				<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
					<div
						data-testid="team-roster"
						className="rounded-md border border-border bg-background px-3 py-2 font-mono text-[0.7rem] text-muted-foreground"
					>
						{BA25_TEAM.map((a) => (
							<div key={a.ref}>
								{a.ref} · {a.role}
							</div>
						))}
					</div>
					<div className="space-y-1">
						<p
							data-testid="team-concurrency"
							className={`text-[0.7rem] ${teamLive > BA25_POLICY.maxConcurrency ? "text-destructive" : "text-foreground"}`}
						>
							{t("teamConcurrency", {
								live: teamLive,
								cap: BA25_POLICY.maxConcurrency,
							})}
						</p>
						<p className="text-[0.7rem] text-muted-foreground">
							{t("teamProposeNote")}
						</p>
					</div>
				</div>

				{/* controls: run a coordinated tick · resolve A (hand-off) · reset. */}
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="team-tick-button"
						onClick={runTeamTick}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t("teamTickButton")}
					</button>
					<button
						type="button"
						data-testid="team-resolve-a-button"
						onClick={resolveTeamA}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{t("teamResolveAButton")}
					</button>
					<button
						type="button"
						data-testid="team-reset-button"
						onClick={resetTeam}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						{t("teamResetButton")}
					</button>
				</div>

				{/* the evolving queue — status + owner + target per item. */}
				<div
					data-testid="team-queue"
					className="mt-3 overflow-hidden rounded-md border border-border"
				>
					<table className="w-full border-collapse text-left text-[0.7rem]">
						<thead className="bg-muted text-muted-foreground">
							<tr>
								<th className="px-2.5 py-1.5 font-medium">item</th>
								<th className="px-2.5 py-1.5 font-medium">status</th>
								<th className="px-2.5 py-1.5 font-medium">owner</th>
								<th className="px-2.5 py-1.5 font-medium">target</th>
							</tr>
						</thead>
						<tbody>
							{teamQueue.map((e) => (
								<tr
									key={e.item.itemId}
									data-testid={`team-row-${e.item.itemId}`}
									className="border-t border-border"
								>
									<td className="px-2.5 py-1.5 font-mono text-foreground">
										{e.item.itemId}
									</td>
									<td
										data-testid={`team-status-${e.item.itemId}`}
										className="px-2.5 py-1.5 font-mono text-foreground"
									>
										{e.item.status}
									</td>
									<td className="px-2.5 py-1.5 font-mono text-muted-foreground">
										{e.item.ownerAgent || "—"}
									</td>
									<td className="px-2.5 py-1.5 font-mono text-muted-foreground">
										{e.target ?? "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* the same-target conflicts this tick serialised (the loser WAITS). */}
				{teamResult && teamResult.conflicts.length > 0 ? (
					<div
						data-testid="team-conflicts"
						className="mt-3 space-y-1 rounded-md border border-border bg-background px-2.5 py-2 text-[0.7rem]"
					>
						{teamResult.conflicts.map((c) => (
							<p
								key={`${c.winner.agent}->${c.loser.agent}`}
								data-testid="team-conflict-row"
								className="text-foreground"
							>
								{t("teamConflict", {
									winner: c.winner.agent,
									loser: c.loser.agent,
								})}{" "}
								<span className="font-mono text-destructive">
									{c.nextAction}
								</span>
							</p>
						))}
					</div>
				) : (
					<p
						data-testid="team-no-conflict"
						className="mt-3 text-[0.7rem] text-muted-foreground"
					>
						{t("teamNoConflict")}
					</p>
				)}
			</div>

			<p className="mt-3 text-[0.7rem] text-muted-foreground">
				{t("computedNote")}
			</p>
		</section>
	);
}
