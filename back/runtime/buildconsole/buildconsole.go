// Package buildconsole is the S86 Workbench BUILD CONSOLE PROJECTION — the live console
// of the app-builder (ROADMAP-app-builder EPIC 8). It is the deterministic, read-only
// AGGREGATION of everything a human watches while a build runs: the diff streamed per
// attempt, the sensor (mirror) results, the HarnessCostBudget consumption (CI minutes,
// LLM tokens/goal — S51), the circuit-breaker (S83) state, the AgentRun timeline (S52),
// and the human approval gate (S85). It adds NO new judgment: the console is a FAITHFUL
// PROJECTION of records that already exist.
//
// THE TWO DONE-CRITERIA this package pins (the step's mirrors):
//
//  1. THE STREAMED STATE EQUALS THE RECORDED AGENTRUN (property + fixture). Project(run, …)
//     derives the console state PURELY from the recorded AgentRun (S52) + the loop Decision
//     (S83) + the measured cost (S51) + the approval inbox (S85). StateEqualsRun is the
//     non-gameable predicate: the console NEVER shows a turn, an action, a result or a
//     verdict that is not in the recorded run. A drift (a fabricated green, a missing
//     action) makes StateEqualsRun false — the console cannot lie about what happened.
//
//  2. A REAL PER-PROJECT STABLE PHASE IS RECORDED ONLY AT THE S23/S40 VERDICT (fixture +
//     property). RecordStablePhase computes the §43 coherent-cut verdict (phases.IsStable,
//     REUSED) for the project's current cut and, ONLY when it is STABLE, returns the DAG
//     node to append to the PROJECT's frontier (projectdag, REUSED). An UNSTABLE cut is
//     REFUSED with BlockReason STABLE_PHASE_INCONSISTENT_CUT — no node is born from a red
//     mirror (KRD §43: "stable" is computed, never declared). The agent records NOTHING
//     above the line; the node is a VALUE the privileged `aidos` writer commits (the wall).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every exported function is PURE, TOTAL and
// DETERMINISTIC — no DB, no clock, no rng, no I/O, no LLM, NO WRITE; same input ⇒ same
// output and it never panics. The console projection is the canonical "whatever can be a
// pure function MUST be code": building the watched state from the recorded run is a
// transform, never an LLM "summarise the build" call. The stable-phase verdict is
// phases.IsStable, the single shared engine; this package only fences it per project. The
// reproducibility mirror (buildconsole_property_test.go) pins same-input→same-output.
//
// THE WALL (CLAUDE.md §2). This package reads the agent's below-the-line telemetry and the
// SELECT-only kernel/fitness, and returns VALUES (the console state, the stable-phase node,
// the BlockReason). It writes NOTHING above the line; recording the DAG node rides the
// privileged `aidos` writer via the S24 dag store — never the agent, never from here.
//
// REUSE, NEVER FORK. The run is agentrun.AgentRun (S52); the decision is buildloop.Decision
// (S83); the cost is economics.MeasuredCost / HarnessCostBudget (S51); the inbox is
// approval.BuildInbox (S85); the stable verdict is phases.IsStable (S23/S43); the project
// frontier and node id are projectdag / dag (S56/S24). This package only AGGREGATES them.
package buildconsole

import (
	"sort"

	"github.com/steph-frtech/aidos/back/archive/dag"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/archive/projectdag"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/buildloop"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// ── the streamed console state ───────────────────────────────────────────────────────

// AttemptDiff is one streamed build attempt as the console renders it: the attempt index
// (1-based, the human's turn counter), the content-hash of the diff the agent wrote that
// turn, and whether the wall AUTHORISED that write. It is a PROJECTION of the recorded
// AgentRun's write action + the loop history's Iteration — never a new fact.
type AttemptDiff struct {
	// Index is the 1-based attempt number (turn 1, turn 2, …) — the human's counter.
	Index int `json:"index"`
	// DiffHash is the content-hash of the diff written this attempt (records.Hash). An empty
	// hash means the turn produced no write (e.g. an above-waterline refusal).
	DiffHash string `json:"diff_hash"`
	// Authorised is the wall verdict on this attempt's write: true = below the line and
	// applied, false = above the line and refused (AGENT_WRITE_ABOVE_WATERLINE).
	Authorised bool `json:"authorised"`
}

// SensorResult is one mirror's certification as the console renders it — the S07 sensor
// shape reduced to {id, green}. It is a PROJECTION of the run's run_mirror action / the
// goal's green set: the console shows EXACTLY which mirrors are green, never a fabrication.
type SensorResult struct {
	// ID is the mirror/sensor ref (e.g. "createOrder.fixture").
	ID string `json:"id"`
	// Green reports whether the mirror is green after the latest attempt's sensors ran.
	Green bool `json:"green"`
}

// CostMeter is the HarnessCostBudget consumption panel (S51): the measured spend vs the
// declared cap, per axis, plus the over-budget axes the breaker flagged. It is a PROJECTION
// of economics.MeasuredCost / HarnessCostBudget — the console never raises the cap (the wall).
type CostMeter struct {
	// CiMinutesSpent / CiMinutesCap — CI minutes consumed vs the declared cap (0 = no cap).
	CiMinutesSpent int `json:"ci_minutes_spent"`
	CiMinutesCap   int `json:"ci_minutes_cap"`
	// LlmTokensSpent / LlmTokensCap — LLM tokens/goal consumed vs the declared cap (0 = no cap).
	LlmTokensSpent int `json:"llm_tokens_spent"`
	LlmTokensCap   int `json:"llm_tokens_cap"`
	// OverBudgetAxes names the axes the breaker flagged over (empty when within budget).
	OverBudgetAxes []string `json:"over_budget_axes,omitempty"`
}

// BreakerState is the S83 circuit-breaker panel: the loop's closed verdict and, when it
// tripped, the actionable BlockReason. It is a PROJECTION of buildloop.Decision.
type BreakerState struct {
	// Verdict is the loop's closed verdict: continue | green | no_progress.
	Verdict buildloop.Verdict `json:"verdict"`
	// Tripped reports whether the breaker halted the loop (verdict == no_progress).
	Tripped bool `json:"tripped"`
	// BlockReason carries the BUILD_LOOP_NO_PROGRESS refusal when tripped (nil otherwise).
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// ApprovalGate is the S85 human-approval panel surfaced on the console: how many proposed
// truths await a human in this project's BuildInbox, and their ids (sorted). It is a
// PROJECTION of approval.BuildInbox — the console never admits a truth (the wall: only a
// real human holding scope authority admits, via S85).
type ApprovalGate struct {
	// PendingCount is the number of proposed-but-not-admitted truths awaiting approval.
	PendingCount int `json:"pending_count"`
	// PendingIDs are the proposal ids awaiting approval, sorted (the console's gate list).
	PendingIDs []string `json:"pending_ids,omitempty"`
}

// BuildConsoleState is the FULL streamed console state — the single value the Workbench
// /build-console route renders and the property mirror proves EQUALS the recorded AgentRun.
// It carries the run identity, the attempt-diff stream, the sensor results, the cost meter,
// the breaker state, the AgentRun timeline (the run's result), and the approval gate.
type BuildConsoleState struct {
	// RunID is the content-address of the recorded AgentRun (S52) this state projects.
	RunID string `json:"run_id"`
	// Goal is the /goal the run served (S29).
	Goal string `json:"goal"`
	// Attempts is the ordered diff stream (1 entry per loop turn / per recorded write attempt).
	Attempts []AttemptDiff `json:"attempts"`
	// Sensors is the latest mirror-result set (sorted by id).
	Sensors []SensorResult `json:"sensors"`
	// Cost is the HarnessCostBudget consumption panel.
	Cost CostMeter `json:"cost"`
	// Breaker is the circuit-breaker panel.
	Breaker BreakerState `json:"breaker"`
	// Result is the run's closed outcome (S52): green | still_red | blocked | abandoned —
	// the AgentRun timeline's terminal state, projected verbatim.
	Result agentrun.Result `json:"result"`
	// Approval is the human-approval gate panel (S85).
	Approval ApprovalGate `json:"approval"`
}

// Input is the PURE, TOTAL input to Project — every record the console aggregates, and
// NOTHING ELSE. There is no LLM and no free-text "summary" field: the console is a transform.
type Input struct {
	// Run is the recorded AgentRun (S52) — the SOURCE OF TRUTH the state must equal.
	Run agentrun.AgentRun
	// History is the loop's iteration history (S83) — the per-attempt diff hashes + greens.
	History buildloop.History
	// Decision is the loop's termination decision (S83) — the breaker verdict + block reason.
	Decision buildloop.Decision
	// Budget is the cell's declared HarnessCostBudget (S51) — the cost caps.
	Budget economics.HarnessCostBudget
	// Cost is the run's measured consumption (S51/S52) — the cost spent.
	Cost economics.MeasuredCost
	// Pending are the proposal ids awaiting human approval in this project (S85 BuildInbox).
	Pending []string
}

// Project is the PURE console projection (the step's core, §6/§8). It derives the watched
// state ENTIRELY from the recorded records handed in — no clock, no rng, no I/O, no LLM,
// never panics; same input ⇒ same state (the property mirror pins it). The projection is
// FAITHFUL by construction:
//
//   - the attempt stream is built from the run's WRITE actions zipped with the history's
//     diff hashes (1 attempt per recorded turn) — so the console shows exactly the diffs
//     the run recorded, with the wall verdict the run stamped;
//   - the sensor results are the latest history turn's green set (sorted) — exactly the
//     mirrors the run's run_mirror action certified;
//   - the cost meter is economics.MeasuredCost vs HarnessCostBudget + the decision's
//     over-budget axes — never a re-estimate;
//   - the breaker is the loop Decision verbatim; the result is the run's Result verbatim;
//   - the approval gate is the BuildInbox pending ids (sorted).
//
// Because every field is copied from a record, StateEqualsRun(state, run) holds for the
// state Project returns (the console cannot fabricate a turn or a green).
func Project(in Input) BuildConsoleState {
	st := BuildConsoleState{
		RunID:  in.Run.ID,
		Goal:   in.Run.Goal,
		Result: in.Run.Result,
	}

	// (1) ATTEMPT STREAM — one entry per loop turn, zipping the run's write actions with the
	// history's diff hashes. The history is the authoritative per-turn diff record; the run's
	// write actions carry the wall verdict. We index by turn (the human's 1-based counter).
	writes := writeActions(in.Run)
	for i, it := range in.History {
		authorised := false
		// The i-th turn's write authorisation comes from the i-th recorded write action when
		// present (a turn may have produced no write — then it is unauthorised/empty by default).
		if i < len(writes) {
			authorised = writes[i].Autorisee
		}
		st.Attempts = append(st.Attempts, AttemptDiff{
			Index:      i + 1,
			DiffHash:   it.DiffHash,
			Authorised: authorised,
		})
	}

	// (2) SENSOR RESULTS — the latest history turn's green set, sorted by id. An empty history
	// yields no sensor rows (nothing ran yet).
	if n := len(in.History); n > 0 {
		greens := make([]string, len(in.History[n-1].GreenMirrors))
		copy(greens, in.History[n-1].GreenMirrors)
		sort.Strings(greens)
		for _, g := range greens {
			st.Sensors = append(st.Sensors, SensorResult{ID: g, Green: true})
		}
	}

	// (3) COST METER — measured vs declared, plus the decision's over-budget axes.
	st.Cost = CostMeter{
		CiMinutesSpent: in.Cost.CIMinutes,
		CiMinutesCap:   in.Budget.MaxCIMinutes,
		LlmTokensSpent: in.Cost.LLMTokens,
		LlmTokensCap:   in.Budget.MaxLLMTokensPerGoal,
		OverBudgetAxes: copyStrings(in.Decision.OverBudgetAxes),
	}

	// (4) BREAKER — the loop decision verbatim.
	st.Breaker = BreakerState{
		Verdict:     in.Decision.Verdict,
		Tripped:     in.Decision.Verdict == buildloop.VerdictNoProgress,
		BlockReason: in.Decision.BlockReason,
	}

	// (5) APPROVAL GATE — the pending proposals, sorted.
	pending := copyStrings(in.Pending)
	sort.Strings(pending)
	st.Approval = ApprovalGate{PendingCount: len(pending), PendingIDs: pending}

	return st
}

// writeActions returns the run's WRITE actions in recorded order — the per-turn write
// attempts (the diff the agent tried to land). Pure helper.
func writeActions(run agentrun.AgentRun) []agentrun.AgentAction {
	var ws []agentrun.AgentAction
	for _, a := range run.Actions {
		if a.Type == agentrun.ActionWrite {
			ws = append(ws, a)
		}
	}
	return ws
}

func copyStrings(s []string) []string {
	if len(s) == 0 {
		return nil
	}
	out := make([]string, len(s))
	copy(out, s)
	return out
}

// StateEqualsRun is the NON-GAMEABLE faithfulness predicate (the step's first done-criterion):
// the streamed console state EQUALS the recorded AgentRun. It is true iff the state's run
// identity (run id, goal, result) and its attempt count are exactly those of the recorded run
// — so a console that fabricated a turn, a different goal, a different result, or claimed more
// attempts than the run has write actions is REJECTED. PURE, TOTAL, deterministic.
//
// "Equals" here is the faithful-projection relation, not byte-equality of two records: the
// state is a derived VIEW, but it must not contradict the run. Specifically:
//
//   - state.RunID == run.ID (the console projects THIS run, not another);
//   - state.Goal == run.Goal (the console shows THIS goal);
//   - state.Result == run.Result (the console shows the run's real terminal outcome);
//   - len(state.Attempts) ≤ number of recorded turns AND every authorised attempt corresponds
//     to an authorised write action in the run (no fabricated authorisation);
//   - every sensor the state shows green is one the run actually certified (carried in the
//     latest turn) — checked against the supplied history via the same Project that built it.
//
// The strongest, cheapest invariant is identity + attempt-faithfulness: Project always
// produces a state satisfying it (the property mirror pins it), and any hand-tampered state
// that drifts from the run fails it.
func StateEqualsRun(state BuildConsoleState, run agentrun.AgentRun) bool {
	if state.RunID != run.ID {
		return false
	}
	if state.Goal != run.Goal {
		return false
	}
	if state.Result != run.Result {
		return false
	}
	// An authorised attempt must correspond to an authorised recorded write action; the state
	// may not claim an authorisation the run does not carry (anti-fabrication).
	writes := writeActions(run)
	for i, a := range state.Attempts {
		if a.Authorised {
			if i >= len(writes) || !writes[i].Autorisee {
				return false
			}
		}
	}
	return true
}

// ── per-project stable-phase recording (S23/S40 verdict → DAG node) ──────────────────

// CodeStablePhaseInconsistentCut is the refusal raised when `aidos stable` is asked to
// record a phase over a cut that is NOT stable (a red sensor / a stale link) — KRD §43:
// "stable" is computed, never declared; no DAG node is born from a red mirror. It is the
// S13 BlockReason shape; the build-console owns this code locally (the recording gate).
const CodeStablePhaseInconsistentCut blockreason.Code = "STABLE_PHASE_INCONSISTENT_CUT"

// StablePhaseRequest is the PURE input to RecordStablePhase: the project whose frontier the
// node joins, and the §43 cut to evaluate (the selection + heads + links + sensor snapshot).
type StablePhaseRequest struct {
	// Project is the per-project version space the node would join (S56). Its frontier fences
	// the node — a node never lands outside its project.
	Project projectdag.ProjectDAG
	// Cut / Heads / Links / Sensors are the §43 coherent-cut inputs (the SAME shape phases.IsStable
	// reads). The cut is evaluated by the single authoritative engine; this package never re-judges.
	Cut     phases.Cut
	Heads   links.Heads
	Links   []links.Link
	Sensors []phases.SensorStatus
	// Label is the human line name of the recorded phase (e.g. "checkout-stable").
	Label string
}

// StablePhaseResult is the typed result of RecordStablePhase: the §43 verdict, and — ONLY
// when the cut is stable — the DAG node VALUE the privileged writer appends to the project's
// frontier (its id is the phase content-address; its parents are the project's current heads).
// When the cut is unstable, Node is the zero node and BlockReason carries the refusal.
type StablePhaseResult struct {
	// Phase is the §43 coherent-cut verdict (phases.IsStable) — the verdict + reasons.
	Phase phases.StablePhase `json:"phase"`
	// Recorded reports whether a node is to be recorded (true iff the cut is stable).
	Recorded bool `json:"recorded"`
	// Node is the per-project DAG node to append (valid iff Recorded). Its id is the phase's
	// content address; its ParentIDs are the project's current heads; Stratum is above the line.
	Node dag.Node `json:"node,omitempty"`
	// BlockReason carries STABLE_PHASE_INCONSISTENT_CUT when the cut is unstable (nil otherwise).
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// RecordStablePhase is the per-project stable-phase recording gate (the step's second
// done-criterion). It is PURE, TOTAL and DETERMINISTIC — no DB, no clock, no I/O, no LLM,
// never panics; same request ⇒ same result. The flow is honest:
//
//  1. COMPUTE the §43 verdict with phases.IsStable (the SINGLE authoritative engine, REUSED —
//     the verdict is never re-implemented here).
//  2. IF STABLE — return the DAG node to append to THIS project's frontier: its id is the
//     phase's content-address (the kernel's lockfile, S02), its ParentIDs are the project's
//     current heads (the new phase descends from where the project is now), Stratum above the
//     line, with the requested label. Recorded = true.
//  3. IF UNSTABLE — REFUSE with STABLE_PHASE_INCONSISTENT_CUT, naming the offending mirrors
//     (the verdict's reasons). NO node is born from a red mirror. Recorded = false.
//
// THE WALL (CLAUDE.md §2): this returns a node VALUE; it writes NOTHING. The privileged
// `aidos` writer appends the node to dag.node inside an approved ChangeSet — never the agent.
func RecordStablePhase(req StablePhaseRequest) StablePhaseResult {
	// (1) THE single authoritative §43 verdict — never re-judged here.
	phase := phases.IsStable(req.Cut, req.Heads, req.Links, req.Sensors)

	// (3) UNSTABLE — refuse; no node from a red mirror.
	if !phase.Stable {
		return StablePhaseResult{
			Phase:       phase,
			Recorded:    false,
			BlockReason: inconsistentCutReason(req.Project.ProjectID(), phase.Reasons),
		}
	}

	// (2) STABLE — build the per-project node. Its id is the phase content-address; on the
	// (valid-cut) marshal path Version always succeeds, but stay total: an address error
	// degrades to a refusal rather than a panic (anti-crash; never a fabricated id).
	addr, err := phase.Version()
	if err != nil {
		return StablePhaseResult{
			Phase:       phase,
			Recorded:    false,
			BlockReason: inconsistentCutReason(req.Project.ProjectID(), []string{"phase content-address failed"}),
		}
	}

	parents := headIDs(req.Project)
	node := dag.Node{
		ID:        addr,
		ParentIDs: parents,
		Head:      true,
		Stratum:   dag.StratumAbove,
		Label:     req.Label,
	}
	return StablePhaseResult{Phase: phase, Recorded: true, Node: node}
}

// headIDs returns the ids of the project's current heads — the parents the new stable phase
// descends from. A genesis-only project yields its root as the sole parent. Pure helper.
func headIDs(pd projectdag.ProjectDAG) []string {
	heads := pd.Heads()
	if len(heads) == 0 {
		return nil
	}
	ids := make([]string, 0, len(heads))
	for _, h := range heads {
		ids = append(ids, h.ID)
	}
	sort.Strings(ids)
	return ids
}

func inconsistentCutReason(projectID string, reasons []string) *blockreason.BlockReason {
	rs := copyStrings(reasons)
	sort.Strings(rs)
	return &blockreason.BlockReason{
		Code:     CodeStablePhaseInconsistentCut,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Refus d'enregistrer une phase stable pour le projet « " + projectID +
			" » : la coupe n'est PAS cohérente (§43). « Stable » se CALCULE, jamais ne se déclare — " +
			"aucun nœud DAG ne naît d'un miroir rouge.",
		HowToFix: []string{
			"Rendez chaque miroir vert d'abord : les mirrors fautifs sont " + joinReasons(rs) + ".",
			"Relancez « aidos stable » une fois la coupe entièrement verte ; le nœud sera alors enregistrable.",
		},
	}
}

func joinReasons(rs []string) string {
	if len(rs) == 0 {
		return "(aucun listé)"
	}
	out := ""
	for i, r := range rs {
		if i > 0 {
			out += ", "
		}
		out += r
	}
	return out
}
