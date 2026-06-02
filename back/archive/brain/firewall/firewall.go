// Package firewall implements the AIDOS MemoryFirewall (KRD §119.1, LIVRE XXIV) — the gate
// in the engine-side `/brain` store that forbids any MemoryItem from reaching the kernel
// except through the mandatory one-way flow:
//
//	Memory → ContextPack → Idea → Mirror → Goal → Kernel
//
// "La mémoire propose ; le noyau déclare le vrai." A MemoryItem is CONTEXT FUEL, never a
// truth: it carries content + provenance + validity_scope + expires_at + confidence + taint,
// and — by construction — NO version-freeze and NO mirror. That double absence is EXACTLY
// what makes it memory and not truth (back/archive/CONTEXT.md _/brain_). The MemoryItem type
// makes both unrepresentable: there is no Version and no Mirror field.
//
// The firewall is three pure functions over the mandatory flow:
//
//   - Propose(item, goal) → ContextPackEntry — a memory MAY be packed into context (read
//     side, allowed); the taint travels with the entry (never silently dropped).
//   - ToKernel(item) → *BlockReason — the GATE: it ALWAYS refuses the direct edge
//     Memory → Kernel, returning MEMORY_CANNOT_DECLARE_TRUTH — regardless of the memory's
//     confidence or taint (even a clean, fully-confident memory is still not truth).
//   - ViaIdea(item) → IdeaCandidate — the ONLY legal door: it hands the memory's content to
//     the S27 idea-intake as a `draft` idea (provenance carried forward as `memory:<id>`).
//     That idea STILL must acquire its mirror via /goal to ever reach the kernel. ViaIdea
//     performs NO kernel write.
//
// THE WALL (CLAUDE.md §2): this package writes NOTHING — Capture/Propose/ToKernel/ViaIdea
// return VALUES. Persistence of a brain.memory_item row rides the agent's INSERT/SELECT grant
// on brain.* (the /brain store is BELOW the waterline); the kernel write at the far end of
// the flow is the aidos CLI role via /goal, never this package.
//
// REUSE, DON'T REINVENT: the content address reuses S01/S02's records.Hash/Canonicalize
// (never forked); the BlockReason is S13's blockreason.BlockReason; the idea handoff targets
// S27's ideas.Idea (the lifecycle/promotion-gate are NOT re-implemented here).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is PURE and TOTAL — no DB, no clock, no
// rng, no I/O, never panics. Same input ⇒ same output; the reproducibility mirror
// firewall_property_test.go pins it.
package firewall

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Taint is a provenance-quality marker on a MemoryItem (KRD §119.1). The set is CLOSED — the
// five declared values, nothing invented at runtime. Taint never silently drops: it travels
// with a memory into every ContextPack entry.
type Taint string

const (
	// TaintUnverified — the claim has not been checked against any source.
	TaintUnverified Taint = "unverified"
	// TaintStale — the claim is past its validity (e.g. expired discount rule).
	TaintStale Taint = "stale"
	// TaintUserClaim — a human asserted it ("the support lead told me").
	TaintUserClaim Taint = "user_claim"
	// TaintIncidentDerived — extracted from an incident signal (reality diverged).
	TaintIncidentDerived Taint = "incident_derived"
	// TaintExternalSource — drawn from an external document/source.
	TaintExternalSource Taint = "external_source"
)

// Taints returns the closed taint enum in canonical order. The Workbench renders exactly
// these; none is invented.
func Taints() []Taint {
	return []Taint{
		TaintUnverified, TaintStale, TaintUserClaim, TaintIncidentDerived, TaintExternalSource,
	}
}

// IsKnownTaint reports whether t is a member of the closed enum.
func IsKnownTaint(t Taint) bool {
	for _, k := range Taints() {
		if k == t {
			return true
		}
	}
	return false
}

// MemoryItem is one entry of the `/brain` store (KRD §119.1) — context fuel, never truth. It
// carries content + provenance + validity_scope + expires_at + confidence + taint, is
// branch-aware, and has NO Version and NO Mirror field: those two absences are what make it
// memory and not a truth, and the type makes them UNREPRESENTABLE (there is simply no field).
// The ID is the content hash of the canonical body (S01/S02 content-addressing).
type MemoryItem struct {
	// ID is the SHA-256 hex content hash of the canonical body (content-addressed, S01/S02).
	ID string `json:"id"`
	// Content is the remembered claim, verbatim.
	Content string `json:"content"`
	// Provenance is who/what engendered the memory (free text — "user_claim:...", "#1234").
	Provenance string `json:"provenance"`
	// ValidityScope bounds where the memory holds (e.g. "EU").
	ValidityScope string `json:"validity_scope"`
	// ExpiresAt bounds when the memory holds (ISO date string; empty = no declared expiry).
	ExpiresAt string `json:"expires_at"`
	// Confidence is the recalled certainty (0..1). It NEVER buys a path to the kernel.
	Confidence float64 `json:"confidence"`
	// Taint is the closed-enum provenance-quality marker set. Travels with the memory.
	Taint []Taint `json:"taint"`
	// Branch is the DAG branch the memory was captured on — memory is branch-aware.
	Branch string `json:"branch"`
}

// CaptureInput is the pure input to Capture. It mirrors the MemoryItem fields minus the ID
// (which Capture computes as the content hash).
type CaptureInput struct {
	Content       string
	Provenance    string
	ValidityScope string
	ExpiresAt     string
	Confidence    float64
	Taint         []Taint
	Branch        string
}

// canonicalBody is the content-addressed JSONB shape of a memory. There is — by construction —
// NO "version" key and NO "mirror" key: a memory cannot carry the thing that would make it a
// truth. The ID is EXCLUDED from the address (it IS the address).
type canonicalBody struct {
	Kind          string  `json:"kind"` // always "memory_item" — namespaces the hash
	Content       string  `json:"content"`
	Provenance    string  `json:"provenance"`
	ValidityScope string  `json:"validity_scope"`
	ExpiresAt     string  `json:"expires_at"`
	Confidence    float64 `json:"confidence"`
	Taint         []Taint `json:"taint"`
	Branch        string  `json:"branch"`
}

// CanonicalBody returns the canonical JSON bytes whose hash is the memory id. It REUSES
// records.Canonicalize (key-sorted, deterministic) — never a forked hashing path. The body
// carries no version and no mirror key (the property mirror pins that).
func (m MemoryItem) CanonicalBody() ([]byte, error) {
	taint := m.Taint
	if taint == nil {
		taint = []Taint{}
	}
	raw, err := json.Marshal(canonicalBody{
		Kind:          "memory_item",
		Content:       m.Content,
		Provenance:    m.Provenance,
		ValidityScope: m.ValidityScope,
		ExpiresAt:     m.ExpiresAt,
		Confidence:    m.Confidence,
		Taint:         taint,
		Branch:        m.Branch,
	})
	if err != nil {
		return nil, fmt.Errorf("firewall: marshal canonical body: %w", err)
	}
	return records.Canonicalize(raw)
}

// Capture builds a content-addressed MemoryItem from a CaptureInput. The id is the content
// hash of the canonical body (S01/S02 reused). Pure: same input ⇒ same memory (same id). A
// captured memory has no version and no mirror — it is fuel, not truth.
func Capture(in CaptureInput) (MemoryItem, error) {
	m := MemoryItem{
		Content:       in.Content,
		Provenance:    in.Provenance,
		ValidityScope: in.ValidityScope,
		ExpiresAt:     in.ExpiresAt,
		Confidence:    in.Confidence,
		Taint:         append([]Taint(nil), in.Taint...),
		Branch:        in.Branch,
	}
	canon, err := m.CanonicalBody()
	if err != nil {
		return MemoryItem{}, err
	}
	m.ID = records.Hash(canon)
	return m, nil
}

// ContextPackEntry is a memory proposed into a goal's ContextPack (the read side, allowed). It
// references the memory by id and carries the taint FORWARD — taint never silently drops (the
// property mirror pins it). This is NOT the ContextRouter / progressive ContextPack
// compilation (§119.3, a later step): here a memory is merely *proposable* into an entry.
type ContextPackEntry struct {
	// MemoryID references the proposed memory (by content address).
	MemoryID string `json:"memory_id"`
	// Goal is the goal whose ContextPack the memory was proposed into.
	Goal string `json:"goal"`
	// Content is the memory's claim (the context fuel).
	Content string `json:"content"`
	// Taint travels with the entry — exactly the memory's taint, in order.
	Taint []Taint `json:"taint"`
}

// Propose packs a memory into a goal's ContextPack entry (the allowed read-side edge of the
// flow). The taint travels with the entry, in the memory's order — it is never silently
// dropped. Pure.
func Propose(m MemoryItem, goal string) ContextPackEntry {
	return ContextPackEntry{
		MemoryID: m.ID,
		Goal:     goal,
		Content:  m.Content,
		Taint:    append([]Taint(nil), m.Taint...),
	}
}

// ToKernel is the GATE (KRD §119.1): it ALWAYS refuses the direct edge Memory → Kernel,
// returning the actionable MEMORY_CANNOT_DECLARE_TRUTH BlockReason — REGARDLESS of the
// memory's confidence or taint. There is no "trusted-memory" bypass: a clean, fully-confident
// memory is STILL not truth. It returns a *BlockReason (never nil) and NEVER a kernel write —
// this package has no grant and writes nothing. Pure, total.
func ToKernel(m MemoryItem) *blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeMemoryCannotDeclareTruth)
	return &br
}

// IdeaCandidate is the result of routing a memory through the ONLY legal door (ViaIdea): a
// DRAFT idea destined for the S27 idea-intake, plus the explicit proof that NO kernel write
// occurred (WroteKernel is always false — promotion is the /goal flow, S27, not here).
type IdeaCandidate struct {
	// Idea is the DRAFT candidate-truth (S27) the memory's content sketches. It carries no
	// version and no mirror (the ideas.Idea type makes both unrepresentable); it must STILL
	// acquire its mirror via /goal to ever reach the kernel.
	Idea ideas.Idea `json:"idea"`
	// WroteKernel is ALWAYS false — ViaIdea performs no kernel write. The field exists so the
	// firewall's no-kernel-write guarantee is explicit and testable.
	WroteKernel bool `json:"wrote_kernel"`
}

// ViaIdea routes a memory through the ONLY legal door: it hands the memory's content to the
// S27 idea-intake as a `draft` idea whose provenance points back to the memory
// (`memory:<id>`). The idea is content-addressed by S27's scheme (ideas.Hashed). It carries
// no version and no mirror — it must STILL acquire its mirror via /goal to reach the kernel.
// ViaIdea performs NO kernel write (WroteKernel == false). Pure: no DB, no clock, no rng.
func ViaIdea(m MemoryItem) (IdeaCandidate, error) {
	draft := ideas.Idea{
		// A memory's claim is product-level intent until grilled/classified (S27 owns the
		// lifecycle); the firewall does not invent a kernel-source kind for it.
		Proposes: ideas.ProposesProduct,
		Intent:   m.Content,
		Provenance: ideas.Provenance{
			// The on-ramp is a human/incident utterance per S27; a memory-sourced idea is a
			// human-curated claim carried forward verbatim with its memory id.
			Source: ideas.ProvenanceHuman,
			Detail: "memory:" + m.ID,
		},
		Status: ideas.StatusDraft,
	}
	hashed, err := ideas.Hashed(draft)
	if err != nil {
		return IdeaCandidate{}, fmt.Errorf("firewall: via idea: %w", err)
	}
	return IdeaCandidate{Idea: hashed, WroteKernel: false}, nil
}

// ProvenanceKind classifies the provenance of an attempted kernel write — the INJECTED
// predicate the MemoryFirewall hook reads (it never reaches into the kernel/mirrors schemas;
// that would itself be a truth read). The set is CLOSED and small: a write either traces back
// to a raw MemoryItem (the forbidden shortcut) or to a properly-mirrored idea (the S27 legal
// path). Anything else is unknown and fails closed.
type ProvenanceKind string

const (
	// ProvenanceMemory — the kernel write's provenance is a raw MemoryItem (the direct
	// Memory → Kernel edge). The MemoryFirewall ALWAYS blocks it.
	ProvenanceMemory ProvenanceKind = "memory"
	// ProvenanceMirroredIdea — the write's provenance is an idea that has acquired its mirror
	// (the S27 legal path idea → mirror → /goal). The firewall lets it pass (the wall + the
	// S27 promotion-gate still apply downstream; this firewall owns only the memory shortcut).
	ProvenanceMirroredIdea ProvenanceKind = "mirrored_idea"
	// ProvenanceUnknown — provenance could not be established. Fails closed (blocked): the
	// firewall cannot let an unverifiable kernel write through (anti-passthrough, KRD §82).
	ProvenanceUnknown ProvenanceKind = ""
)

// CheckKernelWrite is the pure decider the MemoryFirewall hook DEFERS to (determinism-first:
// the algorithm wins, the hook is plumbing). Given the provenance kind of an attempted kernel
// write it returns the MEMORY_CANNOT_DECLARE_TRUTH BlockReason for the forbidden
// Memory → Kernel edge (and for an unknown provenance — fail closed), or nil for the legal
// mirrored-idea path. It is the SINGLE point enforcing "no memory → kernel shortcut". Pure,
// total: same provenance ⇒ same verdict; never panics.
func CheckKernelWrite(provenance ProvenanceKind) *blockreason.BlockReason {
	if provenance == ProvenanceMirroredIdea {
		return nil
	}
	br := blockreason.For(blockreason.CodeMemoryCannotDeclareTruth)
	return &br
}
