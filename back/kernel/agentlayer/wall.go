package agentlayer

import (
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// aboveWaterlineSchemas are the truth schemas above the line — the SAME closed set
// the S04 wall (back/hooks/pretooluse/wall.go) classifies. The wall's Classify lives
// in package main (the hook binary) and is not importable; this mirrors its
// predicate verbatim (same schemas, same on-disk truth prefixes) so the verdict is
// identical. (OpenQuestion OQ-S52-wall: extract the S04 waterline predicate into an
// importable package so MayWrite imports it instead of re-deriving it.)
var aboveWaterlineSchemas = []string{"kernel", "mirrors", "fitness"}

// aboveWaterlinePathPrefixes are the on-disk source zones that ARE truth — mirrors
// the S04 wall's prefixes (back/kernel/** covers back/kernel/mirror/** by ADR 0002).
var aboveWaterlinePathPrefixes = []string{
	"back/kernel/",
	"back/migrations/",
}

// aboveWaterline reports whether a write target string names a truth zone above the
// waterline. It matches a bare schema name ("kernel"), a schema-qualified table
// ("kernel.truth"/"kernel.agent_layer"), and an on-disk source path
// ("back/kernel/..."). PURE and TOTAL — the same target always yields the same
// verdict (the property mirror pins it). This IS the S04 wall predicate.
func aboveWaterline(target string) bool {
	t := strings.ToLower(strings.TrimSpace(target))
	t = strings.TrimPrefix(t, "/")

	head := t
	if i := strings.IndexAny(head, "./ \t"); i >= 0 {
		head = head[:i]
	}
	for _, s := range aboveWaterlineSchemas {
		if head == s {
			return true
		}
	}
	for _, p := range aboveWaterlinePathPrefixes {
		if strings.HasPrefix(t, p) {
			return true
		}
	}
	return false
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
