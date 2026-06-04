/**
 * Agent run — the PURE projection of back/runtime/agentrun (AIDOS step S52). A run is a
 * RUNTIME EVENT below the waterline, NOT a layer/truth: it carries NO version and NO
 * mirror field (the type makes that unrepresentable). Determinism-first: `applyWall`
 * stamps the wall verdict via lib/agentlayer.mayWrite (the S04 predicate). No I/O.
 */

import {
	type AgentImplementation,
	type AgentSpec,
	aboveWaterline,
	type BlockReason,
	type Budgets,
	checkBudget,
	egressDecision,
	type GateActionInput,
	gateAction,
	type HarnessCostBudget,
	type HookVerdict,
	mayWrite,
	pathAllowed,
	type RunDelta,
	type RunMeter,
	tally,
	toolAllowed,
} from "./agentlayer";
import {
	type HarnessCostBudget as EconomicsBudget,
	type EconomicsDecision,
	evaluate as economicsEvaluate,
	type MeasuredCost,
	type ValueCase,
} from "./economics";

/** The closed run-result enum. */
export const RESULTS = ["green", "still_red", "blocked", "abandoned"] as const;
export type Result = (typeof RESULTS)[number];

/** The closed action-type enum. */
export const ACTION_TYPES = ["read", "write", "propose", "run_mirror"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** One attempted action inside a run. autorisee = the wall verdict. */
export interface AgentAction {
	type: ActionType;
	cible: string;
	autorisee: boolean;
	raisonBlocage?: BlockReason;
}

/**
 * AgentRun — one execution of a CoucheAgent. NO `version`, NO `mirror` field: a run is
 * not a layer. (The type itself is the structural invariant the Go property test pins.)
 */
export interface AgentRun {
	id: string;
	agent: string;
	goal: string;
	redWorkItem: string;
	contextPack: string;
	actions: AgentAction[];
	result: Result;
	startedAt: string;
	endedAt: string;
	// ── BA26 — the REPLAY extension (gap A2; supersede-via-version, anti-overwrite §9) ──
	// Additive + OPTIONAL: a legacy (seedless) run omits all three, so its shape is the
	// pre-BA26 shape (the Go canonicalBody omits empty replay fields ⇒ the legacy hash is
	// stable). A new run carries `impl` (the AgentImplementation content-hash), `seed`
	// (declared in BA01, else derived) and `providerTranscript` (the ref replay re-feeds).
	impl?: string;
	seed?: string;
	providerTranscript?: string;
}

// ── BA26 — the seed twins (front twin of agentrun.DeriveSeed / SeedFor) ─────────────────
//
// The seed LOGIC (declared-wins, derive-as-fallback) is single-sourced in lib/agentlayer
// (deriveSeed / seedFor — the FNV-1a UI twin; the Go records.Hash ∘ Canonicalize is the
// content-address authority). BA26 REUSES them — it does not fork a second seed function —
// and re-exports them here so an agentrun consumer reads "the run's seed source" from the
// agentrun module. The agentlayer seedFor keys off an AgentSpec; runSeed below is the
// run-grain twin of agentrun.SeedFor (a DECLARED string wins verbatim, else deriveSeed).

export { deriveSeed } from "./agentlayer";

import { deriveSeed as deriveSeedFn } from "./agentlayer";

/**
 * runSeed — the run-grain twin of agentrun.SeedFor: the DECLARED seed verbatim when the
 * layer declared one (BA01), else the DERIVED seed deriveSeed(impl, pack, item). This is
 * the single "what seed does THIS run get?" at the run grain (the agentlayer seedFor keys
 * off a whole AgentSpec; this keys off the already-resolved declared string). Pure, total,
 * deterministic — same input ⇒ same seed.
 */
export function runSeed(
	declared: string,
	impl: string,
	pack: string,
	item: string,
): string {
	if (declared.trim() !== "") return declared;
	return deriveSeedFn(impl, pack, item);
}

/**
 * agentRunReplayCoherent — the front twin of the migration's agent_run_replay_coherent_chk:
 * a run that carries a providerTranscript MUST also carry an impl AND a seed (a transcript
 * with nothing to replay against is incoherent). A legacy seedless run (none of the three)
 * is coherent. Pure, total.
 */
export function agentRunReplayCoherent(run: AgentRun): boolean {
	if (!run.providerTranscript) return true;
	return Boolean(run.impl) && Boolean(run.seed);
}

/**
 * applyWall — stamps an action with the wall verdict. A write above the waterline lands
 * autorisee=false with AGENT_WRITE_ABOVE_WATERLINE; reads/proposes/run_mirror and
 * below-the-line writes are authorised. Pure, total, deterministic.
 */
export function applyWall(
	action: Pick<AgentAction, "type" | "cible">,
	spec: AgentSpec,
): AgentAction {
	if (action.type !== "write") {
		return { ...action, autorisee: true };
	}
	const dec = mayWrite(spec, action.cible);
	return { ...action, autorisee: dec.allowed, raisonBlocage: dec.blockReason };
}

// ── BA15 — drive: the deterministic LOOP SHELL (the front twin of agentloop.Drive) ─────
//
// drive is the PURE front twin of back/runtime/agentloop.Drive: it claims a red work
// item, drives a MOCK (scripted) session turn by turn, gates EACH action BEFORE it
// executes (gateAction, BA13), applies its sensor effects only on an allowed verdict,
// ticks the RunMeter (BA11), and halts on the FIRST of goal-closed / budget breach /
// generator exhaustion — then returns a complete AgentRun whose result is COMPUTED by
// isClosed (§8), NEVER self-reported by the mock. The LLM is the scripted sequence (no
// model). No Date.now(), no Math.random(), no I/O — determinism-first (CLAUDE.md §6/§8).

/** SensorStateTs — the two-value sensor verdict (front twin of goal.SensorState). */
export type SensorStateTs = "red" | "green";

/** GoalShape — the minimal /goal the shell reads: its id, red set and declared budgets. */
export interface GoalShape {
	id: string;
	redSet: string[];
	budgets: Budgets;
}

/** StopShape — the non-gameable close inputs (front twin of goal.StopInput); NO agent confidence (§8). */
export interface StopShape {
	sensors: Record<string, SensorStateTs>;
	priorGreen: "intact" | "broken";
	mutation: number;
	mutationFloor: number;
	monsters: string[];
}

/**
 * isClosed — the NON-GAMEABLE stop predicate (front twin of goal.IsClosed, §8): a goal
 * closes iff red set → green ∧ prior intact ∧ mutation ≥ floor ∧ no monster. A missing
 * sensor counts as red (anti-passthrough). Pure, total, takes NO agent-confidence input.
 */
export function isClosed(g: GoalShape, s: StopShape): boolean {
	for (const m of g.redSet) if (s.sensors[m] !== "green") return false;
	if (s.priorGreen !== "intact") return false;
	if (s.mutation < s.mutationFloor) return false;
	if (s.monsters.length > 0) return false;
	return true;
}

/** SensorEffectTs — the flip a turn's action lands ON EXECUTION (allowed verdict only). */
export interface SensorEffectTs {
	mirror: string;
	state: SensorStateTs;
}

/** ScriptedTurnTs — one entry of the deterministic mock script (front twin of ScriptedTurn). */
export interface ScriptedTurnTs {
	action: GateActionInput;
	body: Pick<AgentAction, "type" | "cible">;
	cost: RunDelta;
	/** The sensor flips the turn CLAIMS it lands on execution (the agent's claimed confidence). */
	effects: SensorEffectTs[];
	/**
	 * observed — the deterministic SENSOR READING after the action ran (the BA16 JUDGE).
	 * undefined ⇒ the sensor confirms the claimed flips verbatim (the honest happy path);
	 * a disagreeing reading models the agent claiming green while the mirror still reads red
	 * — the post-check then REJECTS the claim and the effect never lands (front twin of
	 * agentloop.ScriptedTurn.Observed).
	 */
	observed?: SensorEffectTs[];
}

// ── BA16 — postCheck: the deterministic POST-CHECK of EVERY action (front twin) ────────
//
// gateAction (BA13) decides BEFORE an action runs; postCheck decides AFTER — may its
// claimed effect be ACCEPTED? — per the action's NATURE. The judge is deterministic, never
// the agent's claimed confidence (§8: done is computed, at the action grain). EVERY action
// is re-checked, not only the code-changing ones.

/** The S13 AGENT_POSTCHECK_FAILED BlockReason, verbatim from the Go registry (BA16). */
export const AGENT_POSTCHECK_FAILED_REASON: BlockReason = {
	code: "AGENT_POSTCHECK_FAILED",
	severity: "blocking",
	explanation:
		"Refus du POST-CHECK déterministe (back/runtime/agentloop, postcheck.go, BA16) : APRÈS l'exécution d'une action, l'effet revendiqué n'est ACCEPTÉ que si le juge déterministe est d'accord, selon la NATURE de l'action — une action qui change du code (write / run_mirror) n'est acceptée que si le miroir/sensor pertinent confirme que le miroir du set rouge est passé au vert (la confiance revendiquée par l'agent n'est jamais crue, §8) ; une action propose n'est acceptée que si sa proposition passe un contrôle de FORME (le cause_sketch est une hypothèse, jamais une vérité) ; une action read n'est acceptée que si elle ne pose AUCUN effet de bord. Une nature sans post-check déterministe est elle-même un determinism gap.",
	howToFix: [
		"let_the_mirror_judge : ne déclarez l'effet vert d'une action de code que lorsque le miroir/sensor le confirme — la confiance revendiquée ne ferme pas le goal, le sensor le ferme (§8).",
		"shape_check_the_proposal : pour un propose, faites passer la proposition par le contrôle de forme ; une hypothèse n'est jamais une vérité et ne flippe aucun sensor.",
		"reads_are_side_effect_free : pour un read, n'attachez aucun effet de bord (aucun flip de sensor).",
		"every_action_needs_a_postcheck : donnez à chaque action une nature connue (read | write | propose | run_mirror) — une nature sans post-check bloque le pas.",
		"rerun aidos check : le blocage se lève dès que le juge déterministe accepte l'effet.",
	],
};

/** The closed post-check kind set (front twin of agentloop.PostCheckKind). */
export const POST_CHECK_KINDS = ["mirror", "shape", "noop"] as const;
export type PostCheckKind = (typeof POST_CHECK_KINDS)[number] | "";

/** postCheckResult — the deterministic post-check verdict for one executed action. */
export interface PostCheckResult {
	kind: PostCheckKind;
	accepted: boolean;
	blockReason?: BlockReason;
}

/** postCheckKindOf maps an action nature to its post-check kind ("" ⇒ a determinism gap). */
function postCheckKindOf(t: ActionType | string): PostCheckKind {
	switch (t) {
		case "write":
		case "run_mirror":
			return "mirror";
		case "propose":
			return "shape";
		case "read":
			return "noop";
		default:
			return "";
	}
}

const postCheckRefused = (kind: PostCheckKind): PostCheckResult => ({
	kind,
	accepted: false,
	blockReason: AGENT_POSTCHECK_FAILED_REASON,
});

/**
 * postCheck — the PURE, TOTAL deterministic post-check (BA16, front twin of
 * agentloop.PostCheck). Given the turn that just ran and the observed sensor world (the
 * judge), it decides whether the claimed effect may be ACCEPTED, per the action's NATURE:
 *   - mirror (write/run_mirror): ACCEPT iff every claimed flip is CONFIRMED by `observed`;
 *   - shape (propose): ACCEPT iff well-formed (non-empty cible) AND lands NO sensor flip;
 *   - noop (read): ACCEPT iff it lands NO sensor flip;
 *   - "" (unknown nature): REFUSE — a determinism gap (the §8 invariant at the action grain).
 */
export function postCheck(
	turn: ScriptedTurnTs,
	observed: Record<string, SensorStateTs>,
): PostCheckResult {
	const kind = postCheckKindOf(turn.body.type);
	switch (kind) {
		case "mirror":
			for (const e of turn.effects) {
				if (observed[e.mirror] !== e.state) return postCheckRefused(kind);
			}
			return { kind, accepted: true };
		case "shape":
			if (turn.body.cible === "" || turn.effects.length > 0) {
				return postCheckRefused(kind);
			}
			return { kind, accepted: true };
		case "noop":
			if (turn.effects.length > 0) return postCheckRefused(kind);
			return { kind, accepted: true };
		default:
			return postCheckRefused("");
	}
}

/**
 * observedSensors — the deterministic sensor reading the post-check consults for a code
 * turn (front twin of agentloop.observedSensors). undefined `observed` ⇒ the sensor
 * confirms the claimed flips verbatim; a declared reading overrides (disagreement).
 */
export function observedSensors(
	turn: ScriptedTurnTs,
	live: Record<string, SensorStateTs>,
): Record<string, SensorStateTs> {
	const obs = { ...live };
	if (turn.observed === undefined) {
		for (const e of turn.effects) obs[e.mirror] = e.state;
		return obs;
	}
	for (const e of turn.observed) obs[e.mirror] = e.state;
	return obs;
}

/** DriveInputTs — the pure input to drive (front twin of agentloop.DriveInput). */
export interface DriveInputTs {
	impl: AgentImplementation;
	goal: GoalShape;
	redWorkItem: string;
	contextPack: string;
	sensors: Record<string, SensorStateTs>;
	priorGreen: "intact" | "broken";
	mutation: number;
	mutationFloor: number;
	monsters: string[];
	harnessBudget: HarnessCostBudget;
	ratePerToken: number;
	hookVerdicts: HookVerdict[];
	turns: ScriptedTurnTs[];
	startedAt: string;
	endedAt: string;
	maxTurns?: number;
}

const DEFAULT_MAX_TURNS = 256;

const stopOf = (
	in_: DriveInputTs,
	sensors: Record<string, SensorStateTs>,
): StopShape => ({
	sensors,
	priorGreen: in_.priorGreen,
	mutation: in_.mutation,
	mutationFloor: in_.mutationFloor,
	monsters: in_.monsters,
});

/**
 * drive — the PURE, deterministic loop SHELL (BA15, front twin of agentloop.Drive).
 * Claims the item, drives the scripted (mock) session, gating EACH action BEFORE it
 * executes; applies effects only on an allowed verdict; ticks the meter; halts on the
 * FIRST of isClosed / budget breach / exhaustion. The result is COMPUTED by isClosed,
 * never self-reported (§8). NOTE: the returned `id` is left "" here — content-addressing
 * lives in the Go recorder (records.Hash); the front twin proves the SHELL behaviour
 * (gate-before-execute, wall, computed result), not the hash.
 *
 * BA27 — driveWithEconomics ALSO returns the run's final RunMeter (the CONSUMED cost the
 * harness economy now sees, via measuredCostOf / evaluateRun). The pre-call halt keeps the
 * meter AT/below the effective cap (it never crosses).
 */
export function driveWithEconomics(in_: DriveInputTs): {
	run: AgentRun;
	meter: RunMeter;
} {
	const sensors: Record<string, SensorStateTs> = { ...in_.sensors };
	let meter: RunMeter = {
		tokens: 0,
		turns: 0,
		ciMinutes: 0,
		wallClockSecs: 0,
	};
	const actions: AgentAction[] = [];
	const cap =
		in_.maxTurns && in_.maxTurns > 0
			? in_.maxTurns
			: in_.impl.maxTurns > 0
				? in_.impl.maxTurns
				: DEFAULT_MAX_TURNS;

	let result: Result = "still_red";

	for (let i = 0; i < cap; i++) {
		// Terminal #1 — the goal closed (computed by isClosed over the EVOLVING world).
		if (isClosed(in_.goal, stopOf(in_, sensors))) {
			result = "green";
			break;
		}
		const turn = in_.turns[i];
		if (turn === undefined) {
			result = "still_red"; // the agent ran out of scripted moves
			break;
		}
		// Terminal #2 — PRE-CALL BUDGET HALT (BA27, gap G3). PROJECT the turn's cost onto the
		// meter WITHOUT committing it, then check the budget. A turn that WOULD push the run
		// past the cap is refused BEFORE it starts: its cost never lands (the committed meter
		// stays AT/below the cap) and its effect never fires. The min() of the two caps is
		// authoritative; the meter therefore NEVER crosses the cap (anti-runaway, pre-call).
		const projected = tally(meter, turn.cost);
		const bv = checkBudget(
			projected,
			in_.harnessBudget,
			in_.goal.budgets,
			in_.ratePerToken,
		);
		if (!bv.withinBudget) {
			actions.push({
				type: turn.body.type,
				cible: turn.body.cible,
				autorisee: false,
				raisonBlocage: bv.blockReason ?? undefined,
			});
			result = "abandoned";
			break;
		}
		// Within budget — COMMIT the tally (the turn starts).
		meter = projected;
		// Step 3 — GATE BEFORE EXECUTION (the interceptor on the path).
		const dec = gateAction(
			in_.impl,
			turn.action,
			meter,
			in_.harnessBudget,
			in_.goal.budgets,
			in_.ratePerToken,
			in_.hookVerdicts,
		);
		if (!dec.allowed) {
			// Step 5 — refused: record, DO NOT execute, the effect never lands.
			actions.push({
				type: turn.body.type,
				cible: turn.body.cible,
				autorisee: false,
				raisonBlocage: dec.blockReason ?? undefined,
			});
			continue;
		}
		// Step 4 — allowed by the gate: execute, then RE-CHECK deterministically (BA16). The
		// post-check decides AFTER (may the claimed effect be accepted?) per the action's
		// nature; the judge is the mirror/shape/no-op, never the agent's claimed confidence.
		const observed = observedSensors(turn, sensors);
		const pc = postCheck(turn, observed);
		if (!pc.accepted) {
			// The judge refused the claimed effect: record NOT authorised; the effect never lands.
			actions.push({
				type: turn.body.type,
				cible: turn.body.cible,
				autorisee: false,
				raisonBlocage: pc.blockReason,
			});
			continue;
		}
		// Accepted: apply effects and record the authorised action.
		for (const e of turn.effects) sensors[e.mirror] = e.state;
		actions.push({
			type: turn.body.type,
			cible: turn.body.cible,
			autorisee: true,
		});
	}

	// Final close check so a last allowed turn that closed the goal records green.
	if (result === "still_red" && isClosed(in_.goal, stopOf(in_, sensors))) {
		result = "green";
	}

	const run: AgentRun = {
		id: "",
		agent: in_.impl.layerRef,
		goal: in_.goal.id,
		redWorkItem: in_.redWorkItem,
		contextPack: in_.contextPack,
		actions,
		result,
		startedAt: in_.startedAt,
		endedAt: in_.endedAt,
	};
	return { run, meter };
}

/**
 * drive — the BA15 loop SHELL (front twin of agentloop.Drive). Returns just the run; for
 * the consumed meter + the harness-economy feed (BA27) use driveWithEconomics.
 */
export function drive(in_: DriveInputTs): AgentRun {
	return driveWithEconomics(in_).run;
}

/**
 * measuredCostOf — BA27 front twin of agentloop.MeasuredCostOf. Projects a run's RunMeter
 * onto the economics MeasuredCost shape: the token tally → llmTokens, the ci-minutes tally
 * → ciMinutes (the two axes an AgentRun spends on that the harness economy budgets). An
 * agent run produces no mutation-runtime / human-review minutes (fabricating them would be
 * a monster) — they stay 0. Pure, total, deterministic.
 */
export function measuredCostOf(m: RunMeter): MeasuredCost {
	return {
		llmTokens: m.tokens,
		ciMinutes: m.ciMinutes,
		mutationRuntimeSeconds: 0,
		humanReviewMinutes: 0,
	};
}

/**
 * evaluateRun — BA27 front twin of agentloop.EvaluateRun. Feeds a terminated run's measured
 * cost to the harness economy: maps the meter via measuredCostOf and defers to the
 * AUTHORITATIVE economics.evaluate over the DECLARED HarnessCostBudget. vc is the optional
 * ValueCase that can clear an over-budget flag (null = none). Adds no judgment of its own.
 * Reads/writes nothing — a below-the-line diagnostic.
 */
export function evaluateRun(
	m: RunMeter,
	b: EconomicsBudget,
	vc: ValueCase | null,
): EconomicsDecision {
	return economicsEvaluate(b, measuredCostOf(m), vc);
}

// ── BA19 — the agentloop MCP capability door (front twin of back/mcp/agentloop) ─────────
//
// driveAgentloop mirrors the agentloop_drive MCP tool: it GATES at the transport boundary
// (the capacity axis — toolAllowed, the "is it real?" check: the run may only call a tool
// its impl BINDS), and on success drives the deterministic scenario through `drive`. A
// refusal at the boundary returns refused:true with the BlockReason and NO run (nothing
// executed — the wall holds). Determinism-first: pure, total, no I/O, no Date.now() — same
// input ⇒ same { refused, run } (the reproducibility mirror pins it).

/** The closed set of declared scenarios (single-sourced with back/mcp/agentloop). */
export const AGENTLOOP_SCENARIOS = [
	"happy",
	"kernel-write",
	"over-budget",
] as const;
export type AgentloopScenario = (typeof AGENTLOOP_SCENARIOS)[number];

/** The single red mirror every scenario works (matches theMirror in the Go server). */
const AGENTLOOP_MIRROR = "redset:checkout.mirror";

/** A scripted turn that writes `target` and flips `flip` green on execution. */
function agentloopTurn(
	target: string,
	flip: string,
	cost: RunDelta,
): ScriptedTurnTs {
	return {
		action: { target, agentAction: { tool: "write", args: [target] } },
		body: { type: "write", cible: target },
		cost,
		effects: [{ mirror: flip, state: "green" }],
	};
}

/** scenarioTurnsTs — the scripted turns for a scenario (twin of scenarioTurns in Go). */
function scenarioTurnsTs(scenario: AgentloopScenario): ScriptedTurnTs[] {
	const small: RunDelta = {
		tokens: 10,
		turns: 1,
		ciMinutes: 0,
		wallClockSecs: 1,
	};
	switch (scenario) {
		case "happy":
			return [agentloopTurn("app/checkout.go", AGENTLOOP_MIRROR, small)];
		case "kernel-write":
			return [
				agentloopTurn("kernel/order", AGENTLOOP_MIRROR, small),
				agentloopTurn("app/checkout.go", AGENTLOOP_MIRROR, small),
			];
		case "over-budget":
			return [
				agentloopTurn("app/checkout.go", AGENTLOOP_MIRROR, {
					tokens: 1_000_000,
					turns: 1,
					ciMinutes: 0,
					wallClockSecs: 1,
				}),
			];
	}
}

/** AgentloopDriveResult — the front twin of the MCP driveOutput. */
export interface AgentloopDriveResult {
	refused: boolean;
	blockReason?: BlockReason;
	run?: AgentRun;
}

/**
 * driveAgentloop — the front twin of the agentloop_drive MCP tool. It gates at the
 * transport boundary (toolAllowed over the target server/tool), then drives the scenario.
 */
export function driveAgentloop(
	impl: AgentImplementation,
	scenario: AgentloopScenario,
	redWorkItem: string,
	target: { server: string; tool: string },
): AgentloopDriveResult {
	// THE TRANSPORT-BOUNDARY CAPACITY CHECK: an impl that does NOT bind the target tool is
	// refused HERE, before drive ever asks for an action (the enforcer on the call path).
	const td = toolAllowed(impl, target.server, target.tool);
	if (!td.allowed) {
		return { refused: true, blockReason: td.blockReason };
	}

	// A mandatory hook is satisfied with a GREEN verdict (the binary's own outcome — §8).
	const hookVerdicts: HookVerdict[] = impl.hooks
		.filter((h) => h.mandatory)
		.map((h) => ({ phase: h.phase, hook: h.hook, ran: true, green: true }));

	const tight = scenario === "over-budget";
	const input: DriveInputTs = {
		impl,
		goal: {
			id: "g-checkout",
			redSet: [AGENTLOOP_MIRROR],
			budgets: { timeSeconds: 10000, turns: 10000, tokens: 1000000 },
		},
		redWorkItem,
		contextPack: "pack-checkout",
		sensors: { [AGENTLOOP_MIRROR]: "red" },
		priorGreen: "intact",
		mutation: 1,
		mutationFloor: 0,
		monsters: [],
		harnessBudget: {
			cellRef: "cell-ba19",
			maxCiMinutes: 10000,
			maxLlmTokensPerGoal: tight ? 5 : 1000000,
		},
		ratePerToken: 0.000001,
		hookVerdicts,
		turns: scenarioTurnsTs(scenario),
		startedAt: "2026-06-03T10:00:00Z",
		endedAt: "2026-06-03T10:05:00Z",
		maxTurns: 64,
	};
	return { refused: false, run: drive(input) };
}

/**
 * agentloopWroteNoTruth — the wall assertion over a recorded run: no AUTHORISED action
 * targets an above-waterline zone (a refused kernel write is fine — the wall held).
 */
export function agentloopWroteNoTruth(run: AgentRun): boolean {
	const zones = [
		"kernel",
		"mirrors",
		"fitness",
		"back/kernel",
		"back/migrations",
	];
	return !run.actions.some(
		(a) =>
			a.autorisee &&
			zones.some((z) => a.cible === z || a.cible.startsWith(`${z}/`)),
	);
}

// ── BA17 — sandbox binding + the gated LLM exception (front twin) ──────────────────────
//
// The four confinement axes (pathAllowed / egressDecision / execDecision / resourceLimits)
// are PURE verdicts (BA09); a sandbox BINDS them to a real OS boundary running under the
// aidos_agent Postgres role, so the SAME allow-list governs the loop at THREE levels (defense
// in depth): the FS/egress/exec BOUNDARY (level 1, the OS mirror of the allow-list), the
// GATE/hook (level 1', zone + path), and the Postgres GRANT backstop (level 3, aidos_agent is
// SELECT-only above the waterline). The three never disagree on a truth-zone write — each
// refuses independently. The LLM is the single gated exception, isolated behind one
// generateAction(impl, transcript) with a deterministic fake; the provider hard-stops
// streaming at the token cap. Determinism-first: every verdict here is pure, total, no I/O.

/** The Postgres role the build-agent's sandbox runs under (the level-3 backstop). */
export const POSTGRES_AGENT_ROLE = "aidos_agent";

/** The three defense-in-depth levels for a write (stable order, single-sourced with Go). */
export const WRITE_LEVELS = {
	fs: "fs_boundary",
	hook: "hook_gate",
	grant: "postgres_grant",
} as const;

/** The two defense-in-depth levels for an egress. */
export const EGRESS_LEVELS = {
	boundary: "egress_boundary",
	gate: "egress_gate",
} as const;

/** WriteVerdict — the combined defense-in-depth write verdict (front twin of WriteVerdict). */
export interface WriteVerdict {
	allowed: boolean;
	deniedLevels: string[];
}

/** EgressVerdict — the combined defense-in-depth egress verdict. */
export interface EgressVerdict {
	allowed: boolean;
	deniedLevels: string[];
}

/**
 * grantWouldDeny — the level-3 Postgres GRANT backstop as a PURE predicate: the aidos_agent
 * role has NO write GRANT above the waterline, so a truth-zone target WOULD miss the GRANT
 * (front twin of Sandbox.GrantWouldDeny).
 */
export function grantWouldDeny(target: string): boolean {
	return aboveWaterline(target);
}

/**
 * checkGeneratedWrite — the one-call defense-in-depth proof for a write the model GENERATED:
 * consults the FS boundary (= pathAllowed), the gate/hook (zone + path), and the GRANT
 * backstop, refusing if ANY refuses and listing every level that denied. A non-AllowedPaths
 * truth-zone write is refused at all three (the wall holds three times over). Pure, total.
 */
export function checkGeneratedWrite(
	impl: AgentImplementation,
	target: string,
): WriteVerdict {
	const denied: string[] = [];
	if (!pathAllowed(impl, target).allowed) denied.push(WRITE_LEVELS.fs);
	// Level 1' — the gate's write axes (zone deny-list + path allow-list).
	if (aboveWaterline(target) || !pathAllowed(impl, target).allowed)
		denied.push(WRITE_LEVELS.hook);
	if (grantWouldDeny(target)) denied.push(WRITE_LEVELS.grant);
	return { allowed: denied.length === 0, deniedLevels: denied };
}

/**
 * checkGeneratedEgress — the egress twin: a generated egress to an undeclared host is refused
 * at the boundary (= egressDecision) AND the gate (fail-closed). Pure, total.
 */
export function checkGeneratedEgress(
	impl: AgentImplementation,
	host: string,
): EgressVerdict {
	const denied: string[] = [];
	if (!egressDecision(impl, host).allowed) denied.push(EGRESS_LEVELS.boundary);
	// Level 1' — the gate's egress axis (same allow-list).
	if (!egressDecision(impl, host).allowed) denied.push(EGRESS_LEVELS.gate);
	return { allowed: denied.length === 0, deniedLevels: denied };
}

/**
 * hardStop — the PURE streaming hard-stop predicate (gap G3): given the tokens emitted so far
 * and the declared cap, should the stream be CANCELLED now? A zero/negative cap means no cap
 * (never stop); a positive cap stops the instant emitted >= cap. Front twin of HardStop.
 */
export function hardStop(emitted: number, cap: number): boolean {
	if (cap <= 0) return false;
	return emitted >= cap;
}

/** GeneratedTs — one reply from the LLM exception (front twin of agentimpl.Generated). */
export interface GeneratedTs {
	text: string;
	tokens: number;
	truncated: boolean;
}

/** TranscriptTs — the deterministic input to generateAction (front twin of Transcript). */
export interface TranscriptTs {
	system: string;
	turns: string[];
}

/**
 * fakeGenerateAction — the deterministic mock of the gated LLM exception (front twin of
 * agentimpl.FakeGenerator.GenerateAction). The reply index is the number of turns already in
 * the transcript (same transcript ⇒ same reply, replay-safe), streamed token by token under
 * the token cap (hard-stopping at the boundary, marking truncated). No model, no I/O.
 */
export function fakeGenerateAction(
	replies: string[],
	tr: TranscriptTs,
	tokenCap: number,
): GeneratedTs {
	const idx = tr.turns.length;
	if (idx < 0 || idx >= replies.length)
		return { text: "", tokens: 0, truncated: false };
	const reply = replies[idx];
	if (tokenCap <= 0)
		return {
			text: reply,
			tokens: reply.split(/\s+/).filter(Boolean).length,
			truncated: false,
		};
	const toks = reply.split(/\s+/).filter(Boolean);
	const emitted: string[] = [];
	let truncated = false;
	for (const tok of toks) {
		if (hardStop(emitted.length, tokenCap)) {
			truncated = true;
			break;
		}
		emitted.push(tok);
	}
	return { text: emitted.join(" "), tokens: emitted.length, truncated };
}
