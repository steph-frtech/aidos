// Package exploration is the AIDOS Runtime engine of the three §75 exploration
// gestures — /grill, /spike, /harvest — run OVER the S27 ideas lifecycle (KRD
// §75/§84/§118/§132; ADR 0023). It is the harness machinery that turns "how a
// vague idea becomes a falsifiable candidate" into a typed, traceable gesture
// machine instead of a prompt that jumps straight to the kernel.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6; ADR 0023): the status transitions stay owned
// by back/kernel/ideas (Grill/Spike/Harvest/Reject) — this package CALLS them and
// never re-implements a transition or the closed status set. It adds only the
// genuinely-Runtime concerns the bare lifecycle does not carry:
//
//   - the GRILL VERDICT routing (sharp → grilled ; fuzzy → grilled then spiking ;
//     bad → rejected, traced) — KRD §75/§118/§132 ;
//   - the SPIKE-WRITE CONFINEMENT predicate (every write under /spike or refused) —
//     KRD §84/§60.x ;
//   - the DRAFT-Truth PROPOSAL shape harvest emits (a kernel-delta candidate with no
//     frozen version and no mirror) — KRD §116/§118.
//
// THE WALL (CLAUDE.md §2): this package writes NOTHING. Grill/Spike/Harvest return
// VALUES; persistence of the Idea row and the proposal rides the idea-intake MCP
// (the aidos CLI role on the `ideas` schema), never the agent. Harvest never writes
// the kernel or a mirror — it PROPOSES; the human freezes later via /goal.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE and TOTAL — no
// clock, no rng, no I/O, never panics. The same input always yields the same output;
// the reproducibility mirror exploration_property_test.go pins that.
package exploration

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// GrillVerdict is the closed three-value outcome of /grill on a draft idea (KRD
// §75/§118). There is no fourth verdict — the set is declared, never discovered.
type GrillVerdict string

const (
	// VerdictSharp — the intention is falsifiable NOW: it can be stated as a red
	// mirror without further probing. Routes draft → grilled, skipping /spike
	// (KRD §132: "finalement je veux un code promo" → grill (clear) → harvest).
	VerdictSharp GrillVerdict = "sharp"
	// VerdictFuzzy — the intention is not-yet-falsifiable: it needs a throwaway
	// probe before it can be a red. Routes draft → grilled → spiking (the floue
	// branch, KRD §118).
	VerdictFuzzy GrillVerdict = "fuzzy"
	// VerdictBad — a bad idea: traced and kept, never silently dropped. Routes
	// draft → rejected (KRD §118 mermaid: grill -.-> rejected).
	VerdictBad GrillVerdict = "bad"
)

// Verdicts returns the closed set of grill verdicts in canonical order. The
// Workbench renders exactly these; none is invented.
func Verdicts() []GrillVerdict {
	return []GrillVerdict{VerdictSharp, VerdictFuzzy, VerdictBad}
}

// ErrUnknownVerdict is returned by Grill when the verdict is not a member of the
// closed three-value set. Grill invents no routing for an unknown verdict.
var ErrUnknownVerdict = fmt.Errorf("exploration: unknown grill verdict")

// Grill is the /grill gesture as a Runtime routing OVER the ideas lifecycle. It
// challenges a draft idea's intention ABOVE the wall and routes it on the verdict,
// DEFERRING every status transition to the pure ideas.* functions:
//
//   - sharp → ideas.Grill(idea)                 ⇒ grilled (skips spike)
//   - fuzzy → ideas.Grill then ideas.Spike      ⇒ spiking (the floue branch)
//   - bad   → ideas.Reject(idea, reason)        ⇒ rejected (traced with the reason)
//
// It never re-implements a transition; it never writes. The verdict is recorded by
// the caller (the idea-intake MCP) as part of the provenance. reason is the traced
// rejection reason; it is used only for the bad verdict (ignored otherwise).
func Grill(idea ideas.Idea, verdict GrillVerdict, reason string) (ideas.Idea, error) {
	switch verdict {
	case VerdictSharp:
		return ideas.Grill(idea)
	case VerdictFuzzy:
		grilled, err := ideas.Grill(idea)
		if err != nil {
			return ideas.Idea{}, err
		}
		return ideas.Spike(grilled)
	case VerdictBad:
		return ideas.Reject(idea, reason)
	default:
		return ideas.Idea{}, fmt.Errorf("%w: %q", ErrUnknownVerdict, verdict)
	}
}

// SpikePrefix is the only zone a spiking idea may write to (KRD §84). A spike is
// throwaway; it must not leak into /kernel or /src. Declared, never discovered.
const SpikePrefix = "/spike"

// SpikeWrite is a single write a spiking session attempts. Its confinement is the
// non-bypassable rule: the path is UNDER /spike or the write is refused.
type SpikeWrite struct {
	// Path is the target of the write (e.g. "/spike/retry-probe.go").
	Path string `json:"path"`
}

// Confined reports whether a spike write stays inside the /spike zone. True iff the
// path is exactly "/spike" or under the "/spike/" prefix. A pure total predicate.
func (w SpikeWrite) Confined() bool {
	return w.Path == SpikePrefix || strings.HasPrefix(w.Path, SpikePrefix+"/")
}

// CheckSpikeWrite is the confinement decision: nil if the write is confined to
// /spike, else the actionable SPIKE_WRITE_ESCAPES_ZONE BlockReason. PURE and TOTAL
// — the same path always yields the same verdict. This is the single authoritative
// predicate; the spike-confinement hook DEFERS to it (never re-implements it).
func CheckSpikeWrite(w SpikeWrite) *blockreason.BlockReason {
	if w.Confined() {
		return nil
	}
	br := blockreason.For(blockreason.CodeSpikeWriteEscapesZone)
	return &br
}

// DraftTruthProposal is what /harvest produces from a spiking (or grilled) idea: a
// kernel-delta CANDIDATE (KRD §116/§118). It names what the idea proposes and carries
// the discovered intention, but BY TYPE it has no frozen version and no mirror — the
// two absences that keep it a proposal, not a truth. HasFrozenVersion and HasMirror
// are CONSTANT false (mirrored on ideas.Idea making them unrepresentable): the
// methods below are the only way to read them, and they never return true. A later
// /goal promotes it by writing its mirror = the freeze; harvest stops here.
type DraftTruthProposal struct {
	// Kind is always "draft-truth" — the marker that this is a candidate, not a
	// frozen kernel truth.
	Kind string `json:"kind"`
	// IdeaID is the harvested idea's content-addressed id — the provenance back-link
	// the future frozen truth will carry (KRD §119; OQ-S28-link).
	IdeaID string `json:"idea_id"`
	// Proposes is the layer/kind the idea would become if promoted (KRD §118).
	Proposes ideas.Proposes `json:"proposes"`
	// Intent is the discovered intention extracted from the spike (the durable
	// lesson), verbatim.
	Intent string `json:"intent"`
	// Provenance is who/what engendered the idea (KRD §119), carried forward.
	Provenance ideas.Provenance `json:"provenance"`
}

// KindDraftTruth is the marker every harvest proposal carries.
const KindDraftTruth = "draft-truth"

// HasFrozenVersion is CONSTANT false: a DRAFT-Truth proposal never carries a frozen
// version (the freeze is the separate later /goal). The method exists so the absence
// is observable and the property mirror can assert it.
func (p DraftTruthProposal) HasFrozenVersion() bool { return false }

// HasMirror is CONSTANT false: a DRAFT-Truth proposal never carries a mirror (writing
// the mirror IS the freeze = /goal). The two absences are what keep it a proposal.
func (p DraftTruthProposal) HasMirror() bool { return false }

// Harvest is the /harvest gesture: it advances the idea to harvested (DEFERRING the
// transition to ideas.Harvest) and PROPOSES a DRAFT Truth carrying the discovered
// intention. It writes NOTHING — neither the kernel nor a mirror; it returns the
// harvested idea and the proposal as VALUES the idea-intake MCP persists in the
// `ideas` schema. discovered is the durable lesson extracted from the spike; empty
// falls back to the idea's own intent (never invents one).
//
// Legal from grilled (the clear branch) or spiking (the floue branch) — Harvest
// defers that check to ideas.Harvest, which refuses an illegal transition.
func Harvest(idea ideas.Idea, discovered string) (ideas.Idea, DraftTruthProposal, error) {
	harvested, err := ideas.Harvest(idea)
	if err != nil {
		return ideas.Idea{}, DraftTruthProposal{}, err
	}
	intent := strings.TrimSpace(discovered)
	if intent == "" {
		intent = harvested.Intent
	}
	proposal := DraftTruthProposal{
		Kind:       KindDraftTruth,
		IdeaID:     harvested.ID,
		Proposes:   harvested.Proposes,
		Intent:     intent,
		Provenance: harvested.Provenance,
	}
	return harvested, proposal, nil
}

// HarvestTarget is a schema /harvest might be asked to write. The closed set of truth
// schemas a harvest may NEVER write directly (the freeze is a separate /goal).
type HarvestTarget string

// CheckHarvestWrite is the wall for harvest: nil if the target is not a truth schema,
// else the actionable HARVEST_CANNOT_FREEZE BlockReason. Harvest PROPOSES a DRAFT
// Truth; it never freezes. PURE and TOTAL. The spike-confinement hook DEFERS to it.
func CheckHarvestWrite(schema string) *blockreason.BlockReason {
	switch schema {
	case "kernel", "mirrors", "fitness":
		br := blockreason.For(blockreason.CodeHarvestCannotFreeze)
		return &br
	default:
		return nil
	}
}
