// postcheck.go — BA16: the deterministic POST-CHECK of EVERY action + acceptance condition.
//
// BA13's GateAction decides BEFORE an action executes (may it run at all?). BA16 adds the
// dual for the OTHER side of execution: AFTER an action runs, may its CLAIMED effect be
// ACCEPTED? The judge is deterministic and per the action's NATURE — never the agent's
// claimed confidence (CLAUDE.md §8: done is computed, here pushed down to the grain of the
// single action):
//
//   - a CODE-CHANGING action (write / run_mirror) → the relevant mirror/sensor. The turn
//     CLAIMS a sensor flip (Effects); the post-check ACCEPTS that flip ONLY when the
//     deterministic sensor reading (Observed) AGREES it is green. A write that claims a
//     mirror went green while the sensor still reads red is the agent lying to itself —
//     the claim is REJECTED and the effect never lands (the mirror is the judge, §8).
//   - a PROPOSE action → a SHAPE-check. A propose lands NO sensor flip (a proposal is a
//     hypothesis — the cause_sketch — never a truth, the wall §2); its body is shape-checked
//     (a non-empty target) and the proposal is recorded, never applied to the sensor world.
//   - a READ action → a NO-OP-allowed assertion. A read has NO side effect; if a read turn
//     declares a sensor Effect it is a read-with-side-effects and is REJECTED.
//
// THE INVARIANT (the §8 "done is computed" descended to the action grain): an action whose
// NATURE carries NO deterministic post-check is ITSELF a determinism gap that blocks — the
// post-check is TOTAL over the four known natures (read | write | propose | run_mirror) and
// an unknown nature is REFUSED with AGENT_POSTCHECK_FAILED. EVERY action is re-checked, not
// only the code-changing ones (the roadmap, verbatim).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). PostCheck is a PURE, TOTAL function of the turn + the
// gate decision + the live sensor world: no clock, no rng, no I/O, no LLM. Same input ⇒ same
// verdict. The reproducibility mirror (postcheck_property_test.go) pins it.
package agentloop

import (
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// PostCheckKind is the CLOSED enumeration of post-check natures — one per action nature.
// It is the codomain of postCheckKindOf; an action whose nature maps to none of these is a
// determinism gap (PostCheckKindNone).
type PostCheckKind string

const (
	// PostCheckMirror — a code-changing action (write / run_mirror): the relevant
	// mirror/sensor must AGREE the claimed flip happened (goal.SensorState).
	PostCheckMirror PostCheckKind = "mirror"
	// PostCheckShape — a propose action: a schema/shape-check of the proposal (a hypothesis,
	// never applied to the sensor world).
	PostCheckShape PostCheckKind = "shape"
	// PostCheckNoOp — a read action: a no-op-allowed assertion (no side effect).
	PostCheckNoOp PostCheckKind = "noop"
	// PostCheckKindNone — the action's nature carries NO deterministic post-check. This is
	// itself a determinism gap that blocks (the §8 invariant at the action grain).
	PostCheckKindNone PostCheckKind = ""
)

// postCheckKindOf maps an action's NATURE (its agentrun.ActionType) to its post-check kind.
// Pure, total: an unknown nature returns PostCheckKindNone (a determinism gap).
func postCheckKindOf(t agentrun.ActionType) PostCheckKind {
	switch t {
	case agentrun.ActionWrite, agentrun.ActionRunMirror:
		return PostCheckMirror
	case agentrun.ActionPropose:
		return PostCheckShape
	case agentrun.ActionRead:
		return PostCheckNoOp
	default:
		return PostCheckKindNone
	}
}

// PostCheckKinds returns the three real post-check kinds in canonical order — exported so
// the panel + the reproducibility mirror name the kinds from ONE source. PostCheckKindNone
// is the residual gap, not a real kind, so it is omitted.
func PostCheckKinds() []PostCheckKind {
	return []PostCheckKind{PostCheckMirror, PostCheckShape, PostCheckNoOp}
}

// PostCheckResult is the deterministic post-check verdict for ONE executed action: the
// nature's Kind, whether the claimed effect is ACCEPTED, and — on a refusal — the S13
// BlockReason (AGENT_POSTCHECK_FAILED). On Accepted the BlockReason is nil.
type PostCheckResult struct {
	Kind        PostCheckKind            `json:"kind"`
	Accepted    bool                     `json:"accepted"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// postCheckRefused builds a refused PostCheckResult carrying the canonical
// AGENT_POSTCHECK_FAILED reason (single-sourced from the registry).
func postCheckRefused(kind PostCheckKind) PostCheckResult {
	br := blockreason.For(blockreason.CodeAgentPostCheckFailed)
	return PostCheckResult{Kind: kind, Accepted: false, BlockReason: &br}
}

// PostCheck is the PURE, TOTAL deterministic post-check (BA16). Given the turn that just ran,
// the gate decision that allowed it, and the LIVE sensor world (the deterministic judge), it
// decides whether the turn's claimed effect may be ACCEPTED — per the action's NATURE.
//
//   - dec.Allowed == false: the gate already refused; there is no effect to accept. The
//     post-check is vacuously not-accepted (the action was never executed). Drive does not
//     call PostCheck on a gate-refused action, but PostCheck stays total if it does.
//   - PostCheckMirror (write / run_mirror): ACCEPT iff EVERY claimed flip is CONFIRMED by the
//     observed sensor reading (a claimed green that the sensor reads red is rejected — the
//     mirror is the judge, §8). A code action that claims NO flip is trivially accepted.
//   - PostCheckShape (propose): a propose lands no sensor flip. ACCEPT iff the proposal is
//     well-formed (a non-empty Cible) AND it declares NO sensor Effects (a proposal that
//     tries to flip a sensor is overstepping — a hypothesis is not a truth).
//   - PostCheckNoOp (read): a read has no side effect. ACCEPT iff it declares NO sensor
//     Effects (a read that flips a sensor is a read-with-side-effects, refused).
//   - PostCheckKindNone (unknown nature): REFUSE — an action without a deterministic
//     post-check is itself a determinism gap (the §8 invariant at the action grain).
func PostCheck(turn ScriptedTurn, dec PostCheckDecision, observed map[string]goal.SensorState) PostCheckResult {
	kind := postCheckKindOf(turn.Body.Type)

	switch kind {
	case PostCheckMirror:
		// The mirror is the judge: every CLAIMED flip must be CONFIRMED by the sensor reading.
		for _, e := range turn.Effects {
			if observed[e.Mirror] != e.State {
				return postCheckRefused(kind)
			}
		}
		return PostCheckResult{Kind: kind, Accepted: true}

	case PostCheckShape:
		// A proposal must be well-formed and land NO sensor flip (a hypothesis, never a truth).
		if turn.Body.Cible == "" || len(turn.Effects) > 0 {
			return postCheckRefused(kind)
		}
		return PostCheckResult{Kind: kind, Accepted: true}

	case PostCheckNoOp:
		// A read must land NO side effect.
		if len(turn.Effects) > 0 {
			return postCheckRefused(kind)
		}
		return PostCheckResult{Kind: kind, Accepted: true}

	default:
		// PostCheckKindNone — an unknown nature: a determinism gap that blocks.
		return postCheckRefused(PostCheckKindNone)
	}
}

// PostCheckDecision is the minimal slice of the gate Decision the post-check reads: only
// whether the action was Allowed (the post-check runs AFTER execution, i.e. only on an
// allowed action). Kept as its own tiny type so postcheck.go does not import the gate's
// full Decision shape (decoupling — the post-check is the dual of the gate, not its caller).
type PostCheckDecision struct {
	Allowed bool
}
