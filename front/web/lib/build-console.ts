/**
 * build-console.ts — the deterministic TS twin of back/runtime/buildconsole (S86).
 *
 * THE STEP (ROADMAP S86): the live BUILD CONSOLE + per-project stable-phase recording. The
 * console is the deterministic, read-only AGGREGATION of everything a human watches while a
 * build runs: the diff streamed per attempt, the sensor (mirror) results, the
 * HarnessCostBudget consumption (CI minutes, LLM tokens/goal — S51), the circuit-breaker
 * (S83) state, the AgentRun timeline (S52), and the human approval gate (S85). It adds NO
 * new judgment: the console is a FAITHFUL PROJECTION of records that already exist.
 *
 * THE TWIN (no drift): this module mirrors the Go authority byte-for-byte — the SAME
 * projection (identity + attempt stream + latest sensors + cost meter + breaker + approval),
 * the SAME faithfulness predicate (stateEqualsRun), the SAME stable-phase recording gate
 * (record only at the §43 verdict; refuse an inconsistent cut with
 * STABLE_PHASE_INCONSISTENT_CUT). The reproducibility mirror lib/build-console.test.ts
 * (fast-check) pins same-input → same-output.
 *
 * THE WALL (CLAUDE.md §2): both functions are PURE — they write NOTHING. The console can
 * never fabricate a turn or a green; recording a DAG node rides the privileged `aidos` writer
 * (the Server Action returns the node VALUE). An inconsistent cut is refused — no node from a
 * red mirror.
 */

/** The closed loop verdict (twin of buildloop.Verdict). */
export type Verdict = "continue" | "green" | "no_progress";

/** The run's closed result (twin of agentrun.Result). */
export type RunResult = "green" | "still_red" | "blocked" | "abandoned";

/** One recorded write action of the run, in turn order. */
export interface WriteAction {
	diffHash: string;
	/** the wall verdict: true = below the line + applied. */
	authorised: boolean;
}

/** One streamed build attempt (a projection of a recorded write + the history's diff). */
export interface AttemptDiff {
	index: number;
	diffHash: string;
	authorised: boolean;
}

/** One mirror's certification (the S07 sensor shape). */
export interface SensorResult {
	id: string;
	green: boolean;
}

/** The HarnessCostBudget consumption panel (S51). */
export interface CostMeter {
	ciMinutesSpent: number;
	ciMinutesCap: number;
	llmTokensSpent: number;
	llmTokensCap: number;
	overBudgetAxes: string[];
}

/** The circuit-breaker panel (S83). */
export interface BreakerState {
	verdict: Verdict;
	tripped: boolean;
}

/** The human-approval gate panel (S85). */
export interface ApprovalGate {
	pendingCount: number;
	pendingIds: string[];
}

/** The full streamed console state. */
export interface BuildConsoleState {
	runId: string;
	goal: string;
	attempts: AttemptDiff[];
	sensors: SensorResult[];
	cost: CostMeter;
	breaker: BreakerState;
	result: RunResult;
	approval: ApprovalGate;
}

/** The pure input to project (every record the console aggregates). */
export interface ConsoleInput {
	runId: string;
	goal: string;
	result: RunResult;
	/** the run's recorded write actions, in turn order. */
	writes: WriteAction[];
	/** the per-turn diff hashes (the loop history). */
	diffHashes: string[];
	/** the latest turn's green mirror refs. */
	greenMirrors: string[];
	verdict: Verdict;
	ciMinutesSpent: number;
	ciMinutesCap: number;
	llmTokensSpent: number;
	llmTokensCap: number;
	overBudgetAxes: string[];
	/** proposal ids awaiting human approval (S85). */
	pending: string[];
}

/**
 * project — the PURE console projection (twin of buildconsole.Project). It derives the
 * watched state ENTIRELY from the records handed in: the attempt stream (1 entry per loop
 * turn, zipping the writes with the diff hashes), the latest sensors (sorted), the cost meter
 * (measured vs declared + over-budget axes), the breaker (verdict verbatim), the result
 * (verbatim), and the approval gate (sorted pending). Same input ⇒ same state.
 */
export function project(input: ConsoleInput): BuildConsoleState {
	const attempts: AttemptDiff[] = input.diffHashes.map((diffHash, i) => ({
		index: i + 1,
		diffHash,
		authorised: i < input.writes.length ? input.writes[i].authorised : false,
	}));

	const sensors: SensorResult[] = [...input.greenMirrors]
		.sort()
		.map((id) => ({ id, green: true }));

	const pending = [...input.pending].sort();

	return {
		runId: input.runId,
		goal: input.goal,
		result: input.result,
		attempts,
		sensors,
		cost: {
			ciMinutesSpent: input.ciMinutesSpent,
			ciMinutesCap: input.ciMinutesCap,
			llmTokensSpent: input.llmTokensSpent,
			llmTokensCap: input.llmTokensCap,
			overBudgetAxes: [...input.overBudgetAxes],
		},
		breaker: {
			verdict: input.verdict,
			tripped: input.verdict === "no_progress",
		},
		approval: { pendingCount: pending.length, pendingIds: pending },
	};
}

/**
 * stateEqualsRun — the NON-GAMEABLE faithfulness predicate (twin of
 * buildconsole.StateEqualsRun): the streamed state EQUALS the recorded run. True iff the
 * state's identity (runId, goal, result) matches, and every authorised attempt corresponds to
 * an authorised recorded write (no fabricated authorisation). Pure, total.
 */
export function stateEqualsRun(
	state: BuildConsoleState,
	run: { id: string; goal: string; result: RunResult; writes: WriteAction[] },
): boolean {
	if (state.runId !== run.id) return false;
	if (state.goal !== run.goal) return false;
	if (state.result !== run.result) return false;
	for (let i = 0; i < state.attempts.length; i++) {
		if (state.attempts[i].authorised) {
			if (i >= run.writes.length || !run.writes[i].authorised) return false;
		}
	}
	return true;
}

// ── per-project stable-phase recording (S23/S40 verdict → DAG node) ──

/** A link in the cut (resolved against the heads). */
export interface CutLink {
	fromId: string;
	fromVersion: string;
	toId: string;
	toVersion: string;
}
/** One sensor's snapshot over the cut. */
export interface CutSensor {
	id: string;
	pass: boolean;
}
/** The §43 cut to evaluate for recording. */
export interface StablePhaseRequest {
	projectId: string;
	cut: Record<string, string>;
	heads: Record<string, string>;
	links: CutLink[];
	sensors: CutSensor[];
	label: string;
}
/** The typed recording result. */
export interface StablePhaseResult {
	stable: boolean;
	recorded: boolean;
	/** the offending mirror ids when unstable (sorted). */
	reasons: string[];
	/** the refusal block code when unstable. */
	blockCode: string;
	howToFix: string[];
}

/**
 * isStable — the §43 coherent-cut verdict (twin of phases.IsStable): a cut is stable iff every
 * link resolves green (its toVersion equals the head) AND every sensor passes. The reasons name
 * the offending mirrors (sensors by id, links by "from->to (stale|absent)"), sorted. Pure.
 */
export function isStable(req: StablePhaseRequest): {
	stable: boolean;
	reasons: string[];
} {
	const reasons: string[] = [];
	for (const s of req.sensors) {
		if (!s.pass) reasons.push(s.id);
	}
	for (const l of req.links) {
		const head = req.heads[l.toId];
		const status =
			head === undefined ? "absent" : head === l.toVersion ? "green" : "stale";
		if (status !== "green") {
			reasons.push(
				`${l.fromId}@${l.fromVersion}->${l.toId}@${l.toVersion} (${status})`,
			);
		}
	}
	reasons.sort();
	return { stable: reasons.length === 0, reasons };
}

/**
 * recordStablePhase — the per-project stable-phase recording gate (twin of
 * buildconsole.RecordStablePhase). It computes the §43 verdict and records a node ONLY when
 * stable; an inconsistent cut is REFUSED with STABLE_PHASE_INCONSISTENT_CUT (no node from a red
 * mirror). Pure, total: recording ⇔ stable ⇔ ¬refusal.
 */
export function recordStablePhase(req: StablePhaseRequest): StablePhaseResult {
	const { stable, reasons } = isStable(req);
	if (stable) {
		return {
			stable: true,
			recorded: true,
			reasons: [],
			blockCode: "",
			howToFix: [],
		};
	}
	return {
		stable: false,
		recorded: false,
		reasons,
		blockCode: "STABLE_PHASE_INCONSISTENT_CUT",
		howToFix: [
			`Rendez chaque miroir vert d'abord : les mirrors fautifs sont ${reasons.join(", ")}.`,
			"Relancez « aidos stable » une fois la coupe entièrement verte ; le nœud sera alors enregistrable.",
		],
	};
}
