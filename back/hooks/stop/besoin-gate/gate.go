package main

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/steph-frtech/aidos/back/runtime/besoin"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

const (
	exitAllow = 0
	exitBlock = 2

	// codeBesoinGateBlocked is the EL11 umbrella refusal code the gate emits alongside the
	// disjunct-specific reasons — the single declared marker for "the besoin-gate refused this
	// descent". A besoin-local code (string), kept OUT of the kernel blockreason registry (it is a
	// need-stage refusal, not a truth-side one). Declared, never invented at runtime (§8).
	codeBesoinGateBlocked blockreason.Code = "BESOIN_GATE_BLOCKED"
	// codeBesoinGateUndecodable is the fail-closed marker for a malformed `besoin` event body.
	codeBesoinGateUndecodable blockreason.Code = "BESOIN_GATE_EVENT_UNDECODABLE"
)

// VerdictKind is the closed decision of the besoin-gate. NoOp = the session has no open
// BesoinGraph (the hook does not fire — §5 anti-over-firing); Allow = the current rung is
// right-sized AND monster-free (the OR passes on neither disjunct); Block = at least one
// disjunct failed.
type VerdictKind string

const (
	// VerdictNoOp — no `besoin` block in the event: not a compound-du-besoin session. Allow Stop.
	VerdictNoOp VerdictKind = "no_op"
	// VerdictAllow — a BesoinGraph session whose current rung is enough AND monster-free.
	VerdictAllow VerdictKind = "allow"
	// VerdictBlock — ¬enough OR a monster at the current level (the OR, EL11).
	VerdictBlock VerdictKind = "block"
)

// BesoinSession is the OPEN-BesoinGraph payload an event may carry. Its PRESENCE is what
// scopes the hook (a nil session → no-op). It names the project, the CURRENT level being
// gated, the graph cut, the current node's four metadata (EL04), the per-level metadata for
// the completeness sweep (EL09), and the declared need-side level-mirror set (EL09). All are
// read above the line — the hook writes nothing.
type BesoinSession struct {
	// Project scopes the graph (EL19 multi-project; a plain key until S53 back-fills ProjectScope).
	Project string `json:"project"`
	// Level is the CURRENT rung the session is trying to descend FROM / promote. Gate target.
	Level besoin.Level `json:"level"`
	// Graph is the open BesoinGraph cut (above the line — a need, not a truth).
	Graph besoin.BesoinGraph `json:"graph"`
	// Metadata are the CURRENT node's four per-truth metadata (EL04), fed to CanDescend (EL07).
	Metadata besoin.Metadata `json:"metadata"`
	// MetadataByLevel are the per-resolved-node metadata for the completeness sweep (EL09). When
	// absent for a level, the current Level's Metadata is used as the fallback for that level.
	MetadataByLevel map[besoin.Level]besoin.Metadata `json:"metadata_by_level,omitempty"`
	// Mirrors is the declared need-side level-mirror set (EL09) — the links BesoinCompleteness
	// matches against. Above the line; no real mirror is written.
	Mirrors []besoin.BesoinLevelMirror `json:"mirrors,omitempty"`
}

// StopEvent is the decoded Stop lifecycle event for the besoin-gate. The `besoin` field is
// OPTIONAL: when nil the hook is a NO-OP (not a compound-du-besoin session). Ref is the audit
// ref only. A malformed body fails closed at the caller (KRD §82).
type StopEvent struct {
	// Ref is an optional audit ref (the open node / turn ref).
	Ref string `json:"ref"`
	// Besoin is the open-BesoinGraph session. Nil ⇒ the hook no-ops.
	Besoin *BesoinSession `json:"besoin,omitempty"`
}

// Decision is the PURE output of the gate: the verdict kind plus the actionable BlockReasons
// when blocked (empty otherwise). On Block the reasons carry the union of the ¬enough refusals
// (EL07) and the monster refusals (EL09) AT the current level, with the EL11 how_to_fix tokens.
type Decision struct {
	// Verdict is no_op | allow | block.
	Verdict VerdictKind `json:"verdict"`
	// NotEnough is true iff the ¬CanDescend.Enough disjunct fired.
	NotEnough bool `json:"not_enough"`
	// HasMonster is true iff the BesoinCompleteness disjunct fired at the current level.
	HasMonster bool `json:"has_monster"`
	// BlockReasons are the actionable refusals (KRD §44.5 shape). Empty unless Block.
	BlockReasons []blockreason.BlockReason `json:"block_reasons,omitempty"`
}

// elevenHowToFix is the EL11 canonical resolution path the gate surfaces on a block, verbatim
// from the ROADMAP (declare_missing_metadata, resolve_ref, state_invariant_as_forall,
// assign_authority, narrow_option_space). Declared, never invented at runtime (§8).
var elevenHowToFix = []string{
	"declare_missing_metadata",
	"resolve_ref",
	"state_invariant_as_forall",
	"assign_authority",
	"narrow_option_space",
}

// DecodeEvent reads one JSON Stop event. An empty body is a valid (ref-less, besoin-less) Stop
// → no-op at Decide. A malformed body is an error → fail closed at the caller.
func DecodeEvent(r io.Reader) (StopEvent, error) {
	b, err := io.ReadAll(r)
	if err != nil {
		return StopEvent{}, err
	}
	var ev StopEvent
	if len(b) == 0 {
		return ev, nil
	}
	if err := json.Unmarshal(b, &ev); err != nil {
		return StopEvent{}, err
	}
	return ev, nil
}

// Decide is the PURE gate decision (the heart of EL11). It is a total function of the event:
//   - no `besoin` session            → NoOp (allow; §5 — the hook does not over-fire).
//   - ¬CanDescend(...).Enough         → Block (EL07 disjunct), reasons include the gate refusals.
//   - a monster AT the current level  → Block (EL09 disjunct), reasons include the monster.
//   - both clean                      → Allow.
//
// The two disjuncts are INDEPENDENT (the OR, not the AND): each sets its flag and contributes
// its reasons; a Block fires if EITHER is set. DETERMINISTIC — no clock/rng/IO/LLM.
func Decide(ev StopEvent) Decision {
	s := ev.Besoin
	if s == nil {
		return Decision{Verdict: VerdictNoOp} // not a compound-du-besoin session — no-op.
	}

	var d Decision

	// Disjunct 1 — EL07: is the current rung right-sized? ¬enough blocks (even with no monster).
	verdict := besoin.CanDescend(s.Graph, s.Level, s.Metadata)
	if !verdict.Enough {
		d.NotEnough = true
		d.BlockReasons = append(d.BlockReasons, verdict.BlockReasons...)
	}

	// Disjunct 2 — EL09: does the need-graph carry a monster AT the current level? A monster
	// blocks even when the rung is otherwise enough (the OR).
	report := besoin.BesoinCompleteness(s.Graph, s.Mirrors, s.metadataByLevel())
	for _, m := range report.Monsters {
		if m.Level != s.Level {
			continue // EL11 gates the CURRENT level; monsters elsewhere are not this descent's bar.
		}
		d.HasMonster = true
		d.BlockReasons = append(d.BlockReasons, blockreason.BlockReason{
			Code:        blockreason.Code(m.Code),
			Severity:    blockreason.SeverityBlocking,
			Explanation: m.Explanation,
			HowToFix:    m.HowToFix,
		})
	}

	if d.NotEnough || d.HasMonster {
		d.Verdict = VerdictBlock
		// Append the EL11 canonical resolution path as the single, declared umbrella fix list so a
		// caller always sees the full door set, regardless of which disjunct fired.
		d.BlockReasons = append(d.BlockReasons, blockreason.BlockReason{
			Code:        codeBesoinGateBlocked,
			Severity:    blockreason.SeverityBlocking,
			Explanation: gateExplanation(d),
			HowToFix:    elevenHowToFix,
		})
		return d
	}

	d.Verdict = VerdictAllow
	return d
}

// metadataByLevel returns the per-level metadata map for the EL09 sweep, falling back to the
// current node's metadata for the current level when no explicit map entry is supplied.
func (s *BesoinSession) metadataByLevel() map[besoin.Level]besoin.Metadata {
	out := make(map[besoin.Level]besoin.Metadata, len(s.MetadataByLevel)+1)
	for k, v := range s.MetadataByLevel {
		out[k] = v
	}
	if _, ok := out[s.Level]; !ok {
		out[s.Level] = s.Metadata
	}
	return out
}

// gateExplanation renders the human umbrella explanation naming WHICH disjunct(s) fired (the
// OR made legible). Pure.
func gateExplanation(d Decision) string {
	switch {
	case d.NotEnough && d.HasMonster:
		return "Stop:besoin-gate — descente refusée : le niveau courant n'est PAS right-sized (EL07) ET porte un monstre de complétude-du-besoin (EL09). Les deux disjoncts du OU ont tiré."
	case d.NotEnough:
		return "Stop:besoin-gate — descente refusée : le niveau courant n'est PAS right-sized (¬CanDescend.enough, EL07). Le OU bloque sur ce seul disjonct, même sans monstre."
	default:
		return "Stop:besoin-gate — descente refusée : le niveau courant porte un monstre de complétude-du-besoin (EL09). Le OU bloque sur ce seul disjonct, même si le rung est par ailleurs enough."
	}
}

// ExitCode maps a Decision to the process exit code (0 = allow Stop, 2 = block Stop).
func ExitCode(d Decision) int {
	if d.Verdict == VerdictBlock {
		return exitBlock
	}
	return exitAllow
}

// blockBecauseUndecodable is the fail-closed refusal for a malformed `besoin` event body. An
// unverifiable gate never silently passes (KRD §82 .passthrough()).
func blockBecauseUndecodable(err error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:        codeBesoinGateUndecodable,
		Severity:    blockreason.SeverityBlocking,
		Explanation: fmt.Sprintf("Stop:besoin-gate — événement illisible (%v) : la porte échoue fermé (fail-closed). Un Stop besoin non vérifiable ne passe pas (KRD §82).", err),
		HowToFix: []string{
			"fix_event_shape : fournissez un événement JSON valide ({ \"besoin\": { \"project\", \"level\", \"graph\", \"metadata\" } } ou un corps vide pour un no-op).",
		},
	}
}
