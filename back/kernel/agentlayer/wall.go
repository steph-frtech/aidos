package agentlayer

import (
	"github.com/steph-frtech/aidos/back/hooks/pretooluse/wall"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// aboveWaterline reports whether a write target string names a truth zone above the
// waterline. It is SINGLE-SOURCED through the extracted S04 wall classifier
// (wall.IsAboveWaterline — OQ-S52-wall, resolved at BA03): the hook, this agentlayer
// wall, and the agentimpl emitter all read the SAME predicate, no longer a verbatim
// hand-copy. It matches a bare schema name ("kernel"), a schema-qualified table
// ("kernel.truth"), and an on-disk source path ("back/kernel/..."). PURE and TOTAL.
func aboveWaterline(target string) bool {
	return wall.IsAboveWaterline(target)
}

// WriteDecision is MayWrite's verdict: allowed or denied, with the S13 BlockReason
// on a deny. There are exactly two outcomes (the property mirror pins this).
type WriteDecision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// MayWrite is the PURE wall verdict for an agent role attempting a write to a
// target. It REUSES the S04 waterline predicate (aboveWaterline): ANY target
// resolving above the waterline is DENIED with the inherited S13 BlockReason code
// AGENT_WRITE_ABOVE_WATERLINE — regardless of the agent's role ("bdd-writer",
// "executor", "orchestrator" are ALL refused above the line). A below-the-line
// target is allowed. The agent's declared rights cannot grant an above-the-line
// write (the wall is structural, §2/§8): MayWrite never reads PeutModifierNoyau as
// a grant (Validate already forces it false). Pure, total, deterministic.
func MayWrite(spec AgentSpec, target string) WriteDecision {
	if aboveWaterline(target) {
		br := blockreason.For(blockreason.CodeAgentWriteAboveWaterline)
		return WriteDecision{Allowed: false, BlockReason: &br}
	}
	return WriteDecision{Allowed: true}
}
